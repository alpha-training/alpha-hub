// src/components/LiveCheckerQuestion.jsx
import { useEffect, useMemo, useState } from "react";
import { LIVE_CHECKER_API } from "../config";

/**
 * LiveCheckerQuestion
 * - POSTs /format/:id to fetch prompt + input + expected
 * - Uses parent onRun() to run /check/:id (Quiz orchestrates)
 */
export default function LiveCheckerQuestion({
  question,
  attempt,
  onAttemptChange,
  status,
  onRun,
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
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load format (${res.status})`);
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
    if (Array.isArray(v)) return v.map(toText).join("\n\n");
    if (typeof v === "object" && Array.isArray(v.values)) {
      return v.values.map(toText).join("\n\n");
    }
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  const inputText = useMemo(() => {
    if (loading) return "Loading...";
    if (error) return error;

    if (formatData?.tables != null) return toText(formatData.tables);
    if (formatData?.input != null) return toText(formatData.input);
    if (formatData?.table != null) return toText(formatData.table);

    // sometimes a table-like object ends up under result
    if (formatData?.result && typeof formatData.result === "object") {
      if (Array.isArray(formatData.result.values)) return toText(formatData.result);
    }

    return "";
  }, [formatData, loading, error]);

  const expectedText = useMemo(() => {
    if (loading) return "Loading...";
    if (error) return "";

    if (typeof formatData?.result === "string") return formatData.result;
    if (formatData?.expected != null) return toText(formatData.expected);
    if (formatData?.result != null) return toText(formatData.result);

    return "";
  }, [formatData, loading, error]);

  const promptText = useMemo(() => {
    if (loading || error) return "";
    return toText(formatData?.prompt || "");
  }, [formatData, loading, error]);

  // Enter runs, Shift+Enter newline
  const onEditorKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onRun?.();
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
    <div className="space-y-4">
      {promptText ? (
        <p className="text-xs md:text-sm text-gray-400 whitespace-pre-wrap">
          {promptText}
        </p>
      ) : null}

      {/* ✅ Input + Expected: FORCE 2 cols from sm+ (not md) + allow shrinking */}
      <div className="w-full grid md:grid-cols-2 gap-4">
        <Panel title="Input" className="min-w-0">
          <textarea
            readOnly
            value={inputText}
            className="w-full h-80 rounded-lg bg-gray-950/50 border border-gray-800 p-3 text-xs font-mono text-gray-200 resize-none"
          />
        </Panel>

        <Panel title="Expected Result" className="min-w-0">
          <textarea
            readOnly
            value={expectedText}
            className="w-full h-80 rounded-lg bg-gray-950/50 border border-gray-800 p-3 text-xs font-mono text-gray-200 resize-none"
          />
        </Panel>
      </div>

      {/* Editor + Run */}
      <div className="relative rounded-lg border border-gray-800 bg-gray-950/40 overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-10 bg-black/20 border-r border-gray-800 flex items-start justify-center pt-3">
          <span className="text-xs font-mono text-gray-500">1</span>
        </div>

        <textarea
          value={attempt}
          onChange={(e) => onAttemptChange?.(e.target.value)}
          onKeyDown={onEditorKeyDown}
          placeholder="Enter = Run, Shift+Enter = new line"
          className="w-full min-h-[78px] pl-12 pr-3 py-3 bg-transparent text-xs md:text-sm font-mono text-gray-100 outline-none resize-none"
        />

        <div className="flex justify-end p-3 pt-0">
          <button
            type="button"
            onClick={onRun}
            className="px-6 py-2 rounded-md bg-blue-600 hover:bg-blue-700 transition text-sm font-medium disabled:opacity-60"
            disabled={status?.status === "running"}
          >
            Run
          </button>
        </div>
      </div>

   {/* Status banner (no result box) */}
      {banner ? (
        <div className={`rounded-xl border p-4 ${bannerClasses(banner.tone)} flex items-start gap-3`}>
          <div className="mt-0.5 shrink-0">
            <StatusIcon tone={banner.tone} />
          </div>

          <div className="min-w-0">
            <div className="font-semibold">{banner.title}</div>
            {banner.subtitle ? (
              <div className="text-xs mt-1 opacity-90 whitespace-pre-wrap">
                {banner.subtitle}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
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
