import { useEffect, useState } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/gmax/catalog";

type Props = {
  /** Called when intro finishes (or is skipped). */
  onDone: () => void;
  /** Minimum time splash stays visible (ms). */
  minMs?: number;
};

/**
 * Branded intro: letter G path draws in, fills, then title fades —
 * same energy as logo-draw splash screens, GMAX theme.
 */
export function Splash({ onDone, minMs = 2800 }: Props) {
  const [phase, setPhase] = useState<"draw" | "brand" | "out">("draw");

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("brand"), 1400);
    const t2 = window.setTimeout(() => setPhase("out"), minMs - 400);
    const t3 = window.setTimeout(() => onDone(), minMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [minMs, onDone]);

  return (
    <div
      className={`gmax-splash ${
        phase === "out" ? "gmax-splash--out" : ""
      }`}
      role="presentation"
      onClick={() => onDone()}
    >
      <div className="gmax-splash__stage">
        {/* Soft grid like design tools */}
        <div className="gmax-splash__grid" aria-hidden />

        <svg
          className="gmax-splash__svg"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          {/* Outer ring guides (fade) */}
          <circle
            className="gmax-splash__guide"
            cx="60"
            cy="60"
            r="46"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="4 6"
          />
          {/* Letter G path — continuous stroke for draw animation */}
          <path
            className="gmax-splash__stroke"
            d="M 88 42
               C 82 28 72 22 58 22
               C 38 22 24 36 24 58
               C 24 80 38 96 60 96
               C 76 96 88 86 92 72
               L 68 72
               M 92 72
               L 92 58
               L 62 58"
            stroke="url(#gmaxGStroke)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Accent bar inside G (appears after draw) */}
          <path
            className="gmax-splash__accent"
            d="M 62 54 L 92 54 L 92 62 L 62 62 Z"
            fill="url(#gmaxGFill)"
          />
          <defs>
            <linearGradient id="gmaxGStroke" x1="24" y1="22" x2="92" y2="96">
              <stop stopColor="#f0f0f0" />
              <stop offset="1" stopColor="#1db954" />
            </linearGradient>
            <linearGradient id="gmaxGFill" x1="62" y1="54" x2="92" y2="62">
              <stop stopColor="#1db954" />
              <stop offset="1" stopColor="#6ee7a0" />
            </linearGradient>
          </defs>
        </svg>

        <div className={`gmax-splash__copy ${phase !== "draw" ? "gmax-splash__copy--in" : ""}`}>
          <p className="gmax-splash__name">{APP_NAME}</p>
          <p className="gmax-splash__tag">{APP_TAGLINE}</p>
        </div>
      </div>

      <p className="gmax-splash__hint">Tap to skip</p>
    </div>
  );
}
