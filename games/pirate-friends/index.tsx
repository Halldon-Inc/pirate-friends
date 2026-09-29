"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import type { GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, spriteFrame } from "@rarefriends/friendsdk/sprites";
import { Scene, RIVALS, ZONES, VIEW_W, VIEW_H, type BattleResult, type Hud, type Rival, type Zone } from "./engine.js";
import { createPirateAudio, type PirateAudio } from "./audio.js";
import "@rarefriends/friendsdk/frame.css";
import "./style.css";

/** Each keg bought through the SDK becomes this many Generations (cannon shots) in the hold. */
export const GENERATIONS_PER_KEG = 10;
const GAME_KEYS = new Set(["a", "d", "w", "s", "arrowleft", "arrowright", "arrowup", "arrowdown", " ", "enter"]);
type Screen = "harbor" | "battle" | "result";
type Menu = "help" | "settings" | null;
type Payout = BattleResult & { rival: Rival; returned: number; net: number };
const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
const ZONE_ORDER: Zone[] = ["magazine", "waterline", "cabin", "sails", "hull"];

/** Pirate Friends. The SDK runtime supplies the verified Friend and the fixed preview client. */
export default function PirateFriends({ friendId, client, paused }: GameComponentProps) {
  const canvas = useRef<HTMLCanvasElement>(null), scene = useRef<Scene | null>(null), audio = useRef<PirateAudio | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null), [loadError, setLoadError] = useState(""), [revision, setRevision] = useState(0);
  const [hold, setHold] = useState(0), [screen, setScreen] = useState<Screen>("harbor"), [menu, setMenu] = useState<Menu>(null);
  const [rival, setRival] = useState<Rival>(RIVALS[0]), [payout, setPayout] = useState<Payout | null>(null), [hud, setHud] = useState<Hud | null>(null);
  const [kegs, setKegs] = useState(3), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [muted, setMuted] = useState(false), [reducedMotion, setReducedMotion] = useState(false), [callout, setCallout] = useState("");
  const [record, setRecord] = useState({ wins: 0, losses: 0, burned: 0, plundered: 0 });
  const live = useRef({ paused, menu, screen, rival }); live.current = { paused, menu, screen, rival };
  const locked = useRef(false), epoch = useRef(0), calloutTimer = useRef(0);
  const definition = client.definition;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches); update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (scene.current) scene.current.reducedMotion = reducedMotion; }, [reducedMotion]);
  useEffect(() => { audio.current?.setMuted(muted); }, [muted]);
  useEffect(() => {
    const stop = paused || menu !== null;
    if (scene.current) { scene.current.paused = stop; if (stop) scene.current.releaseAll(); }
  }, [paused, menu]);

  // Load the Friend's canonical artwork and the SDK ledger, then run the canvas loop.
  useEffect(() => {
    const version = ++epoch.current, node = canvas.current;
    let frame = 0, previous = 0, cancelled = false;
    setSnapshot(null); setLoadError(""); setScreen("harbor"); setMenu(null); setPayout(null); setHud(null); setBusy(false); locked.current = false;
    audio.current = createPirateAudio(false);
    if (!node || !node.getContext("2d")) { setLoadError("This browser cannot draw the battle canvas."); return; }
    const release = () => scene.current?.releaseAll();
    window.addEventListener("blur", release); document.addEventListener("visibilitychange", release);
    void Promise.all([createFriendReader().read(friendId), client.read()]).then(([sprites, value]) => {
      if (cancelled || version !== epoch.current) return;
      if (value.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      const frames = Array.from({ length: 8 }, (_, index) => spriteFrame(sprites, "right", false, index, "right").frame.rows);
      const instance = new Scene(node, {
        friendFrames: frames,
        onSound: name => audio.current?.play(name),
        onHud: next => setHud(next),
        onCallout: text => { setCallout(text); window.clearTimeout(calloutTimer.current); calloutTimer.current = window.setTimeout(() => setCallout(""), 2600); },
        onEnd: result => settleBattle(result),
      });
      instance.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      scene.current = instance;
      setSnapshot(value);
      // Kegs already bought for this Friend in this runtime session stay in the hold.
      setHold(Number(value.consumables) * GENERATIONS_PER_KEG);
      const loop = (now: number) => {
        const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0; previous = now;
        if (!document.hidden) { instance.update(dt); instance.render(); }
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }).catch(cause => {
      if (!cancelled && version === epoch.current) setLoadError(cause instanceof Error && cause.message.includes("does not match") ? cause.message : "Your Friend's artwork or the game ledger could not load. Check your connection and retry.");
    });
    return () => {
      cancelled = true; epoch.current++; cancelAnimationFrame(frame); scene.current = null;
      audio.current?.dispose(); audio.current = null; window.clearTimeout(calloutTimer.current);
      window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", release);
    };
    // settleBattle only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId, client, revision]);

  function settleBattle(result: BattleResult) {
    const opponent = live.current.rival;
    const returned = result.won ? result.unfired + result.stake + result.bonus : 0;
    setHold(value => value + returned);
    setRecord(value => ({ wins: value.wins + (result.won ? 1 : 0), losses: value.losses + (result.won ? 0 : 1),
      burned: value.burned + result.fired, plundered: value.plundered + (result.won ? result.stake + result.bonus : 0) }));
    setPayout({ ...result, rival: opponent, returned, net: returned - result.stake });
    setScreen("result");
  }

  async function loadKegs() {
    if (locked.current || paused) return;
    const version = epoch.current, quantity = kegs;
    locked.current = true; setBusy(true); setError(""); setMessage(""); audio.current?.unlock();
    try {
      await client.buy(BigInt(quantity));
      const value = await client.read();
      if (version !== epoch.current) return;
      setSnapshot(value); setHold(h => h + quantity * GENERATIONS_PER_KEG);
      setMessage(`${quantity * GENERATIONS_PER_KEG} Generations loaded into your hold.`); audio.current?.play("bonus");
    } catch (cause) {
      if (version === epoch.current) setError(cause instanceof Error ? cause.message : "Loading the kegs failed.");
    } finally { if (version === epoch.current) { locked.current = false; setBusy(false); } }
  }

  function startBattle(next: Rival) {
    if (!scene.current || hold < next.stake || paused) return;
    audio.current?.unlock();
    setRival(next); live.current.rival = next;
    setHold(value => value - next.stake);
    setPayout(null); setMenu(null); setScreen("battle"); setCallout(""); setError(""); setMessage("");
    scene.current.startBattle(next, next.stake);
    requestAnimationFrame(() => canvas.current?.focus());
  }
  function toHarbor() { scene.current?.toHarbor(); setScreen("harbor"); setPayout(null); setHud(null); }

  // ─── Input ─────────────────────────────────────────────────────────
  const blocked = paused || menu !== null || screen !== "battle";
  const toPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * VIEW_W / rect.width, y: (event.clientY - rect.top) * VIEW_H / rect.height };
  };
  const touchAim = useRef(false);

  if (loadError) return <div className="pf-status" role="alert"><p>{loadError}</p>
    <button type="button" disabled={paused} onClick={() => setRevision(value => value + 1)}>Retry loading</button></div>;
  if (snapshot && snapshot.friendId !== friendId) return <p role="alert">This game session does not match the selected Friend.</p>;

  const canAfford = snapshot ? snapshot.rfBalance >= definition.price * BigInt(kegs) : false;
  const mode = snapshot?.mode === "chain" ? "Live" : "Simulated";
  const bar = (value: number, max: number) => `${Math.max(0, Math.min(100, value / max * 100))}%`;

  return <section className="pf-game" aria-label="Pirate Friends" aria-busy={busy}>
    <canvas ref={canvas} className="pf-canvas" width={VIEW_W} height={VIEW_H} tabIndex={blocked ? -1 : 0}
      data-mode="loading"
      aria-label="Battle canvas. Move the mouse to aim and click or hold to fire. Keyboard: A and D change the angle, W and S change the power, Space fires, M mutes."
      onKeyDown={event => {
        const key = event.key.toLowerCase();
        if (key === "m") { event.preventDefault(); setMuted(value => !value); return; }
        if (blocked) return;
        if (key === "escape" || key === "p") { event.preventDefault(); setMenu("settings"); return; }
        if (GAME_KEYS.has(key)) { event.preventDefault(); audio.current?.unlock(); if (!event.repeat) scene.current?.keyDown(key); }
      }}
      onKeyUp={event => { const key = event.key.toLowerCase(); if (GAME_KEYS.has(key)) { event.preventDefault(); scene.current?.keyUp(key); } }}
      onBlur={() => scene.current?.releaseAll()}
      onPointerMove={event => {
        if (blocked || (event.pointerType !== "mouse" && !touchAim.current)) return;
        const point = toPoint(event); scene.current?.aimAt(point.x, point.y);
      }}
      onPointerDown={event => {
        if (blocked) return;
        event.preventDefault(); event.currentTarget.focus(); audio.current?.unlock();
        const point = toPoint(event); scene.current?.aimAt(point.x, point.y);
        if (event.pointerType === "mouse") scene.current?.setFiring(true);
        else { touchAim.current = true; event.currentTarget.setPointerCapture(event.pointerId); }
      }}
      onPointerUp={event => {
        if (event.pointerType === "mouse") scene.current?.setFiring(false);
        else if (touchAim.current) { touchAim.current = false; if (!blocked) scene.current?.fire(); }
      }}
      onPointerCancel={() => { touchAim.current = false; scene.current?.setFiring(false); }}
      onPointerLeave={event => { if (event.pointerType === "mouse") { scene.current?.setFiring(false); scene.current?.clearAimPoint(); } }} />

    {!snapshot && <div className="pf-status" role="status"><p>Hoisting the sails and loading your Friend…</p></div>}

    {snapshot && screen === "harbor" && <div className="pf-harbor" inert={paused || menu !== null || undefined}>
      <div className="pf-logo" aria-hidden="true"><span>PIRATE</span><span>FRIENDS</span><small>Fire your Generations. Sink their ship. Keep their hold.</small></div>
      <div className="pf-panel">
        <h1 className="pf-sr">Pirate Friends harbor</h1>
        <div className="pf-stats">
          <div><strong data-testid="hold">{hold}</strong><span>Generations in hold</span></div>
          <div><strong>{rf(snapshot.rfBalance)}</strong><span>{mode} balance</span></div>
        </div>
        <div className="pf-powder">
          <h2>Powder room</h2>
          <p>1 keg = {rf(definition.price)} = {GENERATIONS_PER_KEG} Generations. <b>One confirmation loads them all</b>, then fire with no more prompts.</p>
          <div className="pf-stepper">
            <button type="button" aria-label="One keg fewer" disabled={busy || kegs <= 1} onClick={() => setKegs(value => Math.max(1, value - 1))}>−</button>
            <output aria-live="polite">{kegs} {kegs === 1 ? "keg" : "kegs"}</output>
            <button type="button" aria-label="One keg more" disabled={busy || kegs >= 10} onClick={() => setKegs(value => Math.min(10, value + 1))}>+</button>
            <button type="button" className="pf-primary" disabled={busy || paused || !canAfford} onClick={() => void loadKegs()}>
              {busy ? "Waiting for confirmation…" : `Load ${kegs * GENERATIONS_PER_KEG} Generations · ${rf(definition.price * BigInt(kegs))}`}</button>
          </div>
          <p className="pf-feedback" role={error ? "alert" : "status"}>{error || message || (canAfford ? `${mode} RF. Every keg stays backed by a 1 RF reserve.` : `Not enough ${mode.toLowerCase()} RF for ${kegs} kegs.`)}</p>
        </div>
        <h2>Choose your rival</h2>
        <ul className="pf-rivals">
          {RIVALS.map(item => <li key={item.id} style={{ ["--rival" as string]: item.look.flag === "#111" ? "#b388ff" : item.look.flag }}>
            <div><strong>{item.name}</strong><span>{item.ship} · {item.difficulty}</span><small>{item.blurb}</small></div>
            <button type="button" className="pf-battle" disabled={paused || hold < item.stake} onClick={() => startBattle(item)}
              aria-label={`Battle ${item.name}, stake ${item.stake} Generations`}>Battle<span>stake {item.stake}</span></button>
          </li>)}
        </ul>
        {hold < RIVALS[0].stake && <p className="pf-hint">Load at least {Math.ceil(RIVALS[0].stake / GENERATIONS_PER_KEG)} kegs to set sail.</p>}
        <div className="pf-row">
          <button type="button" onClick={() => setMenu("help")}>How to play</button>
          <button type="button" onClick={() => setMenu("settings")}>Settings</button>
          {(record.wins + record.losses) > 0 && <span className="pf-record">{record.wins}W {record.losses}L · {record.burned} burned</span>}
        </div>
      </div>
    </div>}

    {snapshot && screen === "battle" && hud && <div className="pf-hud" inert={paused || menu !== null || undefined}>
      <div className="pf-plate pf-you">
        <strong>Your ship</strong>
        <div className="pf-bar"><i style={{ width: bar(hud.playerHp, hud.playerMax) }} /></div>
        <span><b data-testid="ammo">{hud.ammo}</b> Generations loaded{hud.streak >= 3 ? ` · streak x${hud.streak}` : ""}</span>
      </div>
      <div className="pf-center">
        <div className="pf-wind" aria-label={`Wind ${Math.abs(hud.wind)} ${hud.wind >= 0 ? "toward the rival" : "toward you"}`}>
          <span>Wind</span><b>{hud.wind < 0 ? "◀" : ""} {Math.abs(hud.wind)} {hud.wind >= 0 ? "▶" : ""}</b>
        </div>
        <div className="pf-pot">Pot {rival.stake * 2}{hud.bonus ? ` · salvage +${hud.bonus}` : ""}</div>
        <button type="button" className="pf-small" onClick={() => setMenu("settings")}>Pause</button>
      </div>
      <div className="pf-plate pf-them" style={{ ["--rival" as string]: rival.look.flag === "#111" ? "#b388ff" : rival.look.flag }}>
        <strong>{rival.name}</strong>
        <div className="pf-bar"><i style={{ width: bar(hud.enemyHp, hud.enemyMax) }} /></div>
        <span>{hud.repairing && <em className="pf-tag pf-repair">patching hull</em>}{hud.desperate && <em className="pf-tag pf-desperate">desperate</em>}{hud.enemyAmmo} Generations left</span>
      </div>
      {callout && <p className="pf-callout">{callout}</p>}
      <p className="pf-aim" aria-hidden="true">Angle {hud.angle}° · Power {hud.power}%<span className="pf-desktop"> · Mouse aims, click or hold to fire · A/D angle · W/S power · Space fire</span><span className="pf-touch"> · Drag to aim, release to fire</span></p>
      <button type="button" className="pf-fire" aria-label="Fire (hold for rapid fire)"
        onPointerDown={event => { event.preventDefault(); audio.current?.unlock(); scene.current?.setFiring(true); }}
        onPointerUp={() => scene.current?.setFiring(false)} onPointerLeave={() => scene.current?.setFiring(false)}
        onKeyDown={event => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); scene.current?.fire(); } }}>FIRE</button>
    </div>}
    <p className="pf-sr" aria-live="polite">{callout}</p>

    {snapshot && screen === "result" && payout && <div className="pf-result" role="dialog" aria-modal="false" aria-labelledby="pf-result-title">
      <div className={`pf-card ${payout.won ? "won" : "lost"}`}>
        <h2 id="pf-result-title">{payout.won ? "Victory!" : "Defeat"}</h2>
        <p className="pf-reason">{payout.reason === "sunk" ? `${payout.rival.ship} is at the bottom of the sea.` : payout.reason === "surrender" && payout.won ? `${payout.rival.name} ran out of Generations and surrendered.`
          : payout.reason === "dry" ? "You ran out of Generations and struck your colours." : payout.reason === "surrender" ? "You struck your colours." : "Your ship went down."}</p>
        <table><tbody>
          <tr><th>Loaded</th><td>{payout.stake}</td></tr>
          <tr><th>Fired (burned)</th><td>−{payout.fired}</td></tr>
          {payout.won ? <>
            <tr><th>Unfired, back to hold</th><td>+{payout.unfired}</td></tr>
            <tr><th>{payout.rival.name}'s whole stake</th><td>+{payout.stake}</td></tr>
            <tr><th>Salvage and plunder</th><td>+{payout.bonus}</td></tr>
          </> : <>
            <tr><th>Unfired, taken by {payout.rival.name}</th><td>−{payout.unfired}</td></tr>
            {payout.bonus > 0 && <tr><th>Salvage lost with your ship</th><td>{payout.bonus}</td></tr>}
          </>}
          <tr className="pf-net"><th>Net Generations</th><td>{payout.net >= 0 ? "+" : ""}{payout.net}</td></tr>
        </tbody></table>
        <p className="pf-hits">{ZONE_ORDER.filter(zone => payout.hits[zone]).map(zone => `${ZONES[zone].label.toLowerCase()} ×${payout.hits[zone]}`).join(" · ") || "No hits landed"} · accuracy {Math.round(payout.accuracy * 100)}%</p>
        <p className="pf-small-print">{mode} Generations and results. Hold: <b>{hold}</b></p>
        <div className="pf-row">
          <button type="button" className="pf-primary" disabled={paused || hold < payout.rival.stake} onClick={() => startBattle(payout.rival)}>Rematch · stake {payout.rival.stake}</button>
          <button type="button" disabled={paused} onClick={toHarbor}>Back to harbor</button>
        </div>
      </div>
    </div>}

    {menu && <GameMenu title={menu === "help" ? "How to play" : "Settings"} onClose={() => setMenu(null)}>
      {menu === "help" ? <div className="pf-help">
        <p><b>Load your hold.</b> Convert RF into kegs of Generations with one confirmation. Every Generation is one cannon shot, and your Friend is the ammunition.</p>
        <p><b>Stake and fight.</b> You and your rival each load the same stake. Fire until one ship sinks or one side runs out of Generations. <b>The winner keeps the loser's entire stake</b>, plus every unfired shot. Fired shots are burned.</p>
        <table><thead><tr><th>Target</th><th>Damage</th><th>Effect</th></tr></thead><tbody>
          {ZONE_ORDER.map(zone => <tr key={zone}><td>{ZONES[zone].label.toLowerCase()}</td><td>{ZONES[zone].damage}</td><td>{ZONES[zone].effect}{ZONES[zone].bonus ? ` (+${ZONES[zone].bonus} Generations)` : ""}</td></tr>)}
        </tbody></table>
        <p><b>The catch:</b> every rapid shot heats your cannon and throws it wilder; max the heat and it locks up to cool. Stop hitting the rival for 1.4 seconds and their crew patches the hull and bails out leaks. Below 35% hull they get desperate and fire much faster. The wind shifts every few seconds. Consecutive hits stack up to +50% damage, and every fifth hit in a row pays +2.</p>
        <p><b>On the way:</b> gulls bounce your shot higher (+1), RF barrels act as trampolines (+2), treasure chests pay +5, flat fast shots skip off the water, the Kraken eats anything it touches, and you can shoot their cannonballs out of the sky (+1). Salvage is paid only if you win.</p>
        <p><b>Controls:</b> mouse aims (direction sets angle, distance sets power), click or hold to fire. Keyboard: A/D angle, W/S power, Space fire, M mute, Esc pause. Touch: drag to aim, release to fire, or hold FIRE. Wind bends every shot.</p>
      </div> : <>
        <button type="button" aria-pressed={!muted} onClick={() => { setMuted(!muted); audio.current?.unlock(); }}>{muted ? "Sound off" : "Sound on"}</button>
        <label className="pf-check"><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion (no shake, calm sea, fewer particles)</label>
        {screen === "battle" && <button type="button" className="pf-danger" onClick={() => { setMenu(null); scene.current?.surrender(); }}>Strike your colours (forfeit the stake)</button>}
        <p>All RF, Generations, stakes and rewards are simulated in this preview and reset when the game reloads. Wallet connection and Friend ownership checks are provided by the SDK.</p>
      </>}
      <button type="button" onClick={() => setMenu(null)}>{screen === "battle" ? "Back to battle" : "Close"}</button>
    </GameMenu>}
  </section>;
}
