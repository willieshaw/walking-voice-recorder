import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

// Ask the browser to treat this origin's storage as durable (no automatic eviction under
// disk pressure). Best-effort: a deliberate "clear site data" still wipes it.
if (navigator.storage?.persist) {
  void navigator.storage.persist().then(
    (granted) => {
      if (!granted) console.info("Durable storage not granted; notes remain evictable.");
    },
    (err: unknown) => console.info("Durable storage request failed; notes remain evictable.", err),
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
