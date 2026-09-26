import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HardwareStudy } from "./shell/HardwareStudy";
import "./hardware-lab.css";

createRoot(document.getElementById("hardware-study-root")!).render(
  <StrictMode>
    <HardwareStudy />
  </StrictMode>,
);
