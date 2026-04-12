# 🎮 Cybermon

> A feature-rich Pokémon Discord bot inspired by Pokétwo — catch, battle, trade, and collect Pokémon right inside your Discord server.

<div align="center">

![Discord](https://img.shields.io/badge/Discord-Bot-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

</div>

---

## ✨ Features

- 🌿 **Wild Spawns** — Pokémon appear as members chat in any channel, spawning in your configured spawn channel(s)
- ⚔️ **3v3 Battles** — Challenge other trainers or fight AI with full move mechanics
- 🔁 **Trading System** — Trade Pokémon between users with a secure confirmation flow
- 🏪 **Market** — List, browse, and buy Pokémon from other trainers
- 💎 **Mega Evolution & Gigantamax** — Battle transformations with unique move sets
- ✨ **Shiny Pokémon** — Hidden in wild spawns, revealed only on catch (Pokétwo-style suspense)
- 🎉 **Event Pokémon** — Special limited Pokémon like Holi Spirit Greninja with unique signature moves and locked held items
- 🛒 **Shop System** — Buy items, Mega Stones, Gigantamax Rings, Shiny Charms, and more
- 📖 **Pokédex** — Full dex with Normal / Shiny / Mega / G-Max tabs and catchable status
- 🔢 **Navigation Arrows** — Browse your Pokémon collection with ◀ ▶ buttons (like Pokétwo)
- 🏓 **Adaptive Ping** — Real-feel latency display that edits itself like Pokétwo
- ⚙️ **Multi-Channel Spawns** — Configure multiple spawn channels; each gets a different random Pokémon
- 🔐 **Admin Tools** — Spawn wild Pokémon with custom IV% and shiny, send coin rewards with DM notifications

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [PostgreSQL](https://www.postgresql.org/) database
- A Discord bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

### Installation

```bash
# Clone the repository
git clone https://github.com/ghmaxx5/Pokemon-bot.git
cd Pokemon-bot

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the root directory:

```env
TOKEN=your_discord_bot_token_here
DATABASE_URL=postgresql://user:password@localhost:5432/cybermon
ADMIN_SECRET=your_secret_admin_password
```

### Running the Bot

```bash
node index.js
```

---

## 📋 Commands

All commands use the `p!` prefix by default (configurable per server).

### 🌟 Getting Started
| Command | Description |
|---|---|
| `p!start` | Begin your Pokémon journey & pick a starter |
| `p!daily` | Claim your daily Cybercoin reward |
| `p!profile` | View your trainer profile |
| `p!ping` | Check bot latency & status |
| `p!help` | Paginated help menu with all commands |

### 🎮 Pokémon
| Command | Description |
|---|---|
| `p!catch <name>` | Catch a wild Pokémon (spaces or dashes both work) |
| `p!hint` | Get a hint for the current wild Pokémon |
| `p!pokemon` | View your Pokémon collection |
| `p!info <id>` | Detailed info with ◀ ▶ navigation arrows |
| `p!select <id>` | Set your active Pokémon |
| `p!favorite <id>` | Toggle favorite on a Pokémon |
| `p!nickname <id> <name>` | Give a Pokémon a nickname |
| `p!release <id>` | Release a Pokémon permanently |
| `p!evolve` | Evolve your active Pokémon |
| `p!dex <name/id>` | Pokédex entry with form tabs |

**Collection Filters for `p!pokemon`:**
```
--shiny  --fav  --legendary  --mythical
--type <type>  --name <name>  --iv  --level
```

### ⚔️ Battling
| Command | Description |
|---|---|
| `p!battle @user` | Challenge a trainer to a 3v3 battle |
| `p!battle ai` | Fight an AI trainer |
| `p!moves <id>` | View & equip moves for a Pokémon |
| `p!moves set <slot> <move>` | Equip a move to slot 1–4 |
| `p!moveinfo <move>` | Detailed move info |

### 💰 Economy & Shop
| Command | Description |
|---|---|
| `p!balance` | Check your Cybercoin balance |
| `p!give @user <amount>` | Send Cybercoins to another user |
| `p!shop` | Browse all items |
| `p!shop buy <item>` | Purchase an item |
| `p!shop hold <item> <id>` | Give an item to a Pokémon to hold |
| `p!shop unhold <id>` | Remove a held item |
| `p!inventory` | View your backpack |

### 🏪 Market & Trading
| Command | Description |
|---|---|
| `p!market` | Browse all listings |
| `p!market list <id> <price>` | List a Pokémon for sale |
| `p!market buy <listing>` | Buy a listed Pokémon |
| `p!market remove <listing>` | Remove your listing |
| `p!market search <name>` | Search by Pokémon name |
| `p!trade @user` | Initiate a trade |
| `p!trade add <id>` | Add a Pokémon to the trade |
| `p!trade confirm` | Confirm the trade |
| `p!trade cancel` | Cancel the trade |

### ⚙️ Server Settings
*(Requires Manage Server permission)*

| Command | Description |
|---|---|
| `p!server` | View current server configuration |
| `p!server prefix <prefix>` | Change the command prefix |
| `p!server spawn add #channel` | Add a Pokémon spawn channel |
| `p!server spawn remove #channel` | Remove a spawn channel |
| `p!server spawn list` | List all configured spawn channels |
| `p!server spawn reset` | Spawn in all channels (no redirect) |

### 🔐 Admin Commands
*(Requires the admin secret set in `.env`)*

```
p!admin <secret> addcoins @user <amount> [reason]
p!admin <secret> setcoins @user <amount> [reason]
p!admin <secret> addall <amount>
p!admin <secret> spawn wild <pokemon> [iv%] [shiny]
p!admin <secret> spawn @user <pokemon> [iv%] [level] [shiny]
```

**Coin commands DM the user automatically** with a Cybermon Team notification showing the change, new balance, and optional reason message.

**`spawn wild` examples:**
```
p!admin cyberadmin spawn wild charizard
p!admin cyberadmin spawn wild charizard 100 shiny
p!admin cyberadmin spawn wild holi spirit greninja shiny
p!admin cyberadmin spawn wild eternatus 85
```

---

## 🌟 Special Features

### Event Pokémon
Event Pokémon like **Holi Spirit (Greninja)** spawn at a 2% rate alongside normal spawns. They come with:
- Signature moves auto-equipped on catch
- Locked held items (cannot be removed)
- Caught at Level 100 always
- Special pink embed on spawn
- Catchable by base form name or full event name

### Mega Evolution & Gigantamax
- Hold a **Mega Stone** → press Mega button in battle
- Hold a **G-Max Ring** → press G-Max button in battle
- Hold a **Primal Orb** → Primal Reversion for Kyogre/Groudon
- **Eternamax Eternatus** has the Eternabeam recharge mechanic (skip next turn)
- All forms show correct artwork in dex and in battle

### Multi-Channel Spawning
- Chat from **any channel** counts toward the spawn threshold
- Pokémon spawns in your configured channel(s)
- Each configured channel gets a **different random Pokémon**
- Up to unlimited spawn channels per server

### Shiny System
- Shiny Pokémon are hidden in wild spawns — normal image shown
- Shiny revealed only in the catch confirmation message
- Shiny Charm item boosts shiny rate from 1/4096 to 1/2048
- Admin can force-spawn shinies with the `shiny` flag

---

## 🗃️ Database Schema

Cybermon uses **PostgreSQL** with the following core tables:

- `users` — Trainer profiles, balances, selected Pokémon
- `pokemon` — Individual Pokémon with IVs, nature, moves, held items
- `server_config` — Per-guild prefix and legacy spawn channel
- `spawn_channels` — Multi-channel spawn configuration
- `market_listings` — Active market listings
- `trades` / `trade_pokemon` — Active trades
- `user_inventory` — Items owned by trainers
- `user_boosts` — Active boosts (Shiny Charm, etc.)
- `pokedex` — Caught Pokémon dex tracking
- `battles` — Battle history

---

## 🛠️ Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Discord Library | discord.js v14 |
| Database | PostgreSQL |
| Image Generation | @napi-rs/canvas |
| Pokémon Data | PokeAPI sprites + custom JSON |

---

## 📁 Project Structure

```
Pokemon-bot/
├── index.js                 # Main bot entry, spawn logic, message handler
├── src/
│   ├── commands/            # All command files
│   │   ├── catch.js         # Wild Pokémon catching
│   │   ├── battle.js        # PvP & AI battles
│   │   ├── dex.js           # Pokédex with form tabs
│   │   ├── info.js          # Pokémon info with navigation
│   │   ├── trade.js         # Trading system
│   │   ├── market.js        # Market listings
│   │   ├── shop.js          # Item shop
│   │   ├── admin.js         # Admin-only commands
│   │   ├── server.js        # Server configuration
│   │   ├── help.js          # Paginated help menu
│   │   ├── ping.js          # Adaptive latency display
│   │   └── ...              # Other commands
│   ├── data/
│   │   ├── pokemon.json     # Pokémon stats, types, events
│   │   ├── moves.js         # Move pool by type
│   │   ├── learnsets.js     # Per-Pokémon move overrides
│   │   ├── mega.js          # Mega/Gmax/Primal data
│   │   ├── shopItems.js     # Shop item definitions
│   │   └── pokemonLoader.js # Data access layer
│   ├── utils/
│   │   ├── helpers.js       # Shared utility functions
│   │   └── battleImage.js   # Battle image generation
│   └── database.js          # DB init & connection pool
├── assets/
│   └── event/               # Custom event Pokémon artwork
└── .env                     # Environment variables (not committed)
```

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Credits

- Pokémon data and sprites from [PokéAPI](https://pokeapi.co/)
- Inspired by [Pokétwo](https://poketwo.net/)
- Built with [discord.js](https://discord.js.org/)

---

<div align="center">
  <b>Made with ❤️ by the Cybermon Team</b><br>
  <i>Gotta catch 'em all!</i>
</div>
