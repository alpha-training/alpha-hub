// src/components/UpdateBanner.jsx
import { useEffect, useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

const CURRENT_BUILD = import.meta.env.VITE_BUILD_ID;
const CHECK_EVERY_MS = 60_000;

// Shows a "new version available" bar when a newer build has been deployed since this tab loaded
export default function UpdateBanner() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV || !CURRENT_BUILD) return;
    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const { build } = await res.json();
        if (!stopped && build && build !== CURRENT_BUILD) setStale(true);
      } catch {
        // offline or mid-deploy: try again next time
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    check();

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-blue-800 bg-gray-900 shadow-lg text-sm">
        <span className="text-gray-200">A new version is available.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Reload
        </button>
      </div>
    </div>
  );
}
