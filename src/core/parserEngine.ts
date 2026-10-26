import MarkdownIt from 'markdown-it';
import mermaid from 'mermaid';
import {
  Annotation,
  Book,
  BookFormat,
  Chapter,
  FullLibraryBackup,
  ReaderTheme,
} from '../types/reader';

let mermaidRenderSeq = 0;
let mermaidRenderQueue: Promise<any> = Promise.resolve();
const mermaidSvgCache = new Map<
  string,
  { svg: string; naturalWidth: number; naturalHeight: number }
>();

/**
 * Configures Mermaid with `securityLevel: 'loose'` and `startOnLoad: false`,
 * dynamically adapting `wrappingWidth` to the target container width so node rectangle
 * labels wrap and size accurately in dynamic containers.
 */
export function configureMermaidEngine(theme: ReaderTheme = 'cafe', containerWidth = 560): void {
  const safeContainerW = Math.max(180, containerWidth || 560);
  const isMobile = safeContainerW < 540;
  // Calculate adaptive wrapping width based on dynamic container width
  const dynamicWrappingWidth = isMobile
    ? Math.max(120, Math.floor(safeContainerW * 0.72))
    : Math.min(240, Math.max(120, Math.floor(safeContainerW * 0.4)));

  const cjkFontStack =
    '"PingFang SC", "Microsoft YaHei", "Plus Jakarta Sans", "Noto Sans SC", sans-serif';

  const sharedFlowchart = {
    htmlLabels: true,
    wrappingWidth: dynamicWrappingWidth,
    padding: isMobile ? 8 : 14,
    nodeSpacing: isMobile ? 26 : 52,
    rankSpacing: isMobile ? 30 : 60,
    curve: 'basis' as const,
    useMaxWidth: true,
  };

  if (theme === 'night') {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      flowchart: sharedFlowchart,
      themeVariables: {
        background: '#1D1814',
        primaryColor: '#2E251F',
        primaryTextColor: '#E6DACB',
        primaryBorderColor: '#D9823B',
        lineColor: '#C4B4A2',
        secondaryColor: '#261F1A',
        tertiaryColor: '#16120F',
        fontFamily: cjkFontStack,
        fontSize: '13px',
      },
    });
  } else if (theme === 'eink') {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      flowchart: sharedFlowchart,
      themeVariables: {
        background: '#F5F5F0',
        primaryColor: '#EAEAE4',
        primaryTextColor: '#111111',
        primaryBorderColor: '#111111',
        lineColor: '#111111',
        secondaryColor: '#DFDFD8',
        tertiaryColor: '#F5F5F0',
        fontFamily: cjkFontStack,
        fontSize: '13px',
      },
    });
  } else if (theme === 'cream') {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      flowchart: sharedFlowchart,
      themeVariables: {
        background: '#FAF3E6',
        primaryColor: '#EBE0CC',
        primaryTextColor: '#3A2518',
        primaryBorderColor: '#C26A32',
        lineColor: '#856853',
        secondaryColor: '#F4E2CE',
        tertiaryColor: '#F7EFE0',
        fontFamily: cjkFontStack,
        fontSize: '13px',
      },
    });
  } else if (theme === 'sandalwood') {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      flowchart: sharedFlowchart,
      themeVariables: {
        background: '#F5EBDC',
        primaryColor: '#E3D4BD',
        primaryTextColor: '#2F2014',
        primaryBorderColor: '#A83E26',
        lineColor: '#78604A',
        secondaryColor: '#EADBC4',
        tertiaryColor: '#F0E4D0',
        fontFamily: cjkFontStack,
        fontSize: '13px',
      },
    });
  } else if (theme === 'candlelight') {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'dark',
      flowchart: sharedFlowchart,
      themeVariables: {
        background: '#2E221A',
        primaryColor: '#3D2E24',
        primaryTextColor: '#ECDCC8',
        primaryBorderColor: '#E08E45',
        lineColor: '#967E67',
        secondaryColor: '#35271E',
        tertiaryColor: '#241A14',
        fontFamily: cjkFontStack,
        fontSize: '13px',
      },
    });
  } else {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      flowchart: sharedFlowchart,
      themeVariables: {
        background: '#FBF7F0',
        primaryColor: '#EFE6D5',
        primaryTextColor: '#2C1E16',
        primaryBorderColor: '#B4532A',
        lineColor: '#7A6352',
        secondaryColor: '#F3DFD1',
        tertiaryColor: '#FAF5EC',
        fontFamily: cjkFontStack,
        fontSize: '13px',
      },
    });
  }
}

/**
 * Sanitizes Mermaid diagram code to prevent syntax errors caused by:
 * 1. Unquoted labels containing special characters: &, #, +, -, :, etc. (e.g. `BM[Burns & McDonnell - DC全球#1]`)
 * 2. Subgraph titles with CJK or special characters without safe IDs (e.g. `subgraph 国际巨头`)
 */
export function sanitizeMermaidCode(rawCode: string): string {
  let cleaned = rawCode
    .replace(/^```(?:mermaid|mmd|flowchart|graph)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  // 1. Auto-quote node labels with special characters (&, #, +, -, :, etc.) if not already quoted
  cleaned = cleaned.replace(
    /(\b[A-Za-z0-9_-]+)(\[|\(|\(\[|\[\(|\{\{)([^"\n\]\)\}>]+)(\]|\)|\)\]|\)\]|\}\})/g,
    (match, id, open, text, close) => {
      const trimmed = text.trim();
      if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
        const escaped = trimmed.replace(/"/g, '\\"');
        return `${id}${open}"${escaped}"${close}`;
      }
      return match;
    }
  );

  // 2. Safe subgraphs with CJK or special characters: subgraph 国际巨头 -> subgraph sg_1 ["国际巨头"]
  let sgCounter = 0;
  cleaned = cleaned.replace(
    /^(\s*subgraph\s+)(?!sg_\d+\s*\[)([^"\n\[\]]+)$/gm,
    (match, prefix, title) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) return match;
      const sgId = 'sg_' + (++sgCounter);
      return `${prefix}${sgId} ["${trimmedTitle.replace(/"/g, '\\"')}"]`;
    }
  );

  return cleaned;
}

/**
 * Rewrites Mermaid flowchart/graph direction to `TD` (Top-Down) on mobile/narrow viewports (<540px)
 * so horizontal diagrams (`LR` / `RL`) automatically stack vertically, remaining fully readable.
 */
export function normalizeMermaidDirectionToTD(code: string, forceTD: boolean): string {
  if (!forceTD) return code;
  let updated = code.replace(
    /^(\s*(?:flowchart|graph)\s+)(?:LR|RL|BT|TB)\b/im,
    '$1TD'
  );
  if (/^\s*(?:flowchart|graph)\s*$/im.test(updated)) {
    updated = updated.replace(/^(\s*(?:flowchart|graph))\s*$/im, '$1 TD');
  }
  updated = updated.replace(/^(\s*direction\s+)(?:LR|RL|BT)\b/gim, '$1TD');
  return updated;
}

/**
 * Renders a Mermaid diagram safely through a sequential execution queue and cache,
 * eliminating concurrency race conditions, missing diagrams, and parse failures.
 * Automatically adapts orientation to `TD` on mobile/narrow containers (<540px).
 */
export async function renderMermaidDiagram(
  rawCode: string,
  theme: ReaderTheme = 'cafe',
  containerWidth = 560,
  forceTopDown = false
): Promise<{
  svg: string;
  naturalWidth: number;
  naturalHeight: number;
}> {
  const safeContainerWidth = Math.max(180, containerWidth || 560);
  const shouldForceTD = forceTopDown || (safeContainerWidth > 0 && safeContainerWidth < 540);

  const sanitized = sanitizeMermaidCode(rawCode);
  const cleanCode = normalizeMermaidDirectionToTD(sanitized, shouldForceTD);
  const cacheKey = `v3:::${theme}:::${shouldForceTD ? 'TD' : 'AUTO'}:::${cleanCode}`;

  const cached = mermaidSvgCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Queue render execution sequentially so concurrent calls never corrupt Mermaid's internal state
  const resultPromise = mermaidRenderQueue.then(async () => {
    const existing = mermaidSvgCache.get(cacheKey);
    if (existing) return existing;

    configureMermaidEngine(theme, safeContainerWidth);
    const uniqueId = `mermaid-svg-node-${++mermaidRenderSeq}`;

    let measureHost: HTMLDivElement | null = null;
    if (typeof document !== 'undefined') {
      measureHost = document.createElement('div');
      measureHost.className = 'md-mermaid-svg-host';
      measureHost.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: ${safeContainerWidth}px;
        max-width: 100vw;
        visibility: hidden;
        pointer-events: none;
        font-family: "PingFang SC", "Microsoft YaHei", "Plus Jakarta Sans", sans-serif;
        font-size: 13px;
      `;
      document.body.appendChild(measureHost);
    }

    try {
      const renderResult = await mermaid.render(
        uniqueId,
        cleanCode,
        measureHost || undefined
      );
      const rawSvg = renderResult.svg;

      let naturalWidth = safeContainerWidth;
      let naturalHeight = 220;
      let finalSvg = rawSvg;

      if (measureHost) {
        measureHost.innerHTML = rawSvg;
        const svgEl = measureHost.querySelector('svg');
        if (svgEl) {
          const vbAttr = svgEl.getAttribute('viewBox');
          if (vbAttr) {
            const parts = vbAttr
              .trim()
              .split(/[\s,]+/)
              .map(Number);
            if (parts.length === 4 && !parts.some(isNaN) && parts[2] > 0 && parts[3] > 0) {
              naturalWidth = Math.round(parts[2]);
              naturalHeight = Math.round(parts[3]);
            }
          }

          svgEl.querySelectorAll('foreignObject').forEach((fo) => {
            fo.setAttribute('overflow', 'visible');
            const div = fo.querySelector('div') as HTMLElement | null;
            if (div) {
              div.style.cssText +=
                '; white-space: normal !important; word-break: break-word !important; overflow-wrap: anywhere !important; text-align: center !important;';
            }
          });

          // Ensure SVG scales responsively without rigid max-width clamping that causes clipping when zoomed
          svgEl.setAttribute('width', '100%');
          svgEl.removeAttribute('height');
          svgEl.setAttribute(
            'style',
            'width: 100%; height: auto; min-width: 100%; overflow: visible; display: block;'
          );
          svgEl.setAttribute('data-natural-width', String(naturalWidth));
          svgEl.setAttribute('data-natural-height', String(naturalHeight));

          // Wrap the SVG in an interactive viewport wrapper to guarantee gesture zoom, CSS zoom,
          // and horizontal scroll panning without forced clipping, especially in narrow reader windows
          finalSvg = `<div class="mermaid-interactive-viewport" style="width: 100%; max-width: 100%; overflow-x: auto; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y pinch-zoom; display: flex; justify-content: center; align-items: center; position: relative;">${svgEl.outerHTML}</div>`;
        }
      } else {
        finalSvg = `<div class="mermaid-interactive-viewport" style="width: 100%; max-width: 100%; overflow-x: auto; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y pinch-zoom; display: flex; justify-content: center; align-items: center; position: relative;">${rawSvg}</div>`;
      }

      const res = {
        svg: finalSvg,
        naturalWidth: Math.max(180, naturalWidth),
        naturalHeight: Math.max(60, naturalHeight),
      };
      mermaidSvgCache.set(cacheKey, res);
      return res;
    } finally {
      if (measureHost && measureHost.parentNode) {
        measureHost.parentNode.removeChild(measureHost);
      }
    }
  });

  mermaidRenderQueue = resultPromise.catch(() => {});
  return resultPromise;
}

export type ParsedMarkdownBlockType =
  | 'paragraph'
  | 'heading'
  | 'table'
  | 'mermaid'
  | 'code'
  | 'blockquote'
  | 'list'
  | 'hr';

export interface ParsedMarkdownBlock {
  type: ParsedMarkdownBlockType;
  text: string;
  html?: string;
  isHeading: boolean;
  level?: number;
  lang?: string;
  tableHeaders?: string[];
  tableAlign?: ('left' | 'center' | 'right' | null)[];
  tableRows?: string[][];
  ordered?: boolean;
  listItems?: { text: string; html: string; task?: boolean; checked?: boolean }[];
  startOffset: number;
  endOffset: number;
  isContinuation?: boolean;
}

/**
 * Custom markdown-it Table plugin (`markdown-it-table` enhancement)
 * Adds editorial cafe styling classes, responsive container wrappers, and tabular numerals
 * to all GFM tables rendered by markdown-it.
 */
export function markdownItTablePlugin(md: any): void {
  md.renderer.rules.table_open = () =>
    '<div class="reader-md-table-wrap my-3.5 overflow-x-auto rounded-xl"><table class="reader-md-table w-full border-collapse text-left text-xs sm:text-sm">';

  md.renderer.rules.table_close = () => '</table></div>';

  md.renderer.rules.thead_open = () => '<thead class="reader-md-thead">';

  md.renderer.rules.th_open = (tokens: any[], idx: number) => {
    const token = tokens[idx];
    const style = token.attrGet('style') || '';
    return `<th class="reader-md-th px-3.5 py-2.5 font-semibold" ${
      style ? `style="${style}"` : ''
    }>`;
  };

  md.renderer.rules.tbody_open = () => '<tbody class="reader-md-tbody">';

  md.renderer.rules.tr_open = () => '<tr class="reader-md-tr">';

  md.renderer.rules.td_open = (tokens: any[], idx: number) => {
    const token = tokens[idx];
    const style = token.attrGet('style') || '';
    return `<td class="reader-md-td tabular-nums px-3.5 py-2" ${
      style ? `style="${style}"` : ''
    }>`;
  };
}

/**
 * Custom markdown-it Mermaid plugin (`markdown-it-mermaid` enhancement)
 * Detects ```mermaid, ```flowchart, ```sequenceDiagram, ```graph, ```mindmap, ```gantt, ```pie
 * code fences and transforms them into structured Mermaid diagram containers.
 * Forces `securityLevel: 'loose'` and `startOnLoad: false` via `configureMermaidEngine`.
 */
export function markdownItMermaidPlugin(md: any): void {
  configureMermaidEngine('cafe', 560);

  const defaultFence =
    md.renderer.rules.fence ||
    function (tokens: any[], idx: number, options: any, _env: any, self: any) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
    const token = tokens[idx];
    const info = (token.info || '').trim().toLowerCase();
    const content = token.content.trim();

    if (isMermaidFence(info, content)) {
      const encoded = encodeURIComponent(content);
      return `<div class="md-mermaid-block my-3" data-mermaid="${encoded}"></div>`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };
}

export function isMermaidFence(langInfo: string, codeContent: string): boolean {
  const cleanLang = langInfo.split(/\s+/)[0].toLowerCase();
  if (
    cleanLang === 'mermaid' ||
    cleanLang === 'mmd' ||
    cleanLang === 'flowchart' ||
    cleanLang === 'sequencediagram' ||
    cleanLang === 'mindmap' ||
    cleanLang === 'gantt' ||
    cleanLang === 'classdiagram' ||
    cleanLang === 'statediagram' ||
    cleanLang === 'erdiagram' ||
    cleanLang === 'pie'
  ) {
    return true;
  }
  if (!cleanLang) {
    return /^(?:graph\s+(?:TD|TB|BT|RL|LR)|flowchart\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|timeline|journey)\b/i.test(
      codeContent.trim()
    );
  }
  return false;
}

/**
 * Shared singleton markdown-it instance configured with GFM tables, Mermaid plugin,
 * typographer, and linkify support.
 */
export const mdParser = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true,
})
  .enable('table')
  .enable('strikethrough')
  .use(markdownItTablePlugin)
  .use(markdownItMermaidPlugin);

/**
 * Renders inline Markdown syntax (**bold**, *italic*, `code`, ~~strike~~, [link](url)) via markdown-it.
 */
export function renderInlineMarkdown(text: string): string {
  if (!text) return '';
  try {
    return mdParser.renderInline(text);
  } catch {
    return escapeHtml(text);
  }
}

/**
 * Renders full Markdown document to HTML via markdown-it (including tables and Mermaid containers).
 */
export function renderFullMarkdownToHtml(markdown: string): string {
  if (!markdown) return '';
  try {
    return mdParser.render(markdown);
  } catch {
    return `<p>${escapeHtml(markdown)}</p>`;
  }
}

/**
 * Automatically detects unfenced Mermaid diagrams in raw text or imported TXT/Markdown documents
 * and wraps them in ```mermaid ... ``` code fences so markdown-it parses them as diagrams.
 */
export function autoWrapUnfencedMermaid(content: string): string {
  if (!content) return '';
  const lines = content.split('\n');
  const result: string[] = [];
  let inFence = false;
  let inMermaid = false;
  let mermaidBuffer: string[] = [];

  const mermaidStartRegex =
    /^\s*(?:flowchart\s+(?:TD|TB|BT|RL|LR)|graph\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|timeline|journey)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      if (inMermaid) {
        result.push('```mermaid\n' + mermaidBuffer.join('\n') + '\n```');
        mermaidBuffer = [];
        inMermaid = false;
      }
      result.push(line);
      continue;
    }

    if (inFence) {
      result.push(line);
      continue;
    }

    if (!inMermaid && mermaidStartRegex.test(trimmed)) {
      inMermaid = true;
      mermaidBuffer.push(line);
      continue;
    }

    if (inMermaid) {
      const isHeading = /^#{1,6}\s+/.test(trimmed);
      const isHr = /^---+$/.test(trimmed);
      const isNormalProse =
        trimmed.length > 0 &&
        !trimmed.startsWith('subgraph') &&
        !trimmed.startsWith('end') &&
        !trimmed.includes('-->') &&
        !trimmed.includes('---') &&
        /^[^\s\-><&|()\[\]{}:]+[，。！？；]/.test(trimmed);

      if (isHeading || isHr || isNormalProse) {
        result.push('```mermaid\n' + mermaidBuffer.join('\n') + '\n```');
        mermaidBuffer = [];
        inMermaid = false;
        result.push(line);
      } else {
        mermaidBuffer.push(line);
      }
      continue;
    }

    result.push(line);
  }

  if (inMermaid && mermaidBuffer.length > 0) {
    result.push('```mermaid\n' + mermaidBuffer.join('\n') + '\n```');
  }

  return result.join('\n');
}

/**
 * Parses a document (Markdown or TXT) into atomic blocks using markdown-it's token stream (`mdParser.parse`).
 * Guarantees that GFM tables, Mermaid diagrams, code blocks, blockquotes, and task lists are extracted
 * accurately with their full structure and rendered HTML.
 */
export function parseDocumentWithMarkdownIt(content: string): ParsedMarkdownBlock[] {
  const wrapped = autoWrapUnfencedMermaid(content);
  const normalized = normalizeLineEndings(wrapped);
  const lines = normalized.split('\n');

  // Precompute character offsets at the start of each line (0-indexed line numbers)
  const lineStartOffsets: number[] = new Array(lines.length + 1);
  let accOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStartOffsets[i] = accOffset;
    accOffset += lines[i].length + 1;
  }
  lineStartOffsets[lines.length] = normalized.length;

  const getOffsetsForMap = (map: [number, number] | null | undefined): { start: number; end: number } => {
    if (!map) return { start: 0, end: normalized.length };
    const startLine = Math.max(0, Math.min(lines.length, map[0]));
    const endLine = Math.max(startLine, Math.min(lines.length, map[1]));
    return {
      start: lineStartOffsets[startLine] ?? 0,
      end: lineStartOffsets[endLine] ?? normalized.length,
    };
  };

  const tokens = mdParser.parse(normalized, {});
  const blocks: ParsedMarkdownBlock[] = [];

  const headingRegex =
    /^\s*(?:第[零一二三四五六七八九十百千万0-9]+[章回节卷集部篇].*|(?:序章|楔子|引子|前言|尾声|后记)(?:\s+.*|$)|Chapter\s+\d+.*)$/i;

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // 1. Headings (#, ##, ###)
    if (token.type === 'heading_open') {
      const level = Number(token.tag.replace('h', '')) || 2;
      const inlineToken = tokens[i + 1];
      const text = inlineToken?.content?.trim() || '';
      const { start, end } = getOffsetsForMap(token.map);
      blocks.push({
        type: 'heading',
        text,
        html: renderInlineMarkdown(text),
        isHeading: true,
        level,
        startOffset: start,
        endOffset: end,
      });
      i += 3; // heading_open, inline, heading_close
      continue;
    }

    // 2. Code Fences & Mermaid Diagrams
    if (token.type === 'fence' || token.type === 'code_block') {
      const info = (token.info || '').trim();
      const rawCode = token.content.replace(/\n$/, '');
      const { start, end } = getOffsetsForMap(token.map);

      if (isMermaidFence(info, rawCode)) {
        blocks.push({
          type: 'mermaid',
          text: rawCode,
          isHeading: false,
          lang: 'mermaid',
          startOffset: start,
          endOffset: end,
        });
      } else {
        blocks.push({
          type: 'code',
          text: rawCode,
          isHeading: false,
          lang: info || 'text',
          startOffset: start,
          endOffset: end,
        });
      }
      i += 1;
      continue;
    }

    // 3. Markdown Tables (table_open ... table_close)
    if (token.type === 'table_open') {
      const { start, end } = getOffsetsForMap(token.map);
      const tableTokens: typeof tokens = [];
      const headers: string[] = [];
      const aligns: ('left' | 'center' | 'right' | null)[] = [];
      const rows: string[][] = [];

      let currentRow: string[] = [];
      let inThead = false;
      let inTbody = false;

      while (i < tokens.length && tokens[i].type !== 'table_close') {
        const t = tokens[i];
        tableTokens.push(t);

        if (t.type === 'thead_open') inThead = true;
        if (t.type === 'thead_close') inThead = false;
        if (t.type === 'tbody_open') inTbody = true;
        if (t.type === 'tbody_close') inTbody = false;

        if (t.type === 'tr_open') {
          currentRow = [];
        } else if (t.type === 'th_open') {
          const style = String(t.attrGet('style') || '');
          if (style.includes('center')) aligns.push('center');
          else if (style.includes('right')) aligns.push('right');
          else if (style.includes('left')) aligns.push('left');
          else aligns.push(null);
        } else if (t.type === 'inline') {
          currentRow.push(t.content.trim());
        } else if (t.type === 'tr_close') {
          if (inThead) {
            headers.push(...currentRow);
          } else if (inTbody) {
            rows.push(currentRow);
          }
        }
        i++;
      }
      if (i < tokens.length && tokens[i].type === 'table_close') {
        tableTokens.push(tokens[i]);
        i++;
      }

      const tableHtml = mdParser.renderer.render(tableTokens, mdParser.options, {});
      blocks.push({
        type: 'table',
        text: headers.join(' | '),
        html: tableHtml,
        isHeading: false,
        tableHeaders: headers,
        tableAlign: aligns,
        tableRows: rows,
        startOffset: start,
        endOffset: end,
      });
      continue;
    }

    // 4. Blockquotes (blockquote_open ... blockquote_close)
    if (token.type === 'blockquote_open') {
      const { start, end } = getOffsetsForMap(token.map);
      const quoteLines: string[] = [];
      i++;
      while (i < tokens.length && tokens[i].type !== 'blockquote_close') {
        if (tokens[i].type === 'inline') {
          quoteLines.push(tokens[i].content.trim());
        }
        i++;
      }
      if (i < tokens.length && tokens[i].type === 'blockquote_close') i++;
      const joined = quoteLines.join('\n');
      blocks.push({
        type: 'blockquote',
        text: joined,
        html: renderInlineMarkdown(joined),
        isHeading: false,
        startOffset: start,
        endOffset: end,
      });
      continue;
    }

    // 5. Bullet & Ordered Lists (including Task Lists - [x] / - [ ])
    if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') {
      const ordered = token.type === 'ordered_list_open';
      const closeType = ordered ? 'ordered_list_close' : 'bullet_list_close';
      const { start, end } = getOffsetsForMap(token.map);
      const items: { text: string; html: string; task?: boolean; checked?: boolean }[] = [];

      let depth = 1;
      i++;
      while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.type === token.type) depth++;
        else if (t.type === closeType) depth--;

        if (depth > 0 && t.type === 'inline') {
          const rawItem = t.content.trim();
          const taskMatch = rawItem.match(/^\[([ xX])\]\s+([\s\S]*)$/);
          if (taskMatch) {
            const checked = taskMatch[1].toLowerCase() === 'x';
            const cleanText = taskMatch[2].trim();
            items.push({
              text: cleanText,
              html: renderInlineMarkdown(cleanText),
              task: true,
              checked,
            });
          } else {
            items.push({
              text: rawItem,
              html: renderInlineMarkdown(rawItem),
              task: false,
            });
          }
        }
        i++;
      }

      blocks.push({
        type: 'list',
        text: items.map((it) => it.text).join('\n'),
        isHeading: false,
        ordered,
        listItems: items,
        startOffset: start,
        endOffset: end,
      });
      continue;
    }

    // 6. Horizontal Rule
    if (token.type === 'hr') {
      const { start, end } = getOffsetsForMap(token.map);
      blocks.push({
        type: 'hr',
        text: '---',
        isHeading: false,
        startOffset: start,
        endOffset: end,
      });
      i++;
      continue;
    }

    // 7. Paragraphs (split multi-line TXT paragraphs cleanly while preserving inline Markdown)
    if (token.type === 'paragraph_open') {
      const { start, end } = getOffsetsForMap(token.map);
      const inlineToken = tokens[i + 1];
      const rawContent = inlineToken?.content || '';
      const subLines = rawContent.split('\n');
      let subCursor = start;

      for (const sub of subLines) {
        const trimmed = sub.trim();
        const subEnd = Math.min(end, subCursor + sub.length);
        if (trimmed) {
          const isChHeading = trimmed.length <= 60 && headingRegex.test(trimmed);
          blocks.push({
            type: isChHeading ? 'heading' : 'paragraph',
            text: trimmed,
            html: renderInlineMarkdown(trimmed),
            isHeading: isChHeading,
            level: isChHeading ? 2 : undefined,
            startOffset: subCursor,
            endOffset: subEnd,
          });
        }
        subCursor = subEnd + 1;
      }

      i += 3; // paragraph_open, inline, paragraph_close
      continue;
    }

    i++;
  }

  return blocks;
}

/**
 * Automatically detects UTF-8 vs GB18030/GBK/Big5 encoding from an ArrayBuffer
 * and returns decoded clean text along with the detected encoding label.
 */
export function decodeFileBuffer(buffer: ArrayBuffer): { text: string; encoding: string } {
  const uint8 = new Uint8Array(buffer);

  if (uint8.length >= 3 && uint8[0] === 0xef && uint8[1] === 0xbb && uint8[2] === 0xbf) {
    const decoder = new TextDecoder('utf-8');
    return { text: normalizeLineEndings(decoder.decode(uint8.subarray(3))), encoding: 'UTF-8 (BOM)' };
  }

  if (uint8.length >= 2 && uint8[0] === 0xff && uint8[1] === 0xfe) {
    const decoder = new TextDecoder('utf-16le');
    return { text: normalizeLineEndings(decoder.decode(uint8.subarray(2))), encoding: 'UTF-16LE' };
  }
  if (uint8.length >= 2 && uint8[0] === 0xfe && uint8[1] === 0xff) {
    const decoder = new TextDecoder('utf-16be');
    return { text: normalizeLineEndings(decoder.decode(uint8.subarray(2))), encoding: 'UTF-16BE' };
  }

  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(uint8);
    return { text: normalizeLineEndings(text), encoding: 'UTF-8' };
  } catch {
    try {
      const gbkDecoder = new TextDecoder('gb18030', { fatal: false });
      const text = gbkDecoder.decode(uint8);
      return { text: normalizeLineEndings(text), encoding: 'GB18030 / GBK' };
    } catch {
      const fallbackDecoder = new TextDecoder('utf-8');
      return { text: normalizeLineEndings(fallbackDecoder.decode(uint8)), encoding: 'UTF-8' };
    }
  }
}

export function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * Extracts chapter table of contents using multi-pattern regex matching while ignoring code fences.
 */
export function extractChapters(content: string, _format: BookFormat): Chapter[] {
  const lines = content.split('\n');
  const rawChapters: { title: string; level: number; startOffset: number }[] = [];

  const txtChapterRegex =
    /^\s*(?:第[零一二三四五六七八九十百千万0-9]+[章回节卷集部篇]|(?:序章|楔子|引子|前言|序言|尾声|后记|番外)(?:\s+.*|$)|Chapter\s+\d+.*|Part\s+\d+.*)\s*$/i;
  const mdHeadingRegex = /^\s*(#{1,4})\s+(.+)$/;
  const fenceRegex = /^\s*```/;

  let runningOffset = 0;
  let insideFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (fenceRegex.test(trimmed)) {
      insideFence = !insideFence;
      runningOffset += line.length + 1;
      continue;
    }

    if (!insideFence && trimmed.length > 0 && trimmed.length <= 72) {
      const mdMatch = trimmed.match(mdHeadingRegex);
      if (mdMatch) {
        rawChapters.push({
          title: mdMatch[2].trim(),
          level: mdMatch[1].length,
          startOffset: runningOffset,
        });
        runningOffset += line.length + 1;
        continue;
      }

      if (txtChapterRegex.test(trimmed)) {
        const isVolume = /^\s*第[零一二三四五六七八九十百千万0-9]+[卷集部]/.test(trimmed);
        rawChapters.push({
          title: trimmed.replace(/^#{1,4}\s+/, ''),
          level: isVolume ? 1 : 2,
          startOffset: runningOffset,
        });
      }
    }

    runningOffset += line.length + 1;
  }

  if (rawChapters.length === 0) {
    const chunkSize = 3500;
    const totalLen = content.length;
    if (totalLen <= chunkSize) {
      return [
        {
          id: 'ch-0',
          title: '全篇正文',
          level: 1,
          startOffset: 0,
          endOffset: totalLen,
          wordCount: totalLen,
        },
      ];
    }

    const fallbackChapters: Chapter[] = [];
    let offset = 0;
    let index = 1;
    while (offset < totalLen) {
      let nextEnd = Math.min(offset + chunkSize, totalLen);
      if (nextEnd < totalLen) {
        const nextNewline = content.indexOf('\n', nextEnd);
        if (nextNewline !== -1 && nextNewline - nextEnd < 400) {
          nextEnd = nextNewline + 1;
        }
      }
      fallbackChapters.push({
        id: `ch-${index}`,
        title: `第 ${index} 节`,
        level: 1,
        startOffset: offset,
        endOffset: nextEnd,
        wordCount: nextEnd - offset,
      });
      offset = nextEnd;
      index++;
    }
    return fallbackChapters;
  }

  if (rawChapters[0].startOffset > 60) {
    rawChapters.unshift({
      title: '扉页与引子',
      level: 1,
      startOffset: 0,
    });
  } else {
    rawChapters[0].startOffset = 0;
  }

  return rawChapters.map((item, idx) => {
    const endOffset =
      idx < rawChapters.length - 1 ? rawChapters[idx + 1].startOffset : content.length;
    return {
      id: `ch-${idx + 1}`,
      title: item.title,
      level: item.level,
      startOffset: item.startOffset,
      endOffset,
      wordCount: Math.max(0, endOffset - item.startOffset),
    };
  });
}

/**
 * Generates a standalone, styled HTML Reading Notebook using markdown-it to render tables and Mermaid blocks.
 */
export function buildHtmlNotebookExport(
  book: Book,
  annotations: Annotation[],
  includeFullText: boolean
): string {
  const dateStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sortedAnnotations = [...annotations].sort((a, b) => a.charOffset - b.charOffset);

  const notesHtml =
    sortedAnnotations.length === 0
      ? `<p class="empty">暂无书签或高亮批注记录。</p>`
      : sortedAnnotations
          .map(
            (ann, idx) => `
      <div class="note-card">
        <div class="note-meta">
          <span>#${String(idx + 1).padStart(2, '0')} · ${escapeHtml(ann.chapterTitle)}</span>
          <span>字符位置 ${ann.charOffset} · ${new Date(ann.createdAt).toLocaleDateString('zh-CN')}</span>
        </div>
        <blockquote class="quote">${escapeHtml(ann.selectedText)}</blockquote>
        ${ann.noteText ? `<p class="thought"><strong>随笔批注：</strong>${escapeHtml(ann.noteText)}</p>` : ''}
      </div>`
          )
          .join('\n');

  const manuscriptHtml = includeFullText
    ? `<section class="manuscript">
        <h2>全书正文归档</h2>
        ${renderFullMarkdownToHtml(book.content)}
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>&#8203;</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0mm;
    }
    body {
      background-color: #F6F0E6;
      color: #2C1E16;
      font-family: "Songti SC", "Noto Serif SC", Georgia, serif;
      line-height: 1.85;
      margin: 0;
      padding: 48px 24px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @media print {
      body {
        background-color: #FBF7F0;
        padding: 16mm;
      }
      .container {
        border: none;
        box-shadow: none;
        padding: 0;
        max-width: 100%;
      }
    }
    .container {
      max-width: 780px;
      margin: 0 auto;
      background: #FBF7F0;
      border: 1px solid #DECBB3;
      border-radius: 16px;
      padding: 48px;
      box-shadow: 0 12px 32px rgba(44, 30, 22, 0.08);
    }
    header {
      border-bottom: 1px solid #DECBB3;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .kicker {
      font-size: 12px;
      color: #B4532A;
      letter-spacing: 0.08em;
    }
    h1 {
      font-size: 30px;
      margin: 8px 0;
      color: #2C1E16;
    }
    .meta {
      font-size: 13px;
      color: #7A6352;
    }
    h2 {
      font-size: 20px;
      color: #544032;
      margin-top: 36px;
      margin-bottom: 16px;
      border-bottom: 1px dashed #DECBB3;
      padding-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    th, td {
      border: 1px solid #DECBB3;
      padding: 8px 12px;
      font-size: 14px;
    }
    th {
      background: #EFE6D5;
    }
    .note-card {
      background: #F6F0E6;
      border: 1px solid #DECBB3;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .note-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #7A6352;
      margin-bottom: 10px;
    }
    .quote {
      margin: 0;
      padding: 8px 14px;
      background: #FBF7F0;
      border-radius: 8px;
      color: #2C1E16;
      font-style: italic;
    }
    .thought {
      margin: 12px 0 0 0;
      font-size: 14px;
      color: #544032;
    }
    footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid #DECBB3;
      font-size: 12px;
      color: #7A6352;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>《${escapeHtml(book.title)}》</h1>
      <div class="meta">
        作者：${escapeHtml(book.author)} · 分类：${escapeHtml(book.category)} · 全书字数：${book.totalChars.toLocaleString()} 字 · ${dateStr}
      </div>
    </header>
    <section>
      <h2>精选书摘与随笔批注（共 ${sortedAnnotations.length} 条）</h2>
      ${notesHtml}
    </section>
    ${manuscriptHtml}
  </div>
</body>
</html>`;
}

export function buildTxtExport(
  book: Book,
  annotations: Annotation[],
  includeFullText: boolean
): string {
  const lines: string[] = [
    `================================================`,
    `《${book.title}》 — 读书笔记与书摘归档`,
    `作者：${book.author}  ·  分类：${book.category}  ·  总字数：${book.totalChars} 字`,
    `导出时间：${new Date().toLocaleString('zh-CN')}`,
    `================================================`,
    ``,
    `【书签与高亮书摘 (${annotations.length} 条)】`,
    ``,
  ];

  if (annotations.length === 0) {
    lines.push('（暂无书签或批注）', '');
  } else {
    const sorted = [...annotations].sort((a, b) => a.charOffset - b.charOffset);
    sorted.forEach((ann, i) => {
      lines.push(
        `${i + 1}. [${ann.chapterTitle}] (位置 ${ann.charOffset})`,
        `   「${ann.selectedText}」`
      );
      if (ann.noteText) {
        lines.push(`   批注：${ann.noteText}`);
      }
      lines.push('');
    });
  }

  if (includeFullText) {
    lines.push(
      `================================================`,
      `【全书正文】`,
      `================================================`,
      ``,
      book.content
    );
  }

  return lines.join('\n');
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function validateBackupJson(raw: string): FullLibraryBackup | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.books) && Array.isArray(parsed.annotations)) {
      return parsed as FullLibraryBackup;
    }
    return null;
  } catch {
    return null;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
