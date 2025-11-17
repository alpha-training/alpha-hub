import { useState, useEffect } from "react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const un = onAuthStateChanged(auth, (user) => {
      if (user) navigate("/home");
    });
    return () => un();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/home");
    } catch (err) {
      console.error(err);
      setError("Invalid email or password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleLogin}
        className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-8 space-y-6"
      >
        <h1 className="text-3xl font-bold text-center mb-2">Login</h1>

        <div>
          <label className="text-sm mb-1 block">Email</label>
          <input
            type="email"
            className="w-full p-3 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div className="relative">
          <label className="text-sm mb-1 block">Password</label>
          <input
            type={showPassword ? "text" : "password"}
            className="w-full p-3 rounded bg-gray-800 border border-gray-700 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <a
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="cursor-pointer absolute right-3 top-[38px] text-gray-400 hover:text-gray-200 transition-colors"
          >
            {showPassword ? (
              <EyeSlashIcon className="w-5 h-5" />
            ) : (
              <EyeIcon className="w-5 h-5" />
            )}
          </a>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          className="w-full p-3 rounded bg-white text-black font-semibold hover:bg-gray-200 transition-colors"
        >
          Login
        </button>
      </form>
    </div>
  );
}
