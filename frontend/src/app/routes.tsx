import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

const BoardPage = lazy(() =>
  import("../features/board").then((m) => ({ default: m.BoardPage }))
);
const CardDetail = lazy(() =>
  import("../features/card").then((m) => ({ default: m.CardDetail }))
);

export function AppRoutes() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/" element={<BoardPage />} />
        <Route path="/card/:id" element={<CardDetail />} />
      </Routes>
    </Suspense>
  );
}
