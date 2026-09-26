import { usePlayer } from "@/store/player";
import { useLibrary } from "@/store/library";
import { searchCatalog } from "./search";
import type { Track } from "./types";

const BG_KEY = "gmax.bg.autoplay";
const BG_QUEUE_KEY = "gmax.bg.queue";

let started = false;

function readFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(BG_KEY) === "1";
  } catch {
    return false;
  }
}

function writeFlag(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BG_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readQueue(): Track[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BG_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Track[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(tracks: Track[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BG_QUEUE_KEY, JSON.stringify(tracks.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

async function buildQueue(): Promise<Track[]> {
  const cached = readQueue();
  if (cached.length >= 6) return cached;
  const queries = [
    "hindi chill hits",
    "punjabi hits",
    "lofi chill beats",
    "bollywood romantic songs",
    "phonk drift music",
  ];
  const picked: Track[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    try {
      const res = await searchCatalog(q, { limit: 12 });
      for (const t of res.tracks) {
        const k = t.id || t.title.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        picked.push(t);
        if (picked.length >= 24) break;
      }
    } catch {
      /* try next query */
    }
    if (picked.length >= 24) break;
  }
  if (picked.length) writeQueue(picked);
  return picked;
}

/** Start background music if enabled and nothing is already playing. */
export async function startBackgroundMusic() {
  if (started) return;
  started = true;
  if (!readFlag()) return;
  const player = usePlayer.getState();
  if (player.current || player.isPlaying) return;
  const queue = await buildQueue();
  if (!queue.length) return;
  const first = queue[0]!;
  await player.playTrack(first, { tracks: queue, label: "Background" });
}

export function setBackgroundEnabled(on: boolean) {
  writeFlag(on);
  if (on) {
    void startBackgroundMusic();
  } else {
    const player = usePlayer.getState();
    if (player.contextLabel === "Background") {
      player.toggle();
    }
  }
}

export function isBackgroundEnabled(): boolean {
  return readFlag();
}

/** Call once from the app root to auto-start on load. */
export function initBackgroundMusic() {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    void startBackgroundMusic();
  }, 1800);
}
