import { useEffect, useState } from "react";
import { Headphones } from "lucide-react";
import { isBackgroundEnabled, setBackgroundEnabled } from "@/lib/gmax/background";

export function BackgroundToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(isBackgroundEnabled());
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        setOn(next);
        setBackgroundEnabled(next);
      }}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
        on ? "border-accent bg-accent/15 text-accent" : "border-line bg-raised text-muted"
      }`}
      aria-pressed={on}
      aria-label="Background music"
    >
      <Headphones size={14} />
      {on ? "BG On" : "BG Off"}
    </button>
  );
}
