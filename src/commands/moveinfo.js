const { EmbedBuilder } = require("discord.js");
const { capitalize, getTypeEmoji } = require("../utils/helpers");

const MOVES = require("../data/moves").MOVES || require("../data/moves");

const MOVE_DESCRIPTIONS = {
  "Tackle": "A physical attack in which the user charges and slams into the target with its whole body.",
  "Quick Attack": "The user lunges at the target at a speed that makes it almost invisible. This move always goes first.",
  "Slam": "The target is slammed with a long tail, vines, or the like to inflict damage.",
  "Hyper Beam": "The target is attacked with a powerful beam. The user can't move on the next turn.",
  "Body Slam": "The user drops onto the target with its full body weight. This may also leave the target with paralysis.",
  "Take Down": "A reckless, full-body charge attack for slamming into the target. This also damages the user a little.",
  "Swift": "Star-shaped rays are shot at opposing Pokémon. This attack never misses.",
  "Giga Impact": "The user charges at the target using every bit of its power. The user can't move on the next turn.",
  "Ember": "The target is attacked with small flames. This may also leave the target with a burn.",
  "Flamethrower": "The target is scorched with an intense blast of fire. This may also leave the target with a burn.",
  "Fire Blast": "The target is attacked with an intense blast of all-consuming fire. This may also leave the target with a burn.",
  "Fire Punch": "The target is punched with a fiery fist. This may also leave the target with a burn.",
  "Heat Wave": "The user attacks by exhaling hot breath on opposing Pokémon. This may also leave those Pokémon with a burn.",
  "Overheat": "The user attacks the target at full power. The attack's recoil harshly lowers the user's Sp. Atk stat.",
  "Flame Charge": "Cloaking itself in flame, the user attacks the target. This also raises the user's Speed stat.",
  "Water Gun": "The target is blasted with a forceful shot of water.",
  "Surf": "The user attacks everything around it by swamping its surroundings with a giant wave.",
  "Hydro Pump": "The target is blasted by a huge volume of water launched under great pressure.",
  "Aqua Tail": "The user attacks by swinging its tail as if it were a vicious wave in a raging storm.",
  "Waterfall": "The user charges at the target and may make it flinch.",
  "Scald": "The user shoots boiling hot water at its target. This may also leave the target with a burn.",
  "Vine Whip": "The target is struck with slender, whiplike vines to inflict damage.",
  "Razor Leaf": "Sharp-edged leaves are launched to slash at opposing Pokémon. Critical hits land more easily.",
  "Solar Beam": "In this two-turn attack, the user gathers light, then blasts a bundled beam on the next turn.",
  "Leaf Blade": "The user handles a sharp leaf like a sword and attacks by cutting its target. Critical hits land more easily.",
  "Energy Ball": "The user draws power from nature and fires it at the target. This may also lower the target's Sp. Def stat.",
  "Giga Drain": "A nutrient-draining attack. The user's HP is restored by half the damage taken by the target.",
  "Thunder Shock": "A jolt of electricity crashes down on the target to inflict damage. This may also leave the target with paralysis.",
  "Thunderbolt": "A strong electric blast crashes down on the target. This may also leave the target with paralysis.",
  "Thunder": "A wicked thunderbolt is dropped on the target to inflict damage. This may also leave the target with paralysis.",
  "Volt Tackle": "The user electrifies itself and charges the target. This also damages the user quite a lot and may leave the target with paralysis.",
  "Thunder Punch": "The target is punched with an electrified fist. This may also leave the target with paralysis.",
  "Wild Charge": "The user shrouds itself in electricity and smashes into the target. This also damages the user a little.",
  "Ice Beam": "The target is struck with an icy-cold beam of energy. This may also leave the target frozen.",
  "Blizzard": "A howling blizzard is summoned to strike opposing Pokémon. This may also leave them frozen.",
  "Ice Punch": "The target is punched with an icy fist. This may also leave the target frozen.",
  "Frost Breath": "The user blows a cold breath on the target. This attack always results in a critical hit.",
  "Avalanche": "The power of this attack move is doubled if the user has been hurt by the target in the same turn.",
  "Icicle Crash": "The user attacks by harshly dropping large icicles onto the target. This may also make the target flinch.",
  "Close Combat": "The user fights the target up close without guarding itself. This also lowers the user's Defense and Sp. Def stats.",
  "Brick Break": "The user attacks with a swift chop. This move can also break barriers.",
  "Aura Sphere": "The user lets loose a blast of aura power from deep within its body at the target. This attack never misses.",
  "Dynamic Punch": "The user punches the target with full, concentrated power. This confuses the target if it hits.",
  "Drain Punch": "An energy-draining punch. The user's HP is restored by half the damage taken by the target.",
  "High Jump Kick": "The target is attacked with a knee kick from a jump. If it misses, the user is hurt instead.",
  "Sludge Bomb": "Unsanitary sludge is hurled at the target. This may also poison the target.",
  "Poison Jab": "The target is stabbed with a tentacle, arm, or the like steeped in poison. This may also poison the target.",
  "Gunk Shot": "The user shoots filthy garbage at the target to attack. This may also poison the target.",
  "Cross Poison": "A slashing attack with a poisonous blade that may also poison the target. Critical hits land more easily.",
  "Venoshock": "A special attack that does double damage to a poisoned target.",
  "Earthquake": "The user sets off an earthquake that strikes every Pokémon around it.",
  "Earth Power": "The user makes the ground under the target erupt with power. This may also lower the target's Sp. Def stat.",
  "Drill Run": "The user crashes into the target while rotating its body like a drill. Critical hits land more easily.",
  "Mud Shot": "The user attacks by hurling a blob of mud at the target. This also lowers the target's Speed stat.",
  "Bulldoze": "The user strikes everything around it by stomping down on the ground. This lowers the Speed stat of those hit.",
  "Air Slash": "The user attacks with a blade of air that slices even the sky. This may also make the target flinch.",
  "Brave Bird": "The user tucks in its wings and charges from a low altitude. This also damages the user quite a lot.",
  "Hurricane": "The user attacks by wrapping its opponent in a fierce wind. This may also confuse the target.",
  "Aerial Ace": "The user confounds the target with speed, then slashes. This attack never misses.",
  "Fly": "The user flies up into the sky and then strikes the target on the next turn.",
  "Psychic": "The target is hit by a strong telekinetic force. This may also lower the target's Sp. Def stat.",
  "Psyshock": "The user materializes an odd psychic wave to attack the target. This attack does physical damage.",
  "Zen Headbutt": "The user focuses its willpower to its head and attacks the target. This may also make the target flinch.",
  "Future Sight": "Two turns after this move is used, a hunk of psychic energy attacks the target.",
  "Psycho Cut": "The user tears at the target with blades formed by psychic power. Critical hits land more easily.",
  "Bug Buzz": "The user generates a damaging sound wave by vibration. This may also lower the target's Sp. Def stat.",
  "X-Scissor": "The user slashes at the target by crossing its scythes or claws as if they were a pair of scissors.",
  "Signal Beam": "The user attacks with a sinister beam of light. This may also confuse the target.",
  "U-turn": "After making its attack, the user rushes back to switch places with a party Pokémon in waiting.",
  "Megahorn": "Using its tough and impressive horn, the user rams into the target with no letup.",
  "Stone Edge": "The user stabs the target from below with sharpened stones. Critical hits land more easily.",
  "Rock Slide": "Large boulders are hurled at opposing Pokémon to inflict damage. This may also make the target flinch.",
  "Power Gem": "The user attacks with a ray of light that sparkles as if it were made of gemstones.",
  "Ancient Power": "The user attacks with a prehistoric power. This may also raise all the user's stats at once.",
  "Shadow Ball": "The user hurls a shadowy blob at the target. This may also lower the target's Sp. Def stat.",
  "Shadow Claw": "The user slashes with a sharp claw made from shadows. Critical hits land more easily.",
  "Phantom Force": "The user vanishes somewhere, then strikes the target on the next turn.",
  "Hex": "This relentless attack does massive damage to a target affected by status conditions.",
  "Dragon Claw": "The user slashes the target with huge sharp claws.",
  "Draco Meteor": "Comets are summoned down from the sky onto the target. The user's Sp. Atk stat harshly falls.",
  "Dragon Pulse": "The target is attacked with a shock wave generated by the user's gaping mouth.",
  "Outrage": "The user rampages and attacks for two to three turns. The user then becomes confused.",
  "Dragon Breath": "The user exhales a mighty gust that inflicts damage. This may also leave the target with paralysis.",
  "Dark Pulse": "The user releases a horrible aura imbued with dark thoughts. This may also make the target flinch.",
  "Crunch": "The user crunches up the target with sharp fangs. This may also lower the target's Defense stat.",
  "Sucker Punch": "This move enables the user to attack first. This move fails if the target is not readying an attack.",
  "Night Slash": "The user slashes the target the instant an opportunity arises. Critical hits land more easily.",
  "Foul Play": "The user turns the target's power against it. The higher the target's Attack stat, the greater the damage.",
  "Iron Head": "The user slams the target with its steel-hard head. This may also make the target flinch.",
  "Flash Cannon": "The user gathers all its light energy and releases it all at once. This may also lower the target's Sp. Def stat.",
  "Meteor Mash": "The target is hit with a hard punch fired like a meteor. This may also raise the user's Attack stat.",
  "Iron Tail": "The target is slammed with a steel-hard tail. This may also lower the target's Defense stat.",
  "Steel Wing": "The target is hit with wings of steel. This may also raise the user's Defense stat.",
  "Moonblast": "Borrowing the power of the moon, the user attacks the target. This may also lower the target's Sp. Atk stat.",
  "Dazzling Gleam": "The user damages opposing Pokémon by emitting a powerful flash.",
  "Play Rough": "The user plays rough with the target and attacks it. This may also lower the target's Attack stat.",
  "Draining Kiss": "The user steals the target's HP with a kiss. The user's HP is restored by over half of the damage taken by the target.",
  "Fairy Wind": "The user stirs up a fairy wind and strikes the target with it."
};

function findMove(name) {
  const lowerName = name.toLowerCase();
  const movesData = typeof MOVES === "object" && !Array.isArray(MOVES) ? MOVES : {};

  for (const [type, moveList] of Object.entries(movesData)) {
    if (!Array.isArray(moveList)) continue;
    const found = moveList.find(m => m.name.toLowerCase() === lowerName);
    if (found) return { ...found, type };
  }
  return null;
}

function getPriority(moveName) {
  const highPriority = ["Quick Attack", "Sucker Punch", "Aqua Jet", "Mach Punch", "Bullet Punch", "Ice Shard", "Shadow Sneak", "Extreme Speed", "Fake Out"];
  if (highPriority.includes(moveName)) return 1;
  return 0;
}

function getCategory(power, moveName) {
  const specialMoves = ["Flamethrower", "Fire Blast", "Overheat", "Heat Wave", "Ember", "Water Gun", "Surf", "Hydro Pump", "Scald", "Solar Beam", "Energy Ball", "Giga Drain", "Thunderbolt", "Thunder", "Thunder Shock", "Ice Beam", "Blizzard", "Frost Breath", "Psychic", "Psyshock", "Future Sight", "Shadow Ball", "Hex", "Draco Meteor", "Dragon Pulse", "Dragon Breath", "Dark Pulse", "Foul Play", "Flash Cannon", "Moonblast", "Dazzling Gleam", "Draining Kiss", "Fairy Wind", "Bug Buzz", "Signal Beam", "Sludge Bomb", "Venoshock", "Earth Power", "Air Slash", "Hurricane", "Power Gem", "Ancient Power", "Aura Sphere"];
  if (specialMoves.includes(moveName)) return "Special";
  if (power === 0) return "Status";
  return "Physical";
}

async function execute(message, args) {
  if (args.length === 0) {
    return message.reply("Usage: `p!moveinfo <move name>`\nExample: `p!moveinfo Flamethrower`");
  }

  const moveName = args.join(" ");
  const move = findMove(moveName);

  if (!move) {
    return message.reply(`Move **${moveName}** not found! Check the spelling and try again.`);
  }

  const desc = MOVE_DESCRIPTIONS[move.name] || "A powerful move used in battle.";
  const priority = getPriority(move.name);
  const category = getCategory(move.power, move.name);
  const emoji = getTypeEmoji(move.type);

  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${move.name}`)
    .setDescription(desc)
    .addFields(
      { name: "Type", value: `${emoji} ${capitalize(move.type)}`, inline: true },
      { name: "Category", value: category === "Physical" ? "💪 Physical" : category === "Special" ? "🔮 Special" : "📊 Status", inline: true },
      { name: "Power", value: `${move.power || "—"}`, inline: true },
      { name: "Accuracy", value: `${move.accuracy || 100}%`, inline: true },
      { name: "Priority", value: priority > 0 ? `+${priority} (goes first)` : "0 (normal)", inline: true }
    )
    .setColor(getTypeColor(move.type))
    .setFooter({ text: "Use p!moves to view and equip moves for your Pokémon" });

  return message.channel.send({ embeds: [embed] });
}

function getTypeColor(type) {
  const colors = {
    normal: 0xa8a878, fire: 0xf08030, water: 0x6890f0, grass: 0x78c850,
    electric: 0xf8d030, ice: 0x98d8d8, fighting: 0xc03028, poison: 0xa040a0,
    ground: 0xe0c068, flying: 0xa890f0, psychic: 0xf85888, bug: 0xa8b820,
    rock: 0xb8a038, ghost: 0x705898, dragon: 0x7038f8, dark: 0x705848,
    steel: 0xb8b8d0, fairy: 0xee99ac
  };
  return colors[type] || 0x68a090;
}

module.exports = { name: "moveinfo", aliases: ["mi"], description: "View detailed move information", execute };
