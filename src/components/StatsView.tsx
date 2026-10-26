import React, { useMemo } from 'react';
import {
  BookOpen,
  Clock,
  Coffee,
  Flame,
  Moon,
  Sun,
  Sunset,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Annotation, Book, ReadingStatsDaily } from '../types/reader';

interface StatsViewProps {
  books: Book[];
  annotations: Annotation[];
  dailyStats: ReadingStatsDaily[];
  dailyGoalMinutes: number;
  onUpdateDailyGoal: (minutes: number) => void;
  onOpenBook: (bookId: string) => void;
}

export const StatsView: React.FC<StatsViewProps> = ({
  books,
  annotations,
  dailyStats,
  dailyGoalMinutes,
  onUpdateDailyGoal,
  onOpenBook,
}) => {
  const last7Days = useMemo(() => {
    const result: { label: string; date: string; minutes: number; chars: number }[] = [];
    const map = new Map<string, ReadingStatsDaily>();
    dailyStats.forEach((s) => map.set(s.date, s));

    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const stat = map.get(dateStr);
      const label = i === 0 ? '今' : `${d.getMonth() + 1}/${d.getDate()}`;
      result.push({
        label,
        date: dateStr,
        minutes: Math.round((stat?.secondsRead || 0) / 60),
        chars: stat?.charsRead || 0,
      });
    }
    return result;
  }, [dailyStats]);

  const totalSeconds = useMemo(
    () => dailyStats.reduce((sum, s) => sum + s.secondsRead, 0),
    [dailyStats]
  );

  const totalCharsRead = useMemo(
    () => dailyStats.reduce((sum, s) => sum + s.charsRead, 0),
    [dailyStats]
  );

  const activeDaysStreak = useMemo(() => {
    return dailyStats.filter((s) => s.secondsRead >= 60).length;
  }, [dailyStats]);

  const timeOfDayBreakdown = useMemo(() => {
    const buckets = [
      { name: '05–11', icon: Coffee, seconds: 0 },
      { name: '11–17', icon: Sun, seconds: 0 },
      { name: '17–21', icon: Sunset, seconds: 0 },
      { name: '21–05', icon: Moon, seconds: 0 },
    ];
    dailyStats.forEach((day) => {
      if (!Array.isArray(day.hourlyDistribution)) return;
      day.hourlyDistribution.forEach((sec, hr) => {
        if (hr >= 5 && hr < 11) buckets[0].seconds += sec;
        else if (hr >= 11 && hr < 17) buckets[1].seconds += sec;
        else if (hr >= 17 && hr < 21) buckets[2].seconds += sec;
        else buckets[3].seconds += sec;
      });
    });
    const maxSec = Math.max(1, ...buckets.map((b) => b.seconds));
    return buckets.map((b) => ({
      ...b,
      minutes: Math.round(b.seconds / 60),
      pct: Math.round((b.seconds / maxSec) * 100),
    }));
  }, [dailyStats]);

  const maxMinutesInWeek = Math.max(dailyGoalMinutes, ...last7Days.map((d) => d.minutes), 10);
  const todayMinutes = last7Days[last7Days.length - 1]?.minutes || 0;
  const goalCompletionPct = Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Compact Goal Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold sm:text-2xl">阅读统计</h1>

        <div
          className="flex flex-wrap items-center gap-1 rounded-xl p-1 sm:gap-1.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Target className="ml-1.5 h-4 w-4 shrink-0 sm:ml-2" style={{ color: 'var(--accent-primary)' }} />
          {[30, 45, 60, 90].map((goal) => (
            <button
              key={goal}
              onClick={() => onUpdateDailyGoal(goal)}
              className="min-h-[30px] rounded-lg px-2 py-1 font-mono-tabular text-xs font-medium transition-colors sm:min-h-[32px] sm:px-2.5"
              style={{
                backgroundColor:
                  dailyGoalMinutes === goal ? 'var(--accent-primary)' : 'transparent',
                color: dailyGoalMinutes === goal ? '#FFFFFF' : 'var(--text-secondary)',
              }}
            >
              {goal}m
            </button>
          ))}
        </div>
      </div>

      {/* 4 Compact Icon KPI Cards */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div
          className="flex min-w-0 items-center gap-3 rounded-2xl p-3.5 sm:gap-3.5 sm:p-4"
          style={{
            backgroundColor: 'var(--bg-page)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Clock className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" style={{ color: 'var(--accent-primary)' }} />
          <div className="min-w-0 flex-1">
            <p className="font-mono-tabular truncate text-lg font-bold sm:text-xl xl:text-2xl">
              {(totalSeconds / 3600).toFixed(1)}h
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>时长</p>
          </div>
        </div>

        <div
          className="flex min-w-0 items-center gap-3 rounded-2xl p-3.5 sm:gap-3.5 sm:p-4"
          style={{
            backgroundColor: 'var(--bg-page)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <TrendingUp className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" style={{ color: 'var(--accent-primary)' }} />
          <div className="min-w-0 flex-1">
            <p className="font-mono-tabular truncate text-lg font-bold sm:text-xl xl:text-2xl">
              {(totalCharsRead / 10000).toFixed(1)}w
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>字数</p>
          </div>
        </div>

        <div
          className="flex min-w-0 items-center gap-3 rounded-2xl p-3.5 sm:gap-3.5 sm:p-4"
          style={{
            backgroundColor: 'var(--bg-page)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Target className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" style={{ color: 'var(--accent-primary)' }} />
          <div className="min-w-0 flex-1">
            <p className="font-mono-tabular truncate text-lg font-bold sm:text-xl xl:text-2xl">
              {goalCompletionPct}%
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>今日</p>
          </div>
        </div>

        <div
          className="flex min-w-0 items-center gap-3 rounded-2xl p-3.5 sm:gap-3.5 sm:p-4"
          style={{
            backgroundColor: 'var(--bg-page)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Flame className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" style={{ color: 'var(--accent-primary)' }} />
          <div className="min-w-0 flex-1">
            <p className="font-mono-tabular truncate text-lg font-bold sm:text-xl xl:text-2xl">
              {activeDaysStreak}d · {annotations.length}
            </p>
            <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>打卡 · 书摘</p>
          </div>
        </div>
      </div>

      {/* 7-Day Chart & Time-of-Day Icons */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div
          className="min-w-0 overflow-hidden rounded-2xl p-4 sm:p-5 lg:col-span-7"
          style={{
            backgroundColor: 'var(--bg-page)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold">7 日趋势</span>
            <span
              className="font-mono-tabular shrink-0 text-xs"
              style={{ color: 'var(--accent-primary)' }}
            >
              目标 {dailyGoalMinutes}m
            </span>
          </div>

          <div className="mt-3 grid h-44 grid-cols-7 items-end gap-1.5 pt-2 sm:gap-3">
            {last7Days.map((day) => {
              const barHeightPct = Math.max(8, Math.round((day.minutes / maxMinutesInWeek) * 100));
              const reachedGoal = day.minutes >= dailyGoalMinutes;
              return (
                <div
                  key={day.date}
                  className="flex h-full min-w-0 flex-col items-center justify-end"
                >
                  <span
                    className="font-mono-tabular mb-1 max-w-full truncate text-[10px] leading-tight sm:text-[11px]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {day.minutes}
                  </span>
                  <div
                    className="flex min-h-0 w-full max-w-[36px] flex-1 items-end rounded-t-lg p-0.5"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    <div
                      className="w-full rounded-t-md transition-all duration-300"
                      style={{
                        height: `${barHeightPct}%`,
                        backgroundColor: reachedGoal
                          ? 'var(--accent-primary)'
                          : 'var(--border-strong)',
                      }}
                    />
                  </div>
                  <span
                    className="font-mono-tabular mt-1.5 max-w-full truncate text-[10px] leading-tight sm:text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="min-w-0 overflow-hidden rounded-2xl p-4 sm:p-5 lg:col-span-5"
          style={{
            backgroundColor: 'var(--bg-page)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <span className="text-xs font-semibold">时段节律</span>

          <div className="mt-5 space-y-4">
            {timeOfDayBreakdown.map((bucket) => {
              const Icon = bucket.icon;
              return (
                <div key={bucket.name} className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                  <span className="font-mono-tabular w-11 shrink-0 text-xs">{bucket.name}</span>
                  <div
                    className="h-2 min-w-0 flex-1 overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(bucket.pct, 4)}%`,
                        backgroundColor: 'var(--accent-primary)',
                      }}
                    />
                  </div>
                  <span
                    className="font-mono-tabular w-11 shrink-0 text-right text-xs"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {bucket.minutes}m
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-Book Progress List */}
      <div
        className="mt-5 overflow-hidden rounded-2xl p-4 sm:p-5"
        style={{
          backgroundColor: 'var(--bg-page)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {books.map((book) => {
            const pct =
              book.totalChars > 0
                ? Math.min(100, Math.round((book.currentOffset / book.totalChars) * 100))
                : 0;

            return (
              <div
                key={book.id}
                onClick={() => onOpenBook(book.id)}
                className="flex cursor-pointer items-center justify-between gap-3 py-3 sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-display truncate text-sm font-semibold">
                    《{book.title}》
                  </h3>
                </div>

                <div className="flex w-28 shrink-0 items-center gap-2 sm:w-52 sm:gap-3 md:w-64">
                  <div
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--bg-surface)' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(pct, book.currentOffset > 0 ? 4 : 0)}%`,
                        backgroundColor: 'var(--accent-primary)',
                      }}
                    />
                  </div>
                  <span className="font-mono-tabular w-9 shrink-0 text-right text-xs font-semibold">
                    {pct}%
                  </span>
                  <BookOpen className="h-4 w-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
