/**
 * Pirate Friends battle engine: a canvas sim and renderer with no SDK, wallet or economy access.
 * The React component owns the simulated Generations ledger; this file only reports what happened.
 */

export const VIEW_W = 960, VIEW_H = 640;
const SEA_Y = 468, HORIZON = 392, GRAVITY = 560;
const PLAYER_RELOAD = 0.42, MAX_PARTICLES = 700;
const ANGLE_MIN = -12, ANGLE_MAX = 78, POWER_MIN = 0.2;

export type Zone = "magazine" | "waterline" | "cabin" | "sails" | "hull";
export const ZONES: Readonly<Record<Zone, { label: string; damage: number; bonus: number; effect: string }>> = {
  magazine: { label: "POWDER MAGAZINE", damage: 34, bonus: 5, effect: "One huge blast per ship, sets the deck on fire, stops repairs while it burns" },
  waterline: { label: "WATERLINE", damage: 11, bonus: 0, effect: "Springs a leak that keeps draining hull until the crew bails it out" },
  cabin: { label: "CAPTAIN'S CABIN", damage: 8, bonus: 2, effect: "Plunders loose Generations from the cabin" },
  sails: { label: "SAILS", damage: 3, bonus: 0, effect: "Shot rips through; every tear slows their reload" },
  hull: { label: "HULL", damage: 6, bonus: 0, effect: "Solid hit" },
};

export type ShipLook = Readonly<{ hull: string; hullDark: string; stripe: string; trim: string; sail: string; sailTrim: string; flag: string }>;
export type Rival = Readonly<{
  id: string; name: string; ship: string; difficulty: string; blurb: string; stake: number; hp: number;
  reload: number; spread: number; windSkill: number; scale: number; drift: number; regen: number; taunts: readonly string[]; look: ShipLook;
}>;

export const PLAYER_LOOK: ShipLook = { hull: "#c26b2e", hullDark: "#6d3313", stripe: "#12d6c0", trim: "#ffd23f", sail: "#fff6df", sailTrim: "#ccff00", flag: "#ccff00" };
export const RIVALS: readonly Rival[] = [
  { id: "bess", name: "Barnacle Bess", ship: "The Soggy Biscuit", difficulty: "Easy", blurb: "Sloppy aim, fast hands. Stop hitting her and she patches the hull.",
    stake: 30, hp: 137, reload: 1.5, spread: 0.085, windSkill: 0.35, scale: 0.9, drift: 62, regen: 2.4,
    taunts: ["Bess: Ye couldn't hit the sea from a rowboat!", "Bess: Is that a cannon or a pea shooter?", "Bess: My gran shoots straighter, and she's a barnacle!", "Bess: Keep feedin' the fishes, sweetie!"],
    look: { hull: "#e0913f", hullDark: "#8a4a17", stripe: "#3ec8ff", trim: "#fff1a8", sail: "#fff0f6", sailTrim: "#ff5fae", flag: "#ff5fae" } },
  { id: "rook", name: "Redbeard Rook", ship: "The Crimson Gull", difficulty: "Medium", blurb: "Reads the wind, tacks hard, repairs fast. Tear his sails early.",
    stake: 40, hp: 168, reload: 1.42, spread: 0.076, windSkill: 0.65, scale: 1, drift: 76, regen: 3.1,
    taunts: ["Rook: Ha! The wind's on MY side, landlubber!", "Rook: Missed by a mile, and a mile's a long way!", "Rook: I've seen better aim from a drunk parrot!", "Rook: Those Generations were lovely. Send more!"],
    look: { hull: "#9b3b2c", hullDark: "#4e1810", stripe: "#ffb627", trim: "#ffe08a", sail: "#ffe3c2", sailTrim: "#e63946", flag: "#e63946" } },
  { id: "admiral", name: "The Dread Admiral", ship: "Leviathan's Grin", difficulty: "Hard", blurb: "A floating fortress with a crew of carpenters. Find the magazine or go home broke.",
    stake: 60, hp: 182, reload: 1.68, spread: 0.07, windSkill: 0.9, scale: 1.12, drift: 86, regen: 3.7,
    taunts: ["Admiral: Pathetic.", "Admiral: Your Generations make fine ballast.", "Admiral: I've sunk better Friends before breakfast.", "Admiral: Do try to aim, captain."],
    look: { hull: "#34324a", hullDark: "#14131f", stripe: "#b388ff", trim: "#ffd23f", sail: "#2a2340", sailTrim: "#ff3d6e", flag: "#111" } },
];

export type SoundName = "fire" | "enemyFire" | "hit" | "boom" | "splash" | "skip" | "bonus" | "gull" | "kraken" | "win" | "lose" | "tear";
export type Hud = Readonly<{
  playerHp: number; playerMax: number; enemyHp: number; enemyMax: number; ammo: number; enemyAmmo: number;
  wind: number; angle: number; power: number; streak: number; bonus: number; status: string; repairing: boolean; desperate: boolean; heat: number; overheated: boolean;
}>;
export type BattleResult = Readonly<{
  won: boolean; reason: "sunk" | "surrender" | "destroyed" | "dry"; stake: number; fired: number; unfired: number;
  bonus: number; hits: Readonly<Record<Zone, number>>; accuracy: number;
}>;
export type SceneOptions = Readonly<{
  friendFrames: readonly (readonly string[])[];
  onSound: (name: SoundName) => void;
  onHud: (hud: Hud) => void;
  onEnd: (result: BattleResult) => void;
  onCallout: (text: string) => void;
}>;

type Point = { x: number; y: number };
type Ship = {
  look: ShipLook; x: number; facing: 1 | -1; scale: number; hp: number; maxHp: number; leak: number; fire: number;
  sailTears: number; magazineBlown: boolean; holes: { x: number; y: number; r: number }[]; flames: Point[];
  sinking: number; phase: number; angle: number; recoil: number; flash: number; ammo: number; reload: number;
  isPlayer: boolean; pose: { cx: number; cy: number; rot: number }; lastHit: number; desperate: boolean;
};
type Shot = { x: number; y: number; vx: number; vy: number; owner: "player" | "enemy"; rot: number; spin: number; skips: number; tore: boolean; alive: boolean; age: number; hue: number; close: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: "spark" | "smoke" | "debris" | "drop" | "ring" | "feather" | "bubble" | "flash"; grav: number; rot: number };
type Text = { text: string; x: number; y: number; life: number; color: string; size: number };
type Gull = { x: number; y: number; vx: number; flap: number; alive: boolean };
type Floater = { x: number; kind: "barrel" | "chest"; life: number; phase: number; alive: boolean };
type Kraken = { x: number; t: number; duration: number; points: Point[] };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const inRect = (p: Point, r: readonly number[]) => p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3];

// Ship-local geometry, facing right, origin on the waterline. Enemy ships are mirrored.
const MAGAZINE = [4, -27, 30, -9] as const;
const WATERLINE = [[-98, -14, -64, 4], [34, -14, 68, 4]] as const;
const CABIN = [-126, -80, -84, -56] as const;
const SAILS = [[-82, -238, 40, -92], [22, -198, 102, -92]] as const;
const PIVOT = { x: 86, y: -58 }, BARREL = 40;
function inHull(p: Point) {
  if (p.x < -130 || p.x > 140 || p.y > 26) return false;
  if (p.x < -70) return p.y >= -84;
  if (p.x > 96) return p.y >= -64 && p.y <= 26 - (p.x - 96) * 0.9;
  return p.y >= -52;
}
function zoneAt(ship: Ship, p: Point): Zone | null {
  if (!ship.magazineBlown && inRect(p, MAGAZINE)) return "magazine";
  if (WATERLINE.some(r => inRect(p, r))) return "waterline";
  if (inRect(p, CABIN)) return "cabin";
  if (inHull(p)) return "hull";
  if (SAILS.some(r => inRect(p, r))) return "sails";
  return null;
}

/** Friend mask to a sprite canvas: white halo, black pixels, unmodified 16×16 artwork. */
function friendCanvas(rows: readonly string[], scale: number, ink = "#000", halo = "#fff") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = (16 + 2) * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = halo;
  rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect(x * scale, y * scale, scale * 3, scale * 3); }));
  ctx.fillStyle = ink;
  rows.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") ctx.fillRect((x + 1) * scale, (y + 1) * scale, scale, scale); }));
  return canvas;
}
/** Top of the head for costume placement. */
function headBox(rows: readonly string[]) {
  const top = rows.findIndex(row => row.includes("#"));
  const band = rows.slice(Math.max(0, top), Math.max(0, top) + 3).join("");
  let left = 16, right = 0;
  rows.slice(Math.max(0, top), Math.max(0, top) + 3).forEach(row => [...row].forEach((pixel, x) => { if (pixel === "#") { left = Math.min(left, x); right = Math.max(right, x); } }));
  return band.includes("#") ? { top, left, right } : { top: 0, left: 4, right: 11 };
}

// A pixel skull captain for rival ships (original art for this game).
const RIVAL_CAPTAIN = [
  "................", "....RRRRRRRR....", "...RRRRRRRRRR...", "..RRRWRRRRRRRRR.", "...WWWWWWWWWW...", "...WWWWWWWWWW...",
  "...WKKWWWWKKW...", "...WKKWWWWKKW...", "...WWWWKKWWWW...", "....WWWWWWWW....", "....WKWKWKWW....", ".....WWWWWW.....",
  "....CCCCCCCC....", "...CCCYCCYCCC...", "...CCCCCCCCCC...", "....KK....KK....",
];
const RIVAL_COLORS: Record<string, string> = { R: "#e63946", W: "#f6f1e7", K: "#161320", C: "#3a2d5c", Y: "#ffd23f" };

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private dpr = 1;
  private t = 0;
  private opts: SceneOptions;
  private friendSprites: HTMLCanvasElement[];
  private shotSprite: HTMLCanvasElement;
  private emblem: HTMLCanvasElement;
  private head: { top: number; left: number; right: number };
  mode: "harbor" | "battle" | "over" = "harbor";
  paused = false;
  reducedMotion = false;
  private player: Ship;
  private enemy: Ship | null = null;
  private rival: Rival | null = null;
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private texts: Text[] = [];
  private gulls: Gull[] = [];
  private floaters: Floater[] = [];
  private kraken: Kraken | null = null;
  private timers = { gull: 2, floater: 3, chest: 18, kraken: 10 };
  private wind = 0;
  private windBase = 0;
  private windTarget = 0;
  private gustTimer = 8;
  private missRun = 0;
  private heat = 0;
  private lastShot = -9;
  private reloadMax = PLAYER_RELOAD;
  private overheated = false;
  private lastTaunt = -99;
  private repairNoted = false;
  private repairText = 0;
  private repairing = false;
  private shake = 0;
  private flash = 0;
  private aim = { angle: 38, power: 0.72 };
  private held = new Set<string>();
  private firing = false;
  private aimPoint: Point | null = null;
  private stake = 0;
  private fired = 0;
  private landed = 0;
  private bonus = 0;
  private streak = 0;
  private hits: Record<Zone, number> = { magazine: 0, waterline: 0, cabin: 0, sails: 0, hull: 0 };
  private endTimer = 0;
  private endReason: BattleResult["reason"] | null = null;
  private dryTimer = 0;
  private intro = 0;
  private hudClock = 0;
  private clouds = Array.from({ length: 7 }, (_, i) => ({ x: i * 160 + rand(-40, 40), y: rand(60, 250), s: rand(0.6, 1.3), v: rand(4, 11) }));

  constructor(private canvas: HTMLCanvasElement, opts: SceneOptions) {
    this.ctx = canvas.getContext("2d")!;
    this.opts = opts;
    const frames = opts.friendFrames.length ? opts.friendFrames : [Array(16).fill("................")];
    this.friendSprites = frames.map(rows => friendCanvas(rows, 3));
    this.shotSprite = friendCanvas(frames[0], 2);
    this.emblem = friendCanvas(frames[0], 3, "#0b6e66", "rgba(255,255,255,0)");
    this.head = headBox(frames[0]);
    this.player = this.makeShip(PLAYER_LOOK, 170, 1, 1, 100, true);
    this.player.x = 250;
    this.resize();
  }

  private makeShip(look: ShipLook, x: number, facing: 1 | -1, scale: number, hp: number, isPlayer: boolean): Ship {
    return { look, x, facing, scale, hp, maxHp: hp, leak: 0, fire: 0, sailTears: 0, magazineBlown: false, holes: [], flames: [],
      sinking: 0, phase: rand(0, 6), angle: isPlayer ? 38 : 40, recoil: 0, flash: 0, ammo: 0, reload: 0, isPlayer, pose: { cx: x, cy: SEA_Y, rot: 0 }, lastHit: 0, desperate: false };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr !== this.dpr || this.canvas.width !== VIEW_W * dpr) {
      this.dpr = dpr; this.canvas.width = VIEW_W * dpr; this.canvas.height = VIEW_H * dpr; this.bg = null;
    }
  }

  // ─── Battle lifecycle ──────────────────────────────────────────────
  startBattle(rival: Rival, stake: number) {
    this.rival = rival; this.stake = stake;
    this.player = this.makeShip(PLAYER_LOOK, 165, 1, 1, 100, true);
    this.player.ammo = stake;
    this.enemy = this.makeShip(rival.look, 800, -1, rival.scale, rival.hp, false);
    this.enemy.ammo = stake; this.enemy.reload = 2.2;
    this.shots = []; this.particles = []; this.texts = []; this.gulls = []; this.floaters = []; this.kraken = null;
    this.timers = { gull: 2.5, floater: 1.5, chest: rand(14, 22), kraken: rand(9, 13) };
    this.windBase = this.windTarget = Math.round(rand(-45, 45)); this.wind = this.windBase; this.gustTimer = rand(6, 9);
    this.missRun = 0; this.heat = 0; this.overheated = false; this.reloadMax = PLAYER_RELOAD; this.lastTaunt = -99; this.repairNoted = false; this.repairText = 0; this.repairing = false;
    this.fired = 0; this.landed = 0; this.bonus = 0; this.streak = 0; this.endTimer = 0; this.endReason = null; this.dryTimer = 0;
    this.hits = { magazine: 0, waterline: 0, cabin: 0, sails: 0, hull: 0 };
    this.aim = { angle: 38, power: 0.72 }; this.held.clear(); this.firing = false; this.aimPoint = null;
    this.intro = 1.4; this.mode = "battle";
    this.emitHud(true);
  }
  toHarbor() {
    this.mode = "harbor"; this.enemy = null; this.shots = []; this.texts = []; this.kraken = null; this.floaters = [];
    this.player = this.makeShip(PLAYER_LOOK, 250, 1, 1, 100, true);
  }
  surrender() { if (this.mode === "battle" && !this.endReason) { this.endReason = "surrender"; this.player.hp = 0; this.endTimer = 0.6; } }

  // ─── Input ─────────────────────────────────────────────────────────
  keyDown(key: string) { this.held.add(key); if (key === " " || key === "enter") { this.firing = true; this.tryFire(); } }
  keyUp(key: string) { this.held.delete(key); if (key === " " || key === "enter") this.firing = false; }
  releaseAll() { this.held.clear(); this.firing = false; }
  setFiring(on: boolean) { this.firing = on; if (on) this.tryFire(); }
  /** Pointer aim: direction sets the angle, distance from the cannon sets the power. */
  aimAt(x: number, y: number) {
    if (this.mode !== "battle") return;
    const pivot = this.muzzlePivot(this.player);
    const dx = x - pivot.x, dy = pivot.y - y;
    this.aim.angle = clamp(Math.atan2(dy, Math.max(dx, 1)) * 180 / Math.PI, ANGLE_MIN, ANGLE_MAX);
    this.aim.power = clamp(Math.hypot(dx, dy) / 560, POWER_MIN, 1);
    this.aimPoint = { x, y };
  }
  clearAimPoint() { this.aimPoint = null; }
  fire() { return this.tryFire(); }
  get angle() { return this.aim.angle; }
  get power() { return this.aim.power; }

  // ─── Geometry ──────────────────────────────────────────────────────
  private updatePose(ship: Ship) {
    // Rivals tack back and forth, so a parked aim drifts off target.
    if (!ship.isPlayer && this.rival && ship.sinking === 0) ship.x = 785 + (Math.sin(this.t * 0.47 + ship.phase) * 0.68 + Math.sin(this.t * 1.21 + ship.phase * 2.3) * 0.32) * this.rival.drift * (ship.sailTears >= 4 ? 0.4 : 1);
    const calm = this.reducedMotion ? 0 : 1;
    const sag = (1 - ship.hp / ship.maxHp) * 8;
    ship.pose = {
      cx: ship.x,
      cy: SEA_Y + Math.sin(this.t * 1.4 + ship.phase) * 3 * calm + sag + ship.sinking * 170,
      rot: Math.sin(this.t * 1.1 + ship.phase) * 0.028 * calm - ship.facing * ship.sinking * 0.45,
    };
  }
  private toLocal(ship: Ship, x: number, y: number): Point {
    const { cx, cy, rot } = ship.pose, dx = x - cx, dy = y - cy, c = Math.cos(rot), s = Math.sin(rot);
    return { x: (dx * c + dy * s) * ship.facing / ship.scale, y: (-dx * s + dy * c) / ship.scale };
  }
  private toWorld(ship: Ship, lx: number, ly: number): Point {
    const { cx, cy, rot } = ship.pose, x = lx * ship.scale * ship.facing, y = ly * ship.scale, c = Math.cos(rot), s = Math.sin(rot);
    return { x: cx + x * c - y * s, y: cy + x * s + y * c };
  }
  private muzzlePivot(ship: Ship) { return this.toWorld(ship, PIVOT.x, PIVOT.y); }
  private muzzle(ship: Ship, angle: number) {
    const pivot = this.muzzlePivot(ship), a = angle * Math.PI / 180;
    return { x: pivot.x + Math.cos(a) * BARREL * ship.scale * ship.facing, y: pivot.y - Math.sin(a) * BARREL * ship.scale };
  }
  private surface(x: number) { return SEA_Y + 4 + Math.sin(x * 0.021 + this.t * 2.1) * 4 * (this.reducedMotion ? 0.3 : 1); }

  // ─── Firing ────────────────────────────────────────────────────────
  private tryFire() {
    const p = this.player;
    if (this.mode !== "battle" || this.paused || this.intro > 0 || this.endReason || p.reload > 0 || p.ammo <= 0) return false;
    // A hot barrel throws wild: spray and pray scatters, deliberate shots fly true.
    const wild = this.heat * this.heat;
    const speed = (360 + this.aim.power * 560) * (1 + gauss() * (0.022 + wild * 0.11));
    const a = (this.aim.angle + gauss() * (0.9 + wild * 9)) * Math.PI / 180, m = this.muzzle(p, this.aim.angle);
    this.shots.push({ x: m.x, y: m.y, vx: Math.cos(a) * speed, vy: -Math.sin(a) * speed, owner: "player", rot: 0, spin: rand(-9, 9),
      skips: 0, tore: false, alive: true, age: 0, hue: (this.fired * 47) % 360, close: 999 });
    p.ammo--; this.fired++; p.reload = this.reloadMax = PLAYER_RELOAD * (1 + p.sailTears * 0.15); p.recoil = 1; p.flash = 1;
    this.heat = Math.min(1, this.heat + 0.25); this.lastShot = this.t;
    if (this.heat >= 1) {
      this.overheated = true; p.reload = this.reloadMax = 2.6;
      this.floatText("OVERHEATED!", m.x + 40, m.y - 60, "#ff3d6e", 26); this.callout("Cannon overheated! Let it cool, then aim.");
      for (let i = 0; i < 20; i++) this.spawn({ x: m.x, y: m.y, vx: rand(-40, 40), vy: -rand(40, 120), life: rand(0.8, 1.6), size: rand(8, 16), color: "rgba(230,230,240,", kind: "smoke", grav: -20 });
    }
    this.muzzleBlast(m, a, 1);
    this.addShake(3); this.opts.onSound("fire");
    return true;
  }
  private enemyFire() {
    const e = this.enemy!, p = this.player, r = this.rival!;
    if (e.ammo <= 0) return;
    const roll = Math.random(), zone = roll < 0.1 ? "magazine" : roll < 0.32 ? "waterline" : roll < 0.5 ? "cabin" : "hull";
    const targetLocal = zone === "magazine" ? { x: 17, y: -18 } : zone === "cabin" ? { x: -104, y: -68 } : zone === "waterline" ? { x: Math.random() < 0.5 ? -80 : 52, y: -5 } : { x: rand(-60, 90), y: -30 };
    const target = this.toWorld(p, targetLocal.x, targetLocal.y);
    const angle = rand(24, 52), a = angle * Math.PI / 180;
    const m0 = this.muzzle(e, angle);
    const dx = Math.abs(target.x - m0.x), h = m0.y - target.y;
    let range = dx, speed = 600;
    for (let i = 0; i < 3; i++) {
      const denom = 2 * Math.cos(a) ** 2 * (range * Math.tan(a) - h);
      speed = denom > 0 ? Math.sqrt(GRAVITY * range * range / denom) : 700;
      const time = dx / (speed * Math.cos(a));
      range = dx + 0.5 * this.wind * time * time * r.windSkill; // enemy fires leftward, so tailwind to the right shortens it
    }
    speed *= 1 + gauss() * r.spread * (1 + e.sailTears * 0.35);
    e.angle = angle;
    this.shots.push({ x: m0.x, y: m0.y, vx: -Math.cos(a) * speed, vy: -Math.sin(a) * speed, owner: "enemy", rot: 0, spin: 0,
      skips: 0, tore: false, alive: true, age: 0, hue: 0, close: 999 });
    e.ammo--; e.recoil = 1; e.flash = 1;
    e.reload = r.reload * (1 + e.sailTears * 0.28) * rand(0.85, 1.2) * (e.sailTears >= 4 ? 1.5 : 1) * (e.desperate ? 0.62 : 1);
    this.muzzleBlast(m0, Math.PI - a, -1);
    this.opts.onSound("enemyFire");
  }
  private muzzleBlast(m: Point, a: number, dir: number) {
    const n = this.reducedMotion ? 6 : 16;
    for (let i = 0; i < n; i++) {
      const spread = a + rand(-0.4, 0.4), sp = rand(60, 240);
      this.spawn({ x: m.x, y: m.y, vx: Math.cos(spread) * sp * (dir > 0 ? 1 : 1), vy: -Math.sin(spread) * sp, life: rand(0.5, 1.2), size: rand(8, 18), color: "rgba(235,230,240,", kind: "smoke", grav: -20 });
    }
    for (let i = 0; i < n; i++) this.spawn({ x: m.x, y: m.y, vx: Math.cos(a + rand(-0.3, 0.3)) * rand(200, 420), vy: -Math.sin(a + rand(-0.3, 0.3)) * rand(200, 420), life: rand(0.12, 0.3), size: rand(2, 4), color: "#ffd23f", kind: "spark", grav: 0 });
    this.spawn({ x: m.x, y: m.y, vx: 0, vy: 0, life: 0.12, size: 30, color: "#fff3b0", kind: "flash", grav: 0 });
  }

  // ─── Simulation ────────────────────────────────────────────────────
  update(dt: number) {
    this.t += dt;
    for (const c of this.clouds) { c.x += c.v * dt; if (c.x > VIEW_W + 160) c.x = -160; }
    this.updatePose(this.player); if (this.enemy) this.updatePose(this.enemy);
    this.stepParticles(dt);
    this.stepGulls(dt);
    if (this.mode !== "battle" || this.paused) { this.player.recoil = Math.max(0, this.player.recoil - dt * 4); return; }
    if (this.intro > 0) { this.intro -= dt; this.emitHud(false, dt); return; }

    const p = this.player, e = this.enemy!;
    // The wind shifts every few seconds, so the arc that worked a moment ago misses now.
    this.gustTimer -= dt;
    if (this.gustTimer <= 0 && !this.endReason) {
      const next = Math.round(rand(-65, 65)), shift = next - this.windTarget;
      this.windTarget = next; this.gustTimer = rand(5.5, 9.5);
      if (Math.abs(shift) > 18) { this.callout(`Wind shift! ${Math.abs(next)} ${next >= 0 ? "toward them" : "in your face"}.`); this.floatText("WIND SHIFT!", VIEW_W / 2, 170, "#7ff6ff", 26); }
    }
    this.windBase += (this.windTarget - this.windBase) * Math.min(1, dt * 1.4);
    this.wind = this.windBase + Math.sin(this.t * 0.9) * 7;
    const turn = 70 * dt, pump = 0.55 * dt;
    if (this.held.has("a") || this.held.has("arrowleft")) this.aim.angle = clamp(this.aim.angle + turn, ANGLE_MIN, ANGLE_MAX);
    if (this.held.has("d") || this.held.has("arrowright")) this.aim.angle = clamp(this.aim.angle - turn, ANGLE_MIN, ANGLE_MAX);
    if (this.held.has("w") || this.held.has("arrowup")) this.aim.power = clamp(this.aim.power + pump, POWER_MIN, 1);
    if (this.held.has("s") || this.held.has("arrowdown")) this.aim.power = clamp(this.aim.power - pump, POWER_MIN, 1);
    p.angle = this.aim.angle;

    for (const ship of [p, e]) {
      ship.reload = Math.max(0, ship.reload - dt); ship.recoil = Math.max(0, ship.recoil - dt * 4); ship.flash = Math.max(0, ship.flash - dt * 6);
      if (!this.endReason || ship.hp > 0) {
        if (ship.leak) ship.hp -= ship.leak * dt;
        if (ship.fire > 0) { ship.fire -= dt; ship.hp -= 2.2 * dt; }
      }
      if (!ship.isPlayer) this.stepRepair(ship, dt);
      else ship.leak = Math.max(0, ship.leak - 0.12 * dt);
      if (ship.hp <= 0 && ship.sinking === 0 && !this.endReason) {
        ship.hp = 0; this.endReason = ship.isPlayer ? "destroyed" : "sunk"; this.endTimer = 2.6;
        this.opts.onSound("boom"); this.explode(this.toWorld(ship, 0, -40), 1.4); this.callout(ship.isPlayer ? "Your ship is going down!" : `${this.rival!.ship} is sinking!`);
      }
    }
    this.heat = Math.max(0, this.heat - dt * (this.t - this.lastShot < 0.8 ? 0.12 : 0.6));
    if (this.overheated && p.reload <= 0) { this.overheated = false; this.heat = 0.45; }
    if (this.firing && !this.endReason) this.tryFire();
    if (!this.endReason && e.reload <= 0 && e.hp > 0) this.enemyFire();

    this.stepShots(dt);
    this.stepHazards(dt);
    this.stepFlames(dt);

    // Running dry: every loaded Generation is at stake, so an empty cannon strikes its colours.
    const playerShotsLive = this.shots.some(s => s.owner === "player"), enemyShotsLive = this.shots.some(s => s.owner === "enemy");
    if (!this.endReason) {
      if (p.ammo <= 0 && !playerShotsLive) {
        this.dryTimer += dt;
        if (this.dryTimer > (e.leak || e.fire > 0 ? 4 : 1.6)) { this.endReason = "dry"; this.endTimer = 1; this.callout("Out of Generations! You strike your colours."); }
      } else if (e.ammo <= 0 && !enemyShotsLive && e.reload <= 0) {
        this.endReason = "surrender"; this.endTimer = 1.4; this.callout(`${this.rival!.name} ran dry and strikes their colours!`);
        this.floatText("THEY SURRENDER!", e.pose.cx, e.pose.cy - 260, "#ccff00", 34);
      }
    }
    if (this.endReason) {
      const loser = this.endReason === "sunk" || (this.endReason === "surrender" && p.hp > 0) ? e : p;
      if (this.endReason === "sunk" || this.endReason === "destroyed") {
        loser.sinking = Math.min(1, loser.sinking + dt / 2.6);
        if (Math.random() < 0.5) this.spawn({ x: loser.pose.cx + rand(-90, 90), y: SEA_Y + rand(0, 20), vx: 0, vy: -rand(20, 60), life: rand(0.5, 1.2), size: rand(3, 7), color: "rgba(255,255,255,", kind: "bubble", grav: -30 });
      }
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish();
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.emitHud(false, dt);
  }

  /** Rivals patch holes and bail water whenever the pressure lets up. */
  private stepRepair(ship: Ship, dt: number) {
    const r = this.rival!;
    this.repairing = false;
    if (this.endReason || ship.hp <= 0) return;
    if (!ship.desperate && ship.hp < ship.maxHp * 0.35) {
      ship.desperate = true; this.callout(`${r.name} is desperate: firing much faster!`); this.floatText("DESPERATE!", ship.pose.cx, ship.pose.cy - 250, "#ff3d6e", 28);
    }
    if (this.t - ship.lastHit < 1.4 || ship.fire > 0) return;
    ship.leak = Math.max(0, ship.leak - 0.45 * dt);
    if (ship.hp >= ship.maxHp) return;
    this.repairing = true;
    ship.hp = Math.min(ship.maxHp, ship.hp + r.regen * dt);
    if (!this.repairNoted) { this.repairNoted = true; this.callout(`${r.name}'s crew patches the hull whenever you stop hitting it!`); }
    this.repairText -= dt;
    if (this.repairText <= 0) { this.repairText = 1.6; this.floatText("PATCHING...", ship.pose.cx, ship.pose.cy - 120, "#39ff88", 18); }
    if (Math.random() < (this.reducedMotion ? 0.05 : 0.25)) { const w = this.toWorld(ship, rand(-100, 110), rand(-50, 0)); this.spawn({ x: w.x, y: w.y, vx: rand(-20, 20), vy: -rand(20, 50), life: 0.6, size: 3, color: "#39ff88", kind: "spark", grav: 0 }); }
  }

  private finish() {
    const won = this.endReason === "sunk" || (this.endReason === "surrender" && this.player.hp > 0);
    this.mode = "over"; this.firing = false;
    this.opts.onSound(won ? "win" : "lose");
    this.opts.onEnd({ won, reason: this.endReason!, stake: this.stake, fired: this.fired, unfired: this.player.ammo, bonus: this.bonus,
      hits: { ...this.hits }, accuracy: this.fired ? this.landed / this.fired : 0 });
    this.emitHud(true);
  }

  private stepShots(dt: number) {
    const steps = 3, h = dt / steps;
    for (const s of this.shots) {
      for (let i = 0; i < steps && s.alive; i++) {
        s.vx += this.wind * h; s.vy += GRAVITY * h; s.x += s.vx * h; s.y += s.vy * h; s.rot += s.spin * h; s.age += h;
        this.collide(s);
      }
      if (s.alive && !this.reducedMotion && Math.random() < 0.9) {
        this.spawn(s.owner === "player"
          ? { x: s.x, y: s.y, vx: rand(-15, 15), vy: rand(-15, 15), life: rand(0.25, 0.5), size: rand(4, 8), color: `hsla(${(s.hue + s.age * 360) % 360},100%,62%,`, kind: "smoke", grav: 0 }
          : { x: s.x, y: s.y, vx: rand(-10, 10), vy: rand(-10, 10), life: rand(0.2, 0.4), size: rand(3, 6), color: "rgba(255,120,60,", kind: "smoke", grav: 0 });
      }
      if (s.x < -80 || s.x > VIEW_W + 80 || s.y > VIEW_H + 40) { s.alive = false; if (s.owner === "player") this.miss(s); }
    }
    this.shots = this.shots.filter(s => s.alive);
  }

  private collide(s: Shot) {
    const p = this.player, e = this.enemy!;
    if (s.owner === "player") {
      for (const o of this.shots) if (o.alive && o.owner === "enemy" && Math.hypot(o.x - s.x, o.y - s.y) < 20) {
        o.alive = false; s.alive = false; this.explode({ x: s.x, y: s.y }, 0.6); this.addBonus(1, s.x, s.y, "INTERCEPT!"); this.opts.onSound("boom"); return;
      }
    }
    if (this.kraken && this.kraken.points.some(k => Math.hypot(k.x - s.x, k.y - s.y) < 22)) {
      s.alive = false; this.floatText("KRAKEN SNACK!", s.x, s.y - 20, "#d58cff", 22); this.splash(s.x, this.surface(s.x), 0.7);
      this.opts.onSound("kraken"); if (s.owner === "player") this.miss(s); return;
    }
    if (s.owner === "player") {
      for (const g of this.gulls) if (g.alive && Math.hypot(g.x - s.x, g.y - s.y) < 24) {
        g.alive = false; s.vy = -Math.max(260, Math.abs(s.vy) * 0.9); s.vx *= 1.06;
        for (let i = 0; i < 14; i++) this.spawn({ x: g.x, y: g.y, vx: rand(-120, 120), vy: rand(-120, 60), life: rand(0.6, 1.2), size: rand(3, 6), color: "#ffffff", kind: "feather", grav: 60 });
        this.addBonus(1, g.x, g.y, "GULL BOUNCE!"); this.opts.onSound("gull");
      }
      for (const f of this.floaters) if (f.alive && Math.hypot(f.x - s.x, this.surface(f.x) - 10 - s.y) < 26) {
        f.alive = false; s.vy = -Math.max(340, Math.abs(s.vy) * 0.92);
        for (let i = 0; i < 16; i++) this.spawn({ x: f.x, y: this.surface(f.x) - 10, vx: rand(-160, 160), vy: rand(-260, -60), life: rand(0.6, 1.1), size: rand(3, 7), color: f.kind === "chest" ? "#ffd23f" : "#9a5a2a", kind: "debris", grav: 600 });
        this.addBonus(f.kind === "chest" ? 5 : 2, f.x, this.surface(f.x) - 30, f.kind === "chest" ? "TREASURE!" : "RF BARREL!"); this.opts.onSound("bonus");
      }
    }
    const target = s.owner === "player" ? e : p;
    if (target.sinking === 0 && target.hp > 0) {
      const local = this.toLocal(target, s.x, s.y), zone = zoneAt(target, local);
      if (s.owner === "player") {
        const dx = Math.max(-130 - local.x, 0, local.x - 140), dy = Math.max(-84 - local.y, 0, local.y - 26);
        s.close = Math.min(s.close, Math.hypot(dx, dy) * target.scale);
      }
      if (zone === "sails") {
        if (!s.tore) {
          s.tore = true; target.sailTears = Math.min(4, target.sailTears + 1); target.hp -= ZONES.sails.damage; target.lastHit = this.t;
          for (let i = 0; i < 10; i++) this.spawn({ x: s.x, y: s.y, vx: rand(-100, 100), vy: rand(-80, 80), life: rand(0.5, 1), size: rand(3, 6), color: target.look.sail, kind: "feather", grav: 80 });
          if (s.owner === "player") { this.hits.sails++; this.floatText(target.sailTears >= 4 ? "MAST SNAPPED!" : "SAILS TORN!", s.x, s.y - 16, "#fff", 22); this.callout(target.sailTears >= 4 ? "Their mast is down. Reload crawls." : "Sails torn: their reload slows."); }
          this.opts.onSound("tear");
        }
      } else if (zone) { this.impact(s, target, zone, local); return; }
    }
    const surf = this.surface(s.x);
    if (s.y >= surf && s.vy > 0) {
      const skim = Math.abs(s.vy) < Math.abs(s.vx) * 0.62 && Math.hypot(s.vx, s.vy) > 300 && s.skips < 3;
      if (s.owner === "player" && skim) {
        s.skips++; s.y = surf - 1; s.vy = -Math.abs(s.vy) * 0.6; s.vx *= 0.82;
        this.splash(s.x, surf, 0.45); this.floatText(s.skips > 1 ? `SKIP x${s.skips}!` : "SKIP!", s.x, surf - 30, "#7ff6ff", 20); this.opts.onSound("skip");
      } else {
        s.alive = false; this.splash(s.x, surf, 1); this.opts.onSound("splash");
        if (s.owner === "player") this.miss(s);
      }
    }
  }

  private impact(s: Shot, ship: Ship, zone: Zone, local: Point) {
    s.alive = false;
    const byPlayer = s.owner === "player";
    const info = ZONES[zone];
    let damage = info.damage;
    if (byPlayer) {
      this.streak++; this.landed++; this.hits[zone]++; this.missRun = 0; ship.lastHit = this.t;
      damage *= 1 + Math.min(this.streak - 1, 5) * 0.1;
    } else { damage *= 1.3; if (Math.random() < 0.3) this.taunt(); }
    ship.hp -= damage;
    ship.holes.push({ x: local.x + rand(-3, 3), y: local.y + rand(-3, 3), r: zone === "magazine" ? 16 : rand(6, 10) });
    if (ship.holes.length > 26) ship.holes.shift();
    const at = { x: s.x, y: s.y };
    if (zone === "magazine") {
      ship.magazineBlown = true; ship.fire = Math.max(ship.fire, 6); ship.flames.push({ x: 17, y: -52 }, { x: -20, y: -52 }, { x: 60, y: -52 });
      this.explode(at, 2); this.flash = 1; this.addShake(16); this.opts.onSound("boom");
      this.floatText(`${info.label}!`, at.x, at.y - 40, "#ffd23f", 34);
      this.callout(byPlayer ? "Powder magazine hit! The deck is on fire." : "They hit your powder magazine!");
    } else {
      this.explode(at, zone === "waterline" ? 0.7 : 0.8); this.addShake(zone === "cabin" ? 6 : 4); this.opts.onSound("hit");
      if (zone === "waterline") { ship.leak = Math.min(4.5, ship.leak + 1.3); this.splash(at.x, this.surface(at.x), 0.6); if (ship.flames.length < 6 && Math.random() < 0.3) ship.flames.push({ x: local.x, y: -52 }); }
      if (zone === "cabin" && Math.random() < 0.5 && ship.flames.length < 6) ship.flames.push({ x: -100, y: -86 });
      this.floatText(zone === "hull" ? `-${Math.round(damage)}` : `${info.label}!`, at.x, at.y - 24, zone === "waterline" ? "#7ff6ff" : zone === "cabin" ? "#ff9ff3" : "#fff", zone === "hull" ? 22 : 26);
      if (byPlayer && zone === "waterline") this.callout("Waterline breached: they are taking on water.");
    }
    if (byPlayer && info.bonus) this.addBonus(info.bonus, at.x, at.y - 70, zone === "cabin" ? "PLUNDER!" : "SALVAGE!");
    if (byPlayer && this.streak >= 3) this.floatText(`STREAK x${this.streak}`, at.x + 30, at.y - 8, "#ccff00", 18);
    if (byPlayer && this.streak > 0 && this.streak % 5 === 0) this.addBonus(2, at.x, at.y - 100, "HOT STREAK!");
    if (!byPlayer) this.addShake(8);
  }
  private miss(s: Shot) {
    if (this.streak >= 3) this.floatText("STREAK LOST", this.player.pose.cx + 60, 330, "#ff3d6e", 18);
    this.streak = 0; this.missRun++;
    if (s.close < 28 && s.close > 0) this.floatText(["SO CLOSE!", "ARGH! INCHES!", "SHAVED THE PAINT!"][Math.floor(Math.random() * 3)], s.x, Math.min(s.y, SEA_Y) - 30, "#ffb627", 22);
    if (this.missRun >= 3) this.taunt();
  }
  private taunt() {
    if (!this.rival || this.t - this.lastTaunt < 7 || this.endReason) return;
    this.lastTaunt = this.t; this.missRun = 0;
    this.callout(this.rival.taunts[Math.floor(Math.random() * this.rival.taunts.length)]);
  }
  private addBonus(n: number, x: number, y: number, label: string) {
    this.bonus += n; this.floatText(`${label} +${n}`, x, y, "#ccff00", 24); this.opts.onSound("bonus");
  }

  private stepHazards(dt: number) {
    this.timers.floater -= dt;
    if (this.timers.floater <= 0 && this.floaters.filter(f => f.alive && f.kind === "barrel").length < 2) {
      this.floaters.push({ x: rand(360, 600), kind: "barrel", life: 16, phase: rand(0, 6), alive: true }); this.timers.floater = rand(4, 8);
    }
    this.timers.chest -= dt;
    if (this.timers.chest <= 0) { this.floaters.push({ x: rand(400, 560), kind: "chest", life: 10, phase: 0, alive: true }); this.timers.chest = rand(20, 32); this.callout("Treasure chest floating! +5 if you hit it."); }
    for (const f of this.floaters) { f.life -= dt; if (f.life <= 0) f.alive = false; }
    this.floaters = this.floaters.filter(f => f.alive);

    this.timers.kraken -= dt;
    if (!this.kraken && this.timers.kraken <= 0) { this.kraken = { x: rand(440, 540), t: 0, duration: 4.2, points: [] }; this.opts.onSound("kraken"); this.callout("The Kraken rises! It eats any shot it touches."); }
    if (this.kraken) {
      const k = this.kraken; k.t += dt;
      if (k.t >= k.duration) { this.kraken = null; this.timers.kraken = rand(11, 17); }
      else k.points = this.tentaclePoints(k);
    }
  }
  private tentacleRise(k: Kraken) {
    const warn = 0.9, rise = 0.6, fall = 0.6;
    if (k.t < warn) return 0;
    if (k.t < warn + rise) return (k.t - warn) / rise;
    if (k.t > k.duration - fall) return Math.max(0, (k.duration - k.t) / fall);
    return 1;
  }
  private tentaclePoints(k: Kraken): Point[] {
    const rise = this.tentacleRise(k); if (rise <= 0) return [];
    const height = 230 * rise, pts: Point[] = [], sway = this.reducedMotion ? 0 : 1;
    for (let i = 0; i <= 12; i++) {
      const f = i / 12;
      pts.push({ x: k.x + Math.sin(this.t * 2.2 + f * 3) * 26 * f * sway + f * f * 30, y: SEA_Y + 6 - f * height });
    }
    return pts;
  }

  private stepGulls(dt: number) {
    this.timers.gull -= dt;
    if (this.timers.gull <= 0 && this.gulls.length < 3) {
      const left = Math.random() < 0.5;
      this.gulls.push({ x: left ? -30 : VIEW_W + 30, y: rand(110, 300), vx: (left ? 1 : -1) * rand(70, 120), flap: rand(0, 6), alive: true });
      this.timers.gull = rand(2.5, 5.5);
    }
    for (const g of this.gulls) { g.x += g.vx * dt; g.flap += dt * 9; g.y += Math.sin(g.flap * 0.3) * 8 * dt; if (g.x < -60 || g.x > VIEW_W + 60) g.alive = false; }
    this.gulls = this.gulls.filter(g => g.alive);
  }

  private stepFlames(dt: number) {
    for (const ship of [this.player, this.enemy!]) {
      if (!ship || (ship.fire <= 0 && ship.hp > ship.maxHp * 0.45) || ship.sinking > 0.7) continue;
      const count = ship.fire > 0 ? ship.flames.length : Math.min(ship.flames.length, 2);
      for (let i = 0; i < count; i++) {
        if (Math.random() > (this.reducedMotion ? 0.15 : 0.55)) continue;
        const w = this.toWorld(ship, ship.flames[i].x + rand(-8, 8), ship.flames[i].y);
        this.spawn({ x: w.x, y: w.y, vx: rand(-10, 10), vy: -rand(40, 90), life: rand(0.3, 0.7), size: rand(5, 10), color: Math.random() < 0.5 ? "#ff7b00" : "#ffd23f", kind: "spark", grav: -40 });
        if (Math.random() < 0.3) this.spawn({ x: w.x, y: w.y - 10, vx: rand(-8, 8) + this.wind * 0.4, vy: -rand(30, 60), life: rand(1, 2), size: rand(8, 16), color: "rgba(60,50,70,", kind: "smoke", grav: -10 });
      }
    }
    void dt;
  }

  // ─── Effects ───────────────────────────────────────────────────────
  private spawn(p: Omit<Particle, "max" | "rot">) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ ...p, max: p.life, rot: rand(0, 6) });
  }
  private stepParticles(dt: number) {
    for (const p of this.particles) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4; if (p.kind === "smoke") { p.vx *= 0.97; p.vy *= 0.97; } }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y -= 38 * dt; }
    this.texts = this.texts.filter(t => t.life > 0);
  }
  private explode(at: Point, power: number) {
    const n = Math.round((this.reducedMotion ? 10 : 34) * power);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(80, 380) * power;
      this.spawn({ x: at.x, y: at.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.7), size: rand(3, 7) * power, color: ["#fff3b0", "#ffd23f", "#ff7b00", "#ff3d6e"][i % 4], kind: "spark", grav: 200 });
    }
    for (let i = 0; i < n / 2; i++) this.spawn({ x: at.x, y: at.y, vx: rand(-220, 220) * power, vy: rand(-380, -80) * power, life: rand(0.8, 1.5), size: rand(4, 9), color: ["#8a4a17", "#5a2e0e", "#c26b2e"][i % 3], kind: "debris", grav: 700 });
    for (let i = 0; i < n / 3; i++) this.spawn({ x: at.x + rand(-10, 10), y: at.y + rand(-10, 10), vx: rand(-40, 40), vy: rand(-60, -10), life: rand(0.8, 1.6), size: rand(12, 26) * power, color: "rgba(70,60,80,", kind: "smoke", grav: -20 });
    this.spawn({ x: at.x, y: at.y, vx: 0, vy: 0, life: 0.4, size: 60 * power, color: "#fff", kind: "ring", grav: 0 });
    this.spawn({ x: at.x, y: at.y, vx: 0, vy: 0, life: 0.18, size: 55 * power, color: "#fff3b0", kind: "flash", grav: 0 });
  }
  private splash(x: number, y: number, power: number) {
    const n = Math.round((this.reducedMotion ? 8 : 22) * power);
    for (let i = 0; i < n; i++) this.spawn({ x: x + rand(-8, 8), y, vx: rand(-110, 110) * power, vy: -rand(150, 420) * power, life: rand(0.5, 1), size: rand(2, 5), color: Math.random() < 0.5 ? "#e8feff" : "#7ff6ff", kind: "drop", grav: 900 });
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.5, size: 36 * power, color: "#e8feff", kind: "ring", grav: 0 });
  }
  private floatText(text: string, x: number, y: number, color: string, size: number) {
    let top = clamp(y, 110, VIEW_H - 80);
    // Stack fresh callouts instead of printing them over each other.
    for (let guard = 0; guard < 6 && this.texts.some(t => t.life > 0.7 && Math.abs(t.y - top) < size * 0.95 && Math.abs(t.x - x) < 220); guard++) top -= size + 4;
    this.texts.push({ text, x, y: Math.max(70, top), life: 1.3, color, size });
  }
  private addShake(n: number) { if (!this.reducedMotion) this.shake = Math.min(18, this.shake + n); }
  private callout(text: string) { this.opts.onCallout(text); }

  private emitHud(force: boolean, dt = 0) {
    this.hudClock += dt;
    if (!force && this.hudClock < 0.08) return;
    this.hudClock = 0;
    const e = this.enemy;
    this.opts.onHud({
      playerHp: Math.max(0, this.player.hp), playerMax: this.player.maxHp, enemyHp: Math.max(0, e?.hp ?? 0), enemyMax: e?.maxHp ?? 1,
      ammo: this.player.ammo, enemyAmmo: e?.ammo ?? 0, wind: Math.round(this.wind), angle: Math.round(this.aim.angle), power: Math.round(this.aim.power * 100),
      streak: this.streak, bonus: this.bonus, repairing: this.repairing, desperate: Boolean(e?.desperate), heat: Math.round(this.heat * 100), overheated: this.overheated,
      status: this.intro > 0 ? "intro" : this.endReason ? "ending" : this.mode,
    });
  }

  // ─── Rendering ─────────────────────────────────────────────────────
  render() {
    this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.bg) this.bg = this.paintBackground();
    const sx = this.shake ? rand(-this.shake, this.shake) : 0, sy = this.shake ? rand(-this.shake, this.shake) : 0;
    ctx.save(); ctx.translate(sx, sy);
    ctx.drawImage(this.bg, -20, -20, VIEW_W + 40, VIEW_H + 40);
    this.paintClouds(ctx);
    this.paintSea(ctx);
    this.paintWaves(ctx, HORIZON + 30, 3, "rgba(20,120,170,0.55)", 0.012, 0.8);
    if (this.kraken) this.paintKraken(ctx, this.kraken);
    this.paintWaves(ctx, SEA_Y - 16, 4, "rgba(16,150,190,0.6)", 0.016, 1.2);
    for (const f of this.floaters) this.paintFloater(ctx, f);
    if (this.enemy) this.paintShip(ctx, this.enemy);
    this.paintShip(ctx, this.player);
    this.paintFrontWaves(ctx);
    for (const g of this.gulls) this.paintGull(ctx, g);
    if (this.mode === "battle" && !this.endReason && this.intro <= 0 && !this.paused) this.paintAim(ctx);
    for (const s of this.shots) this.paintShot(ctx, s);
    this.paintParticles(ctx);
    this.paintTexts(ctx);
    ctx.restore();
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,240,200,${this.flash * 0.45})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.mode === "battle" && this.intro > 0) this.paintIntro(ctx);
    this.canvas.dataset.mode = this.mode;
    this.canvas.dataset.ammo = String(this.player.ammo);
    this.canvas.dataset.enemyHp = this.enemy ? this.enemy.hp.toFixed(1) : "";
    this.canvas.dataset.shots = String(this.shots.length);
    this.canvas.dataset.playerHp = this.player.hp.toFixed(1);
  }

  private paintBackground() {
    const c = document.createElement("canvas"); c.width = (VIEW_W + 40) * this.dpr; c.height = (VIEW_H + 40) * this.dpr;
    const ctx = c.getContext("2d")!; ctx.scale(this.dpr, this.dpr); ctx.translate(20, 20);
    const sky = ctx.createLinearGradient(0, -20, 0, HORIZON);
    sky.addColorStop(0, "#1d0b4a"); sky.addColorStop(0.35, "#6a1b9a"); sky.addColorStop(0.62, "#e8457c"); sky.addColorStop(0.85, "#ff9a3c"); sky.addColorStop(1, "#ffd56b");
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, VIEW_W + 40, HORIZON + 20);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 70; i++) { const x = (i * 137) % VIEW_W, y = (i * 53) % 150; ctx.globalAlpha = 0.25 + (i % 5) * 0.12; ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1); }
    ctx.globalAlpha = 1;
    const sunX = 480, sunY = HORIZON - 44;
    const glow = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 260);
    glow.addColorStop(0, "rgba(255,240,170,0.9)"); glow.addColorStop(0.3, "rgba(255,170,90,0.45)"); glow.addColorStop(1, "rgba(255,120,120,0)");
    ctx.fillStyle = glow; ctx.fillRect(sunX - 280, sunY - 280, 560, 560);
    const disc = ctx.createLinearGradient(0, sunY - 70, 0, sunY + 70); disc.addColorStop(0, "#fff7ad"); disc.addColorStop(1, "#ff7b54");
    ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(sunX, sunY, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff9a3c"; for (let i = 0; i < 5; i++) ctx.fillRect(sunX - 80, sunY + 12 + i * 11, 160, 3 + i);
    // Distant islands, palms and a lighthouse.
    const island = (x: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - w, HORIZON + 2); ctx.quadraticCurveTo(x - w * 0.4, HORIZON - h, x, HORIZON - h * 0.9); ctx.quadraticCurveTo(x + w * 0.5, HORIZON - h * 1.05, x + w, HORIZON + 2); ctx.fill(); };
    island(120, 150, 46, "#5b2a86"); island(300, 90, 26, "#7a3a9a"); island(760, 170, 58, "#4a2270"); island(930, 90, 30, "#6b3290");
    const palm = (x: number, y: number, s: number) => {
      ctx.strokeStyle = "#3a1760"; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8 * s, y - 30 * s, x + 4 * s, y - 52 * s); ctx.stroke();
      ctx.fillStyle = "#3a1760"; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.62; ctx.beginPath(); ctx.ellipse(x + 4 * s + Math.cos(a) * 16 * s, y - 52 * s + Math.sin(a) * 8 * s + 6 * s, 20 * s, 5 * s, a, 0, Math.PI * 2); ctx.fill(); }
    };
    palm(100, HORIZON - 36, 0.9); palm(140, HORIZON - 40, 0.7); palm(740, HORIZON - 52, 1); palm(790, HORIZON - 50, 0.8);
    ctx.fillStyle = "#2e1150"; ctx.fillRect(860, HORIZON - 88, 14, 70); ctx.fillStyle = "#fff0a8"; ctx.fillRect(858, HORIZON - 98, 18, 10);
    ctx.fillStyle = "rgba(255,240,168,0.18)"; ctx.beginPath(); ctx.moveTo(867, HORIZON - 93); ctx.lineTo(700, HORIZON - 140); ctx.lineTo(700, HORIZON - 60); ctx.fill();
    return c;
  }
  private paintClouds(ctx: CanvasRenderingContext2D) {
    for (const c of this.clouds) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.s, c.s);
      const g = ctx.createLinearGradient(0, -30, 0, 30); g.addColorStop(0, "rgba(255,214,235,0.95)"); g.addColorStop(1, "rgba(255,140,170,0.75)");
      ctx.fillStyle = g; ctx.beginPath();
      ctx.arc(-40, 8, 24, 0, Math.PI * 2); ctx.arc(-10, -6, 32, 0, Math.PI * 2); ctx.arc(26, 2, 26, 0, Math.PI * 2); ctx.arc(52, 12, 18, 0, Math.PI * 2);
      ctx.rect(-40, 8, 92, 22); ctx.fill(); ctx.restore();
    }
  }
  private paintSea(ctx: CanvasRenderingContext2D) {
    const sea = ctx.createLinearGradient(0, HORIZON, 0, VIEW_H);
    sea.addColorStop(0, "#ff9f6e"); sea.addColorStop(0.08, "#2bb3c0"); sea.addColorStop(0.45, "#0e7fa6"); sea.addColorStop(1, "#083b6b");
    ctx.fillStyle = sea; ctx.fillRect(-20, HORIZON, VIEW_W + 40, VIEW_H - HORIZON + 20);
    ctx.fillStyle = "rgba(255,236,170,0.75)";
    for (let i = 0; i < 16; i++) {
      const y = HORIZON + 6 + i * 11, w = 110 - i * 5 + Math.sin(this.t * 3 + i) * 14 * (this.reducedMotion ? 0 : 1);
      ctx.globalAlpha = 0.7 - i * 0.04; ctx.fillRect(480 - w / 2 + Math.sin(this.t * 2 + i * 1.7) * 6, y, w, 2);
    }
    ctx.globalAlpha = 1;
  }
  private paintWaves(ctx: CanvasRenderingContext2D, y: number, amp: number, color: string, freq: number, speed: number) {
    const m = this.reducedMotion ? 0.3 : 1;
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-20, VIEW_H + 20);
    for (let x = -20; x <= VIEW_W + 20; x += 12) ctx.lineTo(x, y + Math.sin(x * freq + this.t * speed) * amp * m + Math.sin(x * freq * 2.3 - this.t * speed * 1.3) * amp * 0.4 * m);
    ctx.lineTo(VIEW_W + 20, VIEW_H + 20); ctx.fill();
  }
  private paintFrontWaves(ctx: CanvasRenderingContext2D) {
    const m = this.reducedMotion ? 0.3 : 1;
    const g = ctx.createLinearGradient(0, SEA_Y, 0, VIEW_H); g.addColorStop(0, "rgba(18,190,210,0.92)"); g.addColorStop(1, "rgba(6,60,110,0.98)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-20, VIEW_H + 20);
    const pts: Point[] = [];
    for (let x = -20; x <= VIEW_W + 20; x += 10) { const y = this.surface(x) + 6 + Math.sin(x * 0.05 - this.t * 1.6) * 2 * m; pts.push({ x, y }); ctx.lineTo(x, y); }
    ctx.lineTo(VIEW_W + 20, VIEW_H + 20); ctx.fill();
    ctx.strokeStyle = "rgba(230,255,255,0.85)"; ctx.lineWidth = 3; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 26; i++) { const x = (i * 97 + this.t * 20 * m) % (VIEW_W + 40) - 20, y = 520 + (i * 37) % 110; ctx.fillRect(x, y, 18 + (i % 4) * 6, 2); }
  }

  private paintShip(ctx: CanvasRenderingContext2D, ship: Ship) {
    const { cx, cy, rot } = ship.pose, L = ship.look;
    ctx.save();
    // Anything below the sea surface disappears, which also sinks ships convincingly.
    ctx.beginPath(); ctx.rect(-20, -40, VIEW_W + 40, SEA_Y + 16 + 40); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(ship.facing * ship.scale, ship.scale);
    // Masts and sails behind the hull.
    const broken = ship.sailTears >= 4;
    ctx.fillStyle = "#5a3417";
    ctx.fillRect(-24, broken ? -150 : -262, 9, broken ? 104 : 216); ctx.fillRect(56, -212, 8, 166);
    ctx.fillRect(-30, -236, 22, 6);
    if (!broken) { ctx.fillStyle = L.hullDark; ctx.fillRect(-34, -250, 30, 12); }
    ctx.strokeStyle = "rgba(40,20,10,0.7)"; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(-20, broken ? -150 : -258); ctx.lineTo(-126, -84); ctx.moveTo(-20, broken ? -150 : -258); ctx.lineTo(140, -64); ctx.moveTo(60, -212); ctx.lineTo(186, -96); ctx.stroke();
    if (!broken) this.paintSail(ctx, ship, -80, 40, -236, -96, 0);
    else { ctx.fillStyle = L.sail; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(-18, -150); ctx.lineTo(-90, -70); ctx.lineTo(-30, -60); ctx.fill(); ctx.globalAlpha = 1; }
    this.paintSail(ctx, ship, 22, 102, -198, -96, 1);
    // Flag.
    const flagTop = broken ? -150 : -262, wave = this.reducedMotion ? 0 : 1, windDir = Math.sign(this.wind || 1) * ship.facing;
    ctx.fillStyle = L.flag; ctx.beginPath(); ctx.moveTo(-20, flagTop);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-20 + windDir * i * 8, flagTop + Math.sin(this.t * 7 + i) * 3 * wave);
    for (let i = 6; i >= 0; i--) ctx.lineTo(-20 + windDir * i * 8, flagTop + 24 + Math.sin(this.t * 7 + i) * 3 * wave);
    ctx.fill();
    if (ship.isPlayer) { ctx.fillStyle = "#111"; ctx.fillRect(-20 + windDir * 18, flagTop + 8, 10 * windDir, 8); }
    else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-20 + windDir * 22, flagTop + 11, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-20 + windDir * 18, flagTop + 15, 8 * windDir, 4); }
    // Bowsprit.
    ctx.strokeStyle = "#5a3417"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(126, -62); ctx.lineTo(190, -96); ctx.stroke();
    // Hull.
    ctx.beginPath();
    ctx.moveTo(-130, -84); ctx.lineTo(-72, -84); ctx.lineTo(-66, -52); ctx.lineTo(96, -52); ctx.lineTo(112, -64); ctx.lineTo(142, -66);
    ctx.quadraticCurveTo(128, 8, 76, 26); ctx.lineTo(-100, 26); ctx.quadraticCurveTo(-132, 8, -130, -84); ctx.closePath();
    const wood = ctx.createLinearGradient(0, -84, 0, 26); wood.addColorStop(0, L.hull); wood.addColorStop(1, L.hullDark);
    ctx.fillStyle = wood; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#2a1406"; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 1.5;
    for (let y = -40; y < 26; y += 9) { ctx.beginPath(); ctx.moveTo(-140, y); ctx.lineTo(150, y); ctx.stroke(); }
    ctx.fillStyle = L.stripe; ctx.fillRect(-140, -38, 290, 12);
    ctx.fillStyle = L.trim; ctx.fillRect(-140, -40, 290, 2); ctx.fillRect(-140, -26, 290, 2);
    ctx.fillStyle = "#1a0d05"; for (let x = -52; x < 96; x += 26) ctx.fillRect(x, -36, 11, 9);
    // Magazine hatch (bright target) or its blast scar.
    if (!ship.magazineBlown) {
      const pulse = 0.55 + Math.sin(this.t * 5) * 0.25;
      ctx.fillStyle = "#3b1a0a"; ctx.fillRect(MAGAZINE[0], MAGAZINE[1], MAGAZINE[2] - MAGAZINE[0], MAGAZINE[3] - MAGAZINE[1]);
      ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.ellipse(17, -18, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd23f"; ctx.font = "900 9px system-ui"; ctx.textAlign = "center"; ctx.save(); ctx.scale(ship.facing, 1); ctx.fillText("TNT", 17 * ship.facing, -15); ctx.restore();
      ctx.strokeStyle = `rgba(255,210,63,${pulse})`; ctx.lineWidth = 2.5; ctx.strokeRect(MAGAZINE[0] - 2, MAGAZINE[1] - 2, MAGAZINE[2] - MAGAZINE[0] + 4, MAGAZINE[3] - MAGAZINE[1] + 4);
    }
    // Waterline weak points: cracked planks.
    for (const r of WATERLINE) {
      ctx.fillStyle = "rgba(90,200,220,0.35)"; ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
      ctx.strokeStyle = "#7ff6ff"; ctx.lineWidth = 1.8; ctx.beginPath();
      ctx.moveTo(r[0] + 4, r[1] + 3); ctx.lineTo(r[0] + 12, r[1] + 10); ctx.lineTo(r[0] + 18, r[1] + 5); ctx.lineTo(r[0] + 28, r[1] + 13); ctx.stroke();
    }
    // Damage holes.
    for (const h of ship.holes) {
      ctx.fillStyle = "#140a04"; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#e0a060"; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.moveTo(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r); ctx.lineTo(h.x + Math.cos(a) * (h.r + 5), h.y + Math.sin(a) * (h.r + 5)); }
      ctx.stroke();
    }
    ctx.restore();
    // Cabin windows (stern).
    ctx.fillStyle = "#2a1406"; ctx.fillRect(-124, -78, 38, 20);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = Math.sin(this.t * 3 + i) > -0.6 ? "#ffe28a" : "#ffb84d"; ctx.fillRect(-121 + i * 12, -75, 8, 13); }
    ctx.strokeStyle = "#ff9ff3"; ctx.globalAlpha = 0.5 + Math.sin(this.t * 4) * 0.2; ctx.lineWidth = 2; ctx.strokeRect(CABIN[0], CABIN[1], CABIN[2] - CABIN[0], CABIN[3] - CABIN[1]); ctx.globalAlpha = 1;
    // Rails and lanterns.
    ctx.strokeStyle = L.trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-128, -94); ctx.lineTo(-72, -94); ctx.moveTo(-66, -62); ctx.lineTo(96, -62); ctx.stroke();
    for (let x = -60; x <= 96; x += 12) { ctx.beginPath(); ctx.moveTo(x, -62); ctx.lineTo(x, -52); ctx.stroke(); }
    ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(-132, -98, 5, 0, Math.PI * 2); ctx.fill();
    // Crew.
    if (ship.isPlayer) this.paintCaptain(ctx);
    else this.paintRivalCaptain(ctx);
    // Cannon.
    const a = (ship.isPlayer ? this.aim.angle : ship.angle) * Math.PI / 180;
    ctx.save(); ctx.translate(PIVOT.x - ship.recoil * 6 * Math.cos(a), PIVOT.y + ship.recoil * 6 * Math.sin(a)); ctx.rotate(-a);
    const iron = ctx.createLinearGradient(0, -9, 0, 9); iron.addColorStop(0, "#6c6f7d"); iron.addColorStop(0.5, "#2b2d38"); iron.addColorStop(1, "#15161d");
    ctx.fillStyle = iron; ctx.beginPath(); ctx.roundRect(-10, -8, BARREL + 10, 16, 6); ctx.fill();
    ctx.fillStyle = L.trim; ctx.fillRect(BARREL - 6, -9, 5, 18); ctx.fillRect(4, -9, 4, 18);
    if (ship.flash > 0) { ctx.fillStyle = `rgba(255,220,120,${ship.flash})`; ctx.beginPath(); ctx.moveTo(BARREL, -10); ctx.lineTo(BARREL + 34 * ship.flash, 0); ctx.lineTo(BARREL, 10); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = "#3a2210"; ctx.beginPath(); ctx.arc(PIVOT.x - 4, PIVOT.y + 8, 9, 0, Math.PI * 2); ctx.arc(PIVOT.x + 12, PIVOT.y + 8, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  private paintSail(ctx: CanvasRenderingContext2D, ship: Ship, x1: number, x2: number, top: number, bottom: number, index: number) {
    const L = ship.look, billow = 16 + (this.reducedMotion ? 0 : Math.sin(this.t * 1.7 + index) * 4);
    ctx.beginPath(); ctx.moveTo(x1, top); ctx.lineTo(x2, top); ctx.quadraticCurveTo(x2 + billow, (top + bottom) / 2, x2 - 4, bottom);
    ctx.lineTo(x1 + 4, bottom); ctx.quadraticCurveTo(x1 + billow * 0.6, (top + bottom) / 2, x1, top); ctx.closePath();
    const cloth = ctx.createLinearGradient(x1, 0, x2, 0); cloth.addColorStop(0, L.sail); cloth.addColorStop(1, shade(L.sail, -18));
    ctx.fillStyle = cloth; ctx.fill(); ctx.strokeStyle = "rgba(40,20,10,0.5)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.fillStyle = L.sailTrim; ctx.fillRect(x1 - 10, top + (bottom - top) * 0.72, x2 - x1 + 30, 9);
    // Tears.
    for (let i = 0; i < ship.sailTears; i++) {
      const tx = x1 + 18 + ((i * 37 + index * 19) % Math.max(10, x2 - x1 - 30)), ty = top + 24 + ((i * 29 + index * 11) % Math.max(10, bottom - top - 40));
      ctx.fillStyle = "rgba(20,10,30,0.85)"; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + 12, ty + 6); ctx.lineTo(tx + 4, ty + 18); ctx.lineTo(tx - 8, ty + 9); ctx.fill();
    }
    ctx.restore();
    if (index === 0) {
      const midX = (x1 + x2) / 2, midY = (top + bottom) / 2 - 6;
      if (ship.isPlayer) { ctx.save(); ctx.globalAlpha = 0.9; ctx.drawImage(this.emblem, midX - 27, midY - 30, 54, 54); ctx.restore(); }
      else {
        ctx.fillStyle = "#f6f1e7"; ctx.beginPath(); ctx.arc(midX, midY - 6, 17, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(midX - 10, midY + 6, 20, 10);
        ctx.fillStyle = "#161320"; ctx.beginPath(); ctx.arc(midX - 7, midY - 6, 5, 0, Math.PI * 2); ctx.arc(midX + 7, midY - 6, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#f6f1e7"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(midX - 26, midY + 24); ctx.lineTo(midX + 26, midY + 36); ctx.moveTo(midX + 26, midY + 24); ctx.lineTo(midX - 26, midY + 36); ctx.stroke();
      }
    }
  }
  private paintCaptain(ctx: CanvasRenderingContext2D) {
    const frame = this.reducedMotion ? 0 : Math.floor(this.t * 8) % this.friendSprites.length;
    const sprite = this.friendSprites[frame], size = 54, x = 30, y = -52 - size + 4;
    ctx.drawImage(sprite, x, y, size, size);
    // Tricorn hat costume over the canonical artwork.
    const px = size / 18, h = this.head, hatW = (h.right - h.left + 5) * px, hatX = x + (h.left + 1 - 1.5) * px, hatY = y + (h.top + 1) * px - 4;
    ctx.fillStyle = "#161320"; ctx.beginPath(); ctx.moveTo(hatX - 4, hatY + 2); ctx.quadraticCurveTo(hatX + hatW / 2, hatY - 22, hatX + hatW + 4, hatY + 2);
    ctx.quadraticCurveTo(hatX + hatW / 2, hatY - 4, hatX - 4, hatY + 2); ctx.fill();
    ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hatX - 3, hatY + 1); ctx.quadraticCurveTo(hatX + hatW / 2, hatY - 5, hatX + hatW + 3, hatY + 1); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hatX + hatW / 2, hatY - 7, 3, 0, Math.PI * 2); ctx.fill();
  }
  private paintRivalCaptain(ctx: CanvasRenderingContext2D) {
    const px = 3, x = 26, y = -52 - 16 * px, bob = this.reducedMotion ? 0 : Math.round(Math.sin(this.t * 6)) ;
    RIVAL_CAPTAIN.forEach((row, r) => [...row].forEach((ch, c) => { const color = RIVAL_COLORS[ch]; if (color) { ctx.fillStyle = color; ctx.fillRect(x + c * px, y + r * px + (r < 12 ? bob : 0), px, px); } }));
  }
  private paintShot(ctx: CanvasRenderingContext2D, s: Shot) {
    const y = Math.max(s.y, 14);
    if (s.owner === "player") {
      ctx.save(); ctx.translate(s.x, y); if (!this.reducedMotion) ctx.rotate(s.rot);
      ctx.shadowColor = `hsl(${(s.hue + s.age * 360) % 360},100%,60%)`; ctx.shadowBlur = 16;
      ctx.drawImage(this.shotSprite, -18, -18, 36, 36); ctx.restore();
    } else {
      const g = ctx.createRadialGradient(s.x - 3, y - 3, 1, s.x, y, 9); g.addColorStop(0, "#8a8da0"); g.addColorStop(1, "#111");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, y, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = Math.random() < 0.5 ? "#ffd23f" : "#ff7b00"; ctx.fillRect(s.x + 4, y - 11, 3, 3);
    }
    if (s.y < 14) { ctx.fillStyle = s.owner === "player" ? "#ccff00" : "#ff3d6e"; ctx.beginPath(); ctx.moveTo(s.x, 4); ctx.lineTo(s.x - 7, 16); ctx.lineTo(s.x + 7, 16); ctx.fill(); }
  }
  private paintAim(ctx: CanvasRenderingContext2D) {
    const p = this.player, speed = 360 + this.aim.power * 560, a = this.aim.angle * Math.PI / 180, m = this.muzzle(p, this.aim.angle);
    let x = m.x, y = m.y, vx = Math.cos(a) * speed, vy = -Math.sin(a) * speed;
    const dt = 1 / 30;
    for (let i = 1; i <= 10; i++) {
      for (let k = 0; k < 2; k++) { vy += GRAVITY * dt / 2; x += vx * dt / 2; y += vy * dt / 2; }
      if (i % 1 === 0) { ctx.fillStyle = `rgba(255,255,255,${0.9 - i * 0.08})`; ctx.beginPath(); ctx.arc(x, y, 4 - i * 0.2, 0, Math.PI * 2); ctx.fill(); }
    }
    // Power arc around the cannon.
    const pivot = this.muzzlePivot(p);
    ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 58, -Math.PI * 0.5, 0); ctx.stroke();
    const hue = 120 - this.aim.power * 120;
    ctx.strokeStyle = `hsl(${hue},100%,55%)`; ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 58, -Math.PI * 0.5, -Math.PI * 0.5 + this.aim.power * Math.PI * 0.5); ctx.stroke();
    if (p.reload > 0) { ctx.strokeStyle = this.overheated ? "#ff3d6e" : "rgba(255,255,255,0.8)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 68, -Math.PI / 2, -Math.PI / 2 + (1 - p.reload / this.reloadMax) * Math.PI * 2); ctx.stroke(); }
    if (this.heat > 0.02) {
      ctx.lineWidth = 6; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 58, Math.PI, Math.PI * 1.5); ctx.stroke();
      ctx.strokeStyle = this.heat > 0.75 ? "#ff3d6e" : this.heat > 0.45 ? "#ff9f1c" : "#ffd23f";
      ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 58, Math.PI * 1.5 - this.heat * Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    }
    if (this.aimPoint) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.aimPoint.x, this.aimPoint.y, 10, 0, Math.PI * 2);
      ctx.moveTo(this.aimPoint.x - 16, this.aimPoint.y); ctx.lineTo(this.aimPoint.x - 5, this.aimPoint.y); ctx.moveTo(this.aimPoint.x + 5, this.aimPoint.y); ctx.lineTo(this.aimPoint.x + 16, this.aimPoint.y); ctx.stroke();
    }
  }
  private paintKraken(ctx: CanvasRenderingContext2D, k: Kraken) {
    const rise = this.tentacleRise(k);
    if (rise <= 0) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(k.x + Math.sin(this.t * 9 + i * 2) * 20, SEA_Y - 4 - ((this.t * 60 + i * 9) % 18), 3, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    const pts = k.points; if (pts.length < 2) return;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (let i = 0; i < pts.length - 1; i++) {
      const w = 34 - i * 2.4;
      ctx.strokeStyle = "#7b2cbf"; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i + 1].x, pts[i + 1].y); ctx.stroke();
      ctx.strokeStyle = "#c77dff"; ctx.lineWidth = w * 0.35; ctx.beginPath(); ctx.moveTo(pts[i].x - w * 0.18, pts[i].y); ctx.lineTo(pts[i + 1].x - w * 0.18, pts[i + 1].y); ctx.stroke();
      ctx.fillStyle = "#ffc8dd"; ctx.beginPath(); ctx.arc(pts[i].x + w * 0.3, pts[i].y, Math.max(2, w * 0.16), 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineCap = "butt";
  }
  private paintFloater(ctx: CanvasRenderingContext2D, f: Floater) {
    const y = this.surface(f.x) - 6, tilt = this.reducedMotion ? 0 : Math.sin(this.t * 2 + f.phase) * 0.15;
    ctx.save(); ctx.translate(f.x, y); ctx.rotate(tilt);
    if (f.kind === "barrel") {
      ctx.fillStyle = "#b5652b"; ctx.beginPath(); ctx.ellipse(0, -8, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffd23f"; ctx.fillRect(-14, -18, 28, 3); ctx.fillRect(-14, 0, 28, 3);
      ctx.fillStyle = "#111"; ctx.font = "900 10px system-ui"; ctx.textAlign = "center"; ctx.fillText("RF", 0, -5);
    } else {
      const pulse = 0.6 + Math.sin(this.t * 6) * 0.3;
      ctx.shadowColor = `rgba(255,210,63,${pulse})`; ctx.shadowBlur = 20;
      ctx.fillStyle = "#8a4a17"; ctx.fillRect(-18, -22, 36, 22); ctx.fillStyle = "#b5652b"; ctx.beginPath(); ctx.ellipse(0, -22, 18, 9, 0, Math.PI, 0); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#ffd23f"; ctx.fillRect(-18, -14, 36, 3); ctx.fillRect(-3, -18, 6, 8);
    }
    ctx.restore();
  }
  private paintGull(ctx: CanvasRenderingContext2D, g: Gull) {
    const flap = this.reducedMotion ? 0.4 : Math.sin(g.flap) * 0.8, dir = Math.sign(g.vx);
    ctx.save(); ctx.translate(g.x, g.y);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.5; ctx.lineCap = "round"; ctx.beginPath();
    ctx.moveTo(-16, -8 * flap); ctx.quadraticCurveTo(-8, -10 * flap - 4, 0, 0); ctx.quadraticCurveTo(8, -10 * flap - 4, 16, -8 * flap); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(0, 1, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ff9f1c"; ctx.fillRect(dir > 0 ? 6 : -10, 0, 4, 2);
    ctx.restore(); ctx.lineCap = "butt";
  }
  private paintParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const f = p.life / p.max;
      if (p.kind === "smoke" || p.kind === "bubble") {
        ctx.fillStyle = p.color.endsWith(",") ? `${p.color}${(p.kind === "bubble" ? 0.7 : 0.55) * f})` : p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === "smoke" ? 1.6 - f * 0.6 : 1), 0, Math.PI * 2); ctx.fill();
      } else if (p.kind === "ring") {
        ctx.strokeStyle = p.color; ctx.globalAlpha = f; ctx.lineWidth = 4 * f; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - f) + 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (p.kind === "flash") {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size); g.addColorStop(0, `rgba(255,255,230,${f})`); g.addColorStop(1, "rgba(255,200,80,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = Math.min(1, f * 1.5); ctx.fillStyle = p.color;
        if (p.kind === "debris" || p.kind === "feather") { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size / 3, p.size * 2, p.size * 0.66); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.kind === "spark" ? f : 1), 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
  }
  private paintTexts(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = "center"; ctx.lineJoin = "round";
    for (const t of this.texts) {
      const f = Math.min(1, t.life / 0.3), pop = 1 + Math.max(0, t.life - 1.1) * 2;
      ctx.globalAlpha = f; ctx.font = `900 ${Math.round(t.size * pop)}px "Trebuchet MS", system-ui, sans-serif`;
      const half = ctx.measureText(t.text).width / 2 + 8, x = clamp(t.x, half, VIEW_W - half);
      ctx.strokeStyle = "#1a0a2e"; ctx.lineWidth = 6; ctx.strokeText(t.text, x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, x, t.y);
    }
    ctx.globalAlpha = 1;
  }
  private paintIntro(ctx: CanvasRenderingContext2D) {
    const n = Math.ceil(this.intro / 0.45), label = this.intro < 0.3 ? "FIRE!" : String(Math.min(3, n));
    ctx.save(); ctx.textAlign = "center"; ctx.font = `900 ${this.intro < 0.3 ? 96 : 110}px "Trebuchet MS", system-ui`;
    ctx.lineWidth = 12; ctx.strokeStyle = "#1a0a2e"; ctx.strokeText(label, VIEW_W / 2, 250); ctx.fillStyle = this.intro < 0.3 ? "#ccff00" : "#ffd23f"; ctx.fillText(label, VIEW_W / 2, 250);
    ctx.restore();
  }
}

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => clamp(v + amount, 0, 255);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
