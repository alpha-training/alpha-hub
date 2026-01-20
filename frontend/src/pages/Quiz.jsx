// src/pages/Quiz.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../firebase";
import { addDoc, collection } from "firebase/firestore";
import { QUIZ_CONFIG, QUESTION_POOLS, LIVE_CHECKER_API } from "../config";
import LiveCheckerQuestion from "../components/LiveCheckerQuestion";
import { fetchLiveQuestions } from "../api/liveQuestions";

export default function Quiz({ user, profile }) {
  const navigate = useNavigate();
  const location = useLocation();

  const topics = useMemo(
    () => location.state?.topics ?? ["git", "linux", "q"],
    [location.state?.topics]
  );
  const topicsKey = useMemo(() => topics.join("|"), [topics]);

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [selectedById, setSelectedById] = useState({});
  const [attemptById, setAttemptById] = useState({});
  const [liveStatusById, setLiveStatusById] = useState({});
  const [liveAttemptsUsedById, setLiveAttemptsUsedById] = useState({});

  const [globalTimeLeft, setGlobalTimeLeft] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // track when user entered current question (for skip-time deduction)
  const [enteredAtMs, setEnteredAtMs] = useState(Date.now());

  const perTypeSeconds = QUIZ_CONFIG.timePerQuestionSecondsByType || {
    mcq: 15,
    live: 20,
  };

  const defaultLiveAttemptsLimit =
    Number(QUIZ_CONFIG.attemptsLimitByType?.live ?? 2) || 2;

  const getAttemptsLimit = (q) => {
    const n = Number(q?.tries);
    if (Number.isFinite(n) && n > 0) return n;
    return defaultLiveAttemptsLimit;
  };

  const getQuestionSeconds = (q) => {
    const t = q.type || "mcq";
    if (t === "live") {
      const s = Number(q?.seconds);
      if (Number.isFinite(s) && s > 0) return s;
    }
    return Number(perTypeSeconds[t] ?? 15) || 15;
  };

  // --- helper: fetch prompt for apiId ---
  const fetchLivePrompt = useCallback(async (apiId) => {
    if (!apiId) return "";
    const res = await fetch(`${LIVE_CHECKER_API}/format/${apiId}`, {
      method: "POST",
    });
    if (!res.ok) return "";
    const data = await res.json().catch(() => null);
    const r = data?.result && typeof data.result === "object" ? data.result : data;
    const prompt = r?.prompt ?? r?.question ?? r?.title ?? r?.name ?? "";
    return prompt ? String(prompt) : "";
  }, []);

  // ---------------- PREPARE QUESTIONS ----------------
  useEffect(() => {
    let cancelled = false;

    const build = async () => {
      let pool = [];

      // local pools (everything except live)
      topics.forEach((t) => {
        if (t !== "live" && QUESTION_POOLS[t]) pool.push(...QUESTION_POOLS[t]);
      });

      // live from backend
      if (topics.includes("live")) {
        try {
          const liveQs = await fetchLiveQuestions();
          pool.push(...liveQs);
        } catch (e) {
          console.error("Failed to load live questions:", e);
        }
      }

      // dedupe
      const map = new Map();
      pool.forEach((q) => {
        const key = (q.type === "live" ? q.apiId : q.id || q.question || "")
          .toString()
          .trim()
          .toLowerCase();
        if (!map.has(key)) map.set(key, q);
      });

      const uniqueQuestions = Array.from(map.values());
      const shuffled = [...uniqueQuestions].sort(() => Math.random() - 0.5);

      const sliceCount = Math.min(
        QUIZ_CONFIG.questionsPerAttempt,
        shuffled.length
      );

      const normalized = shuffled.slice(0, sliceCount).map((q, qi) => {
        const qid = q.id || `q_${qi}`;
        const type = q.type || "mcq";

        if (type === "live") {
          return { ...q, id: qid, type: "live", options: [] };
        }

        const shuffledOptions = [...(q.options || [])]
          .map((opt, oi) => ({
            id: opt.id || `${qid}_opt_${oi}`,
            text: opt.text,
            isCorrect: !!opt.isCorrect,
          }))
          .sort(() => Math.random() - 0.5);

        return { ...q, id: qid, type: "mcq", options: shuffledOptions };
      });

      if (cancelled) return;

      setQuestions(normalized);
      setCurrentIndex(0);

      setSelectedById({});
      setAttemptById({});
      setLiveStatusById({});
      setLiveAttemptsUsedById({});
      setIsSubmitting(false);

      const now = new Date();
      setStartedAt(now);

      const total = normalized.reduce(
        (acc, q) => acc + getQuestionSeconds(q),
        0
      );
      setGlobalTimeLeft(total);

  // ✅ background preload prompts for ALL live questions (single batch update)
    const liveOnes = normalized.filter((q) => q.type === "live" && q.apiId);

    Promise.all(
      liveOnes.map(async (q) => {
        const prompt = await fetchLivePrompt(q.apiId);
        return { id: q.id, apiId: q.apiId, prompt };
      })
    ).then((arr) => {
      if (cancelled) return;

      setQuestions((prev) =>
        prev.map((x) => {
          const hit = arr.find((a) => a.id === x.id);
          if (!hit?.prompt) return x;

          const existing = String(x.question || "").trim();
          const apiId = String(x.apiId || "").trim();
          const shouldPatch = !existing || (apiId && existing === apiId);

          return shouldPatch ? { ...x, question: hit.prompt } : x;
        })
      );
    });

      setEnteredAtMs(Date.now());
    };

    build();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicsKey, fetchLivePrompt]);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];

  // reset entered time when question changes
  useEffect(() => {
    setEnteredAtMs(Date.now());
  }, [currentIndex]);

  // ---------------- GLOBAL TIMER ----------------
  useEffect(() => {
    if (globalTimeLeft === null) return;
    if (globalTimeLeft <= 0) return;

    const interval = setInterval(() => {
      setGlobalTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [globalTimeLeft]);

  useEffect(() => {
    if (globalTimeLeft === 0) handleSubmit("timeout");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalTimeLeft]);

  // ---------------- MCQ select ----------------
  const toggleOption = (questionId, optionId) => {
    setSelectedById((prev) => {
      const existing = new Set(prev[questionId] || []);
      existing.has(optionId) ? existing.delete(optionId) : existing.add(optionId);
      return { ...prev, [questionId]: Array.from(existing) };
    });
  };

  // ---------------- LIVE run ----------------
  const runLive = async (question) => {
    const qid = question.id;
    const apiId = question.apiId;

    const limit = getAttemptsLimit(question);
    const used = Number(liveAttemptsUsedById[qid] ?? 0);

    const currentStatus = liveStatusById[qid]?.status || "idle";
    if (currentStatus === "correct") return;

    if (used >= limit) {
      setLiveStatusById((p) => ({
        ...p,
        [qid]: { status: "error", message: "No attempts left." },
      }));
      return;
    }

    const attempt = (attemptById[qid] || "").trim();
    if (!attempt) {
      setLiveStatusById((p) => ({
        ...p,
        [qid]: { status: "error", message: "Type an answer first." },
      }));
      return;
    }

    if (!apiId) {
      setLiveStatusById((p) => ({
        ...p,
        [qid]: { status: "error", message: "Missing apiId for this question." },
      }));
      return;
    }

    setLiveStatusById((p) => ({ ...p, [qid]: { status: "running" } }));

    try {
      const res = await fetch(`${LIVE_CHECKER_API}/check/${apiId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Check failed (${res.status}): ${text.slice(0, 120)}`);
      }

      const data = await res.json();
      setLiveAttemptsUsedById((p) => ({ ...p, [qid]: used + 1 }));

      const result = data?.result;

      if (result === "Success") {
        setLiveStatusById((p) => ({ ...p, [qid]: { status: "correct" } }));
      } else {
        setLiveStatusById((p) => ({
          ...p,
          [qid]: { status: "incorrect", message: result || "Incorrect" },
        }));
      }
    } catch (e) {
      setLiveStatusById((p) => ({
        ...p,
        [qid]: {
          status: "error",
          message:
            e?.message || "API error. Is the live-checker backend running?",
        },
      }));
    }
  };

  // ---------------- UI helpers ----------------
  const progressPercent = useMemo(() => {
    if (!totalQuestions) return 0;
    return Math.round(((currentIndex + 1) / totalQuestions) * 100);
  }, [currentIndex, totalQuestions]);

  const formatTime = (sec) => {
    const safe = Number.isFinite(sec) ? sec : 0;
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const goNext = () =>
    currentIndex < totalQuestions - 1 && setCurrentIndex((i) => i + 1);
  const goBack = () => currentIndex > 0 && setCurrentIndex((i) => i - 1);

  // ✅ Skip deducts remaining seconds allocated to THIS question from global remaining
  const skipQuestion = () => {
    if (currentIndex >= totalQuestions - 1) return;
    if (!currentQuestion) return;

    const qSec = getQuestionSeconds(currentQuestion);
    const elapsed = (Date.now() - enteredAtMs) / 1000;
    const remainingForThisQ = Math.max(0, Math.ceil(qSec - elapsed));

    setGlobalTimeLeft((t) => Math.max(0, (t ?? 0) - remainingForThisQ));
    setCurrentIndex((i) => i + 1);
  };

  // ---------------- SUBMIT ----------------
  const handleSubmit = async (reason = "manual") => {
    if (isSubmitting || !questions.length || !user || !startedAt) return;

    setIsSubmitting(true);

    // ✅ final safety net: fetch missing prompts for live questions before saving
    const patchedQuestions = await Promise.all(
      questions.map(async (q) => {
        if (q.type !== "live") return q;
        const text = (q.question || "").trim();
        const looksMissing = !text || text === String(q.apiId || "").trim();
        if (!looksMissing || !q.apiId) return q;
        const prompt = await fetchLivePrompt(q.apiId);
        return prompt ? { ...q, question: prompt } : q;
      })
    );

    const totalTimeAllowedInSeconds = patchedQuestions.reduce(
      (acc, q) => acc + getQuestionSeconds(q),
      0
    );

    const finishedAt =
      reason === "timeout"
        ? new Date(startedAt.getTime() + totalTimeAllowedInSeconds * 1000)
        : new Date();

    let durationSeconds = Math.round((finishedAt - startedAt) / 1000);
    durationSeconds = Math.min(durationSeconds, totalTimeAllowedInSeconds);

    let score = 0,
      correctCount = 0,
      wrongCount = 0,
      skippedCount = 0;

    const perQuestionResults = patchedQuestions.map((q) => {
      const type = q.type || "mcq";

      if (type === "live") {
        const statusObj = liveStatusById[q.id] || { status: "idle" };
        const attempt = attemptById[q.id] || "";

        let isCorrect = false;

        if (!attempt.trim()) {
          skippedCount++;
          score += QUIZ_CONFIG.scoring.skipped;
        } else if (statusObj.status === "correct") {
          isCorrect = true;
          correctCount++;
          score += QUIZ_CONFIG.scoring.correct;
        } else {
          wrongCount++;
          score += QUIZ_CONFIG.scoring.wrong;
        }

        return {
          questionId: q.id,
          questionText: q.question && String(q.question).trim() ? q.question : q.apiId || q.id,
          type: "live",
          apiId: q.apiId || null,
          attempt,
          liveStatus: statusObj,
          attemptsUsed: Number(liveAttemptsUsedById[q.id] ?? 0),
          attemptsLimit: getAttemptsLimit(q),
          seconds: getQuestionSeconds(q),
          isCorrect,
        };
      }

      const correctIds = (q.options || [])
        .filter((o) => o.isCorrect)
        .map((o) => o.id);

      const picked = selectedById[q.id] || [];
      const pickedSet = new Set(picked);

      let isCorrect = false;

      if (picked.length === 0) {
        skippedCount++;
        score += QUIZ_CONFIG.scoring.skipped;
      } else {
        const exactMatch =
          picked.length === correctIds.length &&
          correctIds.every((id) => pickedSet.has(id));

        if (exactMatch) {
          isCorrect = true;
          correctCount++;
          score += QUIZ_CONFIG.scoring.correct;
        } else {
          wrongCount++;
          score += QUIZ_CONFIG.scoring.wrong;
        }
      }

      return {
        questionId: q.id,
        questionText: q.question && String(q.question).trim() ? q.question : q.id,
        type: "mcq",
        options: q.options,
        correctOptionIds: correctIds,
        selectedOptionIds: picked,
        isCorrect,
        seconds: getQuestionSeconds(q),
      };
    });

    const attemptedCount = (patchedQuestions.length || 0) - skippedCount;

    const payload = {
      uid: user.uid,
      email: user.email,
      userFirstName: profile?.firstName || null,
      userLastName: profile?.lastName || null,

      topics,
      score,
      totalQuestions: patchedQuestions.length,
      attemptedCount, // ✅ NEW
      correctCount,
      wrongCount,
      skippedCount,
      startedAt,
      finishedAt,
      durationSeconds,
      reason,

      results: perQuestionResults,
      liveAttempts: attemptById,
      liveStatuses: liveStatusById,
      liveAttemptsUsed: liveAttemptsUsedById,
    };

    await addDoc(collection(db, "quizResults"), payload);

    navigate("/results", {
      replace: true,
      state: {
        ...payload,
        startedAtLocal: startedAt.toISOString(),
        finishedAtLocal: finishedAt.toISOString(),
      },
    });
  };

  // ---------------- RENDER ----------------
  if (!user) return null;

  if (!questions.length) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center text-gray-300 pt-20">
        No questions available.
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center text-gray-300 pt-20">
        Loading quiz...
      </div>
    );
  }

  const isMCQ = (currentQuestion.type || "mcq") === "mcq";

  const attemptsUsed = Number(liveAttemptsUsedById[currentQuestion.id] ?? 0);
  const attemptsLimit = getAttemptsLimit(currentQuestion);
  const attemptsLeft = Math.max(0, attemptsLimit - attemptsUsed);
  const isOutOfAttempts = attemptsLeft === 0;

  const liveStatusObj =
    liveStatusById[currentQuestion.id] || { status: "idle" };
  const liveStatus = liveStatusObj.status || "idle";
  const liveIsCorrect = !isMCQ && liveStatus === "correct";

  const isLast = currentIndex === totalQuestions - 1;

  const nextDisabled = !isMCQ ? (!liveIsCorrect && !isOutOfAttempts) : false;
  const skipDisabled = !isMCQ ? (liveIsCorrect ? true : false) : isLast;

  const submitDisabled = isSubmitting;
  const containerWidth = isMCQ ? "max-w-4xl" : "max-w-6xl";

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-10 pb-6 px-4 flex justify-center">
      <div className={`w-full ${containerWidth} space-y-3`}>
        {/* TOP BAR */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-sm md:text-base text-gray-400 mb-1">
              <span>
                Question {currentIndex + 1} / {totalQuestions}
              </span>
            </div>

            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="w-full md:w-auto">
            <div className="grid grid-cols-3 items-center w-full md:min-w-[520px]">
              <div className="justify-self-start" />

              <div className="justify-self-center text-sm font-mono text-gray-200">
                Time left:{" "}
                <span className="font-semibold text-blue-400">
                  {formatTime(globalTimeLeft ?? 0)}
                </span>
              </div>

              <div className="justify-self-end text-xs font-mono text-gray-400 mr-2 shrink-0">
                {!isMCQ ? (
                  <>
                    Attempts left:{" "}
                    <span
                      className={`font-semibold ${
                        isOutOfAttempts ? "text-rose-300" : "text-gray-200"
                      }`}
                    >
                      {attemptsLeft}
                    </span>{" "}
                    / {attemptsLimit}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* QUESTION */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 space-y-3">
          {isMCQ ? (
            <h2 className="text-sm md:text-base whitespace-pre-wrap">
              {currentQuestion.question}
            </h2>
          ) : null}

          {isMCQ ? (
            <>
              <p className="text-xs text-gray-400">
                Select all answers you believe are correct.
              </p>

              <div className="space-y-3 mt-1">
                {currentQuestion.options.map((opt) => {
                  const picked = selectedById[currentQuestion.id] || [];
                  return (
                    <label
                      key={opt.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-700 bg-gray-950/60 hover:bg-gray-800/70 cursor-pointer text-xs md:text-sm font-mono whitespace-pre-wrap"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-500"
                        checked={picked.includes(opt.id)}
                        onChange={() => toggleOption(currentQuestion.id, opt.id)}
                      />
                      <span>{opt.text}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <LiveCheckerQuestion
              question={currentQuestion}
              attempt={attemptById[currentQuestion.id] || ""}
              onAttemptChange={(val) =>
                setAttemptById((p) => ({ ...p, [currentQuestion.id]: val }))
              }
              status={liveStatusObj}
              onRun={() => runLive(currentQuestion)}
              attemptsLeft={attemptsLeft}
              attemptsLimit={attemptsLimit}
              onPromptLoaded={(prompt) => {
                const p = String(prompt || "").trim();
                if (!p) return;

                setQuestions((prev) =>
                  prev.map((q) =>
                    q.id === currentQuestion.id && q.question !== p
                      ? { ...q, question: p }
                      : q
                  )
                );
              }}
            />
          )}
        </div>

        {/* NAV */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              onClick={goBack}
              disabled={currentIndex === 0 || isSubmitting}
              className="px-5 py-2 rounded-md bg-gray-700 disabled:opacity-40"
            >
              Back
            </button>

            <button
              onClick={skipQuestion}
              disabled={skipDisabled || isSubmitting}
              className="px-5 py-2 rounded-md bg-gray-700 disabled:opacity-40"
            >
              Skip
            </button>

            {!isLast ? (
              <button
                onClick={goNext}
                disabled={nextDisabled || isSubmitting}
                className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 transition disabled:opacity-40 disabled:hover:bg-blue-600"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => handleSubmit("manual")}
                className="px-5 py-2 rounded-md bg-green-600 hover:bg-green-700 transition disabled:opacity-40 disabled:hover:bg-green-600"
                disabled={submitDisabled}
              >
                {isSubmitting ? "Submitting..." : "Submit Quiz"}
              </button>
            )}
          </div>

          <span className="text-xs text-gray-500" />
        </div>
      </div>
    </div>
  );
}
