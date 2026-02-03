// src/utils/scoring.js

export function countTimedOut(resultsArr) {
  const arr = Array.isArray(resultsArr) ? resultsArr : [];
  return arr.reduce((acc, q) => {
    const isTimeout = q?.type === "live" && q?.liveStatus?.status === "timeout";
    return acc + (isTimeout ? 1 : 0);
  }, 0);
}

function isLiveCorrect(q) {
  const st = q?.liveStatus?.status;
  return st === "correct" || q?.isCorrect === true;
}

export function deriveCountsFromResults(resultsArr) {
  const arr = Array.isArray(resultsArr) ? resultsArr : [];

  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let timedOut = 0;

  for (const q of arr) {
    const type = q?.type || "mcq";

    if (type === "live") {
      const st = q?.liveStatus?.status || "idle";
      const isTimed = st === "timeout";
      const hasAttempt = (q?.attempt || "").trim().length > 0;

      if (isTimed) {
        timedOut++;
        // timeout is its own bucket
      } else if (!hasAttempt) {
        skipped++;
      } else if (isLiveCorrect(q)) {
        correct++;
      } else {
        wrong++;
      }
      continue;
    }

    // MCQ
    const wasAnswered =
      typeof q?.wasAnswered === "boolean"
        ? q.wasAnswered
        : Array.isArray(q?.selectedOptionIds)
        ? q.selectedOptionIds.length > 0
        : false;

    if (!wasAnswered) {
      skipped++;
    } else if (q?.isCorrect) {
      correct++;
    } else {
      wrong++;
    }
  }

  return { correct, wrong, skipped, timedOut };
}

export function getAttemptedCount(resultLike) {
  const total =
    Number(resultLike?.totalQuestions ?? resultLike?.results?.length ?? 0) || 0;

  // Prefer stored skippedCount when present
  if (Number.isFinite(Number(resultLike?.skippedCount))) {
    const skipped = Number(resultLike.skippedCount) || 0;
    return Math.max(0, total - skipped);
  }

  // Fallback: derive skipped from results (timeouts NOT skipped)
  const derived = deriveCountsFromResults(resultLike?.results);
  return Math.max(0, total - derived.skipped);
}

export function getPoints(resultLike, quizConfig) {
  const scoring = quizConfig?.scoring || {};
  const ptsCorrect = Number(scoring.correct ?? 1) || 1;
  const ptsWrong = Number(scoring.wrong ?? -1) || -1;
  const ptsSkipped = Number(scoring.skipped ?? 0) || 0;

  const hasResults =
    Array.isArray(resultLike?.results) && resultLike.results.length > 0;

  // ✅ If we have results, compute from derived counts (fixes old attempts)
  if (hasResults) {
    const d = deriveCountsFromResults(resultLike.results);
    return d.correct * ptsCorrect + d.wrong * ptsWrong + d.skipped * ptsSkipped;
  }

  // Otherwise prefer stored score if present
  if (Number.isFinite(Number(resultLike?.score))) return Number(resultLike.score);

  // Fallback compute from stored counts
  const correct = Number(resultLike?.correctCount ?? 0) || 0;
  const wrong = Number(resultLike?.wrongCount ?? 0) || 0;
  const skipped = Number(resultLike?.skippedCount ?? 0) || 0;

  return correct * ptsCorrect + wrong * ptsWrong + skipped * ptsSkipped;
}

export function getMaxPointsForAttempt(resultLike, quizConfig) {
  const attempted = getAttemptedCount(resultLike);
  const ptsCorrect = Number(quizConfig?.scoring?.correct ?? 1) || 1;
  return attempted * ptsCorrect;
}

export function getDisplayBreakdown(resultLike) {
  const total =
    Number(resultLike?.totalQuestions ?? resultLike?.results?.length ?? 0) || 0;

  const hasResults =
    Array.isArray(resultLike?.results) && resultLike.results.length > 0;

  const storedCorrect = Number(resultLike?.correctCount ?? 0) || 0;
  const storedWrong = Number(resultLike?.wrongCount ?? 0) || 0;
  const storedSkipped = Number(resultLike?.skippedCount ?? 0) || 0;

  const derived = hasResults ? deriveCountsFromResults(resultLike.results) : null;

  const correct = derived ? derived.correct : storedCorrect;
  const wrong = derived ? derived.wrong : storedWrong;
  const skipped = derived ? derived.skipped : storedSkipped;
  const timedOut = derived ? derived.timedOut : countTimedOut(resultLike?.results);

  const attempted = Math.max(0, total - skipped);

  return { total, attempted, correct, wrong, skipped, timedOut };
}

export function formatPct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0%";
  return `${Math.round(x * 100)}%`;
}
