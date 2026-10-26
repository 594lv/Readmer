import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignJustify,
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Columns2,
  Download,
  Eye,
  Feather,
  FileText,
  Flame,
  Gauge,
  Hash,
  Image as ImageIcon,
  Indent,
  List,
  Lock,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Printer,
  ScrollText,
  Search,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Type,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import {
  Annotation,
  Book,
  Chapter,
  CustomFont,
  HighlightColor,
  LayoutMode,
  ReaderSettings,
  ReaderTheme,
  ReadingStatsDaily,
} from '../types/reader';
import {
  findChapterTitleAtOffset,
  findPageIndexForOffset,
  paginateBookContent,
  VirtualPage,
} from '../core/paginationEngine';
import {
  DEFAULT_EXPORT_CONFIG,
  exportBookWithJsPdf,
  ExportConfig,
  ExportFormat,
  ExportThemeStyle,
  printDocumentViaHiddenIframe,
  renderJsPdfPages,
  warmUpCjkPdfFont,
} from '../core/exportEngine';
import { extractChapters } from '../core/parserEngine';
import { ExportStudioModal } from './ExportStudioModal';
import { MarkdownBlockRenderer } from './MarkdownRenderer';
import { QuoteCardModal } from './QuoteCardModal';

const READER_THEME_OPTIONS: {
  id: ReaderTheme;
  label: string;
  fullTitle: string;
  icon: React.FC<{ className?: string }>;
  bgHex: string;
  textHex: string;
  accentHex: string;
}[] = [
  {
    id: 'cafe',
    label: '暖咖',
    fullTitle: '暖调纸张',
    icon: Sun,
    bgHex: '#FBF7F0',
    textHex: '#2C1E16',
    accentHex: '#B4532A',
  },
  {
    id: 'cream',
    label: '奶油',
    fullTitle: '午后奶油',
    icon: Coffee,
    bgHex: '#FAF3E6',
    textHex: '#3A2518',
    accentHex: '#C26A32',
  },
  {
    id: 'sandalwood',
    label: '宣纸',
    fullTitle: '古籍宣纸',
    icon: Feather,
    bgHex: '#F5EBDC',
    textHex: '#2F2014',
    accentHex: '#A83E26',
  },
  {
    id: 'candlelight',
    label: '烛光',
    fullTitle: '烛光暮读',
    icon: Flame,
    bgHex: '#2E221A',
    textHex: '#ECDCC8',
    accentHex: '#E08E45',
  },
  {
    id: 'night',
    label: '夜读',
    fullTitle: '夜间暗色',
    icon: Moon,
    bgHex: '#1C1613',
    textHex: '#E6DCD2',
    accentHex: '#D97724',
  },
  {
    id: 'eink',
    label: '墨水',
    fullTitle: '电子墨水',
    icon: Sparkles,
    bgHex: '#F5F5F0',
    textHex: '#111111',
    accentHex: '#111111',
  },
];

const FONT_SIZE_PRESETS = [
  { label: '小号', size: 15 },
  { label: '标准', size: 18 },
  { label: '舒适', size: 21 },
  { label: '大字', size: 24 },
] as const;

interface ReaderViewProps {
  book: Book;
  annotations: Annotation[];
  customFonts: CustomFont[];
  settings: ReaderSettings;
  dailyStats: ReadingStatsDaily[];
  onBackToShelf: () => void;
  onUpdateBookOffset: (
    bookId: string,
    newOffset: number,
    secondsDelta?: number,
    charsDelta?: number
  ) => void;
  onUpdateSettings: (partial: Partial<ReaderSettings>) => void;
  onAddAnnotation: (ann: Omit<Annotation, 'id' | 'createdAt'>) => void;
  onDeleteAnnotation: (annId: string) => void;
  onUploadCustomFont: (file: File) => Promise<void>;
  onLockVault?: () => void;
  onToggleBookPrivacy?: (bookId: string) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  annotations,
  customFonts,
  settings,
  dailyStats,
  onBackToShelf,
  onUpdateBookOffset,
  onUpdateSettings,
  onAddAnnotation,
  onDeleteAnnotation,
  onUploadCustomFont,
  onLockVault,
  onToggleBookPrivacy,
}) => {
  const [chromeVisible, setChromeVisible] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'toc' | 'settings'>('none');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportInitialFormat, setExportInitialFormat] = useState<ExportFormat>('pdf');
  const [quickPdfConfig, setQuickPdfConfig] = useState<ExportConfig>({
    ...DEFAULT_EXPORT_CONFIG,
    format: 'pdf',
    includeFullText: true,
    includeNotes: true,
    includeExcerpts: true,
    includeOutline: true,
    includeStats: true,
    themeStyle: 'parchment',
    fontStyle: 'serif',
  });
  const [quickPdfFeedback, setQuickPdfFeedback] = useState<string | null>(null);
  const [quoteCardTarget, setQuoteCardTarget] = useState<{
    chapterTitle: string;
    selectedText: string;
    noteText?: string;
  } | null>(null);
  const [outlineOpen, setOutlineOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1180 : false
  );
  const [tocTab, setTocTab] = useState<'chapters' | 'annotations'>('chapters');
  const [chapterSearch, setChapterSearch] = useState('');
  const [einkFlashing, setEinkFlashing] = useState(false);
  const [autoFlipProgress, setAutoFlipProgress] = useState(0);
  const [isAutoPausedByHover, setIsAutoPausedByHover] = useState(false);
  const [scrubberVisible, setScrubberVisible] = useState(false);
  const touchStartPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchSwipedRef = useRef(false);

  const [selectionState, setSelectionState] = useState<{
    text: string;
    offset: number;
    chapterTitle: string;
  } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [selectedColor, setSelectedColor] = useState<HighlightColor>('amber');

  const [viewportDim, setViewportDim] = useState<{
    viewportWidth: number;
    viewportHeight: number;
  }>({
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const readerCanvasRef = useRef<HTMLElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const lastTrackedOffsetRef = useRef<number>(book.currentOffset);

  const [mermaidContainerWidth, setMermaidContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.min(600, window.innerWidth) : 600
  );
  const [forceMermaidTD, setForceMermaidTD] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportDim({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Automatically parse hierarchical Markdown headings (#, ##, ###, ####) & chapters for the Outline
  const outlineHeadings: Chapter[] = useMemo(() => {
    const parsed = extractChapters(book.content, book.format);
    return parsed.length > 0 ? parsed : book.chapters;
  }, [book.content, book.format, book.chapters]);

  const isDesktopSplitOutline = outlineOpen && viewportDim.viewportWidth >= 1024;
  const effectiveCanvasWidth = isDesktopSplitOutline
    ? Math.max(320, viewportDim.viewportWidth - 272)
    : viewportDim.viewportWidth;

  const isSpreadMode =
    settings.layoutMode === 'paginated-double' &&
    effectiveCanvasWidth >= 920 &&
    viewportDim.viewportHeight >= 520;
  const isPaginated = settings.layoutMode !== 'scroll';
  const isSinglePage = !isSpreadMode;

  const virtualPages = useMemo(() => {
    return paginateBookContent(
      book.content,
      outlineHeadings,
      settings,
      {
        viewportWidth: effectiveCanvasWidth,
        viewportHeight: viewportDim.viewportHeight,
      },
      isSpreadMode
    );
  }, [
    book.content,
    outlineHeadings,
    settings,
    effectiveCanvasWidth,
    viewportDim.viewportHeight,
    isSpreadMode,
  ]);

  const pageStep = isSpreadMode ? 2 : 1;
  const totalPages = virtualPages.length;

  const [pageIndex, setPageIndex] = useState<number>(() => {
    const raw = findPageIndexForOffset(virtualPages, book.currentOffset);
    return isSpreadMode && raw % 2 === 1 ? Math.max(0, raw - 1) : raw;
  });

  useEffect(() => {
    const raw = findPageIndexForOffset(virtualPages, book.currentOffset);
    const aligned = isSpreadMode && raw % 2 === 1 ? Math.max(0, raw - 1) : raw;
    setPageIndex(Math.max(0, Math.min(virtualPages.length - 1, aligned)));
  }, [virtualPages.length, isSpreadMode, book.id]);

  // ResizeObserver for Mermaid containers inside ReaderView:
  // When observed container width < 300px, automatically switch Mermaid direction to TD (Top-Down)
  // and strictly clamp chart max-width to viewport width (100vw).
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const canvasEl = readerCanvasRef.current;
    if (!canvasEl) return;

    const updateFromObservedElements = (entries?: ResizeObserverEntry[]) => {
      const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const mermaidEls = Array.from(
        canvasEl.querySelectorAll<HTMLElement>('.reader-mermaid-container')
      );

      // Force max-width to viewport width on every Mermaid container in ReaderView
      mermaidEls.forEach((el) => {
        el.style.maxWidth = 'min(100%, 100vw)';
      });

      let measuredWidth = 0;
      if (entries && entries.length > 0) {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0 && (measuredWidth === 0 || w < measuredWidth)) {
            measuredWidth = w;
          }
        }
      }

      if (measuredWidth <= 0) {
        const firstMermaid = mermaidEls[0];
        const colEl = canvasEl.querySelector<HTMLElement>('[data-reader-column="true"]');
        measuredWidth =
          firstMermaid?.clientWidth ||
          colEl?.clientWidth ||
          Math.max(180, canvasEl.clientWidth - settings.pageMargin * 2);
      }

      const clampedW = Math.min(measuredWidth, viewportW);
      if (clampedW > 0) {
        setMermaidContainerWidth(Math.round(clampedW));
        setForceMermaidTD(clampedW < 540 || viewportW < 640);
      }
    };

    const observer = new ResizeObserver((entries) => {
      updateFromObservedElements(entries);
    });

    observer.observe(canvasEl);
    const colEls = canvasEl.querySelectorAll<HTMLElement>('[data-reader-column="true"]');
    colEls.forEach((el) => observer.observe(el));
    const mermaidEls = canvasEl.querySelectorAll<HTMLElement>('.reader-mermaid-container');
    mermaidEls.forEach((el) => observer.observe(el));

    updateFromObservedElements();

    return () => observer.disconnect();
  }, [pageIndex, isSpreadMode, isPaginated, settings.pageMargin, viewportDim.viewportWidth]);

  const triggerEinkRefreshIfNeeded = useCallback(() => {
    if (settings.theme === 'eink' && settings.einkFlashRefresh) {
      setEinkFlashing(true);
      setTimeout(() => setEinkFlashing(false), 230);
    }
  }, [settings.theme, settings.einkFlashRefresh]);

  const goToPageIndex = useCallback(
    (targetIdx: number) => {
      if (totalPages === 0) return;
      const clampedIdx = Math.max(0, Math.min(totalPages - 1, targetIdx));
      const alignedIdx =
        isSpreadMode && clampedIdx % 2 === 1 ? Math.max(0, clampedIdx - 1) : clampedIdx;
      const targetPage = virtualPages[alignedIdx];
      if (!targetPage) return;

      setPageIndex(alignedIdx);
      triggerEinkRefreshIfNeeded();

      const charsDelta = Math.max(
        0,
        Math.min(1800, Math.abs(targetPage.startOffset - lastTrackedOffsetRef.current))
      );
      lastTrackedOffsetRef.current = targetPage.startOffset;
      onUpdateBookOffset(book.id, targetPage.startOffset, 0, charsDelta);
      setAutoFlipProgress(0);
    },
    [
      totalPages,
      isSpreadMode,
      virtualPages,
      triggerEinkRefreshIfNeeded,
      onUpdateBookOffset,
      book.id,
    ]
  );

  const jumpToCharOffset = useCallback(
    (charOffset: number) => {
      const targetIdx = findPageIndexForOffset(virtualPages, charOffset);
      goToPageIndex(targetIdx);
      if (!isPaginated && scrollContainerRef.current && book.totalChars > 0) {
        const el = scrollContainerRef.current;
        const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
        el.scrollTo({
          top: (charOffset / book.totalChars) * maxScroll,
          behavior: 'smooth',
        });
      }
      if (viewportDim.viewportWidth < 1024) {
        setOutlineOpen(false);
      }
    },
    [virtualPages, goToPageIndex, isPaginated, book.totalChars, viewportDim.viewportWidth]
  );

  const handleNextPage = useCallback(() => {
    if (!isPaginated) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollBy({
          top: viewportDim.viewportHeight * 0.75,
          behavior: 'smooth',
        });
      }
      return;
    }
    if (pageIndex + pageStep < totalPages) {
      goToPageIndex(pageIndex + pageStep);
    }
  }, [isPaginated, pageIndex, pageStep, totalPages, goToPageIndex, viewportDim.viewportHeight]);

  const handlePrevPage = useCallback(() => {
    if (!isPaginated) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollBy({
          top: -viewportDim.viewportHeight * 0.75,
          behavior: 'smooth',
        });
      }
      return;
    }
    if (pageIndex - pageStep >= 0) {
      goToPageIndex(pageIndex - pageStep);
    }
  }, [isPaginated, pageIndex, pageStep, goToPageIndex, viewportDim.viewportHeight]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return;
      onUpdateBookOffset(book.id, book.currentOffset, 5, 0);
    }, 5000);
    return () => clearInterval(interval);
  }, [book.id, book.currentOffset, onUpdateBookOffset]);

  useEffect(() => {
    if (!settings.autoFlipEnabled || isAutoPausedByHover || activeDrawer !== 'none') {
      return;
    }

    if (!isPaginated) {
      let lastTime = performance.now();
      let animId: number;
      let accumulatedChars = 0;

      const stepScroll = (now: number) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        const container = scrollContainerRef.current;
        if (container) {
          const deltaPx = settings.autoScrollSpeed * dt;
          container.scrollTop += deltaPx;
          accumulatedChars += deltaPx * 0.4;
          const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
          const ratio = Math.min(1, container.scrollTop / maxScroll);
          const estimatedOffset = Math.floor(ratio * book.totalChars);
          if (accumulatedChars >= 60) {
            onUpdateBookOffset(book.id, estimatedOffset, 0, Math.round(accumulatedChars));
            accumulatedChars = 0;
          }
        }
        animId = requestAnimationFrame(stepScroll);
      };

      animId = requestAnimationFrame(stepScroll);
      return () => cancelAnimationFrame(animId);
    } else {
      const intervalMs = Math.max(3, settings.autoFlipPageInterval) * 1000;
      const tickMs = 100;
      const increment = (tickMs / intervalMs) * 100;

      const timer = setInterval(() => {
        setAutoFlipProgress((prev) => {
          if (prev + increment >= 100) {
            handleNextPage();
            return 0;
          }
          return prev + increment;
        });
      }, tickMs);

      return () => clearInterval(timer);
    }
  }, [
    settings.autoFlipEnabled,
    settings.autoScrollSpeed,
    settings.autoFlipPageInterval,
    isAutoPausedByHover,
    activeDrawer,
    isPaginated,
    book.id,
    book.totalChars,
    onUpdateBookOffset,
    handleNextPage,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        onUpdateSettings({ autoFlipEnabled: !settings.autoFlipEnabled });
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 1) });
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        onUpdateSettings({ fontSize: Math.min(30, settings.fontSize + 1) });
      } else if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onUpdateSettings({ fontSize: 18 });
      } else if (e.key === 'Escape') {
        if (activeDrawer !== 'none') {
          setActiveDrawer('none');
        } else if (selectionState) {
          setSelectionState(null);
        } else {
          onBackToShelf();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleNextPage,
    handlePrevPage,
    onUpdateSettings,
    settings.autoFlipEnabled,
    settings.fontSize,
    activeDrawer,
    selectionState,
    onBackToShelf,
  ]);

  const activeOffset = virtualPages[pageIndex]?.startOffset ?? book.currentOffset;

  const currentChapterTitle = useMemo(() => {
    return findChapterTitleAtOffset(outlineHeadings, activeOffset);
  }, [outlineHeadings, activeOffset]);

  const isCurrentPageBookmarked = useMemo(() => {
    const currentPage = virtualPages[pageIndex];
    if (!currentPage) return false;
    const endRange =
      virtualPages[pageIndex + (isSpreadMode ? 1 : 0)]?.endOffset || currentPage.endOffset;
    return annotations.some(
      (a) =>
        a.type === 'bookmark' &&
        a.charOffset >= currentPage.startOffset &&
        a.charOffset < endRange
    );
  }, [annotations, virtualPages, pageIndex, isSpreadMode]);

  const handleToggleBookmarkAtCurrentPage = () => {
    const currentPage = virtualPages[pageIndex];
    if (!currentPage) return;

    const endRange =
      virtualPages[pageIndex + (isSpreadMode ? 1 : 0)]?.endOffset || currentPage.endOffset;
    const existing = annotations.find(
      (a) =>
        a.type === 'bookmark' &&
        a.charOffset >= currentPage.startOffset &&
        a.charOffset < endRange
    );
    if (existing) {
      onDeleteAnnotation(existing.id);
      return;
    }

    const previewSnippet =
      currentPage.paragraphs[0]?.text.slice(0, 68) ||
      book.content.slice(currentPage.startOffset, currentPage.startOffset + 68);

    onAddAnnotation({
      bookId: book.id,
      type: 'bookmark',
      chapterTitle: currentChapterTitle,
      charOffset: currentPage.startOffset,
      selectedText: previewSnippet,
      noteText: '',
      color: 'caramel',
    });
  };

  const handleMouseUpSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length < 2 || text.length > 600) return;

    const currentStart = virtualPages[pageIndex]?.startOffset ?? book.currentOffset;
    const foundIdx = book.content.indexOf(text, Math.max(0, currentStart - 500));
    const finalOffset = foundIdx !== -1 ? foundIdx : currentStart;

    setSelectionState({
      text,
      offset: finalOffset,
      chapterTitle: findChapterTitleAtOffset(outlineHeadings, finalOffset),
    });
    setNoteInput('');
  };

  const handleSaveHighlightNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectionState) return;
    onAddAnnotation({
      bookId: book.id,
      type: 'note',
      chapterTitle: selectionState.chapterTitle,
      charOffset: selectionState.offset,
      selectedText: selectionState.text,
      noteText: noteInput.trim(),
      color: selectedColor,
    });
    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleCanvasZoneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (touchSwipedRef.current) {
      touchSwipedRef.current = false;
      return;
    }
    if (scrubberVisible) {
      setScrubberVisible(false);
      return;
    }
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
      return;
    }
    if (activeDrawer !== 'none') {
      setActiveDrawer('none');
      return;
    }
    if (exportMenuOpen) {
      setExportMenuOpen(false);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratioX = clickX / rect.width;

    if (ratioX < 0.3) {
      handlePrevPage();
    } else if (ratioX > 0.7) {
      handleNextPage();
    } else {
      setChromeVisible((v) => !v);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') {
      return;
    }
    if (e.touches.length !== 1) return;
    touchStartPos.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    };
    touchSwipedRef.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    handleMouseUpSelection();
    if (!touchStartPos.current) return;
    if (e.changedTouches.length !== 1) {
      touchStartPos.current = null;
      return;
    }

    const start = touchStartPos.current;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const duration = Date.now() - start.time;
    touchStartPos.current = null;

    // Do not trigger page turn if user was selecting text
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
      return;
    }

    const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;

    // 1. Swipe up from bottom area to summon progress scrubber bar
    if (start.y > screenH * 0.6 && deltaY < -35 && absY > absX * 1.1 && duration < 700) {
      setScrubberVisible(true);
      touchSwipedRef.current = true;
      setTimeout(() => {
        touchSwipedRef.current = false;
      }, 350);
      return;
    }

    // 2. Swipe down to dismiss progress scrubber bar
    if (scrubberVisible && deltaY > 35 && absY > absX * 1.1 && duration < 700) {
      setScrubberVisible(false);
      touchSwipedRef.current = true;
      setTimeout(() => {
        touchSwipedRef.current = false;
      }, 350);
      return;
    }

    // 3. Swipe left (next page) or swipe right (prev page)
    if (isPaginated && absX > 38 && absX > absY * 1.25 && duration < 650) {
      touchSwipedRef.current = true;
      setTimeout(() => {
        touchSwipedRef.current = false;
      }, 350);
      if (deltaX < -38) {
        handleNextPage();
      } else if (deltaX > 38) {
        handlePrevPage();
      }
    }
  };

  const getFontFamilyCss = (fontId: string): string => {
    if (fontId === 'serif-editorial') return "'Lora', 'Noto Serif SC', 'Songti SC', serif";
    if (fontId === 'sans-warm') return "'Plus Jakarta Sans', -apple-system, sans-serif";
    if (fontId === 'kaiti-classic') return "'LXGW WenKai', 'Kaiti SC', 'STKaiti', 'KaiTi', serif";
    if (fontId === 'mono-tabular') return "'JetBrains Mono', monospace";
    return `'${fontId}', 'Noto Serif SC', serif`;
  };

  const renderPageParagraphs = (page: VirtualPage | undefined) => {
    if (!page) {
      return (
        <div
          className="flex h-full items-center justify-center text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          — 卷末 —
        </div>
      );
    }

    return page.paragraphs.map((p, idx) => {
      const matchingAnn = annotations.find(
        (ann) =>
          ann.selectedText &&
          p.text.includes(ann.selectedText.slice(0, Math.min(18, ann.selectedText.length)))
      );

      const highlightBg =
        matchingAnn?.color === 'amber'
          ? 'var(--highlight-amber)'
          : matchingAnn?.color === 'sage'
          ? 'var(--highlight-sage)'
          : matchingAnn
          ? 'var(--highlight-caramel)'
          : 'transparent';

      return (
        <MarkdownBlockRenderer
          key={`${page.pageNumber}-${idx}`}
          block={p}
          settings={settings}
          highlightBg={highlightBg}
          forceMermaidTD={forceMermaidTD}
          mermaidContainerWidth={mermaidContainerWidth}
          isLastBlock={idx === page.paragraphs.length - 1}
        />
      );
    });
  };

  const progressPct = useMemo(() => {
    if (isPaginated) {
      if (totalPages <= 1) return 100;
      const viewedEndPage = Math.min(totalPages, pageIndex + pageStep);
      return Math.min(100, Math.round((viewedEndPage / totalPages) * 100));
    }
    return book.totalChars > 0
      ? Math.min(100, Math.round((book.currentOffset / book.totalChars) * 100))
      : 0;
  }, [isPaginated, totalPages, pageIndex, pageStep, book.currentOffset, book.totalChars]);

  const filteredChapters = useMemo(() => {
    if (!chapterSearch.trim()) return outlineHeadings;
    return outlineHeadings.filter((ch) =>
      ch.title.toLowerCase().includes(chapterSearch.toLowerCase())
    );
  }, [outlineHeadings, chapterSearch]);

  const leftPage = virtualPages[pageIndex];
  const rightPage = isSpreadMode ? virtualPages[pageIndex + 1] : undefined;

  const canGoPrev = !isPaginated || pageIndex > 0;
  const canGoNext = !isPaginated || pageIndex + pageStep < totalPages;

  const notesWithThoughtsCount = useMemo(
    () => annotations.filter((a) => Boolean(a.noteText && a.noteText.trim())).length,
    [annotations]
  );

  const quickPdfPreview = useMemo(() => {
    if (!exportMenuOpen) return null;
    warmUpCjkPdfFont();
    return renderJsPdfPages(book, annotations, dailyStats, quickPdfConfig, 6);
  }, [exportMenuOpen, book, annotations, dailyStats, quickPdfConfig]);

  const handleQuickJsPdfDownload = async () => {
    const synced: ExportConfig = {
      ...quickPdfConfig,
      format: 'pdf',
      includeAnnotations: Boolean(quickPdfConfig.includeNotes || quickPdfConfig.includeExcerpts),
    };
    setQuickPdfFeedback('正在嵌入中文字体生成矢量 PDF...');
    const res = await exportBookWithJsPdf(book, annotations, dailyStats, synced);
    setQuickPdfFeedback(`已生成 ${res.totalPages} 页矢量 PDF 并开始下载`);
    setTimeout(() => setQuickPdfFeedback(null), 2600);
  };

  const handleQuickNativePrint = () => {
    const synced: ExportConfig = {
      ...quickPdfConfig,
      format: 'pdf',
      includeAnnotations: Boolean(quickPdfConfig.includeNotes || quickPdfConfig.includeExcerpts),
    };
    const fullResult = renderJsPdfPages(book, annotations, dailyStats, synced, 120);
    printDocumentViaHiddenIframe(fullResult.vectorPrintHtml);
    setQuickPdfFeedback('已唤起无页眉 A4 矢量打印');
    setTimeout(() => setQuickPdfFeedback(null), 2600);
  };

  return (
    <div
      className={`relative flex h-screen w-screen flex-col overflow-hidden select-text ${
        einkFlashing ? 'eink-flash-anim' : ''
      }`}
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
      onMouseEnter={() => {
        if (settings.autoFlipEnabled) setIsAutoPausedByHover(false);
      }}
    >
      <input
        ref={fontInputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            await onUploadCustomFont(file);
            e.target.value = '';
          }
        }}
      />

      {/* Minimal Icon-Driven Top Floating Chrome */}
      <header
        className={`fixed top-0 right-0 left-0 z-30 flex h-13 items-center justify-between px-4 transition-all duration-200 sm:px-6 ${
          chromeVisible
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-full opacity-0'
        }`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onBackToShelf}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{
              backgroundColor: 'var(--bg-page)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="返回书架 (Esc)"
            aria-label="返回书架"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Toggle Markdown Outline Sidebar Button (Shown on desktop/tablet; on mobile TOC drawer is used) */}
          <button
            onClick={() => setOutlineOpen((v) => !v)}
            className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{
              backgroundColor: outlineOpen ? 'var(--accent-primary)' : 'var(--bg-page)',
              color: outlineOpen ? '#FFFFFF' : 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="切换目录大纲侧栏 (#)"
            aria-label="切换目录大纲侧栏"
          >
            {outlineOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>

          {/* Book title text (hidden on mobile to preserve a clean, balanced, icon-only top bar) */}
          <div className="hidden md:flex min-w-0 items-center gap-1.5 pl-1">
            {book.isPrivate && (
              <Lock
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'var(--accent-primary)' }}
              />
            )}
            <h1 className="font-display truncate text-sm font-semibold">{book.title}</h1>
          </div>
        </div>

        {/* Direct In-Window Style, Font Size & Action Toolbar */}
        <div className="flex items-center gap-1.5">
          {book.isPrivate && onToggleBookPrivacy && (
            <button
              type="button"
              onClick={() => onToggleBookPrivacy(book.id)}
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
              style={{
                backgroundColor: 'var(--bg-page)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
              title="将本书解密转到公开书架"
              aria-label="转到公开书架"
            >
              <Unlock className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
            </button>
          )}
          {book.isPrivate && onLockVault && (
            <button
              type="button"
              onClick={onLockVault}
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
              style={{
                backgroundColor: 'var(--bg-page)',
                color: 'var(--accent-primary)',
                border: '1px solid var(--border-subtle)',
              }}
              title="立即锁定私密空间并返回公开书架 (Ctrl/Cmd + Shift + L)"
              aria-label="锁定私密空间"
            >
              <Lock className="h-4 w-4" />
            </button>
          )}

          {/* Direct In-Window Reading Style Switcher (Pure Icon 1-Click Theme Selection) */}
          <div
            className="hidden items-center gap-0.5 rounded-xl p-0.5 sm:flex"
            style={{
              backgroundColor: 'var(--bg-page)',
              border: '1px solid var(--border-subtle)',
            }}
            role="group"
            aria-label="阅读窗口直接切换阅读风格"
          >
            {READER_THEME_OPTIONS.map((t) => {
              const Icon = t.icon;
              const active = settings.theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onUpdateSettings({ theme: t.id })}
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-all"
                  style={{
                    backgroundColor: active ? 'var(--accent-primary)' : 'transparent',
                    color: active ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                  title={t.fullTitle}
                  aria-label={t.fullTitle}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>

          <button
            onClick={() => onUpdateSettings({ autoFlipEnabled: !settings.autoFlipEnabled })}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{
              backgroundColor: settings.autoFlipEnabled
                ? 'var(--accent-primary)'
                : 'var(--bg-page)',
              color: settings.autoFlipEnabled ? '#FFFFFF' : 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title={settings.autoFlipEnabled ? '暂停自动翻页 (F)' : '开启自动翻页 (F)'}
            aria-label="自动翻页"
          >
            {settings.autoFlipEnabled ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={handleToggleBookmarkAtCurrentPage}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{
              backgroundColor: isCurrentPageBookmarked
                ? 'var(--accent-soft)'
                : 'var(--bg-page)',
              color: isCurrentPageBookmarked
                ? 'var(--accent-primary)'
                : 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="书签"
            aria-label="书签"
          >
            <Bookmark
              className="h-4 w-4"
              fill={isCurrentPageBookmarked ? 'currentColor' : 'none'}
            />
          </button>

          {/* Top-Bar Export Dropdown Menu (PDF with Body / Notes / Excerpts & jsPDF Preview/Download) */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setExportMenuOpen((v) => !v);
                setActiveDrawer('none');
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
              style={{
                backgroundColor:
                  exportMenuOpen || exportModalOpen ? 'var(--accent-primary)' : 'var(--bg-page)',
                color: exportMenuOpen || exportModalOpen ? '#FFFFFF' : 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
              title="导出菜单：选择正文、笔记或书摘并预览下载 PDF"
              aria-label="导出菜单"
            >
              <Download className="h-4 w-4" />
            </button>

            {exportMenuOpen && (
              <div
                className="absolute top-11 right-0 z-50 w-80 rounded-2xl p-3.5 shadow-2xl sm:w-88"
                style={{
                  backgroundColor: 'var(--bg-page)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              >
                <div
                  className="flex items-center justify-between border-b pb-2.5"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
                    <span className="font-display text-xs font-semibold">
                      jsPDF 精美排版导出菜单
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExportMenuOpen(false)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Content Selection: 正文 / 笔记 / 书摘 */}
                <div className="mt-3">
                  <div
                    className="mb-1.5 flex items-center justify-between text-[11px] font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span>勾选 PDF 导出内容维度</span>
                    <span className="font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                      可多选组合
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      {
                        key: 'includeFullText' as const,
                        label: '正文',
                        meta: `${(book.totalChars / 1000).toFixed(1)}k字`,
                        checked: Boolean(quickPdfConfig.includeFullText),
                      },
                      {
                        key: 'includeNotes' as const,
                        label: '笔记',
                        meta: `${notesWithThoughtsCount} 篇`,
                        checked: Boolean(quickPdfConfig.includeNotes),
                      },
                      {
                        key: 'includeExcerpts' as const,
                        label: '书摘',
                        meta: `${annotations.length} 条`,
                        checked: Boolean(quickPdfConfig.includeExcerpts),
                      },
                    ].map((opt) => (
                      <label
                        key={opt.key}
                        className="flex cursor-pointer flex-col justify-between rounded-xl p-2 text-xs transition-all"
                        style={{
                          backgroundColor: opt.checked
                            ? 'var(--accent-soft)'
                            : 'var(--bg-surface)',
                          border: opt.checked
                            ? '1px solid var(--accent-primary)'
                            : '1px solid var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className="font-semibold"
                            style={{
                              color: opt.checked
                                ? 'var(--accent-primary)'
                                : 'var(--text-primary)',
                            }}
                          >
                            {opt.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={opt.checked}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setQuickPdfConfig((prev) => ({
                                ...prev,
                                [opt.key]: val,
                                includeAnnotations: Boolean(
                                  (opt.key === 'includeNotes' ? val : prev.includeNotes) ||
                                    (opt.key === 'includeExcerpts' ? val : prev.includeExcerpts)
                                ),
                              }));
                            }}
                            className="h-3.5 w-3.5 accent-[#B4532A]"
                          />
                        </div>
                        <span
                          className="font-mono-tabular mt-1 text-[10px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {opt.meta}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Paper Theme Selector */}
                <div className="mt-2.5">
                  <div
                    className="mb-1 text-[11px] font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    PDF 典藏纸张配色
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { id: 'parchment', label: '羊皮', hex: '#FBF7F0' },
                        { id: 'caramel', label: '焦糖', hex: '#F7EEDF' },
                        { id: 'espresso', label: '夜读', hex: '#211A15' },
                        { id: 'eink', label: '墨水', hex: '#F7F7F7' },
                      ] as { id: ExportThemeStyle; label: string; hex: string }[]
                    ).map((t) => {
                      const active = quickPdfConfig.themeStyle === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setQuickPdfConfig((prev) => ({ ...prev, themeStyle: t.id }))
                          }
                          className="flex items-center justify-center gap-1 rounded-lg py-1 text-[11px] font-medium"
                          style={{
                            backgroundColor: active
                              ? 'var(--accent-primary)'
                              : 'var(--bg-surface)',
                            color: active ? '#FFFFFF' : 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <span
                            className="h-2 w-2 rounded-full border border-black/20"
                            style={{ backgroundColor: t.hex }}
                          />
                          <span>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live Mini A4 Preview Card */}
                {quickPdfPreview && quickPdfPreview.pageDataUrls[0] && (
                  <div
                    className="mt-2.5 flex items-center gap-3 rounded-xl p-2"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <img
                      src={quickPdfPreview.pageDataUrls[0]}
                      alt="PDF 首页实时排版预览"
                      className="h-20 w-14 shrink-0 rounded border object-cover shadow-xs"
                      style={{ borderColor: 'var(--border-strong)' }}
                    />
                    <div className="min-w-0 flex-1 space-y-1 text-[11px]">
                      <div className="font-semibold truncate">《{book.title}》A4 预检</div>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        已勾选：
                        {[
                          quickPdfConfig.includeFullText ? '正文' : null,
                          quickPdfConfig.includeNotes ? '笔记' : null,
                          quickPdfConfig.includeExcerpts ? '书摘' : null,
                        ]
                          .filter(Boolean)
                          .join(' + ') || '仅封面'}
                      </div>
                      <div
                        className="font-mono-tabular text-[10px]"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        双击或点击下方按钮打开多页大图预览
                      </div>
                    </div>
                  </div>
                )}

                {quickPdfFeedback && (
                  <div
                    className="mt-2 flex items-center justify-center gap-1.5 rounded-lg py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{quickPdfFeedback}</span>
                  </div>
                )}

                {/* Primary Actions: Preview Studio & Direct Download */}
                <div className="mt-3 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setExportInitialFormat('pdf');
                      setExportMenuOpen(false);
                      setExportModalOpen(true);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-white transition-transform active:scale-[0.99]"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>精美 PDF 排版预览与下载</span>
                  </button>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={handleQuickJsPdfDownload}
                      className="flex items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-strong)',
                      }}
                      title="下载内嵌中文字体的矢量 PDF"
                    >
                      <Download className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
                      <span>下载 .pdf</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleQuickNativePrint}
                      className="flex items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-strong)',
                      }}
                      title="唤起无页眉 A4 矢量打印"
                    >
                      <Printer className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
                      <span>直接打印</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setExportInitialFormat('md');
                        setExportMenuOpen(false);
                        setExportModalOpen(true);
                      }}
                      className="flex items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>更多格式</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setActiveDrawer(activeDrawer === 'toc' ? 'none' : 'toc')}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{
              backgroundColor: activeDrawer === 'toc' ? 'var(--accent-primary)' : 'var(--bg-page)',
              color: activeDrawer === 'toc' ? '#FFFFFF' : 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="书签与批注列表"
            aria-label="书签与批注"
          >
            <List className="h-4 w-4" />
          </button>

          <button
            onClick={() => {
              setExportMenuOpen(false);
              setActiveDrawer(activeDrawer === 'settings' ? 'none' : 'settings');
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors"
            style={{
              backgroundColor:
                activeDrawer === 'settings' ? 'var(--accent-primary)' : 'var(--bg-page)',
              color: activeDrawer === 'settings' ? '#FFFFFF' : 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="风格与字号排版"
            aria-label="风格与字号排版"
          >
            <Sliders className="h-4 w-4" />
          </button>
        </div>
      </header>



      {/* Workspace Row: Left Markdown Outline Sidebar + Right Reading Canvas */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Hierarchical Markdown Heading (# / ## / ###) Outline Sidebar */}
        {outlineOpen && (
          <>
            {/* Mobile backdrop when outline is open on narrow screens */}
            <div
              className="fixed inset-0 z-30 bg-black/35 backdrop-blur-xs lg:hidden"
              onClick={() => setOutlineOpen(false)}
            />
            <aside
              className="fixed top-0 bottom-0 left-0 z-40 flex w-68 shrink-0 flex-col border-r pt-14 pb-14 transition-all lg:static lg:z-20"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center justify-between border-b px-4 py-2.5"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Hash className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
                  <span>目录大纲 ({outlineHeadings.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOutlineOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ color: 'var(--text-muted)' }}
                  title="收起大纲"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-3 pt-2.5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type="text"
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    placeholder="筛选标题…"
                    className="h-8 w-full rounded-lg pr-2.5 pl-8 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-page)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2.5 py-1">
                {filteredChapters.map((ch) => {
                  const isCurrent = ch.title === currentChapterTitle;
                  const level = ch.level || 1;
                  const indentPx = (level - 1) * 12;

                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => jumpToCharOffset(ch.startOffset)}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors"
                      style={{
                        paddingLeft: `${10 + indentPx}px`,
                        backgroundColor: isCurrent ? 'var(--bg-page)' : 'transparent',
                        color: isCurrent ? 'var(--accent-primary)' : 'var(--text-primary)',
                        fontWeight: isCurrent || level === 1 ? 600 : 400,
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="font-mono-tabular shrink-0 text-[10px] opacity-65"
                          style={{
                            color: isCurrent ? 'var(--accent-primary)' : 'var(--text-muted)',
                          }}
                        >
                          H{level}
                        </span>
                        <span className="truncate">{ch.title}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </aside>
          </>
        )}

        {/* Main Immersive Book Canvas with Touch Swipe Support */}
        <main
          ref={readerCanvasRef}
          onClick={handleCanvasZoneClick}
          onMouseUp={handleMouseUpSelection}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`relative flex flex-1 items-center justify-center overflow-hidden px-2 sm:px-10 transition-all duration-200 ${
            chromeVisible ? 'pt-13 pb-2.5 sm:pt-14 sm:pb-14' : 'pt-13 pb-2.5 sm:py-5'
          }`}
        >
          {/* Left Floating Quick Page-Turn Icon Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevPage();
            }}
            disabled={!canGoPrev}
            className=" hidden sm:flex absolute top-1/2 left-2.5 z-20 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full opacity-70 transition-all hover:opacity-100 disabled:opacity-20"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="上一页 (←)"
            aria-label="上一页"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Right Floating Quick Page-Turn Icon Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNextPage();
            }}
            disabled={!canGoNext}
            className="hidden sm:flex absolute top-1/2 right-2.5 z-20 h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full opacity-70 transition-all hover:opacity-100 disabled:opacity-20"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="下一页 (→ / Space)"
            aria-label="下一页"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {isPaginated ? (
            <div
              className="paper-grain relative flex h-full w-full max-w-[1280px] flex-col justify-between overflow-hidden rounded-2xl transition-all duration-200"
              style={{
                backgroundColor: 'var(--bg-page)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--page-shadow)',
                padding: `${Math.max(10, Math.min(20, Math.round(settings.pageMargin * 0.4)))}px ${Math.max(
                  14,
                  Math.min(settings.pageMargin, Math.floor(effectiveCanvasWidth * 0.05))
                )}px`,
              }}
            >
              {isSpreadMode && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-10 w-10 -translate-x-1/2"
                  style={{ background: 'var(--spine-gradient)' }}
                />
              )}

              {/* Top Minimal Running Header */}
              <div
                className="flex shrink-0 items-center justify-between gap-2 border-b pb-1 text-xs"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <span className="min-w-0 truncate">{currentChapterTitle}</span>
                <span className="font-mono-tabular shrink-0">
                  {pageIndex + 1}
                  {isSpreadMode && rightPage ? `–${pageIndex + 2}` : ''} / {totalPages}
                </span>
              </div>

              {/* Book Text Columns */}
              <div
                className={`my-1 sm:my-1.5 grid min-h-0 flex-1 overflow-hidden ${
                  isSpreadMode ? 'grid-cols-2 gap-8 lg:gap-12' : 'mx-auto w-full max-w-3xl grid-cols-1'
                }`}
                style={{
                  fontFamily: getFontFamilyCss(settings.fontFamily),
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                  letterSpacing: `${settings.letterSpacing}em`,
                }}
              >
                <div
                  data-reader-column="true"
                  className="min-w-0 overflow-x-hidden overflow-y-auto pr-0.5"
                >
                  {renderPageParagraphs(leftPage)}
                </div>
                {isSpreadMode && (
                  <div
                    data-reader-column="true"
                    className="min-w-0 overflow-x-hidden overflow-y-auto pl-0.5"
                  >
                    {renderPageParagraphs(rightPage)}
                  </div>
                )}
              </div>

              {/* Bottom Page Running Footer */}
              <div
                className="flex items-center justify-between border-t pt-1 text-xs"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }}
              >
                <span className="font-mono-tabular">
                  {pageIndex + 1} / {totalPages}
                </span>
                <span
                  className="font-mono-tabular font-medium"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {progressPct}%
                </span>
              </div>

              {settings.autoFlipEnabled && (
                <div
                  className="absolute right-0 bottom-0 left-0 h-1"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  <div
                    className="h-full transition-all duration-100"
                    style={{
                      width: `${autoFlipProgress}%`,
                      backgroundColor: 'var(--accent-primary)',
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              ref={scrollContainerRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
                const ratio = Math.min(1, Math.max(0, el.scrollTop / maxScroll));
                const newOffset = Math.floor(ratio * book.totalChars);
                if (Math.abs(newOffset - book.currentOffset) > 120) {
                  onUpdateBookOffset(book.id, newOffset);
                }
              }}
              onTouchStart={() => setIsAutoPausedByHover(true)}
              onTouchEnd={() => setIsAutoPausedByHover(false)}
              className="paper-grain h-full w-full max-w-4xl overflow-y-auto rounded-2xl transition-colors"
              style={{
                backgroundColor: 'var(--bg-page)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--page-shadow)',
                padding: `40px ${settings.pageMargin}px 88px`,
                fontFamily: getFontFamilyCss(settings.fontFamily),
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                letterSpacing: `${settings.letterSpacing}em`,
              }}
            >
              <div data-reader-column="true" className="mx-auto max-w-2xl">
                {virtualPages.map((page) => (
                  <div key={page.pageNumber}>{renderPageParagraphs(page)}</div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bottom Floating Scrubber Bar (Hidden by default on mobile, summonable via swipe-up from bottom) */}
      <footer
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`fixed right-0 bottom-0 left-0 z-30 flex flex-col justify-center px-4 py-2 transition-all duration-300 sm:px-6 sm:h-13 ${
          (viewportDim.viewportWidth >= 768 ? (chromeVisible || scrubberVisible) : scrubberVisible)
            ? 'translate-y-0 opacity-100 shadow-xl'
            : 'pointer-events-none translate-y-full opacity-0'
        }`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        {/* Subtle mobile sheet pull handle */}
        <div
          className="mx-auto mb-1 h-1 w-8 rounded-full sm:hidden"
          style={{ backgroundColor: 'var(--border-strong)' }}
        />
        <div className="mx-auto flex w-full max-w-xl items-center gap-3">
          <span className="font-mono-tabular text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
            {isPaginated ? `${pageIndex + 1}/${totalPages}` : `${progressPct}%`}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(1, totalPages - 1)}
            value={pageIndex}
            onChange={(e) => goToPageIndex(Number(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-[#B4532A]"
          />
          <span
            className="font-mono-tabular text-xs font-medium shrink-0"
            style={{ color: 'var(--accent-primary)' }}
          >
            {progressPct}%
          </span>
          <button
            type="button"
            onClick={() => setScrubberVisible(false)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg sm:hidden"
            style={{ color: 'var(--text-muted)' }}
            title="收起进度条"
            aria-label="收起进度条"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>

      {/* Compact Text Selection Highlight Popover */}
      {selectionState && (
        <div className="fixed inset-x-0 bottom-16 z-50 mx-auto w-full max-w-sm px-4">
          <form
            onSubmit={handleSaveHighlightNote}
            className="rounded-2xl p-3.5 shadow-2xl"
            style={{
              backgroundColor: 'var(--bg-page)',
              border: '1px solid var(--border-strong)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(
                  [
                    { id: 'amber', hex: '#D97724' },
                    { id: 'caramel', hex: '#B4532A' },
                    { id: 'sage', hex: '#5C8060' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: c.hex,
                      outline:
                        selectedColor === c.id ? '2px solid var(--text-primary)' : 'none',
                      outlineOffset: '2px',
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSelectionState(null)}
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p
              className="mt-2 line-clamp-2 rounded-lg p-2 text-xs italic"
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
              }}
            >
              「{selectionState.text}」
            </p>

            <div className="mt-2 flex gap-1.5">
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="批注…"
                className="h-8 flex-1 rounded-xl px-2.5 text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setQuoteCardTarget({
                    chapterTitle: selectionState.chapterTitle,
                    selectedText: selectionState.text,
                    noteText: noteInput.trim(),
                  });
                }}
                className="flex h-8 items-center gap-1 rounded-xl px-2.5 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--accent-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
                title="一键生成书摘分享长图（金句卡）"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                <span>金句卡</span>
              </button>
              <button
                type="submit"
                className="h-8 rounded-xl px-3 text-xs font-medium text-white"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drawer 1: TOC & Annotations */}
      {activeDrawer === 'toc' && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-xs"
          onClick={() => setActiveDrawer('none')}
        >
          <aside
            className="flex h-full w-full max-w-sm flex-col p-4 shadow-2xl"
            style={{
              backgroundColor: 'var(--bg-page)',
              borderLeft: '1px solid var(--border-subtle)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-1 rounded-xl p-1"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              >
                <button
                  onClick={() => setTocTab('chapters')}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: tocTab === 'chapters' ? 'var(--bg-page)' : 'transparent',
                    color: tocTab === 'chapters' ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  <List className="h-3.5 w-3.5" />
                  <span>{outlineHeadings.length}</span>
                </button>
                <button
                  onClick={() => setTocTab('annotations')}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor:
                      tocTab === 'annotations' ? 'var(--bg-page)' : 'transparent',
                    color:
                      tocTab === 'annotations' ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  <span>{annotations.length}</span>
                </button>
              </div>

              <button
                onClick={() => setActiveDrawer('none')}
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {tocTab === 'chapters' ? (
              <>
                <div className="relative mt-3">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  />
                  <input
                    type="text"
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    placeholder="检索章节…"
                    className="h-9 w-full rounded-xl pr-3 pl-8 text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                </div>
                <div
                  className="mt-2 flex-1 divide-y overflow-y-auto"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  {filteredChapters.map((ch) => {
                    const isCurrent = ch.title === currentChapterTitle;
                    const level = ch.level || 1;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => {
                          jumpToCharOffset(ch.startOffset);
                          setActiveDrawer('none');
                        }}
                        className="flex w-full items-center justify-between py-2.5 text-left text-xs transition-colors"
                        style={{
                          paddingLeft: `${(level - 1) * 12}px`,
                          color: isCurrent ? 'var(--accent-primary)' : 'var(--text-primary)',
                          fontWeight: isCurrent || level === 1 ? 600 : 400,
                        }}
                      >
                        <span className="truncate pr-2">
                          <span className="font-mono-tabular mr-1.5 text-[10px] opacity-60">
                            H{level}
                          </span>
                          {ch.title}
                        </span>
                        <span
                          className="font-mono-tabular shrink-0 text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {ch.wordCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="mt-3 flex justify-end gap-1.5">
                  <button
                    onClick={() => {
                      setActiveDrawer('none');
                      setExportModalOpen(true);
                    }}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--accent-primary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    title="打开多格式导出中心"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>多格式导出</span>
                  </button>
                </div>

                <div className="mt-2 flex-1 space-y-2.5 overflow-y-auto">
                  {annotations.length === 0 ? (
                    <div
                      className="py-12 text-center text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      暂无记录
                    </div>
                  ) : (
                    annotations.map((ann) => (
                      <div
                        key={ann.id}
                        onClick={() => {
                          jumpToCharOffset(ann.charOffset);
                          setActiveDrawer('none');
                        }}
                        className="cursor-pointer rounded-xl p-3 transition-colors"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div
                          className="flex items-center justify-between text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span className="truncate">{ann.chapterTitle}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setQuoteCardTarget({
                                  chapterTitle: ann.chapterTitle,
                                  selectedText: ann.selectedText,
                                  noteText: ann.noteText,
                                });
                              }}
                              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                              style={{
                                backgroundColor: 'var(--bg-page)',
                                color: 'var(--accent-primary)',
                              }}
                              title="生成书摘分享长图（金句卡）"
                            >
                              <ImageIcon className="h-3 w-3" />
                              <span>金句卡</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteAnnotation(ann.id);
                              }}
                              className="hover:text-red-600"
                              title="删除批注"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs italic">
                          「{ann.selectedText}」
                        </p>
                        {ann.noteText && (
                          <p
                            className="mt-1 text-xs font-medium"
                            style={{ color: 'var(--accent-primary)' }}
                          >
                            {ann.noteText}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {/* Non-Dimming Floating Appearance, Style & Typography Popover */}
      {activeDrawer === 'settings' && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setActiveDrawer('none')}
        >
          <aside
            className="fixed top-14 right-3 z-50 flex max-h-[calc(100vh-4.5rem)] w-[348px] max-w-[calc(100vw-1.5rem)] flex-col space-y-4 overflow-y-auto rounded-2xl p-4 shadow-2xl sm:right-6"
            style={{
              backgroundColor: 'var(--bg-page)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b pb-2.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
                <span className="font-display text-xs font-semibold">
                  阅读风格与字体排版（实时无遮罩预览）
                </span>
              </div>
              <button
                onClick={() => setActiveDrawer('none')}
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ color: 'var(--text-muted)' }}
                title="关闭面板 (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 1. Paper Style & Warmth Swatches */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                  阅读风格（纸张与光感）
                </span>
                <span className="text-[11px]" style={{ color: 'var(--accent-primary)' }}>
                  {READER_THEME_OPTIONS.find((t) => t.id === settings.theme)?.fullTitle}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {READER_THEME_OPTIONS.map((t) => {
                  const Icon = t.icon;
                  const active = settings.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onUpdateSettings({ theme: t.id })}
                      className="flex items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: t.bgHex,
                        color: t.textHex,
                        border: active
                          ? `2px solid ${t.accentHex}`
                          : '1px solid rgba(128, 128, 128, 0.28)',
                        boxShadow: active ? '0 4px 12px rgba(0, 0, 0, 0.12)' : 'none',
                      }}
                      title={t.fullTitle}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{t.label}</span>
                      </span>
                      <span
                        className="font-serif-editorial text-[11px] font-bold"
                        style={{ color: t.accentHex }}
                      >
                        {active ? '✓' : 'Aa'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {settings.theme === 'eink' && (
              <label
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              >
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  <span>墨水全刷效果</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.einkFlashRefresh}
                  onChange={(e) => onUpdateSettings({ einkFlashRefresh: e.target.checked })}
                  className="h-4 w-4 accent-[#111111]"
                />
              </label>
            )}

            {/* 2. Font Size Stepper, Slider & Quick Presets */}
            <div
              className="space-y-2.5 rounded-xl p-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <Type className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>字号大小</span>
                </span>
                <span
                  className="font-mono-tabular text-xs font-semibold"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {settings.fontSize} px
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })
                  }
                  disabled={settings.fontSize <= 14}
                  className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors disabled:opacity-35"
                  style={{
                    backgroundColor: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  title="减小字号 (-)"
                >
                  A-
                </button>
                <input
                  type="range"
                  min={14}
                  max={30}
                  step={1}
                  value={settings.fontSize}
                  onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
                  className="flex-1 cursor-pointer accent-[#B4532A]"
                  title="拖动调节字号"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ fontSize: Math.min(30, settings.fontSize + 1) })
                  }
                  disabled={settings.fontSize >= 30}
                  className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors disabled:opacity-35"
                  style={{
                    backgroundColor: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  title="增大字号 (+)"
                >
                  A+
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {FONT_SIZE_PRESETS.map((preset) => {
                  const active = settings.fontSize === preset.size;
                  return (
                    <button
                      key={preset.size}
                      type="button"
                      onClick={() => onUpdateSettings({ fontSize: preset.size })}
                      className="rounded-lg py-1 text-[11px] font-medium transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-page)',
                        color: active ? '#FFFFFF' : 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {preset.label} {preset.size}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Font Family & Custom Font Upload */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                  正文字体
                </span>
                <button
                  onClick={() => fontInputRef.current?.click()}
                  className="rounded-lg px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--accent-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  title="导入本地字体 (.ttf/.otf/.woff2)"
                >
                  + 导入字体
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'serif-editorial', label: '宋体衬线' },
                  { id: 'sans-warm', label: '黑体无衬' },
                  { id: 'kaiti-classic', label: '书房楷体' },
                  { id: 'mono-tabular', label: '等宽手稿' },
                  ...customFonts.map((cf) => ({ id: cf.id, label: cf.name })),
                ].map((f) => {
                  const active = settings.fontFamily === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => onUpdateSettings({ fontFamily: f.id })}
                      className="min-h-[34px] truncate rounded-xl px-2.5 py-1 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-surface)',
                        color: active ? '#FFFFFF' : 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Layout Mode & Line Spacing */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'paginated-double', label: '双页', icon: Columns2 },
                    { id: 'paginated-single', label: '单页', icon: FileText },
                    { id: 'scroll', label: '滚屏', icon: ScrollText },
                  ] as { id: LayoutMode; label: string; icon: React.FC<{ className?: string }> }[]
                ).map((m) => {
                  const Icon = m.icon;
                  const active = settings.layoutMode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onUpdateSettings({ layoutMode: m.id })}
                      className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-surface)',
                        color: active ? '#FFFFFF' : 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                      title={m.label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <AlignJustify
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                />
                <input
                  type="range"
                  min={1.4}
                  max={2.2}
                  step={0.05}
                  value={settings.lineHeight}
                  onChange={(e) => onUpdateSettings({ lineHeight: Number(e.target.value) })}
                  className="flex-1 accent-[#B4532A]"
                  title="行高"
                />
                <span className="font-mono-tabular w-9 text-right text-xs">
                  {settings.lineHeight.toFixed(1)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label
                  className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <Indent className="h-3.5 w-3.5" />
                    <span>首行缩进</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.indentFirstLine}
                    onChange={(e) => onUpdateSettings({ indentFirstLine: e.target.checked })}
                    className="h-4 w-4 accent-[#B4532A]"
                  />
                </label>

                <div
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-xs"
                  style={{ backgroundColor: 'var(--bg-surface)' }}
                >
                  <span className="flex items-center gap-1 font-mono-tabular">
                    <Gauge className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
                    <span>
                      {isPaginated
                        ? `${settings.autoFlipPageInterval}s`
                        : `${settings.autoScrollSpeed}`}
                    </span>
                  </span>
                  <button
                    onClick={() => onUpdateSettings({ autoFlipEnabled: !settings.autoFlipEnabled })}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-white"
                    style={{
                      backgroundColor: settings.autoFlipEnabled
                        ? 'var(--accent-primary)'
                        : 'var(--text-muted)',
                    }}
                    title="开启/暂停自动翻页"
                  >
                    {settings.autoFlipEnabled ? (
                      <Pause className="h-3 w-3" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Multi-Format & jsPDF Export Studio Modal */}
      <ExportStudioModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        book={book}
        annotations={annotations}
        dailyStats={dailyStats}
        initialFormat={exportInitialFormat}
        initialConfig={quickPdfConfig}
      />

      {/* Quote Share Card Studio Modal */}
      <QuoteCardModal
        isOpen={Boolean(quoteCardTarget)}
        onClose={() => setQuoteCardTarget(null)}
        initialConfig={{
          bookTitle: book.title,
          author: book.author,
          chapterTitle: quoteCardTarget?.chapterTitle || currentChapterTitle,
          selectedText: quoteCardTarget?.selectedText || '',
          noteText: quoteCardTarget?.noteText || '',
        }}
      />
    </div>
  );
};
