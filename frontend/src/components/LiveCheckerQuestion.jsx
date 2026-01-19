// src/components/LiveCheckerQuestion.jsx
import { useEffect, useMemo, useState } from "react";
import { LIVE_CHECKER_API } from "../config";

export default function LiveCheckerQuestion({
  question,
  attempt,
  onAttemptChange,
  status,
  onRun,
  attemptsLeft, // passed from Quiz
  onPromptLoaded, // ✅ NEW: tells Quiz the real prompt so it can be saved to Firestore
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
          throw new Error(
            `Failed to load format (${res.status}) ${t.slice(0, 120)}`
          );
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;

        setFormatData(data);

        // ✅ emit prompt up to Quiz so it gets stored in questions state & Firestore
        const r = data?.result && typeof data.result === "object" ? data.result : data;
        const prompt = r?.prompt ?? r?.question ?? r?.title ?? r?.name ?? "";

        if (prompt && typeof onPromptLoaded === "function") {
          onPromptLoaded(String(prompt));
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.apiId]);

  // -------- helper: normalize anything to displayable text --------
  const toText = (v) => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(toText).join("\n");
    if (typeof v === "object") {
      if (Array.isArray(v.values)) return v.values.map(toText).join("\n");
    }
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  /**
   * Backend returns: { result: {...} }
   * unwrap to make access consistent.
   */
  const fd = useMemo(() => {
    const r = formatData?.result;
    if (r && typeof r === "object") return r;
    return formatData;
  }, [formatData]);

  // ✅ show prompt (actual question text) inside live component
  const promptText = useMemo(() => {
    if (loading) return "";
    if (error) return "";
    return toText(fd?.prompt || fd?.question || fd?.title || "");
  }, [fd, loading, error]);

  const setupText = useMemo(() => {
    if (loading) return "Loading...";
    if (error) return error;

    // prefer new backend field
    if (fd?.setup != null) return toText(fd.setup);

    // fallback to older labels/values
    if (Array.isArray(fd?.labels) && Array.isArray(fd?.values)) {
      const lines = [];
      for (let i = 0; i < fd.labels.length; i++) {
        const k = String(fd.labels[i] ?? "").trim();
        const v = fd.values[i];
        if (!k) continue;
        lines.push(`q)${k}`);
        lines.push(toText(v));
        lines.push("");
      }
      return lines.join("\n").trim();
    }

    // fallback
    if (fd?.tables != null) return toText(fd.tables);
    if (fd?.input != null) return toText(fd.input);
    return "";
  }, [fd, loading, error]);

  const expectedText = useMemo(() => {
    if (loading) return "Loading...";
    if (error) return "";
    if (fd?.expected != null) return toText(fd.expected);
    if (fd?.result != null) return toText(fd.result);
    return "";
  }, [fd, loading, error]);

  const safeAttemptsLeft = Number.isFinite(Number(attemptsLeft))
    ? Number(attemptsLeft)
    : null;

  const isOutOfAttempts =
    safeAttemptsLeft !== null ? safeAttemptsLeft <= 0 : false;

  // disable Run when running OR out of attempts
  const runDisabled = status?.status === "running" || isOutOfAttempts;

  // Enter runs, Shift+Enter newline
  const onEditorKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!runDisabled) onRun?.();
    }
  };

  const monoStyle = {
    fontFamily:
      '"Courier New", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  };

  return (
    <div className="space-y-2">
      {/* Prompt (actual question text) */}
      {promptText ? (
        <div className="text-sm md:text-base text-gray-200 whitespace-pre-wrap">
          {promptText}
        </div>
      ) : null}

      {/* Setup + Expected */}
      <div className="w-full grid md:grid-cols-2 gap-3">
        <Panel title="Setup" className="min-w-0" titleStyle={monoStyle}>
          <PreBlock text={setupText} dim={!!error} monoStyle={monoStyle} />
        </Panel>

        <Panel title="Expected Result" className="min-w-0" titleStyle={monoStyle}>
          <PreBlock text={expectedText} monoStyle={monoStyle} />
        </Panel>
      </div>

      {/* Editor + Run */}
      <div className="relative rounded-lg border border-gray-800 bg-gray-950/40 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-black/20 border-r border-gray-800 flex items-start justify-center pt-1.5">
          <span className="text-xs text-gray-500" style={monoStyle}>
            1
          </span>
        </div>

        <textarea
          value={attempt}
          onChange={(e) => onAttemptChange?.(e.target.value)}
          onKeyDown={onEditorKeyDown}
          placeholder="Enter = Run, Shift+Enter = new line"
          spellCheck={false}
          disabled={isOutOfAttempts}
          className="w-full pl-12 pr-3 py-1.5 bg-transparent text-xs md:text-sm text-gray-100 outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed"
          style={monoStyle}
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
    </div>
  );
}

function PreBlock({ text, dim, monoStyle }) {
  return (
    <pre
      className={`w-full rounded-lg bg-gray-950/50 border border-gray-800 p-3 text-xs text-gray-200 whitespace-pre-wrap break-words ${
        dim ? "opacity-90" : ""
      }`}
      style={monoStyle}
    >
      {text || ""}
    </pre>
  );
}

function Panel({ title, className = "", children, titleStyle }) {
  return (
    <div
      className={`rounded-xl border border-gray-800 bg-gray-950/30 p-3 ${className}`}
    >
      <div className="text-sm text-gray-200 mb-2" style={titleStyle}>
        {title}
      </div>
      {children}
    </div>
  );
}
