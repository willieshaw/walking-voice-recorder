// The Folders modal: browse notes by folder, drag a note onto a folder to move it,
// create new folders. A folder is just a label on the note — this is a filtered view.
import { useState } from "react";
import type { NoteSummary } from "../lib/notesDb";
import { formatNoteDate } from "./LibraryFeed";
import { formatTime } from "../components/AudioPlayer";
import "./folders-modal.css";

export function FoldersModal({
  summaries,
  folders,
  onClose,
  onOpen,
  onMove,
  onCreate,
  onRename,
  onPick,
}: {
  summaries: NoteSummary[];
  folders: string[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onMove: (id: string, folder: string | undefined) => void;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onPick: (folder: string | null) => void;
}) {
  const [browse, setBrowse] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [menu, setMenu] = useState<{ folder: string; x: number; y: number } | null>(null);

  const inBrowse = summaries.filter((s) => (browse === null ? true : s.folder === browse));
  const count = (f: string) => summaries.filter((s) => s.folder === f).length;

  function commitCreate() {
    const n = newName.trim();
    setCreating(false);
    setNewName("");
    if (n) onCreate(n);
  }

  function startRename(f: string) {
    setMenu(null);
    setRenameVal(f);
    setRenaming(f);
  }

  function commitRename() {
    const target = renaming;
    const v = renameVal.trim();
    setRenaming(null);
    if (target && v && v !== target) onRename(target, v);
  }

  return (
    <div className="modal-scrim" style={{ paddingTop: "10vh" }} onClick={onClose}>
      <div className="fm-card" onClick={(e) => e.stopPropagation()}>
        <div className="fm-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="1.7">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <span className="fm-title">Folders</span>
        </div>
        <div className="fm-body">
          <div className="fm-left">
            <a
              className={`fm-folder${browse === null ? " fm-folder-active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setBrowse(null)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="1.6">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span className="fm-folder-name">All notes</span>
              <span className="fm-count">{summaries.length}</span>
            </a>
            {folders.map((f) => (
              <a
                key={f}
                className={`fm-folder${browse === f ? " fm-folder-active" : ""}${
                  dragOver === f ? " fm-folder-drop" : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => setBrowse(f)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ folder: f, x: e.clientX, y: e.clientY });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(f);
                }}
                onDragLeave={() => setDragOver((v) => (v === f ? null : v))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  if (dragId) onMove(dragId, f);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                {renaming === f ? (
                  <input
                    className="fm-rename-input"
                    autoFocus
                    value={renameVal}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitRename();
                      else if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <span
                    className="fm-folder-name"
                    title="Double-click to rename"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(f);
                    }}
                  >
                    {f}
                  </span>
                )}
                <span className="fm-count">{count(f)}</span>
              </a>
            ))}
            {creating ? (
              <input
                className="fm-new-input"
                autoFocus
                value={newName}
                placeholder="Folder name"
                onChange={(e) => setNewName(e.target.value)}
                onBlur={commitCreate}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitCreate();
                  else if (e.key === "Escape") {
                    setNewName("");
                    setCreating(false);
                  }
                }}
              />
            ) : (
              <button className="fm-new" onClick={() => setCreating(true)}>
                <span className="fm-new-plus">+</span> New folder
              </button>
            )}
          </div>
          <div className="fm-right">
            <div className="fm-browse-title">{browse ?? "All notes"}</div>
            {inBrowse.map((s) => (
              <a
                key={s.id}
                className="fm-note"
                role="button"
                tabIndex={0}
                draggable
                onDragStart={() => setDragId(s.id)}
                onDragEnd={() => setDragId(null)}
                onClick={() => {
                  onOpen(s.id);
                  onClose();
                }}
              >
                <svg className="fm-grip" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c4c4c8" strokeWidth="1.6">
                  <circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" />
                  <circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" />
                </svg>
                <div className="fm-note-main">
                  <div className="fm-note-title">{s.title}</div>
                  <div className="fm-note-meta">
                    {formatNoteDate(s.createdAt)} · {formatTime(s.durationSec)}
                  </div>
                </div>
                <span className="fm-chev">›</span>
              </a>
            ))}
            {inBrowse.length === 0 && <div className="fm-empty">This folder is empty</div>}
          </div>
        </div>
        {menu && (
          <>
            <div className="fm-menu-backdrop" onClick={() => setMenu(null)} />
            <div className="fm-menu" style={{ left: menu.x, top: menu.y }}>
              <button className="fm-menu-item" onClick={() => startRename(menu.folder)}>
                Rename
              </button>
              <button
                className="fm-menu-item"
                onClick={() => {
                  onPick(menu.folder);
                  onClose();
                }}
              >
                Open in Library
              </button>
            </div>
          </>
        )}
        <div className="fm-foot">
          <span>
            {folders.length} folder{folders.length === 1 ? "" : "s"} · {summaries.length} note
            {summaries.length === 1 ? "" : "s"}
          </span>
          <span className="kbd">Esc to close</span>
        </div>
      </div>
    </div>
  );
}
