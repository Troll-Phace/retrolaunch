import { motion } from "framer-motion";

function App() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-center"
      >
        <h1 className="text-4xl font-extrabold text-text-primary tracking-tight">
          RetroLaunch
        </h1>
        <p className="mt-2 text-text-secondary text-sm">
          Retro Game Launcher
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <span className="px-3 py-1 rounded-full bg-accent/15 text-accent text-xs font-semibold border border-accent/50">
            NES
          </span>
          <span className="px-3 py-1 rounded-full bg-accent/15 text-accent text-xs font-semibold border border-accent/50">
            SNES
          </span>
          <span className="px-3 py-1 rounded-full bg-accent/15 text-accent text-xs font-semibold border border-accent/50">
            GBA
          </span>
        </div>
        <p className="mt-4 font-mono text-2xl font-bold text-accent">
          47
        </p>
        <p className="text-text-dim text-xs">games</p>
      </motion.div>
    </div>
  );
}

export default App;
