import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SkillsDialog } from "./SkillsDialog";
import { skillsApi } from "./skills-api";
import { SETTINGS_STORAGE_KEY } from "../settings";
import { __resetSettingsForTests } from "../settings/use-settings";
import {
  requestSidePeek,
  __resetSidePeekForTests,
} from "../../shared/ui/side-peek-coordinator";

beforeEach(() => {
  window.localStorage.clear();
  __resetSettingsForTests();
  __resetSidePeekForTests();
});

vi.mock("./SkillMarkdownEditor", () => ({
  SkillMarkdownEditor: ({ value, onChange, readOnly }: {
    value: string;
    onChange: (v: string) => void;
    readOnly: boolean;
  }) => (
    <textarea
      aria-label="body"
      value={value}
      disabled={readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("./skills-api", () => ({
  skillsApi: {
    list: vi.fn(),
    readContent: vi.fn(),
    writeContent: vi.fn(),
    create: vi.fn(),
    rename: vi.fn(),
    delete: vi.fn(),
  },
}));

const mocked = skillsApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("SkillsDialog", () => {
  it("lists skills and loads content on click", async () => {
    mocked.list.mockResolvedValue({
      items: [
        { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/a/SKILL.md" },
      ],
    });
    mocked.readContent.mockResolvedValue({ path: "/a/SKILL.md", body: "hi", frontmatter: { name: "alpha" } });

    render(<SkillsDialog open scope={{ kind: "global" }} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());
    fireEvent.click(screen.getByText("alpha"));
    await waitFor(() => expect((screen.getByLabelText("body") as HTMLTextAreaElement).value).toBe("hi"));
  });

  it("switching tab filters by kind", async () => {
    mocked.list.mockResolvedValue({
      items: [
        { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/s/a/SKILL.md" },
        { id: "2", kind: "command", name: "greet", description: "", source: "user", readOnly: false, path: "/c/greet.md" },
      ],
    });
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("tab", { name: /commands/i }));
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();
    expect(screen.getByText("greet")).toBeInTheDocument();
  });

  it("defaults to modal preview layout", async () => {
    mocked.list.mockResolvedValue({ items: [] });
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("skills-preview-root")).toHaveAttribute(
        "data-preview-mode",
        "modal",
      );
    });
  });

  it("renders as side-peek when setting previewMode='side-peek'", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    mocked.list.mockResolvedValue({ items: [] });
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={() => {}} />);
    await waitFor(() => {
      const root = screen.getByTestId("skills-preview-root");
      expect(root).toHaveAttribute("data-preview-mode", "side-peek");
      expect(root.className).toMatch(/right-0/);
    });
  });

  it("side-peek has no overlay wrapper so the page behind stays clickable", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    mocked.list.mockResolvedValue({ items: [] });
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={() => {}} />);
    const root = await screen.findByTestId("skills-preview-root");
    const parent = root.parentElement;
    expect(parent?.className ?? "").not.toMatch(/bg-black/);
    expect(parent?.className ?? "").not.toMatch(/inset-0/);
  });

  it("side-peek closes when clicking outside the panel", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    mocked.list.mockResolvedValue({ items: [] });
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside-area">outside</div>
        <SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />
      </div>,
    );
    await waitFor(() => expect(screen.getByTestId("skills-preview-root")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("outside-area"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("side-peek does not close when clicking inside the panel", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    mocked.list.mockResolvedValue({ items: [] });
    const onClose = vi.fn();
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />);
    const root = await screen.findByTestId("skills-preview-root");
    fireEvent.click(root);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("side-peek does not close when clicking an element marked data-sidepeek-safe", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    mocked.list.mockResolvedValue({ items: [] });
    const onClose = vi.fn();
    render(
      <div>
        <button type="button" data-sidepeek-safe>skills trigger</button>
        <SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />
      </div>,
    );
    await screen.findByTestId("skills-preview-root");
    fireEvent.click(screen.getByText("skills trigger"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("modal mode does not close on outside click", async () => {
    mocked.list.mockResolvedValue({ items: [] });
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="outside-area">outside</div>
        <SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />
      </div>,
    );
    await screen.findByTestId("skills-preview-root");
    // outside-area is behind the modal backdrop — simulate a direct click anyway
    fireEvent.click(screen.getByTestId("outside-area"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("side-peek: releases ownership when another peek requests open (clean state)", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    mocked.list.mockResolvedValue({ items: [] });
    const onClose = vi.fn();
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />);
    await screen.findByTestId("skills-preview-root");
    const granted = requestSidePeek("card", () => true);
    expect(granted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("side-peek: dirty state denies another peek when user dismisses confirm", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    mocked.list.mockResolvedValue({
      items: [
        { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/a/SKILL.md" },
      ],
    });
    mocked.readContent.mockResolvedValue({ path: "/a/SKILL.md", body: "hi", frontmatter: {} });
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());
    fireEvent.click(screen.getByText("alpha"));
    await waitFor(() => expect(screen.getByLabelText("body")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "changed" } });

    const granted = requestSidePeek("card", () => true);
    expect(confirmSpy).toHaveBeenCalled();
    expect(granted).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("side-peek: dirty state allows another peek when user confirms discard", async () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ previewMode: "side-peek" }),
    );
    __resetSettingsForTests();
    mocked.list.mockResolvedValue({
      items: [
        { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/a/SKILL.md" },
      ],
    });
    mocked.readContent.mockResolvedValue({ path: "/a/SKILL.md", body: "hi", frontmatter: {} });
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());
    fireEvent.click(screen.getByText("alpha"));
    await waitFor(() => expect(screen.getByLabelText("body")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "changed" } });

    const granted = requestSidePeek("card", () => true);
    expect(confirmSpy).toHaveBeenCalled();
    expect(granted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("dirty-close shows confirm", async () => {
    mocked.list.mockResolvedValue({
      items: [
        { id: "1", kind: "skill", name: "alpha", description: "", source: "user", readOnly: false, path: "/a/SKILL.md" },
      ],
    });
    mocked.readContent.mockResolvedValue({ path: "/a/SKILL.md", body: "hi", frontmatter: {} });

    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<SkillsDialog open scope={{ kind: "global" }} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeInTheDocument());
    fireEvent.click(screen.getByText("alpha"));
    await waitFor(() => expect(screen.getByLabelText("body")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("body"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: /close dialog/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
