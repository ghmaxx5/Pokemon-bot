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
    const multiRows = await pool.query("SELECT channel_id FROM spawn_channels WHERE guild_id = $1", [guildId]);

    let spawnStr;
    if (multiRows.rows.length > 0) {
      spawnStr = multiRows.rows.map(r => `<#${r.channel_id}>`).join(", ");
    } else if (cfg.spawn_channel_id) {
      spawnStr = `<#${cfg.spawn_channel_id}>`;
    } else {
      spawnStr = "All channels (no redirect set)";
    }

    const embed = new EmbedBuilder()
      .setTitle("⚙️ Server Configuration")
      .addFields(
        { name: "Prefix", value: `\`${cfg.prefix || "p!"}\``, inline: true },
        { name: "Spawn Channel(s)", value: spawnStr, inline: false },
      )
      .addFields({ name: "Commands", value:
        "`p!server prefix <prefix>` — change prefix\n" +
        "`p!server spawn add #channel` — add a spawn channel\n" +
        "`p!server spawn remove #channel` — remove a spawn channel\n" +
        "`p!server spawn list` — list all spawn channels\n" +
        "`p!server spawn reset` — spawn in all channels (no redirect)"
      })
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
    return message.reply(`✅ Server prefix updated to \`${newPrefix}\``);
  }

  if (subcommand === "spawn" || subcommand === "channel") {
    const action = args[1]?.toLowerCase();
    const channel = message.mentions.channels.first();

    // ── add ──
    if (action === "add") {
      if (!channel) return message.reply("Usage: `p!server spawn add #channel`");
      await pool.query(
        `INSERT INTO spawn_channels (guild_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [guildId, channel.id]
      );
      // Clear legacy single channel
      await pool.query(
        `UPDATE server_config SET spawn_channel_id = NULL WHERE guild_id = $1`,
        [guildId]
      );
      const all = await pool.query("SELECT channel_id FROM spawn_channels WHERE guild_id = $1", [guildId]);
      const list = all.rows.map(r => `<#${r.channel_id}>`).join(", ");
      return message.reply(`✅ Added ${channel} as a spawn channel.\n**Current spawn channels:** ${list}`);
    }

    // ── remove ──
    if (action === "remove") {
      if (!channel) return message.reply("Usage: `p!server spawn remove #channel`");
      await pool.query(
        `DELETE FROM spawn_channels WHERE guild_id = $1 AND channel_id = $2`,
        [guildId, channel.id]
      );
      const all = await pool.query("SELECT channel_id FROM spawn_channels WHERE guild_id = $1", [guildId]);
      const list = all.rows.length > 0 ? all.rows.map(r => `<#${r.channel_id}>`).join(", ") : "None (spawns in all channels)";
      return message.reply(`✅ Removed ${channel} from spawn channels.\n**Remaining:** ${list}`);
    }

    // ── list ──
    if (action === "list") {
      const all = await pool.query("SELECT channel_id FROM spawn_channels WHERE guild_id = $1", [guildId]);
      if (all.rows.length === 0) return message.reply("No spawn channels set — Pokémon spawn in all channels.");
      const list = all.rows.map(r => `<#${r.channel_id}>`).join("\n");
      return message.reply(`**Spawn channels:**\n${list}`);
    }

    // ── reset ──
    if (action === "reset" || action === "all") {
      await pool.query(`DELETE FROM spawn_channels WHERE guild_id = $1`, [guildId]);
      await pool.query(
        `INSERT INTO server_config (guild_id, spawn_channel_id) VALUES ($1, NULL)
         ON CONFLICT (guild_id) DO UPDATE SET spawn_channel_id = NULL`,
        [guildId]
      );
      return message.reply("✅ Reset! Pokémon will now spawn in **all channels** based on chat activity.");
    }

    // Legacy: p!server spawn #channel (single channel add)
    if (channel) {
      await pool.query(
        `INSERT INTO spawn_channels (guild_id, channel_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [guildId, channel.id]
      );
      await pool.query(`UPDATE server_config SET spawn_channel_id = NULL WHERE guild_id = $1`, [guildId]);
      return message.reply(`✅ Added ${channel} as a spawn channel. Use \`p!server spawn add #channel\` to add more!`);
    }

    return message.reply(
      "**Spawn channel commands:**\n" +
      "`p!server spawn add #channel` — add spawn channel\n" +
      "`p!server spawn remove #channel` — remove spawn channel\n" +
      "`p!server spawn list` — list channels\n" +
      "`p!server spawn reset` — spawn everywhere"
    );
  }

  message.reply("Usage: `p!server prefix <prefix>` or `p!server spawn add/remove/list/reset`");
}

module.exports = { name: "server", aliases: ["config", "settings"], description: "Configure server settings", execute };
