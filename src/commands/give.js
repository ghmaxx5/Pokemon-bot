const { pool } = require("../database");

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;

  if (args.length < 2) return message.reply(`Usage: \`${prefix}give @user <amount>\``);

  const mentioned = message.mentions.users.first();
  if (!mentioned) return message.reply("Please mention a user!");
  if (mentioned.id === userId) return message.reply("You can't give Cybercoins to yourself!");

  const amount = parseInt(args[args.length - 1]);
  if (isNaN(amount) || amount < 1) return message.reply("Please specify a valid amount.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sender = await client.query("SELECT balance FROM users WHERE user_id = $1 AND started = TRUE FOR UPDATE", [userId]);
    if (sender.rows.length === 0) {
      await client.query("ROLLBACK");
      return message.reply("You haven't started yet!");
    }
    if (sender.rows[0].balance < amount) {
      await client.query("ROLLBACK");
      return message.reply("You don't have enough Cybercoins!");
    }

    const receiver = await client.query("SELECT 1 FROM users WHERE user_id = $1 AND started = TRUE", [mentioned.id]);
    if (receiver.rows.length === 0) {
      await client.query("ROLLBACK");
      return message.reply("That user hasn't started yet!");
    }

    await client.query("UPDATE users SET balance = balance - $1 WHERE user_id = $2", [amount, userId]);
    await client.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [amount, mentioned.id]);

    await client.query("COMMIT");
    message.reply(`You gave **${amount.toLocaleString()}** Cybercoins to ${mentioned}!`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    message.reply("Transaction failed. Please try again.");
  } finally {
    client.release();
  }
}

module.exports = { name: "give", aliases: ["pay", "send"], description: "Give Cybercoins to another user", execute };
