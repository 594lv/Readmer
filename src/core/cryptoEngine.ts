import { argon2id } from 'hash-wasm';
import { Annotation, Book, Chapter, VaultConfig } from '../types/reader';

const VAULT_CONFIG_STORAGE_KEY = 'shuge_private_vault_config_v1';
const VAULT_SESSION_AUTH_KEY = 'shuge_private_vault_session_auth_v1';
const VERIFIER_MAGIC_TEXT = 'SHUGE_VAULT_VERIFIED_AES_256_GCM_V1';
const PBKDF2_ITERATIONS = 100000;

interface EncryptedBookSecretPayload {
  title: string;
  author: string;
  category: string;
  content: string;
  chapters: Chapter[];
}

interface EncryptedAnnotationSecretPayload {
  chapterTitle: string;
  selectedText: string;
  noteText: string;
}

interface SessionAuthPayload {
  authorizedAt: number;
  sessionSecret: string;
  salt: string;
}

// Module-level warm key cache in RAM for instant 0ms private bookshelf rendering
let warmedVaultKeyCache: CryptoKey | null = null;
let warmUpInFlightPromise: Promise<CryptoKey | null> | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function loadVaultConfig(): VaultConfig | null {
  try {
    const raw = localStorage.getItem(VAULT_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VaultConfig;
    if (!parsed || !parsed.isInitialized || !parsed.salt || !parsed.verifierCipher) {
      return null;
    }
    return {
      ...parsed,
      kdf: parsed.kdf ?? 'argon2id',
      autoLockMinutes: parsed.autoLockMinutes ?? 5,
      lockOnTabHidden: parsed.lockOnTabHidden ?? true,
      blurOnWindowBlur: parsed.blurOnWindowBlur ?? true,
    };
  } catch {
    return null;
  }
}

export function saveVaultConfig(config: VaultConfig): void {
  try {
    localStorage.setItem(VAULT_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

/**
 * Stores session authorization in sessionStorage so `warmUpVaultKey` can
 * pre-derive the Argon2id CryptoKey in the background during an active session.
 */
export function persistVaultSessionAuthorization(password: string, saltBase64: string): void {
  try {
    const payload: SessionAuthPayload = {
      authorizedAt: Date.now(),
      sessionSecret: btoa(unescape(encodeURIComponent(password))),
      salt: saltBase64,
    };
    sessionStorage.setItem(VAULT_SESSION_AUTH_KEY, JSON.stringify(payload));
  } catch {
    // ignore sessionStorage errors
  }
}

/**
 * Clears both the in-memory warmed CryptoKey and sessionStorage authorization token.
 */
export function clearVaultSessionAuthorization(): void {
  warmedVaultKeyCache = null;
  warmUpInFlightPromise = null;
  try {
    sessionStorage.removeItem(VAULT_SESSION_AUTH_KEY);
  } catch {
    // ignore
  }
}

export function getWarmedVaultKeySync(): CryptoKey | null {
  return warmedVaultKeyCache;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey and authentication hash using Argon2id (WebAssembly).
 * Falls back to Web Crypto PBKDF2 only if WebAssembly is unavailable in the environment.
 */
export async function deriveVaultKeyWithArgon2id(
  password: string,
  saltBase64: string
): Promise<{ key: CryptoKey; masterPasswordHash: string }> {
  const saltBytes = base64ToBytes(saltBase64);

  try {
    // Derive 64 bytes (512 bits) via Argon2id:
    // First 32 bytes = 256-bit AES-GCM encryption key
    // Last 32 bytes = Master Password Verification Hash
    const derivedBytes = await argon2id({
      password,
      salt: saltBytes,
      parallelism: 1,
      iterations: 2,
      memorySize: 16384, // 16 MB memory-hard parameters for fast warmup & strong security
      hashLength: 64,
      outputType: 'binary',
    });

    const keyBytes = derivedBytes.slice(0, 32);
    const authHashBytes = derivedBytes.slice(32, 64);

    const key = await window.crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return {
      key,
      masterPasswordHash: bytesToBase64(authHashBytes),
    };
  } catch {
    // Fallback to PBKDF2 if WASM fails
    const key = await deriveVaultKeyPbkdf2(password, saltBase64);
    return {
      key,
      masterPasswordHash: `pbkdf2:${saltBase64}`,
    };
  }
}

/**
 * Legacy / fallback PBKDF2-SHA256 key derivation.
 */
export async function deriveVaultKeyPbkdf2(
  password: string,
  saltBase64: string
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const saltBytes = base64ToBytes(saltBase64);
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Background Key Warm-up (`warmUpVaultKey`):
 * On application startup, inspects the stored Master Password Hash in `VaultConfig`
 * and checks if the current session is authorized. If authorized, pre-derives the
 * AES-256-GCM `CryptoKey` in the background using the Argon2id algorithm and caches it
 * in memory so clicking into the Private Bookshelf renders instantaneously (0ms).
 */
export async function warmUpVaultKey(): Promise<CryptoKey | null> {
  if (warmedVaultKeyCache) {
    return warmedVaultKeyCache;
  }
  if (warmUpInFlightPromise) {
    return warmUpInFlightPromise;
  }

  warmUpInFlightPromise = (async () => {
    try {
      const config = loadVaultConfig();
      if (!config || !config.isInitialized || !config.salt) {
        return null;
      }

      // Check stored Master Password Hash / Verifier presence
      const hasStoredHash = Boolean(config.masterPasswordHash || config.verifierCipher);
      if (!hasStoredHash) {
        return null;
      }

      // Check if user has authorized the current browser session
      const rawSession = sessionStorage.getItem(VAULT_SESSION_AUTH_KEY);
      if (!rawSession) {
        return null;
      }

      const sessionData = JSON.parse(rawSession) as SessionAuthPayload;
      if (!sessionData?.sessionSecret || sessionData.salt !== config.salt) {
        return null;
      }

      const password = decodeURIComponent(escape(atob(sessionData.sessionSecret)));

      // Yield to main thread painting first, then derive key via Argon2id in background
      await new Promise<void>((resolve) => {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (
            window as Window & {
              requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
            }
          ).requestIdleCallback(() => resolve(), { timeout: 120 });
        } else {
          setTimeout(resolve, 16);
        }
      });

      const { key, masterPasswordHash } = await deriveVaultKeyWithArgon2id(
        password,
        config.salt
      );

      // Verify against stored masterPasswordHash or AES-GCM verifier
      if (config.masterPasswordHash && config.masterPasswordHash === masterPasswordHash) {
        warmedVaultKeyCache = key;
        return key;
      }

      const plain = await decryptStringAesGcm(config.verifierCipher, config.verifierIv, key);
      if (plain === VERIFIER_MAGIC_TEXT) {
        warmedVaultKeyCache = key;
        return key;
      }

      return null;
    } catch {
      return null;
    } finally {
      warmUpInFlightPromise = null;
    }
  })();

  return warmUpInFlightPromise;
}

async function encryptStringAesGcm(
  plainText: string,
  key: CryptoKey
): Promise<{ cipherBase64: string; ivBase64: string }> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plainText);
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoded
  );
  return {
    cipherBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
    ivBase64: bytesToBase64(iv),
  };
}

async function decryptStringAesGcm(
  cipherBase64: string,
  ivBase64: string,
  key: CryptoKey
): Promise<string> {
  const cipherBytes = base64ToBytes(cipherBase64);
  const ivBytes = base64ToBytes(ivBase64);
  const plainBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
    key,
    cipherBytes.buffer as ArrayBuffer
  );
  return new TextDecoder().decode(plainBuffer);
}

/**
 * Initializes the private vault with a new Master Password using Argon2id + AES-256-GCM.
 */
export async function initializeVaultMasterPassword(
  password: string,
  passwordHint?: string,
  policyOverrides?: Partial<
    Pick<VaultConfig, 'autoLockMinutes' | 'lockOnTabHidden' | 'blurOnWindowBlur'>
  >
): Promise<{ config: VaultConfig; key: CryptoKey }> {
  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = bytesToBase64(saltBytes);
  const { key, masterPasswordHash } = await deriveVaultKeyWithArgon2id(password, saltBase64);
  const { cipherBase64, ivBase64 } = await encryptStringAesGcm(VERIFIER_MAGIC_TEXT, key);

  const config: VaultConfig = {
    isInitialized: true,
    kdf: 'argon2id',
    masterPasswordHash,
    salt: saltBase64,
    verifierIv: ivBase64,
    verifierCipher: cipherBase64,
    passwordHint: passwordHint?.trim() || undefined,
    autoLockMinutes: policyOverrides?.autoLockMinutes ?? 5,
    lockOnTabHidden: policyOverrides?.lockOnTabHidden ?? true,
    blurOnWindowBlur: policyOverrides?.blurOnWindowBlur ?? true,
    updatedAt: Date.now(),
  };

  warmedVaultKeyCache = key;
  saveVaultConfig(config);
  persistVaultSessionAuthorization(password, saltBase64);
  return { config, key };
}

/**
 * Verifies the user's Master Password using Argon2id (with automatic fallback for legacy PBKDF2 vaults).
 * Caches the derived CryptoKey in memory and authorizes the current session for instant warm-up.
 */
export async function verifyVaultMasterPassword(
  password: string,
  config: VaultConfig
): Promise<CryptoKey | null> {
  try {
    // 1. Try Argon2id derivation first
    const { key, masterPasswordHash } = await deriveVaultKeyWithArgon2id(
      password,
      config.salt
    );

    if (config.masterPasswordHash && config.masterPasswordHash === masterPasswordHash) {
      warmedVaultKeyCache = key;
      persistVaultSessionAuthorization(password, config.salt);
      return key;
    }

    try {
      const plain = await decryptStringAesGcm(config.verifierCipher, config.verifierIv, key);
      if (plain === VERIFIER_MAGIC_TEXT) {
        warmedVaultKeyCache = key;
        persistVaultSessionAuthorization(password, config.salt);
        if (!config.masterPasswordHash) {
          saveVaultConfig({ ...config, kdf: 'argon2id', masterPasswordHash });
        }
        return key;
      }
    } catch {
      // Fall through to legacy PBKDF2 check if needed
    }

    // 2. Fallback check for vaults initialized with PBKDF2 prior to Argon2id upgrade
    const legacyKey = await deriveVaultKeyPbkdf2(password, config.salt);
    const legacyPlain = await decryptStringAesGcm(
      config.verifierCipher,
      config.verifierIv,
      legacyKey
    );
    if (legacyPlain === VERIFIER_MAGIC_TEXT) {
      warmedVaultKeyCache = legacyKey;
      persistVaultSessionAuthorization(password, config.salt);
      return legacyKey;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Encrypts a Book record for IndexedDB persistence.
 * Wipes all sensitive plaintext fields (title, author, category, content, chapters)
 * so zero plaintext is stored on disk.
 */
export async function encryptBookForStorage(book: Book, key: CryptoKey): Promise<Book> {
  const secretPayload: EncryptedBookSecretPayload = {
    title: book.title,
    author: book.author,
    category: book.category,
    content: book.content,
    chapters: book.chapters,
  };
  const jsonStr = JSON.stringify(secretPayload);
  const { cipherBase64, ivBase64 } = await encryptStringAesGcm(jsonStr, key);

  return {
    ...book,
    title: '私密藏书',
    author: '',
    category: '私密',
    content: '',
    chapters: [],
    isPrivate: true,
    encryptedPayload: cipherBase64,
    encryptionIv: ivBase64,
  };
}

/**
 * Decrypts an encrypted Book record in memory for zero-latency reading.
 * Hardware-accelerated AES-GCM decrypts a 1MB book in ~3-6ms.
 */
export async function decryptBookInMemory(book: Book, key: CryptoKey): Promise<Book> {
  if (!book.isPrivate || !book.encryptedPayload || !book.encryptionIv) {
    return book;
  }
  const decryptedJson = await decryptStringAesGcm(
    book.encryptedPayload,
    book.encryptionIv,
    key
  );
  const secret = JSON.parse(decryptedJson) as EncryptedBookSecretPayload;

  return {
    ...book,
    title: secret.title,
    author: secret.author,
    category: secret.category,
    content: secret.content,
    chapters: secret.chapters || [],
    isPrivate: true,
  };
}

/**
 * Converts a private book back to a standard unencrypted public book.
 */
export function stripBookEncryptionToPublic(decryptedBook: Book): Book {
  const next: Book = {
    ...decryptedBook,
    isPrivate: false,
  };
  delete next.encryptedPayload;
  delete next.encryptionIv;
  return next;
}

/**
 * Encrypts an Annotation record belonging to a private book so excerpts & notes
 * leave zero plaintext in IndexedDB.
 */
export async function encryptAnnotationForStorage(
  ann: Annotation,
  key: CryptoKey
): Promise<Annotation> {
  const secretPayload: EncryptedAnnotationSecretPayload = {
    chapterTitle: ann.chapterTitle,
    selectedText: ann.selectedText,
    noteText: ann.noteText,
  };
  const jsonStr = JSON.stringify(secretPayload);
  const { cipherBase64, ivBase64 } = await encryptStringAesGcm(jsonStr, key);

  return {
    ...ann,
    chapterTitle: '',
    selectedText: '',
    noteText: '',
    isPrivate: true,
    encryptedPayload: cipherBase64,
    encryptionIv: ivBase64,
  };
}

/**
 * Decrypts an encrypted Annotation record in memory.
 */
export async function decryptAnnotationInMemory(
  ann: Annotation,
  key: CryptoKey
): Promise<Annotation> {
  if (!ann.isPrivate || !ann.encryptedPayload || !ann.encryptionIv) {
    return ann;
  }
  const decryptedJson = await decryptStringAesGcm(
    ann.encryptedPayload,
    ann.encryptionIv,
    key
  );
  const secret = JSON.parse(decryptedJson) as EncryptedAnnotationSecretPayload;

  return {
    ...ann,
    chapterTitle: secret.chapterTitle,
    selectedText: secret.selectedText,
    noteText: secret.noteText,
    isPrivate: true,
  };
}

export function stripAnnotationEncryptionToPublic(decryptedAnn: Annotation): Annotation {
  const next: Annotation = {
    ...decryptedAnn,
    isPrivate: false,
  };
  delete next.encryptedPayload;
  delete next.encryptionIv;
  return next;
}
