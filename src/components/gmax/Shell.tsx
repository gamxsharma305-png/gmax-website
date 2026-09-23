import { Clock, Home as HomeIcon, Library, Search } from "lucide-react";
import type { TabId } from "@/store/ui";
import { usePlayer } from "@/store/player";
import { useUi } from "@/store/ui";
import { Home } from "./Home";
import { SearchView } from "./SearchView";
import { HistoryView } from "./HistoryView";
import { LibraryView } from "./LibraryView";
import { MiniPlayer } from "./MiniPlayer";
import { FloatBall } from "./FloatBall";
import { NowPlaying } from "./NowPlaying";
import { SettingsView } from "./SettingsView";
import { PlaylistView } from "./PlaylistView";
import { AddToPlaylist } from "./AddToPlaylist";

const TABS: { id: TabId; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
  { id: "search", label: "Search", Icon: Search },
  { id: "history", label: "History", Icon: Clock },
  { id: "library", label: "Library", Icon: Library },
];

export function Shell() {
  const tab = useUi((s) => s.tab);
  const overlay = useUi((s) => s.overlay);
  const floatBall = useUi((s) => s.floatBall);
  const setTab = useUi((s) => s.setTab);
  const hasTrack = usePlayer((s) => Boolean(s.current));

  return (
    <div className="relative h-full">
      <div className="h-full">
        {tab === "home" ? <Home /> : null}
        {tab === "search" ? <SearchView /> : null}
        {tab === "history" ? <HistoryView /> : null}
        {tab === "library" ? <LibraryView /> : null}
      </div>

      {hasTrack && !floatBall ? <MiniPlayer /> : null}
      {hasTrack && floatBall ? <FloatBall /> : null}

      <nav className="absolute inset-x-0 bottom-0 z-20 border-t border-hairline bg-raised pb-[env(safe-area-inset-bottom)]">
        <div className="grid h-[68px] grid-cols-4">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-col items-center justify-center gap-1 text-[10px] ${
                  active ? "text-fg" : "text-muted"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {overlay === "nowplaying" ? <NowPlaying /> : null}
      {overlay === "settings" ? <SettingsView /> : null}
      {overlay === "playlist" ? <PlaylistView /> : null}
      <AddToPlaylist />
    </div>
  );
}
