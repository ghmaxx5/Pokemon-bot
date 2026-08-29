# Cybermon — Handover

Written 2026-08-29. Read this end-to-end before touching anything. It is the only
place some of the decisions below are recorded.

Companion file: `.claude/skills/cybermon-dev/SKILL.md` — architecture, command
contract, formulas, verification recipes. This file is the *state of the work*.

---

## 1. What this is

A Discord Pokémon bot (prefix commands, `c!` by default), being raised to
feature-parity with **Pokétwo** while keeping its own unique battle system.

- **Stack:** Node.js, discord.js v14, PostgreSQL via `pg` Pool, `@napi-rs/canvas`.
- **No test runner, no linter.** Verification is by `node --check`, `require()`,
  and small purpose-written probes. Never claim "tests pass" — say what you ran.
- **Entry point:** `index.js`. Commands auto-load from `src/commands/*.js`, each
  exporting `{ name, aliases, description, execute(message, args, spawns, prefix) }`.

## 2. The standing rules the user set

These are not suggestions. They were stated explicitly.

1. **Never remove an existing feature.** No command, alias, subcommand or arg form
   may stop working. When a file is rewritten, diff the old exports and the old
   accepted inputs and keep every one. If two commands collide on an alias, pin
   the winner in `ALIAS_OVERRIDES` in `index.js` — do **not** delete the alias.
2. **Slash commands are out of scope.** Do not build them.
3. **Breeding is out of scope.** The `users.next_breed_at` column exists and must
   stay unused.
4. **Present a plan before a large implementation**, not after.
5. Mega Evolution and Gigantamax are **in-battle only, one-shot, anime-style** —
   this is deliberately different from Pokétwo and must stay that way.
6. **Do not remove the secret admin commands.** `src/commands/admin.js`
   (`description: "Secret admin commands"`) is gated by `args[0] === ADMIN_SECRET`
   and then `process.env.BOT_OWNER_ID`, which makes it look dead or unreachable in
   a read-through. It is not — it is deliberate. Subcommands that must keep
   working: `addcoins`, `setcoins`, `addall`, `spawn wild <pokemon> [iv%] [shiny]`,
   `spawn [@user] <pokemon> [iv%] [level] [shiny]`. The `/admin` web panel
   (`src/utils/adminServer.js`, mounted in `index.js`) and the `adminWildSpawn`
   client event that feeds the `spawns` map are part of the same feature. It has
   no aliases, so it is also invisible in the alias map — do not "clean it up".

## 3. Hard invariants — breaking any of these corrupts player data

1. **A Pokémon's user-facing position is its rank in `id ASC` order. Always.**
   Display sort (`c!order`) never changes it. Resolve positions with
   `getPokemonIdByPosition(userId, position)`.
2. **Nicknames survive evolution and trade evolution.** Carry `nickname` across
   every species change.
3. **Call `getPokemonLock` (`src/utils/lockHelper.js`) before mutating a Pokémon.**
4. **Coins and items move in one transaction.** Never `COMMIT` a debit before the
   effect is applied. (`shop.js` still violates this for Rare Candy at qty ≥ 2 —
   see §6.)
5. **All XP goes through `addXp`** (`src/utils/levelUpHelper.js`) so level-ups and
   evolution prompts fire.
6. **Additive changes only.** See rule 1 in §2.

## 4. Done — and how it was verified

| Area | Files | State |
|---|---|---|
| Alias resolution made deterministic | `index.js` | 28 commands, 45 aliases, 0 collisions. `h → hint` pinned. A command's own name always outranks any alias. |
| `c!order` alias restored | `src/commands/order.js` | `aliases: ["reorder", "sort"]` |
| `c!favorite` raw-id fallback | `src/commands/favorite.js` | Position first, then raw db id, so the old usage still works |
| **Trade, full rewrite** | `src/commands/trade.js` | Accept/decline step, invite + idle expiry sweeper, coins in trades, trade evolutions (24 species, Clamperl branches randomly), batched `describeSide` query, market re-check inside the settle transaction, double-settle race guarded by a `settling` status |
| **Market, full rewrite** | `src/commands/market.js` | SQL-side pagination (was loading the whole table into Node), 11 filters, 9 sorts, live-requerying page buttons, pokédex + `selected_pokemon_id` integrity on buy |
| Market uniqueness | `src/database.js` | `idx_market_listings_pokemon_unique` + `listed_at DESC` index |
| **Spawn backgrounds** | `src/utils/scene.js`, `src/utils/spawnImage.js` | 13 procedural scenes chosen by type, rarity chip, type chips, shiny halo + sparkles, event banner |
| **Sprite cache** | `src/utils/spriteCache.js` | LRU 400 + 5-min negative TTL + in-flight dedup. This was the main reason battles felt slow — every sprite was re-fetched every turn. |
| **Battle scene, full rewrite** | `src/utils/battleImage.js` | GBA single-frame layout; see §5 |
| **Mega / Gmax form artwork** | `src/utils/formSprite.js` | All 80 forms mapped to transparent PokeAPI artwork; all verified HTTP 200 |
| Spawn card wired in | `index.js` `handleSpawning` | `AttachmentBuilder` + `attachment://spawn.png`; the dead duplicate embed block was deleted |
| Shared canvas primitives | `src/utils/canvasKit.js` | `spawnImage.js` re-exports them under the old names, so nothing broke |

Verification actually run: `node --check` on every touched file; `require()` of
`battle.js`, `trade.js`, `market.js`, `spawnImage.js`; the command-shape loader
sweep; `market.parseFilters`/`buildWhere` across 7 input shapes; all 13 scenes
rendered; 7 spawn cards rendered; 3 battle frames rendered (normal, Mega vs Gmax
with 3v3 dots and statuses, fainted + Primal) with `spriteCache.stats()` showing
0 failures.

## 5. The battle image contract

`generateBattleImage(p1, p2, p1ImageUrl, p2ImageUrl, opts)` — 800×400 PNG.

Layout (GBA convention, this is what the user asked for explicitly):

```
┌──────────────────────────────────────────────┐
│ [FOE HP BOX]        TURN n      ( foe )      │
│  foe type chips                ══platform══  │
│        ( player )              player types  │
│      ═══platform═══           [PLAYER HP BOX]│
└──────────────────────────────────────────────┘
```

- `p1` = the viewer's Pokémon → **bottom-left, larger, mirrored** so it reads as
  facing away. `p2` = the foe → **top-right, smaller, raised platform**.
- Per-side fields: `currentHp, maxHp, displayName, level` required; optional
  `teamDots, types, status, confusedTurns, stages, shiny, megaEvolved, isPrimal,
  gmaxed, gmaxTurns, zPowered, protecting, charging, mustRecharge, spriteUrls`.
- `opts`: `{ turn, sceneKey, seed }`.
- `p1ImageUrl` / `p2ImageUrl` are the **original positional args, still honoured**
  as a single-URL fallback when `spriteUrls` is absent. Do not remove them.
- Build the side objects with `fieldSide(poke, dots)` in `battle.js` — it maps
  engine state to renderer fields in one place.
- The scene is chosen **once per battle** in `prepareScene(battle)`, keyed off the
  channel id, so switching Pokémon does not swap the background. `prepareScene`
  is called from both `registerBattle` (before teams exist) and after the teams
  load, because the first call can't see them.
- `prepareScene` also **prefetches the Mega and Gmax artwork of every team member**
  so the turn a form change happens the new model is already cached.

### Mega / Gmax sprites — the trap that was fixed

The old code guessed `img.pokemondb.net/artwork/large/<species>-mega.jpg`. Three
bugs: Charizard and Mewtwo megas are `-mega-x`/`-mega-y` so they 404'd; it used
the species name instead of the form name; and pokemondb artwork is **JPG with a
solid white background**, which drew as a white box over the scene.

`src/utils/formSprite.js` maps every form in `src/data/mega.js` to its PokeAPI
alternate-form id (transparent PNG, same source as the base sprites).
`spriteCandidates(poke)` returns an ordered chain that **always ends at the plain
species sprite**, so a missing form degrades to the base Pokémon rather than an
empty frame. If you add a Mega or Gmax to `src/data/mega.js`, add its form id to
`MEGA_ART` / `GMAX_ART` — find it at
`https://pokeapi.co/api/v2/pokemon?limit=3000` and confirm
`.../official-artwork/<id>.png` returns 200.

## 6. Pending work, in the user's priority order

### 6.1 Smart battle AI — `src/utils/battleAI.js` (not yet created)

The user asked for an AI that "should be super smarter like human". This design
was presented and accepted in conversation; it exists nowhere else. Current AI
lives inline in `battle.js` around `collectTurnAI` (line ~795) and is shallow.

Seven points, all required:

1. **Real numbers, not heuristics.** Score every move with `E.computeDamage`, the
   same function the engine uses to resolve it. No type-chart guessing.
2. **A belief model, not omniscience.** The AI must not read the player's exact
   moves, IVs or HP. Seed beliefs from the opponent's *type* priors, then update
   from what it has actually observed (moves used, damage taken, revealed
   statuses). Store this on the battle object so it persists across turns.
3. **Two-way turns-to-KO.** Compute how many turns it needs to KO, and how many
   the opponent needs to KO it, and factor in who moves first (`E.getSpeed`,
   priority). Racing when it loses the race is the mistake to avoid.
4. **Bench matchup scoring with a switch cost.** Score each benched Pokémon
   against the current foe, subtract a cost for the free turn a switch gives away,
   and **never switch into a predicted KO**.
5. **Timing rules for status / setup / Protect / PP.** Don't burn a physical
   attacker that's already at low HP; don't set up when it will be KO'd first;
   don't Protect twice in a row (the engine already tracks `protectStreak`);
   keep PP for the move that matters.
6. **One-shot resource timing.** Mega early, on a Pokémon that will stay in.
   Gmax when it can extract the full 3 turns *or* when it needs the HP to survive.
   Z-Move to convert a non-KO into a KO.
7. **A persistent `plan` and a `skill` dial.** `plan ∈ {racing, setting-up,
   stalling, pivoting}` carried across turns so the AI is coherent instead of
   re-deciding from scratch. A `skill` value introduces deliberate human error at
   lower difficulty. Add anti-loop guards (no switch ping-pong).

### 6.2 Z-Moves — in-battle only, mirroring Mega/Gmax exactly

The user's words: "only z move is missing only ig to be added". It must follow the
existing anime-style pattern — **once per battle, in battle only**:

- Held-item gate like `mega_stone` / `gmax_ring` → add a Z-Ring/Z-Crystal item to
  `src/data/shopItems.js`.
- `prepareBattlePokemon` in `src/utils/battleEngine.js` sets `canZMove` from the
  held item, plus `zUsed` / `zPowered` state.
- One-use-per-battle enforcement, damage multiplier, engine support in
  `performMove`.
- A button in `battle.js` next to the existing Mega/Gmax buttons.
- **The renderer already supports it:** pass `zPowered: true` on the side object
  and `battleImage.js` draws the cyan Z-POWER aura and badge (`AURA.zmove`).
  `fieldSide` already forwards `poke.zPowered`.

### 6.3 Polish list

- **`shop.js`** — make `use`/`hold`/`unhold` transactional. **Rare Candy at
  qty ≥ 2 COMMITs the coin debit before applying the levels** — qty 1 and qty ≥ 2
  take different paths and must not. Hand-held Color Pouch leaks in `unhold`.
  Wire the new `evolution` category. Add `shop sell`. Make `nature_mint` target a
  chosen stat.
- **`dex.js`** — the O(n²) evolution map is rebuilt on every button press; cache it.
  De-duplicate the `getRegion` helper shared with `info.js`. Fix the duplicated
  "Rarity" field.
- **`moves.js` (command)** — de-dupe equipped moves; page the quick-equip select
  (Discord caps a select at 25); allow `moves set` with a position; stop mixing an
  ephemeral `editReply` with a public `reply.edit`.
- **`info.js` / `profile.js`** — surface nature with stat arrows, and rarity tier.
- **`catch.js`** — surface the rarity tier on catch.
- **`index.js`** — `messageCounts`, `spawnCooldowns` and `xpCooldowns` are
  unbounded Maps; bound them. Cache the per-message prefix and ban lookups. Drop
  the now-unused `xpForLevel` import.
- **`hint.js`** — the hint is random per call, so spamming `c!hint` reveals the
  whole name. Seed it by pokémon id + channel id so it's deterministic.
- **`help.js`** — document `c!order`, the expanded `c!pokemon` and `c!market`
  flags, `c!shop evolution`, and the new trade subcommands.
- Optional: add `flinch` to Rock Slide / Iron Head / Air Slash / Waterfall / Zen
  Headbutt in `src/data/moves.js` — the engine supports flinch but no move uses it.

### 6.4 Not greenlit — do not start without asking

Abilities, weather, EVs, auctions, quests/achievements. The `battles` table is
created but never written to.

## 7. Gotchas that have already cost time

- **Never put a backtick in a comment inside a template literal.** A SQL comment
  in `src/database.js` mentioning a command name in backticks terminated the
  `client.query(\`…\`)` template and broke every module that requires the database.
- **`getAllPokemon()` returns a `Map` keyed by id, not an array.** Materialise it:
  `[...getAllPokemon().values()]`. `market.js` caches this in `allSpecies()`.
- **Read `battle.p1Active` / `p2Active` fresh inside turn resolution** — they
  change mid-turn on a faint or switch.
- A mutual wipe is a **draw**; roll a battle reward **once**, not per winner.
- `mega.js` `statBoost` values are raw additions to **base stats**, tracked
  separately as `baseBoosts`. They are not stat stages. Stages clamp at ±6.
- Charge moves store the move **object**, not its name.
- Gmax ticks down at the **end** of a turn.
- `ctx.filter = "grayscale(100%)"` works in `@napi-rs/canvas` (used for fainted).
- Scenery must be seeded (`S.makeRng` / `S.seedFrom`) — `Math.random()` would make
  the background jitter between turns of the same battle.

## 8. Verification recipes

```bash
# syntax sweep
for f in index.js src/**/*.js; do node --check "$f" || echo "FAIL $f"; done

# every command still loads, and no alias collides
node -e "const fs=require('fs'),p=require('path');const n=new Set(),a=new Map();for(const f of fs.readdirSync('src/commands').filter(x=>x.endsWith('.js'))){const c=require('./src/commands/'+f);if(!c.name||typeof c.execute!=='function')console.log('BAD SHAPE',f);n.add(c.name);for(const al of c.aliases||[]){if(a.has(al))console.log('COLLISION',al,a.get(al),c.name);a.set(al,c.name)}}console.log('commands',n.size,'aliases',a.size)"

# render a battle frame (see §5 for the side-object shape)
node -e "require('./src/utils/battleImage').generateBattleImage({currentHp:100,maxHp:100,displayName:'A',level:50,types:['fire']},{currentHp:80,maxHp:100,displayName:'B',level:50,types:['water']},null,null,{turn:1}).then(b=>console.log('bytes',b.length))"
```

Network **is** available in this environment (`fetch`, `loadImage` from a URL),
and `fs.writeFileSync` from `node -e` works.

## 9. Uncommitted state

Everything above is **working-tree only — nothing has been committed.** `git
status` at handover shows modified: `index.js`, `src/commands/battle.js`,
`src/data/learnsets.js`, `src/data/moves.js`, `src/data/pokemonLoader.js`,
`src/utils/levelUpHelper.js`, plus the rewritten `trade.js`, `market.js`,
`database.js`; and new untracked: `src/data/natures.js`, `src/data/rarity.js`,
`src/utils/battleEngine.js`, `src/utils/lockHelper.js`, `src/utils/statCalc.js`,
`src/utils/scene.js`, `src/utils/spriteCache.js`, `src/utils/spawnImage.js`,
`src/utils/canvasKit.js`, `src/utils/formSprite.js`.

`.preview_battle.png`, `.preview_scenes.png`, `.preview_spawns.png` in the repo
root are throwaway render previews — safe to delete.

Optional art hook: drop a real painting at `assets/backgrounds/<scene>.png` and
`scene.js` uses it in place of the procedural scene, no code change. Scene keys:
`meadow forest shore volcano tundra canyon storm aurora graveyard peaks foundry
skyfield arena`.
