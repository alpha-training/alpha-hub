// src/pages/Home.jsx
import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
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
import {
  getPoints,
  getMaxPointsForAttempt,
  getDisplayBreakdown,
} from "../utils/scoring";

function toMillis(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "string" || typeof ts === "number") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

export default function Home({ user, profile }) {
  const navigate = useNavigate();

  const [lastResult, setLastResult] = useState(null);
  const [loadingResult, setLoadingResult] = useState(true);

  const [selectedTopics, setSelectedTopics] = useState([
    "git",
    "linux",
    "q",
    "live",
    "finance",
    "quant",
    "trading",
  ]);

  const displayName = useMemo(() => {
    if (profile?.firstName) return profile.firstName;
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split("@")[0];
    return "there";
  }, [profile, user]);

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

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
        setLastResult(!snap.empty ? snap.docs[0].data() : null);
      } catch (e) {
        console.error("Error loading last result:", e);
      } finally {
        setLoadingResult(false);
      }
    };

    load();
  }, [user]);

  if (!user) return null;

  const perTypeSeconds = QUIZ_CONFIG.timePerQuestionSecondsByType || {
    mcq: 15,
    live: 20,
  };
  const defaultPerQuestionSeconds = Number(perTypeSeconds.mcq ?? 15) || 15;

  // Home screen estimate (overall timer estimate)
  const totalSeconds =
    (Number(QUIZ_CONFIG.questionsPerAttempt) || 0) * defaultPerQuestionSeconds;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const formattedTotalTime = `${m}:${s.toString().padStart(2, "0")}`;

  const toggleTopic = (id) => {
    setSelectedTopics((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedTopics(TOPICS.map((t) => t.id));
  const deselectAll = () => setSelectedTopics([]);

  const noTopicsSelected = selectedTopics.length === 0;
  const lastAttemptMs = toMillis(lastResult?.startedAt);

  // ✅ NEW: consistent score display (points-first) using utils/scoring
  const lastBreakdown = useMemo(() => {
    return lastResult ? getDisplayBreakdown(lastResult) : null;
  }, [lastResult]);

  const lastPoints = useMemo(() => {
    return lastResult ? getPoints(lastResult, QUIZ_CONFIG) : 0;
  }, [lastResult]);

  const lastMaxPoints = useMemo(() => {
    return lastResult ? getMaxPointsForAttempt(lastResult, QUIZ_CONFIG) : 0;
  }, [lastResult]);

  // For “/ max” labels (points can be negative if wrong=-1; keep max >= 0)
  const safeMaxPoints = Math.max(0, Number(lastMaxPoints || 0));

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white flex flex-col items-center justify-start px-4 pt-14 pb-16">
      <div className="max-w-3xl w-full flex flex-col items-center text-center gap-6">
        {/* WELCOME */}
        <div>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">
            Welcome, {displayName}!
          </h1>
          <p className="text-sm md:text-base text-gray-300 max-w-3xl mx-auto mt-3">
            Scoring:
            <br />•{" "}
            <span className="text-green-400 font-semibold">
              +{QUIZ_CONFIG?.scoring?.correct ?? 1} point
            </span>{" "}
            for each correct answer
            <br />•{" "}
            <span className="text-red-400 font-semibold">
              {QUIZ_CONFIG?.scoring?.wrong ?? -1} point
            </span>{" "}
            for a wrong answer
            <br />•{" "}
            <span className="text-yellow-300 font-semibold">
              {QUIZ_CONFIG?.scoring?.skipped ?? 0} points
            </span>{" "}
            for skipping
          </p>
        </div>

        {/* LAST RESULT */}
        <div className="w-full max-w-xl bg-gray-900 border border-gray-800 rounded-xl p-1 text-left">
          <h2 className="font-semibold text-gray-200 m-2">Last attempt</h2>

          {loadingResult ? (
            <p className="text-xs text-gray-400 m-2">Loading...</p>
          ) : !lastResult ? (
            <p className="text-xs text-gray-400 m-2">
              You haven&apos;t taken the quiz yet.
            </p>
          ) : (
            <div className="text-xs text-gray-300 space-y-1 m-2">
              {/* ✅ Points first */}
              <p className="text-gray-200">
                Points:{" "}
                <span className="font-semibold text-white">{lastPoints}</span>{" "}
                / {safeMaxPoints}
              </p>

              {/* ✅ Accuracy (still useful), but not presented as “Score” */}
              <p className="text-gray-400">
                Accuracy:{" "}
                <span className="font-semibold text-gray-200">
                  {lastBreakdown?.attempted
                    ? `${lastBreakdown.correct} / ${lastBreakdown.attempted}`
                    : "—"}
                </span>{" "}
                <span className="text-[11px] text-gray-500">(correct / attempted)</span>
              </p>

              <p>
                Correct:{" "}
                <span className="text-green-400 font-semibold">
                  {lastBreakdown?.correct ?? 0}
                </span>{" "}
                · Wrong:{" "}
                <span className="text-red-400 font-semibold">
                  {lastBreakdown?.wrong ?? 0}
                </span>{" "}
                · Timed out:{" "}
                <span className="text-amber-300 font-semibold">
                  {lastBreakdown?.timedOut ?? 0}
                </span>{" "}
                · Skipped:{" "}
                <span className="text-yellow-300 font-semibold">
                  {lastBreakdown?.skipped ?? 0}
                </span>
              </p>

              <p className="text-gray-400">
                Taken at:{" "}
                {lastAttemptMs ? new Date(lastAttemptMs).toLocaleString() : "—"}
              </p>
            </div>
          )}
        </div>

        {/* TOPIC SELECTION */}
        <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 w-full max-w-xl text-left">
          <h3 className="font-semibold mb-2 text-gray-200 text-center">
            Select topics
          </h3>

          <p className="text-xs text-gray-400 mb-3 text-center">
            You must select at least one topic before starting the quiz.
          </p>

          {/* 4 left / 3 right */}
          <div className="grid grid-rows-4 grid-flow-col gap-y-2 gap-x-8">
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

          <div className="mt-3 flex gap-3 justify-center">
            <button
              type="button"
              onClick={selectAll}
              className="px-2 py-1 rounded-md bg-teal-800 hover:bg-teal-800 transition text-sm cursor-pointer"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={deselectAll}
              className="px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 transition text-sm cursor-pointer"
            >
              Deselect all
            </button>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-col md:flex-row gap-4 items-center w-full">
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
