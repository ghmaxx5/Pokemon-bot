const SHOP_ITEMS = {
  mega_stone: {
    id: "mega_stone",
    name: "Mega Stone",
    emoji: "💎",
    description: "A mysterious stone that allows compatible Pokemon to Mega Evolve during battle. Universal - works for all Mega-capable Pokemon and Primal Reversion.",
    price: 10000,
    category: "battle",
    holdable: true
  },
  gmax_ring: {
    id: "gmax_ring",
    name: "Gigantamax Ring",
    emoji: "💍",
    description: "A special ring that allows compatible Pokemon to Gigantamax during battle. Lasts 3 turns per use.",
    price: 8000,
    category: "battle",
    holdable: true
  },
  rare_candy: {
    id: "rare_candy",
    name: "Rare Candy",
    emoji: "🍬",
    description: "Increases a Pokemon's level by 1.",
    price: 2500,
    category: "items",
    holdable: false
  },
  xp_boost: {
    id: "xp_boost",
    name: "XP Booster",
    emoji: "⚡",
    description: "Doubles XP gain for your selected Pokemon for 1 hour.",
    price: 3000,
    category: "items",
    holdable: false
  },
  iv_stone: {
    id: "iv_stone",
    name: "IV Stone",
    emoji: "🔮",
    description: "Rerolls all IVs for a Pokemon, giving a new chance at better stats.",
    price: 15000,
    category: "items",
    holdable: false
  },
  shiny_charm: {
    id: "shiny_charm",
    name: "Shiny Charm",
    emoji: "✨",
    description: "Doubles your shiny encounter rate for the next 50 catches.",
    price: 25000,
    category: "items",
    holdable: false
  },
  nature_mint: {
    id: "nature_mint",
    name: "Nature Mint",
    emoji: "🌿",
    description: "Changes your Pokemon's nature to a random new one.",
    price: 5000,
    category: "items",
    holdable: false
  },
  lucky_egg: {
    id: "lucky_egg",
    name: "Lucky Egg",
    emoji: "🥚",
    description: "Gives a random bonus of 1,000-5,000 Cybercoins.",
    price: 3500,
    category: "items",
    holdable: false
  },
  master_ball: {
    id: "master_ball",
    name: "Master Ball",
    emoji: "🟣",
    description: "Guarantees catching the next spawned Pokemon without guessing the name.",
    price: 50000,
    category: "items",
    holdable: false
  }
};

const SHOP_CATEGORIES = {
  battle: { name: "Battle Items", emoji: "⚔️", description: "Items for Mega Evolution and Gigantamax" },
  items: { name: "Items & Consumables", emoji: "🎒", description: "Useful items for your Pokemon journey" }
};

module.exports = { SHOP_ITEMS, SHOP_CATEGORIES };
