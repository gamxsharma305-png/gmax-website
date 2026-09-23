import { useCallback, useEffect, useState } from "react";
import { APP_NAME } from "@/lib/gmax/catalog";
import { useLibrary } from "@/store/library";
import { Onboarding } from "./Onboarding";
import { Shell } from "./Shell";
import { Splash } from "./Splash";

const SPLASH_KEY = "gmax_splash_v1";

export function GmaxApp() {
  const hydrated = useLibrary((s) => s.hydrated);
  const completed = useLibrary((s) => s.profile.completed);
  const [splashDone, setSplashDone] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(SPLASH_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    useLibrary.getState().hydrate();
    document.title = APP_NAME;
  }, []);

  const finishSplash = useCallback(() => {
    try {
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
      /* ignore */
    }
    setSplashDone(true);
  }, []);

  // Show animated G intro once per browser session (or while hydrating)
  const showSplash = !splashDone;

  return (
    <div className="gmax-stage">
      <div className="gmax-phone">
        {showSplash ? (
          <Splash onDone={finishSplash} minMs={hydrated ? 2600 : 3200} />
        ) : !hydrated ? (
          <div className="flex h-full flex-col items-center justify-center">
            <p className="font-display text-4xl font-semibold tracking-[0.22em]">{APP_NAME}</p>
            <p className="mt-3 text-[10px] tracking-[0.32em] text-muted">LOADING</p>
          </div>
        ) : completed ? (
          <Shell />
        ) : (
          <Onboarding />
        )}
      </div>
    </div>
  );
}
