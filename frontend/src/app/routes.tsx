import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

const ProjectsPage = lazy(() =>
  import("../features/project/ProjectsPage").then((m) => ({ default: m.ProjectsPage }))
);

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-bg-page text-[13px] text-text-muted">Loading…</div>}>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
      </Routes>
    </Suspense>
  );
}
