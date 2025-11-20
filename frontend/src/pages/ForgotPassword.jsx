// src/pages/ForgotPassword.jsx
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email has been sent!");
    } catch (err) {
      setError(err.message || "Failed to send reset email");
    }
  };

  return (
    <div className="min-h-screen bg-[#03080B] text-white flex justify-center items-center px-4">
      <div className="w-full max-w-sm bg-gray-900 p-6 rounded-xl border border-gray-800">
        <h1 className="text-xl font-semibold mb-4">Reset Password</h1>
        <p className="text-sm text-gray-400 mb-4">
          Enter your email address and we'll send you a link to reset your password.
        </p>

        <form onSubmit={handleReset} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm"
            placeholder="Your email"
          />

          <button
            type="submit"
            className="w-full py-2 rounded-md bg-blue-600 hover:bg-blue-700 transition text-sm"
          >
            Send reset email
          </button>

          {message && <p className="text-green-400 text-xs">{message}</p>}
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </form>

        <div className="mt-4 text-center">
          <Link to="/" className="text-blue-400 text-sm hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
