/**
 * About panel — app info, version, and tech stack credits.
 */

export function AboutPanel() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-text-primary">About</h2>
      <p className="text-sm text-text-secondary mt-1">
        Application information and credits.
      </p>

      <div className="mt-8 flex justify-center">
        <div className="w-full max-w-md rounded-lg bg-surface border border-ghost p-8 text-center">
          {/* App icon placeholder */}
          <div className="mx-auto w-16 h-16 rounded-xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center mb-4">
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                fill="white"
                stroke="white"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h3 className="text-2xl font-extrabold text-text-primary tracking-tight">
            RetroLaunch
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Version <span className="font-mono text-text-primary">0.1.0</span>
          </p>
          <p className="mt-4 text-sm text-text-secondary leading-relaxed">
            A visually stunning, platform-agnostic front-end launcher for retro
            game emulation. Scan your ROM library, fetch metadata, and launch
            games with a single click.
          </p>

          <div className="mt-6 border-t border-ghost pt-5">
            <span className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
              Built With
            </span>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {["Tauri 2", "React 18", "Rust", "TypeScript", "Tailwind CSS", "SQLite"].map(
                (tech) => (
                  <span
                    key={tech}
                    className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold leading-none border border-accent/50 bg-accent/15 text-accent"
                  >
                    {tech}
                  </span>
                )
              )}
            </div>
          </div>

          <p className="mt-6 text-xs text-text-dim">
            Made with care for the retro gaming community.
          </p>
        </div>
      </div>
    </div>
  );
}
