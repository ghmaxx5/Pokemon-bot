const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");

async function execute(message, args) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet! Use `p!start` to begin.");

  const lastDaily = user.rows[0].last_daily;
  const now = new Date();

  if (lastDaily) {
    const diff = now.getTime() - new Date(lastDaily).getTime();
    const cooldown = 24 * 60 * 60 * 1000;
    if (diff < cooldown) {
      const remaining = cooldown - diff;
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      return message.reply(`You can claim your daily reward in **${hours}h ${minutes}m**!`);
    }
  }

  const reward = Math.floor(Math.random() * 500) + 500;
  await pool.query("UPDATE users SET balance = balance + $1, last_daily = NOW() WHERE user_id = $2", [reward, userId]);

  const embed = new EmbedBuilder()
    .setTitle("Daily Reward!")
    .setDescription(`You received **${reward}** Cybercoins!\nCome back tomorrow for more!`)
    .setColor(0xf1c40f);

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "daily", description: "Claim your daily reward", execute };
