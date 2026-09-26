import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The desktop app must render offline and make no request to Google on launch: every entry
// page uses the self-hosted Newsreader files declared in app/fonts.css.
const pages = ["app/index.html"];

describe("entry pages load no external fonts", () => {
  for (const page of pages) {
    it(`${page} has no fonts.googleapis / fonts.gstatic reference`, () => {
      const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
      expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    });
  }
  it("fonts.css declares the local Newsreader faces and app.css imports it", () => {
    const css = readFileSync(new URL("../app/fonts.css", import.meta.url), "utf8");
    expect(css).toMatch(/@font-face[\s\S]*font-family: "Newsreader"[\s\S]*fonts\/Newsreader-Variable\.woff2/);
    expect(css).toMatch(/fonts\/Newsreader-Italic-Variable\.woff2/);
    for (const sheet of ["app/app.css"]) {
      expect(readFileSync(new URL(`../${sheet}`, import.meta.url), "utf8")).toMatch(/@import "\.{1,2}\/fonts\.css";/);
    }
  });
  it("the bundled font files are real WOFF2 fonts, not a stray subset", () => {
    for (const file of ["app/public/fonts/Newsreader-Variable.woff2", "app/public/fonts/Newsreader-Italic-Variable.woff2"]) {
      const bytes = readFileSync(new URL(`../${file}`, import.meta.url));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("wOF2");
      expect(bytes.length).toBeGreaterThan(100_000);
    }
  });
});
