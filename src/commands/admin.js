const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { pool } = require("../database");

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
}

module.exports = { name: "admin", description: "Secret admin commands", execute };
