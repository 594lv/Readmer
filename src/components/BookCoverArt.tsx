import React from 'react';
import { CoverPreset } from '../types/reader';

interface BookCoverArtProps {
  title: string;
  author: string;
  preset: CoverPreset;
  format?: string;
  size?: 'lg' | 'sm' | 'xs';
  className?: string;
}

const PRESET_STYLES: Record<
  CoverPreset,
  {
    bg: string;
    border: string;
    labelBg: string;
    ink: string;
    accent: string;
    subInk: string;
  }
> = {
  terracotta: {
    bg: '#8C3F23',
    border: '#6E2E17',
    labelBg: '#FBF7F0',
    ink: '#2C1E16',
    accent: '#B4532A',
    subInk: '#7A6352',
  },
  walnut: {
    bg: '#4A3525',
    border: '#332317',
    labelBg: '#F6F0E6',
    ink: '#2C1E16',
    accent: '#8A6240',
    subInk: '#6E5643',
  },
  espresso: {
    bg: '#231A14',
    border: '#140E0B',
    labelBg: '#EFE6D5',
    ink: '#1E1510',
    accent: '#C87D3B',
    subInk: '#6B5747',
  },
  matcha: {
    bg: '#3B4D3E',
    border: '#28362B',
    labelBg: '#F7F4EB',
    ink: '#212B23',
    accent: '#5B7A5E',
    subInk: '#5F6E61',
  },
  parchment: {
    bg: '#DFD2BE',
    border: '#C2B097',
    labelBg: '#FBF8F3',
    ink: '#2C1E16',
    accent: '#9E4723',
    subInk: '#7A6352',
  },
};

export const BookCoverArt: React.FC<BookCoverArtProps> = ({
  title,
  author,
  preset,
  size = 'lg',
  className = '',
}) => {
  const style = PRESET_STYLES[preset] || PRESET_STYLES.terracotta;

  if (size === 'xs') {
    return (
      <div
        className={`relative select-none overflow-hidden rounded-r-md rounded-l-[2px] ${className}`}
        style={{
          backgroundColor: style.bg,
          border: `1px solid ${style.border}`,
          boxShadow:
            'inset 3px 0 6px rgba(0,0,0,0.26), inset 6px 0 1px rgba(255,255,255,0.12), 0 2px 6px rgba(44,30,22,0.16)',
        }}
      >
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-1.5 w-[1px]"
          style={{ backgroundColor: 'rgba(0,0,0,0.32)' }}
        />
        <div
          className="relative ml-2.5 mr-1 my-1.5 flex h-[calc(100%-0.75rem)] flex-col justify-between rounded-[2px] p-1"
          style={{
            backgroundColor: style.labelBg,
            border: `1px solid ${style.accent}35`,
          }}
        >
          <div
            className="h-[1.5px] w-3"
            style={{ backgroundColor: style.accent }}
          />
          <span
            className="font-display line-clamp-2 text-[8px] font-semibold leading-[1.15] tracking-tight"
            style={{ color: style.ink }}
          >
            {title}
          </span>
          <div
            className="h-[1px] w-full opacity-30"
            style={{ backgroundColor: style.subInk }}
          />
        </div>
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div
        className={`relative select-none overflow-hidden rounded-r-lg rounded-l-[3px] ${className}`}
        style={{
          backgroundColor: style.bg,
          border: `1px solid ${style.border}`,
          boxShadow:
            'inset 4px 0 8px rgba(0,0,0,0.26), inset 9px 0 1px rgba(255,255,255,0.12), 0 4px 10px -2px rgba(44,30,22,0.18)',
        }}
      >
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-2 w-[1.5px]"
          style={{ backgroundColor: 'rgba(0,0,0,0.32)' }}
        />
        <div
          className="relative ml-3.5 mr-1.5 my-2 flex h-[calc(100%-1rem)] flex-col justify-between rounded-[3px] p-1.5"
          style={{
            backgroundColor: style.labelBg,
            border: `1px solid ${style.accent}40`,
          }}
        >
          <div>
            <div
              className="mb-1 h-[1.5px] w-4"
              style={{ backgroundColor: style.accent }}
            />
            <h4
              className="font-display line-clamp-2 text-[10px] font-semibold leading-tight tracking-tight"
              style={{ color: style.ink }}
            >
              {title}
            </h4>
          </div>
          <div className="border-t pt-1" style={{ borderColor: `${style.subInk}28` }}>
            <p
              className="truncate text-[8px] font-medium leading-none"
              style={{ color: style.subInk }}
            >
              {author || '佚名'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative select-none overflow-hidden rounded-r-xl rounded-l-[4px] transition-transform duration-200 ${className}`}
      style={{
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        boxShadow:
          'inset 6px 0 12px rgba(0,0,0,0.28), inset 14px 0 2px rgba(255,255,255,0.12), 0 8px 20px -4px rgba(44,30,22,0.22)',
      }}
    >
      {/* Book Spine Crease Line */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 left-3.5 w-[2px]"
        style={{ backgroundColor: 'rgba(0,0,0,0.32)' }}
      />

      {/* Subtle Botanical / Geometric Foil Watermark SVG */}
      <svg
        className="pointer-events-none absolute right-2 bottom-2 h-24 w-24 opacity-20 sm:h-28 sm:w-28"
        viewBox="0 0 120 120"
        fill="none"
      >
        <circle cx="60" cy="60" r="46" stroke={style.labelBg} strokeWidth="1.2" strokeDasharray="3 3" />
        <path
          d="M60 100C60 72 82 54 96 34C72 38 54 56 60 100Z"
          stroke={style.labelBg}
          strokeWidth="1.5"
        />
        <path
          d="M60 92C60 66 38 48 24 28C48 32 66 50 60 92Z"
          stroke={style.labelBg}
          strokeWidth="1.5"
        />
      </svg>

      {/* Inset Paper Label Card */}
      <div
        className="relative ml-5 mr-3 my-3.5 flex h-[calc(100%-1.75rem)] min-h-0 flex-col justify-between overflow-hidden rounded-md p-2.5 sm:ml-6 sm:mr-3.5 sm:my-4 sm:h-[calc(100%-2rem)] sm:p-3.5"
        style={{
          backgroundColor: style.labelBg,
          border: `1px solid ${style.accent}40`,
        }}
      >
        {/* Top double rule */}
        <div className="min-h-0 shrink">
          <div
            className="mb-1.5 h-[2px] w-6 sm:mb-2 sm:w-8"
            style={{ backgroundColor: style.accent }}
          />
          <h4
            className="font-display line-clamp-2 sm:line-clamp-3 text-xs font-semibold leading-snug tracking-tight sm:text-sm"
            style={{ color: style.ink }}
          >
            {title}
          </h4>
        </div>

        {/* Center Minimal Motif */}
        <div className="my-auto hidden min-h-0 shrink items-center justify-start py-0.5 sm:flex">
          <svg className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
              stroke={style.accent}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Bottom Author Signature */}
        <div className="shrink-0 border-t pt-1.5 sm:pt-2" style={{ borderColor: `${style.subInk}30` }}>
          <p
            className="truncate text-[10px] font-medium sm:text-[11px]"
            style={{ color: style.subInk }}
          >
            {author || '佚名手稿'}
          </p>
        </div>
      </div>
    </div>
  );
};
