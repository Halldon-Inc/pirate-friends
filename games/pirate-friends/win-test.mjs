import assert from "node:assert/strict";
import { testGame } from "../../scripts/testing.mjs";
const width = Number(process.argv[2] ?? 960);
await testGame("./games/pirate-friends", {
  width, screenshot: `./artifacts/pf-${width}-win-final.png`, timeout: 180_000,
  check: async ({ page, game }) => {
    const canvas = game.locator("canvas.pf-canvas");
    await game.getByRole("button", { name: "One keg more" }).click();
    await game.getByRole("button", { name: /^Load 40 Generations/ }).click();
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await game.getByText("40 Generations loaded into your hold.").waitFor();
    await game.getByRole("button", { name: "Battle Barnacle Bess, stake 20 Generations" }).click();
    await page.waitForTimeout(1700);
    const box = await canvas.boundingBox(), s = box.width / 960;
    // Scan aim points until the rival takes damage, then keep firing there.
    let best = null;
    for (const [x, y] of [[700,300],[680,260],[720,340],[650,280],[740,300],[620,250],[700,220],[760,360]]) {
      const before = Number(await canvas.getAttribute("data-enemy-hp"));
      await page.mouse.move(box.x + x * s, box.y + y * s); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
      await page.waitForTimeout(1800);
      const after = Number(await canvas.getAttribute("data-enemy-hp"));
      console.log("aim", x, y, "hp", before, "->", after);
      if (after < before - 4) { best = [x, y]; break; }
    }
    assert.ok(best, "some aim point should land a hit");
    await page.mouse.move(box.x + best[0] * s, box.y + best[1] * s); await page.mouse.down();
    await page.waitForTimeout(2500); await page.screenshot({ path: `./artifacts/pf-${width}-win-mid.png` });
    await game.getByRole("heading", { name: /Victory!|Defeat/ }).waitFor({ timeout: 60_000 });
    await page.mouse.up();
    console.log(await game.locator(".pf-card").innerText());
    await page.screenshot({ path: `./artifacts/pf-${width}-win-result.png` });
  },
});
