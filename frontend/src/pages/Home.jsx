// src/pages/Home.jsx
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { QUIZ_CONFIG, TOPICS } from "../config";

function getNameFromEmail(email) {
  if (!email) return "there";
  const part = email.split("@")[0];
  const first = part.split(/[._-]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [loadingResult, setLoadingResult] = useState(true);

  const [selectedTopics, setSelectedTopics] = useState(["git", "linux", "q"]);
  const navigate = useNavigate();

  // --------------- AUTH ----------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        navigate("/", { replace: true });
        setUser(null);
      } else {
        setUser({
          uid: u.uid,
          email: u.email,
          displayName: getNameFromEmail(u.email),
        });
      }
    });
    return () => unsub();
  }, [navigate]);

  // --------------- LOAD LAST RESULT ----------------
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoadingResult(true);

      try {
        const q = query(
          collection(db, "quizResults"),
          where("uid", "==", user.uid),
          orderBy("startedAt", "desc"),
          limit(1)
        );

        const snap = await getDocs(q);
        if (!snap.empty) {
          setLastResult(snap.docs[0].data());
        } else {
          setLastResult(null);
        }
      } catch (e) {
        console.error("Error loading last result:", e);
      } finally {
        setLoadingResult(false);
      }
    };

    load();
  }, [user]);

  if (!user) return null;

  // Convert total seconds → minutes
  const totalSeconds =
    QUIZ_CONFIG.questionsPerAttempt * QUIZ_CONFIG.timePerQuestionSeconds;

  const totalMinutes = Math.round(totalSeconds / 60);

  const toggleTopic = (id) => {
    setSelectedTopics((prev) =>
      prev.includes(id)
        ? prev.filter((t) => t !== id)
        : [...prev, id]
    );
  };

  const noTopicsSelected = selectedTopics.length === 0;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white flex flex-col items-center justify-start px-4 pt-24 pb-16">
      <div className="max-w-3xl w-full flex flex-col items-center text-center gap-10">

        {/* WELCOME */}
        <div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">
            Welcome, {user.displayName}!
          </h1>

          {/* Explanation block */}
          <p className="text-sm md:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
            You will receive a random selection of{" "}
            <span className="font-semibold">{QUIZ_CONFIG.questionsPerAttempt}</span>{" "}
            questions from the topics you choose below.  
            Each question has{" "}
            <span className="font-semibold">{QUIZ_CONFIG.timePerQuestionSeconds}s</span>{" "}
            to answer — that's around{" "}
            <span className="font-semibold">{totalMinutes} minutes total</span>.
            <br /><br />
            Scoring:
            <br />
            • <span className="text-green-400 font-semibold">+1 point</span> for each correct answer  
            <br />
            • <span className="text-red-400 font-semibold">-2 points</span> for a wrong answer  
            <br />
            • <span className="text-yellow-300 font-semibold">0 points</span> for skipping  
          </p>
        </div>

        {/* Last Result */}
        <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-xl p-2 text-left">
          <h2 className="text-sm font-semibold text-gray-200 mb-2">
            Last attempt
          </h2>

          {loadingResult ? (
            <p className="text-xs text-gray-400">Loading...</p>
          ) : !lastResult ? (
            <p className="text-xs text-gray-400">
              You haven't taken the quiz yet.
            </p>
          ) : (
            <div className="text-xs text-gray-300 space-y-1">
              <p>
                Score:{" "}
                <span className="font-semibold text-white">
                  {lastResult.score}
                </span>
              </p>

              <p>
                Correct:{" "}
                <span className="text-green-400 font-semibold">
                  {lastResult.correctCount}
                </span>{" "}
                · Wrong:{" "}
                <span className="text-red-400 font-semibold">
                  {lastResult.wrongCount}
                </span>{" "}
                · Skipped:{" "}
                <span className="text-yellow-300 font-semibold">
                  {lastResult.skippedCount}
                </span>
              </p>

              {lastResult.startedAt && (
                <p className="text-[11px] text-gray-400">
                  Taken at:{" "}
                  {new Date(lastResult.startedAt.seconds * 1000).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Topic selection */}
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 w-full max-w-xl">
          <h3 className="text-sm font-semibold mb-2 text-gray-200">
            Select topics
          </h3>

          <p className="text-xs text-gray-400 mb-3">
            You must select at least one topic before starting the quiz.
          </p>

          <div className="flex flex-col gap-2">
            {TOPICS.map((t) => (
              <label
                key={t.id}
                className="flex items-center gap-2 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  className="accent-blue-500"
                  checked={selectedTopics.includes(t.id)}
                  onChange={() => toggleTopic(t.id)}
                />
                {t.label}
              </label>
            ))}
          </div>

          {noTopicsSelected && (
            <p className="text-xs text-red-400 mt-3">
              Please select at least one topic.
            </p>
          )}
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <Link
            to={noTopicsSelected ? "#" : "/quiz"}
            state={{ topics: selectedTopics }}
            className={`w-full max-w-xs px-6 py-3 rounded-md shadow text-center text-sm font-medium transition
              ${
                noTopicsSelected
                  ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }
            `}
            onClick={(e) => {
              if (noTopicsSelected) e.preventDefault();
            }}
          >
            Start quiz
          </Link>

          <Link
            to="/history"
            className="w-full max-w-xs px-6 py-3 bg-gray-100 text-gray-900 rounded-md shadow hover:bg-white transition text-center text-sm font-medium"
          >
            View history
          </Link>
        </div>
      </div>
    </div>
  );
}
