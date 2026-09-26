import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Heart, RotateCcw, Trophy, Volume2, VolumeX } from "lucide-react";

/**
 * Arrow Puzzle Max — tap an arrow to slide it off the board if its path is clear.
 * Dense polyline arrows (like reference Brain Teaser / Infinite Levels screens).
 * Music continues in the background via the main player.
 */

type Dir = "up" | "down" | "left" | "right";

type Arrow = {
  id: number;
  pts: [number, number][];
  dir: Dir;
  cells: string[];
  escaped: boolean;
};

const CELL = 18;
const COLS = 16;
const ROWS = 20;

const DIRS: Record<Dir, { dx: number; dy: number }> = {
  right: { dx: 1, dy: 0 },
  left: { dx: -1, dy: 0 },
  down: { dx: 0, dy: 1 },
  up: { dx: 0, dy: -1 },
};

const ROT_DIRS: Dir[] = ["right", "down", "left", "up"];

const STORAGE_KEY = "gmax.arrowpuzzle.level";
const SOUND_KEY = "gmax.arrowpuzzle.sound";

function loadLevel(): number {
  try {
    return Math.max(1, parseInt(localStorage.getItem(STORAGE_KEY) || "1", 10) || 1);
  } catch {
    return 1;
  }
}

function saveLevel(n: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    /* */
  }
}

function loadSound(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "0";
  } catch {
    return true;
  }
}

function cellsOf(pts: [number, number][]): string[] {
  const cells: string[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[i + 1]!;
    if (x1 === x2) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) cells.push(`${x1},${y}`);
    } else {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) cells.push(`${x},${y1}`);
    }
  }
  return [...new Set(cells)];
}

function isNearOccupied(cell: string, occupied: Set<string>): boolean {
  if (occupied.has(cell)) return true;
  const [cx, cy] = cell.split(",").map(Number);
  return (
    occupied.has(`${cx! + 1},${cy}`) ||
    occupied.has(`${cx! - 1},${cy}`) ||
    occupied.has(`${cx},${cy! + 1}`) ||
    occupied.has(`${cx},${cy! - 1}`)
  );
}

const SPIRAL_TEMPLATES: [number, number][][] = [
  [
    [0, 2],
    [1, 2],
    [2, 1],
    [3, 1],
  ],
  [
    [0, 3],
    [1, 2],
    [2, 2],
    [3, 1],
  ],
  [
    [0, 2],
    [1, 3],
    [2, 2],
    [3, 2],
    [0, 1],
  ],
];

function tryWalk(
  x: number,
  y: number,
  steps: [number, number][],
  occupied: Set<string>,
  cells: string[],
  pts: [number, number][],
): { x: number; y: number; lastDir: Dir } | null {
  for (const [dirIdx, len] of steps) {
    const dir = ROT_DIRS[dirIdx]!;
    const { dx, dy } = DIRS[dir];
    const nx = x + dx * len;
    const ny = y + dy * len;
    if (nx < 0 || nx > COLS || ny < 0 || ny > ROWS) return null;
    const segCells: string[] = [];
    for (let i = 1; i <= len; i++) segCells.push(`${x + dx * i},${y + dy * i}`);
    if (segCells.some((c) => isNearOccupied(c, occupied) || cells.includes(c))) return null;
    cells.push(...segCells);
    x = nx;
    y = ny;
    pts.push([x, y]);
  }
  return { x, y, lastDir: ROT_DIRS[steps[steps.length - 1]![0]]! };
}

function buildArrow(
  occupied: Set<string>,
  segRange: [number, number],
  lenRange: [number, number],
  allowSpiral: boolean,
): Omit<Arrow, "id" | "escaped"> | null {
  const dirKeys = Object.keys(DIRS) as Dir[];
  for (let tries = 0; tries < 50; tries++) {
    let x = Math.floor(Math.random() * (COLS + 1));
    let y = Math.floor(Math.random() * (ROWS + 1));
    const pts: [number, number][] = [[x, y]];
    const cells: string[] = [];
    let lastDir: Dir | null = null;

    if (allowSpiral && Math.random() < 0.35) {
      const rot = Math.floor(Math.random() * 4);
      const tpl = SPIRAL_TEMPLATES[Math.floor(Math.random() * SPIRAL_TEMPLATES.length)]!.map(
        ([d, l]) => [(d! + rot) % 4, l!] as [number, number],
      );
      const res = tryWalk(x, y, tpl, occupied, cells, pts);
      if (!res) continue;
      x = res.x;
      y = res.y;
      lastDir = res.lastDir;
    }

    const segs = segRange[0] + Math.floor(Math.random() * (segRange[1] - segRange[0] + 1));
    let dir: Dir | null = lastDir;
    let ok = true;
    for (let s = 0; s < segs; s++) {
      const choices = dirKeys.filter(
        (k) =>
          !lastDir ||
          DIRS[k].dx !== -DIRS[lastDir].dx ||
          DIRS[k].dy !== -DIRS[lastDir].dy,
      );
      dir = choices[Math.floor(Math.random() * choices.length)]!;
      const { dx, dy } = DIRS[dir];
      const len = lenRange[0] + Math.floor(Math.random() * (lenRange[1] - lenRange[0] + 1));
      const nx = x + dx * len;
      const ny = y + dy * len;
      if (nx < 0 || nx > COLS || ny < 0 || ny > ROWS) {
        ok = false;
        break;
      }
      const segCells: string[] = [];
      for (let i = 1; i <= len; i++) segCells.push(`${x + dx * i},${y + dy * i}`);
      if (segCells.some((c) => isNearOccupied(c, occupied) || cells.includes(c))) {
        ok = false;
        break;
      }
      cells.push(...segCells);
      x = nx;
      y = ny;
      pts.push([x, y]);
      lastDir = dir;
    }
    if (!ok || !dir || pts.length < 2) continue;

    // Must have a clear escape ray from tip (solvable bias)
    const { dx, dy } = DIRS[dir];
    let cx = x + dx;
    let cy = y + dy;
    let blocked = false;
    while (cx >= 0 && cx <= COLS && cy >= 0 && cy <= ROWS) {
      if (occupied.has(`${cx},${cy}`)) {
        blocked = true;
        break;
      }
      cx += dx;
      cy += dy;
    }
    if (blocked) continue;

    return { pts, dir, cells: [...new Set(cells)] };
  }
  return null;
}

function generateLevel(levelNum: number): Arrow[] {
  const maxSegs = Math.min(3 + Math.floor(levelNum / 3), 7);
  const maxLen = levelNum > 8 ? 3 : 2;
  const placed: Arrow[] = [];
  const occupied = new Set<string>();

  const place = (
    segRange: [number, number],
    lenRange: [number, number],
    tries: number,
    allowSpiral: boolean,
  ) => {
    for (let a = 0; a < tries; a++) {
      const arrow = buildArrow(occupied, segRange, lenRange, allowSpiral);
      if (!arrow) continue;
      const id = placed.length + 1;
      arrow.cells.forEach((c) => occupied.add(c));
      placed.push({ ...arrow, id, escaped: false });
    }
  };

  // Dense pass — reference screens are packed
  place([2, maxSegs], [1, maxLen], 8000, true);
  place([1, 2], [1, 2], 5000, false);
  place([1, 1], [1, 1], 3000, false);

  // Ensure at least a few arrows
  if (placed.length < 6) {
    place([1, 2], [1, 2], 4000, true);
  }

  return placed;
}

// —— Audio (does not touch main music player) ——
let audioCtx: AudioContext | null = null;

function playSfx(type: "escape" | "bump" | "win", enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const now = audioCtx.currentTime;
    if (type === "escape") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.3);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (type === "bump") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = "triangle";
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.linearRampToValueAtTime(90, now + 0.12);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else {
      [523, 659, 784].forEach((f, i) => {
        const o = audioCtx!.createOscillator();
        const g = audioCtx!.createGain();
        o.connect(g);
        g.connect(audioCtx!.destination);
        o.type = "sine";
        o.frequency.setValueAtTime(f, now + i * 0.09);
        g.gain.setValueAtTime(0.18, now + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.09 + 0.25);
        o.start(now + i * 0.09);
        o.stop(now + i * 0.09 + 0.25);
      });
    }
  } catch {
    /* */
  }
}

function checkCollision(arrow: Arrow, state: Arrow[]): boolean {
  const [hX, hY] = arrow.pts[arrow.pts.length - 1]!;
  const { dx, dy } = DIRS[arrow.dir];
  let cx = hX + dx;
  let cy = hY + dy;
  while (cx >= 0 && cx <= COLS && cy >= 0 && cy <= ROWS) {
    const key = `${cx},${cy}`;
    for (const other of state) {
      if (!other.escaped && other.id !== arrow.id && other.cells.includes(key)) return true;
    }
    cx += dx;
    cy += dy;
  }
  return false;
}

type Props = { onBack: () => void };

export function MazeGame({ onBack }: Props) {
  const [level, setLevel] = useState(loadLevel);
  const [arrows, setArrows] = useState<Arrow[]>(() => generateLevel(loadLevel()));
  const [mistakes, setMistakes] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [won, setWon] = useState(false);
  const [soundOn, setSoundOn] = useState(loadSound);
  const [bumpId, setBumpId] = useState<number | null>(null);
  const [escapingId, setEscapingId] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const rebuild = useCallback((lv: number) => {
    setLevel(lv);
    setArrows(generateLevel(lv));
    setMistakes(0);
    setWon(false);
    setAnimating(false);
    setBumpId(null);
    setEscapingId(null);
  }, []);

  useEffect(() => {
    rebuild(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = (arrow: Arrow) => {
    if (arrow.escaped || animating || won) return;
    const blocked = checkCollision(arrow, arrows);
    setAnimating(true);

    if (blocked) {
      playSfx("bump", soundOn);
      const nextMistakes = mistakes + 1;
      setMistakes(nextMistakes);
      setBumpId(arrow.id);
      window.setTimeout(() => {
        setBumpId(null);
        setAnimating(false);
        if (nextMistakes >= 3) {
          window.setTimeout(() => rebuild(level), 300);
        }
      }, 320);
      return;
    }

    playSfx("escape", soundOn);
    setEscapingId(arrow.id);
    window.setTimeout(() => {
      setArrows((prev) => {
        const next = prev.map((a) => (a.id === arrow.id ? { ...a, escaped: true } : a));
        if (next.every((a) => a.escaped)) {
          playSfx("win", soundOn);
          setWon(true);
          const nextLv = level + 1;
          saveLevel(nextLv);
        }
        return next;
      });
      setEscapingId(null);
      setAnimating(false);
    }, 480);
  };

  const nextLevel = () => {
    const next = level + 1;
    saveLevel(next);
    rebuild(next);
  };

  const toggleSound = () => {
    const v = !soundOn;
    setSoundOn(v);
    try {
      localStorage.setItem(SOUND_KEY, v ? "1" : "0");
    } catch {
      /* */
    }
  };

  const vbW = COLS * CELL;
  const vbH = ROWS * CELL;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg text-fg">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-3 pt-[calc(12px+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          className="grid size-9 place-items-center rounded-full bg-lift"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Arrow Puzzle</p>
          <p className="text-[11px] text-muted">Level {level} · Escape every arrow</p>
        </div>
        <div className="flex items-center gap-1 text-accent">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart
              key={i}
              size={16}
              className={i < 3 - mistakes ? "opacity-100" : "opacity-25"}
              fill={i < 3 - mistakes ? "currentColor" : "none"}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={toggleSound}
          className="grid size-9 place-items-center rounded-full bg-lift text-muted"
          aria-label="Toggle sound"
        >
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button
          type="button"
          onClick={() => rebuild(level)}
          className="grid size-9 place-items-center rounded-full bg-lift"
          aria-label="Reset"
        >
          <RotateCcw size={16} />
        </button>
      </header>

      <div className="relative flex flex-1 flex-col items-center justify-center px-2 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <p className="mb-2 text-[12px] font-semibold tracking-wide text-muted">LEVEL {level}</p>

        <div
          className="relative w-full max-w-[380px] overflow-hidden rounded-xl border border-line bg-raised"
          style={{
            height: "min(68vh, 460px)",
            backgroundImage: "radial-gradient(var(--color-line, #333) 1.2px, transparent 1.2px)",
            backgroundSize: "16px 16px",
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${vbW} ${vbH}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
          >
            {arrows
              .filter((a) => !a.escaped || escapingId === a.id)
              .map((arrow) => {
                const isBump = bumpId === arrow.id;
                const isEsc = escapingId === arrow.id;
                const { dx, dy } = DIRS[arrow.dir];
                let d = `M ${arrow.pts[0]![0] * CELL} ${arrow.pts[0]![1] * CELL}`;
                for (let i = 1; i < arrow.pts.length; i++) {
                  d += ` L ${arrow.pts[i]![0] * CELL} ${arrow.pts[i]![1] * CELL}`;
                }
                const tip = arrow.pts[arrow.pts.length - 1]!;
                const tx = tip[0] * CELL;
                const ty = tip[1] * CELL;
                const sz = 5;
                let tipD = "";
                if (arrow.dir === "up") tipD = `M ${tx - sz} ${ty + sz} L ${tx} ${ty} L ${tx + sz} ${ty + sz}`;
                if (arrow.dir === "down") tipD = `M ${tx - sz} ${ty - sz} L ${tx} ${ty} L ${tx + sz} ${ty - sz}`;
                if (arrow.dir === "left") tipD = `M ${tx + sz} ${ty - sz} L ${tx} ${ty} L ${tx + sz} ${ty + sz}`;
                if (arrow.dir === "right") tipD = `M ${tx - sz} ${ty - sz} L ${tx} ${ty} L ${tx - sz} ${ty + sz}`;

                return (
                  <g
                    key={arrow.id}
                    onClick={() => handleTap(arrow)}
                    style={{
                      cursor: "pointer",
                      transition: isBump
                        ? "transform 0.14s ease-out"
                        : isEsc
                          ? "opacity 0.45s ease, transform 0.45s ease"
                          : "transform 0.2s ease",
                      transform: isBump
                        ? `translate(${dx * 14}px, ${dy * 14}px)`
                        : isEsc
                          ? `translate(${dx * 40}px, ${dy * 40}px)`
                          : undefined,
                      opacity: isEsc ? 0 : 1,
                    }}
                  >
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                    <path
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3.2}
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                      className="text-fg"
                    />
                    <path
                      d={tipD}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3.2}
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                      className="text-fg"
                    />
                  </g>
                );
              })}
          </svg>

          {won ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg/70 p-4 backdrop-blur-sm">
              <div className="w-full max-w-xs rounded-2xl border border-line bg-raised p-6 text-center shadow-xl">
                <Trophy className="mx-auto mb-2 text-accent" size={36} />
                <p className="text-lg font-semibold">
                  {mistakes === 0 ? "Perfect Clear!" : "Level Cleared!"}
                </p>
                <p className="mt-1 text-sm text-muted">Level {level} done · music still playing</p>
                <button
                  type="button"
                  onClick={nextLevel}
                  className="mt-5 h-12 w-full rounded-full bg-accent text-sm font-semibold text-bg"
                >
                  NEXT LEVEL
                </button>
                <button type="button" onClick={onBack} className="mt-3 text-sm text-muted">
                  Back to Settings
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <p className="mt-3 max-w-sm text-center text-[11px] text-muted">
          Tap an arrow — if the path ahead is clear it escapes. Clear all arrows. 3 bumps = retry.
        </p>
      </div>
    </div>
  );
}
