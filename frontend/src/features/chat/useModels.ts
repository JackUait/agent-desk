import { useEffect, useState } from "react";
import type { Model } from "../../shared/types/domain";

interface UseModelsResult {
  models: Model[];
  loading: boolean;
}

export function useModels(): UseModelsResult {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as Model[];
        if (!cancelled) {
          setModels(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      } catch (err) {
        console.error("useModels: failed to fetch /api/models", err);
        if (!cancelled) {
          setModels([]);
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return { models, loading };
}

export const EFFORTS = ["low", "medium", "high", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
