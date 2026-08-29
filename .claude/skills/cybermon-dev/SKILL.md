---
name: cybermon-dev
description: Architecture, invariants, and verification recipes for the Cybermon Discord Pokemon bot. Use when adding or fixing any command, battle mechanic, database query, or shop/trade/market feature in this repo.
---

# Cybermon developer guide

Read this instead of re-exploring the repo. Every fact here was verified against
the running code. If something contradicts the code, the code wins — fix this file.

## Stack

- **discord.js v14**, prefix commands only (no slash commands yet).
- **PostgreSQL** via `pg` `Pool`, exported as `{ pool }` from `src/database.js`.
- **Node 24**, deployed on Docker / HF Spaces (`app_port: 7860`) and Replit.
- `@napi-rs/canvas` for battle images.

## Command contract

Every file in `src/commands/*.js` exports:

```js
module.exports = { name, aliases: [], description, execute(message, args, spawns, prefix) };
```

`index.js` auto-loads them. Alias collisions are resolved by `ALIAS_OVERRIDES`
in `index.js`, then first-wins with a `console.warn`; a command's own **name**
always outranks any alias. **Never delete an alias to fix a collision** — pin
the winner in `ALIAS_OVERRIDES` instead.

`prefix` is per-guild (`server_config.prefix`), defaulting to `c!`. Always
interpolate the passed-in `prefix` into user-facing help text; never hardcode `c!`.

## Hard invariants

1. **Position = rank in `id ASC` order.** Always. A user-facing position number
   is never affected by display sort. Resolve it with
   `getPokemonIdByPosition(userId, position)` from `src/utils/positionHelper.js`.
   Display sorting lives in `src/utils/collection.js` and must not renumber.
2. **Nicknames survive evolution.** `UPDATE pokemon SET pokemon_id = $1` only —
   never touch `nickname`.
3. **Locked Pokemon are immutable.** Before evolving, releasing, or otherwise
   mutating a Pokemon, call `getPokemonLock(pokemonDbId)` from
   `src/utils/lockHelper.js`. It returns `{ reason, label }` or `null`, covering
   market listings and active trades.
4. **Coins and items move in one transaction.** Anything that spends currency or
   consumes an item uses `pool.connect()` + `BEGIN` / `SELECT ... FOR UPDATE` /
   `COMMIT`, with `ROLLBACK` in `catch` and `client.release()` in `finally`.
   Never `COMMIT` a debit before the effect is applied.
5. **XP goes through `addXp`.** `src/utils/levelUpHelper.js` exports
   `{ addXp, levelUpPokemon, evolveChain }`. `addXp` carries overflow XP and
   chains multiple level-ups; `levelUpPokemon` grants whole levels (Rare Candy)
   and caps rather than clears the XP bar. Do not hand-roll level maths.
6. **Additive changes only.** Existing commands, aliases, and flags must keep
   working. When rewriting a file, diff its old exports against the new ones.

## Battle system

- `src/utils/battleEngine.js` — **all** mechanics. Pure functions, no Discord types.
- `src/commands/battle.js` — Discord flow only (embeds, collectors, rewards).

Engine exports: `prepareBattlePokemon, effStat, getSpeed, displayStats,
battleName, hpBar, miniBar, statusTag, currentMoves, applyMega, applyGmax,
tickGmax, applyStatus, applyBoost, healPoke, statusImmune, computeDamage,
effectivenessText, critChance, firstActorIsA, resetTurnFlags, onSwitchOut,
forcedMove, isOutOfPP, performMove, endOfTurnResiduals`, plus `STATUS_INFO,
STAT_KEYS, STAT_LABELS, STRUGGLE`.

Gotchas that have already bitten this code:

- **Read `battle.p1Active` / `battle.p2Active` fresh inside turn resolution.**
  A switch reassigns them; a stale closure makes the opponent hit the Pokemon
  that already left the field.
- **A mutual wipe is a draw**, not a challenger win.
- **Roll a reward once.** Pay and display the same number.
- `mega.js` `statBoost` values are **raw additions to base stats**, tracked as
  `baseBoosts` — they are not stat stages.
- Charge moves store the **move object** in `poke.chargedMove`, not its name
  (Gigantamax swaps the whole move list mid-charge). PP costs 1 total, not 2.
- Gmax ticks at **end** of turn.
- Stat stages clamp to ±6; accuracy/evasion are separate stages.

## Data layer

- `src/data/pokemonLoader.js` — `getPokemonById`, `getPokemonByName`,
  `getPokemonImage(id, shiny)`, `getRandomPokemon()` (rarity-weighted).
- `src/data/rarity.js` — `TIERS` weights: common 100, uncommon 45, rare 12,
  ultra_rare 5, legendary 2, mythical 0.8, event 0. Tier is derived from
  `captureRate` + `isLegendary` / `isMythical`.
- `src/data/learnsets.js` — memoized `generateLearnset`, `getNewMovesAtLevel`.
- `src/data/shopItems.js` — `{ SHOP_ITEMS, SHOP_CATEGORIES, EVOLUTION_ITEMS,
  getPurchasableItems }`. Evolution stones are **generated** from
  `EVOLUTION_ITEMS` so they can't drift from what `pokemon.json` asks for.
  Every category an item uses must exist in `SHOP_CATEGORIES` or the item
  silently never renders.
- Evolution shapes in `pokemon.json` `evolutionTo[]`:
  `{to, level, trigger:"level-up"}`, `{to, item, trigger:"use-item"}`,
  `{to, trigger:"trade"}`. 393 level-up, 49 use-item, 24 trade, 4 with no
  trigger, plus one-offs (`use-move`, `shed`, `spin`, `three-critical-hits`).
- Branched evolutions at one level (Wurmple, Tyrogue) must pick **randomly**
  among tied candidates, not always index 0.

## Formulas (Gen 3/4)

```
stat = ((2*base + iv + ev/4) * level)/100 + 5        // HP adds + level + 10 instead of + 5
damage = (((2*level/5 + 2) * power * atk/def)/50) + 2
```

Natures apply 1.1x / 0.9x via `src/utils/statCalc.js`.

## Environment gotchas

- `python - <<'PY'` fails: Python is not installed.
- `fs.writeFileSync` from `node -e` **works** (it failed with `EBADF` before
  `npm install` had been run). Still prefer the Write / Edit tools for real source
  changes — use `node -e` writes only for throwaway probes and rendered previews.
- Network access works from `node -e`: `fetch` and `loadImage(url)` both succeed.
- If `require` fails with `Cannot find module`, run `npm install --no-audit --no-fund`.

## Verification recipes

Cheap, and they catch most regressions. Run these instead of reasoning about
whether a change is safe.

Syntax check everything:

```bash
node --check index.js && for f in src/**/*.js; do node --check "$f" || echo "FAIL $f"; done
```

Every command loads and exports a valid shape:

```bash
node -e "const fs=require('fs');let bad=0;for(const f of fs.readdirSync('src/commands').filter(f=>f.endsWith('.js'))){const c=require('./src/commands/'+f);if(!c.name||typeof c.execute!=='function'){console.log('BAD',f);bad++}}console.log(bad?'FAIL':'ALL COMMANDS OK')"
```

Alias map (prints collisions):

```bash
node -e "const fs=require('fs');const a=new Map();for(const f of fs.readdirSync('src/commands').filter(f=>f.endsWith('.js'))){const c=require('./src/commands/'+f);for(const al of (c.aliases||[])){if(a.has(al))console.log('collision',al,a.get(al),c.name);a.set(al,c.name)}}console.log('aliases',a.size)"
```

Battle engine smoke test — drive `performMove` directly, no Discord needed:

```bash
node -e "const E=require('./src/utils/battleEngine');/* build two prepareBattlePokemon rows and loop performMove */"
```

There is no test runner and no linter in this repo. `package.json` has no
`test` script. Do not claim tests pass — say what you actually ran.

## Known gaps (not bugs)

**Read `HANDOVER.md` in the repo root first** — it holds the current state of the
work, the pending queue in priority order, and the full smart-AI and Z-Move
designs, which are recorded nowhere else.

Absent so far: abilities, weather, EVs, auctions, quests/achievements. The
`battles` table is created but never written to.

**Explicitly out of scope** (the user ruled these out): slash commands, and
breeding — the `next_breed_at` column exists but must stay unused.

## Visual layer

- `src/utils/scene.js` — 13 procedural backgrounds, picked by type. Drop a PNG at
  `assets/backgrounds/<key>.png` to override one with real art, no code change.
- `src/utils/canvasKit.js` — shared pill / outline / fit / HP-colour primitives.
- `src/utils/spriteCache.js` — LRU + negative TTL + in-flight dedup. **Always load
  sprites through this**, never `loadImage(url)` directly in a render path.
- `src/utils/formSprite.js` — Mega / Primal / Gmax artwork. `spriteCandidates(poke)`
  returns a chain ending at the base sprite, so a missing form never blanks a frame.
- `src/utils/battleImage.js` — GBA single-frame field. Side-object shape and layout
  are documented in `HANDOVER.md` §5.
- `src/utils/spawnImage.js` — wild-spawn card.
