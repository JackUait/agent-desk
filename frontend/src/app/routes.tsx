import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

const BoardPage = lazy(() =>
  import("../features/board").then((m) => ({ default: m.BoardPage }))
);

export function AppRoutes() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/" element={<BoardPage />} />
      </Routes>
    </Suspense>
  );
}
