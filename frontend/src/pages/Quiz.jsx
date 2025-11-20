import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection } from "firebase/firestore";
import { QUIZ_CONFIG, QUESTION_POOLS } from "../config";

export default function Quiz() {
  const navigate = useNavigate();
  const location = useLocation();

  // topics were selected on Home page
  const topics = location.state?.topics || ["git", "linux", "q"];

  // ---------------- STATE ----------------
  const [user, setUser] = useState(null);
  const [questions, setQuestions] = useState([]);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [selectedById, setSelectedById] = useState({}); // { qID: [optIDs] }

  const [timeLeft, setTimeLeft] = useState(0); // per-question timer
  const perQuestionTime = QUIZ_CONFIG.timePerQuestionSeconds;

  const [startedAt, setStartedAt] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------------- AUTH ----------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        navigate("/", { replace: true });
      } else {
        setUser(u);
      }
    });
    return () => unsub();
  }, [navigate]);

  // ---------------- PREPARE QUESTIONS ----------------
  useEffect(() => {
    // Build pool based on selected topics
    let pool = [];
    topics.forEach((t) => {
      if (QUESTION_POOLS[t]) pool.push(...QUESTION_POOLS[t]);
    });

    // Shuffle
    const shuffled = [...pool].sort(() => Math.random() - 0.5);

    // Limit count
    const sliceCount = Math.min(
      QUIZ_CONFIG.questionsPerAttempt,
      shuffled.length
    );

    // Normalize
    const normalized = shuffled.slice(0, sliceCount).map((q, qi) => {
      const qid = q.id || `q_${qi}`;
      return {
        ...q,
        id: qid,
        options: q.options.map((opt, oi) => ({
          id: opt.id || `${qid}_opt_${oi}`,
          text: opt.text,
          isCorrect: !!opt.isCorrect,
        })),
      };
    });

    setQuestions(normalized);
    setStartedAt(new Date());
  }, [topics]);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];

  // ---------------- TIMER ----------------
  useEffect(() => {
    if (!currentQuestion) return;

    setTimeLeft(perQuestionTime);

    const id = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);

          if (currentIndex === totalQuestions - 1) {
            handleSubmit("time");
          } else {
            setCurrentIndex((i) =>
              Math.min(i + 1, totalQuestions - 1)
            );
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [currentIndex, totalQuestions, perQuestionTime]);

  // ---------------- OPTION SELECT ----------------
  const toggleOption = (questionId, optionId) => {
    setSelectedById((prev) => {
      const existing = new Set(prev[questionId] || []);
      existing.has(optionId)
        ? existing.delete(optionId)
        : existing.add(optionId);

      return {
        ...prev,
        [questionId]: Array.from(existing),
      };
    });
  };

  // ---------------- PROGRESS ----------------
  const progressPercent = useMemo(() => {
    if (!totalQuestions) return 0;
    return Math.round(((currentIndex + 1) / totalQuestions) * 100);
  }, [currentIndex, totalQuestions]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const goNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const skipQuestion = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  // ---------------- SUBMIT ----------------
  const handleSubmit = async (reason = "manual") => {
    if (isSubmitting || !questions.length || !user) return;

    setIsSubmitting(true);
    const finishedAt = new Date();

    let score = 0,
      correctCount = 0,
      wrongCount = 0,
      skippedCount = 0;

    const perQuestionResults = questions.map((q) => {
      const correctIds = q.options
        .filter((o) => o.isCorrect)
        .map((o) => o.id);

      const picked = selectedById[q.id] || [];
      const pickedSet = new Set(picked);

      let isCorrect = false;

      if (picked.length === 0) {
        skippedCount++;
        score += QUIZ_CONFIG.scoring.skipped;
      } else {
        const isSameSize = picked.length === correctIds.length;
        const allMatch = correctIds.every((id) => pickedSet.has(id));

        if (isSameSize && allMatch) {
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
        options: q.options,
        correctOptionIds: correctIds,
        selectedOptionIds: picked,
        isCorrect,
      };
    });

    const durationSeconds = Math.round(
      (finishedAt - startedAt) / 1000
    );

    const payload = {
      uid: user.uid,
      email: user.email,
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
    };

    try {
      await addDoc(collection(db, "quizResults"), payload);
    } catch (e) {
      console.error("Error saving results:", e);
    }

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

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-24 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-3xl space-y-6">
        
        {/* TOP BAR */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
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

          <div className="text-sm font-mono text-gray-200 text-right">
            Time left:{" "}
            <span className="font-semibold text-blue-400">
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        {/* QUESTION */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-base md:text-lg font-semibold">
            {currentQuestion.question}
          </h2>

          <p className="text-xs text-gray-400">
            Select all answers you believe are correct.
          </p>

          <div className="space-y-2 mt-2">
            {currentQuestion.options.map((opt) => {
              const picked = selectedById[currentQuestion.id] || [];
              const isChecked = picked.includes(opt.id);

              return (
                <label
                  key={opt.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-700 bg-gray-950/60 hover:bg-gray-800/70 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-500"
                    checked={isChecked}
                    onChange={() =>
                      toggleOption(currentQuestion.id, opt.id)
                    }
                  />
                  <span>{opt.text}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* NAVIGATION */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex gap-2">

            {/* SKIP */}
            <button
              onClick={skipQuestion}
              disabled={currentIndex === totalQuestions - 1}
              className="px-6 py-2 rounded-md bg-gray-700 disabled:opacity-40"
            >
              Skip
            </button>

            {/* NEXT */}
            {currentIndex < totalQuestions - 1 && (
              <button
                onClick={goNext}
                className="px-6 py-2 rounded-md bg-blue-600 hover:bg-blue-700 transition"
              >
                Next
              </button>
            )}

            {/* SUBMIT */}
            {currentIndex === totalQuestions - 1 && (
              <button
                onClick={() => handleSubmit("manual")}
                className="px-6 py-2 rounded-md bg-green-600 hover:bg-green-700 transition"
              >
                Submit Quiz
              </button>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
