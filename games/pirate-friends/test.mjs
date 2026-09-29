// Automated check: mock wallet harness from FriendSDK. Real ownership is verified separately with a real wallet.
import assert from "node:assert/strict";
import { testGame } from "../../scripts/testing.mjs";

const out = process.argv[2] ?? "./artifacts";
const width = Number(process.argv[3] ?? 960);
await testGame("./games/pirate-friends", {
  width, screenshot: `${out}/pf-${width}-final.png`, timeout: 90_000,
  check: async ({ page, game }) => {
    const canvas = game.locator("canvas.pf-canvas");
    await game.getByRole("button", { name: /^Load 30 Generations/ }).waitFor();
    await page.screenshot({ path: `${out}/pf-${width}-harbor.png` });
    assert.equal(await game.getByTestId("hold").textContent(), "0");
    await game.getByRole("button", { name: /^Load 30 Generations/ }).click();
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await game.getByText("30 Generations loaded into your hold.").waitFor();
    assert.equal(await game.getByTestId("hold").textContent(), "30");
    await game.getByRole("button", { name: "Battle Barnacle Bess, stake 20 Generations" }).click();
    assert.equal(await page.getByRole("button", { name: "Confirm preview", exact: true }).count(), 0, "Firing needs no confirmation");
    await page.waitForTimeout(1700);
    for (let i = 0; i < 6; i++) { await canvas.press("Space"); await page.waitForTimeout(450); }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/pf-${width}-battle.png` });
    const ammo = Number(await canvas.getAttribute("data-ammo"));
    assert.ok(ammo <= 15 && ammo >= 13, `expected about 6 shots fired, ammo ${ammo}`);
    await canvas.press("Escape");
    await game.getByRole("button", { name: /Strike your colours/ }).click();
    await game.getByRole("heading", { name: "Defeat" }).waitFor({ timeout: 10_000 });
    assert.equal(await game.getByTestId("hold").count(), 0);
    await page.screenshot({ path: `${out}/pf-${width}-result.png` });
  },
});
console.log("pirate-friends browser check passed at", width);
