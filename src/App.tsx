import { Routes, Route, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Home } from "@/pages/Home";
import { SystemGrid } from "@/pages/SystemGrid";
import { GameDetail } from "@/pages/GameDetail";
import { Settings } from "@/pages/Settings";
import { Onboarding } from "@/pages/Onboarding";
import { useHydrateStore } from "@/store";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { ToastContainer } from "@/components/Toast";

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();

  const transitionDuration = shouldReduceMotion ? 0 : 0.25;

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
            <LayoutGroup>
              <Outlet />
            </LayoutGroup>
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

  if (!hydrated) {
    return null;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/system/:id" element={<SystemGrid />} />
        <Route path="/game/:id" element={<GameDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="/onboarding" element={<Onboarding />} />
    </Routes>
  );
}

export default App;
