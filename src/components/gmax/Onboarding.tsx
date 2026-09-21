import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/gmax/catalog";
import type { Gender } from "@/lib/gmax/types";
import { useLibrary } from "@/store/library";

const GENDERS: { value: Gender; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

export function Onboarding() {
  const saveProfile = useLibrary((s) => s.saveProfile);
  const [step, setStep] = useState<"intro" | "profile">("intro");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("unspecified");

  if (step === "intro") {
    return (
      <div className="relative flex h-full flex-col overflow-hidden px-7 pb-10 pt-16">
        <div className="pointer-events-none absolute -left-24 top-16 size-[320px] rounded-full border border-white/15 bg-white/10" />
        <div className="pointer-events-none absolute -right-28 top-40 size-[380px] rounded-full border border-white/10 bg-white/5" />
        <p className="relative text-[10px] font-medium tracking-[0.28em] text-muted">
          MUSIC
          <br />
          BEYOND
          <br />
          NOISE
        </p>
        <div className="relative flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="font-display text-[52px] font-semibold tracking-[0.18em] text-fg">{APP_NAME}</h1>
          <p className="mt-3 text-[10px] font-medium tracking-[0.32em] text-muted">{APP_TAGLINE}</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setStep("profile")}
            className="flex h-14 w-full items-center justify-between rounded-full border border-line bg-glass px-6"
          >
            <span className="flex-1 text-center text-[15px] font-medium">Get Started</span>
            <span className="grid size-8 place-items-center rounded-full bg-white/10">
              <ArrowRight size={16} />
            </span>
          </button>
          <p className="mt-6 text-center text-[10px] font-medium tracking-[0.28em] text-faint">
            LISTEN FREELY.
            <br />
            LIVE FULLY.
          </p>
          <p className="mt-3 text-center text-[10px] font-medium tracking-[0.32em] text-faint">
            MADE BY GMAX
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-16">
      <p className="text-[11px] tracking-[0.28em] text-faint">ONE LAST THING</p>
      <h2 className="mt-3 font-display text-[32px] font-semibold tracking-tight">Who's listening?</h2>
      <p className="mt-2 text-sm text-muted">Stays on this device. You can leave anything blank.</p>

      <label className="mt-10 text-[11px] tracking-[0.2em] text-faint">NAME</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        maxLength={40}
        className="mt-2 h-14 rounded-md border border-line bg-raised px-4 text-lg font-medium text-fg outline-none placeholder:text-faint"
      />

      <p className="mt-8 text-[11px] tracking-[0.2em] text-faint">GENDER</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {GENDERS.map((g) => {
          const active = gender === g.value;
          return (
            <button
              key={g.value}
              type="button"
              onClick={() => setGender(g.value)}
              className={`rounded-full border px-4 py-2.5 text-sm font-medium ${
                active ? "border-fg bg-fg text-bg" : "border-line bg-raised text-muted"
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      <div className="mt-auto">
        <button
          type="button"
          onClick={() =>
            saveProfile({ name: name.trim(), gender, completed: true })
          }
          className="flex h-14 w-full items-center justify-between rounded-full border border-line bg-raised px-5"
        >
          <span className="text-lg font-medium">
            {name.trim() ? `Continue as ${name.trim()}` : "Continue"}
          </span>
          <span className="grid size-10 place-items-center rounded-full bg-white/10">
            <ArrowRight size={18} />
          </span>
        </button>
      </div>
    </div>
  );
}
