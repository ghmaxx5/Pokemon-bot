const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonByName, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, generateIVs, randomNature } = require("../utils/helpers");

const ADMIN_SECRET = process.env.ADMIN_SECRET || "cyberadmin";

async function execute(message, args) {
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
    const target = message.mentions.users.first();
    const targetId = target ? target.id : message.author.id;
    const targetName = target ? target.username : message.author.username;

    const userCheck = await pool.query("SELECT * FROM users WHERE user_id = $1", [targetId]);
    if (userCheck.rows.length === 0) {
      return message.reply("That user hasn't started their journey yet.");
    }

    const nonMentionArgs = args.slice(2).filter(a => !a.startsWith("<@"));
    if (nonMentionArgs.length < 1) {
      return message.reply(
        "Usage: `p!admin cyberadmin spawn <pokemon name> [iv%] [level] [shiny]`\n" +
        "Example: `p!admin cyberadmin spawn pikachu 100 50 shiny`\n" +
        "Example: `p!admin cyberadmin spawn @user charizard 90 100`"
      );
    }

    const pokemonName = nonMentionArgs[0].toLowerCase();
    const pokemonData = getPokemonByName(pokemonName);
    if (!pokemonData) {
      return message.reply(`Pokemon **${pokemonName}** not found! Check the name and try again.`);
    }

    let ivPct = null;
    let level = 1;
    let shiny = false;

    for (let i = 1; i < nonMentionArgs.length; i++) {
      const arg = nonMentionArgs[i].toLowerCase();
      if (arg === "shiny") {
        shiny = true;
      } else if (ivPct === null && !isNaN(arg)) {
        ivPct = Math.min(100, Math.max(0, parseFloat(arg)));
      } else if (!isNaN(arg)) {
        level = Math.min(100, Math.max(1, parseInt(arg)));
      }
    }

    let ivs;
    if (ivPct !== null) {
      const targetTotal = Math.round((ivPct / 100) * 186);
      const perStat = Math.min(31, Math.floor(targetTotal / 6));
      const remainder = targetTotal - (perStat * 6);
      ivs = {
        hp: Math.min(31, perStat + (remainder > 0 ? 1 : 0)),
        atk: Math.min(31, perStat + (remainder > 1 ? 1 : 0)),
        def: Math.min(31, perStat + (remainder > 2 ? 1 : 0)),
        spatk: Math.min(31, perStat + (remainder > 3 ? 1 : 0)),
        spdef: Math.min(31, perStat + (remainder > 4 ? 1 : 0)),
        spd: perStat
      };
    } else {
      ivs = generateIVs();
    }

    const nature = randomNature();

    const result = await pool.query(
      `INSERT INTO pokemon (user_id, pokemon_id, level, xp, shiny, iv_hp, iv_atk, iv_def, iv_spatk, iv_spdef, iv_spd, nature, original_owner)
       VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [targetId, pokemonData.id, level, shiny, ivs.hp, ivs.atk, ivs.def, ivs.spatk, ivs.spdef, ivs.spd, nature, targetId]
    );

    await pool.query(
      `INSERT INTO pokedex (user_id, pokemon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [targetId, pokemonData.id]
    );

    const ivTotal = ((ivs.hp + ivs.atk + ivs.def + ivs.spatk + ivs.spdef + ivs.spd) / 186 * 100).toFixed(2);

    const embed = new EmbedBuilder()
      .setTitle(`${shiny ? "✨ " : ""}Pokemon Spawned!`)
      .setDescription(
        `Spawned **${shiny ? "✨ " : ""}${capitalize(pokemonData.name)}** for **${targetName}**!\n\n` +
        `**ID:** ${result.rows[0].id}\n` +
        `**Level:** ${level}\n` +
        `**IV:** ${ivTotal}%\n` +
        `**Nature:** ${nature}\n` +
        `**Shiny:** ${shiny ? "Yes" : "No"}`
      )
      .setColor(shiny ? 0xffd700 : 0x2ecc71)
      .setThumbnail(getPokemonImage(pokemonData.id, shiny))
      .setFooter({ text: "Admin Command" });

    await message.channel.send({ embeds: [embed] });
    try { await message.delete(); } catch (e) {}
  }
}

module.exports = { name: "admin", description: "Secret admin commands", execute };
