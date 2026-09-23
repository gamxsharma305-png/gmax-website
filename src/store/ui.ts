import { create } from "zustand";
import type { Track } from "@/lib/gmax/types";

export type TabId = "home" | "search" | "history" | "library";
export type Overlay = "none" | "nowplaying" | "settings" | "playlist";

type UiState = {
  tab: TabId;
  overlay: Overlay;
  playlistId: string | null;
  addingTrack: Track | null;
  /** Floating ball mini-player (in-app PiP look) */
  floatBall: boolean;
  setTab: (tab: TabId) => void;
  openNowPlaying: () => void;
  openSettings: () => void;
  openPlaylist: (id: string) => void;
  closeOverlay: () => void;
  setAddingTrack: (track: Track | null) => void;
  enterFloatBall: () => void;
  exitFloatBall: () => void;
};

export const useUi = create<UiState>((set) => ({
  tab: "home",
  overlay: "none",
  playlistId: null,
  addingTrack: null,
  floatBall: false,
  setTab: (tab) => set({ tab, overlay: "none" }),
  openNowPlaying: () => set({ overlay: "nowplaying", floatBall: false }),
  openSettings: () => set({ overlay: "settings", floatBall: false }),
  openPlaylist: (id) => set({ overlay: "playlist", playlistId: id, floatBall: false }),
  closeOverlay: () => set({ overlay: "none", playlistId: null }),
  setAddingTrack: (track) => set({ addingTrack: track }),
  enterFloatBall: () => set({ floatBall: true, overlay: "none", playlistId: null }),
  exitFloatBall: () => set({ floatBall: false }),
}));
