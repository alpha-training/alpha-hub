import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function Home() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) navigate("/");
      else setUser(currentUser);
    });

    return () => unsub();
  }, [navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  return (
    <div className="min-h-screen w-full text-white flex flex-col items-center justify-center px-6 py-10 font-sora">

      {/* Welcome */}
      <div className="animate-fadeIn text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold">
          Welcome{user ? `, ${user.email}!` : "!"}
        </h1>
      </div>

      {/* Button Row */}
      <div className="flex flex-wrap gap-4 animate-slideUp">

        <button
          onClick={() => navigate("/quiz")}
          className="
            bg-white text-black 
            px-6 py-3 rounded-xl font-semibold
            hover:bg-white/80
            transition-all duration-200
          "
        >
          Start Quiz
        </button>

        <button
          onClick={() => navigate("/history")}
          className="
            bg-white text-black
            px-6 py-3 rounded-xl font-semibold
            hover:bg-white/80
            transition-all duration-200
          "
        >
          View History
        </button>

        <button
          onClick={handleLogout}
          className="
            bg-white text-black
            px-6 py-3 rounded-xl font-semibold
            hover:bg-white/80
            transition-all duration-200
          "
        >
          Logout
        </button>

      </div>
    </div>
  );
}
