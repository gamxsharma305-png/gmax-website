import { useState } from "react";
import { ChevronLeft, User } from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/gmax/catalog";
import type { Gender } from "@/lib/gmax/types";
import { useLibrary } from "@/store/library";
import { useUi } from "@/store/ui";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

export function SettingsView() {
  const close = useUi((s) => s.closeOverlay);
  const profile = useLibrary((s) => s.profile);
  const saveProfile = useLibrary((s) => s.saveProfile);
  const liked = useLibrary((s) => s.liked);
  const playlists = useLibrary((s) => s.playlists);
  const history = useLibrary((s) => s.history);
  const [name, setName] = useState(profile.name);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg">
      <div className="flex items-center gap-2 px-2 pb-2 pt-[calc(12px+env(safe-area-inset-top))]">
        <button type="button" onClick={close} className="grid size-11 place-items-center" aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <h1 className="font-display text-xl font-semibold">Settings</h1>
      </div>
      <div className="gmax-scroll px-4">
        <p className="mb-2 mt-4 text-[11px] tracking-[0.22em] text-faint">PROFILE</p>
        <div className="rounded-md border border-line bg-raised p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-lift text-muted">
              <User size={22} />
            </span>
            <div>
              <p className="font-medium">{name.trim() || "Listener"}</p>
              <p className="text-xs text-muted">Saved on this device</p>
            </div>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => saveProfile({ name: name.trim() })}
            placeholder="Your name"
            maxLength={40}
            className="h-12 w-full rounded-md border border-line bg-lift px-3 text-sm outline-none placeholder:text-faint"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {GENDERS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => saveProfile({ gender: g.value })}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  profile.gender === g.value ? "border-fg bg-fg text-bg" : "border-line text-muted"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <p className="mb-2 mt-6 text-[11px] tracking-[0.22em] text-faint">LIBRARY</p>
        <div className="rounded-md border border-line bg-raised p-4 text-sm text-muted">
          <p>{liked.length} liked songs</p>
          <p className="mt-1">{playlists.length} playlists</p>
          <p className="mt-1">{history.length} history entries</p>
        </div>

        <p className="mb-2 mt-6 text-[11px] tracking-[0.22em] text-faint">ABOUT</p>
        <div className="rounded-md border border-line bg-raised p-4">
          <p className="font-display text-lg font-semibold">{APP_NAME}</p>
          <p className="mt-1 text-sm text-muted">Version {APP_VERSION}</p>
          <p className="mt-3 text-[13px] leading-5 text-muted">
            Search, queue, and play. Liked songs, playlists, and history stay on this device. No
            account. No ads. No tracking.
          </p>
          <p className="mt-3 text-[11px] tracking-[0.22em] text-faint">LISTEN FREELY. LIVE FULLY.</p>
        </div>
      </div>
    </div>
  );
}
