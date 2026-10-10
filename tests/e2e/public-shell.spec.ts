import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await expect
    .poll(
      async () =>
        (await request.get("http://localhost:3000/api/health/live")).status(),
      { timeout: 60_000 },
    )
    .toBe(200);
});

test("shows the exclusive Google login with keyboard-visible controls", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", {
      name: "Seu planejamento começa com uma conta Google.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Entrar com Google" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Ir para o conteúdo principal" }),
  ).toBeFocused();
});

test("keeps the login usable at tablet and phone widths", async ({ page }) => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const login = page.getByRole("link", { name: "Entrar com Google" });
    await expect(login).toBeVisible();
    const box = await login.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width,
    );
  }
});

test("opens the authenticated local demonstration when explicitly enabled", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("link", { name: "Entrar com Google" }),
  ).toBeVisible({ timeout: 30_000 });
  const demo = page.getByRole("button", {
    name: "Entrar na demonstração local",
  });
  test.skip((await demo.count()) === 0, "Local demonstration is disabled.");
  await demo.click();
  await expect(page.getByRole("heading", { name: /Olá,/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("professora.ana@example.invalid")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Boletins e envio" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
});
