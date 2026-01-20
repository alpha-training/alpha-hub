// src/components/LiveCheckerQuestion.jsx
import { useEffect, useMemo, useState } from "react";
import { LIVE_CHECKER_API } from "../config";

export default function LiveCheckerQuestion({
  question,
  attempt,
  onAttemptChange,
  status,
  onRun,

  // attempts text (we'll show it in the same row as question timer)
  attemptsLeft,
  attemptsLimit,

  // per-question timer (driven by Quiz)
  questionTimeLeft,
  questionTimeTotal,

  // when Quiz is about to auto-advance (disable UI briefly)
  locked = false,

  // tells Quiz the real prompt so it can be saved to Firestore
  onPromptLoaded,
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

        // emit prompt up to Quiz so it gets stored in questions state & Firestore
        const r =
          data?.result && typeof data.result === "object" ? data.result : data;
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

  // unwrap { result: {...} }
  const fd = useMemo(() => {
    const r = formatData?.result;
    if (r && typeof r === "object") return r;
    return formatData;
  }, [formatData]);

  const promptText = useMemo(() => {
    if (loading) return "";
    if (error) return "";
    return toText(fd?.prompt || fd?.question || fd?.title || "");
  }, [fd, loading, error]);

  const setupText = useMemo(() => {
    if (loading) return "Loading...";
    if (error) return error;

    if (fd?.setup != null) return toText(fd.setup);

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

  const safeAttemptsLimit = Number.isFinite(Number(attemptsLimit))
    ? Number(attemptsLimit)
    : null;

  const isOutOfAttempts =
    safeAttemptsLeft !== null ? safeAttemptsLeft <= 0 : false;

    const runDisabled =
    locked ||
    status?.status === "running" ||
    isOutOfAttempts ||
    typeof onRun !== "function";
  

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

  const formatMmSs = (sec) => {
    const s = Math.max(0, Number(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  };

  // status pill logic
  const pill = useMemo(() => {
    const st = status?.status || "idle";

    if (st === "running") return { variant: "info", text: "Running..." };
    if (st === "correct") return { variant: "success", text: "Correct!" };
    if (st === "timeout") return { variant: "warning", text: "Timed out" };

    if (st === "incorrect") {
      const msg = status?.message ? `: ${status.message}` : "";
      return { variant: "error", text: `Incorrect${msg}` };
    }

    if (st === "error") {
      const msg = status?.message ? `: ${status.message}` : "";
      return { variant: "warning", text: `Error${msg}` };
    }

    return null;
  }, [status]);

  const showQuestionTimer = Number.isFinite(Number(questionTimeLeft));
  const showAttempts =
    safeAttemptsLeft !== null && safeAttemptsLimit !== null;

  return (
    <div className="space-y-3">
      {/* Prompt */}
      {promptText ? (
        <div className="text-sm md:text-base text-gray-200 whitespace-pre-wrap">
          {promptText}
        </div>
      ) : null}

      {/* Setup + Expected */}
      <div className="w-full grid md:grid-cols-3 gap-3">
        <Panel
          title="Setup"
          className="min-w-0 md:col-span-1"
          titleStyle={monoStyle}
        >
          <PreBlock text={setupText} dim={!!error} monoStyle={monoStyle} />
        </Panel>

        <Panel
          title="Expected Result"
          className="min-w-0 md:col-span-2"
          titleStyle={monoStyle}
        >
          <PreBlock text={expectedText} monoStyle={monoStyle} />
        </Panel>
      </div>

      {/* Meta row: timer centered, attempts on the right */}
      {(showQuestionTimer || showAttempts) ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <div />
          <div className="justify-self-center text-xs font-mono text-gray-400">
            {showQuestionTimer ? (
              <>
                Time left:{" "}
                <span className="text-gray-200 font-semibold">
                  {formatMmSs(questionTimeLeft)}
                </span>
                {/* {Number.isFinite(Number(questionTimeTotal)) ? (
                  <span className="text-gray-500">
                    {" "}
                    / {formatMmSs(questionTimeTotal)}
                  </span>
                ) : null} */}
              </>
            ) : null}
          </div>

          <div className="justify-self-end md:text-xs font-mono text-gray-500">
            {showAttempts ? (
              <>
                Attempts left:{" "}
                <span
                  className={
                    safeAttemptsLeft <= 0 ? "text-rose-300" : "text-gray-200"
                  }
                >
                  {safeAttemptsLeft}
                </span>{" "}
                / {safeAttemptsLimit}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Editor */}
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
          disabled={locked || isOutOfAttempts}
          className="w-full pl-12 pr-3 py-1.5 bg-transparent text-xs md:text-sm text-gray-100 outline-none resize-none h-10 md:h-11 overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
          style={monoStyle}
          rows={1}
        />

        {/* Controls row: Run always centered, pill appears close to it without moving it */}
        <div className="px-3 pb-3 pt-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div />

            <div className="justify-self-center">
              <button
                type="button"
                onClick={() => {
                  if (!runDisabled) onRun?.();
                }}
                disabled={runDisabled}
                title={isOutOfAttempts ? "No attempts left" : ""}
                className={[
                  "px-5 py-2 rounded-md text-xs font-medium transition",
                  runDisabled
                    ? "bg-gray-800 text-gray-300 cursor-not-allowed opacity-60"
                    : "bg-blue-600 hover:bg-blue-700 text-white",
                ].join(" ")}
              >
                Run
              </button>
            </div>

            <div className="justify-self-start ml-6 min-h-[36px] flex items-center">
              {pill ? (
                <StatusPill variant={pill.variant} text={pill.text} />
              ) : (
                <div className="h-[36px]" />
              )}
            </div>
          </div>
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

function StatusPill({ variant = "info", text }) {
  const styles = {
    success: "bg-emerald-950/40 border-emerald-900/50 text-emerald-200",
    error: "bg-rose-950/40 border-rose-900/50 text-rose-200",
    warning: "bg-amber-950/40 border-amber-900/50 text-amber-200",
    info: "bg-blue-950/40 border-blue-900/50 text-blue-200",
  };

  const Icon = () => {
    if (variant === "success") {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    if (variant === "error") {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    if (variant === "warning") {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 9v5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M12 17h.01"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M10.3 4.3h3.4L22 20H2L10.3 4.3z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 8h.01M11 12h1v5h1"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10z"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  };

  return (
    <div
      className={[
        "flex items-center gap-2 px-3 py-2 rounded-md border",
        "text-xs font-mono",
        styles[variant] || styles.info,
      ].join(" ")}
    >
      <Icon />
      <span className="whitespace-pre-wrap text-center">{text}</span>
    </div>
  );
}