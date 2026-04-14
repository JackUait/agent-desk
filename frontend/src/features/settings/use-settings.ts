import { useCallback, useSyncExternalStore } from "react";

export const SETTINGS_STORAGE_KEY = "agent-desk.settings";

export type PreviewMode = "modal" | "side-peek";

export const PREVIEW_MODES: readonly PreviewMode[] = ["modal", "side-peek"] as const;

export interface Settings {
  autoOpenNewCards: boolean;
  previewMode: PreviewMode;
}

const DEFAULTS: Settings = {
  autoOpenNewCards: false,
  previewMode: "modal",
};

function coercePreviewMode(value: unknown): PreviewMode {
  return value === "side-peek" ? "side-peek" : "modal";
}

function readFromStorage(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      autoOpenNewCards: Boolean(parsed.autoOpenNewCards),
      previewMode: coercePreviewMode(parsed.previewMode),
    };
  } catch {
    return DEFAULTS;
  }
}

function writeToStorage(next: Settings) {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

let currentSettings: Settings = readFromStorage();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Settings {
  return currentSettings;
}

function setSettings(next: Settings) {
  currentSettings = next;
  writeToStorage(next);
  listeners.forEach((l) => l());
}

export function __resetSettingsForTests() {
  currentSettings = readFromStorage();
  listeners.forEach((l) => l());
}

export interface UseSettingsResult {
  settings: Settings;
  setAutoOpenNewCards: (value: boolean) => void;
  setPreviewMode: (value: PreviewMode) => void;
}

export function useSettings(): UseSettingsResult {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setAutoOpenNewCards = useCallback((value: boolean) => {
    setSettings({ ...currentSettings, autoOpenNewCards: value });
  }, []);

  const setPreviewMode = useCallback((value: PreviewMode) => {
    setSettings({ ...currentSettings, previewMode: value });
  }, []);

  return { settings, setAutoOpenNewCards, setPreviewMode };
}
