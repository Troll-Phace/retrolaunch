import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";

const Home = lazy(() => import("@/pages/Home").then(m => ({ default: m.Home })));
const SystemGrid = lazy(() => import("@/pages/SystemGrid").then(m => ({ default: m.SystemGrid })));
const GameDetail = lazy(() => import("@/pages/GameDetail").then(m => ({ default: m.GameDetail })));
const Settings = lazy(() => import("@/pages/Settings").then(m => ({ default: m.Settings })));
const Onboarding = lazy(() => import("@/pages/onboarding").then(m => ({ default: m.Onboarding })));
import { useHydrateStore, useAppStore } from "@/store";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { ToastContainer } from "@/components/Toast";
import { onNewRomDetected, onRomRemoved } from "@/services/events";
import { fetchMetadata } from "@/services/api";
import { checkForUpdateSilently } from "@/hooks/useUpdateChecker";

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  const transitionDuration = shouldReduceMotion ? 0 : 0.25;

  // Listen for file system watcher events (new ROM detected / ROM removed).
  // The `cancelled` flag handles React StrictMode's double-mount: if cleanup
  // runs before the async `.then()` resolves, the stale listener is unsubscribed
  // immediately once the promise settles.
  useEffect(() => {
    let cancelled = false;
    let unlistenNew: (() => void) | undefined;
    let unlistenRemoved: (() => void) | undefined;

    onNewRomDetected((game) => {
      const store = useAppStore.getState();
      store.addToast({
        type: "success",
        message: `New game detected: ${game.title}`,
      });
      store.incrementDataVersion();

      fetchMetadata({ game_ids: [game.id], force: false }).catch((err) =>
        console.error("Failed to fetch metadata for new game:", err)
      );
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlistenNew = fn; }
    });

    onRomRemoved(() => {
      const store = useAppStore.getState();
      store.addToast({
        type: "info",
        message: "Game removed from library",
      });
      store.incrementDataVersion();
    }).then((fn) => {
      if (cancelled) { fn(); } else { unlistenRemoved = fn; }
    });

    return () => {
      cancelled = true;
      unlistenNew?.();
      unlistenRemoved?.();
    };
  }, []);

  // Background update check on app launch
  useEffect(() => {
    checkForUpdateSilently().then((result) => {
      if (result?.available && result.version) {
        useAppStore.getState().addToast({
          type: "info",
          message: `Update available (v${result.version})`,
          duration: 0,
          action: {
            label: "Update Now",
            onClick: () => {
              result.downloadAndInstall?.();
            },
          },
        });
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-void">
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-void border-b border-ghost flex items-center justify-between px-6">
        {/* Left: Logo */}
        <Link to="/" className="flex flex-col justify-center">
          <span className="font-extrabold text-[22px] text-text-primary leading-tight tracking-[-0.5px]">
            RETROLAUNCH
          </span>
          <span className="text-accent text-[10px] font-semibold tracking-[3px] uppercase leading-tight">
            GAME LIBRARY
          </span>
        </Link>

        {/* Right: Search + Settings */}
        <div className="flex items-center gap-3">
          {/* Search Input */}
          <Input
            variant="search"
            placeholder="Search games..."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            className="w-64"
          />

          {/* Settings Gear Icon */}
          <Button
            variant="icon"
            size="sm"
            onClick={() => navigate('/settings')}
            aria-label="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-16">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: transitionDuration, ease: "easeOut" }}
            style={{ position: "relative" }}
          >
            <Suspense fallback={<div className="min-h-screen bg-void" />}>
              <LayoutGroup>
                <Outlet />
              </LayoutGroup>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Toast notifications — outside AnimatePresence so they persist across routes */}
      <ToastContainer />
    </div>
  );
}

function App() {
  const hydrated = useHydrateStore();
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);

  if (!hydrated) {
    return null;
  }

  return (
    <Routes>
      {!onboardingComplete ? (
        <>
          <Route path="/onboarding" element={
            <Suspense fallback={<div className="min-h-screen bg-void" />}>
              <Onboarding />
            </Suspense>
          } />
          {/* Redirect ALL non-onboarding routes to /onboarding */}
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </>
      ) : (
        <>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/system/:id" element={<SystemGrid />} />
            <Route path="/game/:id" element={<GameDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          {/* Redirect /onboarding back to / when onboarding is complete */}
          <Route path="/onboarding" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}

export default App;
