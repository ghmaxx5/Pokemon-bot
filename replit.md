# Pokemon Discord Bot (Pokétwo Clone)

## Overview
A full-featured Pokemon Discord bot inspired by Pokétwo. Supports catching, battling, trading, market, evolution, and much more with all 898 Pokemon (Gen 1-8).

## Tech Stack
- **Runtime:** Node.js
- **Framework:** discord.js v14
- **Database:** PostgreSQL (Neon-backed via Replit)
- **Language:** JavaScript

## Project Structure
```
index.js              # Main bot entry point, command handler, spawning/XP
src/
├── database.js       # PostgreSQL pool + schema initialization
├── commands/         # All bot commands
│   ├── start.js      # Starter selection (all 8 regions)
│   ├── catch.js      # Catch wild Pokemon
│   ├── pokemon.js    # View collection (pagination, filters)
│   ├── info.js       # Detailed Pokemon info (IVs, stats)
│   ├── select.js     # Select active Pokemon
│   ├── hint.js       # Hint for current spawn
│   ├── balance.js    # Check credits
│   ├── favorite.js   # Toggle favorite
│   ├── nickname.js   # Set nicknames
│   ├── release.js    # Release Pokemon
│   ├── evolve.js     # Evolve Pokemon
│   ├── daily.js      # Daily reward
│   ├── give.js       # Transfer credits
│   ├── trade.js      # Trading system
│   ├── market.js     # Buy/sell marketplace
│   ├── battle.js     # PvP battle system
│   ├── dex.js        # Pokedex
│   ├── leaderboard.js # Leaderboards
│   ├── order.js      # Sort collection
│   ├── server.js     # Server config (prefix, spawn channel)
│   └── help.js       # Command help
├── data/
│   ├── pokemon.json  # All 898 Pokemon data (from PokeAPI)
│   ├── pokemonLoader.js # Pokemon data loading/querying
│   ├── types.js      # Type effectiveness chart
│   ├── moves.js      # Move data by type
│   └── starters.js   # Starter Pokemon by region
└── utils/
    └── helpers.js    # Utility functions (IVs, formatting, etc.)
```

## Key Features
- **898 Pokemon** from all 8 generations
- **Spawning System:** Pokemon appear after ~15 messages, channel-specific
- **Catching:** Identify and catch spawned Pokemon
- **6-stat IV System:** HP, ATK, DEF, SpATK, SpDEF, SPD (0-31 each)
- **Leveling:** XP from chatting, level ups with notifications
- **Evolution:** Level-based and item-based evolution
- **Shiny Pokemon:** 1/4096 chance
- **Trading:** Player-to-player trading with confirmation
- **Market:** Buy/sell Pokemon for credits
- **Battling:** Turn-based PvP with type effectiveness, moves, damage calc
- **Pokedex:** Track caught species
- **Server Config:** Custom prefix, spawn channels
- **Leaderboards:** Pokemon count, balance, shinies

## Commands (Default prefix: p!)
p!start, p!catch, p!pokemon, p!info, p!select, p!hint, p!evolve,
p!trade, p!market, p!battle, p!dex, p!daily, p!balance, p!give,
p!favorite, p!nickname, p!release, p!leaderboard, p!server, p!help

## Database Tables
- users, pokemon, market_listings, trades, trade_pokemon, spawns, server_config, pokedex, battles

## Environment Variables
- TOKEN: Discord bot token (secret)
- DATABASE_URL: PostgreSQL connection string
