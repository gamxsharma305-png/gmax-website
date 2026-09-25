import type { Category } from "./types";

export const APP_NAME = "GMAX";
export const APP_TAGLINE = "YOUR MUSIC. YOUR WAY.";
export const APP_VERSION = "1.1.0";

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

/** One-tap auto playlists by genre / mood — filled live from search. */
export const AUTO_PLAYLISTS: {
  id: string;
  name: string;
  color: string;
  query: string;
  description: string;
}[] = [
  { id: "auto-punjabi", name: "Punjabi Hits", color: "#e8b84a", query: "punjabi hits songs", description: "Top Punjabi" },
  { id: "auto-hindi", name: "Hindi Hits", color: "#e07a5f", query: "bollywood hindi hits", description: "Bollywood" },
  { id: "auto-love", name: "Love Songs", color: "#e056a0", query: "romantic love songs hindi", description: "Romantic" },
  { id: "auto-lofi", name: "Lo-fi Chill", color: "#7c9cbf", query: "lofi chill beats", description: "Study & chill" },
  { id: "auto-funk", name: "Funk & Groove", color: "#c45c26", query: "funk groove songs", description: "Funk" },
  { id: "auto-phonk", name: "Phonk", color: "#6b4ce6", query: "phonk drift music", description: "Drift phonk" },
  { id: "auto-hiphop", name: "Hip-Hop", color: "#4a7aa3", query: "hip hop rap hits", description: "Rap & hip-hop" },
  { id: "auto-edm", name: "EDM Party", color: "#3aa8ad", query: "edm dance party mix", description: "Dance" },
  { id: "auto-sad", name: "Sad Songs", color: "#6b7c93", query: "sad emotional songs hindi", description: "Heartbreak" },
  { id: "auto-party", name: "Party Mix", color: "#d4a017", query: "party dance bollywood", description: "Party" },
  { id: "auto-english", name: "English Pop", color: "#c46b8a", query: "english pop hits 2024", description: "Pop" },
  { id: "auto-ghazal", name: "Ghazal / Soft", color: "#8b7355", query: "ghazal soft hindi songs", description: "Soft" },
];

export const ACTION_QUERIES: Record<string, string[]> = {
  discover: [
    "trending songs this week",
    "viral hits right now",
    "top global chart songs",
    "new music this month",
    "most played songs today",
  ],
  // Chill → Dean × Luffy style: Indian / Hindi soft + Luffy vibes. Fresh mix every tap.
  chill: [
    "Dean Luffy hindi songs",
    "Dean and Luffy indian chill",
    "Luffy hindi soft songs",
    "Dean Luffy bollywood chill",
    "indian lofi Luffy Dean",
    "hindi chill Dean Luffy mix",
    "Dean Luffy romantic hindi",
    "soft indian songs Luffy style",
  ],
  // Focus → Punjabi heat: Sidhu Moose Wala, Shubh, top Punjabi. Instant play on tap.
  focus: [
    "Sidhu Moose Wala hits",
    "Sidhu Moose Wala best songs",
    "Shubh punjabi songs",
    "Shubh hits punjabi",
    "punjabi hits Sidhu Moose Wala",
    "top punjabi songs Sidhu Shubh",
    "Sidhu Moosewala latest",
    "punjabi focus workout Sidhu",
  ],
};

export function randomQueryFor(actionId: string): string | null {
  const pool = ACTION_QUERIES[actionId];
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export const FEATURED_QUERY = "calm ambient evening";
