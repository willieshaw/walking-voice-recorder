import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RecorderLab } from "./shell/RecorderLab";
import "./hardware-lab.css";

createRoot(document.getElementById("hardware-lab-root")!).render(
  <StrictMode>
    <RecorderLab mode="production" />
  </StrictMode>,
);
