const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const pokemonList = [
  { name: "pikachu", id: 25 },
  { name: "charmander", id: 4 },
  { name: "bulbasaur", id: 1 },
  { name: "squirtle", id: 7 },
  { name: "eevee", id: 133 },
  { name: "jigglypuff", id: 39 },
  { name: "meowth", id: 52 },
  { name: "psyduck", id: 54 }
];

let activeSpawn = null;
const users = {};

client.once("ready", () => {
  console.log("✅ Pokémon bot is online");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const msg = message.content.toLowerCase();

  // PING
  if (msg === "ping") {
    message.reply("pong 🏓");
    return;
  }

  // CATCH
  if (msg.startsWith("!c ")) {
    if (!activeSpawn) return;

    const guess = msg.slice(3).trim();

    if (guess !== activeSpawn.name) {
      message.reply("❌ Wrong Pokémon!");
      return;
    }

    if (!users[message.author.id]) {
      users[message.author.id] = [];
    }

    users[message.author.id].push(activeSpawn);

    message.reply(
      `🎉 You caught **${capitalize(activeSpawn.name)}**!\n⭐ Level: **${activeSpawn.level}**\n🧬 IV: **${activeSpawn.iv}%**`
    );

    activeSpawn = null;
    return;
  }

  // LIST POKÉMON
  if (msg === "!p") {
    const list = users[message.author.id];
    if (!list || list.length === 0) {
      message.reply("You don’t have any Pokémon yet.");
      return;
    }

    let text = "";
    list.forEach((p, i) => {
      text += `**${i + 1}.** ${capitalize(p.name)} | Lv. ${p.level}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle("📦 Your Pokémon")
      .setDescription(text);

    message.channel.send({ embeds: [embed] });
    return;
  }

  // INFO
  if (msg.startsWith("!info ")) {
    const num = parseInt(msg.split(" ")[1]);
    const list = users[message.author.id];

    if (!list || !list[num - 1]) {
      message.reply("Invalid Pokémon number.");
      return;
    }

    const p = list[num - 1];

    const embed = new EmbedBuilder()
      .setTitle(`ℹ️ ${capitalize(p.name)}`)
      .addFields(
        { name: "Level", value: p.level.toString(), inline: true },
        { name: "IV", value: p.iv + "%", inline: true }
      )
      .setImage(p.image);

    message.channel.send({ embeds: [embed] });
    return;
  }

  // SPAWN (8% chance)
  if (!activeSpawn && Math.random() < 0.08) {
    const poke = pokemonList[Math.floor(Math.random() * pokemonList.length)];
    const level = Math.floor(Math.random() * 100) + 1;
    const iv = Math.floor(Math.random() * 101);

    const image = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${poke.id}.png`;

    activeSpawn = {
      name: poke.name,
      level,
      iv,
      image
    };

    const embed = new EmbedBuilder()
      .setTitle("A wild Pokémon appeared!")
      .setImage(image)
      .setDescription("Type `!c <pokemon name>` to catch it!");

    message.channel.send({ embeds: [embed] });
  }
});

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

client.login(process.env.TOKEN);
