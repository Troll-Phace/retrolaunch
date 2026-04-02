import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { Game, PlayStats, System } from "@/types";
import { getGames, getPlayStats, getSystems, launchGame, scanDirectories } from "@/services/api";
import { useAppStore } from "@/store";
import { useDynamicColor } from "@/hooks/useDynamicColor";
import { HeroBanner } from "@/components/HeroBanner";
import { HorizontalScrollRow } from "@/components/HorizontalScrollRow";
import { GameCard } from "@/components/GameCard";
import { SystemCard } from "@/components/SystemCard";
import { EmptyState } from "@/components/EmptyState";

export function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const dataVersion = useAppStore((s) => s.dataVersion);

  const [games, setGames] = useState<Game[]>([]);
  const [systems, setSystems] = useState<System[]>([]);
  const [heroGameId, setHeroGameId] = useState<number | null>(null);
  const [heroStats, setHeroStats] = useState<PlayStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [allGames, allSystems] = await Promise.all([
        getGames({}),
        getSystems(),
      ]);
      setGames(allGames);
      setSystems(allSystems);

      // Find the most recently played game and fetch its stats
      const played = allGames
        .filter((g) => g.last_played_at !== null)
        .sort((a, b) => b.last_played_at!.localeCompare(a.last_played_at!));

      const mostRecent = played[0];
      if (mostRecent) {
        setHeroGameId(mostRecent.id);
        const stats = await getPlayStats(mostRecent.id);
        setHeroStats(stats);
      } else {
        setHeroGameId(null);
        setHeroStats(null);
      }
    } catch (err) {
      console.error("Failed to load home data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch data whenever the user navigates (back) to the home page
  useEffect(() => {
    loadData();
  }, [loadData, location.key, dataVersion]);

  // Look up hero game from the authoritative ID set during data load
  const heroGame = useMemo(() => {
    if (heroGameId === null) return null;
    return games.find((g) => g.id === heroGameId) ?? null;
  }, [games, heroGameId]);

  // Apply dynamic colors from hero game's cover art
  useDynamicColor(heroGame?.cover_path ?? null);

  // Top 12 most recently added games
  const recentlyAdded = useMemo(() => {
    return [...games]
      .sort((a, b) => b.date_added.localeCompare(a.date_added))
      .slice(0, 12);
  }, [games]);

  // Game count per system
  const systemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    games.forEach((g) => {
      counts[g.system_id] = (counts[g.system_id] || 0) + 1;
    });
    return counts;
  }, [games]);

  // Only systems that have at least one game
  const activeSystems = useMemo(() => {
    return systems.filter((s) => (systemCounts[s.id] || 0) > 0);
  }, [systems, systemCounts]);

  function handlePlay(gameId: number) {
    launchGame(gameId).catch(console.error);
  }

  function handleGameClick(game: Game) {
    navigate(`/game/${game.id}`);
  }

  function handleSystemClick(system: System) {
    navigate(`/system/${system.id}`);
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-text-secondary">Loading...</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" className="size-full" aria-hidden="true">
              <path
                d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="Your library is empty"
          description="Add ROM directories and scan for games to get started."
          actionLabel="Add ROM Directory"
          onAction={() => navigate("/settings")}
          secondaryActionLabel="Run Scan"
          onSecondaryAction={() => {
            scanDirectories([]).catch(console.error);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <HeroBanner game={heroGame} playStats={heroStats} onPlay={handlePlay} />

      {recentlyAdded.length > 0 && (
        <HorizontalScrollRow title="Recently Added">
          {recentlyAdded.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onClick={handleGameClick}
              className="w-[180px]"
            />
          ))}
        </HorizontalScrollRow>
      )}

      {activeSystems.length > 0 && (
        <HorizontalScrollRow title="Your Systems">
          {activeSystems.map((system) => (
            <SystemCard
              key={system.id}
              system={system}
              gameCount={systemCounts[system.id] || 0}
              onClick={handleSystemClick}
            />
          ))}
        </HorizontalScrollRow>
      )}
    </div>
  );
}
