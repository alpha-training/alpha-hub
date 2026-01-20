// src/pages/Results.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QUIZ_CONFIG, TOPICS, LIVE_CHECKER_API } from "../config";
import LiveCheckerQuestion from "../components/LiveCheckerQuestion";

/* ---------------- helpers ---------------- */

function looksLikeId(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.length <= 5) return true;
  if (/^[a-z]\d+$/i.test(t)) return true;
  return false;
}

async function fetchLivePrompt(apiId) {
  if (!apiId) return "";
  try {
    const res = await fetch(`${LIVE_CHECKER_API}/format/${apiId}`, {
      method: "POST",
    });
    if (!res.ok) return "";
    const data = await res.json().catch(() => null);
    const r =
      data?.result && typeof data.result === "object" ? data.result : data;
    const prompt = r?.prompt ?? r?.question ?? r?.title ?? r?.name ?? "";
    return prompt ? String(prompt) : "";
  } catch {
    return "";
  }
}

/* =================== RESULTS =================== */

export default function Results() {
  const navigate = useNavigate();
  const { state } = useLocation();

  const [hydratedResults, setHydratedResults] = useState(null);
  const [reviewIndex, setReviewIndex] = useState(null); // 🔍 live-only review

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
    score: rawScore,
    attemptedCount: attemptedCountRaw,
    totalQuestions,
    correctCount: correctCountRaw,
    wrongCount,
    skippedCount,
    results: resultsRaw = [],
    durationSeconds,
    topics = [],
  } = state;

  /* ---------- derived counts ---------- */

  const derivedCorrectCount = useMemo(() => {
    if (Number.isFinite(Number(correctCountRaw))) return Number(correctCountRaw);
    return resultsRaw.reduce((a, q) => a + (q?.isCorrect ? 1 : 0), 0);
  }, [correctCountRaw, resultsRaw]);

  const attemptedCount = useMemo(() => {
    const n = Number(attemptedCountRaw);
    if (Number.isFinite(n)) return n;
    return Math.max(
      0,
      Number(totalQuestions ?? resultsRaw.length) - Number(skippedCount ?? 0)
    );
  }, [attemptedCountRaw, totalQuestions, skippedCount, resultsRaw]);

  const points = Number.isFinite(Number(rawScore)) ? Number(rawScore) : 0;

  const topicNames = topics
    .map((t) => TOPICS.find((x) => x.id === t)?.label || t)
    .join(", ");

  /* ---------- hydrate live prompts ---------- */

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const needs = resultsRaw
        .map((q, i) => ({ q, i }))
        .filter(
          ({ q }) => q?.type === "live" && q?.apiId && looksLikeId(q?.questionText)
        );

      if (!needs.length) {
        setHydratedResults(resultsRaw);
        return;
      }

      const updated = [...resultsRaw];

      for (const { q, i } of needs) {
        const prompt = await fetchLivePrompt(q.apiId);
        if (cancelled) return;
        if (prompt) updated[i] = { ...q, questionText: prompt };
      }

      setHydratedResults(updated);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [resultsRaw]);

  const displayResults = hydratedResults ?? resultsRaw;

  /* =================== LIVE REVIEW MODE =================== */

  if (reviewIndex != null && displayResults[reviewIndex]) {
    const q = displayResults[reviewIndex];

    return (
      <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 pb-10 px-4 flex justify-center">
        <div className="w-full max-w-6xl space-y-4">
          <button
            onClick={() => setReviewIndex(null)}
            className="px-4 py-2 rounded-md bg-gray-700 text-sm"
          >
            ← Back to review
          </button>

          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4">
            <LiveCheckerQuestion
              question={{ ...q, question: q.questionText }}
              attempt={q.attempt || ""}
              onAttemptChange={() => {}}
              status={q.liveStatus}
              onRun={() => {}}
              attemptsLeft={0}
              attemptsLimit={q.attemptsLimit ?? 0}
              questionTimeLeft={null}
              questionTimeTotal={null}
              locked={true}
              onPromptLoaded={() => {}}
            />
          </div>
        </div>
      </div>
    );
  }

  /* =================== MAIN RESULTS =================== */

  const formatDuration = (s) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl space-y-6">
        {/* SUMMARY */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h1 className="text-2xl font-bold mb-2">Quiz Results</h1>

          <p className="text-sm text-gray-300">
            Score: <b>{derivedCorrectCount}</b> / <b>{attemptedCount}</b>
          </p>

          <p className="text-xs text-gray-400">Points: {points}</p>

          <p className="text-xs text-gray-400">
            Topics: <span className="text-blue-300">{topicNames}</span>
          </p>

          <p className="text-xs text-gray-400">
            Correct: <span className="text-green-400">{derivedCorrectCount}</span>{" "}
            · Wrong: <span className="text-red-400">{wrongCount}</span> · Skipped:{" "}
            <span className="text-yellow-300">{skippedCount}</span>
          </p>

          <p className="text-xs text-gray-400 mt-2">
            Duration: {formatDuration(durationSeconds)}
          </p>
        </div>

        {/* REVIEW LIST */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4 space-y-4">
          <h2 className="text-lg font-semibold">Review your answers</h2>

          {/* ✅ explanatory paragraph back (and accurate) */}
          <p className="text-xs text-gray-500">
          MCQs show correct and incorrect options inline.
          <br />
          <span className="text-green-300">Green</span> = correct ·{" "}
          <span className="text-red-300">Red</span> = you selected (wrong) ·{" "}
         {/**  <span className="text-yellow-300">Yellow</span> = skipped ·{" "}*/}
          <span className="text-amber-300">Amber</span> = correct option you missed
          (partial).
          <br />
          Live Checker questions can be clicked to review the full prompt and your
          submission.
        </p>
        

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {displayResults.map((q, idx) => {
              const type = q.type || "mcq";

              /* ---------- badge ---------- */

              let badgeText = "Wrong";
              let badgeClass =
                "bg-red-500/10 text-red-400 border border-red-500/40";

              if (type === "live") {
                const st = q?.liveStatus?.status || "idle";
                const isTimedOut = st === "timeout";
                const isSkipped = !isTimedOut && !(q.attempt || "").trim();

                if (q.isCorrect) {
                  badgeText = "Correct";
                  badgeClass =
                    "bg-green-500/10 text-green-400 border border-green-500/40";
                } else if (isTimedOut) {
                  badgeText = "Timed out";
                  badgeClass =
                    "bg-amber-500/10 text-amber-300 border border-amber-500/40";
                } else if (isSkipped) {
                  badgeText = "Skipped";
                  badgeClass =
                    "bg-yellow-500/10 text-yellow-300 border border-yellow-500/40";
                }
              } else {
                // ✅ MCQ: use wasAnswered when present (new data) so “Skipped” is accurate
                const wasAnswered =
                  typeof q.wasAnswered === "boolean" ? q.wasAnswered : null;

                const picked = Array.isArray(q.selectedOptionIds)
                  ? q.selectedOptionIds
                  : [];

                if (q.isCorrect) {
                  badgeText = "Correct";
                  badgeClass =
                    "bg-green-500/10 text-green-400 border border-green-500/40";
                } else if (wasAnswered === false) {
                  badgeText = "Skipped";
                  badgeClass =
                    "bg-yellow-500/10 text-yellow-300 border border-yellow-500/40";
                } else if (wasAnswered === true) {
                  badgeText = "Wrong";
                  badgeClass =
                    "bg-red-500/10 text-red-400 border border-red-500/40";
                } else if (picked.length === 0) {
                  // legacy fallback
                  badgeText = "Skipped";
                  badgeClass =
                    "bg-yellow-500/10 text-yellow-300 border border-yellow-500/40";
                } else {
                  badgeText = "Wrong";
                  badgeClass =
                    "bg-red-500/10 text-red-400 border border-red-500/40";
                }
              }

              return (
                <div
                  key={q.questionId || idx}
                  onClick={() => type === "live" && setReviewIndex(idx)}
                  className={`border border-gray-800 rounded-lg px-3 py-3 bg-gray-950/60 ${
                    type === "live" ? "cursor-pointer hover:border-gray-600" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="font-medium">
                      {idx + 1}. {q.questionText}
                    </p>

                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${badgeClass}`}
                    >
                      {badgeText}
                    </span>
                  </div>

                  {/* MCQ INLINE REVIEW */}
                  {type === "mcq" && <MCQReview question={q} />}

                  {/* LIVE SUMMARY */}
                  {type === "live" && (
                    <div className="text-xs text-gray-400">
                      Your answer:{" "}
                      <span className="font-mono">
                        {q.attempt?.trim() || "(no answer)"}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => navigate("/quiz", { state: { topics } })}
            className="px-4 py-2 rounded-md bg-blue-600 text-sm"
          >
            Retake with same topics
          </button>
          <button
            onClick={() => navigate("/home")}
            className="px-4 py-2 rounded-md bg-white text-black text-sm"
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

/* =================== MCQ REVIEW =================== */

function MCQReview({ question }) {
  const selectedIds = useMemo(
    () =>
      new Set(
        Array.isArray(question.selectedOptionIds) ? question.selectedOptionIds : []
      ),
    [question.selectedOptionIds]
  );

  const correctIds = useMemo(
    () => new Set(Array.isArray(question.correctOptionIds) ? question.correctOptionIds : []),
    [question.correctOptionIds]
  );

  // ✅ detect “partially correct” multi-select: user picked some correct but missed others
  const partialCorrect = useMemo(() => {
    if (!correctIds.size) return false;
    let selectedCorrect = 0;
    for (const id of selectedIds) if (correctIds.has(id)) selectedCorrect++;
    const missed = correctIds.size - selectedCorrect;
    return selectedCorrect > 0 && missed > 0;
  }, [selectedIds, correctIds]);

  return (
    <div className="space-y-2">
      {(question.options || []).map((opt) => {
        const isCorrect = correctIds.has(opt.id);
        const isSelected = selectedIds.has(opt.id);

        let css = "rounded-md px-3 py-2 border text-xs whitespace-pre-wrap";

        if (isCorrect) {
          // ✅ green correct always
          css += " border-green-500/60 bg-green-500/10 text-green-200";
          // ✅ highlight missed correct answers in amber when user was partially correct
          if (partialCorrect && !isSelected) {
            css =
              "rounded-md px-3 py-2 border text-xs whitespace-pre-wrap" +
              " border-amber-500/60 bg-amber-500/10 text-amber-200";
          }
        } else if (isSelected) {
          // ✅ selected wrong option
          css += " border-red-500/60 bg-red-500/10 text-red-200";
        } else {
          css += " border-gray-700 bg-gray-900 text-gray-300";
        }

        return (
          <div key={opt.id} className={css}>
            {opt.text}
          </div>
        );
      })}
    </div>
  );
}
