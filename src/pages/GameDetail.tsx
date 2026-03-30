import { useParams } from "react-router-dom";

export function GameDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-text-primary">Game Detail</h1>
      <p className="text-text-secondary mt-2">
        Viewing game: <span className="text-accent font-semibold">{id}</span>
      </p>
    </div>
  );
}
