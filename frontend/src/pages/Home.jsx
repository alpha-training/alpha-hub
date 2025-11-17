import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";

export default function Home() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const un = onAuthStateChanged(auth, (u) => {
      if (!u) navigate("/");
      setUser(u);
    });
    return () => un();
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-3xl md:text-5xl font-bold mb-10 max-w-[90%] break-words leading-tight">
        Welcome, {user.email}!
      </h1>

      <div className="flex flex-col md:flex-row gap-4 items-center">
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
