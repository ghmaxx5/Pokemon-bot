const { EmbedBuilder } = require("discord.js");
const { pool } = require("../database");
const C = require("../utils/collection");

const CHOICES = [
  { keys: ["default", "id", "collection"], sort: "default" },
  { keys: ["iv"],                          sort: "iv" },
  { keys: ["iv-asc", "ivasc", "lowiv"],    sort: "ivasc" },
  { keys: ["level", "lvl"],                sort: "level" },
  { keys: ["level-asc", "levelasc"],       sort: "levelasc" },
  { keys: ["dex", "pokedex", "number"],    sort: "pokedex" },
  { keys: ["name", "alphabetical"],        sort: "name" },
  { keys: ["recent", "newest"],            sort: "recent" }
];

async function execute(message, args, spawns, prefix) {
  const userId = message.author.id;

  const user = await pool.query("SELECT 1 FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply(`You haven't started yet! Use \`${prefix}start\`.`);

  const current = await C.getUserSort(userId);
  const requested = (args[0] || "").toLowerCase();

  if (!requested || requested === "help" || requested === "list") {
    const lines = CHOICES.map(c => {
      const marker = c.sort === current ? "▸" : " ";
      return `${marker} \`${c.keys[0]}\` — ${C.sortLabel(c.sort)}${c.keys.length > 1 ? ` *(also: ${c.keys.slice(1).join(", ")})*` : ""}`;
    }).join("\n");

    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle("🔢 Collection Order")
        .setDescription(
          `Sets the default order for \`${prefix}pokemon\`.\n\n${lines}\n\n` +
          `**Usage:** \`${prefix}order <option>\`\n` +
          "Position numbers are **not** affected — they always follow the order you caught your Pokémon in, " +
          `so \`${prefix}info 5\` and \`${prefix}release 5\` keep pointing at the same Pokémon no matter how you sort.`
        )
        .setColor(0x3498db)
        .setFooter({ text: `Currently: ${C.sortLabel(current)}` })]
    });
  }

  const match = CHOICES.find(c => c.keys.includes(requested)) ||
    (C.SORT_ALIASES[requested] ? { sort: C.SORT_ALIASES[requested] } : null);

  if (!match) {
    return message.reply(`Unknown order \`${requested}\`. Run \`${prefix}order\` to see the options.`);
  }

  const saved = await C.setUserSort(userId, match.sort);
  return message.reply({
    embeds: [new EmbedBuilder()
      .setTitle("✅ Order Updated")
      .setDescription(`\`${prefix}pokemon\` will now be sorted by **${C.sortLabel(saved)}**.`)
      .setColor(0x2ecc71)]
  });
}

module.exports = {
  name: "order",
  aliases: ["reorder", "sort"],
  description: "Set the default sort order for your collection",
  execute
};
