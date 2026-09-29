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
| Powder magazine (the small glowing TNT hatch) | 34 | One blast per ship, sets the deck on fire (2.2 per second for 6 s, no repairs while it burns), +5 salvage |
| Waterline cracks (cyan planks) | 11 | Springs a leak (1.3 per second, stacking to 4.5) until their crew bails it out |
| Captain's cabin (stern windows) | 8 | +2 plunder |
| Sails | 3 | The shot rips through and keeps flying; each tear slows their reload by 28% and spoils their aim; 4 tears snap the mast |
| Hull | 6 | Solid hit |

Consecutive hits build a streak: +10% damage per hit, up to +50%, and every fifth hit in a row pays +2 Generations.
Missing breaks the streak.

### What makes it hard

| Mechanic | Rule |
| --- | --- |
| Cannon heat | Each shot adds 25% heat; heat cools slowly while you keep firing and fast after 0.8 s of rest. Heat scatters your shots (angle and power spread grow with heat squared). At 100% the cannon overheats and locks for 2.6 s. Spamming sprays; deliberate shots fly true. |
| Repairs | If you stop hitting the rival for 1.4 s, their crew patches hull (2.4 / 3.6 / 4.8 per second for Bess / Rook / Admiral) and bails out leaks. |
| Desperation | Below 35% hull a rival fires 38% faster. |
| Wind shifts | Every 5.5 to 9.5 s the wind swings to a new value between 65 against you and 65 behind you. |
| Moving target | Rival ships tack back and forth on an irregular course. |
| Short preview | The dotted arc only shows the first third of a second of flight. |
| Their aim | Rivals target your hull, cabin, waterline (leaks) and magazine, and their hits land 30% harder than the table above. |
| Near misses and taunts | Shots that pass within a few pixels of the hull call out "SO CLOSE!"; three misses in a row and the rival taunts you. |

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
| Barnacle Bess (easy) | The Soggy Biscuit | 30 | 137 | 1.5 s | loose, reads a third of the wind, drifts 62 px |
| Redbeard Rook (medium) | The Crimson Gull | 40 | 185 | 1.3 s | reads most of the wind, drifts 76 px |
| The Dread Admiral (hard) | Leviathan's Grin | 60 | 210 | 1.3 s | tight, reads almost all the wind, drifts 86 px |

Your ship has 100 hull and reloads every 0.42 s.

Measured with the bots in `bot.mjs` on the SDK mock harness (one run per line, final tuning):

| Bot | Rival | Result |
| --- | --- | --- |
| Deliberate aim, a shot every 1.25 s | Bess | Won with 20 of 30 shots, 57 hull left, net +17 |
| Deliberate aim, a shot every 0.8 s | Bess | Won with 19 of 30 shots, 60 hull left, net +13 |
| Holding fire on one spot | Bess | Won with the last of 30 shots, net +4 |
| Deliberate aim, 1.25 s | Rook | Sunk after 27 of 40 shots |
| Deliberate aim, 0.8 s | Rook | Won with 38 of 40 shots, 27 hull left |
| Deliberate aim, 1.25 s | Admiral | Sunk after 25 of 60 shots |
| Deliberate aim, 0.8 s | Admiral | Won with 40 of 60 shots, 5.8 hull left |

## Economy (all simulated in this preview)

| Rule | Exact value |
| --- | --- |
| SDK consumable | Powder kegs |
| Keg price | 1 RF (`1000000000000000000` base units) |
| Generations per keg | 10 |
| SDK outcome table | One row, 10,000 bps: "Keg buyback reserve", 1 RF. The SDK requires at least one prize, so every keg reserves its full 1 RF price. The game never calls `play`, `settle` or `redeem`, so no buyback is offered in the preview. |
| Stake | Both sides load the same amount: 30, 40 or 60 Generations |
| Win | Your unfired Generations come back, plus the rival's whole stake, plus salvage |
| Loss | Your whole stake goes to the rival |
| Fired shots | Burned |

Net result of a win: `stake - fired + salvage`. Net result of a loss: `-stake`.

The only SDK action used is `client.buy(kegs)`, the single confirmation. The Generations ledger, stakes, payouts and
salvage are tracked inside the game frame for the runtime session and reset on reload, because SDK v0.1.3 has no
additional-currency, transfer or save API.

### How it connects to $RAREFRIENDS

Generations can only be created by spending RF, and every shot destroys one. In a live version each fired Generation
would burn its RF, so every battle takes RF out of circulation. A battle against the Admiral puts 60 Generations (6 RF) a side at stake.

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
- `node games/pirate-friends/bot.mjs <parked|adaptive> <bess|rook|admiral> [width] [ms]`: difficulty bots, results above.

The mock tests do not verify real RPC reads or ownership. The real ownership gate needs a wallet holding a hardwired
Generation.
