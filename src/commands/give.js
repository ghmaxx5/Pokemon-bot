const { pool } = require("../database");

async function execute(message, args) {
  const userId = message.author.id;

  if (args.length < 2) return message.reply("Usage: `p!give @user <amount>`");

  const mentioned = message.mentions.users.first();
  if (!mentioned) return message.reply("Please mention a user!");
  if (mentioned.id === userId) return message.reply("You can't give Cybercoins to yourself!");

  const amount = parseInt(args[args.length - 1]);
  if (isNaN(amount) || amount < 1) return message.reply("Please specify a valid amount.");

  const sender = await pool.query("SELECT balance FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (sender.rows.length === 0) return message.reply("You haven't started yet!");
  if (sender.rows[0].balance < amount) return message.reply("You don't have enough Cybercoins!");

  const receiver = await pool.query("SELECT 1 FROM users WHERE user_id = $1 AND started = TRUE", [mentioned.id]);
  if (receiver.rows.length === 0) return message.reply("That user hasn't started yet!");

  await pool.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [amount, userId]);
  await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [amount, mentioned.id]);

  message.reply(`You gave **${amount.toLocaleString()}** Cybercoins to ${mentioned}!`);
}

module.exports = { name: "give", aliases: ["pay", "send"], description: "Give Cybercoins to another user", execute };
