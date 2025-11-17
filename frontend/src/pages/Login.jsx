import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";
import { EyeSlashIcon, EyeIcon } from '@heroicons/react/24/outline';


export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/home");
    } catch (err) {
      setError("Invalid email or password");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#03080B] px-4">
      <div className="bg-[#0D0F13] w-full max-w-sm md:p-8 px-2 py-8 rounded-xl shadow-xl border border-white/5">
        
        {/* Title */}
        <h1 className="text-3xl font-semibold text-center mb-6 text-white">
          Login
        </h1>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">

          {/* Email */}
          <div>
            <label className="text-sm text-gray-300">Email</label>
            <input
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mt-1 p-3 rounded bg-[#1A1D24] text-white border border-gray-700 focus:border-blue-500 focus:outline-none"
    
            />
          </div>

          {/* Password */}
          <div>
            <label className="text-sm text-gray-300">Password</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 rounded bg-[#1a1f25] text-white border border-gray-600 focus:border-blue-500 outline-none"
                
              />

              {/* Eye toggle */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className=" absolute right-1 top-1/2 -translate-y-1/2
                    text-gray-400 
                    bg-transparent
                    hover:bg-transparent
                    hover:text-white
                    hover:border-transparent
                    focus:border-transparent
                    transition-colors duration-200
                    focus:outline-none
                    active:scale-95"
              >
              {showPassword ? (
                <EyeSlashIcon className="w-5 h-5" />
            ) : (
                <EyeIcon className="w-5 h-5" />
            )}
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          {/* Login Button */}
          <button
            type="submit"
            className="mt-1 w-full py-2 bg-white text-black font-semibold rounded-lg 
                     hover:bg-gray-200 transition"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
