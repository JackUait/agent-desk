import { useParams } from "react-router";

export function CardDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div data-testid="card-detail">
      <h2>Card: {id}</h2>
    </div>
  );
}
