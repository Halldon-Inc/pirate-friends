// Difficulty probe on the SDK mock-wallet harness. Two bots:
//   parked:   find one aim point that lands a hit, then hold fire there (the old exploit)
//   adaptive: fire, check whether the rival lost hull, and nudge the aim after each miss (a decent human)
// Usage: node games/pirate-friends/bot.mjs <parked|adaptive> <bess|rook|admiral> [width] [ms between adaptive shots]
import { testGame } from "../../scripts/testing.mjs";

const mode = process.argv[2] ?? "parked", rivalId = process.argv[3] ?? "bess", width = Number(process.argv[4] ?? 960), cadence = Number(process.argv[5] ?? 1250);
const rivals = { bess: ["Barnacle Bess", 30], rook: ["Redbeard Rook", 40], admiral: ["The Dread Admiral", 60] };
const [name, stake] = rivals[rivalId];
const kegs = Math.ceil(stake / 10);

await testGame("./games/pirate-friends", {
  width, screenshot: `./artifacts/bot-${mode}-${rivalId}.png`, timeout: 400_000,
  check: async ({ page, game }) => {
    const canvas = game.locator("canvas.pf-canvas");
    while (Number(await game.locator(".pf-stepper output").textContent().then(t => t.split(" ")[0])) < kegs)
      await game.getByRole("button", { name: "One keg more" }).click();
    await game.getByRole("button", { name: new RegExp(`^Load ${kegs * 10} Generations`) }).click();
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await game.getByText(`${kegs * 10} Generations loaded into your hold.`).waitFor();
    await game.getByRole("button", { name: `Battle ${name}, stake ${stake} Generations` }).click();
    await page.waitForTimeout(1700);
    const box = await canvas.boundingBox(), s = box.width / 960;
    const hp = async () => Number(await canvas.getAttribute("data-enemy-hp"));
    const over = async () => (await game.locator(".pf-card h2").count()) > 0;
    const shoot = async (x, y) => { await page.mouse.move(box.x + x * s, box.y + y * s); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); };
    const candidates = [[700, 300], [680, 260], [720, 340], [650, 280], [740, 300], [620, 250], [700, 220], [760, 360], [660, 320]];
    let aim = null;
    for (const [x, y] of candidates) {
      if (await over()) break;
      const before = await hp(); await shoot(x, y); await page.waitForTimeout(1500);
      if (await hp() < before - 3) { aim = [x, y]; break; }
    }
    if (mode === "parked" && aim) {
      await page.mouse.move(box.x + aim[0] * s, box.y + aim[1] * s); await page.mouse.down();
      while (!(await over())) await page.waitForTimeout(500);
      await page.mouse.up();
    } else {
      aim ??= [700, 300];
      const nudges = [[0, 0], [-25, 0], [25, 0], [0, -25], [0, 25], [-45, -15], [45, 15]];
      let n = 0;
      while (!(await over())) {
        const before = await hp();
        const [dx, dy] = nudges[n % nudges.length];
        await shoot(aim[0] + dx, aim[1] + dy); await page.waitForTimeout(cadence);
        if (await over()) break;
        if (await hp() < before - 3) { aim = [aim[0] + dx, aim[1] + dy]; n = 0; } else n++;
      }
    }
    await page.waitForTimeout(400);
    const card = (await game.locator(".pf-card").innerText()).replace(/\s+/g, " ");
    console.log(`${mode} vs ${name}: ${card.slice(0, 330)} | your hull left ${await canvas.getAttribute("data-player-hp")}`);
  },
});
