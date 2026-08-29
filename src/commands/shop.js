const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { SHOP_ITEMS, SHOP_CATEGORIES, getPurchasableItems } = require("../data/shopItems");
const { getPokemonById, getPokemonByName } = require("../data/pokemonLoader");
const { capitalize, generateIVs, randomNature, totalIV } = require("../utils/helpers");
const { getPokemonLock } = require("../utils/lockHelper");
const { getPokemonIdByPosition } = require("../utils/positionHelper");
const { NATURE_MODIFIERS } = require("../data/natures");

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply(`You haven't started yet! Use \`${prefix}start\` to begin.`);

  if (!args.length) {
    return showShop(message, user.rows[0], prefix);
  }

  const subcommand = args[0].toLowerCase();

  if (subcommand === "buy") {
    if (!args[1]) return message.reply(`Usage: \`${prefix}shop buy <item name> [quantity]\`\nUse \`${prefix}shop\` to see available items.`);

    const lastArg = args[args.length - 1];
    let quantity = 1;
    let nameArgs = args.slice(1);

    if (!isNaN(lastArg) && parseInt(lastArg) > 0 && args.length > 2) {
      quantity = parseInt(lastArg);
      nameArgs = args.slice(1, -1);
    }

    const itemKey = nameArgs.join("_").toLowerCase().replace(/\s+/g, "_");
    const itemNameLower = nameArgs.join(" ").toLowerCase();
    const item = Object.values(SHOP_ITEMS).find(i =>
      i.id === itemKey || i.name.toLowerCase() === itemNameLower
    );

    if (!item) return message.reply(`Item not found! Use \`${prefix}shop\` to see available items.`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lockUser = await client.query("SELECT balance, selected_pokemon_id FROM users WHERE user_id = $1 AND started = TRUE FOR UPDATE", [userId]);
      if (lockUser.rows.length === 0) {
        await client.query("ROLLBACK");
        return message.reply("You haven't started yet!");
      }
      const userBalance = lockUser.rows[0].balance;

      const totalCost = item.price * quantity;

      if (item.id === "rare_candy" && quantity > 1) {
        const selectedId = lockUser.rows[0].selected_pokemon_id;
        if (!selectedId) {
          await client.query("ROLLBACK");
          return message.reply(`Select a Pokemon first to use Rare Candies! Use \`${prefix}select <id>\`.`);
        }

        const poke = await client.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE", [selectedId, userId]);
        if (poke.rows.length === 0) {
          await client.query("ROLLBACK");
          return message.reply("Selected Pokemon not found.");
        }
        if (poke.rows[0].level >= 100) {
          await client.query("ROLLBACK");
          return message.reply("That Pokemon is already max level!");
        }

        const currentLevel = poke.rows[0].level;
        const levelsToAdd = Math.min(quantity, 100 - currentLevel);
        const actualCost = item.price * levelsToAdd;

        if (userBalance < actualCost) {
          await client.query("ROLLBACK");
          return message.reply(`You need **${actualCost.toLocaleString()}** Cybercoins for ${levelsToAdd} Rare Candies but only have **${userBalance.toLocaleString()}**!`);
        }

        await client.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [actualCost, userId]);
        await client.query("COMMIT");

        const { levelUpPokemon } = require("../utils/levelUpHelper");
        await levelUpPokemon(userId, selectedId, levelsToAdd, message.channel);
        return;
      }

      if (userBalance < totalCost) {
        await client.query("ROLLBACK");
        return message.reply(`You need **${totalCost.toLocaleString()}** Cybercoins (${quantity}x ${item.name}) but only have **${userBalance.toLocaleString()}**!`);
      }

      await client.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [totalCost, userId]);
      await client.query(
        `INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + $3`,
        [userId, item.id, quantity]
      );
      await client.query("COMMIT");

      const embed = new EmbedBuilder()
        .setTitle(`${item.emoji} Item Purchased!`)
        .setDescription(`You bought **${quantity}x ${item.name}** for **${totalCost.toLocaleString()}** Cybercoins!\n\nNew balance: **${(userBalance - totalCost).toLocaleString()}** Cybercoins`)
        .setColor(0x2ecc71);

      return message.channel.send({ embeds: [embed] });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Purchase failed. Please try again.");
    } finally {
      client.release();
    }
  }

  // ── SELL ──────────────────────────────────────────────────────────────
  if (subcommand === "sell") {
    if (args.length < 2) return message.reply(`Usage: \`${prefix}shop sell <item name> [quantity]\``);

    const lastArg = args[args.length - 1];
    let quantity = 1;
    let nameArgs = args.slice(1);

    if (!isNaN(lastArg) && parseInt(lastArg, 10) > 0 && args.length > 2) {
      quantity = parseInt(lastArg, 10);
      nameArgs = args.slice(1, -1);
    }

    const itemKey = nameArgs.join("_").toLowerCase().replace(/\s+/g, "_");
    const itemNameLower = nameArgs.join(" ").toLowerCase();
    const item = Object.values(SHOP_ITEMS).find(i =>
      i.id === itemKey || i.name.toLowerCase().replace(/\s+/g, "_") === itemKey || i.name.toLowerCase() === itemNameLower
    );

    if (!item) return message.reply("Item not found!");
    if (item.eventOnly || item.price <= 0) return message.reply("This item cannot be sold!");

    const sellPricePerUnit = Math.floor(item.price * 0.5);
    const totalPayout = sellPricePerUnit * quantity;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inv = await client.query(
        "SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE",
        [userId, item.id]
      );
      if (inv.rows.length === 0 || inv.rows[0].quantity < quantity) {
        await client.query("ROLLBACK");
        const have = inv.rows.length ? inv.rows[0].quantity : 0;
        return message.reply(`You only have **${have}x ${item.name}** in your inventory!`);
      }

      await client.query(
        "UPDATE user_inventory SET quantity = quantity - $1 WHERE user_id = $2 AND item_id = $3",
        [quantity, userId, item.id]
      );
      await client.query(
        "DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0",
        [userId, item.id]
      );
      await client.query(
        "UPDATE users SET balance = balance + $1 WHERE user_id = $2",
        [totalPayout, userId]
      );
      await client.query("COMMIT");

      return message.reply(
        `💰 Sold **${quantity}x ${item.name}** for **${totalPayout.toLocaleString()}** Cybercoins (50% value)!`
      );
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Shop sell error:", err);
      return message.reply("Sale failed. Please try again.");
    } finally {
      client.release();
    }
  }

  if (subcommand === "use") {
    if (args.length < 2) return message.reply(`Usage: \`${prefix}shop use <item name> [pokemon number]\``);

    const posVal = args.find(a => !isNaN(a) && a !== args[0]);
    let pokemonDbId = null;
    if (posVal) {
      const position = parseInt(posVal, 10);
      pokemonDbId = await getPokemonIdByPosition(userId, position);
      if (!pokemonDbId) return message.reply("That Pokemon was not found in your collection.");
    } else {
      pokemonDbId = user.rows[0].selected_pokemon_id;
    }

    const nameTokens = args.slice(1).filter(a => isNaN(a));
    const rawName = nameTokens.join(" ").toLowerCase();
    const itemKey = nameTokens.join("_").toLowerCase().replace(/\s+/g, "_");

    const item = Object.values(SHOP_ITEMS).find(i =>
      i.id === itemKey || i.name.toLowerCase().replace(/\s+/g, "_") === itemKey || i.name.toLowerCase() === rawName ||
      (i.isEvolutionItem && (i.id === rawName.replace(/\s+/g, "-") || i.name.toLowerCase() === rawName))
    );

    if (!item) {
      if (rawName.includes("mint") || rawName.includes("nature")) {
        const mintItem = SHOP_ITEMS.nature_mint;
        return handleUseItem(message, userId, mintItem, pokemonDbId, args, prefix);
      }
      return message.reply("Item not found in the shop!");
    }

    return handleUseItem(message, userId, item, pokemonDbId, args, prefix);
  }

  if (subcommand === "hold") {
    if (args.length < 3) return message.reply(`Usage: \`${prefix}shop hold <item> <pokemon number>\`\nItems: \`mega stone\`, \`gmax ring\`, \`z ring\`\nUse the number shown in your Pokemon list.`);

    const position = parseInt(args[args.length - 1], 10);
    if (isNaN(position)) return message.reply("Please provide a valid Pokemon number at the end (shown in your Pokemon list).");

    const pokemonDbId = await getPokemonIdByPosition(userId, position);
    if (!pokemonDbId) return message.reply("That Pokemon was not found in your collection.");

    const rawItemName = args.slice(1, -1).join(" ").toLowerCase().trim();
    const HOLD_ALIASES = {
      "mega_stone": "mega_stone", "mega stone": "mega_stone", "megastone": "mega_stone", "mega": "mega_stone",
      "gmax_ring": "gmax_ring", "gmax ring": "gmax_ring", "gmaxring": "gmax_ring", "gmax": "gmax_ring",
      "gigantamax ring": "gmax_ring", "gigantamax_ring": "gmax_ring", "gigantamax": "gmax_ring", "g-max ring": "gmax_ring",
      "z_ring": "z_ring", "z ring": "z_ring", "zring": "z_ring", "z-ring": "z_ring", "z move": "z_ring", "z-move": "z_ring"
    };
    const itemName = HOLD_ALIASES[rawItemName];

    if (!itemName) {
      return message.reply(`Only **Mega Stone**, **Gigantamax Ring**, and **Z-Ring** can be held by Pokemon.\nTry: \`${prefix}shop hold mega stone <number>\`, \`${prefix}shop hold gmax ring <number>\`, or \`${prefix}shop hold z ring <number>\``);
    }

    const lock = await getPokemonLock(pokemonDbId);
    if (lock) return message.reply(`You cannot modify held items on this Pokemon — ${lock.reason}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inv = await client.query(
        "SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE",
        [userId, itemName]
      );
      if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return message.reply(`You don't have any **${SHOP_ITEMS[itemName].name}**! Buy one from the shop.`);
      }

      const poke = await client.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE", [pokemonDbId, userId]);
      if (poke.rows.length === 0) {
        await client.query("ROLLBACK");
        return message.reply("Pokemon not found in your collection.");
      }

      if (poke.rows[0].held_item === "hand_held_color_pouch") {
        const pokeData = getPokemonById(poke.rows[0].pokemon_id);
        if (pokeData && pokeData.isEventPokemon) {
          await client.query("ROLLBACK");
          return message.reply("🎨 The **Hand-held Color Pouch** is bound to **Holi Spirit (Greninja)** and cannot be replaced!");
        }
      }

      if (poke.rows[0].held_item) {
        await client.query("ROLLBACK");
        return message.reply(`This Pokemon is already holding a **${SHOP_ITEMS[poke.rows[0].held_item]?.name || poke.rows[0].held_item}**! Use \`${prefix}shop unhold <pokemon number>\` first.`);
      }

      await client.query("UPDATE pokemon SET held_item = $1 WHERE id = $2", [itemName, pokemonDbId]);
      await client.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, itemName]);
      await client.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, itemName]);
      await client.query("COMMIT");

      const data = getPokemonById(poke.rows[0].pokemon_id);
      const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
      return message.reply(`${SHOP_ITEMS[itemName].emoji} **${name}** is now holding a **${SHOP_ITEMS[itemName].name}**!`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Shop hold error:", err);
      return message.reply("Failed to give item. Please try again.");
    } finally {
      client.release();
    }
  }

  if (subcommand === "unhold") {
    if (!args[1] || isNaN(args[1])) return message.reply(`Usage: \`${prefix}shop unhold <pokemon number>\`\nUse the number shown in your Pokemon list.`);
    const position = parseInt(args[1], 10);

    const pokemonDbId = await getPokemonIdByPosition(userId, position);
    if (!pokemonDbId) return message.reply("That Pokemon was not found in your collection.");

    const lock = await getPokemonLock(pokemonDbId);
    if (lock) return message.reply(`You cannot modify held items on this Pokemon — ${lock.reason}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const poke = await client.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE", [pokemonDbId, userId]);
      if (poke.rows.length === 0) {
        await client.query("ROLLBACK");
        return message.reply("Pokemon not found.");
      }
      if (!poke.rows[0].held_item) {
        await client.query("ROLLBACK");
        return message.reply("That Pokemon isn't holding anything.");
      }

      const heldItem = poke.rows[0].held_item;

      if (heldItem === "hand_held_color_pouch") {
        const pokeData = getPokemonById(poke.rows[0].pokemon_id);
        if (pokeData && pokeData.isEventPokemon) {
          await client.query("ROLLBACK");
          return message.reply("🎨 The **Hand-held Color Pouch** is bound to **Holi Spirit (Greninja)** and cannot be removed!");
        }
      }

      await client.query("UPDATE pokemon SET held_item = NULL WHERE id = $1", [pokemonDbId]);
      await client.query(
        `INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1)
         ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1`,
        [userId, heldItem]
      );
      await client.query("COMMIT");

      const data = getPokemonById(poke.rows[0].pokemon_id);
      const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
      return message.reply(`Removed **${SHOP_ITEMS[heldItem]?.name || heldItem}** from **${name}** and returned it to your inventory.`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Shop unhold error:", err);
      return message.reply("Failed to remove item. Please try again.");
    } finally {
      client.release();
    }
  }

  if (subcommand === "inventory" || subcommand === "inv" || subcommand === "bag") {
    const inv = await pool.query("SELECT * FROM user_inventory WHERE user_id = $1 AND quantity > 0 ORDER BY item_id", [userId]);

    if (inv.rows.length === 0) {
      return message.reply(`Your inventory is empty! Use \`${prefix}shop buy <item>\` to purchase items.`);
    }

    let desc = "";
    for (const row of inv.rows) {
      const item = SHOP_ITEMS[row.item_id];
      if (item) {
        desc += `${item.emoji} **${item.name}** x${row.quantity}\n`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`${message.author.username}'s Inventory`)
      .setDescription(desc)
      .setColor(0x9b59b6)
      .setFooter({ text: `Use ${prefix}shop use <item> [number] | ${prefix}shop hold <item> <number>` });

    return message.channel.send({ embeds: [embed] });
  }

  if (SHOP_CATEGORIES[subcommand]) {
    return showCategory(message, user.rows[0], prefix, subcommand);
  }

  return showShop(message, user.rows[0], prefix);
}

// ── ITEM USE HANDLER (TRANSACTIONAL) ──────────────────────────────────────────
async function handleUseItem(message, userId, item, pokemonDbId, args, prefix) {
  if (item.id === "rare_candy") {
    if (!pokemonDbId) return message.reply("Select a Pokemon first or specify a position!");
    const lock = await getPokemonLock(pokemonDbId);
    if (lock) return message.reply(`You cannot use items on this Pokemon — ${lock.reason}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inv = await client.query("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE", [userId, item.id]);
      if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return message.reply(`You don't have any **${item.name}**!`);
      }

      const poke = await client.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE", [pokemonDbId, userId]);
      if (poke.rows.length === 0) {
        await client.query("ROLLBACK");
        return message.reply("Pokemon not found.");
      }
      if (poke.rows[0].level >= 100) {
        await client.query("ROLLBACK");
        return message.reply("That Pokemon is already max level!");
      }

      await client.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await client.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      await client.query("COMMIT");

      const { levelUpPokemon } = require("../utils/levelUpHelper");
      await levelUpPokemon(userId, pokemonDbId, 1, message.channel);
      return;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Failed to use Rare Candy. Please try again.");
    } finally {
      client.release();
    }
  }

  if (item.id === "iv_stone") {
    if (!pokemonDbId) return message.reply("Select a Pokemon first or specify a position!");
    const lock = await getPokemonLock(pokemonDbId);
    if (lock) return message.reply(`You cannot use items on this Pokemon — ${lock.reason}`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inv = await client.query("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE", [userId, item.id]);
      if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return message.reply(`You don't have any **${item.name}**!`);
      }

      const poke = await client.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE", [pokemonDbId, userId]);
      if (poke.rows.length === 0) {
        await client.query("ROLLBACK");
        return message.reply("Pokemon not found.");
      }

      const ivs = generateIVs();
      await client.query(
        "UPDATE pokemon SET iv_hp = $1, iv_atk = $2, iv_def = $3, iv_spatk = $4, iv_spdef = $5, iv_spd = $6 WHERE id = $7",
        [ivs.hp, ivs.atk, ivs.def, ivs.spatk, ivs.spdef, ivs.spd, pokemonDbId]
      );
      await client.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await client.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      await client.query("COMMIT");

      const iv = totalIV(ivs);
      const data = getPokemonById(poke.rows[0].pokemon_id);
      const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
      return message.reply(`🔮 **${name}**'s IVs have been rerolled! New IV: **${iv}%**`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Failed to use IV Stone. Please try again.");
    } finally {
      client.release();
    }
  }

  if (item.id === "nature_mint") {
    if (!pokemonDbId) return message.reply("Select a Pokemon first or specify a position!");
    const lock = await getPokemonLock(pokemonDbId);
    if (lock) return message.reply(`You cannot use items on this Pokemon — ${lock.reason}`);

    const natureArg = args.slice(1).find(a => {
      if (!isNaN(a)) return false;
      const lower = a.toLowerCase().replace(/_/g, " ");
      return lower !== "nature mint" && lower !== "nature_mint" && lower !== "mint" && lower !== "nature" && lower !== "use";
    });

    let chosenNature = null;
    if (natureArg) {
      const found = Object.keys(NATURE_MODIFIERS).find(n => n.toLowerCase() === natureArg.toLowerCase());
      if (found) chosenNature = found;
    }
    const newNature = chosenNature || randomNature();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inv = await client.query("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE", [userId, item.id]);
      if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return message.reply(`You don't have any **${item.name}**!`);
      }

      const poke = await client.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2 FOR UPDATE", [pokemonDbId, userId]);
      if (poke.rows.length === 0) {
        await client.query("ROLLBACK");
        return message.reply("Pokemon not found.");
      }

      await client.query("UPDATE pokemon SET nature = $1 WHERE id = $2", [newNature, pokemonDbId]);
      await client.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await client.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      await client.query("COMMIT");

      const data = getPokemonById(poke.rows[0].pokemon_id);
      const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
      return message.reply(`🌿 **${name}**'s nature changed to **${newNature}**!`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Failed to use Nature Mint. Please try again.");
    } finally {
      client.release();
    }
  }

  if (item.isEvolutionItem) {
    if (!pokemonDbId) return message.reply("Select a Pokemon first or specify a position!");
    const lock = await getPokemonLock(pokemonDbId);
    if (lock) return message.reply(`You cannot evolve this Pokemon — ${lock.reason}`);

    const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
    if (poke.rows.length === 0) return message.reply("Pokemon not found.");

    const data = getPokemonById(poke.rows[0].pokemon_id);
    const evo = data?.evolutionTo?.find(e => e.item === item.id || e.item === item.name.toLowerCase().replace(/\s+/g, "-"));
    if (!evo) return message.reply(`**${capitalize(data?.name || "This Pokémon")}** cannot evolve using **${item.name}**!`);

    const evoTarget = getPokemonByName(evo.to);
    if (!evoTarget) return message.reply("Evolution target data error.");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const invCheck = await client.query(
        "SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE",
        [userId, item.id]
      );
      if (invCheck.rows.length === 0 || invCheck.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return message.reply(`You don't have any **${item.name}**!`);
      }

      await client.query(
        "UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2",
        [userId, item.id]
      );
      await client.query(
        "DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0",
        [userId, item.id]
      );
      await client.query(
        "UPDATE pokemon SET pokemon_id = $1 WHERE id = $2",
        [evoTarget.id, pokemonDbId]
      );
      await client.query(
        "INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [userId, evoTarget.id]
      );
      await client.query("COMMIT");

      const oldName = poke.rows[0].nickname || capitalize(data.name);
      return message.reply(`✨ What? **${oldName}** is evolving!\n\nCongratulations! Your **${oldName}** evolved into **${capitalize(evoTarget.name)}**!`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Evolution failed. Please try again.");
    } finally {
      client.release();
    }
  }

  if (item.id === "lucky_egg") {
    const bonus = Math.floor(Math.random() * 4001) + 1000;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inv = await client.query("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE", [userId, item.id]);
      if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return message.reply(`You don't have any **${item.name}**!`);
      }
      await client.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [bonus, userId]);
      await client.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await client.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      await client.query("COMMIT");
      return message.reply(`🥚 You cracked the Lucky Egg and found **${bonus.toLocaleString()}** Cybercoins!`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Failed to use Lucky Egg.");
    } finally {
      client.release();
    }
  }

  if (item.id === "shiny_charm") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inv = await client.query("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE", [userId, item.id]);
      if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return message.reply(`You don't have any **${item.name}**!`);
      }
      await client.query(`INSERT INTO user_boosts (user_id, boost_type, uses_left) VALUES ($1, 'shiny_charm', 50)`, [userId]);
      await client.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await client.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      await client.query("COMMIT");
      return message.reply("✨ Shiny Charm activated! Your shiny rate is doubled for the next **50** catches!");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Failed to use Shiny Charm.");
    } finally {
      client.release();
    }
  }

  if (item.id === "xp_boost") {
    const expiresAt = new Date(Date.now() + 3600000);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inv = await client.query("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE", [userId, item.id]);
      if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return message.reply(`You don't have any **${item.name}**!`);
      }
      await client.query(`INSERT INTO user_boosts (user_id, boost_type, expires_at) VALUES ($1, 'xp_boost', $2)`, [userId, expiresAt]);
      await client.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await client.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      await client.query("COMMIT");
      return message.reply("⚡ XP Booster activated! Double XP for **1 hour**!");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Failed to use XP Booster.");
    } finally {
      client.release();
    }
  }

  if (item.id === "master_ball") {
    return message.reply(`🟣 The **Master Ball** is used automatically! When a Pokemon spawns, type \`${prefix}catch master ball\` to catch it without guessing the name.`);
  }

  if (item.id === "mega_stone" || item.id === "gmax_ring" || item.id === "z_ring") {
    return message.reply(`Use \`${prefix}shop hold ${item.id} <pokemon number>\` to give this item to a Pokemon.\nUse the number shown in your Pokemon list.`);
  }

  return message.reply(`To use **${item.name}**, see its specific usage instructions.`);
}

// ── CATEGORY DISPLAY ─────────────────────────────────────────────────────────
async function showCategory(message, user, prefix, catId) {
  const cat = SHOP_CATEGORIES[catId];
  if (!cat) return showShop(message, user, prefix);

  const items = getPurchasableItems(catId);
  const embed = new EmbedBuilder()
    .setTitle(`${cat.emoji} ${cat.name}`)
    .setDescription(`Your balance: **${(user.balance || 0).toLocaleString()}** Cybercoins\n*${cat.description}*\n\n`)
    .setColor(0x9b59b6);

  // Chunk items into groups of 5 to strictly obey Discord 1024 char limits per field
  for (let i = 0; i < items.length; i += 5) {
    const chunk = items.slice(i, i + 5);
    const chunkStr = chunk.map(item =>
      `${item.emoji} **${item.name}** — **${item.price.toLocaleString()}** CC\n┗ \`${prefix}shop buy ${item.id}\` · ${item.description}`
    ).join("\n\n");
    const fieldTitle = items.length > 5 ? `${cat.name} (Part ${Math.floor(i / 5) + 1})` : "Available Items";
    embed.addFields({ name: fieldTitle, value: chunkStr, inline: false });
  }

  embed.setFooter({ text: `${prefix}shop buy <item> [qty] | ${prefix}shop | ${prefix}shop inv` });

  return message.channel.send({ embeds: [embed] });
}

// ── FULL SHOP DISPLAY ────────────────────────────────────────────────────────
async function showShop(message, user, prefix) {
  const embed = new EmbedBuilder()
    .setTitle("🏪 Cyber Shop")
    .setDescription(`Your balance: **${(user.balance || 0).toLocaleString()}** Cybercoins\n\n`)
    .setColor(0x9b59b6);

  // Battle items
  const battleItems = getPurchasableItems("battle");
  if (battleItems.length) {
    const battleStr = battleItems.map(i => `${i.emoji} **${i.name}** — **${i.price.toLocaleString()}** CC\n┗ ${i.description}`).join("\n\n");
    embed.addFields({ name: "⚔️ Battle Items", value: battleStr, inline: false });
  }

  // Items & Consumables
  const genItems = getPurchasableItems("items");
  if (genItems.length) {
    const itemsStr = genItems.map(i => `${i.emoji} **${i.name}** — **${i.price.toLocaleString()}** CC\n┗ ${i.description}`).join("\n\n");
    embed.addFields({ name: "🎒 Items & Consumables", value: itemsStr, inline: false });
  }

  // Evolution items summary (to stay strictly within Discord 1024-character limit)
  const evoItems = getPurchasableItems("evolution");
  if (evoItems.length) {
    const stoneNames = evoItems.map(i => `${i.emoji} ${i.name}`).join(" · ");
    const evoStr = `**Price:** 5,000 Cybercoins each\n\n${stoneNames}\n\n💡 *Use \`${prefix}shop evolution\` to browse all evolution stones and items!*`;
    embed.addFields({ name: "🪨 Evolution Stones & Items", value: evoStr, inline: false });
  }

  embed.setFooter({ text: `${prefix}shop buy <item> [qty] | ${prefix}shop sell <item> [qty] | ${prefix}shop use <item> [pos] | ${prefix}shop hold <item> <#>` });

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "shop", aliases: ["store", "buy"], description: "Buy and use items from the shop", execute };
