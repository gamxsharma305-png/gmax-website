import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Droplets, RotateCcw, Trophy } from "lucide-react";

/** 0=up 1=right 2=down 3=left */
type Dir = 0 | 1 | 2 | 3;
type Cell = Dir | null;

type Level = {
  id: number;
  size: number;
  grid: Cell[];
  start: number;
  goal: number;
  hard?: boolean;
};

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

function idx(r: number, c: number, size: number) {
  return r * size + c;
}

function rotate(d: Dir): Dir {
  return ((d + 1) % 4) as Dir;
}

function trace(grid: Cell[], size: number, start: number, goal: number, maxSteps = 80): number[] | null {
  const path: number[] = [start];
  let cur = start;
  const seen = new Set<number>([start]);
  for (let step = 0; step < maxSteps; step++) {
    if (cur === goal) return path;
    const d = grid[cur];
    if (d == null) return null;
    const r = Math.floor(cur / size);
    const c = cur % size;
    const nr = r + DR[d];
    const nc = c + DC[d];
    if (nr < 0 || nc < 0 || nr >= size || nc >= size) return null;
    const next = idx(nr, nc, size);
    if (seen.has(next)) return null;
    seen.add(next);
    path.push(next);
    cur = next;
  }
  return cur === goal ? path : null;
}

function pathLevel(
  id: number,
  size: number,
  pathCells: [number, number][],
  scramble: number[],
  hard = false,
): Level {
  const grid: Cell[] = Array(size * size).fill(null);
  for (let i = 0; i < pathCells.length - 1; i++) {
    const [r, c] = pathCells[i]!;
    const [r2, c2] = pathCells[i + 1]!;
    let d: Dir = 1;
    if (r2 < r) d = 0;
    else if (c2 > c) d = 1;
    else if (r2 > r) d = 2;
    else d = 3;
    grid[idx(r, c, size)] = d;
  }
  const last = pathCells[pathCells.length - 1]!;
  grid[idx(last[0], last[1], size)] = 1;
  for (const pi of scramble) {
    const cell = pathCells[pi];
    if (!cell) continue;
    const i = idx(cell[0], cell[1], size);
    const cur = grid[i];
    if (cur != null) grid[i] = rotate(rotate(cur));
  }
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] == null && (i * 7 + id) % 5 > 2) {
      grid[i] = ((i + id) % 4) as Dir;
    }
  }
  const start = idx(pathCells[0]![0], pathCells[0]![1], size);
  const goal = idx(last[0], last[1], size);
  return { id, size, grid, start, goal, hard };
}

function buildLevels(): Level[] {
  const levels: Level[] = [];
  levels.push(pathLevel(1, 3, [[1, 0], [1, 1], [1, 2]], [1]));
  levels.push(pathLevel(2, 3, [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]], [2]));
  levels.push(pathLevel(3, 3, [[0, 1], [1, 1], [1, 2], [2, 2], [2, 1], [2, 0]], [1, 3]));
  levels.push(pathLevel(4, 4, [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 3], [3, 3]], [2, 4]));
  levels.push(pathLevel(5, 4, [[1, 0], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1]], [1, 3, 5], true));
  levels.push(pathLevel(6, 4, [[0, 3], [0, 2], [0, 1], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3]], [0, 2, 4]));
  levels.push(pathLevel(7, 5, [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2], [2, 3], [3, 3], [4, 3], [4, 4]], [1, 3, 5]));
  levels.push(pathLevel(8, 5, [[2, 0], [2, 1], [1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [2, 4], [3, 4], [4, 4]], [2, 4, 6], true));
  levels.push(pathLevel(9, 5, [[4, 0], [3, 0], [2, 0], [1, 0], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 4], [4, 4]], [1, 3, 5, 7]));
  levels.push(pathLevel(10, 5, [[0, 2], [1, 2], [2, 2], [2, 1], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [4, 3], [4, 4]], [0, 2, 4, 6], true));
  for (let n = 11; n <= 20; n++) {
    const size = n <= 14 ? 5 : 6;
    const path: [number, number][] = [];
    let r = 0;
    let c = 0;
    path.push([r, c]);
    const steps = size * 2 + (n % 3);
    for (let s = 0; s < steps; s++) {
      if (s % 2 === 0) c = Math.min(size - 1, c + 1);
      else r = Math.min(size - 1, r + 1);
      if (path[path.length - 1]![0] !== r || path[path.length - 1]![1] !== c) path.push([r, c]);
    }
    while (r < size - 1 || c < size - 1) {
      if (c < size - 1) c++;
      else r++;
      path.push([r, c]);
    }
    const scramble = path
      .map((_, i) => i)
      .filter((i) => i > 0 && i < path.length - 1 && (i + n) % 3 === 0)
      .slice(0, 4 + (n % 3));
    levels.push(pathLevel(n, size, path, scramble, n >= 15));
  }
  return levels;
}

const LEVELS = buildLevels();
const STORAGE_KEY = "gmax.maze.progress";

function loadProgress(): { level: number; best: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { level: 1, best: 1 };
    const p = JSON.parse(raw) as { level?: number; best?: number };
    return { level: Math.max(1, p.level || 1), best: Math.max(1, p.best || 1) };
  } catch {
    return { level: 1, best: 1 };
  }
}

function saveProgress(level: number, best: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, best }));
  } catch {
    /* ignore */
  }
}

function ArrowIcon({ dir, active, size = 22 }: { dir: Dir; active?: boolean; size?: number }) {
  const rot = dir * 90;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: `rotate(${rot}deg)`, transition: "transform 0.18s ease" }}
      className={active ? "text-accent" : "text-fg"}
    >
      <path
        d="M12 4v14M12 4l-5 5M12 4l5 5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = { onBack: () => void };

export function MazeGame({ onBack }: Props) {
  const [progress, setProgress] = useState(loadProgress);
  const [levelId, setLevelId] = useState(progress.level);
  const level = LEVELS[Math.min(LEVELS.length, Math.max(1, levelId)) - 1]!;
  const [grid, setGrid] = useState<Cell[]>(() => [...level.grid]);
  const [lives, setLives] = useState(3);
  const [path, setPath] = useState<number[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [screen, setScreen] = useState<"play" | "win" | "dead">("play");

  const resetLevel = useCallback((id: number) => {
    const L = LEVELS[Math.min(LEVELS.length, Math.max(1, id)) - 1]!;
    setLevelId(L.id);
    setGrid([...L.grid]);
    setLives(3);
    setPath(null);
    setChecking(false);
    setScreen("play");
  }, []);

  useEffect(() => {
    resetLevel(levelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTap = (i: number) => {
    if (screen !== "play" || checking) return;
    const cell = grid[i];
    if (cell == null) return;
    setGrid((g) => {
      const next = [...g];
      next[i] = rotate(cell);
      return next;
    });
    setPath(null);
  };

  const check = () => {
    if (checking) return;
    setChecking(true);
    const p = trace(grid, level.size, level.start, level.goal);
    if (p) {
      setPath(p);
      setScreen("win");
      const nextBest = Math.max(progress.best, level.id + 1);
      const nextLevel = Math.min(LEVELS.length, level.id + 1);
      setProgress({ level: nextLevel, best: nextBest });
      saveProgress(nextLevel, nextBest);
    } else {
      setLives((v) => {
        const n = v - 1;
        if (n <= 0) setScreen("dead");
        return n;
      });
      setTimeout(() => setChecking(false), 280);
      return;
    }
    setChecking(false);
  };

  const pathSet = useMemo(() => new Set(path || []), [path]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg text-fg">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-3 pt-[calc(12px+env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} className="grid size-9 place-items-center rounded-full bg-lift" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            Level {level.id}
            {level.hard ? <span className="ml-2 text-[10px] text-accent">HARD</span> : null}
          </p>
          <p className="text-[11px] text-muted">Tap arrows to rotate · path start → end</p>
        </div>
        <div className="flex items-center gap-1 text-accent">
          {Array.from({ length: 3 }).map((_, i) => (
            <Droplets key={i} size={16} className={i < lives ? "opacity-100" : "opacity-25"} fill={i < lives ? "currentColor" : "none"} />
          ))}
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-8">
        {screen === "play" ? (
          <>
            <div
              className="grid gap-1.5 rounded-2xl border border-line bg-raised p-3"
              style={{ gridTemplateColumns: `repeat(${level.size}, minmax(0, 1fr))`, width: "min(92vw, 340px)" }}
            >
              {grid.map((cell, i) => {
                const isStart = i === level.start;
                const isGoal = i === level.goal;
                const onPath = pathSet.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onTap(i)}
                    disabled={cell == null}
                    className={`aspect-square grid place-items-center rounded-lg transition-colors ${
                      cell == null
                        ? "bg-transparent"
                        : onPath
                          ? "bg-accent/25"
                          : isStart
                            ? "bg-fg/15 ring-1 ring-fg/40"
                            : isGoal
                              ? "bg-accent/20 ring-1 ring-accent/50"
                              : "bg-lift active:bg-fg/10"
                    }`}
                  >
                    {cell != null ? <ArrowIcon dir={cell} active={onPath || isStart} /> : null}
                  </button>
                );
              })}
            </div>
            <p className="text-center text-[12px] text-muted">Start ringed · Goal tinted · Music keeps playing</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => resetLevel(level.id)} className="flex h-11 items-center gap-2 rounded-full border border-line bg-raised px-4 text-sm">
                <RotateCcw size={16} /> Reset
              </button>
              <button type="button" onClick={check} className="h-11 rounded-full bg-accent px-6 text-sm font-semibold text-bg">
                Check path
              </button>
            </div>
          </>
        ) : null}

        {screen === "win" ? (
          <div className="w-full max-w-sm rounded-2xl border border-line bg-raised p-6 text-center">
            <Trophy className="mx-auto mb-2 text-accent" size={36} />
            <p className="text-xl font-semibold">Flawless!</p>
            <p className="mt-1 text-sm text-muted">Level {level.id} cleared</p>
            <button
              type="button"
              onClick={() => resetLevel(Math.min(LEVELS.length, level.id + 1))}
              className="mt-5 h-12 w-full rounded-full bg-accent text-sm font-semibold text-bg"
            >
              {level.id >= LEVELS.length ? "Replay last" : "Next Level"}
            </button>
            <button type="button" onClick={onBack} className="mt-3 text-sm text-muted">
              Back to Settings
            </button>
          </div>
        ) : null}

        {screen === "dead" ? (
          <div className="w-full max-w-sm rounded-2xl border border-line bg-raised p-6 text-center">
            <p className="text-xl font-semibold">Out of lives</p>
            <p className="mt-1 text-sm text-muted">Song still playing — try again</p>
            <button type="button" onClick={() => resetLevel(level.id)} className="mt-5 h-12 w-full rounded-full bg-accent text-sm font-semibold text-bg">
              Retry
            </button>
            <button type="button" onClick={onBack} className="mt-3 text-sm text-muted">
              Back to Settings
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
