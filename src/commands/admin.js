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

  let subcommand = args[1]?.toLowerCase();

  // spawnwild <pokemon> is shorthand for spawn wild <pokemon>
  if (subcommand === "spawnwild") {
    subcommand = "spawn";
    args.splice(2, 0, "wild"); // insert "wild" before the pokemon name
  }

  if (subcommand === "addcoins") {
    const target = message.mentions.users.first();

    // Format: addcoins @user <amount> [custom message...]
    const nonMentionArgs = args.slice(2).filter(a => !a.startsWith("<@"));
    const amount = parseInt(nonMentionArgs[0]);
    const customMsg = nonMentionArgs.slice(1).join(" ").trim();

    if (!amount || isNaN(amount) || amount <= 0) {
      return message.reply(
        "**Usage:** `p!admin cyberadmin addcoins @user <amount> [custom message]`\n" +
        "**Examples:**\n" +
        "`p!admin cyberadmin addcoins @user 500` — add 500 coins\n" +
        "`p!admin cyberadmin addcoins @user 1000 Reward for winning the tournament!` — with reason"
      );
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
        `Added **${amount.toLocaleString()}** Cybercoins to **${targetName}**!\n` +
        `New balance: **${newBalance.toLocaleString()}** Cybercoins` +
        (customMsg ? `\n📝 **Reason:** ${customMsg}` : "")
      )
      .setColor(0x2ecc71)
      .setFooter({ text: "Admin Command" });

    await message.channel.send({ embeds: [embed] });

    // DM the recipient
    if (target && target.id !== message.author.id) {
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle("🎉 You received Cybercoins!")
          .setDescription(
            `**Cybermon Team** has sent you **${amount.toLocaleString()} Cybercoins**!\n\n` +
            `💰 **Previous Balance:** ${user.rows[0].balance.toLocaleString()} Cybercoins\n` +
            `💰 **New Balance:** ${newBalance.toLocaleString()} Cybercoins\n` +
            (customMsg ? `\n📝 **Reason:** ${customMsg}\n` : "") +
            `\n*This is an official reward from the Cybermon Team.*`
          )
          .setColor(0x2ecc71)
          .setThumbnail("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png")
          .setFooter({ text: "Cybermon Team • Official Notification" })
          .setTimestamp();
        await target.send({ embeds: [dmEmbed] });
      } catch (e) {
        // User may have DMs disabled — silently skip
      }
    }

    try { await message.delete(); } catch (e) {}
  }

  if (subcommand === "setcoins") {
    const target = message.mentions.users.first();

    // Format: setcoins @user <amount> [custom message...]
    // Args after secret+subcommand: [mention, amount, ...customMsg] or [amount, ...customMsg]
    const nonMentionArgs = args.slice(2).filter(a => !a.startsWith("<@"));
    const amount = parseInt(nonMentionArgs[0]);
    const customMsg = nonMentionArgs.slice(1).join(" ").trim(); // everything after amount

    if (isNaN(amount) || amount < 0) {
      return message.reply(
        "**Usage:** `p!admin cyberadmin setcoins @user <amount> [custom message]`\n" +
        "**Examples:**\n" +
        "`p!admin cyberadmin setcoins @user 5000` — set to 5000\n" +
        "`p!admin cyberadmin setcoins @user 0 You were penalized for rule breaking.` — with custom reason"
      );
    }

    const targetId = target ? target.id : message.author.id;
    const targetName = target ? target.username : message.author.username;

    const user = await pool.query("SELECT * FROM users WHERE user_id = $1", [targetId]);
    if (user.rows.length === 0) {
      return message.reply("That user hasn't started their journey yet.");
    }

    const oldBalance = user.rows[0].balance;
    const diff = amount - oldBalance;
    const increased = diff >= 0;

    await pool.query("UPDATE users SET balance = $1 WHERE user_id = $2", [amount, targetId]);

    const embed = new EmbedBuilder()
      .setTitle("💰 Cybercoins Set")
      .setDescription(
        `Set **${targetName}**'s balance to **${amount.toLocaleString()}** Cybercoins!\n` +
        `*(was ${oldBalance.toLocaleString()} — ${increased ? "+" : ""}${diff.toLocaleString()})*` +
        (customMsg ? `\n📝 **Reason:** ${customMsg}` : "")
      )
      .setColor(increased ? 0x2ecc71 : 0xe74c3c)
      .setFooter({ text: "Admin Command" });

    await message.channel.send({ embeds: [embed] });

    // DM the recipient with increase/decrease context + custom message
    if (target && target.id !== message.author.id) {
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle(increased ? "📈 Your Cybercoins Increased!" : "📉 Your Cybercoins Were Reduced!")
          .setDescription(
            (increased
              ? `**Cybermon Team** has **increased** your Cybercoin balance.\n\n`
              : `**Cybermon Team** has **reduced** your Cybercoin balance.\n\n`) +
            `📊 **Change:** ${increased ? "+" : ""}${diff.toLocaleString()} Cybercoins\n` +
            `💰 **Previous Balance:** ${oldBalance.toLocaleString()} Cybercoins\n` +
            `💰 **New Balance:** ${amount.toLocaleString()} Cybercoins\n` +
            (customMsg ? `\n📝 **Reason:** ${customMsg}\n` : "") +
            `\n*This is an official action by the Cybermon Team.*`
          )
          .setColor(increased ? 0x2ecc71 : 0xe74c3c)
          .setThumbnail("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png")
          .setFooter({ text: "Cybermon Team • Official Notification" })
          .setTimestamp();
        await target.send({ embeds: [dmEmbed] });
      } catch (e) {}
    }

    try { await message.delete(); } catch (e) {}
  }

  if (subcommand === "addall") {
    const amount = parseInt(args[2]);
    if (!amount || isNaN(amount) || amount <= 0) {
      return message.reply("Usage: `p!admin cyberadmin addall <amount>`");
    }

    await pool.query("UPDATE users SET balance = balance + $1 WHERE started = TRUE", [amount]);

    // Admin confirmation (ephemeral-style, gets deleted)
    const adminEmbed = new EmbedBuilder()
      .setTitle("💰 Cybercoins Distributed")
      .setDescription(`Added **${amount.toLocaleString()}** Cybercoins to **all** trainers!`)
      .setColor(0xf1c40f)
      .setFooter({ text: "Admin Command" });
    await message.channel.send({ embeds: [adminEmbed] });

    // Public announcement so all users see the reward
    const announcementEmbed = new EmbedBuilder()
      .setTitle("🎉 Cybermon Team Reward!")
      .setDescription(
        `**All trainers** have received **${amount.toLocaleString()} Cybercoins** from the Cybermon Team!\n\n` +
        `💰 Check your balance with \`p!bal\`\n\n` +
        `*Thank you for being part of the Cybermon community!*`
      )
      .setColor(0xf1c40f)
      .setThumbnail("https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png")
      .setFooter({ text: "Cybermon Team • Official Reward" })
      .setTimestamp();
    await message.channel.send({ embeds: [announcementEmbed] });

    try { await message.delete(); } catch (e) {}
  }

  if (subcommand === "spawn") {
    const nonMentionArgs = args.slice(2).filter(a => !a.startsWith("<@"));
    const target = message.mentions.users.first();

    // ── Wild channel spawn: p!admin cyberadmin spawn wild <pokemon> [iv%] [shiny] ──
    // Anyone in the channel can catch it, same as a natural spawn
    if (nonMentionArgs[0]?.toLowerCase() === "wild") {
      const remainingArgs = nonMentionArgs.slice(1);
      if (!remainingArgs.length) {
        return message.reply(
          "**Usage:** `p!admin cyberadmin spawn wild <pokemon> [iv%] [shiny]`\n" +
          "**Examples:**\n" +
          "`p!admin cyberadmin spawn wild greninja` — random IV, not shiny\n" +
          "`p!admin cyberadmin spawn wild charizard 100 shiny` — 100% IV, shiny\n" +
          "`p!admin cyberadmin spawn wild eternatus 85` — 85% IV, not shiny\n" +
          "`p!admin cyberadmin spawn wild holi spirit greninja shiny` — shiny event spawn"
        );
      }

      // Smart parse: peel trailing shiny/number from right, rest is pokemon name
      let pokemonData = null;
      let ivPct = null;
      let forceShiny = false;
      const nameArgs = [...remainingArgs];
      while (nameArgs.length > 0) {
        const last = nameArgs[nameArgs.length - 1].toLowerCase();
        if (last === "shiny") { forceShiny = true; nameArgs.pop(); }
        else if (!isNaN(last) && parseFloat(last) >= 0 && parseFloat(last) <= 100) {
          ivPct = parseFloat(last); nameArgs.pop();
        } else break;
      }
      for (let len = nameArgs.length; len >= 1; len--) {
        const found = getPokemonByName(nameArgs.slice(0, len).join(" "));
        if (found) { pokemonData = found; break; }
      }
      if (!pokemonData) {
        return message.reply(`Pokemon **${remainingArgs.join(" ")}** not found! Check the name and try again.`);
      }

      // Build IVs from specified percentage or random
      let ivs;
      if (ivPct !== null) {
        const targetTotal = Math.round((ivPct / 100) * 186);
        const perStat = Math.min(31, Math.floor(targetTotal / 6));
        const rem = targetTotal - perStat * 6;
        ivs = {
          hp:    Math.min(31, perStat + (rem > 0 ? 1 : 0)),
          atk:   Math.min(31, perStat + (rem > 1 ? 1 : 0)),
          def:   Math.min(31, perStat + (rem > 2 ? 1 : 0)),
          spatk: Math.min(31, perStat + (rem > 3 ? 1 : 0)),
          spdef: Math.min(31, perStat + (rem > 4 ? 1 : 0)),
          spd:   perStat
        };
      } else {
        ivs = generateIVs();
      }
      const ivTotal = ((ivs.hp + ivs.atk + ivs.def + ivs.spatk + ivs.spdef + ivs.spd) / 186 * 100).toFixed(1);

      const channelId = message.channel.id;
      spawns.set(channelId, { pokemonId: pokemonData.id, spawnedAt: Date.now(), forceShiny, ivs });

      const isEvent = pokemonData.isEventPokemon;
      const image = getPokemonImage(pokemonData.id); // always show normal image in spawn embed (shiny revealed on catch)
      const displayName = pokemonData.displayName || capitalize(pokemonData.name);
      const shinyTag = forceShiny ? "✨ **SHINY** " : "";
      const ivTag = ivPct !== null ? ` • **${ivTotal}% IV**` : "";

      const embed = new EmbedBuilder()
        .setTitle(isEvent ? "🎊 An Event Pokémon has been summoned!" : `⚡ A wild ${shinyTag}Pokémon appeared!`)
        .setDescription(
          (isEvent
            ? `Admin summoned ${shinyTag}**${displayName}** during the **${pokemonData.eventName || "Special Event"}**!`
            : `Admin summoned a ${shinyTag}**${displayName}**!`) +
          `\n${ivTag ? ivTag + "\n" : ""}` +
          `Type \`p!catch ${pokemonData.name.replace(/-/g, " ")}\` to catch it!`
        )
        .setImage(image)
        .setColor(forceShiny ? 0xffd700 : isEvent ? 0xf72585 : 0xff6600)
        .setFooter({ text: "Admin-summoned spawn — catch it fast!" });

      await message.channel.send({ embeds: [embed] });

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
}

module.exports = { name: "admin", description: "Secret admin commands", execute };
