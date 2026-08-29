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
  z_ring: {
    id: "z_ring",
    name: "Z-Ring",
    emoji: "⚡",
    description: "A mysterious ring set with a Z-Crystal. Allows any Pokémon to unleash a devastating Z-Power move once per battle.",
    price: 12000,
    category: "battle",
    holdable: true
  },
  hand_held_color_pouch: {
    id: "hand_held_color_pouch",
    name: "Hand-held Color Pouch",
    emoji: "🎨",
    description: "A pouch filled with vibrant Holi colors. Exclusive to Holi Spirit Greninja — boosts the power of Fairy and Water moves by 20% in battle.",
    price: 0,
    category: "event",
    holdable: true,
    eventOnly: true
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

const EVOLUTION_ITEMS = {
  "fire-stone":       { name: "Fire Stone",       emoji: "🔥", price: 6000 },
  "water-stone":      { name: "Water Stone",      emoji: "💧", price: 6000 },
  "thunder-stone":    { name: "Thunder Stone",    emoji: "⚡", price: 6000 },
  "leaf-stone":       { name: "Leaf Stone",       emoji: "🍃", price: 6000 },
  "moon-stone":       { name: "Moon Stone",       emoji: "🌙", price: 6000 },
  "sun-stone":        { name: "Sun Stone",        emoji: "☀️", price: 6000 },
  "shiny-stone":      { name: "Shiny Stone",      emoji: "🌟", price: 7000 },
  "dusk-stone":       { name: "Dusk Stone",       emoji: "🌑", price: 7000 },
  "dawn-stone":       { name: "Dawn Stone",       emoji: "🌅", price: 7000 },
  "ice-stone":        { name: "Ice Stone",        emoji: "❄️", price: 7000 },
  "black-augurite":   { name: "Black Augurite",   emoji: "🪨", price: 9000 },
  "peat-block":       { name: "Peat Block",       emoji: "🟫", price: 9000 },
  "tart-apple":       { name: "Tart Apple",       emoji: "🍏", price: 9000 },
  "sweet-apple":      { name: "Sweet Apple",      emoji: "🍎", price: 9000 },
  "cracked-pot":      { name: "Cracked Pot",      emoji: "🫖", price: 9000 },
  "auspicious-armor": { name: "Auspicious Armor", emoji: "🛡️", price: 9000 },
  "malicious-armor":  { name: "Malicious Armor",  emoji: "🗡️", price: 9000 }
};

// Evolution stones are generated from the table above so the shop can never
// drift out of sync with the items pokemon.json actually asks for.
for (const [id, def] of Object.entries(EVOLUTION_ITEMS)) {
  SHOP_ITEMS[id] = {
    id,
    name: def.name,
    emoji: def.emoji,
    description: `Use it on a compatible Pokémon to make it evolve. Consumed on use.`,
    price: def.price,
    category: "evolution",
    holdable: false,
    isEvolutionItem: true
  };
}

const SHOP_CATEGORIES = {
  battle:    { name: "Battle Items", emoji: "⚔️", description: "Items for Mega Evolution, Gigantamax, and Z-Moves" },
  evolution: { name: "Evolution Items", emoji: "🪨", description: "Stones and treasures that trigger evolutions" },
  items:     { name: "Items & Consumables", emoji: "🎒", description: "Useful items for your Pokémon journey" },
  // Event items can't be bought, but they still need a category so that
  // `c!inventory` and `c!shop hold` can render them instead of silently
  // dropping them.
  event:     { name: "Event Items", emoji: "🎊", description: "Limited items from special events — not for sale" }
};

/** The shop only lists categories that have at least one purchasable item. */
function getPurchasableItems(category) {
  return Object.values(SHOP_ITEMS).filter(
    i => i.category === category && !i.eventOnly && i.price > 0
  );
}

module.exports = { SHOP_ITEMS, SHOP_CATEGORIES, EVOLUTION_ITEMS, getPurchasableItems };
