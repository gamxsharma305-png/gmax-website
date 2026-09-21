import { useMemo } from "react";
import type { HistoryEntry } from "@/lib/gmax/types";
import { useLibrary } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { TrackRow } from "./TrackRow";

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupByDay(entries: HistoryEntry[]) {
  const today = startOfDay(Date.now());
  const sections: { title: string; data: HistoryEntry[] }[] = [];
  let current: { title: string; data: HistoryEntry[] } | null = null;
  for (const entry of entries) {
    const age = today - startOfDay(entry.playedAt);
    const title =
      age <= 0 ? "Today" : age === DAY ? "Yesterday" : age < 7 * DAY ? "Earlier this week" : "Older";
    if (!current || current.title !== title) {
      current = { title, data: [] };
      sections.push(current);
    }
    current.data.push(entry);
  }
  return sections;
}

export function HistoryView() {
  const history = useLibrary((s) => s.history);
  const clearHistory = useLibrary((s) => s.clearHistory);
  const playTrack = usePlayer((s) => s.playTrack);
  const currentId = usePlayer((s) => s.current?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const setAddingTrack = useUi((s) => s.setAddingTrack);
  const sections = useMemo(() => groupByDay(history), [history]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end justify-between px-4 pb-3 pt-[calc(18px+env(safe-area-inset-top))]">
        <h1 className="font-display text-[28px] font-semibold">History</h1>
        {history.length ? (
          <button type="button" className="text-xs text-muted" onClick={clearHistory}>
            Clear
          </button>
        ) : null}
      </div>
      <div className="gmax-scroll px-4">
        {sections.length === 0 ? (
          <div className="rounded-md border border-line bg-glass p-4">
            <p className="text-sm font-medium">Nothing played yet</p>
            <p className="mt-1 text-xs text-muted">Tracks you play will land here.</p>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.title} className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-muted">{section.title}</h2>
              {section.data.map((entry) => (
                <TrackRow
                  key={entry.id}
                  track={entry.track}
                  onPress={(t) =>
                    void playTrack(t, {
                      tracks: history.map((e) => e.track),
                      label: "History",
                    })
                  }
                  onMore={setAddingTrack}
                  isPlaying={currentId === entry.track.id && isPlaying}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
