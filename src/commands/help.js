const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const PAGES = [
  {
    label: "🌟 Getting Started",
    color: 0x9b59b6,
    fields: [
      {
        name: "━━━ 🚀 Begin Your Journey ━━━",
        value:
          "`p!start` — Start your Pokémon adventure & pick a starter\n" +
          "`p!daily` — Claim daily Cybercoin reward\n" +
          "`p!profile` — View your trainer profile\n" +
          "`p!ping` — Check bot latency & status\n" +
          "`p!help` — Show this help menu"
      },
      {
        name: "━━━ 💡 How Spawning Works ━━━",
        value:
          "Pokémon appear as members chat — **any channel** counts!\n" +
          "They spawn in your configured spawn channel(s).\n" +
          "Type `p!catch <name>` to catch the Pokémon.\n" +
          "Use `p!hint` if you're unsure of the name.\n" +
          "✨ Shiny is revealed only after catching — stay sharp!"
      }
    ]
  },
  {
    label: "🎮 Pokémon",
    color: 0xe74c3c,
    fields: [
      {
        name: "━━━ 📦 Collection ━━━",
        value:
          "`p!catch <name>` — Catch a wild Pokémon\n" +
          "`p!hint` — Get a hint for the current wild Pokémon\n" +
          "`p!pokemon` — View your Pokémon collection\n" +
          "`p!info <#>` — Detailed info about a Pokémon\n" +
          "`p!select <#>` — Set active Pokémon\n" +
          "`p!favorite <#>` — Toggle favorite\n" +
          "`p!nickname <#> <name>` — Give a nickname\n" +
          "`p!release <#>` — Release a Pokémon ⚠️"
      },
      {
        name: "━━━ 🔍 Filters for p!pokemon ━━━",
        value:
          "`--shiny` `--fav` `--legendary` `--mythical`\n" +
          "`--type <type>` — filter by type\n" +
          "`--name <n>` — filter by name\n" +
          "`--iv` — sort by IV%\n" +
          "`--level` — sort by level"
      },
      {
        name: "━━━ 🧬 Evolution & Pokédex ━━━",
        value:
          "`p!evolve` — Evolve your active Pokémon\n" +
          "`p!dex <name/id>` — Pokédex entry (Normal/Shiny/Mega/G-Max tabs)"
      }
    ]
  },
  {
    label: "⚔️ Battling",
    color: 0xe67e22,
    fields: [
      {
        name: "━━━ 🥊 Battle Commands ━━━",
        value:
          "`p!battle @user` — Challenge a trainer to 3v3 battle\n" +
          "`p!battle ai` — Fight an AI trainer (3v3)\n" +
          "`p!moves <#>` — View & equip moves for a Pokémon\n" +
          "`p!moves set <slot> <move>` — Equip move to slot 1-4\n" +
          "`p!moveinfo <move>` — Detailed move info"
      },
      {
        name: "━━━ ✨ Special Forms in Battle ━━━",
        value:
          "**Mega Evolution** — Hold a Mega Stone, press Mega button\n" +
          "**Gigantamax** — Hold a G-Max Ring, press G-Max button\n" +
          "**Primal Reversion** — Hold Primal Orb (Kyogre/Groudon)\n" +
          "Forms revert after the battle ends"
      }
    ]
  },
  {
    label: "💰 Economy & Shop",
    color: 0xf1c40f,
    fields: [
      {
        name: "━━━ 💵 Economy ━━━",
        value:
          "`p!balance` — Check Cybercoin balance\n" +
          "`p!give @user <amount>` — Send Cybercoins to a user\n" +
          "`p!daily` — Claim daily reward"
      },
      {
        name: "━━━ 🛒 Shop ━━━",
        value:
          "`p!shop` — Browse all available items\n" +
          "`p!shop buy <item>` — Purchase an item\n" +
          "`p!shop use <item> <#>` — Use item on a Pokémon\n" +
          "`p!shop hold <item> <#>` — Give item to Pokémon to hold\n" +
          "`p!shop unhold <#>` — Remove held item\n" +
          "`p!inventory` — View your backpack & held items"
      }
    ]
  },
  {
    label: "🏪 Market & Trading",
    color: 0x2ecc71,
    fields: [
      {
        name: "━━━ 🏬 Market ━━━",
        value:
          "`p!market` — Browse all listings\n" +
          "`p!market list <#> <price>` — List Pokémon for sale\n" +
          "`p!market buy <listing id>` — Buy a listed Pokémon\n" +
          "`p!market remove <listing id>` — Remove your listing\n" +
          "`p!market search <name>` — Search by Pokémon name"
      },
      {
        name: "━━━ 🤝 Trading ━━━",
        value:
          "`p!trade @user` — Initiate a trade\n" +
          "`p!trade add <#>` — Add Pokémon to the trade\n" +
          "`p!trade confirm` — Confirm the trade\n" +
          "`p!trade cancel` — Cancel the trade"
      }
    ]
  },
  {
    label: "⚙️ Server & Admin",
    color: 0x3498db,
    fields: [
      {
        name: "━━━ 🖥️ Server Config (Requires Manage Server) ━━━",
        value:
          "`p!server` — View current server settings\n" +
          "`p!server prefix <prefix>` — Change command prefix\n" +
          "`p!server spawn add #channel` — Add a spawn channel\n" +
          "`p!server spawn remove #channel` — Remove a spawn channel\n" +
          "`p!server spawn list` — List all spawn channels\n" +
          "`p!server spawn reset` — Spawn in all channels"
      },
      {
        name: "━━━ 🔐 Admin Commands (Requires Admin + Secret) ━━━",
        value:
          "`p!admin <secret> spawn wild <pokemon> [iv%] [shiny]`\n" +
          "↳ Spawns a Pokémon in channel — anyone can catch\n" +
          "↳ Example: `spawn wild charizard 100 shiny`\n\n" +
          "`p!admin <secret> spawn @user <pokemon> [iv%] [level] [shiny]`\n" +
          "↳ Gives Pokémon directly to a user\n\n" +
          "`p!admin <secret> addcoins @user <amount>`\n" +
          "`p!admin <secret> setcoins @user <amount>`\n" +
          "`p!admin <secret> addall <amount>` — Give coins to everyone"
      }
    ]
  }
];

function buildEmbed(page, pageIndex) {
  const embed = new EmbedBuilder()
    .setTitle(`📖 CyberDex Help  •  ${page.label}`)
    .setColor(page.color)
    .setFooter({ text: `Page ${pageIndex + 1} of ${PAGES.length}  •  Use the buttons to navigate` });

  for (const field of page.fields) {
    embed.addFields({ name: field.name, value: field.value, inline: false });
  }
  return embed;
}

function buildRow(currentIndex) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("help_prev")
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex === 0),
    new ButtonBuilder()
      .setCustomId("help_page")
      .setLabel(`${currentIndex + 1} / ${PAGES.length}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("help_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentIndex === PAGES.length - 1)
  );
}

async function execute(message) {
  let currentIndex = 0;

  const msg = await message.channel.send({
    embeds: [buildEmbed(PAGES[0], 0)],
    components: [buildRow(0)]
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === message.author.id,
    time: 120000
  });

  collector.on("collect", async i => {
    if (i.customId === "help_prev" && currentIndex > 0) currentIndex--;
    else if (i.customId === "help_next" && currentIndex < PAGES.length - 1) currentIndex++;
    await i.update({ embeds: [buildEmbed(PAGES[currentIndex], currentIndex)], components: [buildRow(currentIndex)] });
  });

  collector.on("end", async () => {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("hp").setLabel("◀ Previous").setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("hc").setLabel(`${currentIndex + 1} / ${PAGES.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId("hn").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    msg.edit({ components: [disabledRow] }).catch(() => {});
  });
}

module.exports = { name: "help", aliases: ["commands", "h"], description: "Show all commands", execute };
