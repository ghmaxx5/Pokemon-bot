const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const PAGES = [
  {
    label: "🌟 Getting Started",
    color: 0x9b59b6,
    fields: [
      {
        name: "━━━ 🚀 Begin Your Journey ━━━",
        value:
          "`c!start` — Start your Pokémon adventure & pick a starter\n" +
          "`c!daily` — Claim daily Cybercoin reward\n" +
          "`c!profile` — View your trainer profile\n" +
          "`c!ping` — Check bot latency & status\n" +
          "`c!help` — Show this help menu"
      },
      {
        name: "━━━ 💡 How Spawning Works ━━━",
        value:
          "Pokémon appear as members chat — **any channel** counts!\n" +
          "They spawn in your configured spawn channel(s).\n" +
          "Type `c!catch <name>` to catch the Pokémon.\n" +
          "Use `c!hint` if you're unsure of the name.\n" +
          "✨ Shiny is revealed only after catching — stay sharc!"
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
          "`c!catch <name>` — Catch a wild Pokémon\n" +
          "`c!hint` — Get a hint for the current wild Pokémon\n" +
          "`c!pokemon` — View your Pokémon collection\n" +
          "`c!info <#>` — Detailed info about a Pokémon\n" +
          "`c!select <#>` — Set active Pokémon\n" +
          "`c!favorite <#>` — Toggle favorite\n" +
          "`c!nickname <#> <name>` — Give a nickname\n" +
          "`c!release <#>` — Release a Pokémon ⚠️"
      },
      {
        name: "━━━ 🔍 Filters for c!pokemon ━━━",
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
          "`c!evolve` — Evolve your active Pokémon\n" +
          "`c!dex <name/id>` — Pokédex entry (Normal/Shiny/Mega/G-Max tabs)"
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
          "`c!battle @user` — Challenge a trainer to 3v3 battle\n" +
          "`c!battle ai` — Fight an AI trainer (3v3)\n" +
          "`c!moves <#>` — View & equip moves for a Pokémon\n" +
          "`c!moves set <slot> <move>` — Equip move to slot 1-4\n" +
          "`c!moveinfo <move>` — Detailed move info"
      },
      {
        name: "━━━ ✨ Special Forms in Battle ━━━",
        value:
          "**Mega Evolution** — Hold a Mega Stone, press Mega button\n" +
          "**Gigantamax** — Hold a G-Max Ring, press G-Max button\n" +
          "**Z-Moves** — Hold a Z-Ring, press Z-Power for a 1.6x super attack\n" +
          "**Primal Reversion** — Hold Mega Stone (Kyogre/Groudon)\n" +
          "Forms and boosts apply in-battle one-shot style"
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
          "`c!balance` — Check Cybercoin balance\n" +
          "`c!give @user <amount>` — Send Cybercoins to a user\n" +
          "`c!daily` — Claim daily reward"
      },
      {
        name: "━━━ 🛒 Shop ━━━",
        value:
          "`c!shop` — Browse all available items\n" +
          "`c!shop buy <item> [qty]` — Purchase an item\n" +
          "`c!shop sell <item> [qty]` — Sell items for 50% Cybercoins\n" +
          "`c!shop use <item> [pos]` — Use item on a Pokémon\n" +
          "`c!shop hold <item> <#>` — Give item to Pokémon to hold (Mega Stone/G-Max Ring/Z-Ring)\n" +
          "`c!shop unhold <#>` — Remove held item\n" +
          "`c!inventory` — View your backpack & held items"
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
          "`c!market` — Browse all listings\n" +
          "`c!market list <#> <price>` — List Pokémon for sale\n" +
          "`c!market buy <listing id>` — Buy a listed Pokémon\n" +
          "`c!market remove <listing id>` — Remove your listing\n" +
          "`c!market search <name>` — Search by Pokémon name"
      },
      {
        name: "━━━ 🤝 Trading ━━━",
        value:
          "`c!trade @user` — Initiate a trade\n" +
          "`c!trade add <#>` — Add Pokémon to the trade\n" +
          "`c!trade confirm` — Confirm the trade\n" +
          "`c!trade cancel` — Cancel the trade"
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
          "`c!server` — View current server settings\n" +
          "`c!server prefix <prefix>` — Change command prefix\n" +
          "`c!server spawn add #channel` — Add a spawn channel\n" +
          "`c!server spawn remove #channel` — Remove a spawn channel\n" +
          "`c!server spawn list` — List all spawn channels\n" +
          "`c!server spawn reset` — Spawn in all channels"
      },
      {
        name: "━━━ 🔐 Admin Commands (Requires Admin + Secret) ━━━",
        value:
          "`c!admin <secret> spawn wild <pokemon> [iv%] [shiny]`\n" +
          "↳ Spawns a Pokémon in channel — anyone can catch\n" +
          "↳ Example: `spawn wild charizard 100 shiny`\n\n" +
          "`c!admin <secret> spawn @user <pokemon> [iv%] [level] [shiny]`\n" +
          "↳ Gives Pokémon directly to a user\n\n" +
          "`c!admin <secret> addcoins @user <amount>`\n" +
          "`c!admin <secret> setcoins @user <amount>`\n" +
          "`c!admin <secret> addall <amount>` — Give coins to everyone"
      }
    ]
  }
];

function buildEmbed(page, pageIndex, prefix) {
  const embed = new EmbedBuilder()
    .setTitle(`📖 CyberDex Help  •  ${page.label}`)
    .setColor(page.color)
    .setFooter({ text: `Page ${pageIndex + 1} of ${PAGES.length}  •  Use the buttons to navigate` });

  for (const field of page.fields) {
    const valueWithPrefix = field.value.replace(/c!/g, prefix);
    embed.addFields({ name: field.name, value: valueWithPrefix, inline: false });
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

async function execute(message, args, spawns, prefix) {
  let currentIndex = 0;

  const msg = await message.channel.send({
    embeds: [buildEmbed(PAGES[0], 0, prefix)],
    components: [buildRow(0)]
  });

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === message.author.id,
    time: 120000
  });

  collector.on("collect", async i => {
    if (i.customId === "help_prev" && currentIndex > 0) currentIndex--;
    else if (i.customId === "help_next" && currentIndex < PAGES.length - 1) currentIndex++;
    await i.update({ embeds: [buildEmbed(PAGES[currentIndex], currentIndex, prefix)], components: [buildRow(currentIndex)] });
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
