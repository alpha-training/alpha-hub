// src/pages/Quiz.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../firebase";
import { addDoc, collection } from "firebase/firestore";
import { QUIZ_CONFIG, QUESTION_POOLS, LIVE_CHECKER_API } from "../config";
import LiveCheckerQuestion from "../components/LiveCheckerQuestion";

export default function Quiz({ user, profile }) {
  const navigate = useNavigate();
  const location = useLocation();

  const topics = location.state?.topics || ["git", "linux", "q"];

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [selectedById, setSelectedById] = useState({});
  const [attemptById, setAttemptById] = useState({});
  const [liveStatusById, setLiveStatusById] = useState({});
  const [liveAttemptsUsedById, setLiveAttemptsUsedById] = useState({}); // ✅ NEW

  const [globalTimeLeft, setGlobalTimeLeft] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const perTypeSeconds = QUIZ_CONFIG.timePerQuestionSecondsByType || { mcq: 15, live: 20 };
  const liveAttemptsLimit = QUIZ_CONFIG.attemptsLimitByType?.live ?? 3;

  // ---------------- PREPARE QUESTIONS ----------------
  useEffect(() => {
    let pool = [];
    topics.forEach((t) => {
      if (QUESTION_POOLS[t]) pool.push(...QUESTION_POOLS[t]);
    });

    // dedupe by question OR id
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

    const sliceCount = Math.min(QUIZ_CONFIG.questionsPerAttempt, shuffled.length);

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

    setQuestions(normalized);
    setCurrentIndex(0);

    setSelectedById({});
    setAttemptById({});
    setLiveStatusById({});
    setLiveAttemptsUsedById({}); // ✅ reset
    setIsSubmitting(false);

    const now = new Date();
    setStartedAt(now);

    // ✅ per-type total time (boss formula)
    const total = normalized.reduce((acc, q) => {
      const t = q.type || "mcq";
      return acc + (perTypeSeconds[t] ?? 15);
    }, 0);

    setGlobalTimeLeft(total);
  }, [topics]); // keep dependency minimal on purpose

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];

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

    const used = liveAttemptsUsedById[qid] ?? 0;
    if (used >= liveAttemptsLimit) {
      setLiveStatusById((p) => ({
        ...p,
        [qid]: {
          status: "error",
          message: `No attempts left (${liveAttemptsLimit}/${liveAttemptsLimit}).`,
        },
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

    // ✅ count this attempt
    setLiveAttemptsUsedById((p) => ({ ...p, [qid]: (p[qid] ?? 0) + 1 }));
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

      if (data?.result === "Success") {
        setLiveStatusById((p) => ({ ...p, [qid]: { status: "correct" } }));
      } else {
        setLiveStatusById((p) => ({
          ...p,
          [qid]: { status: "incorrect", message: data?.result || "Incorrect" },
        }));
      }
    } catch (e) {
      setLiveStatusById((p) => ({
        ...p,
        [qid]: {
          status: "error",
          message: e?.message || "API error. Is the live-checker backend running?",
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
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const goNext = () => currentIndex < totalQuestions - 1 && setCurrentIndex((i) => i + 1);
  const goBack = () => currentIndex > 0 && setCurrentIndex((i) => i - 1);
  const skipQuestion = () => currentIndex < totalQuestions - 1 && setCurrentIndex((i) => i + 1);

  // ---------------- SUBMIT ----------------
  const handleSubmit = async (reason = "manual") => {
    if (isSubmitting || !questions.length || !user || !startedAt) return;

    setIsSubmitting(true);

    // ✅ use the same per-type total
    const totalTimeAllowedInSeconds = questions.reduce((acc, q) => {
      const t = q.type || "mcq";
      return acc + (perTypeSeconds[t] ?? 15);
    }, 0);

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

    const perQuestionResults = questions.map((q) => {
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
          questionText: q.question,
          type: "live",
          apiId: q.apiId || null,
          attempt,
          liveStatus: statusObj,
          attemptsUsed: liveAttemptsUsedById[q.id] ?? 0, // ✅ NEW
          attemptsLimit: liveAttemptsLimit, // ✅ NEW
          isCorrect,
        };
      }

      const correctIds = (q.options || []).filter((o) => o.isCorrect).map((o) => o.id);
      const picked = selectedById[q.id] || [];
      const pickedSet = new Set(picked);

      let isCorrect = false;

      if (picked.length === 0) {
        skippedCount++;
        score += QUIZ_CONFIG.scoring.skipped;
      } else {
        const exactMatch =
          picked.length === correctIds.length && correctIds.every((id) => pickedSet.has(id));

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
        questionText: q.question,
        type: "mcq",
        options: q.options,
        correctOptionIds: correctIds,
        selectedOptionIds: picked,
        isCorrect,
      };
    });

    const payload = {
      uid: user.uid,
      email: user.email,
      userFirstName: profile?.firstName || null,
      userLastName: profile?.lastName || null,

      topics,
      score,
      totalQuestions,
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
      liveAttemptsUsed: liveAttemptsUsedById, // ✅ NEW
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
  if (!user || !currentQuestion) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center text-gray-300 pt-20">
        Loading quiz...
      </div>
    );
  }

  const isMCQ = (currentQuestion.type || "mcq") === "mcq";

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-10 md:pt-12 pb-8 px-4 flex justify-center">
      <div className="w-full max-w-3xl space-y-4">
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

          <div className="text-sm md:text-base font-mono text-gray-200 text-right">
            Time left:{" "}
            <span className="font-semibold text-blue-400">{formatTime(globalTimeLeft ?? 0)}</span>
          </div>
        </div>

        {/* QUESTION */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm md:text-base whitespace-pre-wrap">{currentQuestion.question}</h2>

          {isMCQ ? (
            <>
              <p className="text-xs text-gray-400">
                Select all answers you believe are correct.
              </p>

              <div className="space-y-2 mt-1">
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
              status={liveStatusById[currentQuestion.id] || { status: "idle" }}
              onRun={() => runLive(currentQuestion)}
              attemptsUsed={liveAttemptsUsedById[currentQuestion.id] ?? 0}
              attemptsLimit={liveAttemptsLimit}
            />
          )}
        </div>

        {/* NAV */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              onClick={goBack}
              disabled={currentIndex === 0}
              className="px-5 py-2 rounded-md bg-gray-700 disabled:opacity-40"
            >
              Back
            </button>

            <button
              onClick={skipQuestion}
              disabled={currentIndex === totalQuestions - 1}
              className="px-5 py-2 rounded-md bg-gray-700 disabled:opacity-40"
            >
              Skip
            </button>

            {currentIndex < totalQuestions - 1 ? (
              <button
                onClick={goNext}
                className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 transition"
              >
                Next
              </button>
            ) : (
              <button
                onClick={() => handleSubmit("manual")}
                className="px-5 py-2 rounded-md bg-green-600 hover:bg-green-700 transition"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Submitting..." : "Submit Quiz"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
