// Copy to-dos so their checkboxes survive a paste. We write two clipboard flavors:
//   text/plain — GitHub/Notion/Obsidian-style task list ("- [ ] ", "- [x] ")
//   text/html  — a <ul> of real <input type=checkbox> items for rich editors
// The receiving app picks whichever flavor it understands, so the checkbox state carries
// over wherever that formatting is supported (and degrades to readable text elsewhere).
export interface CopyableTodo {
  label: string;
  done?: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function copyTodos(items: CopyableTodo[]): Promise<boolean> {
  if (!items.length) return false;

  const plain = items.map((t) => `- [${t.done ? "x" : " "}] ${t.label}`).join("\n");
  const html =
    `<ul style="list-style:none;padding-left:0">` +
    items
      .map(
        (t) =>
          `<li><input type="checkbox" ${t.done ? "checked" : ""} disabled> ${escapeHtml(
            t.label,
          )}</li>`,
      )
      .join("") +
    `</ul>`;

  try {
    if (
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard &&
      "write" in navigator.clipboard
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    return false;
  }
}
