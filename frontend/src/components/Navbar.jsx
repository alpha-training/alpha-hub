// src/components/Navbar.jsx
import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  HomeIcon,
  ClockIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/", { replace: true });
  };

  return (
    <nav className="fixed top-0 left-0 w-full bg-gray-900 border-b border-gray-800 z-20">
      <div className="mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link
          to={user ? "/home" : "/"}
          className="text-lg font-semibold text-white"
        >
          Alpha<span className="text-blue-400">Hub</span>
        </Link>

        {/* Mobile burger (only when logged in) */}
        {user && (
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="md:hidden bg-transparent p-0"
          >
            {isOpen ? (
              <XMarkIcon className="w-6 h-6 text-white" />
            ) : (
              <Bars3Icon className="w-6 h-6 text-white" />
            )}
          </button>
        )}

        {/* Desktop navigation (only when logged in) */}
        {user && (
          <div className="hidden  [@media(min-width:768px)]:flex items-center gap-6 text-sm text-gray-100">
            <Link
              to="/home"
              className="flex items-center gap-1 hover:text-blue-400"
            >
              <HomeIcon className="w-5 h-5" />
              Home
            </Link>

            <Link
              to="/history"
              className="flex items-center gap-1 hover:text-blue-400"
            >
              <ClockIcon className="w-5 h-5" />
              History
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1 hover:text-red-400"
            >
              <ArrowLeftOnRectangleIcon className="w-5 h-5" />
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Mobile dropdown */}
      {user && isOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900 px-4 py-3 space-y-3 text-sm text-gray-100">
          <Link
            to="/home"
            className="flex items-center gap-2 hover:text-blue-400"
          >
            <HomeIcon className="w-5 h-5" />
            Home
          </Link>

          <Link
            to="/history"
            className="flex items-center gap-2 hover:text-blue-400"
          >
            <ClockIcon className="w-5 h-5" />
            History
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 hover:text-red-400"
          >
            <ArrowLeftOnRectangleIcon className="w-5 h-5" />
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}
