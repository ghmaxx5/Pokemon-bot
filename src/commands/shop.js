const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { SHOP_ITEMS, SHOP_CATEGORIES } = require("../data/shopItems");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize, generateIVs, randomNature, totalIV } = require("../utils/helpers");

async function execute(message, args) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet! Use `p!start` to begin.");

  if (!args.length) {
    return showShop(message, user.rows[0]);
  }

  const subcommand = args[0].toLowerCase();

  if (subcommand === "buy") {
    if (!args[1]) return message.reply("Usage: `p!shop buy <item name> [quantity]`\nUse `p!shop` to see available items.");

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

    if (!item) return message.reply("Item not found! Use `p!shop` to see available items.");

    const totalCost = item.price * quantity;
    if (user.rows[0].balance < totalCost) {
      return message.reply(`You need **${totalCost.toLocaleString()}** Cybercoins (${quantity}x ${item.name}) but only have **${user.rows[0].balance.toLocaleString()}**!`);
    }

    if (item.id === "rare_candy" && quantity > 1) {
      const selectedId = user.rows[0].selected_pokemon_id;
      if (!selectedId) return message.reply("Select a Pokemon first to use Rare Candies! Use `p!select <id>`.");

      const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [selectedId, userId]);
      if (poke.rows.length === 0) return message.reply("Selected Pokemon not found.");
      if (poke.rows[0].level >= 100) return message.reply("That Pokemon is already max level!");

      const currentLevel = poke.rows[0].level;
      const levelsToAdd = Math.min(quantity, 100 - currentLevel);
      const actualCost = item.price * levelsToAdd;

      if (user.rows[0].balance < actualCost) {
        return message.reply(`You need **${actualCost.toLocaleString()}** Cybercoins for ${levelsToAdd} Rare Candies but only have **${user.rows[0].balance.toLocaleString()}**!`);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [actualCost, userId]);
        await client.query("UPDATE pokemon SET level = $1, xp = 0 WHERE id = $2", [currentLevel + levelsToAdd, selectedId]);
        await client.query("COMMIT");

        const data = getPokemonById(poke.rows[0].pokemon_id);
        const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
        const newLevel = currentLevel + levelsToAdd;

        const { getAvailableMoves } = require("../data/learnsets");
        const oldMoves = getAvailableMoves(data.types, currentLevel);
        const newMoves = getAvailableMoves(data.types, newLevel);
        const learnedMoves = newMoves.filter(m => !oldMoves.some(om => om.name === m.name));

        let moveText = "";
        if (learnedMoves.length > 0) {
          const { getTypeEmoji } = require("../utils/helpers");
          moveText = "\n\n**New Moves Available:**\n" +
            learnedMoves.slice(0, 10).map(m => `${getTypeEmoji(m.type)} **${m.name}** (${capitalize(m.type)} | Pow: ${m.power})`).join("\n") +
            (learnedMoves.length > 10 ? `\n... and ${learnedMoves.length - 10} more!` : "") +
            "\nUse `p!moves` to view and equip!";
        }

        let evoText = "";
        const { getPokemonByName } = require("../data/pokemonLoader");
        let currentData = data;
        let evoChainDone = false;
        while (currentData && !evoChainDone) {
          evoChainDone = true;
          if (currentData.evolutionTo && currentData.evolutionTo.length > 0) {
            for (const evo of currentData.evolutionTo) {
              if (evo.level && newLevel >= evo.level) {
                const evoTarget = getPokemonByName(evo.to);
                if (evoTarget) {
                  await pool.query("UPDATE pokemon SET pokemon_id = $1, nickname = NULL WHERE id = $2", [evoTarget.id, selectedId]);
                  await pool.query("INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, evoTarget.id]);
                  const prevName = capitalize(currentData.name);
                  evoText += `\n🎉 **${prevName}** evolved into **${capitalize(evoTarget.name)}**!`;
                  currentData = evoTarget;
                  evoChainDone = false;
                  break;
                }
              }
            }
          }
        }

        const embed = new EmbedBuilder()
          .setTitle("🍬 Rare Candies Used!")
          .setDescription(
            `Used **${levelsToAdd}x Rare Candy** on **${name}**!\n` +
            `Level: **${currentLevel}** → **${newLevel}**\n` +
            `Cost: **${actualCost.toLocaleString()}** Cybercoins\n` +
            `New balance: **${(user.rows[0].balance - actualCost).toLocaleString()}** Cybercoins` +
            moveText + evoText
          )
          .setColor(0x2ecc71);

        return message.channel.send({ embeds: [embed] });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        return message.reply("Purchase failed. Please try again.");
      } finally {
        client.release();
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [totalCost, userId]);
      await client.query(
        `INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + $3`,
        [userId, item.id, quantity]
      );
      await client.query("COMMIT");

      const embed = new EmbedBuilder()
        .setTitle(`${item.emoji} Item Purchased!`)
        .setDescription(`You bought **${quantity}x ${item.name}** for **${totalCost.toLocaleString()}** Cybercoins!\n\nNew balance: **${(user.rows[0].balance - totalCost).toLocaleString()}** Cybercoins`)
        .setColor(0x2ecc71);

      return message.channel.send({ embeds: [embed] });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      return message.reply("Purchase failed. Please try again.");
    } finally {
      client.release();
    }
  }

  if (subcommand === "use") {
    if (args.length < 2) return message.reply("Usage: `p!shop use <item name> [pokemon id]`");

    const itemName = args.slice(1).filter(a => isNaN(a)).join("_").toLowerCase().replace(/\s+/g, "_");
    const pokemonDbId = args.find(a => !isNaN(a) && a !== args[0]) ? parseInt(args.find(a => !isNaN(a) && a !== args[0])) : user.rows[0].selected_pokemon_id;
    const item = Object.values(SHOP_ITEMS).find(i =>
      i.id === itemName || i.name.toLowerCase().replace(/\s+/g, "_") === itemName || i.name.toLowerCase() === args.slice(1).filter(a => isNaN(a)).join(" ").toLowerCase()
    );

    if (!item) return message.reply("Item not found!");

    const inv = await pool.query("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
    if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
      return message.reply(`You don't have any **${item.name}**! Buy one from the shop.`);
    }

    if (item.id === "rare_candy") {
      if (!pokemonDbId) return message.reply("Select a Pokemon first or specify an ID!");
      const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
      if (poke.rows.length === 0) return message.reply("Pokemon not found.");
      if (poke.rows[0].level >= 100) return message.reply("That Pokemon is already max level!");

      await pool.query("UPDATE pokemon SET level = level + 1, xp = 0 WHERE id = $1", [pokemonDbId]);
      await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);

      const data = getPokemonById(poke.rows[0].pokemon_id);
      const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
      return message.reply(`🍬 **${name}** grew to **Level ${poke.rows[0].level + 1}**!`);
    }

    if (item.id === "iv_stone") {
      if (!pokemonDbId) return message.reply("Select a Pokemon first or specify an ID!");
      const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
      if (poke.rows.length === 0) return message.reply("Pokemon not found.");

      const ivs = generateIVs();
      await pool.query(
        "UPDATE pokemon SET iv_hp = $1, iv_atk = $2, iv_def = $3, iv_spatk = $4, iv_spdef = $5, iv_spd = $6 WHERE id = $7",
        [ivs.hp, ivs.atk, ivs.def, ivs.spatk, ivs.spdef, ivs.spd, pokemonDbId]
      );
      await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);

      const iv = totalIV(ivs);
      const data = getPokemonById(poke.rows[0].pokemon_id);
      const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
      return message.reply(`🔮 **${name}**'s IVs have been rerolled! New IV: **${iv}%**`);
    }

    if (item.id === "nature_mint") {
      if (!pokemonDbId) return message.reply("Select a Pokemon first or specify an ID!");
      const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
      if (poke.rows.length === 0) return message.reply("Pokemon not found.");

      const newNature = randomNature();
      await pool.query("UPDATE pokemon SET nature = $1 WHERE id = $2", [newNature, pokemonDbId]);
      await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);

      const data = getPokemonById(poke.rows[0].pokemon_id);
      const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
      return message.reply(`🌿 **${name}**'s nature changed to **${newNature}**!`);
    }

    if (item.id === "lucky_egg") {
      const bonus = Math.floor(Math.random() * 4001) + 1000;
      await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [bonus, userId]);
      await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      return message.reply(`🥚 You cracked the Lucky Egg and found **${bonus.toLocaleString()}** Cybercoins!`);
    }

    if (item.id === "shiny_charm") {
      await pool.query(
        `INSERT INTO user_boosts (user_id, boost_type, uses_left) VALUES ($1, 'shiny_charm', 50)`,
        [userId]
      );
      await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      return message.reply("✨ Shiny Charm activated! Your shiny rate is doubled for the next **50** catches!");
    }

    if (item.id === "xp_boost") {
      const expiresAt = new Date(Date.now() + 3600000);
      await pool.query(
        `INSERT INTO user_boosts (user_id, boost_type, expires_at) VALUES ($1, 'xp_boost', $2)`,
        [userId, expiresAt]
      );
      await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, item.id]);
      await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, item.id]);
      return message.reply("⚡ XP Booster activated! Double XP for **1 hour**!");
    }

    if (item.id === "master_ball") {
      return message.reply("🟣 The **Master Ball** is used automatically! When a Pokemon spawns, type `p!catch master ball` to catch it without guessing the name.");
    }

    if (item.id === "mega_stone" || item.id === "gmax_ring") {
      return message.reply(`Use \`shop hold ${item.id} <pokemon number>\` to give this item to a Pokemon.\nUse the number shown in your Pokemon list.`);
    }

    return message.reply(`To use **${item.name}**, see its specific usage instructions.`);
  }

  if (subcommand === "hold") {
    if (args.length < 3) return message.reply("Usage: `shop hold <item> <pokemon number>`\nItems: `mega stone`, `gmax ring`\nUse the number shown in your Pokemon list.");

    const pokemonDbId = parseInt(args[args.length - 1]);
    if (isNaN(pokemonDbId)) return message.reply("Please provide a valid Pokemon number at the end (shown in your Pokemon list).");

    const rawItemName = args.slice(1, -1).join(" ").toLowerCase().trim();
    const HOLD_ALIASES = {
      "mega_stone": "mega_stone", "mega stone": "mega_stone", "megastone": "mega_stone", "mega": "mega_stone",
      "gmax_ring": "gmax_ring", "gmax ring": "gmax_ring", "gmaxring": "gmax_ring", "gmax": "gmax_ring",
      "gigantamax ring": "gmax_ring", "gigantamax_ring": "gmax_ring", "gigantamax": "gmax_ring", "g-max ring": "gmax_ring"
    };
    const itemName = HOLD_ALIASES[rawItemName];

    if (!itemName) {
      return message.reply("Only **Mega Stone** and **Gigantamax Ring** can be held by Pokemon.\nTry: `shop hold mega stone <number>` or `shop hold gmax ring <number>`");
    }

    const inv = await pool.query("SELECT quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2", [userId, itemName]);
    if (inv.rows.length === 0 || inv.rows[0].quantity < 1) {
      return message.reply(`You don't have any **${SHOP_ITEMS[itemName].name}**! Buy one from the shop.`);
    }

    const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
    if (poke.rows.length === 0) return message.reply("Pokemon not found in your collection.");

    if (poke.rows[0].held_item) {
      return message.reply(`This Pokemon is already holding a **${SHOP_ITEMS[poke.rows[0].held_item]?.name || poke.rows[0].held_item}**! Use \`shop unhold <pokemon number>\` first.`);
    }

    await pool.query("UPDATE pokemon SET held_item = $1 WHERE id = $2", [itemName, pokemonDbId]);
    await pool.query("UPDATE user_inventory SET quantity = quantity - 1 WHERE user_id = $1 AND item_id = $2", [userId, itemName]);
    await pool.query("DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2 AND quantity <= 0", [userId, itemName]);

    const data = getPokemonById(poke.rows[0].pokemon_id);
    const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
    return message.reply(`${SHOP_ITEMS[itemName].emoji} **${name}** is now holding a **${SHOP_ITEMS[itemName].name}**!`);
  }

  if (subcommand === "unhold") {
    if (!args[1] || isNaN(args[1])) return message.reply("Usage: `shop unhold <pokemon number>`\nUse the number shown in your Pokemon list.");
    const pokemonDbId = parseInt(args[1]);

    const poke = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
    if (poke.rows.length === 0) return message.reply("Pokemon not found.");
    if (!poke.rows[0].held_item) return message.reply("That Pokemon isn't holding anything.");

    const heldItem = poke.rows[0].held_item;
    await pool.query("UPDATE pokemon SET held_item = NULL WHERE id = $1", [pokemonDbId]);
    await pool.query(
      `INSERT INTO user_inventory (user_id, item_id, quantity) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_inventory.quantity + 1`,
      [userId, heldItem]
    );

    const data = getPokemonById(poke.rows[0].pokemon_id);
    const name = poke.rows[0].nickname || (data ? capitalize(data.name) : `#${poke.rows[0].pokemon_id}`);
    return message.reply(`Removed **${SHOP_ITEMS[heldItem]?.name || heldItem}** from **${name}** and returned it to your inventory.`);
  }

  if (subcommand === "inventory" || subcommand === "inv" || subcommand === "bag") {
    const inv = await pool.query("SELECT * FROM user_inventory WHERE user_id = $1 AND quantity > 0 ORDER BY item_id", [userId]);

    if (inv.rows.length === 0) {
      return message.reply("Your inventory is empty! Use `p!shop buy <item>` to purchase items.");
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
      .setFooter({ text: "Use shop use <item> [number] | shop hold <item> <number>" });

    return message.channel.send({ embeds: [embed] });
  }

  return showShop(message, user.rows[0]);
}

async function showShop(message, user) {
  const embed = new EmbedBuilder()
    .setTitle("🏪 Cyber Shop")
    .setDescription(`Your balance: **${user.balance.toLocaleString()}** Cybercoins\n\n`)
    .setColor(0x9b59b6);

  for (const [catId, cat] of Object.entries(SHOP_CATEGORIES)) {
    const items = Object.values(SHOP_ITEMS).filter(i => i.category === catId);
    const itemStr = items.map(i =>
      `${i.emoji} **${i.name}** — **${i.price.toLocaleString()}** CC\n┗ ${i.description}`
    ).join("\n\n");
    embed.addFields({ name: `${cat.emoji} ${cat.name}`, value: itemStr, inline: false });
  }

  embed.setFooter({ text: "shop buy <item> [qty] | shop use <item> [number] | shop hold <item> <number> | inv" });

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "shop", aliases: ["store", "buy"], description: "Buy items from the shop", execute };
