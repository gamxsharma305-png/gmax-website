import type { Category } from "./types";

export const APP_NAME = "GMAX";
export const APP_TAGLINE = "YOUR MUSIC. YOUR WAY.";
export const APP_VERSION = "1.0.0";

export const BROWSE_CATEGORIES: Category[] = [
  { id: "c1", name: "Charts", color: "#3d9a68", query: "top hits this week" },
  { id: "c2", name: "New Releases", color: "#6b7c93", query: "new music releases" },
  { id: "c3", name: "Moods", color: "#c4785a", query: "chill mood playlist" },
  { id: "c4", name: "Indian", color: "#b08a3a", query: "bollywood hits" },
  { id: "c5", name: "Hip-Hop", color: "#4a7aa3", query: "hip hop essentials" },
  { id: "c6", name: "Pop", color: "#c46b8a", query: "pop hits" },
  { id: "c7", name: "EDM", color: "#3aa8ad", query: "edm dance mix" },
  { id: "c8", name: "Rock", color: "#a34545", query: "rock classics" },
];

export const ACTION_QUERIES: Record<string, string[]> = {
  discover: [
    "trending songs this week",
    "viral hits right now",
    "top global chart songs",
    "new music this month",
    "most played songs today",
  ],
  chill: [
    "chill relaxing songs",
    "lofi chill beats",
    "acoustic chill playlist",
    "calm indie chill",
    "sunset chill mix",
  ],
  focus: [
    "focus instrumental concentration",
    "deep focus study music",
    "ambient focus no lyrics",
    "piano focus instrumental",
  ],
};

export function randomQueryFor(actionId: string): string | null {
  const pool = ACTION_QUERIES[actionId];
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export const FEATURED_QUERY = "calm ambient evening";
