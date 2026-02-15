const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");

async function execute(message, args) {
  const userId = message.author.id;
  const result = await pool.query("SELECT balance FROM users WHERE user_id = $1 AND started = TRUE", [userId]);

  if (result.rows.length === 0) {
    return message.reply("You haven't started yet! Use `p!start` to begin.");
  }

  const embed = new EmbedBuilder()
    .setTitle(`${message.author.username}'s Balance`)
    .setDescription(`You have **${result.rows[0].balance.toLocaleString()}** credits.`)
    .setColor(0xf1c40f);

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "balance", aliases: ["bal", "credits"], description: "Check your balance", execute };
