// src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "./firebase";

import Navbar from "./components/Navbar";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Quiz from "./pages/Quiz";
import Results from "./pages/Results";
import History from "./pages/History";
import ProtectedRoute from "./components/ProtectedRoute";
import ForgotPassword from "./pages/ForgotPassword";
import AdminPanel from "./pages/AdminPanel";

import { isAdmin } from "./utils/admin";
import { ensureUserProfile } from "./services/userProfile";

export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!alive) return;

        if (!u) {
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        setLoading(true);
        setUser(u);

        const p = await ensureUserProfile(db, u);
        if (!alive) return;

        setProfile(p);
        setLoading(false);
      } catch (e) {
        console.error("Auth/Profile init error:", e);
        if (!alive) return;
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      alive = false;
      unsub();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#03080B] text-white">
      <Navbar user={user} profile={profile} />
      <div className="pt-14">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/forgot" element={<ForgotPassword />} />

          <Route
            path="/home"
            element={
              <ProtectedRoute user={user}>
                <Home user={user} profile={profile} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/quiz"
            element={
              <ProtectedRoute user={user}>
                <Quiz user={user} profile={profile} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/results"
            element={
              <ProtectedRoute user={user}>
                <Results user={user} profile={profile} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/history"
            element={
              <ProtectedRoute user={user}>
                <History user={user} profile={profile} />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              user && isAdmin(user) ? (
                <AdminPanel user={user} profile={profile} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      </div>
    </div>
  );
}
