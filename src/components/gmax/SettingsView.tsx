import { useState, type ReactNode } from "react";
import {
  ChevronLeft,
  User,
  Palette,
  SunMoon,
  Languages,
  Music2,
  SlidersHorizontal,
  BadgeCheck,
  Link2,
  ListMusic,
} from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/gmax/catalog";
import type { AudioQuality, Gender, ThemeMode } from "@/lib/gmax/types";
import { DEFAULT_PREFS } from "@/lib/gmax/types";
import { useLibrary } from "@/store/library";
import { useUi } from "@/store/ui";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

const ACCENTS = ["#1db954", "#3b82f6", "#a855f7", "#f43f5e", "#f59e0b", "#e2e8f0"];

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

const QUALITY: { value: AudioQuality; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
];

const LANGS = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
];

function Row({
  icon: Icon,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  icon: typeof Palette;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-hairline px-3 py-3.5 text-left last:border-0"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lift text-muted">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-fg">{title}</span>
        {subtitle ? <span className="mt-0.5 block text-[12px] text-muted">{subtitle}</span> : null}
      </span>
      {trailing}
    </button>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        on ? "bg-accent" : "bg-lift"
      }`}
    >
      <span
        className={`absolute top-0.5 size-6 rounded-full bg-fg shadow transition-transform ${
          on ? "left-5" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function SettingsView() {
  const profile = useLibrary((s) => s.profile);
  const updateProfile = useLibrary((s) => s.updateProfile);
  const prefs = profile?.prefs ?? DEFAULT_PREFS;
  const setPref = (key: keyof typeof DEFAULT_PREFS, value: unknown) => {
    if (!profile) return;
    updateProfile({ prefs: { ...prefs, [key]: value } });
  };
  const setView = useUi((s) => s.setView);
  const [panel, setPanel] = useState<"main" | "accent" | "theme" | "lang" | "quality">("main");
  const [name, setName] = useState(profile?.name ?? "");
  const [gender, setGender] = useState<Gender>(profile?.gender ?? "unspecified");

  const saveProfile = () => {
    if (!profile) return;
    updateProfile({ name: name.trim() || "Listener", gender });
  };

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="flex items-center gap-2 border-b border-hairline px-3 py-3">
        <button
          type="button"
          onClick={() => (panel === "main" ? setView("home") : setPanel("main"))}
          className="grid size-9 place-items-center rounded-full bg-lift text-fg"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">
          {panel === "main"
            ? "Settings"
            : panel === "accent"
              ? "Accent color"
              : panel === "theme"
                ? "Theme"
                : panel === "lang"
                  ? "Language"
                  : "Audio quality"}
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto px-3 pb-24 pt-2">
        {panel === "main" ? (
          <>
            <section className="mb-6">
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Profile
              </h2>
              <div className="overflow-hidden rounded-2xl bg-raised">
                <div className="flex items-center gap-3 border-b border-hairline px-3 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lift text-muted">
                    <User size={18} />
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={saveProfile}
                    placeholder="Your name"
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-muted"
                  />
                </div>
                <div className="flex flex-wrap gap-2 px-3 py-3">
                  {GENDERS.map((g) => (
                    <button
                      key={g.value}
                      type="button"
                      onClick={() => {
                        setGender(g.value);
                        if (profile) updateProfile({ gender: g.value });
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        gender === g.value
                          ? "bg-accent text-bg"
                          : "bg-lift text-muted"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="mb-6">
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Preferences
              </h2>
              <div className="overflow-hidden rounded-2xl bg-raised">
                <Row
                  icon={Palette}
                  title="Accent color"
                  subtitle={prefs.accentColor}
                  onClick={() => setPanel("accent")}
                />
                <Row
                  icon={SunMoon}
                  title="Theme mode"
                  subtitle={prefs.themeMode}
                  onClick={() => setPanel("theme")}
                />
                <Row
                  icon={Languages}
                  title="Language"
                  subtitle={prefs.language === "hi" ? "हिन्दी" : "English"}
                  onClick={() => setPanel("lang")}
                />
                <Row
                  icon={Music2}
                  title="Audio quality"
                  subtitle={prefs.audioQuality}
                  onClick={() => setPanel("quality")}
                />
                <Row
                  icon={SlidersHorizontal}
                  title="Equalizer"
                  subtitle="System EQ (device)"
                />
                <Row
                  icon={BadgeCheck}
                  title="Show audio quality badge"
                  trailing={
                    <Toggle
                      on={prefs.showQualityBadge}
                      onChange={(v) => setPref("showQualityBadge", v)}
                    />
                  }
                />
                <Row
                  icon={Link2}
                  title="Use proxy"
                  subtitle="Route streams via proxy when available"
                  trailing={
                    <Toggle on={prefs.useProxy} onChange={(v) => setPref("useProxy", v)} />
                  }
                />
                <Row
                  icon={ListMusic}
                  title="Dynamic accent color"
                  subtitle="Match accent to album art"
                  trailing={
                    <Toggle
                      on={prefs.dynamicAccent}
                      onChange={(v) => setPref("dynamicAccent", v)}
                    />
                  }
                />
              </div>
            </section>

            <p className="px-1 text-center text-[11px] text-muted">
              {APP_NAME} v{APP_VERSION} · Preferences saved on this device
            </p>
          </>
        ) : null}

        {panel === "accent" ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setPref("accentColor", c);
                  setPanel("main");
                }}
                className={`size-12 rounded-full border-2 ${
                  prefs.accentColor === c ? "border-fg" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        ) : null}

        {panel === "theme" ? (
          <div className="mt-6 flex flex-col gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  setPref("themeMode", t.value);
                  setPanel("main");
                }}
                className={`rounded-md border px-4 py-3 text-left text-sm font-medium ${
                  prefs.themeMode === t.value
                    ? "border-fg bg-fg text-bg"
                    : "border-line bg-raised text-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
            <p className="mt-2 text-xs text-muted">Light theme polish is limited; dark is recommended.</p>
          </div>
        ) : null}

        {panel === "lang" ? (
          <div className="mt-6 flex flex-col gap-2">
            {LANGS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => {
                  setPref("language", l.value);
                  setPanel("main");
                }}
                className={`rounded-md border px-4 py-3 text-left text-sm font-medium ${
                  prefs.language === l.value
                    ? "border-fg bg-fg text-bg"
                    : "border-line bg-raised text-fg"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        ) : null}

        {panel === "quality" ? (
          <div className="mt-6 flex flex-col gap-2">
            {QUALITY.map((q) => (
              <button
                key={q.value}
                type="button"
                onClick={() => {
                  setPref("audioQuality", q.value);
                  setPanel("main");
                }}
                className={`rounded-md border px-4 py-3 text-left text-sm font-medium ${
                  prefs.audioQuality === q.value
                    ? "border-fg bg-fg text-bg"
                    : "border-line bg-raised text-fg"
                }`}
              >
                {q.label}
              </button>
            ))}
            <p className="mt-2 text-xs text-muted">
              High prefers the best available stream when the source offers multiple bitrates.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
