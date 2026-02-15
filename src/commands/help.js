const { EmbedBuilder } = require("discord.js");

const COMMAND_CATEGORIES = {
  "Getting Started": [
    { name: "start", desc: "Begin your Pokemon journey and pick a starter" },
    { name: "help", desc: "Show this help message" },
    { name: "daily", desc: "Claim your daily credits reward" }
  ],
  "Pokemon": [
    { name: "catch / c", desc: "Catch a wild Pokemon" },
    { name: "hint / h", desc: "Get a hint about the wild Pokemon" },
    { name: "pokemon / p", desc: "View your Pokemon collection" },
    { name: "info / i", desc: "View detailed info about a Pokemon" },
    { name: "select / s", desc: "Select your active Pokemon" },
    { name: "favorite / fav", desc: "Toggle favorite on a Pokemon" },
    { name: "nickname / nn", desc: "Set a nickname for a Pokemon" },
    { name: "release", desc: "Release a Pokemon (permanent)" },
    { name: "evolve", desc: "Evolve your Pokemon" },
    { name: "dex", desc: "View your Pokedex progress" }
  ],
  "Economy": [
    { name: "balance / bal", desc: "Check your credit balance" },
    { name: "give / pay", desc: "Give credits to another user" },
    { name: "daily", desc: "Claim daily reward" }
  ],
  "Market": [
    { name: "market", desc: "Browse market listings" },
    { name: "market list", desc: "List a Pokemon for sale" },
    { name: "market buy", desc: "Buy a listed Pokemon" },
    { name: "market remove", desc: "Remove your listing" },
    { name: "market search", desc: "Search listings by name" }
  ],
  "Trading": [
    { name: "trade @user", desc: "Start a trade" },
    { name: "trade add", desc: "Add Pokemon to trade" },
    { name: "trade confirm", desc: "Confirm the trade" },
    { name: "trade cancel", desc: "Cancel the trade" }
  ],
  "Battling": [
    { name: "battle @user", desc: "Challenge someone to battle" },
    { name: "battle accept", desc: "Accept a battle challenge" },
    { name: "battle decline", desc: "Decline a battle challenge" }
  ],
  "Server Settings": [
    { name: "server", desc: "View server configuration" },
    { name: "server prefix", desc: "Change command prefix" },
    { name: "server channel", desc: "Set spawn channel" }
  ]
};

async function execute(message, args) {
  if (args.length > 0) {
    const cmdName = args[0].toLowerCase();
    for (const [cat, cmds] of Object.entries(COMMAND_CATEGORIES)) {
      const found = cmds.find(c => c.name.toLowerCase().includes(cmdName));
      if (found) {
        const embed = new EmbedBuilder()
          .setTitle(`Command: ${found.name}`)
          .setDescription(found.desc)
          .setColor(0x3498db);
        return message.channel.send({ embeds: [embed] });
      }
    }
    return message.reply("Command not found.");
  }

  const embed = new EmbedBuilder()
    .setTitle("Pokemon Bot - Commands")
    .setDescription("Use `p!<command>` to run a command. Use `p!help <command>` for more info.\n\n**Pokemon Filter Flags:**\n`p!pokemon --shiny` `--fav` `--legendary` `--mythical`\n`--type <type>` `--name <name>` `--iv` `--level`")
    .setColor(0xe74c3c);

  for (const [category, commands] of Object.entries(COMMAND_CATEGORIES)) {
    const cmdList = commands.map(c => `\`${c.name}\` — ${c.desc}`).join("\n");
    embed.addFields({ name: category, value: cmdList, inline: false });
  }

  embed.setFooter({ text: "Pokemon spawn randomly as you chat! Catch them all!" });

  message.channel.send({ embeds: [embed] });
}

module.exports = { name: "help", aliases: ["commands"], description: "Show all commands", execute };
