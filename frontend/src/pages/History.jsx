import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { TOPICS, QUIZ_CONFIG } from "../config";
import {
  getPoints,
  getMaxPointsForAttempt,
  getDisplayBreakdown,
  formatPct,
} from "../utils/scoring";

function formatDuration(seconds) {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toMillis(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().getTime();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return null;
}

export default function History({ user }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const fetchAttempts = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const q = query(
          collection(db, "quizResults"),
          where("uid", "==", user.uid),
          orderBy("startedAt", "desc")
        );

        const snap = await getDocs(q);
        setAttempts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("History load error:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchAttempts();
  }, [user]);

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-14 md:pt-24 pb-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">History</h1>
        <p className="text-sm text-gray-300 mb-6">
          All your quiz attempts are listed below.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : attempts.length === 0 ? (
          <p className="text-sm text-gray-400">No attempts yet.</p>
        ) : (
          <div className="space-y-3">
            {attempts.map((a, i) => {
              const topicNames = (a.topics || [])
                .map((t) => TOPICS.find((x) => x.id === t)?.label || t)
                .join(", ");

              const startedAtMs = toMillis(a.startedAt);

              const breakdown = getDisplayBreakdown(a);
              const points = getPoints(a, QUIZ_CONFIG);
              const maxPoints = getMaxPointsForAttempt(a, QUIZ_CONFIG);

              const accuracy =
                breakdown.attempted > 0
                  ? breakdown.correct / breakdown.attempted
                  : 0;

              return (
                <div
                  key={a.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm flex flex-col items-center text-center gap-2"
                >
                  <div>
                    <p className="font-medium text-sm md:text-base mb-1">
                      Attempt #{attempts.length - i}
                    </p>

                    <p className="text-xs text-blue-300">Topics: {topicNames}</p>

                    <p className="text-xs text-gray-400">
                      {startedAtMs
                        ? new Date(startedAtMs).toLocaleString()
                        : "Unknown date"}
                    </p>
                  </div>

                  <div className="text-xs md:text-sm text-gray-300 space-y-1 w-full max-w-md">
                    {/* ✅ PRIMARY: points */}
                    <p>
                      Score:{" "}
                      <span className="font-semibold text-white">
                        {points}
                      </span>{" "}
                      /{" "}
                      <span className="font-semibold text-white">
                        {maxPoints}
                      </span>{" "}
                      <span className="text-[11px] text-gray-400">pts</span>
                    </p>

                    {/* ✅ SECONDARY: accuracy */}
                    <p className="text-[12px] text-gray-400">
                      Accuracy:{" "}
                      <span className="text-gray-300 font-semibold">
                        {formatPct(accuracy)}
                      </span>{" "}
                      · Correct:{" "}
                      <span className="text-green-400">{breakdown.correct}</span>{" "}
                      /{" "}
                      <span className="text-gray-300">{breakdown.attempted}</span>{" "}
                      <span className="text-[11px] text-gray-500">(attempted)</span>
                    </p>

                    <p>
                      Wrong: <span className="text-red-400">{breakdown.wrong}</span>
                      {" · "}
                      Timed out:{" "}
                      <span className="text-amber-300">{breakdown.timedOut}</span>
                      {" · "}
                      Skipped:{" "}
                      <span className="text-yellow-300">{breakdown.skipped}</span>
                    </p>

                    {a.durationSeconds != null && (
                      <p className="text-xs">
                        Duration: {formatDuration(a.durationSeconds)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
