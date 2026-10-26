import { jsPDF } from 'jspdf';
import { Annotation, Book, Chapter, ReadingStatsDaily } from '../types/reader';
import { extractChapters, renderFullMarkdownToHtml } from './parserEngine';

export type ExportFormat = 'md' | 'epub' | 'pdf' | 'html' | 'txt' | 'csv' | 'json';

export type ExportThemeStyle = 'parchment' | 'caramel' | 'espresso' | 'eink';

export interface ExportConfig {
  format: ExportFormat;
  includeOutline: boolean;
  includeAnnotations: boolean;
  includeNotes?: boolean; // 随笔笔记 (读者批注感悟)
  includeExcerpts?: boolean; // 精选书摘 (原文高亮摘录)
  includeStats: boolean;
  includeFullText: boolean; // 书籍正文
  selectedChapterIds: string[]; // empty = all chapters
  themeStyle: ExportThemeStyle;
  fontStyle?: 'serif' | 'kaiti' | 'sans';
}

export interface QuoteCardConfig {
  bookTitle: string;
  author: string;
  chapterTitle: string;
  selectedText: string;
  noteText: string;
  paperTheme: 'parchment' | 'caramel' | 'espresso' | 'xuan';
  fontStyle: 'serif' | 'kaiti' | 'sans';
  showNote: boolean;
  showStamp: boolean;
  showDate: boolean;
}

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  format: 'md',
  includeOutline: true,
  includeAnnotations: true,
  includeNotes: true,
  includeExcerpts: true,
  includeStats: true,
  includeFullText: true,
  selectedChapterIds: [],
  themeStyle: 'parchment',
  fontStyle: 'serif',
};

const THEME_PALETTES: Record<
  ExportThemeStyle,
  {
    name: string;
    bgCanvas: string;
    bgPage: string;
    bgSurface: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    accent: string;
    border: string;
  }
> = {
  parchment: {
    name: '暖白羊皮纸',
    bgCanvas: '#F6F0E6',
    bgPage: '#FBF7F0',
    bgSurface: '#EFE6D5',
    textPrimary: '#2C1E16',
    textSecondary: '#5C4738',
    textMuted: '#8C7360',
    accent: '#B4532A',
    border: '#DECBB3',
  },
  caramel: {
    name: '烘焙焦糖',
    bgCanvas: '#EFE3CE',
    bgPage: '#F7EEDF',
    bgSurface: '#E5D4B7',
    textPrimary: '#261810',
    textSecondary: '#543B2B',
    textMuted: '#7D604D',
    accent: '#9E3E16',
    border: '#D1BA97',
  },
  espresso: {
    name: '深夜浓缩',
    bgCanvas: '#17120F',
    bgPage: '#211A15',
    bgSurface: '#2C221C',
    textPrimary: '#EAE0D5',
    textSecondary: '#B8A693',
    textMuted: '#857362',
    accent: '#D97724',
    border: '#3D3027',
  },
  eink: {
    name: '电子墨水',
    bgCanvas: '#EBEBEB',
    bgPage: '#F7F7F7',
    bgSurface: '#E2E2E2',
    textPrimary: '#141414',
    textSecondary: '#3D3D3D',
    textMuted: '#6E6E6E',
    accent: '#222222',
    border: '#BDBDBD',
  },
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function getFilteredChaptersForBook(book: Book, selectedChapterIds: string[]): Chapter[] {
  const allChapters =
    book.chapters && book.chapters.length > 0
      ? book.chapters
      : extractChapters(book.content, book.format);
  if (!selectedChapterIds || selectedChapterIds.length === 0) {
    return allChapters;
  }
  const set = new Set(selectedChapterIds);
  const filtered = allChapters.filter((ch) => set.has(ch.id));
  return filtered.length > 0 ? filtered : allChapters;
}

export function getBookReadingMetrics(book: Book, dailyStats: ReadingStatsDaily[]) {
  const progressPct =
    book.totalChars > 0 ? Math.min(100, Math.round((book.currentOffset / book.totalChars) * 100)) : 0;
  const readingMinutes = Math.max(1, Math.round((book.readingTimeSeconds || 0) / 60));
  const daysTouched = dailyStats.filter((d) => d.booksTouched.includes(book.id)).length;
  const charsPerMinute =
    readingMinutes > 0 && book.currentOffset > 0
      ? Math.round(book.currentOffset / readingMinutes)
      : 320;
  return {
    progressPct,
    readingMinutes,
    daysTouched: Math.max(1, daysTouched),
    charsPerMinute,
  };
}

/**
 * 1. Markdown (.md) Export with YAML Frontmatter, Outline Tree, Annotations & Full/Selected Chapters
 */
export function buildMarkdownExport(
  book: Book,
  annotations: Annotation[],
  dailyStats: ReadingStatsDaily[],
  config: ExportConfig
): string {
  const nowIso = new Date().toISOString();
  const dateDisplay = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const chapters = getFilteredChaptersForBook(book, config.selectedChapterIds);
  const sortedAnns = [...annotations].sort((a, b) => a.charOffset - b.charOffset);
  const metrics = getBookReadingMetrics(book, dailyStats);

  const lines: string[] = [
    '---',
    `title: "${book.title.replace(/"/g, '\\"')}"`,
    `author: "${book.author.replace(/"/g, '\\"')}"`,
    `category: "${book.category.replace(/"/g, '\\"')}"`,
    `total_chars: ${book.totalChars}`,
    `reading_progress: "${metrics.progressPct}%"`,
    `annotations_count: ${sortedAnns.length}`,
    `exported_at: "${nowIso}"`,
    '---',
    '',
    `# 《${book.title}》`,
    '',
    `> **作者**：${book.author} · **分类**：${book.category} · **全书字数**：${book.totalChars.toLocaleString()} 字 · **导出日期**：${dateDisplay}`,
    '',
  ];

  if (config.includeStats) {
    lines.push(
      '## 阅读进度与统计摘要',
      '',
      '| 统计维度 | 数值指标 | 备注说明 |',
      '| :--- | :---: | :--- |',
      `| 当前阅读进度 | **${metrics.progressPct}%** | 已读 ${book.currentOffset.toLocaleString()} / ${book.totalChars.toLocaleString()} 字 |`,
      `| 累计阅读时长 | **${metrics.readingMinutes} 分钟** | 跨 ${metrics.daysTouched} 个阅读日 |`,
      `| 平均阅读速率 | **${metrics.charsPerMinute} 字/分** | 阅读进度统计 |`,
      `| 书摘与批注数 | **${sortedAnns.length} 条** | 含高亮笔记与书签记录 |`,
      ''
    );
  }

  if (config.includeOutline && chapters.length > 0) {
    lines.push('## 目录大纲', '');
    chapters.forEach((ch, idx) => {
      const level = Math.max(1, Math.min(4, ch.level || 1));
      const indent = '  '.repeat(level - 1);
      lines.push(
        `${indent}- **${String(idx + 1).padStart(2, '0')}. ${ch.title}** · \`${ch.wordCount.toLocaleString()} 字\``
      );
    });
    lines.push('');
  }

  if (config.includeAnnotations) {
    lines.push(`## 精选书摘与批注 (${sortedAnns.length} 条)`, '');
    if (sortedAnns.length === 0) {
      lines.push('_暂无高亮书摘或批注记录。_', '');
    } else {
      sortedAnns.forEach((ann, idx) => {
        const typeLabel = ann.type === 'bookmark' ? '书签' : '批注';
        const dateStr = new Date(ann.createdAt).toLocaleDateString('zh-CN');
        lines.push(
          `### ${String(idx + 1).padStart(2, '0')}. ${ann.chapterTitle} · ${typeLabel}`,
          '',
          `> 「${ann.selectedText}」`,
          ''
        );
        if (ann.noteText) {
          lines.push(`- **随笔感悟**：${ann.noteText}`);
        }
        lines.push(`- **记录位置**：字符偏移 \`${ann.charOffset}\` · ${dateStr}`, '');
      });
    }
  }

  if (config.includeFullText) {
    lines.push('---', '', '## 正文归档', '');
    if (
      config.selectedChapterIds.length === 0 ||
      config.selectedChapterIds.length === book.chapters.length
    ) {
      lines.push(book.content.trim(), '');
    } else {
      chapters.forEach((ch) => {
        const slice = book.content.slice(ch.startOffset, ch.endOffset).trim();
        lines.push(slice, '');
      });
    }
  }

  return lines.join('\n');
}

/**
 * 2. CSV Structured Export (UTF-8 with BOM for Excel / Numbers / Notion compatibility)
 */
export function buildCsvExport(
  books: Book[],
  annotations: Annotation[],
  dailyStats: ReadingStatsDaily[]
): string {
  const escapeCsvCell = (val: string | number): string => {
    const str = String(val ?? '');
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows: string[][] = [
    [
      '记录类型',
      '书名',
      '作者',
      '分类',
      '章节标题',
      '原文摘录',
      '批注感悟',
      '高亮配色',
      '字符位置',
      '阅读进度(%)',
      '总字数',
      '累计阅读分钟',
      '创建时间',
    ],
  ];

  const bookMap = new Map<string, Book>();
  books.forEach((b) => bookMap.set(b.id, b));

  // Add book summary rows
  books.forEach((b) => {
    const metrics = getBookReadingMetrics(b, dailyStats);
    rows.push([
      '书籍统计',
      b.title,
      b.author,
      b.category,
      `共 ${b.chapters.length} 章`,
      '',
      '',
      b.coverPreset,
      String(b.currentOffset),
      String(metrics.progressPct),
      String(b.totalChars),
      String(metrics.readingMinutes),
      new Date(b.lastReadAt).toLocaleString('zh-CN'),
    ]);
  });

  // Add annotation rows
  const sortedAnns = [...annotations].sort((a, b) => a.charOffset - b.charOffset);
  sortedAnns.forEach((ann) => {
    const book = bookMap.get(ann.bookId);
    if (!book) return;
    const metrics = getBookReadingMetrics(book, dailyStats);
    rows.push([
      ann.type === 'bookmark' ? '书签' : '高亮批注',
      book.title,
      book.author,
      book.category,
      ann.chapterTitle,
      ann.selectedText,
      ann.noteText || '',
      ann.color,
      String(ann.charOffset),
      String(metrics.progressPct),
      String(book.totalChars),
      String(metrics.readingMinutes),
      new Date(ann.createdAt).toLocaleString('zh-CN'),
    ]);
  });

  const csvBody = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
  return '\uFEFF' + csvBody;
}

/**
 * 3. Structured JSON Report Export
 */
export function buildStructuredJsonExport(
  books: Book[],
  annotations: Annotation[],
  dailyStats: ReadingStatsDaily[],
  config: ExportConfig
): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    exportConfig: config,
    books: books.map((book) => {
      const bookAnns = annotations
        .filter((a) => a.bookId === book.id)
        .sort((a, b) => a.charOffset - b.charOffset);
      const chapters = getFilteredChaptersForBook(book, config.selectedChapterIds);
      const metrics = getBookReadingMetrics(book, dailyStats);

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category,
        format: book.format,
        totalChars: book.totalChars,
        stats: config.includeStats ? metrics : undefined,
        outline: config.includeOutline ? chapters : undefined,
        annotations: config.includeAnnotations ? bookAnns : undefined,
        content: config.includeFullText
          ? config.selectedChapterIds.length > 0
            ? chapters.map((ch) => book.content.slice(ch.startOffset, ch.endOffset)).join('\n\n')
            : book.content
          : undefined,
      };
    }),
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * 4. Styled HTML / Printable PDF Document Builder (Supports Warm Themes, Tables & Mermaid)
 */
export function buildStyledHtmlDocument(
  book: Book,
  annotations: Annotation[],
  dailyStats: ReadingStatsDaily[],
  config: ExportConfig
): string {
  const palette = THEME_PALETTES[config.themeStyle] || THEME_PALETTES.parchment;
  const chapters = getFilteredChaptersForBook(book, config.selectedChapterIds);
  const sortedAnns = [...annotations].sort((a, b) => a.charOffset - b.charOffset);
  const metrics = getBookReadingMetrics(book, dailyStats);
  const dateStr = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const statsSection = config.includeStats
    ? `<section class="section-block">
        <h2>阅读进度与统计</h2>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${metrics.progressPct}%</div>
            <div class="stat-label">当前阅读进度</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${book.totalChars.toLocaleString()}</div>
            <div class="stat-label">全书总字数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${metrics.readingMinutes}m</div>
            <div class="stat-label">累计阅读时长</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${sortedAnns.length}</div>
            <div class="stat-label">书摘与批注</div>
          </div>
        </div>
      </section>`
    : '';

  const outlineSection =
    config.includeOutline && chapters.length > 0
      ? `<section class="section-block">
          <h2>章节目录大纲 (${chapters.length})</h2>
          <div class="outline-list">
            ${chapters
              .map((ch, idx) => {
                const level = Math.max(1, Math.min(4, ch.level || 1));
                const indentPx = (level - 1) * 18;
                return `<div class="outline-row" style="padding-left: ${indentPx}px">
                  <span class="outline-title"><span class="outline-tag">H${level}</span> ${String(
                  idx + 1
                ).padStart(2, '0')}. ${escapeHtml(ch.title)}</span>
                  <span class="outline-meta">${ch.wordCount.toLocaleString()} 字</span>
                </div>`;
              })
              .join('\n')}
          </div>
        </section>`
      : '';

  const annotationsSection = config.includeAnnotations
    ? `<section class="section-block">
        <h2>精选书摘与随笔批注 (${sortedAnns.length})</h2>
        ${
          sortedAnns.length === 0
            ? `<p class="muted">暂无书签或高亮批注记录。</p>`
            : sortedAnns
                .map(
                  (ann, i) => `
          <div class="note-card">
            <div class="note-header">
              <span>#${String(i + 1).padStart(2, '0')} · ${escapeHtml(ann.chapterTitle)}</span>
              <span>字符位置 ${ann.charOffset} · ${new Date(ann.createdAt).toLocaleDateString(
                    'zh-CN'
                  )}</span>
            </div>
            <blockquote class="quote-box">「${escapeHtml(ann.selectedText)}」</blockquote>
            ${
              ann.noteText
                ? `<div class="note-thought"><strong>读者批注：</strong>${escapeHtml(
                    ann.noteText
                  )}</div>`
                : ''
            }
          </div>`
                )
                .join('\n')
        }
      </section>`
    : '';

  const rawTextToRender =
    config.selectedChapterIds.length > 0
      ? chapters.map((ch) => book.content.slice(ch.startOffset, ch.endOffset)).join('\n\n')
      : book.content;

  const fullTextSection = config.includeFullText
    ? `<section class="section-block manuscript-body">
        <h2>正文典藏</h2>
        ${renderFullMarkdownToHtml(rawTextToRender)}
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
    * {
      box-sizing: border-box;
    }
    body {
      background-color: ${palette.bgCanvas};
      color: ${palette.textPrimary};
      font-family: "Noto Serif SC", "Songti SC", "Lora", Georgia, serif;
      line-height: 1.85;
      margin: 0;
      padding: 36px 20px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      max-width: 820px;
      margin: 0 auto;
      background-color: ${palette.bgPage};
      border: 1px solid ${palette.border};
      border-radius: 16px;
      padding: 44px;
    }
    header {
      border-bottom: 1px solid ${palette.border};
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    .kicker {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: ${palette.accent};
      font-weight: 600;
    }
    h1 {
      font-size: 28px;
      margin: 8px 0 10px;
      color: ${palette.textPrimary};
    }
    .meta-line {
      font-size: 13px;
      color: ${palette.textSecondary};
    }
    .section-block {
      margin-top: 32px;
    }
    h2 {
      font-size: 18px;
      color: ${palette.accent};
      border-bottom: 1px solid ${palette.border};
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .stat-item {
      background: ${palette.bgSurface};
      border: 1px solid ${palette.border};
      border-radius: 10px;
      padding: 12px 14px;
      text-align: center;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: ${palette.accent};
      font-variant-numeric: tabular-nums;
    }
    .stat-label {
      font-size: 11px;
      color: ${palette.textMuted};
      margin-top: 2px;
    }
    .outline-list {
      border: 1px solid ${palette.border};
      border-radius: 12px;
      background: ${palette.bgSurface};
      padding: 12px 16px;
    }
    .outline-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px dashed ${palette.border};
      font-size: 13px;
    }
    .outline-row:last-child {
      border-bottom: none;
    }
    .outline-tag {
      font-family: monospace;
      font-size: 11px;
      color: ${palette.accent};
      margin-right: 6px;
    }
    .outline-meta {
      font-size: 12px;
      color: ${palette.textMuted};
      font-variant-numeric: tabular-nums;
    }
    .note-card {
      background: ${palette.bgSurface};
      border: 1px solid ${palette.border};
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 14px;
      break-inside: avoid;
    }
    .note-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: ${palette.textMuted};
      margin-bottom: 8px;
    }
    .quote-box {
      margin: 0;
      padding: 10px 14px;
      background: ${palette.bgPage};
      border: 1px solid ${palette.border};
      border-radius: 8px;
      font-style: italic;
      color: ${palette.textPrimary};
    }
    .note-thought {
      margin-top: 10px;
      font-size: 13.5px;
      color: ${palette.textSecondary};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 13px;
      break-inside: avoid;
    }
    th, td {
      border: 1px solid ${palette.border};
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: ${palette.bgSurface};
      color: ${palette.textPrimary};
      font-weight: 600;
    }
    tr:nth-child(even) td {
      background: ${palette.bgCanvas};
    }
    blockquote {
      margin: 12px 0;
      padding: 10px 16px;
      background: ${palette.bgSurface};
      border: 1px solid ${palette.border};
      border-radius: 8px;
    }
    pre {
      background: ${palette.bgSurface};
      border: 1px solid ${palette.border};
      border-radius: 8px;
      padding: 12px;
      overflow-x: auto;
      font-size: 12px;
    }
    footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid ${palette.border};
      font-size: 12px;
      color: ${palette.textMuted};
      text-align: center;
    }
    @media print {
      body {
        padding: 16mm 16mm;
        background: ${palette.bgPage};
      }
      .sheet {
        border: none;
        padding: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div style="border-bottom: 1px solid ${palette.border}; padding-bottom: 20px; margin-bottom: 24px;">
      <h1>《${escapeHtml(book.title)}》</h1>
      <div class="meta-line">
        作者：${escapeHtml(book.author)} · 分类：${escapeHtml(book.category)} · 字数：${book.totalChars.toLocaleString()} 字 · ${dateStr}
      </div>
    </div>
    ${statsSection}
    ${outlineSection}
    ${annotationsSection}
    ${fullTextSection}
  </div>
</body>
</html>`;
}

/**
 * Triggers native vector PDF print via a hidden iframe (avoids window.open / popup blockers in iframe environments).
 */
export function printDocumentViaHiddenIframe(htmlContent: string): void {
  const existingFrame = document.getElementById('roast-reed-print-frame');
  if (existingFrame && existingFrame.parentNode) {
    existingFrame.parentNode.removeChild(existingFrame);
  }

  const utf8Html = htmlContent.startsWith('\uFEFF') ? htmlContent : '\uFEFF' + htmlContent;

  const iframe = document.createElement('iframe');
  iframe.id = 'roast-reed-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  let printed = false;
  const triggerPrintWhenReady = async () => {
    if (printed) return;
    printed = true;
    try {
      const win = iframe.contentWindow;
      if (!win) return;
      if (win.document?.fonts?.ready) {
        await Promise.race([
          win.document.fonts.ready,
          new Promise((r) => setTimeout(r, 600)),
        ]);
      }
      win.focus();
      win.print();
    } catch {
      const blob = new Blob([utf8Html], { type: 'text/html;charset=utf-8' });
      triggerBlobDownload('printable-book.html', blob);
    }
  };

  iframe.onload = () => {
    setTimeout(triggerPrintWhenReady, 180);
  };

  try {
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open('text/html', 'replace');
      doc.write(utf8Html);
      doc.close();
      setTimeout(triggerPrintWhenReady, 380);
    } else {
      iframe.srcdoc = utf8Html;
    }
  } catch {
    const blob = new Blob([utf8Html], { type: 'text/html;charset=utf-8' });
    triggerBlobDownload('printable-book.html', blob);
  }
}

/**
 * 5. Pure Frontend Standard EPUB 3 (.epub) Binary ZIP Builder
 * Packs `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/toc.ncx`,
 * `OEBPS/nav.xhtml`, `OEBPS/style.css`, and chapter XHTML files into a valid `.epub` archive.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntryInput {
  path: string;
  content: Uint8Array;
}

function createStoreZipArchive(entries: ZipEntryInput[]): Blob {
  const encoder = new TextEncoder();
  const localFileParts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const dataBytes = entry.content;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + file name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Compression method: 0 (STORE)
    lv.setUint16(10, 0, true); // File last mod time
    lv.setUint16(12, 0x5421, true); // File last mod date
    lv.setUint32(14, crc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length (MUST be 0 for EPUB mimetype)
    localHeader.set(nameBytes, 30);

    localFileParts.push(localHeader, dataBytes);

    // Central directory file header (46 bytes + file name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory signature
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // Compression method: 0 (STORE)
    cv.setUint16(12, 0, true); // Mod time
    cv.setUint16(14, 0x5421, true); // Mod date
    cv.setUint32(16, crc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // Comment length
    cv.setUint16(34, 0, true); // Disk number
    cv.setUint16(36, 0, true); // Internal attrs
    cv.setUint32(38, 0, true); // External attrs
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralDirParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralDirSize = centralDirParts.reduce((acc, p) => acc + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central directory signature
  ev.setUint16(4, 0, true); // Disk number
  ev.setUint16(6, 0, true); // Start disk
  ev.setUint16(8, entries.length, true); // Entries on disk
  ev.setUint16(10, entries.length, true); // Total entries
  ev.setUint32(12, centralDirSize, true); // Size of central directory
  ev.setUint32(16, offset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  return new Blob([...localFileParts, ...centralDirParts, eocd] as BlobPart[], {
    type: 'application/epub+zip',
  });
}

function convertChapterTextToXhtmlBody(rawText: string): string {
  const lines = rawText.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      const lvl = Math.min(4, hMatch[1].length);
      out.push(`<h${lvl}>${escapeXml(hMatch[2].trim())}</h${lvl}>`);
    } else if (trimmed.startsWith('>')) {
      out.push(`<blockquote><p>${escapeXml(trimmed.replace(/^>\s*/, ''))}</p></blockquote>`);
    } else {
      out.push(`<p>${escapeXml(trimmed)}</p>`);
    }
  }
  return out.join('\n    ');
}

export function buildEpubBlob(
  book: Book,
  annotations: Annotation[],
  dailyStats: ReadingStatsDaily[],
  config: ExportConfig
): Blob {
  const encoder = new TextEncoder();
  const palette = THEME_PALETTES[config.themeStyle] || THEME_PALETTES.parchment;
  const chapters = getFilteredChaptersForBook(book, config.selectedChapterIds);
  const sortedAnns = [...annotations].sort((a, b) => a.charOffset - b.charOffset);
  const metrics = getBookReadingMetrics(book, dailyStats);
  const bookUuid = `urn:uuid:roast-reed-${book.id}`;

  const entries: ZipEntryInput[] = [];

  // 1. mimetype (MUST be first file, uncompressed)
  entries.push({
    path: 'mimetype',
    content: encoder.encode('application/epub+zip'),
  });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  entries.push({
    path: 'META-INF/container.xml',
    content: encoder.encode(containerXml),
  });

  // 3. OEBPS/style.css
  const css = `body {
  background-color: ${palette.bgPage};
  color: ${palette.textPrimary};
  font-family: "Songti SC", "Noto Serif SC", Georgia, serif;
  line-height: 1.8;
  margin: 5%;
}
h1, h2, h3, h4 {
  color: ${palette.accent};
  line-height: 1.35;
}
p {
  text-indent: 2em;
  margin: 0.6em 0;
}
blockquote {
  margin: 1em 0;
  padding: 0.6em 1em;
  background-color: ${palette.bgSurface};
  border: 1px solid ${palette.border};
}
.note-box {
  margin: 1em 0;
  padding: 0.8em 1em;
  background-color: ${palette.bgSurface};
  border: 1px solid ${palette.border};
  border-radius: 6px;
}`;
  entries.push({
    path: 'OEBPS/style.css',
    content: encoder.encode(css),
  });

  const manifestItems: string[] = [
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
  ];
  const spineItems: string[] = [];
  const navLinks: string[] = [];
  const ncxPoints: string[] = [];
  let playOrder = 1;

  // Frontmatter & Stats / Annotations Overview Chapter
  const overviewHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
  <title>${escapeXml(book.title)} — 馆藏扉页</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>《${escapeXml(book.title)}》</h1>
  <p style="text-indent:0;">作者：${escapeXml(book.author)} · 分类：${escapeXml(
    book.category
  )} · 总字数：${book.totalChars.toLocaleString()} 字</p>
  ${
    config.includeStats
      ? `<div class="note-box">
          <h3>阅读进度与统计</h3>
          <p style="text-indent:0;">当前进度：${metrics.progressPct}% · 累计阅读：${metrics.readingMinutes} 分钟 · 批注数：${sortedAnns.length} 条</p>
        </div>`
      : ''
  }
  ${
    config.includeAnnotations && sortedAnns.length > 0
      ? `<h2>精选书摘与批注 (${sortedAnns.length})</h2>
        ${sortedAnns
          .map(
            (ann, idx) => `<div class="note-box">
              <p style="text-indent:0;"><strong>#${idx + 1} [${escapeXml(
              ann.chapterTitle
            )}]</strong></p>
              <blockquote><p style="text-indent:0;">「${escapeXml(ann.selectedText)}」</p></blockquote>
              ${
                ann.noteText
                  ? `<p style="text-indent:0;">批注：${escapeXml(ann.noteText)}</p>`
                  : ''
              }
            </div>`
          )
          .join('\n')}`
      : ''
  }
</body>
</html>`;

  entries.push({
    path: 'OEBPS/frontmatter.xhtml',
    content: encoder.encode(overviewHtml),
  });
  manifestItems.push(
    `<item id="frontmatter" href="frontmatter.xhtml" media-type="application/xhtml+xml"/>`
  );
  spineItems.push(`<itemref idref="frontmatter"/>`);
  navLinks.push(`<li><a href="frontmatter.xhtml">扉页与读书手账</a></li>`);
  ncxPoints.push(`<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>扉页与读书手账</text></navLabel>
      <content src="frontmatter.xhtml"/>
    </navPoint>`);
  playOrder++;

  // Chapters
  if (config.includeFullText) {
    chapters.forEach((ch, idx) => {
      const fileId = `chapter-${idx + 1}`;
      const fileName = `${fileId}.xhtml`;
      const rawSlice = book.content.slice(ch.startOffset, ch.endOffset).trim();
      const bodyXhtml = convertChapterTextToXhtmlBody(rawSlice);

      const chXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head>
  <title>${escapeXml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h2>${escapeXml(ch.title)}</h2>
  ${bodyXhtml}
</body>
</html>`;

      entries.push({
        path: `OEBPS/${fileName}`,
        content: encoder.encode(chXhtml),
      });
      manifestItems.push(
        `<item id="${fileId}" href="${fileName}" media-type="application/xhtml+xml"/>`
      );
      spineItems.push(`<itemref idref="${fileId}"/>`);
      navLinks.push(`<li><a href="${fileName}">${escapeXml(ch.title)}</a></li>`);
      ncxPoints.push(`<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${escapeXml(ch.title)}</text></navLabel>
      <content src="${fileName}"/>
    </navPoint>`);
      playOrder++;
    });
  }

  // OEBPS/nav.xhtml
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head>
  <title>目录导航</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>目录大纲</h1>
    <ol>
      ${navLinks.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  entries.push({
    path: 'OEBPS/nav.xhtml',
    content: encoder.encode(navXhtml),
  });

  // OEBPS/toc.ncx
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookUuid)}"/>
    <meta name="dtb:depth" content="2"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(book.title)}</text></docTitle>
  <navMap>
    ${ncxPoints.join('\n    ')}
  </navMap>
</ncx>`;
  entries.push({
    path: 'OEBPS/toc.ncx',
    content: encoder.encode(tocNcx),
  });

  // OEBPS/content.opf
  const modifiedIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${escapeXml(bookUuid)}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator>${escapeXml(book.author)}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${modifiedIso}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  entries.push({
    path: 'OEBPS/content.opf',
    content: encoder.encode(contentOpf),
  });

  return createStoreZipArchive(entries);
}

/**
 * 6. High-Resolution Long Image / Quote Card Canvas Renderer (2x Retina PNG)
 */
const QUOTE_CARD_THEMES = {
  parchment: {
    name: '暖白羊皮',
    bgOuter: '#EFE7DA',
    bgCard: '#FBF7F0',
    border: '#DCC8B0',
    textMain: '#281B13',
    textSub: '#6B5544',
    textMuted: '#998270',
    accent: '#B4532A',
    quoteBg: '#F4ECE0',
  },
  caramel: {
    name: '烘焙焦糖',
    bgOuter: '#E4D3B8',
    bgCard: '#F4E8D4',
    border: '#CAAE88',
    textMain: '#24160E',
    textSub: '#593E2D',
    textMuted: '#856752',
    accent: '#9A3B15',
    quoteBg: '#EADBC3',
  },
  espresso: {
    name: '深夜浓缩',
    bgOuter: '#14100D',
    bgCard: '#1F1814',
    border: '#3B2E25',
    textMain: '#EDE2D5',
    textSub: '#B8A490',
    textMuted: '#7D6B5B',
    accent: '#D97724',
    quoteBg: '#29201B',
  },
  xuan: {
    name: '馆藏宣纸',
    bgOuter: '#E8E4DC',
    bgCard: '#F7F5F0',
    border: '#CFC9BC',
    textMain: '#1E1D1B',
    textSub: '#4F4C46',
    textMuted: '#858078',
    accent: '#992B2B',
    quoteBg: '#EFECE4',
  },
};

function wrapCanvasParagraphs(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    let currentLine = '';
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      const testLine = currentLine + ch;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        // Avoid starting a new line with closing punctuation
        if (/^[，。！？；：、）》」』”’]/.test(ch)) {
          lines.push(testLine);
          currentLine = '';
        } else {
          lines.push(currentLine);
          currentLine = ch;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

export function renderQuoteCardToCanvas(
  canvas: HTMLCanvasElement,
  config: QuoteCardConfig
): void {
  const scale = 2; // 2x Retina output
  const width = 560;
  const padOuter = 28;
  const padInner = 38;
  const contentWidth = width - (padOuter + padInner) * 2;
  const palette = QUOTE_CARD_THEMES[config.paperTheme] || QUOTE_CARD_THEMES.parchment;

  const fontStack =
    config.fontStyle === 'kaiti'
      ? '"LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif'
      : config.fontStyle === 'sans'
      ? '"Plus Jakarta Sans", -apple-system, "PingFang SC", sans-serif'
      : '"Noto Serif SC", "Songti SC", "Lora", Georgia, serif';

  const tempCtx = canvas.getContext('2d');
  if (!tempCtx) return;

  // Measure quote lines
  tempCtx.font = `400 20px ${fontStack}`;
  const quoteLines = wrapCanvasParagraphs(
    tempCtx,
    config.selectedText || '择一处静谧角落，品读字里行间的温润微光。',
    contentWidth
  );
  const quoteLineHeight = 36;
  const quoteBlockHeight = Math.max(1, quoteLines.length) * quoteLineHeight;

  // Measure note lines if enabled
  let noteLines: string[] = [];
  if (config.showNote && config.noteText.trim()) {
    tempCtx.font = `400 15px ${fontStack}`;
    noteLines = wrapCanvasParagraphs(tempCtx, config.noteText.trim(), contentWidth - 28);
  }
  const noteLineHeight = 26;
  const noteBlockHeight =
    noteLines.length > 0 ? 44 + noteLines.length * noteLineHeight + 20 : 0;

  const headerHeight = 82;
  const footerHeight = 108;
  const totalHeight =
    padOuter * 2 +
    padInner * 2 +
    headerHeight +
    quoteBlockHeight +
    noteBlockHeight +
    footerHeight;

  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${totalHeight}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  // 1. Outer Background
  ctx.fillStyle = palette.bgOuter;
  ctx.fillRect(0, 0, width, totalHeight);

  // 2. Inner Card Surface
  const cardX = padOuter;
  const cardY = padOuter;
  const cardW = width - padOuter * 2;
  const cardH = totalHeight - padOuter * 2;

  ctx.fillStyle = palette.bgCard;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 16);
  ctx.fill();
  ctx.stroke();

  // Inner subtle hairline frame
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.roundRect(cardX + 8, cardY + 8, cardW - 16, cardH - 16, 11);
  ctx.stroke();

  let cursorY = cardY + padInner;
  const leftX = cardX + padInner;
  const rightX = width - padOuter - padInner;

  // 3. Top Editorial Header (Book & Chapter only, no app branding)
  ctx.fillStyle = palette.accent;
  ctx.font = `600 11px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(config.chapterTitle || `《${config.bookTitle}》书摘`, leftX, cursorY);

  // Decorative quotation mark
  ctx.fillStyle = palette.border;
  ctx.font = `700 44px Georgia, serif`;
  ctx.fillText('“', rightX - 24, cursorY + 24);

  cursorY += 26;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, cursorY);
  ctx.lineTo(rightX, cursorY);
  ctx.stroke();

  cursorY += 42;

  // 4. Main Selected Quote Text
  ctx.fillStyle = palette.textMain;
  ctx.font = `400 20px ${fontStack}`;
  for (const line of quoteLines) {
    if (line === '') {
      cursorY += quoteLineHeight * 0.6;
    } else {
      ctx.fillText(line, leftX, cursorY);
      cursorY += quoteLineHeight;
    }
  }

  // 5. Optional Reader Note Box
  if (noteLines.length > 0) {
    cursorY += 16;
    const boxH = 26 + noteLines.length * noteLineHeight + 14;
    ctx.fillStyle = palette.quoteBg;
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(leftX, cursorY, contentWidth, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = palette.accent;
    ctx.font = `600 12px ${fontStack}`;
    ctx.fillText('随笔感悟', leftX + 14, cursorY + 22);

    ctx.fillStyle = palette.textSub;
    ctx.font = `400 15px ${fontStack}`;
    let noteY = cursorY + 46;
    for (const nLine of noteLines) {
      ctx.fillText(nLine, leftX + 14, noteY);
      noteY += noteLineHeight;
    }
    cursorY += boxH + 22;
  } else {
    cursorY += 22;
  }

  // 6. Bottom Divider & Book Citation Footer
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, cursorY);
  ctx.lineTo(rightX, cursorY);
  ctx.stroke();

  cursorY += 32;
  ctx.fillStyle = palette.textMain;
  ctx.font = `600 16px ${fontStack}`;
  ctx.fillText(`《${config.bookTitle}》`, leftX, cursorY);

  cursorY += 24;
  ctx.fillStyle = palette.textSub;
  ctx.font = `400 13px ${fontStack}`;
  const subCite = `${config.author} · ${config.chapterTitle || '精选章节'}`;
  ctx.fillText(subCite, leftX, cursorY);

  if (config.showDate) {
    cursorY += 20;
    ctx.fillStyle = palette.textMuted;
    ctx.font = `400 11px "JetBrains Mono", monospace`;
    const dateStr = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    ctx.fillText(`摘录于 ${dateStr}`, leftX, cursorY);
  }

  // 7. Cinnabar Archival Stamp ("焙香藏书")
  if (config.showStamp) {
    const stampSize = 54;
    const stampX = rightX - stampSize;
    const stampY = totalHeight - padOuter - padInner - stampSize + 4;

    ctx.save();
    ctx.strokeStyle = '#A82820';
    ctx.fillStyle = 'rgba(168, 40, 32, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(stampX, stampY, stampSize, stampSize, 6);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#A82820';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(stampX + 3, stampY + 3, stampSize - 6, stampSize - 6, 4);
    ctx.stroke();

    ctx.fillStyle = '#A82820';
    ctx.font = `700 14px "Noto Serif SC", "Songti SC", serif`;
    ctx.textAlign = 'center';
    ctx.fillText('读书', stampX + stampSize / 2, stampY + 23);
    ctx.fillText('雅印', stampX + stampSize / 2, stampY + 42);
    ctx.restore();
  }
}

/**
 * 7. Multi-Book Batch Export Helper (Combined Markdown Anthology / CSV / JSON)
 */
export function buildBatchBooksMarkdown(
  books: Book[],
  annotations: Annotation[],
  dailyStats: ReadingStatsDaily[]
): string {
  const dateStr = new Date().toLocaleDateString('zh-CN');
  const sections: string[] = [
    `# 读书笔记合集 (${books.length} 册)`,
    '',
    `> 导出日期：${dateStr} · 共 ${books.length} 册`,
    '',
  ];

  books.forEach((book) => {
    const bookAnns = annotations.filter((a) => a.bookId === book.id);
    sections.push(
      buildMarkdownExport(book, bookAnns, dailyStats, {
        ...DEFAULT_EXPORT_CONFIG,
        includeFullText: false,
      }),
      ''
    );
  });

  return sections.join('\n');
}

/**
 * 8. Vector A4 PDF Typesetting Engine (100% Vector Text & Paths, Header-Free)
 * Generates structured vector instructions (Rects, Lines, Text runs) for each A4 sheet:
 * - Zero running page headers (去掉页眉)
 * - Live preview via crisp Vector SVG sheets (`data:image/svg+xml`)
 * - Vector PDF output via jsPDF vector primitives (`pdf.text`, `pdf.roundedRect`, `pdf.line`)
 *   and native vector PDF printing (`@page { size: A4 portrait; margin: 0mm; }`) so every
 *   Chinese & English character is selectable, searchable (Ctrl+F), and infinitely sharp.
 */
export interface VectorRectOp {
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  fill?: string;
  stroke?: string;
  lineWidth?: number;
}

export interface VectorLineOp {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  lineWidth: number;
}

export interface VectorTextOp {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: '400' | '600' | '700';
  color: string;
  align?: 'left' | 'right' | 'center';
  isMono?: boolean;
}

export interface VectorPdfPage {
  pageNumber: number;
  widthPt: number;
  heightPt: number;
  bgColor: string;
  rects: VectorRectOp[];
  lines: VectorLineOp[];
  texts: VectorTextOp[];
}

export interface JsPdfPreviewResult {
  pageDataUrls: string[];
  vectorPages: VectorPdfPage[];
  vectorPrintHtml: string;
  totalPages: number;
  summaryCounts: {
    chaptersCount: number;
    excerptsCount: number;
    notesCount: number;
  };
}

interface PdfBlockItem {
  kind:
    | 'section-title'
    | 'outline-item'
    | 'excerpt-card'
    | 'note-card'
    | 'chapter-heading'
    | 'blockquote'
    | 'paragraph'
    | 'divider';
  title?: string;
  subtitle?: string;
  text?: string;
  noteText?: string;
  metaRight?: string;
  level?: number;
}

function cleanMarkdownLineForPdf(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function renderVectorPageToSvgString(page: VectorPdfPage, fontStack: string): string {
  const safeSvgFont = fontStack.replace(/"/g, "'");
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.widthPt} ${page.heightPt}" width="100%" height="100%" style="background:${page.bgColor};font-family:${escapeXml(safeSvgFont)};">`,
    `<rect x="0" y="0" width="${page.widthPt}" height="${page.heightPt}" fill="${page.bgColor}"/>`,
  ];

  for (const r of page.rects) {
    const fillAttr = r.fill ? `fill="${r.fill}"` : 'fill="none"';
    const strokeAttr = r.stroke
      ? `stroke="${r.stroke}" stroke-width="${r.lineWidth ?? 1}"`
      : '';
    const rxAttr = r.rx ? `rx="${r.rx}" ry="${r.rx}"` : '';
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ${rxAttr} ${fillAttr} ${strokeAttr}/>`
    );
  }

  for (const l of page.lines) {
    parts.push(
      `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${l.stroke}" stroke-width="${l.lineWidth}"/>`
    );
  }

  for (const t of page.texts) {
    const anchor =
      t.align === 'right' ? 'end' : t.align === 'center' ? 'middle' : 'start';
    const family = t.isMono
      ? "'JetBrains Mono', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', monospace, sans-serif"
      : safeSvgFont;
    parts.push(
      `<text x="${t.x}" y="${t.y}" fill="${t.color}" font-size="${t.fontSize}" font-weight="${t.fontWeight}" text-anchor="${anchor}" style="font-family:${escapeXml(family)};">${escapeXml(t.text)}</text>`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

function renderVectorPageToHtmlPrintSheet(page: VectorPdfPage, fontStack: string): string {
  const safeFont = fontStack.replace(/"/g, "'");
  const svgShapes: string[] = [
    `<svg class="sheet-bg-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.widthPt} ${page.heightPt}" preserveAspectRatio="none">`,
    `<rect x="0" y="0" width="${page.widthPt}" height="${page.heightPt}" fill="${page.bgColor}"/>`,
  ];

  for (const r of page.rects) {
    const fillAttr = r.fill ? `fill="${r.fill}"` : 'fill="none"';
    const strokeAttr = r.stroke
      ? `stroke="${r.stroke}" stroke-width="${r.lineWidth ?? 1}"`
      : '';
    const rxAttr = r.rx ? `rx="${r.rx}" ry="${r.rx}"` : '';
    svgShapes.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ${rxAttr} ${fillAttr} ${strokeAttr}/>`
    );
  }

  for (const l of page.lines) {
    svgShapes.push(
      `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${l.stroke}" stroke-width="${l.lineWidth}"/>`
    );
  }
  svgShapes.push('</svg>');

  const htmlTexts: string[] = [];
  for (const t of page.texts) {
    const leftPct = (t.x / page.widthPt) * 100;
    const topPct = ((t.y - t.fontSize * 0.84) / page.heightPt) * 100;
    const transformCss =
      t.align === 'center'
        ? 'transform:translateX(-50%);'
        : t.align === 'right'
        ? 'transform:translateX(-100%);'
        : '';
    const family = t.isMono
      ? "'JetBrains Mono', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', monospace, sans-serif"
      : safeFont;

    htmlTexts.push(
      `<span class="v-text" style="left:${leftPct.toFixed(4)}%;top:${topPct.toFixed(4)}%;font-size:${t.fontSize}pt;font-weight:${t.fontWeight};color:${t.color};font-family:${escapeHtml(family)};${transformCss}">${escapeHtml(t.text)}</span>`
    );
  }

  return `<div class="a4-vector-page" style="background:${page.bgColor};">
    ${svgShapes.join('')}
    <div class="sheet-text-layer">${htmlTexts.join('')}</div>
  </div>`;
}

function buildVectorPrintHtmlFromPages(
  vectorPages: VectorPdfPage[],
  fontStack: string,
  bgPage: string
): string {
  const cjkSystemPrintStack = `${fontStack}, "PingFang SC", "Hiragino Sans GB", "Songti SC", "Microsoft YaHei", "SimSun", "Noto Serif SC", serif`;
  const sheetsHtml = vectorPages
    .map((p) => renderVectorPageToHtmlPrintSheet(p, cjkSystemPrintStack))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>&#8203;</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 210mm;
      background: ${bgPage};
      font-family: "PingFang SC", "Hiragino Sans GB", "Songti SC", "Microsoft YaHei", "SimSun", "Noto Serif SC", serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: antialiased;
    }
    .a4-vector-page {
      position: relative;
      width: 210mm;
      height: 297mm;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      background: ${bgPage};
    }
    .a4-vector-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .sheet-bg-svg {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .sheet-text-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .v-text {
      position: absolute;
      white-space: pre;
      line-height: 1;
      user-select: text;
      -webkit-user-select: text;
    }
  </style>
</head>
<body>
  ${sheetsHtml}
</body>
</html>`;
}

export function renderJsPdfPages(
  book: Book,
  annotations: Annotation[],
  dailyStats: ReadingStatsDaily[],
  config: ExportConfig,
  maxPreviewPages = 40
): JsPdfPreviewResult {
  const showExcerpts = config.includeExcerpts ?? config.includeAnnotations;
  const showNotes = config.includeNotes ?? config.includeAnnotations;
  const showFullText = config.includeFullText;
  const showOutline = config.includeOutline;
  const showStats = config.includeStats;

  const palette = THEME_PALETTES[config.themeStyle] || THEME_PALETTES.parchment;
  const chapters = getFilteredChaptersForBook(book, config.selectedChapterIds);
  const sortedAnns = [...annotations].sort((a, b) => a.charOffset - b.charOffset);
  const notesOnly = sortedAnns.filter((a) => Boolean(a.noteText && a.noteText.trim()));
  const metrics = getBookReadingMetrics(book, dailyStats);

  const fontStack =
    config.fontStyle === 'kaiti'
      ? '"LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", serif'
      : config.fontStyle === 'sans'
      ? '"Plus Jakarta Sans", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
      : '"Noto Serif SC", "Songti SC", "Lora", Georgia, serif';

  // A4 logical dimensions at 72 DPI: 595 x 842 pt
  // No running header at the top of pages (已去掉页眉)
  const pageW = 595;
  const pageH = 842;
  const marginX = 46;
  const contentTopY = 48;
  const contentBottomY = pageH - 54;
  const contentW = pageW - marginX * 2;

  const blocks: PdfBlockItem[] = [];

  if (showOutline && chapters.length > 0) {
    blocks.push({
      kind: 'section-title',
      title: `目录大纲 (${chapters.length} 节)`,
    });
    chapters.forEach((ch, idx) => {
      blocks.push({
        kind: 'outline-item',
        title: `${String(idx + 1).padStart(2, '0')}. ${ch.title}`,
        metaRight: `${ch.wordCount.toLocaleString()} 字`,
        level: ch.level || 1,
      });
    });
  }

  if (showExcerpts && showNotes) {
    blocks.push({
      kind: 'section-title',
      title: `精选书摘与随笔笔记 (${sortedAnns.length} 条)`,
    });
    if (sortedAnns.length === 0) {
      blocks.push({
        kind: 'paragraph',
        text: '当前书籍暂无高亮书摘或随笔批注记录。可在阅读器中划选任意段落添加金句书摘与读书感悟。',
      });
    } else {
      sortedAnns.forEach((ann, idx) => {
        const dateStr = new Date(ann.createdAt).toLocaleDateString('zh-CN');
        blocks.push({
          kind: 'note-card',
          title: `#${String(idx + 1).padStart(2, '0')} · ${ann.chapterTitle}`,
          metaRight: `偏移 ${ann.charOffset} · ${dateStr}`,
          text: ann.selectedText,
          noteText: ann.noteText?.trim() || '',
        });
      });
    }
  } else if (showExcerpts) {
    blocks.push({
      kind: 'section-title',
      title: `精选书摘 (${sortedAnns.length} 条)`,
    });
    if (sortedAnns.length === 0) {
      blocks.push({
        kind: 'paragraph',
        text: '当前书籍暂无精选书摘记录。',
      });
    } else {
      sortedAnns.forEach((ann, idx) => {
        const dateStr = new Date(ann.createdAt).toLocaleDateString('zh-CN');
        blocks.push({
          kind: 'excerpt-card',
          title: `书摘 #${String(idx + 1).padStart(2, '0')} · ${ann.chapterTitle}`,
          metaRight: dateStr,
          text: ann.selectedText,
        });
      });
    }
  } else if (showNotes) {
    blocks.push({
      kind: 'section-title',
      title: `读者随笔笔记 (${notesOnly.length} 条)`,
    });
    const targetNotes = notesOnly.length > 0 ? notesOnly : sortedAnns;
    if (targetNotes.length === 0) {
      blocks.push({
        kind: 'paragraph',
        text: '当前书籍暂无随笔笔记记录。',
      });
    } else {
      targetNotes.forEach((ann, idx) => {
        const dateStr = new Date(ann.createdAt).toLocaleDateString('zh-CN');
        blocks.push({
          kind: 'note-card',
          title: `笔记 #${String(idx + 1).padStart(2, '0')} · ${ann.chapterTitle}`,
          metaRight: dateStr,
          text: ann.selectedText,
          noteText: ann.noteText?.trim() || '（原句摘录标记）',
        });
      });
    }
  }

  if (showFullText) {
    blocks.push({
      kind: 'section-title',
      title: '正文典藏',
    });

    const rawBody =
      config.selectedChapterIds.length > 0
        ? chapters.map((ch) => book.content.slice(ch.startOffset, ch.endOffset)).join('\n\n')
        : book.content;

    const rawLines = rawBody.split('\n');
    let inCodeFence = false;

    for (const rawLine of rawLines) {
      const trimmed = rawLine.trim();
      if (trimmed.startsWith('```')) {
        inCodeFence = !inCodeFence;
        continue;
      }
      if (inCodeFence) continue;
      if (!trimmed) continue;

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        blocks.push({ kind: 'divider' });
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        blocks.push({
          kind: 'chapter-heading',
          level: headingMatch[1].length,
          title: cleanMarkdownLineForPdf(headingMatch[2]),
        });
        continue;
      }

      if (trimmed.startsWith('>')) {
        blocks.push({
          kind: 'blockquote',
          text: cleanMarkdownLineForPdf(trimmed.replace(/^>\s*/, '')),
        });
        continue;
      }

      if (/^\|?[\s:|-]+\|[\s:|-]+\|?$/.test(trimmed)) {
        continue;
      }

      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => cleanMarkdownLineForPdf(c))
          .join('  ·  ');
        blocks.push({
          kind: 'blockquote',
          text: cells,
        });
        continue;
      }

      blocks.push({
        kind: 'paragraph',
        text: cleanMarkdownLineForPdf(trimmed),
      });
    }
  }

  if (blocks.length === 0) {
    blocks.push({
      kind: 'paragraph',
      text: '请在导出菜单中至少勾选一项导出内容（正文、笔记或书摘）。',
    });
  }

  // Offscreen canvas used strictly for accurate text width measurement
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = pageW;
  measureCanvas.height = 100;
  const mCtx = measureCanvas.getContext('2d');
  if (!mCtx) {
    return {
      pageDataUrls: [],
      vectorPages: [],
      vectorPrintHtml: '',
      totalPages: 0,
      summaryCounts: {
        chaptersCount: chapters.length,
        excerptsCount: sortedAnns.length,
        notesCount: notesOnly.length,
      },
    };
  }

  const vectorPages: VectorPdfPage[] = [];

  const createNewVectorPage = (
    isFirstPage: boolean
  ): { page: VectorPdfPage; startY: number } => {
    const page: VectorPdfPage = {
      pageNumber: vectorPages.length + 1,
      widthPt: pageW,
      heightPt: pageH,
      bgColor: palette.bgPage,
      rects: [
        // Subtle stationery frame (no running header!)
        {
          x: 22,
          y: 22,
          w: pageW - 44,
          h: pageH - 44,
          stroke: palette.border,
          lineWidth: 1.0,
        },
        {
          x: 26,
          y: 26,
          w: pageW - 52,
          h: pageH - 52,
          stroke: palette.border,
          lineWidth: 0.4,
        },
      ],
      lines: [],
      texts: [],
    };

    let cursorY = contentTopY;

    if (isFirstPage) {
      const bannerH = showStats ? 112 : 74;
      page.rects.push({
        x: marginX,
        y: cursorY,
        w: contentW,
        h: bannerH,
        rx: 10,
        fill: palette.bgSurface,
        stroke: palette.border,
        lineWidth: 1,
      });

      const titleDisplay =
        book.title.length > 22 ? book.title.slice(0, 22) + '…' : book.title;
      page.texts.push({
        text: `《${titleDisplay}》`,
        x: marginX + 14,
        y: cursorY + 34,
        fontSize: 20,
        fontWeight: '700',
        color: palette.textPrimary,
      });

      const selectedSummary = [
        showFullText ? '正文' : null,
        showNotes ? '笔记' : null,
        showExcerpts ? '书摘' : null,
      ]
        .filter(Boolean)
        .join(' · ');

      page.texts.push({
        text: `作者：${book.author}   ·   分类：${book.category}   ·   内容：${selectedSummary || '概览'}`,
        x: marginX + 18,
        y: cursorY + 56,
        fontSize: 10.5,
        fontWeight: '400',
        color: palette.textSecondary,
      });

      if (showStats) {
        const statY = cursorY + 70;
        const statItems = [
          { label: '阅读进度', val: `${metrics.progressPct}%` },
          { label: '总字数', val: `${book.totalChars.toLocaleString()} 字` },
          { label: '精选书摘', val: `${sortedAnns.length} 条` },
          { label: '随笔笔记', val: `${notesOnly.length} 篇` },
        ];
        const colW = (contentW - 36) / 4;
        statItems.forEach((st, idx) => {
          const sx = marginX + 18 + idx * colW;
          page.texts.push({
            text: st.val,
            x: sx,
            y: statY + 14,
            fontSize: 11.5,
            fontWeight: '700',
            color: palette.accent,
          });
          page.texts.push({
            text: st.label,
            x: sx,
            y: statY + 28,
            fontSize: 8.5,
            fontWeight: '400',
            color: palette.textMuted,
          });
        });
      }

      cursorY += bannerH + 20;
    }

    vectorPages.push(page);
    return { page, startY: cursorY };
  };

  let current = createNewVectorPage(true);
  let cursorY = current.startY;

  const ensureSpace = (neededHeight: number): boolean => {
    if (cursorY + neededHeight <= contentBottomY) {
      return true;
    }
    if (vectorPages.length >= maxPreviewPages) {
      return false;
    }
    current = createNewVectorPage(false);
    cursorY = current.startY;
    return true;
  };

  for (const block of blocks) {
    if (block.kind === 'section-title') {
      if (!ensureSpace(42)) break;
      const p = current.page;
      cursorY += 8;
      p.texts.push({
        text: block.title || '',
        x: marginX,
        y: cursorY + 14,
        fontSize: 13.5,
        fontWeight: '700',
        color: palette.accent,
      });
      p.lines.push({
        x1: marginX,
        y1: cursorY + 21,
        x2: pageW - marginX,
        y2: cursorY + 21,
        stroke: palette.border,
        lineWidth: 1,
      });
      cursorY += 32;
      continue;
    }

    if (block.kind === 'outline-item') {
      if (!ensureSpace(22)) break;
      const p = current.page;
      const indent = Math.max(0, ((block.level || 1) - 1) * 14);
      p.texts.push({
        text: block.title || '',
        x: marginX + indent,
        y: cursorY + 13,
        fontSize: 10.5,
        fontWeight: block.level === 1 ? '600' : '400',
        color: palette.textPrimary,
      });

      if (block.metaRight) {
        p.texts.push({
          text: block.metaRight,
          x: pageW - marginX,
          y: cursorY + 13,
          fontSize: 9.5,
          fontWeight: '400',
          color: palette.textMuted,
          align: 'right',
          isMono: true,
        });
      }

      p.lines.push({
        x1: marginX + indent,
        y1: cursorY + 18,
        x2: pageW - marginX,
        y2: cursorY + 18,
        stroke: palette.border,
        lineWidth: 0.4,
      });
      cursorY += 22;
      continue;
    }

    if (block.kind === 'excerpt-card' || block.kind === 'note-card') {
      mCtx.font = `400 10.5px ${fontStack}`;
      const quoteLines = wrapCanvasParagraphs(
        mCtx,
        `「${block.text || ''}」`,
        contentW - 28
      );
      let noteLines: string[] = [];
      if (block.kind === 'note-card' && block.noteText) {
        mCtx.font = `400 10px ${fontStack}`;
        noteLines = wrapCanvasParagraphs(
          mCtx,
          `随笔感悟：${block.noteText}`,
          contentW - 28
        );
      }

      const cardH =
        28 +
        quoteLines.length * 16 +
        (noteLines.length > 0 ? 10 + noteLines.length * 15 : 0) +
        12;

      if (!ensureSpace(cardH + 10)) break;
      const p = current.page;

      p.rects.push({
        x: marginX,
        y: cursorY,
        w: contentW,
        h: cardH,
        rx: 8,
        fill: palette.bgSurface,
        stroke: palette.border,
        lineWidth: 0.8,
      });

      p.texts.push({
        text: block.title || '',
        x: marginX + 14,
        y: cursorY + 17,
        fontSize: 9.5,
        fontWeight: '600',
        color: palette.accent,
      });

      if (block.metaRight) {
        p.texts.push({
          text: block.metaRight,
          x: pageW - marginX - 12,
          y: cursorY + 17,
          fontSize: 8.5,
          fontWeight: '400',
          color: palette.textMuted,
          align: 'right',
          isMono: true,
        });
      }

      let innerY = cursorY + 35;
      for (const qLine of quoteLines) {
        p.texts.push({
          text: qLine,
          x: marginX + 14,
          y: innerY,
          fontSize: 10.5,
          fontWeight: '400',
          color: palette.textPrimary,
        });
        innerY += 16;
      }

      if (noteLines.length > 0) {
        innerY += 4;
        p.lines.push({
          x1: marginX + 14,
          y1: innerY - 9,
          x2: pageW - marginX - 14,
          y2: innerY - 9,
          stroke: palette.border,
          lineWidth: 0.5,
        });

        for (const nLine of noteLines) {
          p.texts.push({
            text: nLine,
            x: marginX + 14,
            y: innerY,
            fontSize: 10,
            fontWeight: '400',
            color: palette.textSecondary,
          });
          innerY += 15;
        }
      }

      cursorY += cardH + 10;
      continue;
    }

    if (block.kind === 'chapter-heading') {
      const isH1 = (block.level || 1) === 1;
      const needed = isH1 ? 34 : 26;
      if (!ensureSpace(needed)) break;
      const p = current.page;
      cursorY += isH1 ? 8 : 4;
      p.texts.push({
        text: block.title || '',
        x: marginX,
        y: cursorY + 14,
        fontSize: isH1 ? 13 : 11.5,
        fontWeight: '700',
        color: palette.accent,
      });
      cursorY += isH1 ? 24 : 20;
      continue;
    }

    if (block.kind === 'blockquote') {
      mCtx.font = `400 10px ${fontStack}`;
      const qLines = wrapCanvasParagraphs(mCtx, block.text || '', contentW - 24);
      const boxH = qLines.length * 16 + 12;
      if (!ensureSpace(boxH + 8)) break;
      const p = current.page;

      p.rects.push({
        x: marginX,
        y: cursorY,
        w: contentW,
        h: boxH,
        rx: 6,
        fill: palette.bgSurface,
        stroke: palette.border,
        lineWidth: 0.6,
      });

      let qY = cursorY + 16;
      for (const l of qLines) {
        p.texts.push({
          text: l,
          x: marginX + 12,
          y: qY,
          fontSize: 10,
          fontWeight: '400',
          color: palette.textSecondary,
        });
        qY += 16;
      }
      cursorY += boxH + 8;
      continue;
    }

    if (block.kind === 'divider') {
      if (!ensureSpace(16)) break;
      const p = current.page;
      p.lines.push({
        x1: marginX + 60,
        y1: cursorY + 8,
        x2: pageW - marginX - 60,
        y2: cursorY + 8,
        stroke: palette.border,
        lineWidth: 0.6,
      });
      cursorY += 16;
      continue;
    }

    if (block.kind === 'paragraph') {
      const cleanPara = (block.text || '').replace(/^[\s\u3000]+/, '').replace(/\u3000/g, '  ');
      mCtx.font = `400 10.8px ${fontStack}`;
      const firstLineIndentPt = 21.6;
      // Wrap paragraph with 2-em indent on the first line using coordinate offset instead of \u3000
      const pLines = wrapCanvasParagraphs(mCtx, cleanPara, contentW - firstLineIndentPt);
      const lineH = 18.5;

      for (let lineIdx = 0; lineIdx < pLines.length; lineIdx++) {
        const line = pLines[lineIdx];
        if (!ensureSpace(lineH)) break;
        const p = current.page;
        p.texts.push({
          text: line,
          x: marginX + (lineIdx === 0 ? firstLineIndentPt : 0),
          y: cursorY + 13,
          fontSize: 10.8,
          fontWeight: '400',
          color: palette.textPrimary,
        });
        cursorY += lineH;
      }
      cursorY += 6;
    }
  }

  // Stamp clean page numbers at the bottom of each vector sheet (no running header!)
  const totalPages = vectorPages.length;
  const pageDataUrls = vectorPages.map((p, idx) => {
    const footerLineY = pageH - 42;
    p.lines.push({
      x1: marginX,
      y1: footerLineY,
      x2: pageW - marginX,
      y2: footerLineY,
      stroke: palette.border,
      lineWidth: 0.5,
    });

    p.texts.push({
      text: `${idx + 1} / ${totalPages}`,
      x: pageW / 2,
      y: pageH - 29,
      fontSize: 8.5,
      fontWeight: '600',
      color: palette.textMuted,
      align: 'center',
      isMono: true,
    });

    const svgStr = renderVectorPageToSvgString(p, fontStack);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
  });

  const vectorPrintHtml = buildVectorPrintHtmlFromPages(
    vectorPages,
    fontStack,
    palette.bgPage
  );

  return {
    pageDataUrls,
    vectorPages,
    vectorPrintHtml,
    totalPages,
    summaryCounts: {
      chaptersCount: chapters.length,
      excerptsCount: sortedAnns.length,
      notesCount: notesOnly.length,
    },
  };
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

let cachedVectorCjkFontBase64: string | null = null;
let inFlightCjkFontPromise: Promise<string | null> | null = null;

/**
 * Verifies that an ArrayBuffer is a genuine TrueType (.ttf) font with `0x00010000` or `'true'`
 * magic bytes (and NOT an OpenType CFF `.otf` `'OTTO'` or `.woff`/`.woff2` which jsPDF cannot parse).
 */
function isValidTrueTypeFontBuffer(buf: ArrayBuffer | null | undefined): buf is ArrayBuffer {
  if (!buf || buf.byteLength < 10000) return false;
  const view = new DataView(buf);
  const sfntVersion = view.getUint32(0, false);
  return sfntVersion === 0x00010000 || sfntVersion === 0x74727565;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export async function loadCjkFontBase64ForJsPdf(): Promise<string | null> {
  if (cachedVectorCjkFontBase64) return cachedVectorCjkFontBase64;
  if (inFlightCjkFontPromise) return inFlightCjkFontPromise;

  inFlightCjkFontPromise = (async () => {
    // 1. Check if the user has uploaded a valid TrueType (.ttf) font in IndexedDB
    try {
      const dbReq = indexedDB.open('roast_reed_db', 1);
      const customFontBuf = await new Promise<ArrayBuffer | null>((resolve) => {
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          if (!db.objectStoreNames.contains('custom_fonts')) {
            resolve(null);
            return;
          }
          const tx = db.transaction('custom_fonts', 'readonly');
          const store = tx.objectStore('custom_fonts');
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            const list = getAll.result as { data?: ArrayBuffer; format?: string }[];
            const validTtf = list?.find((item) => isValidTrueTypeFontBuffer(item.data));
            resolve(validTtf?.data || null);
          };
          getAll.onerror = () => resolve(null);
        };
        dbReq.onerror = () => resolve(null);
      });

      if (isValidTrueTypeFontBuffer(customFontBuf)) {
        cachedVectorCjkFontBase64 = arrayBufferToBase64(customFontBuf);
        return cachedVectorCjkFontBase64;
      }
    } catch {
      // ignore IndexedDB error
    }

    // 2. Fetch a genuine TrueType (.ttf) Simplified Chinese font (magic 0x00010000) for jsPDF Identity-H Unicode embedding
    const trueTypeCdnUrls = [
      'https://fonts.gstatic.com/s/notosanssc/v37/k3kCo84MPvpLmixcA63oeAL7Iqp5IZJF9bmaG9_FnYxNbPzS5HE.ttf',
      'https://fonts.gstatic.com/s/notoserifsc/v31/H4cyBXePl9DZ0Xe7gG9cyOj7uK2-n-D2rd4FY7SCqyWv.ttf',
    ];

    for (const url of trueTypeCdnUrls) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (isValidTrueTypeFontBuffer(buf)) {
            cachedVectorCjkFontBase64 = arrayBufferToBase64(buf);
            return cachedVectorCjkFontBase64;
          }
        }
      } catch {
        // try next TrueType mirror
      }
    }

    return null;
  })().finally(() => {
    inFlightCjkFontPromise = null;
  });

  return inFlightCjkFontPromise;
}

export function warmUpCjkPdfFont(): void {
  loadCjkFontBase64ForJsPdf().catch(() => {
    // ignore background warm-up error
  });
}

/**
 * Generates a 100% Vector Text multi-page A4 PDF (`.pdf`) with zero running headers and zero garbled characters.
 * - Embeds a verified TrueType (`.ttf`) CJK font with Identity-H / ToUnicode CMap in jsPDF (`pdf.text`),
 *   or falls back to the browser's native vector PDF print engine (`printDocumentViaHiddenIframe`).
 */
export async function exportBookWithJsPdf(
  book: Book,
  annotations: Annotation[],
  dailyStats: ReadingStatsDaily[],
  config: ExportConfig
): Promise<JsPdfPreviewResult> {
  const rendered = renderJsPdfPages(book, annotations, dailyStats, config, 80);

  const safeTitle = (book.title || '典藏手稿').replace(/[\\/:*?"<>|]/g, '');
  const parts: string[] = [];
  if (config.includeFullText) parts.push('正文');
  if (config.includeNotes ?? config.includeAnnotations) parts.push('笔记');
  if (config.includeExcerpts ?? config.includeAnnotations) parts.push('书摘');
  const suffix = parts.length > 0 ? parts.join('+') : '典藏';

  const fontBase64 = await loadCjkFontBase64ForJsPdf();
  if (fontBase64) {
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4',
        compress: true,
      });

      // Register the TrueType font ONLY ONCE as 'normal' to prevent jsPDF subsetter CMap collisions
      pdf.addFileToVFS('VectorCJK.ttf', fontBase64);
      pdf.addFont('VectorCJK.ttf', 'VectorCJK', 'normal', 'Identity-H');
      pdf.setFont('VectorCJK', 'normal');

      pdf.setProperties({
        title: `《${book.title}》`,
        subject: '矢量文字导出',
        author: book.author,
      });

      rendered.vectorPages.forEach((vp, pageIdx) => {
        if (pageIdx > 0) {
          pdf.addPage('a4', 'portrait');
        }

        // 1. Vector Background
        const [bgR, bgG, bgB] = hexToRgbTuple(vp.bgColor);
        pdf.setFillColor(bgR, bgG, bgB);
        pdf.rect(0, 0, vp.widthPt, vp.heightPt, 'F');

        // 2. Vector Rectangles & Borders
        for (const r of vp.rects) {
          if (r.fill) {
            const [fr, fg, fb] = hexToRgbTuple(r.fill);
            pdf.setFillColor(fr, fg, fb);
          }
          if (r.stroke) {
            const [sr, sg, sb] = hexToRgbTuple(r.stroke);
            pdf.setDrawColor(sr, sg, sb);
            pdf.setLineWidth(r.lineWidth ?? 1);
          }
          const style = r.fill && r.stroke ? 'FD' : r.fill ? 'F' : 'S';
          if (r.rx && r.rx > 0) {
            pdf.roundedRect(r.x, r.y, r.w, r.h, r.rx, r.rx, style);
          } else {
            pdf.rect(r.x, r.y, r.w, r.h, style);
          }
        }

        // 3. Vector Lines
        for (const l of vp.lines) {
          const [lr, lg, lb] = hexToRgbTuple(l.stroke);
          pdf.setDrawColor(lr, lg, lb);
          pdf.setLineWidth(l.lineWidth);
          pdf.line(l.x1, l.y1, l.x2, l.y2);
        }

        // 4. True Vector Text (`pdf.text` with single Identity-H Unicode TTF font)
        for (const t of vp.texts) {
          const cleanText = (t.text || '').replace(/\u3000/g, '  ');
          if (!cleanText) continue;
          const [tr, tg, tb] = hexToRgbTuple(t.color);
          pdf.setTextColor(tr, tg, tb);
          pdf.setFont('VectorCJK', 'normal');
          pdf.setFontSize(t.fontSize);
          pdf.text(cleanText, t.x, t.y, {
            align: t.align || 'left',
          });
        }
      });

      pdf.save(`${safeTitle}-${suffix}.pdf`);
      return rendered;
    } catch {
      // Fall through to native vector print engine if jsPDF encounters any font error
    }
  }

  // Fallback when offline without cached CJK TTF: use browser native vector PDF print engine
  printDocumentViaHiddenIframe(rendered.vectorPrintHtml);
  return rendered;
}



