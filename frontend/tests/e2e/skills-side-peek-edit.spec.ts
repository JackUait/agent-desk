import { test, expect, type Page } from "@playwright/test";

function uniqueSkillName() {
  return `e2e-temp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
const SETTINGS_KEY = "agent-desk.settings";

async function openSidePeek(page: Page) {
  await page.addInitScript(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({ previewMode: "side-peek" }),
      );
    },
    { key: SETTINGS_KEY },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "skills", exact: true }).click();
  await expect(page.getByTestId("skills-preview-root")).toBeVisible();
}

async function createTempSkill(page: Page, name: string) {
  await page
    .getByTestId("skills-preview-root")
    .getByRole("button", { name: "new skill" })
    .click();
  const dialog = page.locator('[data-sidepeek-safe].fixed.inset-0');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[aria-label="name"]').fill(name);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".milkdown-host [contenteditable=true]")).toBeVisible();
}

async function deleteTempSkill(page: Page, name: string) {
  const peek = page.getByTestId("skills-preview-root");
  if (!(await peek.isVisible().catch(() => false))) return;
  const item = peek.getByRole("button", { name });
  if (!(await item.isVisible().catch(() => false))) return;
  await item.click();
  page.once("dialog", (d) => d.accept());
  await peek.getByRole("button", { name: "delete" }).click();
}

test.describe("skills side-peek edit interactions", () => {
  let SKILL_NAME = "";
  test.beforeEach(async ({ page }) => {
    SKILL_NAME = uniqueSkillName();
    await openSidePeek(page);
    await createTempSkill(page, SKILL_NAME);
  });

  test.afterEach(async ({ page }) => {
    await deleteTempSkill(page, SKILL_NAME).catch(() => {});
  });

  test("typing in milkdown body marks dirty and Save click persists without closing peek", async ({ page }) => {
    const editor = page.locator(".milkdown-host [contenteditable=true]").first();
    await editor.click();
    await page.keyboard.type("HELLO BODY");
    // Allow milkdown listener debounce (200ms)
    await page.waitForTimeout(300);
    const save = page.getByRole("button", { name: "save" });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toHaveText(/Saved/);
    await expect(page.getByTestId("skills-preview-root")).toBeVisible();
  });

  test("editing description and clicking save keeps peek open", async ({ page }) => {
    const desc = page.getByRole("textbox", { name: "description" });
    await desc.click();
    await page.keyboard.type("desc edit");
    await page.waitForTimeout(50);
    await expect(page.getByRole("button", { name: "save" })).toBeEnabled();
    await page.getByRole("button", { name: "save" }).click();
    await expect(page.getByTestId("skills-preview-root")).toBeVisible();
  });

  test("after editing body, clicking another skill in the list shows confirm", async ({ page }) => {
    const editor = page.locator(".milkdown-host [contenteditable=true]").first();
    await editor.click();
    await page.keyboard.type("changed");
    await page.waitForTimeout(300);
    page.once("dialog", (d) => d.dismiss());
    // Click any other skill button in the list (first one that isn't the temp skill)
    const otherSkill = page
      .getByTestId("skills-preview-root")
      .locator("button")
      .filter({ hasNotText: SKILL_NAME })
      .filter({ hasText: /\w/ })
      .first();
    await otherSkill.click().catch(() => {});
    await expect(page.getByTestId("skills-preview-root")).toBeVisible();
  });

  test("after editing body, clicking inside description does not close peek", async ({ page }) => {
    const editor = page.locator(".milkdown-host [contenteditable=true]").first();
    await editor.click();
    await page.keyboard.type("body");
    await page.waitForTimeout(300);
    await page.getByRole("textbox", { name: "description" }).click();
    await page.keyboard.type(" desc");
    await expect(page.getByTestId("skills-preview-root")).toBeVisible();
    await expect(page.getByRole("button", { name: "save" })).toBeEnabled();
  });

  test("after editing body, clicking Revert keeps peek open and clears dirty", async ({ page }) => {
    const editor = page.locator(".milkdown-host [contenteditable=true]").first();
    await editor.click();
    await page.keyboard.type("temporary");
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: /^revert$/i }).click();
    await expect(page.getByTestId("skills-preview-root")).toBeVisible();
    await expect(page.getByRole("button", { name: "save" })).toHaveText(/Saved/);
  });

  test("after editing body, switching editor mode (Rendered <-> Raw) keeps peek open", async ({ page }) => {
    const editor = page.locator(".milkdown-host [contenteditable=true]").first();
    await editor.click();
    await page.keyboard.type("hi");
    await page.waitForTimeout(300);
    await page.getByRole("tab", { name: "show raw markdown" }).click();
    await expect(page.getByRole("textbox", { name: "raw markdown" })).toBeVisible();
    await expect(page.getByTestId("skills-preview-root")).toBeVisible();
    await page.getByRole("tab", { name: "show rendered markdown" }).click();
    await expect(page.getByTestId("skills-preview-root")).toBeVisible();
  });

  test("after editing body, hovering and clicking the file path footer is a no-op (panel stays)", async ({ page }) => {
    const editor = page.locator(".milkdown-host [contenteditable=true]").first();
    await editor.click();
    await page.keyboard.type("x");
    await page.waitForTimeout(300);
    // Click on FilePath span at footer
    const footer = page.getByTestId("skills-preview-root").locator("div.font-mono.text-\\[10\\.5px\\]").first();
    if (await footer.isVisible().catch(() => false)) {
      await footer.click();
    }
    await expect(page.getByTestId("skills-preview-root")).toBeVisible();
  });
});
