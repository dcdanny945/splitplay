import sanitizeHtml from "sanitize-html";

// Cleans the rich-text "note" before it's stored. Only bold/italic/underline
// and a capped font-size are allowed — everything else (scripts, links, event
// handlers, etc.) is stripped, so it's safe to render with dangerouslySetInnerHTML.
export function sanitizeNote(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const clean = sanitizeHtml(input, {
    allowedTags: ["b", "strong", "i", "em", "u", "span", "br", "div", "p"],
    allowedAttributes: {
      span: ["style"],
      div: ["style"],
      p: ["style"],
    },
    allowedStyles: {
      "*": {
        // px (up to 99) or the CSS keywords the browser's fontSize command emits
        "font-size": [/^(\d{1,2}px|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)$/],
        "font-weight": [/^(bold|normal|[1-9]00)$/],
        "font-style": [/^(italic|normal)$/],
        "text-decoration": [/^(underline|none)$/],
      },
    },
    disallowedTagsMode: "discard",
  }).trim();

  return clean || null;
}
