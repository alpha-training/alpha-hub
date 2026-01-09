// src/components/Navbar.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  HomeIcon,
  ClockIcon,
  Bars3Icon,
  XMarkIcon,
  ShieldCheckIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";
import logo from "../assets/alpha-kdb-logo.png";
import { isAdmin } from "../utils/admin";

export default function Navbar({ user, profile }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const showAdmin = isAdmin(user);

  // Optional: if you want a name somewhere later
  const displayName = useMemo(() => {
    const full = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
    return full || user?.displayName || user?.email || "";
  }, [profile, user]);

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
        <Link to={user ? "/home" : "/"} className="flex items-center my-2">
          <img
            src={logo}
            alt="AlphaKDB logo"
            className="h-8 w-auto object-contain"
            loading="eager"
          />
        </Link>

        {user && (
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="md:hidden bg-transparent p-0"
            aria-label="Toggle menu"
          >
            {isOpen ? (
              <XMarkIcon className="w-6 h-6 text-white" />
            ) : (
              <Bars3Icon className="w-6 h-6 text-white" />
            )}
          </button>
        )}

        {user && (
          <div className="hidden [@media(min-width:768px)]:flex items-center gap-6 text-sm text-gray-100">
            <Link to="/home" className="flex items-center gap-1 hover:text-blue-400">
              <HomeIcon className="w-5 h-5" />
              Home
            </Link>

            <Link to="/history" className="flex items-center gap-1 hover:text-blue-400">
              <ClockIcon className="w-5 h-5" />
              History
            </Link>

            {showAdmin && (
              <Link to="/admin" className="flex items-center gap-1 hover:text-blue-400">
                <ShieldCheckIcon className="w-5 h-5" />
                Admin Panel
              </Link>
            )}

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

      {user && isOpen && (
        <div className="md:hidden border-t border-gray-800 bg-gray-900 px-4 py-3 space-y-3 text-sm text-gray-100">
          <Link to="/home" className="flex items-center gap-2 hover:text-blue-400">
            <HomeIcon className="w-5 h-5" />
            Home
          </Link>

          <Link to="/history" className="flex items-center gap-2 hover:text-blue-400">
            <ClockIcon className="w-5 h-5" />
            History
          </Link>

          {showAdmin && (
            <Link to="/admin" className="flex items-center gap-2 hover:text-blue-400">
              <ShieldCheckIcon className="w-5 h-5" />
              Admin Panel
            </Link>
          )}

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
