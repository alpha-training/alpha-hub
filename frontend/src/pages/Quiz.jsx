import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection } from "firebase/firestore";
import { QUIZ_CONFIG, QUESTION_POOLS } from "../config";

export default function Quiz() {
  const navigate = useNavigate();
  const location = useLocation();

  const topics = location.state?.topics || ["git", "linux", "q"];

  // ---------------- STATE ----------------
  const [user, setUser] = useState(null);
  const [questions, setQuestions] = useState([]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedById, setSelectedById] = useState({}); 

  const [globalTimeLeft, setGlobalTimeLeft] = useState(null);

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
    let pool = [];
    topics.forEach((t) => {
      if (QUESTION_POOLS[t]) pool.push(...QUESTION_POOLS[t]);
    });

    // Deduplicate by id or question text (lowercase)
    const map = new Map();
    pool.forEach((q) => {
      const key = (q.id || q.question || "").toString().trim().toLowerCase();
      if (!map.has(key)) map.set(key, q);
    });

    const uniqueQuestions = Array.from(map.values());

    // Shuffle questions
    const shuffled = [...uniqueQuestions].sort(() => Math.random() - 0.5);

    const sliceCount = Math.min(
      QUIZ_CONFIG.questionsPerAttempt,
      shuffled.length
    );

    // Normalize + shuffle options
    const normalized = shuffled.slice(0, sliceCount).map((q, qi) => {
      const qid = q.id || `q_${qi}`;

      // ⭐ Shuffle answer options
      const shuffledOptions = [...q.options]
        .map((opt, oi) => ({
          id: opt.id || `${qid}_opt_${oi}`,
          text: opt.text,
          isCorrect: !!opt.isCorrect,
        }))
        .sort(() => Math.random() - 0.5);

      return {
        ...q,
        id: qid,
        options: shuffledOptions,
      };
    });

    setQuestions(normalized);
    setStartedAt(new Date());

    // Global timer
    const total = QUIZ_CONFIG.timePerQuestionSeconds * sliceCount;
    setGlobalTimeLeft(total);

  }, [topics]);

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

  // Auto-submit on timeout
  useEffect(() => {
    if (globalTimeLeft === 0) handleSubmit("timeout");
  }, [globalTimeLeft]);

  // ---------------- OPTION SELECT ----------------
  const toggleOption = (questionId, optionId) => {
    setSelectedById((prev) => {
      const existing = new Set(prev[questionId] || []);
      existing.has(optionId)
        ? existing.delete(optionId)
        : existing.add(optionId);

      return { ...prev, [questionId]: Array.from(existing) };
    });
  };

  // ---------------- PROGRESS ----------------
  const progressPercent = useMemo(() => {
    if (!totalQuestions) return 0;
    return Math.round(((currentIndex + 1) / totalQuestions) * 100);
  }, [currentIndex, totalQuestions]);

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const goNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
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

    let score = 0, correctCount = 0, wrongCount = 0, skippedCount = 0;

    const perQuestionResults = questions.map((q) => {
      const correctIds = q.options.filter(o => o.isCorrect).map(o => o.id);
      const picked = selectedById[q.id] || [];
      const pickedSet = new Set(picked);

      let isCorrect = false;

      if (picked.length === 0) {
        skippedCount++;
        score += QUIZ_CONFIG.scoring.skipped;
      } else {
        const exactMatch =
          picked.length === correctIds.length &&
          correctIds.every(id => pickedSet.has(id));

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
        options: q.options,
        correctOptionIds: correctIds,
        selectedOptionIds: picked,
        isCorrect,
      };
    });

    const durationSeconds = Math.round((finishedAt - startedAt) / 1000);

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

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 md:pt-24 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-3xl space-y-6">

        {/* TOP BAR */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-sm md:text-lg text-gray-400 mb-1">
              <span>Question {currentIndex + 1} / {totalQuestions}</span>
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
            <span className="font-semibold text-blue-400">
              {formatTime(globalTimeLeft)}
            </span>
          </div>
        </div>

        {/* QUESTION */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm md:text-base whitespace-pre-wrap">
            {currentQuestion.question}
          </h2>

          <p className="text-xs text-gray-400">
            Select all answers you believe are correct.
          </p>

          <div className="space-y-2 mt-2">
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

            <button
              onClick={goBack}
              disabled={currentIndex === 0}
              className="px-6 py-2 rounded-md bg-gray-700 disabled:opacity-40"
            >
              Back
            </button>

            <button
              onClick={skipQuestion}
              disabled={currentIndex === totalQuestions - 1}
              className="px-6 py-2 rounded-md bg-gray-700 disabled:opacity-40"
            >
              Skip
            </button>

            {currentIndex < totalQuestions - 1 && (
              <button
                onClick={goNext}
                className="px-6 py-2 rounded-md bg-blue-600 hover:bg-blue-700 transition"
              >
                Next
              </button>
            )}

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
