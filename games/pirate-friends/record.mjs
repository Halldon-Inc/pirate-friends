// Gameplay capture for the README, on the SDK mock-wallet harness: load kegs with one confirmation, fight Barnacle Bess
// with aimed shots and rapid-fire bursts, hold on the result screen. Frames come from the CDP screencast.
// Usage: node games/pirate-friends/record.mjs <out dir> <desktop|phone>
// Writes <out>/<kind>.mp4 (needs ffmpeg on PATH) and prints the battle result.
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { testGame } from "../../scripts/testing.mjs";

const out = resolve(process.argv[2] ?? "./artifacts/record"), kind = process.argv[3] ?? "desktop", phone = kind === "phone";
const [width, height] = phone ? [390, 664] : [960, 640];
const frames = [];
let result = "";

await testGame("./games/pirate-friends", {
  width, height, timeout: 400_000,
  check: async ({ page, game }) => {
    // The harness asks for reduced motion; the capture shows the full effects.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const cdp = await page.context().newCDPSession(page);
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      frames.push({ data, t: metadata.timestamp });
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    const touch = async (x, y, hold = 60) => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      await page.waitForTimeout(hold);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });

    await page.waitForTimeout(1200);
    await game.getByRole("button", { name: /^Load 30 Generations/ }).click();
    await page.waitForTimeout(1300);
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await game.getByText("30 Generations loaded into your hold.").waitFor();
    await page.waitForTimeout(1200);
    await game.getByRole("button", { name: "Battle Barnacle Bess, stake 30 Generations" }).click();
    await page.waitForTimeout(1700);

    // World to screen through the same camera the scene uses.
    const canvas = game.locator("canvas.pf-canvas"), box = await canvas.boundingBox();
    const s = Math.min(box.width / 960, box.height / 520), spanH = box.height / s, left = (960 - box.width / s) / 2;
    const top = spanH >= 640 ? (640 - spanH) / 2 : Math.min(Math.max((680 - spanH) / 2, 0), 640 - spanH);
    const screen = (x, y) => [box.x + (x - left) * s, box.y + (y - top) * s];
    const hp = async () => Number(await canvas.getAttribute("data-enemy-hp"));
    const over = async () => (await game.locator(".pf-card h2").count()) > 0;
    const shoot = async (x, y, hold = 60) => {
      const [sx, sy] = screen(x, y);
      if (phone) return touch(sx, sy, hold);
      await page.mouse.move(sx, sy); await page.mouse.down(); await page.waitForTimeout(hold); await page.mouse.up();
    };

    let aim = [700, 300], found = false, n = 0, round = 0;
    const tries = [[700, 300], [680, 260], [720, 340], [650, 280], [740, 300], [620, 250], [700, 220]];
    const nudges = [[0, 0], [-25, 0], [25, 0], [0, -25], [0, 25]];
    while (!(await over()) && round < 80) {
      round++;
      const before = await hp();
      const [dx, dy] = found ? nudges[n % nudges.length] : [0, 0];
      const target = found ? [aim[0] + dx, aim[1] + dy] : tries[n % tries.length];
      // Once a spot lands, every fourth volley holds the trigger for a rapid-fire burst.
      await shoot(target[0], target[1], found && round % 4 === 0 ? 1300 : 60);
      await page.waitForTimeout(950);
      if (await over()) break;
      if (await hp() < before - 3) { aim = target; found = true; n = 0; } else n++;
    }
    await game.locator(".pf-card h2").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(4000);
    await cdp.send("Page.stopScreencast");
    result = (await game.locator(".pf-card").innerText()).replace(/\s+/g, " ");
  },
});

// Variable-rate screencast frames to a constant 30 fps MP4.
const dir = `${out}/${kind}-frames`;
await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
const list = [];
for (const [i, frame] of frames.entries()) {
  const name = `${dir}/${String(i).padStart(5, "0")}.jpg`;
  await writeFile(name, Buffer.from(frame.data, "base64"));
  list.push(`file '${name.replace(/\\/g, "/")}'`, `duration ${((frames[i + 1]?.t ?? frame.t + 0.5) - frame.t).toFixed(4)}`);
}
await writeFile(`${dir}/list.txt`, list.join("\n") + "\n");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", `${out}/${kind}.mp4`]);
console.log(`${kind}: ${frames.length} frames, ${(frames.at(-1).t - frames[0].t).toFixed(1)} s | ${result.slice(0, 260)}`);
