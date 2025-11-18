import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";

export default function Home() {
  const [user, setUser] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const navigate = useNavigate();

  // Redirect if not logged in
  useEffect(() => {
    const un = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/");
      setUser(u);
    });
    return () => un();
  }, []);

  // Load latest result
  useEffect(() => {
    async function loadLast() {
      if (!auth.currentUser) return;

      const q = query(
        collection(db, "results"),
        where("uid", "==", auth.currentUser.uid),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      const snap = await getDocs(q);

      if (!snap.empty) {
        setLastResult({
          id: snap.docs[0].id,
          ...snap.docs[0].data(),
        });
      }
    }

    loadLast();
  }, [user]);

  if (!user) return null;

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col items-center justify-start px-4 min-h-screen text-center">

      <h1 className="text-3xl md:text-5xl font-bold mt-10 mb-6">
        Welcome, {user.email}!
      </h1>

      {/* EXPLANATION BLOCK */}
      <div className="max-w-xl text-gray-300 bg-gray-900 border border-gray-700 rounded-xl p-5 mb-10 leading-relaxed shadow">
        <h2 className="text-xl font-semibold text-white mb-3">Quiz Rules</h2>
        <p className="mb-2">
          You will have <span className="text-blue-400 font-semibold">5 minutes </span> 
          to complete a quiz of 
          <span className="text-blue-400 font-semibold"> 30 random questions.</span>
        </p>

        <p className="mb-2">
          Each question is either multiple-choice (one correct answer) or checkbox 
          (multiple correct answers). You can 
          <span className="text-blue-400"> skip questions</span> and return later.
        </p>

        <p className="mb-2">
          Scoring:  
          <span className="text-green-400 font-semibold"> +1</span> for correct answer,  
          <span className="text-red-400 font-semibold"> −2</span> for each wrong answer.
        </p>

        <p>
          Your results are automatically saved and can be viewed on the 
          <Link
          to="/history"> <span className="text-blue-400"> History page. </span></Link>
        </p>
      </div>

      {/* LAST RESULT */}
      {lastResult && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-full max-w-md mb-10 shadow">
          <h2 className="text-xl font-semibold mb-3">Last Result</h2>

          <p className="text-gray-300">
            Score: <span className="text-blue-400">{lastResult.score}</span> /{" "}
            {lastResult.total}
          </p>

          <p className="text-gray-300">
            Percentage:{" "}
            <span className="text-blue-400">{lastResult.percentage}%</span>
          </p>

          <p className="text-gray-300">
            Time: {formatTime(lastResult.timeSpent || 0)}
          </p>

          <p className="text-gray-500 text-sm mt-2">
            {lastResult.createdAt?.toDate
              ? lastResult.createdAt.toDate().toLocaleString()
              : ""}
          </p>
        </div>
      )}

      {!lastResult && (
        <p className="text-gray-500 mb-10">
          You haven't completed any quizzes yet.
        </p>
      )}

      {/* BUTTONS */}
      <div className="flex flex-col md:flex-row gap-4 items-center mb-20 w-full md:w-auto">
        <Link
          to="/quiz"
          className="w-full max-w-xs px-6 py-3 bg-blue-600 text-white rounded-md shadow hover:bg-blue-500 transition text-center"
        >
          Start Quiz
        </Link>

        <Link
          to="/history"
          className="w-full max-w-xs px-6 py-3 bg-white text-black rounded-md shadow hover:bg-gray-200 transition text-center"
        >
          View History
        </Link>
      </div>
    </div>
  );
}
