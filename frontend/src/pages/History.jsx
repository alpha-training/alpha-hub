import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { TOPICS } from "../config";

export default function History() {
  const [user, setUser] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  // AUTH
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

  // LOAD HISTORY
  useEffect(() => {
    const fetch = async () => {
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

    fetch();
  }, [user]);

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#03080B] text-white pt-24 pb-10 px-4 flex justify-center">
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

              return (
                <div
                  key={a.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                >
                  <div>
                    <p className="font-medium">
                      Attempt #{attempts.length - i}
                    </p>

                    <p className="text-xs text-blue-300">
                      Topics: {topicNames}
                    </p>

                    <p className="text-xs text-gray-400">
                      {a.startedAt
                        ? new Date(a.startedAt.seconds * 1000).toLocaleString()
                        : "Unknown date"}
                    </p>
                  </div>

                  <div className="text-xs text-gray-300 md:text-right space-y-1">
                    <p>
                      Score:{" "}
                      <span className="font-semibold text-white">
                        {a.score}
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
                      <span className="text-yellow-300">
                        {a.skippedCount}
                      </span>
                    </p>

                    {a.durationSeconds != null && (
                      <p>Duration: {a.durationSeconds}s</p>
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
