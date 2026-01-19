// src/pages/History.jsx
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { TOPICS } from "../config";

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

              // ✅ attemptedCount exists on new results; fallback for older ones
              const attempted =
                Number.isFinite(Number(a.attemptedCount))
                  ? Number(a.attemptedCount)
                  : Math.max(
                      0,
                      Number(a.totalQuestions ?? 0) - Number(a.skippedCount ?? 0)
                    );

              // ✅ score is now "correct"; fallback to correctCount if needed
              const correct = Number(a.correctCount ?? a.score ?? 0);

              return (
                <div
                  key={a.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2"
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

                  <div className="text-xs md:text-sm text-gray-300 md:text-right space-y-1">
                    <p>
                      Score:{" "}
                      <span className="font-semibold text-white">
                        {correct}
                      </span>{" "}
                      /{" "}
                      <span className="font-semibold text-white">
                        {attempted}
                      </span>{" "}
                      <span className="text-[11px] text-gray-400">
                        (attempted)
                      </span>
                    </p>

                    <p>
                      Correct:{" "}
                      <span className="text-green-400">{a.correctCount}</span>
                      {" · "}
                      Wrong:{" "}
                      <span className="text-red-400">{a.wrongCount}</span>
                      {" · "}
                      Skipped:{" "}
                      <span className="text-yellow-300">{a.skippedCount}</span>
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
