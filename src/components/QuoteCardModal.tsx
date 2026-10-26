import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  Palette,
  Sparkles,
  Stamp,
  Type,
  X,
} from 'lucide-react';
import {
  QuoteCardConfig,
  renderQuoteCardToCanvas,
  triggerBlobDownload,
} from '../core/exportEngine';

interface QuoteCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: {
    bookTitle: string;
    author: string;
    chapterTitle: string;
    selectedText: string;
    noteText?: string;
  };
}

export const QuoteCardModal: React.FC<QuoteCardModalProps> = ({
  isOpen,
  onClose,
  initialConfig,
}) => {
  const [config, setConfig] = useState<QuoteCardConfig>({
    bookTitle: initialConfig.bookTitle,
    author: initialConfig.author,
    chapterTitle: initialConfig.chapterTitle,
    selectedText: initialConfig.selectedText,
    noteText: initialConfig.noteText || '',
    paperTheme: 'parchment',
    fontStyle: 'serif',
    showNote: Boolean(initialConfig.noteText?.trim()),
    showStamp: true,
    showDate: true,
  });
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      bookTitle: initialConfig.bookTitle,
      author: initialConfig.author,
      chapterTitle: initialConfig.chapterTitle,
      selectedText: initialConfig.selectedText,
      noteText: initialConfig.noteText || '',
      showNote: Boolean(initialConfig.noteText?.trim()),
    }));
  }, [initialConfig]);

  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    renderQuoteCardToCanvas(canvasRef.current, config);
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleDownloadPng = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) return;
      const safeTitle = config.bookTitle.slice(0, 14).replace(/[\\/:*?"<>|]/g, '');
      triggerBlobDownload(`${safeTitle}-书摘金句卡.png`, blob);
      setCopiedStatus('已保存高清 PNG 长图');
      setTimeout(() => setCopiedStatus(null), 2600);
    }, 'image/png');
  };

  const handleCopyImage = async () => {
    if (!canvasRef.current) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current?.toBlob((b) => resolve(b), 'image/png')
      );
      if (blob && navigator.clipboard && 'write' in navigator.clipboard) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopiedStatus('已复制金句图片至剪贴板');
      } else {
        await navigator.clipboard.writeText(
          `「${config.selectedText}」\n——《${config.bookTitle}》${config.author} · ${config.chapterTitle}`
        );
        setCopiedStatus('已复制书摘文本');
      }
    } catch {
      await navigator.clipboard.writeText(
        `「${config.selectedText}」\n——《${config.bookTitle}》${config.author} · ${config.chapterTitle}`
      );
      setCopiedStatus('已复制书摘文本');
    }
    setTimeout(() => setCopiedStatus(null), 2600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl shadow-2xl lg:flex-row"
        style={{
          backgroundColor: 'var(--bg-page)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Controls Column */}
        <div
          className="flex w-full flex-col justify-between border-b p-5 lg:w-84 lg:shrink-0 lg:border-r lg:border-b-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
                <h2 className="font-display text-sm font-semibold">书摘金句长图工作坊</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg lg:hidden"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Paper Theme Selector */}
            <div>
              <div
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Palette className="h-3.5 w-3.5" />
                <span>馆藏纸张底纹</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'parchment', label: '暖白羊皮', dot: '#FBF7F0' },
                    { id: 'caramel', label: '烘焙焦糖', dot: '#EADBC3' },
                    { id: 'espresso', label: '深夜浓缩', dot: '#1F1814' },
                    { id: 'xuan', label: '馆藏宣纸', dot: '#F7F5F0' },
                  ] as const
                ).map((t) => {
                  const active = config.paperTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, paperTheme: t.id }))}
                      className="flex min-h-[36px] items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-page)',
                        color: active ? '#FFFFFF' : 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-black/20"
                        style={{ backgroundColor: t.dot }}
                      />
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Family Selector */}
            <div>
              <div
                className="mb-1.5 flex items-center gap-1.5 text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Type className="h-3.5 w-3.5" />
                <span>排版字型</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'serif', label: '人文宋' },
                    { id: 'kaiti', label: '书房楷' },
                    { id: 'sans', label: '现代黑' },
                  ] as const
                ).map((f) => {
                  const active = config.fontStyle === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, fontStyle: f.id }))}
                      className="min-h-[34px] rounded-xl px-2 py-1 text-xs font-medium transition-all"
                      style={{
                        backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-page)',
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

            {/* Quote Text Editor */}
            <div>
              <label
                className="mb-1 block text-xs font-medium"
                style={{ color: 'var(--text-secondary)' }}
              >
                金句原文
              </label>
              <textarea
                rows={3}
                value={config.selectedText}
                onChange={(e) => setConfig((prev) => ({ ...prev, selectedText: e.target.value }))}
                className="w-full rounded-xl p-2.5 text-xs leading-relaxed outline-none"
                style={{
                  backgroundColor: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Reader Note Input */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-secondary)' }}>随笔感悟</span>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={config.showNote}
                    onChange={(e) => setConfig((prev) => ({ ...prev, showNote: e.target.checked }))}
                    className="h-3.5 w-3.5 accent-[#B4532A]"
                  />
                  <span>显示感悟</span>
                </label>
              </div>
              <input
                type="text"
                value={config.noteText}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    noteText: e.target.value,
                    showNote: Boolean(e.target.value.trim()),
                  }))
                }
                placeholder="输入一段读书随感…"
                className="h-9 w-full rounded-xl px-3 text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {/* Stamp & Date Toggles */}
            <div className="grid grid-cols-2 gap-2">
              <label
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  <Stamp className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>藏书印章</span>
                </span>
                <input
                  type="checkbox"
                  checked={config.showStamp}
                  onChange={(e) => setConfig((prev) => ({ ...prev, showStamp: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[#B4532A]"
                />
              </label>

              <label
                className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs"
                style={{
                  backgroundColor: 'var(--bg-page)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>摘录日期</span>
                </span>
                <input
                  type="checkbox"
                  checked={config.showDate}
                  onChange={(e) => setConfig((prev) => ({ ...prev, showDate: e.target.checked }))}
                  className="h-3.5 w-3.5 accent-[#B4532A]"
                />
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 space-y-2 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
            {copiedStatus && (
              <div
                className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--accent-soft)',
                  color: 'var(--accent-primary)',
                }}
              >
                <Check className="h-3.5 w-3.5" />
                <span>{copiedStatus}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyImage}
                className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>复制卡片</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPng}
                className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Download className="h-3.5 w-3.5" />
                <span>保存长图</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Live High-Res Canvas Preview */}
        <div
          className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto p-4 sm:p-6"
          style={{ backgroundColor: 'var(--bg-canvas)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 hidden h-8 w-8 items-center justify-center rounded-xl lg:flex"
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="max-w-full overflow-x-auto rounded-2xl shadow-xl">
            <canvas ref={canvasRef} className="block max-w-full h-auto rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
};
