import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSkills } from "./use-skills";
import { skillsApi } from "./skills-api";
import type { SkillItem, SkillContent } from "./types";

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

const mocked = skillsApi as unknown as {
  list: ReturnType<typeof vi.fn>;
  readContent: ReturnType<typeof vi.fn>;
  writeContent: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const item: SkillItem = {
  id: "user:skill:/x/SKILL.md",
  kind: "skill",
  name: "alpha",
  description: "",
  source: "user",
  readOnly: false,
  path: "/x/SKILL.md",
};

const content: SkillContent = {
  path: "/x/SKILL.md",
  body: "body",
  frontmatter: { name: "alpha" },
};

beforeEach(() => {
  mocked.list.mockResolvedValue({ items: [item] });
  mocked.readContent.mockResolvedValue(content);
  mocked.writeContent.mockImplementation(async (_s, _p, c) => {
    const bodyOnly = (c as string).split("---\n").slice(2).join("---\n");
    return { path: "/x/SKILL.md", body: bodyOnly, frontmatter: { name: "alpha" } };
  });
});

afterEach(() => vi.clearAllMocks());

describe("useSkills", () => {
  it("loads list on mount", async () => {
    const { result } = renderHook(() => useSkills({ kind: "global" }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(mocked.list).toHaveBeenCalledWith({ kind: "global" });
  });

  it("selecting an item loads content", async () => {
    const { result } = renderHook(() => useSkills({ kind: "global" }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.select(item);
    });
    expect(result.current.selected?.path).toBe("/x/SKILL.md");
    expect(result.current.draftBody).toBe("body");
    expect(result.current.isDirty).toBe(false);
  });

  it("editing sets dirty and save clears it", async () => {
    const { result } = renderHook(() => useSkills({ kind: "global" }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    await act(async () => {
      await result.current.select(item);
    });
    act(() => result.current.setDraftBody("new body"));
    expect(result.current.isDirty).toBe(true);
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.isDirty).toBe(false);
    expect(mocked.writeContent).toHaveBeenCalled();
  });
});
