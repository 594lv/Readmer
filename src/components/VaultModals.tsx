import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Shield, Unlock, X } from 'lucide-react';
import { VaultConfig } from '../types/reader';

export type VaultModalMode = 'setup' | 'unlock' | 'settings';

interface VaultPasswordModalProps {
  isOpen: boolean;
  mode: VaultModalMode;
  vaultConfig: VaultConfig | null;
  pendingActionLabel?: string;
  onClose: () => void;
  onSetupMasterPassword: (
    password: string,
    hint: string,
    policy: {
      autoLockMinutes: number;
      lockOnTabHidden: boolean;
      blurOnWindowBlur: boolean;
    }
  ) => Promise<void>;
  onUnlockVault: (password: string) => Promise<boolean>;
  onUpdateVaultSettings: (
    policy: {
      autoLockMinutes: number;
      lockOnTabHidden: boolean;
      blurOnWindowBlur: boolean;
    },
    passwordChange?: {
      currentPassword: string;
      newPassword: string;
      newHint: string;
    }
  ) => Promise<{ ok: boolean; message?: string }>;
}

const AUTO_LOCK_OPTIONS = [
  { value: 1, label: '1 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
];

export const VaultPasswordModal: React.FC<VaultPasswordModalProps> = ({
  isOpen,
  mode,
  vaultConfig,
  pendingActionLabel,
  onClose,
  onSetupMasterPassword,
  onUnlockVault,
  onUpdateVaultSettings,
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hint, setHint] = useState(vaultConfig?.passwordHint || '');
  const [showPassword, setShowPassword] = useState(false);

  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(
    vaultConfig?.autoLockMinutes ?? 5
  );
  const [lockOnTabHidden, setLockOnTabHidden] = useState<boolean>(
    vaultConfig?.lockOnTabHidden ?? true
  );
  const [blurOnWindowBlur, setBlurOnWindowBlur] = useState<boolean>(
    vaultConfig?.blurOnWindowBlur ?? true
  );

  // Settings mode password change fields
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setIsChangingPassword(false);
      setErrorMsg(null);
      setHint(vaultConfig?.passwordHint || '');
      setAutoLockMinutes(vaultConfig?.autoLockMinutes ?? 5);
      setLockOnTabHidden(vaultConfig?.lockOnTabHidden ?? true);
      setBlurOnWindowBlur(vaultConfig?.blurOnWindowBlur ?? true);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 40);
    }
  }, [isOpen, mode, vaultConfig]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === 'setup') {
      if (password.length < 4) {
        setErrorMsg('主密码长度至少需要 4 位字符');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('两次输入的主密码不一致');
        return;
      }
      setIsSubmitting(true);
      try {
        await onSetupMasterPassword(password, hint, {
          autoLockMinutes,
          lockOnTabHidden,
          blurOnWindowBlur,
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === 'unlock') {
      if (!password) {
        setErrorMsg('请输入私密主密码');
        return;
      }
      setIsSubmitting(true);
      try {
        const ok = await onUnlockVault(password);
        if (!ok) {
          setErrorMsg('主密码不正确，请重试');
          setPassword('');
          inputRef.current?.focus();
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === 'settings') {
      let pwdChangePayload:
        | { currentPassword: string; newPassword: string; newHint: string }
        | undefined;

      if (isChangingPassword) {
        if (!currentPassword) {
          setErrorMsg('请输入当前主密码以验证身份');
          return;
        }
        if (newPassword.length < 4) {
          setErrorMsg('新主密码长度至少需要 4 位字符');
          return;
        }
        if (newPassword !== confirmNewPassword) {
          setErrorMsg('两次输入的新主密码不一致');
          return;
        }
        pwdChangePayload = {
          currentPassword,
          newPassword,
          newHint: hint,
        };
      }

      setIsSubmitting(true);
      try {
        const res = await onUpdateVaultSettings(
          {
            autoLockMinutes,
            lockOnTabHidden,
            blurOnWindowBlur,
          },
          pwdChangePayload
        );
        if (!res.ok) {
          setErrorMsg(res.message || '保存失败，请检查原密码');
        } else {
          onClose();
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-page)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--accent-primary)',
              }}
            >
              {mode === 'unlock' ? (
                <Lock className="h-4 w-4" />
              ) : mode === 'setup' ? (
                <KeyRound className="h-4 w-4" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
            </div>
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight">
                {mode === 'setup'
                  ? '初始化私密空间'
                  : mode === 'unlock'
                    ? '解锁私密空间'
                    : '私密空间安全设置'}
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                {mode === 'setup'
                  ? '设置统一主密码，书籍将采用 AES-256-GCM 加密存储'
                  : mode === 'unlock'
                    ? pendingActionLabel || '输入主密码后当前会话免密秒开'
                    : '管理闲置重锁、防窥保护与主密码'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === 'unlock' && (
            <>
              <div>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入私密主密码…"
                    autoComplete="current-password"
                    className="h-10 w-full rounded-xl pr-10 pl-3.5 text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded"
                    style={{ color: 'var(--text-muted)' }}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {vaultConfig?.passwordHint && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    密码提示：{vaultConfig.passwordHint}
                  </p>
                )}
              </div>
            </>
          )}

          {mode === 'setup' && (
            <>
              <div className="space-y-2.5">
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="设置私密主密码（至少 4 位）"
                    autoComplete="new-password"
                    className="h-10 w-full rounded-xl pr-10 pl-3.5 text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded"
                    style={{ color: 'var(--text-muted)' }}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="再次确认主密码"
                  autoComplete="new-password"
                  className="h-10 w-full rounded-xl px-3.5 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />

                <input
                  type="text"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="密码提示语（选填，切勿直接填写密码）"
                  className="h-9 w-full rounded-xl px-3.5 text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </>
          )}

          {(mode === 'setup' || mode === 'settings') && (
            <div
              className="space-y-3 rounded-xl p-3.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  闲置自动锁定时间
                </span>
                <div className="flex items-center gap-1">
                  {AUTO_LOCK_OPTIONS.map((opt) => {
                    const active = autoLockMinutes === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAutoLockMinutes(opt.value)}
                        className="font-mono-tabular rounded-lg px-2 py-1 text-[11px] font-medium transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-page)',
                          color: active ? '#FFFFFF' : 'var(--text-secondary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-3 pt-1">
                <div>
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    切换标签页或最小化时立即锁定
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    离开当前页面即刻清除内存密钥，再次进入需验证密码
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={lockOnTabHidden}
                  onChange={(e) => setLockOnTabHidden(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent-primary)]"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-3 pt-1">
                <div>
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                    窗口失焦防窥护盾
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    点击其他软件窗口时自动模糊遮蔽正文，防止多任务视图窥屏
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={blurOnWindowBlur}
                  onChange={(e) => setBlurOnWindowBlur(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent-primary)]"
                />
              </label>
            </div>
          )}

          {mode === 'settings' && (
            <div
              className="rounded-xl p-3.5"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">修改统一主密码</span>
                <button
                  type="button"
                  onClick={() => setIsChangingPassword((v) => !v)}
                  className="text-xs font-medium underline underline-offset-4"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {isChangingPassword ? '取消修改' : '修改密码'}
                </button>
              </div>

              {isChangingPassword && (
                <div className="mt-3 space-y-2.5">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="输入当前主密码"
                    className="h-9 w-full rounded-lg px-3 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-page)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="输入新主密码（至少 4 位）"
                    className="h-9 w-full rounded-lg px-3 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-page)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="确认新主密码"
                    className="h-9 w-full rounded-lg px-3 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-page)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <input
                    type="text"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="更新密码提示语（选填）"
                    className="h-9 w-full rounded-lg px-3 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-page)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{errorMsg}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-xl px-4 text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-medium text-white transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {mode === 'unlock' ? (
                <>
                  <Unlock className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? '验证中…' : '立即解锁'}</span>
                </>
              ) : mode === 'setup' ? (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>{isSubmitting ? '正在创建密钥…' : '启用私密空间'}</span>
                </>
              ) : (
                <span>{isSubmitting ? '正在重新加密…' : '保存设置'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PrivacyShieldOverlayProps {
  isLocked: boolean;
  isWindowBlurred: boolean;
  passwordHint?: string;
  onUnlock: (password: string) => Promise<boolean>;
  onDismissBlur: () => void;
  onLockNow: () => void;
  onExitToPublicShelf: () => void;
}

/**
 * Full-screen anti-peeping & auto-lock shield.
 * Triggered when reading a private book or browsing the Private Space
 * and the window loses focus or auto-locks.
 */
export const PrivacyShieldOverlay: React.FC<PrivacyShieldOverlayProps> = ({
  isLocked,
  isWindowBlurred,
  passwordHint,
  onUnlock,
  onDismissBlur,
  onLockNow,
  onExitToPublicShelf,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isLocked) {
      setPassword('');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLocked]);

  if (!isLocked && !isWindowBlurred) return null;

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setVerifying(true);
    setError(null);
    try {
      const ok = await onUnlock(password);
      if (!ok) {
        setError('密码不正确，请重试');
        setPassword('');
        inputRef.current?.focus();
      } else {
        setPassword('');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-2xl select-none"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
      onClick={() => {
        if (!isLocked && isWindowBlurred) {
          onDismissBlur();
        }
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-page)',
          border: '1px solid var(--border-strong)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--accent-primary)',
          }}
        >
          <Lock className="h-5 w-5" />
        </div>

        <h3 className="font-display mt-3.5 text-base font-semibold tracking-tight">
          {isLocked ? '私密空间已安全锁定' : '窗口防窥保护已开启'}
        </h3>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {isLocked
            ? '会话内存密钥已清除，请输入主密码毫秒级恢复阅读'
            : '检测到窗口失焦，正文已隐藏以防窥屏'}
        </p>

        {isLocked ? (
          <form onSubmit={handleUnlockSubmit} className="mt-4 space-y-3 text-left">
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入私密主密码…"
              className="h-10 w-full rounded-xl px-3.5 text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            {passwordHint && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                提示：{passwordHint}
              </p>
            )}
            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onExitToPublicShelf}
                className="h-9 flex-1 rounded-xl text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                返回公开书架
              </button>
              <button
                type="submit"
                disabled={verifying}
                className="h-9 flex-1 rounded-xl text-xs font-medium text-white"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {verifying ? '解锁中…' : '立即解锁'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              onClick={onLockNow}
              className="h-9 flex-1 rounded-xl text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              立即锁定
            </button>
            <button
              type="button"
              onClick={onDismissBlur}
              className="h-9 flex-1 rounded-xl text-xs font-medium text-white"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              继续阅读
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
