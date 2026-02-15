# Pokemon Discord Bot (Pokétwo Clone) — Cybermon

## Overview
A premium Pokemon Discord bot inspired by Pokétwo. Features all 1025 Pokemon (Gen 1-9), Mega Evolution, Gigantamax, adaptive AI battles, moveset/learnset system, shop system, trading, market, and comprehensive trainer profiles. Currency: **Cybercoins**.

## Tech Stack
- **Runtime:** Node.js
- **Framework:** discord.js v14
- **Database:** PostgreSQL (Neon-backed via Replit)
- **Language:** JavaScript

## Project Structure
```
index.js              # Main bot entry point, command handler, spawning/XP (with move learning on level-up)
src/
├── database.js       # PostgreSQL pool + schema initialization
├── commands/
│   ├── start.js      # 2-step starter selection (region → starter, 9 regions, 27 starters)
│   ├── catch.js      # Catch wild Pokemon (Master Ball + Shiny Charm integrated)
│   ├── pokemon.js    # View collection (pagination, filters)
│   ├── info.js       # Premium Pokemon card (IVs, held items, mega/gmax compat, type, region, bigger image, equipped moves)
│   ├── select.js     # Select active Pokemon
│   ├── hint.js       # Hint for current spawn
│   ├── balance.js    # Premium wallet display with rank tiers
│   ├── favorite.js   # Toggle favorite
│   ├── nickname.js   # Set nicknames
│   ├── release.js    # Release Pokemon
│   ├── evolve.js     # Evolve Pokemon
│   ├── daily.js      # Daily reward (DB-persisted cooldown)
│   ├── give.js       # Transfer Cybercoins
│   ├── trade.js      # Trading system
│   ├── market.js     # Buy/sell marketplace
│   ├── battle.js     # 3v3 PvP + AI battles (team selection, emoji accept/reject, equipped moves, images, mega/gmax, switch)
│   ├── moves.js      # View available moves, equip moves to slots 1-4 (with replace UI)
│   ├── moveinfo.js   # Detailed move info lookup (power, accuracy, category, description)
│   ├── dex.js        # Pokedex with form buttons (shiny, mega, gmax, evolution) + form images
│   ├── leaderboard.js # Leaderboards
│   ├── order.js      # Sort collection
│   ├── server.js     # Server config (prefix, spawn channel)
│   ├── shop.js       # Item shop (9 items, hold/unhold, use, bulk buy rare candy)
│   ├── profile.js    # Comprehensive trainer profile
│   ├── admin.js      # Secret admin commands (addcoins, setcoins, addall, spawn)
│   └── help.js       # Command help
├── data/
│   ├── pokemon.json  # All 1025 Pokemon data (Gen 1-9)
│   ├── pokemonLoader.js # Pokemon data loading/querying
│   ├── types.js      # Type effectiveness chart
│   ├── moves.js      # Move data by type (18 types) + getEquippedMoves()
│   ├── learnsets.js   # Procedural learnset generation (level-gated moves per type)
│   ├── starters.js   # Starter Pokemon by region (9 regions)
│   ├── mega.js       # Mega Evolution (46), Primal (2), Gigantamax (33) data + G-Max movesets
│   └── shopItems.js  # Shop item definitions and categories
└── utils/
    └── helpers.js    # Utility functions (IVs, formatting, etc.)
```

## Key Features
- **1025 Pokemon** from all 9 generations (Gen 1-9 including Paldea)
- **Spawning System:** Pokemon appear after ~15 messages, channel-specific
- **Catching:** Identify and catch spawned Pokemon + Master Ball support
- **6-stat IV System:** HP, ATK, DEF, SpATK, SpDEF, SPD (0-31 each)
- **Leveling:** XP from chatting, level ups with move learning notifications, XP Booster support
- **Moveset System:** Pokemon learn moves at specific levels. p!moves shows all available moves. Equip any 4 into battle slots. Moves used in duels.
- **Evolution:** Auto-evolve on level-up (both XP and rare candy), item-based evolution via p!evolve
- **Shiny Pokemon:** 1/4096 chance (doubled with Shiny Charm boost)
- **Mega Evolution:** 46 Mega Pokemon + 2 Primal Reversions (Showdown-style, doesn't waste turn)
- **Gigantamax:** 33 G-Max Pokemon with full 4-move G-Max movesets per Pokemon, 3-turn duration, 1.5x HP
- **Battle System:** 3v3 PvP and AI (team selection, hidden picks, emoji accept/reject). Equipped moves, type effectiveness, mega/gmax transforms, Pokemon switching on faint.
- **AI Battles:** 3v3 against adaptive AI with team of 3 random Pokemon, level-matched, smart move selection
- **Shop System:** 9 items, bulk buy support (p!shop buy rare candy 10), immediate rare candy application
- **Held Items:** Mega Stone and G-Max Ring (1 item per Pokemon)
- **Trading:** Player-to-player trading with confirmation
- **Market:** Buy/sell Pokemon for Cybercoins
- **Pokédex:** Name-based lookup with interactive buttons for Shiny, Mega, G-Max, and Evolution forms
- **Trainer Profiles:** Comprehensive stats display
- **Pokemon Info Cards:** Type, region, bigger image, equipped moves, IVs
- **Server Config:** Custom prefix, spawn channels
- **Leaderboards:** Pokemon count, balance, shinies
- **Admin Commands:** Secret coin management + Pokemon spawning with custom IVs (p!admin cyberadmin)

## Commands (Default prefix: p!)
p!start, p!catch, p!pokemon, p!info, p!select, p!hint, p!evolve,
p!trade, p!market, p!battle, p!battle ai, p!moves, p!moveinfo, p!dex,
p!daily, p!balance, p!give, p!favorite, p!nickname, p!release,
p!leaderboard, p!server, p!shop, p!profile, p!admin, p!help

## Battle Mechanics
- **3v3 PvP:** Both trainers select 3 Pokemon. Choices hidden from opponent. Accept/reject via buttons. On faint, choose next Pokemon.
- **AI Battles:** 3v3 against adaptive AI. AI generates team of 3, player selects team, same flow as PvP.
- **Equipped Moves:** Pokemon use their 4 equipped moves in battle (p!moves to set up)
- **Switching:** In 3v3, switch active Pokemon during your turn
- **Mega Evolution:** Player selects Mega Evolve → then picks a move (doesn't waste turn)
- **Gigantamax:** All 4 normal moves replaced with G-Max moves for 3 turns. HP scales 1.5x. When G-Max ends, HP scales back proportionally.
- **Images:** Pokemon images shown during battle, changes when mega/gmax transforms

## Database Tables
- users, pokemon (with move1-move4 columns), market_listings, trades, trade_pokemon, spawns, server_config, pokedex, battles, user_inventory, user_boosts

## Environment Variables
- TOKEN: Discord bot token (secret)
- DATABASE_URL: PostgreSQL connection string
- ADMIN_SECRET: Secret passphrase for admin commands (default: cyberadmin)
- BOT_OWNER_ID: Discord user ID of bot owner (optional, for admin access)

## Recent Changes
- 2026-02-15: Added moveset/learnset system with p!moves command, level-gated move learning
- 2026-02-15: Overhauled battle to 3v3 PvP with team selection, emoji accept/reject, hidden picks, Pokemon switching
- 2026-02-15: Added bulk rare candy purchase (p!shop buy rare candy 10) with immediate application
- 2026-02-15: Added admin spawn command (p!admin cyberadmin spawn <pokemon> <iv%> <level> [shiny])
- 2026-02-15: Enhanced info card with type, region, bigger image, equipped moves display
- 2026-02-15: Move learning notifications on level-up
- 2026-02-15: Battle system uses equipped moves from DB
- 2026-02-15: Revamped Pokédex: name-based lookup with interactive buttons for Shiny, Mega, G-Max, Evolution forms
- 2026-02-15: AI battles upgraded to 3v3 (same as PvP) with team selection
- 2026-02-15: Auto-evolve on level-up (XP and rare candy)
- 2026-02-15: Move dropdown now lets you replace equipped moves when all 4 slots full
- 2026-02-15: Added p!moveinfo command for detailed move descriptions
- 2026-02-15: Dex Mega/G-Max buttons now show form-specific artwork images
