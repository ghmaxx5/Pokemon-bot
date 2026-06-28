const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const user = await client.query("SELECT last_daily FROM users WHERE user_id = $1 AND started = TRUE FOR UPDATE", [userId]);
    if (user.rows.length === 0) {
      await client.query("ROLLBACK");
      return message.reply(`You haven't started yet! Use \`${prefix}start\` to begin.`);
    }

    const lastDaily = user.rows[0].last_daily;
    const now = new Date();

    if (lastDaily) {
      const diff = now.getTime() - new Date(lastDaily).getTime();
      const cooldown = 24 * 60 * 60 * 1000;
      if (diff < cooldown) {
        const remaining = cooldown - diff;
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        await client.query("ROLLBACK");
        return message.reply(`You can claim your daily reward in **${hours}h ${minutes}m**!`);
      }
    }

    const reward = Math.floor(Math.random() * 500) + 500;
    await client.query("UPDATE users SET balance = balance + $1, last_daily = NOW() WHERE user_id = $2", [reward, userId]);
    await client.query("COMMIT");

    const embed = new EmbedBuilder()
      .setTitle("Daily Reward!")
      .setDescription(`You received **${reward}** Cybercoins!\nCome back tomorrow for more!`)
      .setColor(0xf1c40f);

    message.channel.send({ embeds: [embed] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    message.reply("Transaction failed. Please try again.");
  } finally {
    client.release();
  }
}

module.exports = { name: "daily", description: "Claim your daily reward", execute };
