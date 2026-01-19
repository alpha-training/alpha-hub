// src/pages/Results.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QUIZ_CONFIG, TOPICS, LIVE_CHECKER_API } from "../config";

function looksLikeId(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.length <= 5) return true; // q11, k7, etc
  // common patterns like q11, k7, p3, etc.
  if (/^[a-z]\d+$/i.test(t)) return true;
  return false;
}

async function fetchLivePrompt(apiId) {
  if (!apiId) return "";
  try {
    const res = await fetch(`${LIVE_CHECKER_API}/format/${apiId}`, { method: "POST" });
    if (!res.ok) return "";
    const data = await res.json().catch(() => null);
    const r = data?.result && typeof data.result === "object" ? data.result : data;
    const prompt = r?.prompt ?? r?.question ?? r?.title ?? r?.name ?? "";
    return prompt ? String(prompt) : "";
  } catch {
    return "";
  }
}

export default function Results() {
  const navigate = useNavigate();
  const { state } = useLocation();

  const [hydratedResults, setHydratedResults] = useState(null);

  if (!state) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center text-gray-200 pt-24">
        <p className="mb-4 text-sm">No result data available.</p>
        <button
          onClick={() => navigate("/home")}
          className="px-4 py-2 rounded-md bg-white text-black text-sm"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const {
    score: rawScore, // points in Firestore payload (most recent)
    pointsScore: rawPointsScore, // legacy (if you used it at some point)
    attemptedCount: attemptedCountRaw,

    totalQuestions,
    correctCount: correctCountRaw,
    wrongCount,
    skippedCount,
    results: resultsRaw = [],
    startedAtLocal,
    finishedAtLocal,
    durationSeconds,
    topics = [],
  } = state;

  // Prefer correctCount from payload; fallback derive from results
  const derivedCorrectCount = useMemo(() => {
    if (Number.isFinite(Number(correctCountRaw))) return Number(correctCountRaw);
    return (Array.isArray(resultsRaw) ? resultsRaw : []).reduce(
      (acc, q) => acc + (q?.isCorrect ? 1 : 0),
      0
    );
  }, [correctCountRaw, resultsRaw]);

  const attemptedCount = useMemo(() => {
    const n = Number(attemptedCountRaw);
    if (Number.isFinite(n)) return n;
    const tq = Number(totalQuestions ?? (resultsRaw?.length ?? 0)) || 0;
    const sk = Number(skippedCount ?? 0) || 0;
    return Math.max(0, tq - sk);
  }, [attemptedCountRaw, totalQuestions, skippedCount, resultsRaw]);

  // points: prefer pointsScore if present else score
  const points = useMemo(() => {
    const p = Number(rawPointsScore);
    if (Number.isFinite(p)) return p;
    const s = Number(rawScore);
    return Number.isFinite(s) ? s : 0;
  }, [rawPointsScore, rawScore]);

  // Performance based on attempted (ignores skipped)
  const pct = attemptedCount ? (derivedCorrectCount / attemptedCount) * 100 : 0;

  let performanceMsg = "";
  if (pct >= 80) performanceMsg = "🔥 Amazing job! You're mastering this.";
  else if (pct >= 60) performanceMsg = "💪 Great work — keep pushing!";
  else if (pct >= 40) performanceMsg = "👍 Not bad — steady progress.";
  else performanceMsg = "📘 Keep practicing — you'll get there!";

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const topicNames = topics
    .map((t) => TOPICS.find((x) => x.id === t)?.label || t)
    .join(", ");

  // ✅ Hydrate live question prompts if any look like ids
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!Array.isArray(resultsRaw) || resultsRaw.length === 0) {
        setHydratedResults(resultsRaw);
        return;
      }

      const liveNeeding = resultsRaw
        .map((q, idx) => ({ q, idx }))
        .filter(({ q }) => q?.type === "live")
        .filter(({ q }) => {
          const qt = String(q?.questionText || "").trim();
          const apiId = String(q?.apiId || "").trim();
          if (!qt) return !!apiId;
          if (apiId && qt === apiId) return true;
          return looksLikeId(qt) && !!apiId;
        });

      if (liveNeeding.length === 0) {
        setHydratedResults(resultsRaw);
        return;
      }

      const updated = [...resultsRaw];

      for (const { q, idx } of liveNeeding) {
        const prompt = await fetchLivePrompt(q.apiId);
        if (cancelled) return;
        if (prompt) {
          updated[idx] = { ...updated[idx], questionText: prompt };
        }
      }

      setHydratedResults(updated);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [resultsRaw]);

  const displayResults = hydratedResults ?? resultsRaw;

  const maxPointsForAttempted =
    attemptedCount * (QUIZ_CONFIG?.scoring?.correct ?? 1);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 md:pt-24 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl space-y-6">
        {/* SUMMARY */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Quiz Results</h1>
            <p className="text-base md:text-lg text-white my-2">{performanceMsg}</p>

            <p className="text-sm text-gray-300">
              Score:{" "}
              <span className="font-semibold text-white">{derivedCorrectCount}</span>
              {" / "}
              <span className="font-semibold text-white">{attemptedCount}</span>{" "}
              <span className="text-xs text-gray-400">(attempted)</span>
            </p>

            {/* points are still useful to show */}
            <p className="text-xs text-gray-400 mt-1">
              Points:{" "}
              <span className="font-semibold text-gray-200">{points}</span>{" "}
              / {maxPointsForAttempted}
            </p>

            <p className="text-xs text-gray-400 mt-1">
              Topics: <span className="font-semibold text-blue-300">{topicNames}</span>
            </p>

            <p className="text-xs text-gray-400 mt-1">
              Correct: <span className="text-green-400">{derivedCorrectCount}</span> · Wrong:{" "}
              <span className="text-red-400">{wrongCount}</span> · Skipped:{" "}
              <span className="text-yellow-300">{skippedCount}</span>
            </p>
          </div>

          <div className="text-xs text-gray-400 space-y-1 md:text-right">
            {startedAtLocal && <p>Started: {new Date(startedAtLocal).toLocaleString()}</p>}
            {finishedAtLocal && <p>Finished: {new Date(finishedAtLocal).toLocaleString()}</p>}
            {durationSeconds != null && <p>Duration: {formatDuration(durationSeconds)}</p>}
          </div>
        </div>

        {/* REVIEW */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-2 py-4 md:px-5 md:py-5 space-y-4">
          <h2 className="text-lg font-semibold">Review your answers</h2>

          <p className="text-xs text-gray-400 mb-2">
            Green = correct answer. Red = wrong. Yellow = skipped.
          </p>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {displayResults.map((q, idx) => {
              const type = q.type || "mcq";

              if (type === "live") {
                const isSkipped = !q.attempt || !q.attempt.trim();
                return (
                  <div
                    key={q.questionId || idx}
                    className="border border-gray-800 rounded-lg px-2 py-3 md:px-3 md:py-3 text-sm bg-gray-950/60"
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <p className="font-medium">
                        {idx + 1}. {q.questionText}
                      </p>

                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          q.isCorrect
                            ? "bg-green-500/10 text-green-400 border border-green-500/40"
                            : isSkipped
                            ? "bg-yellow-500/10 text-yellow-300 border border-yellow-500/40"
                            : "bg-red-500/10 text-red-400 border border-red-500/40"
                        }`}
                      >
                        {q.isCorrect ? "Correct" : isSkipped ? "Skipped" : "Wrong"}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs text-gray-400">Your answer:</div>
                      <div className="rounded-md border border-gray-800 bg-black/20 p-3 text-xs font-mono whitespace-pre-wrap">
                        {q.attempt && q.attempt.trim() ? q.attempt : "(no answer)"}
                      </div>
                    </div>
                  </div>
                );
              }

              const selectedSet = new Set(q.selectedOptionIds || []);
              const correctSet = new Set(q.correctOptionIds || []);
              const options = q.options || [];

              return (
                <div
                  key={q.questionId || idx}
                  className="border border-gray-800 rounded-lg px-2 py-3 md:px-3 md:py-3 text-sm bg-gray-950/60"
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="font-medium">
                      {idx + 1}. {q.questionText}
                    </p>

                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        q.isCorrect
                          ? "bg-green-500/10 text-green-400 border border-green-500/40"
                          : selectedSet.size === 0
                          ? "bg-yellow-500/10 text-yellow-300 border border-yellow-500/40"
                          : "bg-red-500/10 text-red-400 border border-red-500/40"
                      }`}
                    >
                      {q.isCorrect ? "Correct" : selectedSet.size === 0 ? "Skipped" : "Wrong"}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {options.map((opt) => {
                      const isSelected = selectedSet.has(opt.id);
                      const isCorrect = correctSet.has(opt.id);

                      let css =
                        "rounded-md px-3 py-1.5 border text-xs flex items-center gap-2";
                      if (isCorrect)
                        css += " border-green-500/60 bg-green-500/10 text-green-200";
                      else if (isSelected)
                        css += " border-red-500/60 bg-red-500/10 text-red-200";
                      else css += " border-gray-700 bg-gray-900 text-gray-200";

                      return (
                        <div key={opt.id} className={css}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          <span>{opt.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => navigate("/quiz", { state: { topics } })}
            className="px-2 md:px-4 py-2 rounded-md bg-blue-600 text-white text-sm"
          >
            Retake with same topics
          </button>
          <button
            onClick={() => navigate("/home")}
            className="px-2 md:px-4 py-2 rounded-md bg-white text-black text-sm"
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
