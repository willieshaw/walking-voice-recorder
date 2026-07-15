import { useState } from "react";

/** Run a copy action and flash a "Copied" state for a moment on success. Returns the
 *  boolean flag and a runner; the action may return `false` to signal it didn't copy
 *  (e.g. clipboard blocked), in which case the flag doesn't flip. Clipboard rejections
 *  are swallowed the same way. Dedupes the copy → setCopied → setTimeout dance. */
export function useCopyFlash(ms = 1400): [boolean, (run: () => Promise<boolean | void>) => void] {
  const [copied, setCopied] = useState(false);
  const flash = (run: () => Promise<boolean | void>) => {
    run()
      .then((ok) => {
        if (ok === false) return;
        setCopied(true);
        setTimeout(() => setCopied(false), ms);
      })
      .catch(() => {}); // clipboard blocked — leave the flag untouched
  };
  return [copied, flash];
}
