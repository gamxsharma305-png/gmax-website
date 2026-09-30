import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GmaxApp } from "@/components/gmax/GmaxApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GmaxApp />
  </StrictMode>,
);

/** Register SW so the PWA stays associated while audio plays in background */
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline / first load */
    });
  });
}
