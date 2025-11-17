import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  HomeIcon,
  ClockIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const un = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => un();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setIsOpen(false);
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 w-full bg-gray-900 border-b border-gray-800 z-[2000]">
      <div className="mx-auto flex items-center justify-between px-4 py-3">
        <Link
          to={user ? "/home" : "/"}
          className="text-lg font-bold text-white"
        >
          Alpha<span className="text-blue-400">Hub</span>
        </Link>

        {!user && <div />}  

        {user && (
          <div className="flex items-center gap-4">
            <div
              className="
                hidden
                [@media(min-width:768px)]:flex
                items-center gap-6 text-white
              "
            >
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
                onClick={handleLogout}
                className="flex items-center gap-1 hover:text-blue-400"
              >
                <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                Logout
              </button>
            </div>

            <button
              onClick={() => setIsOpen((prev) => !prev)}
              className="bg-transparent p-0 text-white [@media(min-width:768px)]:hidden"
            >
              {isOpen ? (
                <XMarkIcon className="w-7 h-7" />
              ) : (
                <Bars3Icon className="w-7 h-7" />
              )}
            </button>
          </div>
        )}
      </div>

      {user && isOpen && (
        <div
          className="
            bg-gray-900 border-t border-gray-800 px-4 py-3 space-y-3 text-sm text-white
            [@media(min-width:768px)]:hidden
          "
        >
          <Link
            to="/home"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 hover:text-blue-400"
          >
            <HomeIcon className="w-5 h-5" />
            Home
          </Link>

          <Link
            to="/history"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 hover:text-blue-400"
          >
            <ClockIcon className="w-5 h-5" />
            History
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 hover:text-blue-400"
          >
            <ArrowLeftOnRectangleIcon className="w-5 h-5" />
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}
