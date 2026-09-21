import { create } from "zustand";
import type { Track } from "@/lib/gmax/types";

export type TabId = "home" | "search" | "history" | "library";
export type Overlay = "none" | "nowplaying" | "settings" | "playlist";

type UiState = {
  tab: TabId;
  overlay: Overlay;
  playlistId: string | null;
  addingTrack: Track | null;
  setTab: (tab: TabId) => void;
  openNowPlaying: () => void;
  openSettings: () => void;
  openPlaylist: (id: string) => void;
  closeOverlay: () => void;
  setAddingTrack: (track: Track | null) => void;
};

export const useUi = create<UiState>((set) => ({
  tab: "home",
  overlay: "none",
  playlistId: null,
  addingTrack: null,
  setTab: (tab) => set({ tab, overlay: "none" }),
  openNowPlaying: () => set({ overlay: "nowplaying" }),
  openSettings: () => set({ overlay: "settings" }),
  openPlaylist: (id) => set({ overlay: "playlist", playlistId: id }),
  closeOverlay: () => set({ overlay: "none", playlistId: null }),
  setAddingTrack: (track) => set({ addingTrack: track }),
}));
