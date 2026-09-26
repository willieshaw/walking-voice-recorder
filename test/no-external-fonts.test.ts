import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The desktop app must render offline and make no request to Google on launch: every entry
// page uses the self-hosted Newsreader files declared in app/fonts.css.
const pages = ["app/index.html", "app/hardware-lab.html", "app/hardware-study.html"];

describe("entry pages load no external fonts", () => {
  for (const page of pages) {
    it(`${page} has no fonts.googleapis / fonts.gstatic reference`, () => {
      const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
      expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    });
  }
  it("fonts.css declares the local Newsreader faces and every Newsreader stylesheet imports it", () => {
    const css = readFileSync(new URL("../app/fonts.css", import.meta.url), "utf8");
    expect(css).toMatch(/@font-face[\s\S]*font-family: "Newsreader"[\s\S]*fonts\/Newsreader-Variable\.woff2/);
    expect(css).toMatch(/fonts\/Newsreader-Italic-Variable\.woff2/);
    for (const sheet of ["app/app.css", "app/shell/hardware-study.css", "app/shell/recorder-lab.css"]) {
      expect(readFileSync(new URL(`../${sheet}`, import.meta.url), "utf8")).toMatch(/@import "\.{1,2}\/fonts\.css";/);
    }
  });
});
