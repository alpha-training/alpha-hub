import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function History() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeAuth;
    let unsubscribeResults;

    // Watch auth state
    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setResults([]);
        setLoading(false);
        return;
      }

      // Query user's results ordered by createdAt desc
      const q = query(
        collection(db, "results"),
        where("uid", "==", user.uid),
        orderBy("createdAt", "desc")
      );

      unsubscribeResults = onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
            };
          });
          setResults(items);
          setLoading(false);
        },
        (error) => {
          console.error("Error loading history:", error);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeResults) unsubscribeResults();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <p className="text-gray-400">Loading history...</p>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center px-4">
        <h2 className="text-2xl font-semibold mb-3">Quiz History</h2>
        <p className="text-gray-400">
          You haven't completed any quizzes yet.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="text-2xl font-semibold mb-6">Quiz History</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-700">
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Score</th>
              <th className="text-left px-3 py-2">Percent</th>
              <th className="text-left px-3 py-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const date =
                r.createdAt?.toDate
                  ? r.createdAt.toDate().toLocaleString()
                  : "—";

              const time = formatTime(r.timeSpent || 0);

              return (
                <tr
                  key={r.id}
                  className="border-b border-gray-800 hover:bg-gray-900"
                >
                  <td className="px-3 py-2">{date}</td>
                  <td className="px-3 py-2">
                    {r.score} / {r.total}
                  </td>
                  <td className="px-3 py-2">{r.percentage}%</td>
                  <td className="px-3 py-2">{time}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
