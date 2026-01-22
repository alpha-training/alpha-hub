import React from "react";

// Renders either:
// - string
// - array of { type: "text"|"code", value: string }
// - object with { prompt: [...] } or { parts: [...] } (optional support)
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
              className="px-1.5 py-0.5 rounded-md border border-gray-700 bg-gray-900/70 text-gray-100 font-mono text-[0.95em]"
            >
              {p.value}
            </code>
          );
        }

        // text
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

  // string
  if (typeof input === "string") {
    return input.trim() ? [{ type: "text", value: input }] : [];
  }

  // array of parts
  if (Array.isArray(input)) {
    return input
      .filter(Boolean)
      .map((x) => ({
        type: x.type === "code" ? "code" : "text",
        value: String(x.value ?? ""),
      }))
      .filter((x) => x.value.length > 0);
  }

  // object wrapper (optional support)
  if (typeof input === "object") {
    if (Array.isArray(input.prompt)) return normalizeToParts(input.prompt);
    if (Array.isArray(input.parts)) return normalizeToParts(input.parts);
  }

  // fallback
  return [{ type: "text", value: String(input) }];
}
