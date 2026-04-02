import { useAppStore } from "@/store";
import type { CardSize } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIZES: CardSize[] = ["compact", "normal", "large"];

const SIZE_LABELS: Record<CardSize, string> = {
  compact: "Compact card size",
  normal: "Normal card size",
  large: "Large card size",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CardSizeSlider() {
  const cardSize = useAppStore((s) => s.cardSize);
  const setCardSize = useAppStore((s) => s.setCardSize);
  const currentIndex = SIZES.indexOf(cardSize);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const size = SIZES[Number(e.target.value)];
    if (size) setCardSize(size);
  };

  return (
    <div
      className="inline-flex items-center gap-1.5"
      role="group"
      aria-label="Card size"
    >
      <DenseGridIcon />
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={currentIndex}
        onChange={handleChange}
        aria-label="Card size"
        aria-valuetext={SIZE_LABELS[cardSize]}
        className={[
          "w-20 cursor-pointer appearance-none bg-transparent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void",
          // Webkit track
          "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-ghost-lit",
          // Webkit thumb
          "[&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[0_0_6px_var(--accent)]",
          // Firefox track
          "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-ghost-lit",
          // Firefox thumb
          "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:shadow-[0_0_6px_var(--accent)]",
        ].join(" ")}
      />
      <SparseGridIcon />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (internal)
// ---------------------------------------------------------------------------

/** 4x3 grid of small squares — represents compact / many cards. */
function DenseGridIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="size-3.5 text-text-dim"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="3" height="3" rx="0.5" />
      <rect x="5" y="1" width="3" height="3" rx="0.5" />
      <rect x="9" y="1" width="3" height="3" rx="0.5" />
      <rect x="13" y="1" width="2" height="3" rx="0.5" />
      <rect x="1" y="6" width="3" height="3" rx="0.5" />
      <rect x="5" y="6" width="3" height="3" rx="0.5" />
      <rect x="9" y="6" width="3" height="3" rx="0.5" />
      <rect x="13" y="6" width="2" height="3" rx="0.5" />
      <rect x="1" y="11" width="3" height="3" rx="0.5" />
      <rect x="5" y="11" width="3" height="3" rx="0.5" />
      <rect x="9" y="11" width="3" height="3" rx="0.5" />
      <rect x="13" y="11" width="2" height="3" rx="0.5" />
    </svg>
  );
}

/** 2x2 grid of larger squares — represents large / fewer cards. */
function SparseGridIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="size-3.5 text-text-dim"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}
