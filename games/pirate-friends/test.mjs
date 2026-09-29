// Automated check: mock wallet harness from FriendSDK. Real ownership is verified separately with a real wallet.
// Usage: node games/pirate-friends/test.mjs <artifacts dir> <width | widthxheight> [touch]
// Frames under 500px wide, and any size given "touch", run with touch emulation (coarse pointer, touch events).
import assert from "node:assert/strict";
import { testGame } from "../../scripts/testing.mjs";

const out = process.argv[2] ?? "./artifacts";
const [width, height] = (process.argv[3] ?? "960").split("x").map(Number);
const touch = process.argv[4] === "touch" || width < 500;
const tag = height ? `${width}x${height}` : String(width);
const metrics = {};

/** Smallest visible text and tap target in the game document and the SDK frame, plus controls pushed out of view. */
async function measure(page, game, label) {
  const inGame = await game.locator("body").evaluate(() => {
    const shown = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest(".pf-sr,[aria-hidden=true]"); };
    let text = { size: 99, sample: "" };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement, value = node.textContent.trim();
      if (!value || !el || !shown(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < text.size) text = { size, sample: value.slice(0, 40) };
    }
    let target = { size: 999, name: "" }; const offscreen = [], scrolled = [], boxes = [];
    for (const el of document.querySelectorAll("button,input,canvas")) {
      if (!shown(el)) continue;
      const r = el.getBoundingClientRect(), name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40);
      // A checkbox inside a label is tapped through the whole label row.
      const hit = el.closest("label") ?? el, r2 = hit.getBoundingClientRect();
      if (el.tagName !== "CANVAS" && hit !== el) {
        boxes.push({ name, left: r2.left, top: r2.top, right: r2.right, bottom: r2.bottom });
        if (Math.min(r2.width, r2.height) < target.size) target = { size: Math.round(Math.min(r2.width, r2.height)), name: `label: ${hit.textContent.trim().slice(0, 30)}` };
      } else if (el.tagName !== "CANVAS") {
        boxes.push({ name, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        if (Math.min(r.width, r.height) < target.size) target = { size: Math.round(Math.min(r.width, r.height)), name };
      }
      // Inside a scrolling panel a control may sit below the fold (reachable by scrolling); otherwise it must be on screen.
      let box = el.parentElement;
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
      const area = box ? box.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      if (box && (r.bottom > area.bottom + 1 || r.top < area.top - 1)) scrolled.push(name);
      const edge = box ? area : r;
      if (edge.left < -1 || edge.top < -1 || edge.right > innerWidth + 1 || edge.bottom > innerHeight + 1 || (!box && (r.bottom > innerHeight + 1))) offscreen.push(name);
      // Only the part of a control its scroll panel shows can sit under the toolbar.
      const last = boxes.at(-1);
      if (box && last?.name === name) Object.assign(last, { top: Math.max(last.top, area.top), bottom: Math.min(last.bottom, area.bottom) });
      if (last?.name === name && last.bottom <= last.top) boxes.pop();
    }
    return { frame: `${innerWidth}x${innerHeight}`, text, target, offscreen, scrolled, boxes };
  });
  const host = await page.evaluate(() => {
    const frame = document.querySelector(".rf-game-frame").getBoundingClientRect(), view = document.querySelector("iframe").getBoundingClientRect();
    const items = [...document.querySelectorAll(".rf-frame-toolbar > *")].map(el => {
      const r = el.getBoundingClientRect();
      return { name: el.textContent.trim(), size: parseFloat(getComputedStyle(el).fontSize), w: Math.round(r.width), h: Math.round(r.height),
        left: r.left - view.left, top: r.top - view.top, right: r.right - view.left, bottom: r.bottom - view.top, clipped: el.scrollWidth > el.clientWidth + 1 };
    });
    return { frame: `${Math.round(frame.width)}x${Math.round(frame.height)}`, viewport: `${innerWidth}x${innerHeight}`, items };
  });
  // Game controls must not sit under the SDK toolbar.
  const overlaps = inGame.boxes.flatMap(a => host.items.filter(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).map(b => `${a.name} / ${b.name}`));
  const buttons = host.items.filter(item => item.name && item.h > 0);
  metrics[label] = {
    frame: host.frame, smallestText: `${inGame.text.size}px "${inGame.text.sample}"`, smallestTarget: `${inGame.target.size}px "${inGame.target.name}"`,
    toolbar: buttons.map(item => `${item.name} ${item.w}x${item.h} ${item.size}px${item.clipped ? " (truncated)" : ""}`).join(", "),
    offscreen: inGame.offscreen, needsScroll: inGame.scrolled, overlaps,
  };
  assert.deepEqual(inGame.offscreen, [], `${label}: controls outside the frame`);
  assert.deepEqual(overlaps, [], `${label}: game controls under the SDK toolbar`);
}

await testGame("./games/pirate-friends", {
  width, ...(height ? { height } : {}), screenshot: `${out}/pf-${tag}-final.png`, timeout: 90_000,
  check: async ({ page, game }) => {
    let cdp;
    if (touch) {
      cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      assert.ok(await game.locator("body").evaluate(() => matchMedia("(pointer:coarse)").matches), "touch emulation reaches the game");
    }
    const canvas = game.locator("canvas.pf-canvas");
    // A finger down at the first point, dragged through the rest, then lifted.
    const touchPath = async points => {
      const at = ([x, y]) => [{ x, y, id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(points[0]) });
      for (const point of points.slice(1)) { await page.waitForTimeout(40); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(point) }); }
      await page.waitForTimeout(60); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    await game.getByRole("button", { name: /^Load 30 Generations/ }).waitFor();
    await page.screenshot({ path: `${out}/pf-${tag}-harbor.png` });
    await measure(page, game, "harbor");
    assert.equal(await game.getByTestId("hold").textContent(), "0");
    await game.getByRole("button", { name: /^Load 30 Generations/ }).click();
    await page.getByRole("button", { name: "Confirm preview", exact: true }).waitFor();
    await page.screenshot({ path: `${out}/pf-${tag}-confirm.png` });
    await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
    await game.getByText("30 Generations loaded into your hold.").waitFor();
    assert.equal(await game.getByTestId("hold").textContent(), "30");
    await game.getByRole("button", { name: "Battle Barnacle Bess, stake 30 Generations" }).click();
    assert.equal(await page.getByRole("button", { name: "Confirm preview", exact: true }).count(), 0, "Firing needs no confirmation");
    await page.waitForTimeout(1700);
    for (let i = 0; i < 6; i++) { await canvas.press("Space"); await page.waitForTimeout(450); }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/pf-${tag}-battle.png` });
    await measure(page, game, "battle");
    const ammo = Number(await canvas.getAttribute("data-ammo"));
    assert.ok(ammo <= 25 && ammo >= 23, `expected about 6 shots fired, ammo ${ammo}`);
    if (touch) {
      // Let an overheated barrel cool, then drag to aim and release to fire, then tap FIRE.
      await page.waitForTimeout(3000);
      const box = await canvas.boundingBox();
      await touchPath([[box.x + box.width * 0.6, box.y + box.height * 0.4], [box.x + box.width * 0.7, box.y + box.height * 0.37], [box.x + box.width * 0.75, box.y + box.height * 0.35]]);
      await page.waitForTimeout(800);
      assert.equal(Number(await canvas.getAttribute("data-ammo")), ammo - 1, "drag and release fires one shot");
      const fire = game.getByRole("button", { name: /^Fire/ });
      assert.ok(await fire.isVisible(), "FIRE button shows on touch screens");
      const spot = await fire.boundingBox();
      await touchPath([[spot.x + spot.width / 2, spot.y + spot.height / 2]]); await page.waitForTimeout(800);
      assert.equal(Number(await canvas.getAttribute("data-ammo")), ammo - 2, "tapping FIRE fires one shot");
      await page.screenshot({ path: `${out}/pf-${tag}-battle-touch.png` });
      await game.getByRole("button", { name: "Pause" }).click();
    } else await canvas.press("Escape");
    await game.getByRole("button", { name: /Strike your colours/ }).waitFor();
    await page.screenshot({ path: `${out}/pf-${tag}-menu.png` });
    await measure(page, game, "menu");
    await game.getByRole("button", { name: /Strike your colours/ }).click();
    await game.getByRole("heading", { name: "Defeat" }).waitFor({ timeout: 10_000 });
    assert.equal(await game.getByTestId("hold").count(), 0);
    await page.screenshot({ path: `${out}/pf-${tag}-result.png` });
    await measure(page, game, "result");
    await game.getByRole("button", { name: "Back to harbor" }).click();
    await game.getByRole("button", { name: /^Load 30 Generations/ }).waitFor();
  },
});
console.log(JSON.stringify(metrics, null, 1));
console.log("pirate-friends browser check passed at", tag, touch ? "(touch)" : "");
