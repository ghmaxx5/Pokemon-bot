# Pokemon Discord Bot (Pokétwo Clone) — Cybermon

## Overview
A premium Pokemon Discord bot inspired by Pokétwo. Features all 1025 Pokemon (Gen 1-9), Mega Evolution, Gigantamax, adaptive AI battles, shop system, trading, market, and comprehensive trainer profiles. Currency: **Cybercoins**.

## Tech Stack
- **Runtime:** Node.js
- **Framework:** discord.js v14
- **Database:** PostgreSQL (Neon-backed via Replit)
- **Language:** JavaScript

## Project Structure
```
index.js              # Main bot entry point, command handler, spawning/XP (with XP Booster integration)
src/
├── database.js       # PostgreSQL pool + schema initialization
├── commands/
│   ├── start.js      # 2-step starter selection (region → starter, 9 regions, 27 starters)
│   ├── catch.js      # Catch wild Pokemon (Master Ball + Shiny Charm integrated)
│   ├── pokemon.js    # View collection (pagination, filters)
│   ├── info.js       # Premium Pokemon info (IVs, held items, mega/gmax compat, XP bar)
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
│   ├── battle.js     # PvP + AI battle system (images, mega, gmax full moveset)
│   ├── dex.js        # Pokedex
│   ├── leaderboard.js # Leaderboards
│   ├── order.js      # Sort collection
│   ├── server.js     # Server config (prefix, spawn channel)
│   ├── shop.js       # Item shop (9 items, hold/unhold, use)
│   ├── profile.js    # Comprehensive trainer profile
│   ├── admin.js      # Secret admin commands (addcoins, setcoins, addall)
│   └── help.js       # Command help
├── data/
│   ├── pokemon.json  # All 1025 Pokemon data (Gen 1-9)
│   ├── pokemonLoader.js # Pokemon data loading/querying
│   ├── types.js      # Type effectiveness chart
│   ├── moves.js      # Move data by type (18 types)
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
- **Leveling:** XP from chatting, level ups with notifications, XP Booster support
- **Evolution:** Level-based and item-based evolution
- **Shiny Pokemon:** 1/4096 chance (doubled with Shiny Charm boost)
- **Mega Evolution:** 46 Mega Pokemon + 2 Primal Reversions (Showdown-style, doesn't waste turn)
- **Gigantamax:** 33 G-Max Pokemon with full 4-move G-Max movesets per Pokemon, 3-turn duration, 1.5x HP
- **Battle System:** Turn-based PvP + AI battles with Pokemon images, type effectiveness, mega/gmax transforms
- **AI Battles:** Adaptive difficulty AI that picks from all 1025 Pokemon, level-matched, smart move selection
- **Shop System:** 9 items across battle items and consumables
- **Held Items:** Mega Stone and G-Max Ring (1 item per Pokemon)
- **Trading:** Player-to-player trading with confirmation
- **Market:** Buy/sell Pokemon for Cybercoins
- **Pokedex:** Track caught species
- **Trainer Profiles:** Comprehensive stats display
- **Server Config:** Custom prefix, spawn channels
- **Leaderboards:** Pokemon count, balance, shinies
- **Admin Commands:** Secret coin management (p!admin cyberadmin)

## Commands (Default prefix: p!)
p!start, p!catch, p!pokemon, p!info, p!select, p!hint, p!evolve,
p!trade, p!market, p!battle, p!battle ai, p!dex, p!daily, p!balance,
p!give, p!favorite, p!nickname, p!release, p!leaderboard, p!server,
p!shop, p!profile, p!admin, p!help

## Battle Mechanics
- **Mega Evolution:** Player selects Mega Evolve → then picks a move (doesn't waste turn)
- **Gigantamax:** All 4 normal moves replaced with G-Max moves for 3 turns. HP scales 1.5x. When G-Max ends, HP scales back proportionally and moves revert.
- **AI Battles:** AI adapts to player level (±5 levels). Higher difficulty = smarter move selection based on type effectiveness and STAB. AI can also Mega/G-Max.
- **Images:** Pokemon images shown during battle, changes when mega/gmax transforms

## Database Tables
- users, pokemon, market_listings, trades, trade_pokemon, spawns, server_config, pokedex, battles, user_inventory, user_boosts

## Environment Variables
- TOKEN: Discord bot token (secret)
- DATABASE_URL: PostgreSQL connection string

## Recent Changes
- 2026-02-15: Added secret admin command, premium balance display, full battle overhaul with images and AI
- 2026-02-15: G-Max moves expanded to full 4-move sets with accuracy per Pokemon
- 2026-02-15: Integrated consumable items (Master Ball, Shiny Charm, XP Booster) into catch/XP flows
- 2026-02-15: Fixed Gigantamax HP restoration bug
