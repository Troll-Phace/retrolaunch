import { useRef, type MouseEvent } from "react";
import { motion } from "framer-motion";

const GENRES = [
  "All",
  "Action",
  "RPG",
  "Platform",
  "Puzzle",
  "Sports",
  "Racing",
  "Shooter",
  "Strategy",
  "Adventure",
] as const;

export interface GenreFilterBarProps {
  activeGenre: string;
  onGenreChange: (genre: string) => void;
}

export function GenreFilterBar({
  activeGenre,
  onGenreChange,
}: GenreFilterBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      // Allow horizontal scrolling via vertical wheel
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      ref={scrollRef}
      onWheel={handleWheel}
      className="no-scrollbar flex gap-2 overflow-x-auto py-1"
      role="tablist"
      aria-label="Filter by genre"
    >
      {GENRES.map((genre) => {
        const isActive = genre === activeGenre;
        return (
          <GenrePill
            key={genre}
            label={genre}
            isActive={isActive}
            onClick={() => onGenreChange(genre)}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GenrePill (internal)
// ---------------------------------------------------------------------------

interface GenrePillProps {
  label: string;
  isActive: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

function GenrePill({ label, isActive, onClick }: GenrePillProps) {
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`inline-flex shrink-0 cursor-pointer items-center rounded-full px-3 py-1 text-xs font-semibold leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-void ${
        isActive
          ? "bg-accent text-white"
          : "border border-ghost-lit bg-transparent text-text-secondary hover:border-accent/50 hover:text-text-primary"
      }`}
    >
      {label}
    </motion.button>
  );
}
