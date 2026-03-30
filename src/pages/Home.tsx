import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { Game, PlayStats, System } from "@/types";
import { getGames, getPlayStats, getSystems, launchGame } from "@/services/api";
import { useDynamicColor } from "@/hooks/useDynamicColor";
import { HeroBanner } from "@/components/HeroBanner";
import { HorizontalScrollRow } from "@/components/HorizontalScrollRow";
import { GameCard } from "@/components/GameCard";
import { SystemCard } from "@/components/SystemCard";

export function Home() {
  const navigate = useNavigate();
  const location = useLocation();

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
  }, [loadData, location.key]);

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
