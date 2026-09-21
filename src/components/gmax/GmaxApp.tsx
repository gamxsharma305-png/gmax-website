import { useEffect } from "react";
import { APP_NAME } from "@/lib/gmax/catalog";
import { useLibrary } from "@/store/library";
import { Onboarding } from "./Onboarding";
import { Shell } from "./Shell";

export function GmaxApp() {
  const hydrated = useLibrary((s) => s.hydrated);
  const completed = useLibrary((s) => s.profile.completed);

  useEffect(() => {
    useLibrary.getState().hydrate();
    document.title = APP_NAME;
  }, []);

  return (
    <div className="gmax-stage">
      <div className="gmax-phone">
        {!hydrated ? (
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
