// src/components/LiveCheckerQuestion.jsx
import { useEffect, useMemo, useState } from "react";
import { LIVE_CHECKER_API } from "../config";

/**
 * LiveCheckerQuestion
 * - POSTs /format/:id to fetch prompt + input + expected
 * - Uses parent onRun() to run /check/:id
 *
 * Updates (per feedback):
 * ✅ Reserve space for status banner to prevent layout jump
 * ✅ Move Attempts left into the header row (same line as prompt/title)
 * ✅ Reduce vertical space (smaller textarea + Run button)
 * ✅ Disabled Run looks truly disabled (no hover, cursor-not-allowed)
 */
export default function LiveCheckerQuestion({
  question,
  attempt,
  onAttemptChange,
  status,
  onRun,
  attemptsUsed = 0,
  attemptsLimit = 3,
}) {
  const [formatData, setFormatData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---------------- load format (POST) ----------------
  useEffect(() => {
    if (!question?.apiId) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setFormatData(null);

    fetch(`${LIVE_CHECKER_API}/format/${question.apiId}`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`Failed to load format (${res.status}) ${t.slice(0, 120)}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setFormatData(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load format");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [question?.apiId]);

  // -------- helper: normalize anything to displayable text --------
  const toText = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(toText).join("\n");
    if (typeof v === "object" && Array.isArray(v.values)) return v.values.map(toText).join("\n");
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  /**
   * Backend often returns: { result: { labels, values, prompt, result } }
   * unwrap to make access consistent.
   */
  const fd = useMemo(() => {
    const r = formatData?.result;
    if (
      r &&
      typeof r === "object" &&
      (Array.isArray(r.values) || typeof r.prompt === "string" || typeof r.result === "string")
    ) {
      return r;
    }
    return formatData;
  }, [formatData]);

  // Attempts (safe)
  const safeLimit = Math.max(1, Number(attemptsLimit) || 1);
  const safeUsed = Math.max(0, Number(attemptsUsed) || 0);
  const attemptsLeft = Math.max(0, safeLimit - safeUsed);
  const isOutOfAttempts = attemptsLeft === 0;

  // Prompt: avoid duplicating the question text
  const promptText = useMemo(() => {
    if (loading || error) return "";
    return toText(fd?.prompt || "");
  }, [fd, loading, error]);

  const showPrompt = useMemo(() => {
    const qText = (question?.question || "").trim();
    const pText = (promptText || "").trim();
    if (!pText) return false;
    return pText.toLowerCase() !== qText.toLowerCase();
  }, [promptText, question?.question]);

  // Display labels => q)t, q)kti etc
  const displayKeys = useMemo(() => {
    const d = question?.display;
    if (Array.isArray(d) && d.length) return d;
    return ["t"];
  }, [question?.display]);

  const getBlockForKey = (key) => {
    if (fd?.tables && typeof fd.tables === "object" && !Array.isArray(fd.tables)) {
      const v = fd.tables[key];
      if (v != null) return toText(v);
    }

    if (Array.isArray(fd?.labels) && Array.isArray(fd?.values)) {
      const idx = fd.labels.findIndex((x) => String(x).trim() === String(key).trim());
      if (idx >= 0) {
        const v = fd.values[idx];
        if (v != null) return toText(v);
      }
    }

    if (fd?.input != null) return toText(fd.input);
    if (fd?.table != null) return toText(fd.table);
    if (Array.isArray(fd?.values)) return toText(fd.values);
    if (fd?.tables != null) return toText(fd.tables);

    return "";
  };

  const expectedText = useMemo(() => {
    if (loading) return "Loading...";
    if (error) return "";
    if (typeof fd?.result === "string") return fd.result;
    if (fd?.expected != null) return toText(fd.expected);
    if (fd?.result != null) return toText(fd.result);
    return "";
  }, [fd, loading, error]);

  const runDisabled = status?.status === "running" || isOutOfAttempts;

  // Enter runs, Shift+Enter newline
  const onEditorKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!runDisabled) onRun?.();
    }
  };

  const banner = useMemo(() => {
    const s = status?.status || "idle";
    if (s === "correct") return { tone: "success", title: "Correct answer!" };
    if (s === "running") return { tone: "info", title: "Running..." };
    if (s === "incorrect")
      return {
        tone: "danger",
        title: "Incorrect answer",
        subtitle: status?.message || "Try again.",
      };
    if (s === "error")
      return {
        tone: "warning",
        title: "Error",
        subtitle: status?.message || "Something went wrong.",
      };
    return null;
  }, [status]);

  const bannerClasses = (tone) => {
    switch (tone) {
      case "success":
        return "border-emerald-900/50 bg-emerald-950/30 text-emerald-200";
      case "danger":
        return "border-rose-900/50 bg-rose-950/30 text-rose-200";
      case "warning":
        return "border-amber-900/50 bg-amber-950/30 text-amber-200";
      case "info":
        return "border-blue-900/50 bg-blue-950/30 text-blue-200";
      default:
        return "border-gray-800 bg-gray-950/30 text-gray-200";
    }
  };

  return (
    <div className="space-y-2">
      {/* Header row: Attempts moved up (saves vertical space) */}
      <div className="flex items-center justify-between gap-3">
        {showPrompt ? (
          <p className="text-xs text-gray-400 whitespace-pre-wrap">{promptText}</p>
        ) : (
          <span className="text-xs text-gray-500" />
        )}
      {/*    
        <div className="text-xs text-gray-400 shrink-0">
          Attempts left:{" "}
          <span className={`font-semibold ${isOutOfAttempts ? "text-rose-300" : "text-gray-200"}`}>
            {attemptsLeft}
          </span>{" "}
          / {safeLimit}
        </div>
        */}
      </div>

      {/* Blocks */}
      <div className="space-y-2">
        {displayKeys.map((k, idx) => {
          const inputText = loading ? "Loading..." : error ? error : getBlockForKey(k);
          const expectedForBlock = loading ? "Loading..." : error ? "" : expectedText;

          return (
            <div key={`${k}_${idx}`} className="w-full grid md:grid-cols-2 gap-3">
              <Panel title={`q)${k}`} className="min-w-0">
                <PreBlock text={inputText} dim={!!error} />
              </Panel>

              <Panel title="Expected Result" className="min-w-0">
                <PreBlock text={expectedForBlock} />
              </Panel>
            </div>
          );
        })}
      </div>

      {/* Editor + Run (more compact) */}
      <div className="relative rounded-lg border border-gray-800 bg-gray-950/40 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-black/20 border-r border-gray-800 flex items-start justify-center pt-1.5">
          <span className="text-xs font-mono text-gray-500">1</span>
        </div>

        <textarea
          value={attempt}
          onChange={(e) => onAttemptChange?.(e.target.value)}
          onKeyDown={onEditorKeyDown}
          placeholder="Enter = Run, Shift+Enter = new line"
          spellCheck={false}
          disabled={isOutOfAttempts}
          className="w-full  pl-12 pr-3 py-1.5 bg-transparent text-xs md:text-sm font-mono text-gray-100 outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed"
        />

        <div className="flex justify-end px-3 pb-2">
          <button
            type="button"
            onClick={() => {
              if (!runDisabled) onRun?.();
            }}
            disabled={runDisabled}
            title={isOutOfAttempts ? "No attempts left" : ""}
            className={[
              "px-4 py-1.5 rounded-md text-xs font-medium transition",
              runDisabled
                ? "bg-gray-800 text-gray-300 cursor-not-allowed opacity-60"
                : "bg-blue-600 hover:bg-blue-700 text-white",
            ].join(" ")}
          >
            Run
          </button>
        </div>
      </div>

      {/* Status banner (reserved space to prevent layout jump) */}
      <div className="min-h-[24px]">
        <div
          className={`transition-opacity duration-200 ${
            banner ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {banner ? (
            <div
              className={`rounded-xl border p-2 ${bannerClasses(
                banner.tone
              )} flex items-start gap-3`}
            >
              <div className="mt-0.5 shrink-0">
                <StatusIcon tone={banner.tone} />
              </div>

              <div className="min-w-0">
                <div className="font-semibold">{banner.title}</div>
                {banner.subtitle ? (
                  <div className="text-xs opacity-90 whitespace-pre-wrap">
                    {banner.subtitle}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PreBlock({ text, dim }) {
  return (
    <pre
      className={`w-full rounded-lg bg-gray-950/50 border border-gray-800 p-3 text-xs font-mono text-gray-200 whitespace-pre-wrap break-words ${
        dim ? "opacity-90" : ""
      }`}
    >
      {text || ""}
    </pre>
  );
}

function Panel({ title, className = "", children }) {
  return (
    <div className={`rounded-xl border border-gray-800 bg-gray-950/30 p-3 ${className}`}>
      <div className="text-sm text-gray-200 mb-2">{title}</div>
      {children}
    </div>
  );
}

function StatusIcon({ tone }) {
  if (tone === "success") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" className="text-emerald-300">
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2m-1 14-4-4 1.4-1.4L11 13.2l5.6-5.6L18 9z"
        />
      </svg>
    );
  }
  if (tone === "danger") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" className="text-rose-300">
        <path
          fill="currentColor"
          d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2m3.5 13.1L15.1 15.5 12 12.4 8.9 15.5 8.5 15.1 11.6 12 8.5 8.9 8.9 8.5 12 11.6 15.1 8.5 15.5 8.9 12.4 12z"
        />
      </svg>
    );
  }
  if (tone === "warning") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" className="text-amber-300">
        <path
          fill="currentColor"
          d="M1 21h22L12 2 1 21m12-3h-2v-2h2v2m0-4h-2v-4h2v4"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="text-blue-300">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2m1 15h-2v-6h2v6m0-8h-2V7h2v2"
      />
    </svg>
  );
}
