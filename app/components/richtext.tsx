"use client";

import { useRef } from "react";

// ---------- Paste normalisation ----------
// Text pasted from Docs / Word / Notion / a web page carries far more markup
// than we can store: the server only keeps b/i/u/span/div/p/br plus a capped
// font-size (see lib/sanitize.ts). Rather than dropping the formatting and
// making the admin re-do it by hand, we fold the pasted tree down to that
// subset — bold / italic / underline survive, headings stay bold (a bit
// larger), list items keep a bullet, and the line structure including blank
// lines between sections is preserved.

type Fmt = { b: boolean; i: boolean; u: boolean; size: number };

const BASE_FMT: Fmt = { b: false, i: false, u: false, size: 0 };

// Dropped entirely, contents and all.
const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "HEAD", "META", "LINK", "TITLE", "NOSCRIPT",
  "IMG", "SVG", "VIDEO", "AUDIO", "IFRAME", "OBJECT",
  "INPUT", "BUTTON", "SELECT", "TEXTAREA",
]);

// Elements that start their own line.
const LINE_TAGS = new Set([
  "P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
  "TR", "BLOCKQUOTE", "PRE", "DT", "DD", "ADDRESS", "FIGCAPTION",
]);

// Anything that can hold lines — used to tell a leaf line ("<p>text</p>") from
// a wrapper ("<div><p>text</p></div>"), so wrappers don't emit blank lines.
const BLOCK_SELECTOR = "p,div,li,h1,h2,h3,h4,h5,h6,tr,blockquote,pre,dt,dd,address,figcaption,ul,ol,table";

const HEADING_SIZE: Record<string, number> = { H1: 20, H2: 18, H3: 17, H4: 16, H5: 16, H6: 16 };

// Only sizes that are clearly bigger than body text are worth keeping; smaller
// ones (Docs' 11pt on every span) would just fight the app's own typography.
const MIN_KEPT_SIZE = 18;
const MAX_KEPT_SIZE = 32;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(text: string, f: Fmt) {
  if (!text) return "";
  let out = escapeHtml(text);
  if (f.size) out = `<span style="font-size:${f.size}px">${out}</span>`;
  if (f.b) out = `<b>${out}</b>`;
  if (f.i) out = `<i>${out}</i>`;
  if (f.u) out = `<u>${out}</u>`;
  return out;
}

function sizeToPx(value: string): number {
  const m = /^([\d.]+)(px|pt|em|rem)$/.exec(value.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  if (m[2] === "pt") return Math.round(n * (4 / 3));
  if (m[2] === "em" || m[2] === "rem") return Math.round(n * 16);
  return Math.round(n);
}

function isBoldWeight(weight: string) {
  return weight === "bold" || weight === "bolder" || Number(weight) >= 600;
}

// Preferred reader: the fragment is mounted off-screen (see mountForStyles), so
// the browser resolves the cascade for us. That's the only way to see bold that
// comes from a class rather than an inline style — Apple Notes / Mail / Pages
// and Word all ship "<span class=s1>" plus a <style> block, and plenty of web
// pages do the same.
function computedFmt(el: Element, f: Fmt): Fmt {
  const cs = getComputedStyle(el);
  const px = sizeToPx(cs.fontSize);
  return {
    // font-weight / font-style / font-size inherit, so the computed value is
    // already the answer for this element…
    b: isBoldWeight(cs.fontWeight),
    i: cs.fontStyle === "italic" || cs.fontStyle === "oblique",
    // …text-decoration doesn't: a child of <u> computes to "none" but is still
    // painted underlined, so that one keeps accumulating down the tree.
    u: f.u || cs.textDecorationLine.includes("underline"),
    size: px >= MIN_KEPT_SIZE ? Math.min(px, MAX_KEPT_SIZE) : 0,
  };
}

// Fallback for when the fragment can't be mounted: tag names plus inline
// styles. An explicit inline style wins over the tag it sits on — Docs wraps a
// whole copied selection in <b style="font-weight:normal">, so trusting the tag
// alone would bold the entire paste.
function inlineFmt(el: Element, f: Fmt): Fmt {
  const tag = el.tagName;
  const out = { ...f };
  if (tag === "B" || tag === "STRONG" || tag === "TH") out.b = true;
  if (tag === "I" || tag === "EM") out.i = true;
  if (tag === "U" || tag === "INS") out.u = true;

  const st = (el as HTMLElement).style;
  const weight = st.fontWeight;
  if (weight) out.b = isBoldWeight(weight);
  if (st.fontStyle) out.i = st.fontStyle === "italic" || st.fontStyle === "oblique";
  const deco = `${st.textDecorationLine || ""} ${st.textDecoration || ""}`.trim();
  if (deco.includes("underline")) out.u = true;
  const px = sizeToPx(st.fontSize || "");
  if (px >= MIN_KEPT_SIZE) out.size = Math.max(out.size, Math.min(px, MAX_KEPT_SIZE));
  return out;
}

// Anything that could load a remote resource or run on its own is dropped
// before the fragment goes anywhere near the page. <style> is deliberately kept
// — it's where class-based bold lives — and a shadow root keeps it from
// leaking into the app's own styles.
const UNSAFE_SELECTOR = "script,noscript,head,meta,link,title,img,picture,svg,canvas,video,audio,iframe,object,embed,input,button,select,textarea,form";

function mountForStyles(body: HTMLElement): { root: ParentNode; cleanup: () => void } | null {
  if (typeof document === "undefined") return null;
  try {
    const host = document.createElement("div");
    // Neutral baseline so nothing inherits from the page, and invisible so the
    // paste never flashes on screen.
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:600px;height:0;overflow:hidden;visibility:hidden;font:400 16px sans-serif;text-decoration:none";
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = body.innerHTML;
    return { root, cleanup: () => host.remove() };
  } catch {
    return null;
  }
}

export function normalizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Clipboard HTML puts its <style> block in <head>; keep it with the content
  // it styles, otherwise class-based bold is invisible.
  doc.head.querySelectorAll("style").forEach((s) => doc.body.prepend(s));
  doc.querySelectorAll(UNSAFE_SELECTOR).forEach((el) => el.remove());

  const mounted = mountForStyles(doc.body);
  const root: ParentNode = mounted ? mounted.root : doc.body;
  const readFmt = mounted ? computedFmt : inlineFmt;
  try {
    return collectLines(root, readFmt);
  } finally {
    mounted?.cleanup();
  }
}

function collectLines(root: ParentNode, readFmt: (el: Element, f: Fmt) => Fmt): string {
  const lines: string[] = [];
  let cur = "";
  // A bullet waits here until the line it belongs to gets its first text — a
  // list item is often "<li><p>text</p></li>", where the text starts a new line.
  let pending = "";
  const flush = () => {
    lines.push(cur.trim());
    cur = "";
  };

  const walk = (node: Node, f: Fmt) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || "").replace(/\s+/g, " ");
        // Whitespace that only separates block tags isn't content.
        if (!text.trim() && !cur) return;
        if (!cur && pending) {
          cur += pending;
          pending = "";
        }
        cur += wrap(text, f);
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;

      const el = child as HTMLElement;
      const tag = el.tagName;
      if (SKIP_TAGS.has(tag)) return;
      if (tag === "BR" || tag === "HR") {
        flush();
        return;
      }

      const next = readFmt(el, f);
      // A heading is a heading even when the source styles it like body text.
      if (HEADING_SIZE[tag]) {
        next.b = true;
        next.size = Math.max(next.size, HEADING_SIZE[tag]);
      }

      const isLine = LINE_TAGS.has(tag);
      const isLeafLine = isLine && !el.querySelector(BLOCK_SELECTOR);
      if (isLine && cur.trim()) flush();
      if (tag === "LI") pending = wrap("• ", { ...BASE_FMT, size: next.size });
      walk(el, next);
      if (tag === "LI") pending = "";
      // A leaf line always closes its line, even when empty — that's what keeps
      // the blank lines between sections. Wrappers only close a pending line.
      if (isLine && (isLeafLine || cur.trim())) flush();
    });
  };

  walk(root, BASE_FMT);
  if (cur.trim()) flush();

  return linesToHtml(lines);
}

// Notes written before this field became rich text were stored as plain text
// with real newlines, which collapse into one blob once rendered as HTML.
// Turn those into lines; anything that already carries markup is left as is.
export function noteToHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return /<(br|div|p|b|strong|i|em|u|span)\b/i.test(raw) ? raw : plainTextToHtml(raw);
}

export function plainTextToHtml(text: string): string {
  return linesToHtml(text.replace(/\r\n?/g, "\n").split("\n").map((l) => escapeHtml(l.trim())));
}

function linesToHtml(input: string[]): string {
  const lines: string[] = [];
  for (const line of input) {
    // Never more than one blank line in a row, and none at the very top.
    if (!line && (lines.length === 0 || !lines[lines.length - 1])) continue;
    lines.push(line);
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.map((l) => (l ? `<div>${l}</div>` : "<div><br></div>")).join("");
}

// ---------- Editor ----------
// Click-to-format contentEditable used by both the create form and the inline
// note editor. Uncontrolled on purpose: the existing note is written into the
// DOM once on mount and React is kept out of the element's children after that,
// so a re-render (every keystroke updates the parent's state) can't wipe what's
// been typed or move the caret.
export function RichTextEditor({ initialHtml = "", onChange, placeholder, minHeight = 60 }: {
  initialHtml?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);
  const attach = (node: HTMLDivElement | null) => {
    ref.current = node;
    if (node && !seeded.current) {
      seeded.current = true;
      node.innerHTML = initialHtml;
    }
  };

  const emit = () => {
    const html = (ref.current?.innerHTML || "").trim();
    onChange(html === "<br>" ? "" : html);
  };

  const cmd = (command: string) => {
    document.execCommand(command, false);
    ref.current?.focus();
    emit();
  };

  const setSize = (level: string) => {
    if (!level) return;
    // Built-in command: normalizes the selection's font size (replaces any
    // existing size) instead of nesting spans, so Large -> Normal works.
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("fontSize", false, level);
    ref.current?.focus();
    emit();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    const out = html ? normalizePastedHtml(html) : plainTextToHtml(text);
    if (!out) return;
    e.preventDefault();
    document.execCommand("insertHTML", false, out);
    emit();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); cmd("bold"); }} style={tbtn}><b>B</b></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); cmd("italic"); }} style={tbtn}><i>I</i></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); cmd("underline"); }} style={tbtn}><u>U</u></button>
        <select
          value=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setSize(e.target.value)}
          style={tsel}
        >
          <option value="" disabled>Size</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="5">Large</option>
          <option value="6">Huge</option>
        </select>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>paste keeps formatting · select text, then format</span>
      </div>
      <div
        ref={attach}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        data-placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "2px solid #06b6d4", fontSize: 13, outline: "none", minHeight, lineHeight: 1.5, color: "#475569", overflowWrap: "anywhere" }}
      />
    </div>
  );
}

const tbtn: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "3px 10px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 };
const tsel: React.CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, padding: "3px 8px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };
