/**
 * Controls panel — placeholder for future controller/keyboard mapping.
 */

function ControllerIcon() {
  return (
    <svg width={48} height={48} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 12h4M8 10v4M15 13h.01M18 11h.01M17.32 5H6.68a4 4 0 0 0-3.978 3.59l-.95 7.6A2 2 0 0 0 3.737 18.8l.377-.188a2 2 0 0 0 .96-1.088L6 15h12l.926 2.524a2 2 0 0 0 .96 1.088l.377.188a2 2 0 0 0 1.985-2.61l-.95-7.6A4 4 0 0 0 17.32 5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ControlsPanel() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-text-primary">Controls</h2>
      <p className="text-sm text-text-secondary mt-1">
        Configure controller and keyboard mappings.
      </p>

      <div className="mt-10 flex flex-col items-center justify-center py-16 text-center">
        <div className="text-text-dim mb-4">
          <ControllerIcon />
        </div>
        <h3 className="text-lg font-semibold text-text-primary">Coming Soon</h3>
        <p className="mt-2 text-sm text-text-secondary max-w-sm">
          Controller and keyboard mapping will be available in a future update.
          Stay tuned for full input customization.
        </p>
      </div>
    </div>
  );
}
