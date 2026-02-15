const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");

async function execute(message, args) {
  const type = args[0]?.toLowerCase() || "pokemon";

  if (type === "pokemon" || type === "p") {
    const result = await pool.query(
      `SELECT u.user_id, u.username, COUNT(p.id) as count
       FROM users u LEFT JOIN pokemon p ON u.user_id = p.user_id
       WHERE u.started = TRUE
       GROUP BY u.user_id, u.username
       ORDER BY count DESC LIMIT 10`
    );

    const lines = result.rows.map((r, i) =>
      `**${i + 1}.** ${r.username || `<@${r.user_id}>`} — **${r.count}** Pokemon`
    );

    const embed = new EmbedBuilder()
      .setTitle("Leaderboard — Most Pokemon")
      .setDescription(lines.join("\n") || "No data yet.")
      .setColor(0xf1c40f);

    return message.channel.send({ embeds: [embed] });
  }

  if (type === "balance" || type === "bal" || type === "credits") {
    const result = await pool.query(
      `SELECT user_id, username, balance FROM users WHERE started = TRUE ORDER BY balance DESC LIMIT 10`
    );

    const lines = result.rows.map((r, i) =>
      `**${i + 1}.** ${r.username || `<@${r.user_id}>`} — **${r.balance.toLocaleString()}** credits`
    );

    const embed = new EmbedBuilder()
      .setTitle("Leaderboard — Richest Trainers")
      .setDescription(lines.join("\n") || "No data yet.")
      .setColor(0xf1c40f);

    return message.channel.send({ embeds: [embed] });
  }

  if (type === "shiny" || type === "shinies") {
    const result = await pool.query(
      `SELECT u.user_id, u.username, COUNT(p.id) as count
       FROM users u LEFT JOIN pokemon p ON u.user_id = p.user_id AND p.shiny = TRUE
       WHERE u.started = TRUE
       GROUP BY u.user_id, u.username
       ORDER BY count DESC LIMIT 10`
    );

    const lines = result.rows.map((r, i) =>
      `**${i + 1}.** ${r.username || `<@${r.user_id}>`} — **${r.count}** ✨ Shinies`
    );

    const embed = new EmbedBuilder()
      .setTitle("Leaderboard — Most Shinies")
      .setDescription(lines.join("\n") || "No data yet.")
      .setColor(0xffd700);

    return message.channel.send({ embeds: [embed] });
  }

  message.reply("Usage: `p!leaderboard [pokemon|balance|shiny]`");
}

module.exports = { name: "leaderboard", aliases: ["lb", "top"], description: "View leaderboards", execute };
