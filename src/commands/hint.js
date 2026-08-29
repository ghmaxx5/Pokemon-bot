const { getPokemonById } = require("../data/pokemonLoader");

function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return function() {
    h = Math.imul(h ^ (h >>> 15), 2246822507) | 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) | 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

async function execute(message, args, spawns) {
  const channelId = message.channel.id;
  const spawn = spawns.get(channelId);

  if (!spawn) {
    return message.reply("There is no wild Pokemon here right now!");
  }

  const data = getPokemonById(spawn.pokemonId);
  if (!data) return;

  const name = data.name;
  const rng = seededRandom(`${channelId}_${spawn.pokemonId}_${spawn.spawnedAt || 0}`);
  let hint = [];
  for (let i = 0; i < name.length; i++) {
    if (name[i] === " " || name[i] === "-") {
      hint.push(name[i]);
    } else if (i === 0 || i === name.length - 1 || rng() < 0.35) {
      hint.push(name[i]);
    } else {
      hint.push("\\_");
    }
  }

  message.reply(`The wild Pokemon is: \`${hint.join(" ")}\``);
}

module.exports = { name: "hint", aliases: ["h"], description: "Get a hint for the current spawn", execute };
