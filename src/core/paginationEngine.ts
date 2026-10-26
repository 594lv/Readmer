import { Chapter, ReaderSettings } from '../types/reader';
import {
  ParsedMarkdownBlock,
  ParsedMarkdownBlockType,
  parseDocumentWithMarkdownIt,
  renderInlineMarkdown,
} from './parserEngine';

export type PageBlockType = ParsedMarkdownBlockType;
export type PageBlock = ParsedMarkdownBlock;

export interface VirtualPage {
  pageNumber: number; // 1-indexed
  startOffset: number;
  endOffset: number;
  paragraphs: PageBlock[];
  chapterTitle: string;
}

export interface PaginationDimension {
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Estimates how many vertical text-line equivalents a ParsedMarkdownBlock occupies,
 * dynamically adapting to the current page width and line height so charts and tables
 * never overflow or overlap across small, medium, or double-page window sizes.
 */
function estimateBlockLines(
  block: PageBlock,
  charsPerLine: number,
  indentFirstLine: boolean,
  spacingLines: number,
  lineHeightPx = 28
): number {
  switch (block.type) {
    case 'mermaid': {
      const rawLines = block.text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('%%'));
      const isHorizontal = /^(?:flowchart|graph)\s+(?:LR|RL)/i.test(rawLines[0] || '');
      const statementCount = Math.max(2, rawLines.length - 1);
      const isMobile = charsPerLine < 26;
      // On mobile viewports, diagrams are rendered in vertical TD orientation with compact padding
      const estimatedDiagramPx = isMobile
        ? Math.min(240, 85 + statementCount * 26)
        : isHorizontal
        ? Math.min(260, 120 + statementCount * 20)
        : Math.min(300, 130 + statementCount * 28);
      const neededLines =
        (estimatedDiagramPx / Math.max(20, lineHeightPx)) +
        spacingLines +
        0.4;
      return Math.max(5.0, neededLines);
    }
    case 'table': {
      const colCount = Math.max(1, block.tableHeaders?.length || 3);
      const charsPerCell = Math.max(4, Math.floor((charsPerLine - colCount * 2) / colCount));
      let totalTableLines = 2.4; // header + borders
      const rows = block.tableRows || [];
      for (const row of rows) {
        let maxRowLines = 1;
        for (const cell of row) {
          const cellLines = Math.max(1, Math.ceil((cell || '').length / charsPerCell));
          if (cellLines > maxRowLines) maxRowLines = cellLines;
        }
        totalTableLines += maxRowLines * 1.45 + 0.45;
      }
      return totalTableLines + spacingLines;
    }
    case 'code': {
      const lines = block.text.split('\n').length;
      return Math.min(16, lines * 1.25 + 2.4) + spacingLines;
    }
    case 'blockquote': {
      const lines = Math.max(1, Math.ceil(block.text.length / Math.max(10, charsPerLine - 4)));
      return lines + 1.8 + spacingLines;
    }
    case 'list': {
      const items = block.listItems || [];
      let total = 0.6;
      for (const item of items) {
        total += Math.max(1, Math.ceil(item.text.length / Math.max(10, charsPerLine - 3))) + 0.4;
      }
      return total + spacingLines;
    }
    case 'hr':
      return 1.5;
    case 'heading': {
      const lines = Math.max(1, Math.ceil(block.text.length / Math.max(10, charsPerLine * 0.72)));
      return lines + 1.2 + spacingLines;
    }
    case 'paragraph':
    default: {
      const indent = indentFirstLine && !block.isContinuation ? 2 : 0;
      const lines = Math.max(1, Math.ceil((block.text.length + indent) / charsPerLine));
      return lines + spacingLines;
    }
  }
}

function isInsideMarkdownDelimiter(text: string, idx: number): boolean {
  const prefix = text.slice(0, idx);
  const backticks = (prefix.match(/`/g) || []).length;
  if (backticks % 2 !== 0) return true;
  const asterisks = (prefix.match(/\*/g) || []).length;
  if (asterisks % 2 !== 0) return true;
  return false;
}

/**
 * Finds a safe split index near `targetLength` at a natural CJK/English sentence boundary
 * so inline Markdown (`**bold**`, `*italic*`, `` `code` ``) and words are never cut in half.
 */
function findSafeSentenceSplitLength(
  text: string,
  targetLength: number,
  charsPerLine = 20
): number {
  if (targetLength >= text.length) return text.length;
  // Look back at most one line width (approx charsPerLine) to find a punctuation boundary,
  // preventing massive blank whitespace at the bottom of the page.
  const lookbackSpan = Math.min(charsPerLine, Math.max(10, Math.floor(charsPerLine * 0.85)));
  const minLookback = Math.max(8, targetLength - lookbackSpan);

  // 1. First priority: strong sentence-ending punctuation (period, exclamation, question mark, ellipsis)
  const sentencePunct = '。！？；…\n.!?';
  for (let i = targetLength; i >= minLookback; i--) {
    if (sentencePunct.includes(text[i - 1])) {
      if (!isInsideMarkdownDelimiter(text, i)) {
        return i;
      }
    }
  }

  // 2. Second priority: clause-ending punctuation (comma, colon, dash, quotes, brackets)
  const clausePunct = '，、：:—“”‘’()（）';
  for (let i = targetLength; i >= minLookback; i--) {
    if (clausePunct.includes(text[i - 1])) {
      if (!isInsideMarkdownDelimiter(text, i)) {
        return i;
      }
    }
  }

  // 3. Third priority: space delimiter for Latin text
  for (let i = targetLength; i >= minLookback; i--) {
    if (text[i - 1] === ' ') {
      return i;
    }
  }

  // 4. Default: split at targetLength safely without breaking inside markdown delimiters
  let safeIdx = targetLength;
  while (safeIdx > minLookback && isInsideMarkdownDelimiter(text, safeIdx)) {
    safeIdx--;
  }
  return safeIdx;
}

/**
 * Computes virtual pages from raw book content using markdown-it AST blocks (`parseDocumentWithMarkdownIt`).
 * Tightly packs paragraphs across page boundaries so the text completely fills the reading window
 * down to the bottom margin without artificial whitespace or overflowing.
 */
export function paginateBookContent(
  content: string,
  chapters: Chapter[],
  settings: ReaderSettings,
  dimension: PaginationDimension,
  isSpreadMode: boolean
): VirtualPage[] {
  if (!content || content.length === 0) {
    return [
      {
        pageNumber: 1,
        startOffset: 0,
        endOffset: 0,
        paragraphs: [
          {
            type: 'paragraph',
            text: '（空文档）',
            html: '（空文档）',
            isHeading: false,
            startOffset: 0,
            endOffset: 0,
          },
        ],
        chapterTitle: '正文',
      },
    ];
  }

  const isMobile = dimension.viewportWidth < 640;
  // In single-page mode, redundant side margins are removed in ReaderView
  // so text automatically fills the canvas without artificial 768px clamping
  const horizontalPadding = isSpreadMode
    ? (isMobile ? 52 : Math.max(36, settings.pageMargin * 2))
    : (isMobile ? 24 : Math.max(20, Math.min(settings.pageMargin, 36)));
  const singlePageWidth = isSpreadMode
    ? Math.max(240, (Math.min(1280, dimension.viewportWidth) - horizontalPadding - 48) / 2)
    : Math.max(260, dimension.viewportWidth - horizontalPadding);

  // Vertical chrome calculation:
  // Mobile: top bar 52px, card padding (~24px), header 20px, footer 20px, margin 8px = ~124px.
  // Desktop: top bar 52px, footer bar 52px, card padding (~30px), header/footer/margins = ~164px.
  const verticalChrome = isMobile ? 124 : 164;
  const usableHeight = Math.max(240, dimension.viewportHeight - verticalChrome);

  // In CJK typography, character glyphs are square with 1em width.
  const effectiveCharWidth = settings.fontSize * (1.0 + Math.max(0, settings.letterSpacing));
  const charsPerLine = Math.max(12, Math.floor(singlePageWidth / effectiveCharWidth));
  const lineHeightPx = settings.fontSize * settings.lineHeight;
  const maxLinesPerPage = Math.max(6, Math.floor(usableHeight / lineHeightPx));
  const spacingLines = settings.paragraphSpacing / lineHeightPx;

  const blocks = parseDocumentWithMarkdownIt(content);
  const pages: VirtualPage[] = [];

  let currentBlocks: PageBlock[] = [];
  let currentLinesUsed = 0;
  let pageStartOffset = 0;

  const flushPage = (endOffset: number) => {
    if (currentBlocks.length === 0) return;
    const chapterTitle = findChapterTitleAtOffset(chapters, pageStartOffset);
    const safeEnd = Math.max(pageStartOffset + 1, endOffset);
    pages.push({
      pageNumber: pages.length + 1,
      startOffset: pageStartOffset,
      endOffset: safeEnd,
      paragraphs: currentBlocks,
      chapterTitle,
    });
    currentBlocks = [];
    currentLinesUsed = 0;
    pageStartOffset = safeEnd;
  };

  for (let i = 0; i < blocks.length; i++) {
    let block: PageBlock = blocks[i];

    // 1. Chapter heading: only level 1 major chapters (# 第一章) start on a fresh page
    if (
      block.type === 'heading' &&
      block.level === 1 &&
      currentBlocks.length > 0 &&
      currentLinesUsed >= 3
    ) {
      flushPage(block.startOffset);
    }

    // 2. Headings: avoid orphan headings at the very bottom line of a page
    if (block.type === 'heading') {
      const headingLines = estimateBlockLines(block, charsPerLine, false, spacingLines, lineHeightPx);
      if (currentBlocks.length > 0 && currentLinesUsed + headingLines + 2 > maxLinesPerPage) {
        flushPage(block.startOffset);
      }
      currentBlocks.push(block);
      currentLinesUsed += headingLines;
      continue;
    }

    // 3. Non-paragraph atomic blocks (mermaid diagrams, tables, code, blockquotes, lists, hr):
    if (block.type !== 'paragraph') {
      const neededLines = estimateBlockLines(
        block,
        charsPerLine,
        settings.indentFirstLine,
        spacingLines,
        lineHeightPx
      );
      if (currentBlocks.length > 0 && currentLinesUsed + neededLines > maxLinesPerPage) {
        flushPage(block.startOffset);
      }
      currentBlocks.push(block);
      currentLinesUsed += neededLines;
      if (currentLinesUsed >= maxLinesPerPage && i < blocks.length - 1) {
        flushPage(block.endOffset);
      }
      continue;
    }

    // 4. Paragraph blocks: tightly pack and fill down to the bottom of the page
    while (block && block.text.length > 0) {
      const neededLines = estimateBlockLines(
        block,
        charsPerLine,
        settings.indentFirstLine,
        spacingLines,
        lineHeightPx
      );
      const remainingLines = maxLinesPerPage - currentLinesUsed;

      // Case A: Fits entirely into the remaining lines (with 0.6 line sub-pixel margin tolerance)
      if (neededLines <= remainingLines + 0.6) {
        currentBlocks.push(block);
        currentLinesUsed += neededLines;
        if (currentLinesUsed >= maxLinesPerPage && i < blocks.length - 1) {
          flushPage(block.endOffset);
        }
        break;
      }

      // Case B: Does not fit entirely. Can we split to fill the remaining lines?
      if (remainingLines >= 1.0) {
        const indentChars = settings.indentFirstLine && !block.isContinuation ? 2 : 0;
        const usableTextLines = Math.max(1, remainingLines - spacingLines);
        const approxTargetChars = Math.floor(usableTextLines * charsPerLine - indentChars);
        const safeTarget = Math.min(block.text.length - 1, approxTargetChars);
        const splitIdx = findSafeSentenceSplitLength(block.text, safeTarget, charsPerLine);

        const minAcceptableChars = Math.max(6, Math.floor(charsPerLine * 0.4));
        if (splitIdx >= minAcceptableChars && splitIdx < block.text.length) {
          const sliceText = block.text.slice(0, splitIdx);
          const remainderText = block.text.slice(splitIdx);
          const sliceEndOffset = block.startOffset + sliceText.length;

          currentBlocks.push({
            type: 'paragraph',
            text: sliceText,
            html: renderInlineMarkdown(sliceText),
            isHeading: false,
            isContinuation: block.isContinuation,
            startOffset: block.startOffset,
            endOffset: sliceEndOffset,
          });

          const sliceLines = estimateBlockLines(
            currentBlocks[currentBlocks.length - 1],
            charsPerLine,
            settings.indentFirstLine,
            spacingLines,
            lineHeightPx
          );
          currentLinesUsed += sliceLines;

          flushPage(sliceEndOffset);

          block = {
            type: 'paragraph',
            text: remainderText,
            html: renderInlineMarkdown(remainderText),
            isHeading: false,
            isContinuation: true,
            startOffset: sliceEndOffset,
            endOffset: block.endOffset,
          };
          continue;
        }
      }

      // Case C: Less than 1 line remaining on current page -> flush page
      if (currentBlocks.length > 0) {
        flushPage(block.startOffset);
        continue;
      }

      // Case D: Single oversized paragraph that exceeds an entire fresh page on its own
      const indentChars = settings.indentFirstLine && !block.isContinuation ? 2 : 0;
      const usableTextLines = Math.max(2, maxLinesPerPage - spacingLines);
      const approxTargetChars = Math.floor(usableTextLines * charsPerLine - indentChars);
      const safeTarget = Math.min(block.text.length - 1, approxTargetChars);
      const splitIdx = findSafeSentenceSplitLength(block.text, safeTarget, charsPerLine);
      const safeSplit =
        splitIdx > 0 && splitIdx < block.text.length ? splitIdx : Math.max(12, safeTarget);

      const sliceText = block.text.slice(0, safeSplit);
      const remainderText = block.text.slice(safeSplit);
      const sliceEndOffset = block.startOffset + sliceText.length;

      currentBlocks.push({
        type: 'paragraph',
        text: sliceText,
        html: renderInlineMarkdown(sliceText),
        isHeading: false,
        isContinuation: block.isContinuation,
        startOffset: block.startOffset,
        endOffset: sliceEndOffset,
      });

      flushPage(sliceEndOffset);

      block = {
        type: 'paragraph',
        text: remainderText,
        html: renderInlineMarkdown(remainderText),
        isHeading: false,
        isContinuation: true,
        startOffset: sliceEndOffset,
        endOffset: block.endOffset,
      };
    }
  }

  if (currentBlocks.length > 0) {
    flushPage(content.length);
  }

  return pages.length > 0
    ? pages
    : [
        {
          pageNumber: 1,
          startOffset: 0,
          endOffset: content.length,
          paragraphs: [
            {
              type: 'paragraph',
              text: content,
              html: renderInlineMarkdown(content),
              isHeading: false,
              startOffset: 0,
              endOffset: content.length,
            },
          ],
          chapterTitle: chapters[0]?.title || '正文',
        },
      ];
}

export function findPageIndexForOffset(pages: VirtualPage[], offset: number): number {
  if (pages.length <= 1) return 0;
  if (offset <= 0) return 0;

  for (let i = 0; i < pages.length; i++) {
    const isLast = i === pages.length - 1;
    if (offset >= pages[i].startOffset && (offset < pages[i].endOffset || isLast)) {
      return i;
    }
  }
  return pages.length - 1;
}

export function findChapterTitleAtOffset(chapters: Chapter[], offset: number): string {
  if (!chapters || chapters.length === 0) return '正文';
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (offset >= chapters[i].startOffset) {
      return chapters[i].title;
    }
  }
  return chapters[0].title;
}
