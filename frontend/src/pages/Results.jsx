// src/pages/Results.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QUIZ_CONFIG, TOPICS, LIVE_CHECKER_API } from "../config";
import LiveCheckerQuestion from "../components/LiveCheckerQuestion";
import InlinePrompt from "../components/InlinePrompt";
import { getDisplayBreakdown, formatPct } from "../utils/scoring";

/* ---------------- helpers ---------------- */

function looksLikeId(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (t.length <= 5) return true;
  if (/^[a-z]\d+$/i.test(t)) return true;
  return false;
}

// robust stringify for prompt/alfs shapes
const toText = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(toText).join("");
  if (typeof v === "object") {
    if (typeof v.value === "string") return v.value;
    if (Array.isArray(v.values)) return v.values.map(toText).join("\n");
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  return String(v);
};

// unwrap result several times (some backends wrap more than once)
function unwrapResult(data) {
  let raw = data;
  for (let i = 0; i < 3; i++) {
    if (raw && typeof raw === "object" && raw !== null && "result" in raw) {
      raw = raw.result;
    }
  }
  return raw;
}

// ✅ fetch BOTH prompt + alfs from the format API
async function fetchLiveFormat(apiId) {
  if (!apiId) return { prompt: "", alfs: "" };

  try {
    const res = await fetch(`${LIVE_CHECKER_API}/format/${apiId}`, {
      method: "POST",
    });
    if (!res.ok) return { prompt: "", alfs: "" };

    const data = await res.json().catch(() => null);
    const r = unwrapResult(data);

    const prompt = r?.prompt ?? r?.question ?? r?.title ?? r?.name ?? "";
    const alfs = r?.alfs ?? "";

    return {
      prompt: toText(prompt).trim(),
      alfs: toText(alfs).trim(),
    };
  } catch {
    return { prompt: "", alfs: "" };
  }
}

// ✅ re-check a previously saved live attempt against backend
async function recheckLiveAttempt(apiId, attempt) {
  if (!apiId) return { ok: false };
  const a = String(attempt || "").trim();
  if (!a) return { ok: false };

  try {
    const res = await fetch(`${LIVE_CHECKER_API}/check/${apiId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attempt: a }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => null);
    return { ok: data?.result === "Success", raw: data?.result };
  } catch {
    return { ok: false };
  }
}

// points/max points computed from *derived* breakdown
function calcPointsFromBreakdown(breakdown, quizConfig) {
  const scoring = quizConfig?.scoring || {};
  const ptsCorrect = Number(scoring.correct ?? 1) || 1;
  const ptsWrong = Number(scoring.wrong ?? -1) || -1;
  const ptsSkipped = Number(scoring.skipped ?? 0) || 0;

  const c = Number(breakdown?.correct ?? 0) || 0;
  const w = Number(breakdown?.wrong ?? 0) || 0;
  const s = Number(breakdown?.skipped ?? 0) || 0;

  return c * ptsCorrect + w * ptsWrong + s * ptsSkipped;
}

function calcMaxPointsFromBreakdown(breakdown, quizConfig) {
  const ptsCorrect = Number(quizConfig?.scoring?.correct ?? 1) || 1;
  const attempted = Number(breakdown?.attempted ?? 0) || 0;
  return attempted * ptsCorrect;
}

function CodeBlock({ label, text }) {
  const mono =
    '"Courier New", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

  return (
    <div className="space-y-1">
      {label ? <div className="text-xs font-mono text-gray-300">{label}</div> : null}
      <pre
        className="w-full rounded-lg border border-black/60 bg-gray-950 ring-1 ring-black/40 p-3 text-xs text-gray-100 whitespace-pre-wrap break-words"
        style={{ fontFamily: mono }}
      >
        {text || ""}
      </pre>
    </div>
  );
}

/* =================== RESULTS =================== */

export default function Results() {
  const navigate = useNavigate();
  const { state } = useLocation();

  const [hydratedResults, setHydratedResults] = useState(null);
  const [hydrating, setHydrating] = useState(true);

  const [reviewIndex, setReviewIndex] = useState(null);
  const [revealAlf, setRevealAlf] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  if (!state) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex flex-col items-center justify-center text-gray-300 pt-24">
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

  const { results: resultsRaw = [], durationSeconds, topics = [] } = state;

  const topicNames = topics
    .map((t) => TOPICS.find((x) => x.id === t)?.label || t)
    .join(", ");

  // ✅ Hydrate prompt/alfs + recheck wrong live answers
  // Show Loading screen until this finishes to avoid score "jump"
  useEffect(() => {
    let cancelled = false;

    const shouldRecheck = (q) => {
      if (q?.type !== "live") return false;
      if (!q?.apiId) return false;

      const st = q?.liveStatus?.status || "idle";
      if (st === "timeout" || st === "correct") return false;

      const attempt = String(q?.attempt || "").trim();
      if (!attempt) return false;

      return q?.isCorrect !== true;
    };

    const run = async () => {
      setHydrating(true);

      try {
        const liveOnes = resultsRaw
          .map((q, i) => ({ q, i }))
          .filter(({ q }) => q?.type === "live" && q?.apiId);

        // If no live questions, no async work needed.
        if (!liveOnes.length) {
          if (!cancelled) setHydratedResults(resultsRaw);
          return;
        }

        const updated = [...resultsRaw];

        for (const { q, i } of liveOnes) {
          const needPrompt =
            looksLikeId(q?.questionText) || !(q?.questionText || "").trim();
          const needAlfs = !(q?.alfs || "").trim();

          if (needPrompt || needAlfs) {
            const { prompt, alfs } = await fetchLiveFormat(q.apiId);
            if (cancelled) return;

            updated[i] = {
              ...updated[i],
              questionText: needPrompt && prompt ? prompt : updated[i].questionText,
              alfs: needAlfs && alfs ? alfs : updated[i].alfs || "",
            };
          }

          if (shouldRecheck(updated[i])) {
            const check = await recheckLiveAttempt(updated[i].apiId, updated[i].attempt);
            if (cancelled) return;

            if (check.ok) {
              updated[i] = {
                ...updated[i],
                isCorrect: true,
                liveStatus: { ...(updated[i].liveStatus || {}), status: "correct" },
              };
            }
          }
        }

        if (!cancelled) setHydratedResults(updated);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [resultsRaw]);

  // ✅ On-demand hydrate for review item (prompt + alfs)
  useEffect(() => {
    if (reviewIndex == null) return;

    const base = hydratedResults ?? resultsRaw;
    const q = base?.[reviewIndex];
    if (!q || q.type !== "live" || !q.apiId) return;

    const needPrompt =
      looksLikeId(q?.questionText) || !(q?.questionText || "").trim();
    const needAlfs = !(q?.alfs || "").trim();

    if (!needPrompt && !needAlfs) return;

    let cancelled = false;
    setReviewLoading(true);

    (async () => {
      const { prompt, alfs } = await fetchLiveFormat(q.apiId);
      if (cancelled) return;

      setHydratedResults((prev) => {
        const arr = prev ?? resultsRaw;
        const next = [...arr];
        const cur = next[reviewIndex];
        if (!cur) return arr;

        const curNeedPrompt =
          looksLikeId(cur?.questionText) || !(cur?.questionText || "").trim();
        const curNeedAlfs = !(cur?.alfs || "").trim();

        next[reviewIndex] = {
          ...cur,
          questionText: curNeedPrompt && prompt ? prompt : cur.questionText,
          alfs: curNeedAlfs && alfs ? alfs : cur.alfs || "",
        };

        return next;
      });
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reviewIndex, hydratedResults, resultsRaw]);

  const displayResults = hydratedResults ?? resultsRaw;

  const breakdown = useMemo(() => {
    return getDisplayBreakdown({ ...state, results: displayResults });
  }, [state, displayResults]);

  const points = useMemo(
    () => calcPointsFromBreakdown(breakdown, QUIZ_CONFIG),
    [breakdown]
  );

  const maxPoints = useMemo(
    () => calcMaxPointsFromBreakdown(breakdown, QUIZ_CONFIG),
    [breakdown]
  );

  const accuracy = useMemo(() => {
    return breakdown.attempted > 0 ? breakdown.correct / breakdown.attempted : 0;
  }, [breakdown]);

  /* =================== LIVE REVIEW MODE =================== */

  useEffect(() => {
    setRevealAlf(false);
  }, [reviewIndex]);

  if (hydrating) {
    return (
      <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 pb-10 px-4 flex justify-center">
        <div className="w-full max-w-4xl">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h1 className="text-2xl font-bold mb-2">Quiz Results</h1>
            <p className="text-sm text-gray-400">Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  if (reviewIndex != null && displayResults[reviewIndex]) {
    const q = displayResults[reviewIndex];

    const yours = (q.attempt || "").trim() || "(no answer)";
    const alf = (q.alfs || "").trim();
    const alfReady = Boolean(alf);

    const liveIsCorrect =
      q?.liveStatus?.status === "correct" || q?.isCorrect === true;

    const showAlfSection = Boolean(liveIsCorrect);
    const solutionsTitle = liveIsCorrect ? "Solution(s)" : "Solution";

    return (
      <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 pb-10 px-4 flex justify-center">
        <div className="w-full max-w-6xl space-y-4">
          <button
            onClick={() => setReviewIndex(null)}
            className="px-4 py-2 rounded-md bg-gray-700 text-sm"
          >
            ← Back to review
          </button>

          <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4 space-y-4">
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

            <div className="pt-4 border-t border-gray-800">
              <div className="text-sm font-semibold text-gray-200 mb-2">
                {solutionsTitle}:
              </div>

              <div className="space-y-3">
                <CodeBlock label="Yours:" text={yours} />

                {showAlfSection ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-mono text-gray-300">
                        Alf&apos;s:
                      </div>

                      {reviewLoading && !alfReady ? (
                        <span className="text-xs text-gray-500">(loading...)</span>
                      ) : !alfReady ? (
                        <span className="text-xs text-gray-500">(not available)</span>
                      ) : !revealAlf ? (
                        <button
                          onClick={() => setRevealAlf(true)}
                          className="px-2 py-1 rounded-md bg-gray-700 text-xs hover:bg-gray-600"
                        >
                          Reveal
                        </button>
                      ) : null}
                    </div>

                    {revealAlf && alfReady ? <CodeBlock label="" text={alf} /> : null}
                  </div>
                ) : null}
              </div>
            </div>
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h1 className="text-2xl font-bold mb-2">Quiz Results</h1>

          <p className="text-sm text-gray-300">
            Score: <b>{points}</b> / <b>{maxPoints}</b>{" "}
            <span className="text-gray-400 text-xs">pts</span>
          </p>

          <p className="text-xs text-gray-400 mt-1">
            Accuracy:{" "}
            <span className="text-gray-300 font-semibold">
              {formatPct(accuracy)}
            </span>{" "}
            · Correct:{" "}
            <span className="text-green-400">{breakdown.correct}</span> /{" "}
            <span className="text-gray-300">{breakdown.attempted}</span>{" "}
            <span className="text-[11px] text-gray-500">(attempted)</span>
          </p>

          <p className="text-xs text-gray-400">
            Topics: <span className="text-blue-300">{topicNames}</span>
          </p>

          <p className="text-xs text-gray-400">
            Wrong: <span className="text-red-400">{breakdown.wrong}</span> · Timed out:{" "}
            <span className="text-amber-300">{breakdown.timedOut}</span> · Skipped:{" "}
            <span className="text-yellow-300">{breakdown.skipped}</span>
          </p>

          <p className="text-xs text-gray-400 mt-2">
            Duration: {formatDuration(durationSeconds)}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-4 space-y-4">
          <h2 className="text-lg font-semibold">Review your answers</h2>

          <p className="text-xs text-gray-500">
            MCQs show correct and incorrect options inline.
            <br />
            <span className="text-green-300">Green</span> = correct ·{" "}
            <span className="text-red-300">Red</span> = you selected (wrong) ·{" "}
            <span className="text-amber-300">Amber</span> = correct option you missed
            (partial).
            <br />
            Live Checker questions can be clicked to review the full prompt and your
            submission.
          </p>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {displayResults.map((q, idx) => {
              const type = q?.type || "mcq";

              let badgeText = "Wrong";
              let badgeClass =
                "bg-red-500/10 text-red-400 border border-red-500/40";

              if (type === "live") {
                const st = q?.liveStatus?.status || "idle";
                const isTimedOut = st === "timeout";
                const hasAttempt = (q?.attempt || "").trim().length > 0;
                const isSkipped = !isTimedOut && !hasAttempt;

                const liveIsCorrect =
                  st === "correct" || q?.isCorrect === true;

                if (liveIsCorrect) {
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
                // MCQ (do NOT use liveStatus here)
                const wasAnswered =
                  typeof q?.wasAnswered === "boolean" ? q.wasAnswered : null;

                const picked = Array.isArray(q?.selectedOptionIds)
                  ? q.selectedOptionIds
                  : [];

                if (q?.isCorrect === true) {
                  badgeText = "Correct";
                  badgeClass =
                    "bg-green-500/10 text-green-400 border border-green-500/40";
                } else if (wasAnswered === false || picked.length === 0) {
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
                    <p className="font-medium text-gray-300">
                      {idx + 1}. <InlinePrompt value={q.questionText} />
                    </p>

                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full ${badgeClass}`}
                    >
                      {badgeText}
                    </span>
                  </div>

                  {type === "mcq" && <MCQReview question={q} />}

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
        Array.isArray(question.selectedOptionIds)
          ? question.selectedOptionIds
          : []
      ),
    [question.selectedOptionIds]
  );

  const correctIds = useMemo(
    () =>
      new Set(
        Array.isArray(question.correctOptionIds)
          ? question.correctOptionIds
          : []
      ),
    [question.correctOptionIds]
  );

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
          css += " border-green-500/60 bg-green-500/10 text-green-200";
          if (partialCorrect && !isSelected) {
            css =
              "rounded-md px-3 py-2 border text-xs whitespace-pre-wrap" +
              " border-amber-500/60 bg-amber-500/10 text-amber-200";
          }
        } else if (isSelected) {
          css += " border-red-500/60 bg-red-500/10 text-red-200";
        } else {
          css += " border-gray-700 bg-gray-900 text-gray-300";
        }

        return (
          <div key={opt.id} className={css}>
            <InlinePrompt value={opt.text} />
          </div>
        );
      })}
    </div>
  );
}
