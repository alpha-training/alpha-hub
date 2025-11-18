import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import quizData from "../../../quiz/linux1.json"; 
export default function Quiz() {
  const navigate = useNavigate();

  // All questions loaded from JSON
  const [questions, setQuestions] = useState([]);

  // Index of the current question
  const [current, setCurrent] = useState(0);

  // Selected answers for current question:
  // For radio: [optionId], for check: multiple optionIds
  const [selected, setSelected] = useState([]);

  // Global score (but we will also use local scoreToSave to avoid async issues)
  const [score, setScore] = useState(0);

  // Timer: 5 minutes = 300 seconds
  const [timeLeft, setTimeLeft] = useState(300);

  // ------------------------------
  // Load questions from JSON once
  // ------------------------------
  useEffect(() => {
    const list = quizData.questions;

    // Shuffle and take up to 30 questions
    const shuffled = [...list].sort(() => Math.random() - 0.5).slice(0, 30);

    setQuestions(shuffled);
  }, []);

  // ------------------------------
  // Countdown timer
  // ------------------------------
  useEffect(() => {
    if (timeLeft <= 0) {
      // Time is up: finish with current score
      finishQuiz(score);
      return;
    }

    const t = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, score]); // score in deps so we finish with latest value

  // If questions not loaded yet
  if (!questions.length) return null;

  const q = questions[current];

  // ------------------------------
  // Radio selection (single choice)
  // ------------------------------
  function selectRadio(optionId) {
    setSelected([optionId]);
  }

  // ------------------------------
  // Checkbox selection (multi-choice)
  // ------------------------------
  function toggleCheckbox(optionId) {
    if (selected.includes(optionId)) {
      setSelected(selected.filter((id) => id !== optionId));
    } else {
      setSelected([...selected, optionId]);
    }
  }

  // ------------------------------
  // Calculate score delta for this question
  // Returns +1 or -2 (or 0 if nothing selected)
  // ------------------------------
  function getScoreDelta(question) {
    const correctOptions = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.id);

    if (!selected.length) {
      // No answer: treat as wrong (or 0 if you prefer)
      return -2;
    }

    if (question.mode === "radio") {
      const choice = selected[0];
      if (choice && correctOptions.includes(choice)) {
        return 1;
      }
      return -2;
    }

    if (question.mode === "check") {
      const correctSet = new Set(correctOptions);
      const selectedSet = new Set(selected);

      const isCorrect =
        correctSet.size === selectedSet.size &&
        [...correctSet].every((id) => selectedSet.has(id));

      return isCorrect ? 1 : -2;
    }

    return 0;
  }

  // ------------------------------
  // Go to next question
  // ------------------------------
  function nextQuestion() {
    const delta = getScoreDelta(q);
    const newScore = score + delta;
    setScore(newScore);
    setSelected([]);

    if (current + 1 < questions.length) {
      setCurrent(current + 1);
    } else {
      finishQuiz(newScore);
    }
  }

  // ------------------------------
  // Skip current question (no score change)
  // ------------------------------
  function skipQuestion() {
    setSelected([]);

    if (current + 1 < questions.length) {
      setCurrent(current + 1);
    } else {
      finishQuiz(score);
    }
  }

  // ------------------------------
  // Finish quiz: save to Firestore and navigate to Results
  // ------------------------------
  async function finishQuiz(finalScore) {
    const user = auth.currentUser;

    const total = questions.length;
    const timeSpent = 300 - timeLeft;
    const percentage = Math.max(0, ((finalScore / total) * 100).toFixed(0));

    // Save result to Firestore only if user is logged in
    if (user) {
      try {
        await addDoc(collection(db, "results"), {
          uid: user.uid,
          score: finalScore,
          total,
          percentage: Number(percentage),
          timeSpent,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Error saving result:", err);
      }
    }

    // Navigate to results page with state
    navigate("/results", {
      state: {
        score: finalScore,
        total,
        timeSpent,
        percentage,
      },
    });
  }

  // ------------------------------
  // Format time MM:SS
  // ------------------------------
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // ------------------------------
  // Render UI
  // ------------------------------
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Top bar: question count + timer */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">
          Question {current + 1} / {questions.length}
        </h2>

        <div className="text-lg font-mono bg-gray-800 px-4 py-2 rounded">
          ⏱ {formatTime(timeLeft)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded h-3 mb-8">
        <div
          className="bg-blue-500 h-3 rounded transition-all"
          style={{
            width: `${((current + 1) / questions.length) * 100}%`,
          }}
        ></div>
      </div>

      {/* Question text */}
      <h3 className="text-lg md:text-2xl font-semibold mb-6">{q.question}</h3>

      {/* Options */}
      <div className="flex flex-col gap-4 mb-8">
        {q.options.map((opt) => {
          const isSelected = selected.includes(opt.id);

          return (
            <button
              key={opt.id}
              onClick={() =>
                q.mode === "radio"
                  ? selectRadio(opt.id)
                  : toggleCheckbox(opt.id)
              }
              className={`
                text-left px-4 py-3 rounded-lg border transition
                ${
                  isSelected
                    ? "bg-blue-500 border-blue-400 text-white"
                    : "bg-gray-900 border-gray-700 hover:bg-gray-800"
                }
              `}
            >
              {opt.text}
            </button>
          );
        })}
      </div>

      {/* Bottom buttons */}
      <div className="flex justify-between gap-4">
        <button
          onClick={skipQuestion}
          className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600 transition"
        >
          Skip
        </button>

        <button
          onClick={nextQuestion}
          className="px-6 py-2 bg-blue-500 rounded hover:bg-blue-400 transition"
        >
          {current + 1 === questions.length ? "Finish" : "Next"}
        </button>
      </div>
    </div>
  );
}
