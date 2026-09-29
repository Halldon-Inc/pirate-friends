# Pirate Friends

FriendSDK **v0.1.3** game. Your Rare Friend captains a pirate ship, and your Generations are the cannonballs.
Load your hold with one confirmation, stake Generations against a rival captain, and fire until one ship sinks or
one side runs dry. **The winner keeps the loser's entire stake.** Every shot fired is burned.

## Run it

From the root of this repository (Node.js 22+):

```sh
npm ci
npm run build
npm run dev:game -- games/pirate-friends
```

Open `http://localhost:4173`, connect a wallet on **Robinhood mainnet (chain 4663)** and pick a Friend. The SDK
runtime verifies that the wallet owns a hardwired Generations NFT (generation 1 or higher) before play. There is no
bypass in this game.

Build the static preview with `npx friendsdk build games/pirate-friends` (output in `games/pirate-friends/.friendsdk/`).

## How to play

1. **Powder room.** Choose 1 to 10 kegs and press **Load**. One SDK confirmation converts RF into kegs, and each keg
   becomes 10 Generations in your hold. After that, firing needs no more prompts.
2. **Choose a rival** and set sail. You and the rival each load the same stake of Generations.
3. **Fire.** Mouse: direction from your cannon sets the angle, distance sets the power; click to fire, hold for rapid
   fire. Keyboard: A/D angle, W/S power, Space fire (hold to repeat), M mute, Esc pause. Touch: drag to aim, release
   to fire, or hold the FIRE button. A dotted arc previews the start of the shot; wind bends the rest.
4. **Win** by sinking the rival or outlasting their ammunition. Run out of Generations first and you strike your
   colours.

### Targets on the rival ship

| Target | Damage | Effect |
| --- | --- | --- |
| Powder magazine (the glowing TNT hatch) | 40 | One huge blast per ship, sets the deck on fire (2.2 per second for 6 s), +5 salvage |
| Waterline cracks (cyan planks) | 15 | Springs a leak: 1.3 per second, stacking to 4.5 |
| Captain's cabin (stern windows) | 13 | +2 plunder |
| Sails | 5 | The shot rips through and keeps flying; each tear slows their reload by 28% and spoils their aim; 4 tears snap the mast |
| Hull | 9 | Solid hit |

Consecutive hits build a streak: +8% damage per hit, up to +40%.

### On the way across

| Thing | What it does |
| --- | --- |
| Seagull | Bounces your shot higher, +1 |
| RF barrel | Trampoline, +2 |
| Treasure chest (every 20 to 32 s) | +5 |
| Flat, fast shot hitting the water | Skips up to 3 times |
| Kraken tentacle (every 11 to 17 s, bubbles warn first) | Eats any shot it touches, yours or theirs |
| Their cannonball | Shoot it out of the sky, +1 |

Salvage and plunder are paid only if you win; they go down with a losing ship.

### Rivals

| Rival | Ship | Stake | Hull | Reload | Aim |
| --- | --- | --- | --- | --- | --- |
| Barnacle Bess (easy) | The Soggy Biscuit | 20 | 85 | 2.2 s | wide, ignores wind, drifts 14 px |
| Redbeard Rook (medium) | The Crimson Gull | 30 | 110 | 1.7 s | reads half the wind, drifts 38 px |
| The Dread Admiral (hard) | Leviathan's Grin | 50 | 150 | 1.25 s | tight, reads most of the wind, drifts 55 px |

Your ship has 100 hull and reloads every 0.42 s.

## Economy (all simulated in this preview)

| Rule | Exact value |
| --- | --- |
| SDK consumable | Powder kegs |
| Keg price | 1 RF (`1000000000000000000` base units) |
| Generations per keg | 10 |
| SDK outcome table | One row, 10,000 bps: "Keg buyback reserve", 1 RF. The SDK requires at least one prize, so every keg reserves its full 1 RF price. The game never calls `play`, `settle` or `redeem`, so no buyback is offered in the preview. |
| Stake | Both sides load the same amount: 20, 30 or 50 Generations |
| Win | Your unfired Generations come back, plus the rival's whole stake, plus salvage |
| Loss | Your whole stake goes to the rival |
| Fired shots | Burned |

Net result of a win: `stake - fired + salvage`. Net result of a loss: `-stake`.

The only SDK action used is `client.buy(kegs)`, the single confirmation. The Generations ledger, stakes, payouts and
salvage are tracked inside the game frame for the runtime session and reset on reload, because SDK v0.1.3 has no
additional-currency, transfer or save API.

### How it connects to $RAREFRIENDS

Generations can only be created by spending RF, and every shot destroys one. In a live version each fired Generation
would burn its RF, so every battle takes RF out of circulation. A battle against the Admiral puts 50 Generations (5 RF) a side at stake.

### Capability gaps for a live version

- **Real player vs player.** The SDK sandbox only allows network access to the Robinhood RPC, so matchmaking and a
  live opponent are not possible inside SDK v0.1.3. Rivals are AI captains. A live version needs a match service
  and an escrow contract holding both stakes.
- **Skill-based payouts.** Paid outcomes must come from contracts, and aim is decided in the browser. A live version
  needs a server-verified or replay-verified battle result before the escrow pays out.
- **Generations as a currency.** The SDK supplies one consumable and a chance table; minting, transferring and
  burning an additional RF-backed currency needs its own integration.

## Accessibility and settings

Settings has sound on/off and reduce motion (no screen shake, calmer sea, fewer particles; the system preference is
honoured by default). Keyboard play works end to end, gameplay pauses whenever the runtime menu or a game menu is
open, and loading failures show a retry button.

## Assets

All artwork is drawn in code for this game (ships, sea, sky, Kraken, the rival skull captain and the tricorn hat).
Your Friend is the canonical Generations sprite read through the SDK's `createFriendReader`, drawn unmodified with the
hat added on top. Sound is synthesized with Web Audio. No third-party assets.

## Checks

- `npx friendsdk check games/pirate-friends`: valid.
- `npx tsc -p games/pirate-friends/tsconfig.json`: clean.
- `node games/pirate-friends/test.mjs ./artifacts 960` (also 600 and 390): SDK mock-wallet browser run that loads
  kegs with one confirmation, starts a battle, fires 6 shots with no further prompts, forfeits and checks the result.
- `node games/pirate-friends/win-test.mjs 960`: aims with the mouse, sinks Barnacle Bess and checks the payout.

The mock tests do not verify real RPC reads or ownership. The real ownership gate needs a wallet holding a hardwired
Generation.
