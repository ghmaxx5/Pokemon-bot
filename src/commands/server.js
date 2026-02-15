const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");

async function execute(message, args) {
  if (!message.member.permissions.has("ManageGuild")) {
    return message.reply("You need the **Manage Server** permission to use this command.");
  }

  const guildId = message.guild.id;

  if (!args.length) {
    const config = await pool.query("SELECT * FROM server_config WHERE guild_id = $1", [guildId]);
    const cfg = config.rows[0] || { prefix: "p!", spawn_channel_id: null };

    const embed = new EmbedBuilder()
      .setTitle("Server Configuration")
      .addFields(
        { name: "Prefix", value: cfg.prefix || "p!", inline: true },
        { name: "Spawn Channel", value: cfg.spawn_channel_id ? `<#${cfg.spawn_channel_id}>` : "All channels", inline: true }
      )
      .setColor(0x3498db);

    return message.channel.send({ embeds: [embed] });
  }

  const subcommand = args[0].toLowerCase();

  if (subcommand === "prefix") {
    if (!args[1]) return message.reply("Usage: `p!server prefix <new prefix>`");
    const newPrefix = args[1].substring(0, 10);

    await pool.query(
      `INSERT INTO server_config (guild_id, prefix) VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET prefix = $2`,
      [guildId, newPrefix]
    );

    return message.reply(`Server prefix updated to \`${newPrefix}\``);
  }

  if (subcommand === "channel" || subcommand === "spawn") {
    const channel = message.mentions.channels.first();

    if (args[1] === "all" || args[1] === "reset") {
      await pool.query(
        `INSERT INTO server_config (guild_id, spawn_channel_id) VALUES ($1, NULL)
         ON CONFLICT (guild_id) DO UPDATE SET spawn_channel_id = NULL`,
        [guildId]
      );
      return message.reply("Pokemon will now spawn in all channels.");
    }

    if (!channel) return message.reply("Usage: `p!server channel #channel` or `p!server channel all`");

    await pool.query(
      `INSERT INTO server_config (guild_id, spawn_channel_id) VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET spawn_channel_id = $2`,
      [guildId, channel.id]
    );

    return message.reply(`Pokemon will now only spawn in ${channel}.`);
  }

  message.reply("Usage: `p!server prefix <prefix>` or `p!server channel <#channel>`");
}

module.exports = { name: "server", aliases: ["config", "settings"], description: "Configure server settings", execute };
