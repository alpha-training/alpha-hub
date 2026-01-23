import React from "react";

const CODE_START = "CODE_START";
const CODE_END = "CODE_END";

/**
 * InlinePrompt renders:
 * - array parts: [{ type: "text"|"code", value: "..." }]
 * - object wrapper: { prompt: [...] } or { parts: [...] }
 * - string with CODE_START/CODE_END markers
 * - plain string text
 *
 * IMPORTANT: We do NOT parse backticks at all (q uses them in syntax).
 */
export default function InlinePrompt({ value, className = "" }) {
  const parts = normalizeToParts(value);

  if (!parts.length) return null;

  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === "code") {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded-sm border border-black/70 bg-gray-950 ring-black/50 text-gray-100 font-mono text-[0.95em]"
            >
              {p.value}
            </code>
          );
        }

        return (
          <span key={i} className="whitespace-pre-wrap">
            {p.value}
          </span>
        );
      })}
    </span>
  );
}

function normalizeToParts(input) {
  if (input == null) return [];

  // 1) array of parts (preferred)
  if (Array.isArray(input)) {
    return input
      .filter(Boolean)
      .map((x) => ({
        type: x.type === "code" ? "code" : "text",
        value: String(x.value ?? ""),
      }))
      .filter((x) => x.value.length > 0);
  }

  // 2) object wrapper (optional support)
  if (typeof input === "object") {
    if (Array.isArray(input.prompt)) return normalizeToParts(input.prompt);
    if (Array.isArray(input.parts)) return normalizeToParts(input.parts);

    // If backend accidentally sends { value: "..." }, handle it gracefully:
    if (typeof input.value === "string") return normalizeToParts(input.value);

    return [];
  }

  // 3) string => parse CODE_START/CODE_END markers, else plain text
  if (typeof input === "string") {
    const s = input;
    if (!s.trim()) return [];

    if (s.includes(CODE_START) && s.includes(CODE_END)) {
      return splitByCodeTags(s);
    }

    return [{ type: "text", value: s }];
  }

  // fallback
  return [{ type: "text", value: String(input) }];
}

/**
 * Splits a string on CODE_START ... CODE_END
 * Example:
 * "Use CODE_START sv CODE_END each s"
 * -> text("Use "), code("sv"), text(" each s")
 *
 * Handles multiple code blocks.
 * If tags are malformed, falls back to plain text.
 */
function splitByCodeTags(text) {
  const out = [];
  let i = 0;

  while (i < text.length) {
    const start = text.indexOf(CODE_START, i);
    if (start === -1) {
      const tail = text.slice(i);
      if (tail) out.push({ type: "text", value: tail });
      break;
    }

    // text before CODE_START
    const before = text.slice(i, start);
    if (before) out.push({ type: "text", value: before });

    const codeContentStart = start + CODE_START.length;
    const end = text.indexOf(CODE_END, codeContentStart);
    if (end === -1) {
      // malformed: no CODE_END -> treat the rest as plain text
      out.push({ type: "text", value: text.slice(start) });
      break;
    }

    // code content between tags
    const codeRaw = text.slice(codeContentStart, end);
    const code = codeRaw.trim();
    if (code) out.push({ type: "code", value: code });

    i = end + CODE_END.length;
  }

  // Merge adjacent text nodes to avoid fragmentation
  return mergeAdjacentText(out);
}

function mergeAdjacentText(parts) {
  const merged = [];
  for (const p of parts) {
    if (!p.value) continue;
    const last = merged[merged.length - 1];
    if (last && last.type === "text" && p.type === "text") {
      last.value += p.value;
    } else {
      merged.push({ ...p });
    }
  }
  return merged;
}
