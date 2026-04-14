import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

const ProjectsPage = lazy(() =>
  import("../features/project/ProjectsPage").then((m) => ({ default: m.ProjectsPage }))
);

export function AppRoutes() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
      </Routes>
    </Suspense>
  );
}
