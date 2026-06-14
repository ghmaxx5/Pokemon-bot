const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");

async function execute(message, args) {
  const userId = message.author.id;
  const result = await pool.query(
    `SELECT u.balance, 
            (SELECT COUNT(*) FROM pokemon WHERE user_id = $1) as pokemon_count,
            (SELECT COUNT(*) FROM pokemon WHERE user_id = $1 AND shiny = TRUE) as shiny_count
     FROM users u WHERE u.user_id = $1 AND u.started = TRUE`,
    [userId]
  );

  if (result.rows.length === 0) {
    return message.reply("You haven't started yet! Use `c!start` to begin.");
  }

  const { balance, pokemon_count, shiny_count } = result.rows[0];

  const tier = balance >= 1000000 ? { name: "Cyber Tycoon", icon: "👑", color: 0xffd700 }
    : balance >= 500000 ? { name: "Crypto Lord", icon: "💎", color: 0xe91e63 }
    : balance >= 100000 ? { name: "Digital Baron", icon: "🏆", color: 0x9b59b6 }
    : balance >= 50000 ? { name: "Cyber Elite", icon: "⭐", color: 0x3498db }
    : balance >= 10000 ? { name: "Net Runner", icon: "🔷", color: 0x2ecc71 }
    : { name: "Trainer", icon: "🔹", color: 0x95a5a6 };

  const coinBar = Math.min(20, Math.floor(balance / 5000));
  const bar = "█".repeat(coinBar) + "░".repeat(20 - coinBar);

  const embed = new EmbedBuilder()
    .setTitle(`${tier.icon} ${message.author.username}'s Wallet`)
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 **${balance.toLocaleString()}** Cybercoins\n` +
      `\`${bar}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `${tier.icon} **Rank:** ${tier.name}\n` +
      `📦 **Pokemon:** ${pokemon_count}\n` +
      `✨ **Shinies:** ${shiny_count}`
    )
    .setColor(tier.color)
    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: "Earn Cybercoins: c!daily • c!battle • c!market sell" });

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "balance", aliases: ["bal", "credits", "wallet"], description: "Check your Cybercoin balance", execute };
