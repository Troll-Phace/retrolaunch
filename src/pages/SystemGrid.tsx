import { useParams } from "react-router-dom";

export function SystemGrid() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-text-primary">System Grid</h1>
      <p className="text-text-secondary mt-2">
        Viewing system: <span className="text-accent font-semibold">{id}</span>
      </p>
    </div>
  );
}
