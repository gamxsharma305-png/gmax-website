import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GmaxApp } from "@/components/gmax/GmaxApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GmaxApp />
  </StrictMode>,
);
