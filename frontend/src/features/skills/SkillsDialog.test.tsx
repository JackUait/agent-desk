import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SkillsDialog } from "./SkillsDialog";
import { skillsApi } from "./skills-api";
import { SETTINGS_STORAGE_KEY } from "../settings";
import { __resetSettingsForTests } from "../settings/use-settings";

beforeEach(() => {
  window.localStorage.clear();
  __resetSettingsForTests();
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
