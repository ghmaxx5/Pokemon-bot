const { getPokemonById } = require("../data/pokemonLoader");

async function execute(message, args, spawns) {
  const channelId = message.channel.id;
  const spawn = spawns.get(channelId);

  if (!spawn) {
    return message.reply("There is no wild Pokemon here right now!");
  }

  const data = getPokemonById(spawn.pokemonId);
  if (!data) return;

  const name = data.name;
  let hint = "";
  for (let i = 0; i < name.length; i++) {
    if (i === 0 || i === name.length - 1 || Math.random() < 0.3) {
      hint += name[i];
    } else {
      hint += "\\_";
    }
  }

  message.reply(`The wild Pokemon is: **${hint}**`);
}

module.exports = { name: "hint", aliases: ["h"], description: "Get a hint for the current spawn", execute };
