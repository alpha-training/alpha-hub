// src/components/ProtectedRoute.jsx
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
    });
    return () => unsub();
  }, []);

  // Still checking auth state
  if (user === undefined) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center text-gray-300">
        Loading...
      </div>
    );
  }

  // Not logged in → redirect to login
  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
}
