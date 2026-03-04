const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonByName, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, generateIVs, randomNature } = require("../utils/helpers");

const ADMIN_SECRET = process.env.ADMIN_SECRET || "cyberadmin";

async function execute(message, args, spawns) {
  if (!args.length || args[0] !== ADMIN_SECRET) {
    return;
  }

  const isServerAdmin = message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator);
  const isBotOwner = process.env.BOT_OWNER_ID && message.author.id === process.env.BOT_OWNER_ID;
  if (!isServerAdmin && !isBotOwner) {
    return;
  }

  const subcommand = args[1]?.toLowerCase();

  if (subcommand === "addcoins") {
    const target = message.mentions.users.first();
    const amount = parseInt(args[args.length - 1]);

    if (!amount || isNaN(amount) || amount <= 0) {
      return message.reply("Usage: `p!admin cyberadmin addcoins @user <amount>`\nOr: `p!admin cyberadmin addcoins <amount>` (adds to yourself)");
    }

    const targetId = target ? target.id : message.author.id;
    const targetName = target ? target.username : message.author.username;

    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [targetId]);
    if (user.rows.length === 0) {
      return message.reply("That user hasn't started their journey yet.");
    }

    await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [amount, targetId]);

    const newBalance = user.rows[0].balance + amount;

    const embed = new EmbedBuilder()
      .setTitle("💰 Cybercoins Added")
      .setDescription(
        `Added **${amount.toLocaleString()}** Cybercoins to **${targetName}**!\n\n` +
        `New balance: **${newBalance.toLocaleString()}** Cybercoins`
      )
      .setColor(0xf1c40f)
      .setFooter({ text: "Admin Command" });

    await message.channel.send({ embeds: [embed] });
    try { await message.delete(); } catch (e) {}
  }

  if (subcommand === "setcoins") {
    const target = message.mentions.users.first();
    const amount = parseInt(args[args.length - 1]);

    if (amount === undefined || isNaN(amount) || amount < 0) {
      return message.reply("Usage: `p!admin cyberadmin setcoins @user <amount>`");
    }

    const targetId = target ? target.id : message.author.id;
    const targetName = target ? target.username : message.author.username;

    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [targetId]);
    if (user.rows.length === 0) {
      return message.reply("That user hasn't started their journey yet.");
    }

    await pool.query("UPDATE users SET balance = $1 WHERE user_id = $2", [amount, targetId]);

    const embed = new EmbedBuilder()
      .setTitle("💰 Cybercoins Set")
      .setDescription(
        `Set **${targetName}**'s balance to **${amount.toLocaleString()}** Cybercoins!`
      )
      .setColor(0xf1c40f)
      .setFooter({ text: "Admin Command" });

    await message.channel.send({ embeds: [embed] });
    try { await message.delete(); } catch (e) {}
  }

  if (subcommand === "addall") {
    const amount = parseInt(args[2]);
    if (!amount || isNaN(amount) || amount <= 0) {
      return message.reply("Usage: `p!admin cyberadmin addall <amount>`");
    }

    await pool.query("UPDATE users SET balance = balance + $1 WHERE started = TRUE", [amount]);

    const embed = new EmbedBuilder()
      .setTitle("💰 Cybercoins Distributed")
      .setDescription(`Added **${amount.toLocaleString()}** Cybercoins to **all** trainers!`)
      .setColor(0xf1c40f)
      .setFooter({ text: "Admin Command" });

    await message.channel.send({ embeds: [embed] });
    try { await message.delete(); } catch (e) {}
  }

  if (subcommand === "spawn") {
    const nonMentionArgs = args.slice(2).filter(a => !a.startsWith("<@"));
    const target = message.mentions.users.first();

    // ── Wild channel spawn: p!admin cyberadmin spawn wild <pokemon> ──
    // Anyone in the channel can catch it, same as a natural spawn
    if (nonMentionArgs[0]?.toLowerCase() === "wild") {
      const pokemonName = nonMentionArgs[1]?.toLowerCase();
      if (!pokemonName) {
        return message.reply(
          "Usage: `p!admin cyberadmin spawn wild <pokemon name>`\n" +
          "Example: `p!admin cyberadmin spawn wild holi-spirit-greninja`\n" +
          "Example: `p!admin cyberadmin spawn wild eternatus`"
        );
      }

      const pokemonData = getPokemonByName(pokemonName);
      if (!pokemonData) {
        return message.reply(`Pokémon **${pokemonName}** not found! Check the name and try again.`);
      }

      // Inject into spawns map — same mechanism as natural spawning
      const channelId = message.channel.id;
      if (!spawns) {
        return message.reply("⚠️ Spawn map not available.");
      }

      spawns.set(channelId, { pokemonId: pokemonData.id, spawnedAt: Date.now() });

      const isEvent = pokemonData.isEventPokemon;
      const image = getPokemonImage(pokemonData.id);
      const displayName = pokemonData.displayName || capitalize(pokemonData.name);
      const catchName = pokemonData.baseForm
        ? (getPokemonById(pokemonData.baseForm)?.name || pokemonData.name)
        : pokemonData.name;

      const embed = new EmbedBuilder()
        .setTitle(isEvent ? "🎊 An Event Pokémon has been summoned!" : "⚡ A wild Pokémon appeared!")
        .setDescription(
          isEvent
            ? `Admin summoned **${displayName}** during the **${pokemonData.eventName || "Special Event"}**!\nType \`p!catch ${catchName}\` to catch it!`
            : `Admin summoned a wild **${displayName}**!\nType \`p!catch ${pokemonData.name}\` to catch it!`
        )
        .setImage(image)
        .setColor(isEvent ? 0xf72585 : 0xff6600)
        .setFooter({ text: isEvent ? "🎨 Event spawn — catch it fast!" : "Admin-summoned spawn" });

      await message.channel.send({ embeds: [embed] });

      // Auto-despawn after 5 minutes
      setTimeout(() => {
        if (spawns.has(channelId) && spawns.get(channelId).pokemonId === pokemonData.id) {
          spawns.delete(channelId);
          message.channel.send(`The wild **${displayName}** fled!`).catch(() => {});
        }
      }, 5 * 60 * 1000);

      try { await message.delete(); } catch (e) {}
      return;
    }

    // ── Direct spawn: p!admin cyberadmin spawn [@user] <pokemon> [iv] [level] [shiny] ──
    const targetId = target ? target.id : message.author.id;
    const targetName = target ? target.username : message.author.username;

    const userCheck = await pool.query("SELECT * FROM users WHERE user_id = $1", [targetId]);
    if (userCheck.rows.length === 0) {
      return message.reply("That user hasn't started their journey yet.");
    }

    if (nonMentionArgs.length < 1) {
      return message.reply(
        "Usage:\n" +
        "`p!admin cyberadmin spawn wild <pokemon>` — spawns in channel for anyone to catch\n" +
        "`p!admin cyberadmin spawn <pokemon> [iv%] [level] [shiny]` — gives directly to you\n" +
        "`p!admin cyberadmin spawn @user <pokemon> [iv%] [level] [shiny]` — gives directly to user\n" +
        "Example: `p!admin cyberadmin spawn wild holi-spirit-greninja`\n" +
        "Example: `p!admin cyberadmin spawn pikachu 100 50 shiny`"
      );
    }

    const pokemonName = nonMentionArgs[0].toLowerCase();
    const pokemonData = getPokemonByName(pokemonName);
    if (!pokemonData) {
      return message.reply(`Pokemon **${pokemonName}** not found! Check the name and try again.`);
    }

    let ivPct = null;
    let level = pokemonData.isEventPokemon ? 100 : 1;
    let shiny = false;

    for (let i = 1; i < nonMentionArgs.length; i++) {
      const arg = nonMentionArgs[i].toLowerCase();
      if (arg === "shiny") shiny = true;
      else if (ivPct === null && !isNaN(arg)) ivPct = Math.min(100, Math.max(0, parseFloat(arg)));
      else if (!isNaN(arg)) level = Math.min(100, Math.max(1, parseInt(arg)));
    }

    let ivs;
    if (ivPct !== null) {
      const targetTotal = Math.round((ivPct / 100) * 186);
      const perStat = Math.min(31, Math.floor(targetTotal / 6));
      const remainder = targetTotal - (perStat * 6);
      ivs = {
        hp:    Math.min(31, perStat + (remainder > 0 ? 1 : 0)),
        atk:   Math.min(31, perStat + (remainder > 1 ? 1 : 0)),
        def:   Math.min(31, perStat + (remainder > 2 ? 1 : 0)),
        spatk: Math.min(31, perStat + (remainder > 3 ? 1 : 0)),
        spdef: Math.min(31, perStat + (remainder > 4 ? 1 : 0)),
        spd:   perStat
      };
    } else {
      ivs = generateIVs();
    }

    const nature = randomNature();

    // Auto-equip event Pokemon moves and held item
    let move1 = null, move2 = null, move3 = null, move4 = null;
    let heldItem = null;
    if (pokemonData.isEventPokemon) {
      const { getAvailableMoves } = require("../data/learnsets");
      const eventMoves = getAvailableMoves(pokemonData.types, 100, pokemonData.id);
      move1 = eventMoves[0]?.name || null;
      move2 = eventMoves[1]?.name || null;
      move3 = eventMoves[2]?.name || null;
      move4 = eventMoves[3]?.name || null;
      heldItem = "hand_held_color_pouch";
    }

    const result = await pool.query(
      `INSERT INTO pokemon (user_id, pokemon_id, level, xp, shiny, iv_hp, iv_atk, iv_def, iv_spatk, iv_spdef, iv_spd, nature, original_owner, move1, move2, move3, move4, held_item)
       VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [targetId, pokemonData.id, level, shiny, ivs.hp, ivs.atk, ivs.def, ivs.spatk, ivs.spdef, ivs.spd, nature, targetId, move1, move2, move3, move4, heldItem]
    );

    await pool.query(
      `INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [targetId, pokemonData.id]
    );

    const ivTotal = ((ivs.hp + ivs.atk + ivs.def + ivs.spatk + ivs.spdef + ivs.spd) / 186 * 100).toFixed(2);
    const displayName = pokemonData.displayName || capitalize(pokemonData.name);

    let desc = `Spawned **${shiny ? "✨ " : ""}${displayName}** for **${targetName}**!\n\n` +
      `**ID:** ${result.rows[0].id}\n**Level:** ${level}\n**IV:** ${ivTotal}%\n**Nature:** ${nature}\n**Shiny:** ${shiny ? "Yes" : "No"}`;
    if (pokemonData.isEventPokemon) {
      desc += `\n🎨 **Held Item:** Hand-held Color Pouch auto-equipped`;
      desc += `\n✦ **Moves:** ${[move1,move2,move3,move4].filter(Boolean).join(" | ")}`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${shiny ? "✨ " : ""}${pokemonData.isEventPokemon ? "🎊 " : ""}Pokémon Spawned!`)
      .setDescription(desc)
      .setColor(pokemonData.isEventPokemon ? 0xf72585 : shiny ? 0xffd700 : 0x2ecc71)
      .setThumbnail(getPokemonImage(pokemonData.id, shiny))
      .setFooter({ text: "Admin Command" });

    await message.channel.send({ embeds: [embed] });
    try { await message.delete(); } catch (e) {}
  }

  // ── spawnwild: spawns a Pokemon into chat like a normal wild spawn ──
  // Anyone in the channel can catch it with p!catch
  if (subcommand === "spawnwild") {
    const nonMentionArgs = args.slice(2).filter(a => !a.startsWith("<@"));
    if (nonMentionArgs.length < 1) {
      return message.reply(
        "Usage: `p!admin cyberadmin spawnwild <pokemon name>`\n" +
        "Example: `p!admin cyberadmin spawnwild eternatus`\n" +
        "Example: `p!admin cyberadmin spawnwild holi-spirit-greninja`\n" +
        "The Pokemon will appear in this channel and **anyone** can catch it!"
      );
    }

    const pokemonName = nonMentionArgs[0].toLowerCase();
    const pokemonData = getPokemonByName(pokemonName);
    if (!pokemonData) {
      return message.reply(`Pokemon **${pokemonName}** not found! Check the name and try again.`);
    }

    // Register in spawns map so p!catch works for everyone
    const { spawns } = require("../index") || {};
    // Pass spawns via a global event on the client instead
    const channelId = message.channel.id;
    const displayName = pokemonData.displayName || capitalize(pokemonData.name);
    const isEvent = pokemonData.isEventPokemon;

    // Emit custom event on client so index.js spawn map is updated
    message.client.emit("adminWildSpawn", channelId, pokemonData.id);

    const image = getPokemonImage(pokemonData.id);
    const embed = new EmbedBuilder()
      .setTitle(isEvent ? `🎊 A special Event Pokémon has appeared!` : `🌟 A wild ${displayName} appeared!`)
      .setDescription(
        isEvent
          ? `A rare **${displayName}** appeared during the **${pokemonData.eventName || "Special Event"}**!\nType \`p!catch greninja\` to catch it!`
          : `An admin has summoned a wild **${displayName}**!\nType \`p!catch ${pokemonData.name.replace(/-/g, " ")}\` to catch it!`
      )
      .setImage(image)
      .setColor(isEvent ? 0xf72585 : 0x9b59b6)
      .setFooter({ text: isEvent ? "🎨 Event spawn — extra rare!" : "⚡ Admin summoned wild spawn" });

    await message.channel.send({ embeds: [embed] });
    try { await message.delete(); } catch (e) {}
  }
}

module.exports = { name: "admin", description: "Secret admin commands", execute };
