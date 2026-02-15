const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");
const { getMovesForPokemon, getEquippedMoves } = require("../data/moves");
const { getEffectiveness } = require("../data/types");
const { getMegaData, getGmaxData, getGmaxMoves } = require("../data/mega");

const activeBattles = new Map();

function calcHP(baseHP, ivHP, level) {
  return Math.floor(((2 * baseHP + ivHP) * level / 100) + level + 10);
}

function calcStat(baseStat, iv, level, boost = 0) {
  return Math.floor(((2 * (baseStat + boost) + iv) * level / 100) + 5);
}

function calcDamage(level, power, attack, defense, effectiveness, stab = false) {
  const base = Math.floor((((2 * level / 5 + 2) * power * attack / defense) / 50) + 2);
  const stabMult = stab ? 1.5 : 1;
  const random = (Math.random() * 0.15 + 0.85);
  return Math.max(1, Math.floor(base * effectiveness * stabMult * random));
}

function getBattleName(poke) {
  let prefix = "";
  if (poke.megaEvolved) {
    prefix = poke.megaData?.isPrimal ? "Primal " : "Mega ";
  } else if (poke.gmaxed) {
    prefix = "G-Max ";
  }
  const shiny = poke.shiny ? "✨ " : "";
  return `${shiny}${prefix}${poke.nickname || capitalize(poke.data.name)}`;
}

function hpBar(current, max) {
  const pct = Math.max(0, current / max);
  const filled = Math.round(pct * 20);
  let barChar;
  if (pct > 0.5) { barChar = "🟩"; }
  else if (pct > 0.2) { barChar = "🟨"; }
  else { barChar = "🟥"; }
  return `${barChar} \`[${"█".repeat(filled)}${"░".repeat(20 - filled)}]\` **${current}**/${max} HP`;
}

function getPokeImage(poke) {
  const id = poke.pokemon_id;
  if (poke.gmaxed) {
    return `https://img.pokemondb.net/artwork/large/${getFormName(poke.data.name)}-gigantamax.jpg`;
  }
  if (poke.megaEvolved) {
    if (poke.megaData?.isPrimal) {
      return `https://img.pokemondb.net/artwork/large/${getFormName(poke.data.name)}-primal.jpg`;
    }
    return `https://img.pokemondb.net/artwork/large/${getFormName(poke.data.name)}-mega.jpg`;
  }
  return getPokemonImage(id, poke.shiny);
}

function getFormName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/\s+/g, "-");
}

function getCurrentMoves(poke) {
  if (poke.gmaxed && poke.gmaxData?.gmaxMoves) {
    return poke.gmaxData.gmaxMoves;
  }
  return poke.moves;
}

function buildBattleEmbed(battle, actionLog) {
  const p1 = battle.p1Active;
  const p2 = battle.p2Active;
  const p1Name = getBattleName(p1);
  const p2Name = getBattleName(p2);

  let statusLines = "";
  if (p1.megaEvolved) statusLines += `💎 ${p1Name} is Mega Evolved!\n`;
  if (p1.gmaxed) statusLines += `💍 ${p1Name} is Gigantamaxed! (${p1.gmaxTurns} turns left)\n`;
  if (p2.megaEvolved) statusLines += `💎 ${p2Name} is Mega Evolved!\n`;
  if (p2.gmaxed) statusLines += `💍 ${p2Name} is Gigantamaxed! (${p2.gmaxTurns} turns left)\n`;

  const p1Types = (p1.activeTypes || p1.data.types).map(t => capitalize(t)).join("/");
  const p2Types = (p2.activeTypes || p2.data.types).map(t => capitalize(t)).join("/");

  const p1TeamStatus = battle.is3v3 ? ` [${battle.p1Team.filter(p => p.currentHp > 0).length}/${battle.p1Team.length} alive]` : "";
  const p2TeamStatus = battle.is3v3 ? ` [${battle.p2Team.filter(p => p.currentHp > 0).length}/${battle.p2Team.length} alive]` : "";

  const embed = new EmbedBuilder()
    .setTitle("⚔️ Pokemon Battle!")
    .setDescription(
      `**${p1Name}** [${p1Types}] (Lv. ${p1.level})${p1TeamStatus}\n` +
      `${hpBar(p1.currentHp, p1.maxHp)}\n\n` +
      `⚡ **VS** ⚡\n\n` +
      `**${p2Name}** [${p2Types}] (Lv. ${p2.level})${p2TeamStatus}\n` +
      `${hpBar(p2.currentHp, p2.maxHp)}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      (statusLines ? `${statusLines}\n` : "") +
      (actionLog ? `📋 ${actionLog}\n\n` : "\n") +
      `<@${battle.turn}>'s turn! Choose your move:`
    )
    .setColor(0xe74c3c)
    .setThumbnail(getPokeImage(battle.turn === battle.challenger ? p1 : p2))
    .setImage(getPokeImage(battle.turn === battle.challenger ? p2 : p1))
    .setFooter({ text: "60 seconds to choose • Moves show: Name (Power/Accuracy)" });

  return embed;
}

function buildMoveButtons(poke, prefix = "battle_move") {
  const moves = getCurrentMoves(poke);
  const row = new ActionRowBuilder();
  for (let i = 0; i < Math.min(moves.length, 4); i++) {
    const move = moves[i];
    const label = move.isProtect
      ? `${move.name} (Block)`
      : `${move.name} (${move.power}/${move.accuracy || 100})`;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}_${i}`)
        .setLabel(label.substring(0, 80))
        .setStyle(move.isProtect ? ButtonStyle.Secondary : ButtonStyle.Primary)
    );
  }
  return row;
}

function preparePokemonForBattle(pRow, data) {
  const hp = calcHP(data.baseStats.hp, pRow.iv_hp, pRow.level);
  const heldItem = pRow.held_item;
  const canMega = heldItem === "mega_stone" && getMegaData(pRow.pokemon_id);
  const canGmax = heldItem === "gmax_ring" && getGmaxData(pRow.pokemon_id);

  return {
    ...pRow,
    data,
    maxHp: hp,
    currentHp: hp,
    moves: getEquippedMoves([pRow.move1, pRow.move2, pRow.move3, pRow.move4], data.types, pRow.level),
    canMega: !!canMega,
    canGmax: !!canGmax,
    megaEvolved: false,
    gmaxed: false,
    gmaxTurns: 0,
    megaData: canMega ? getMegaData(pRow.pokemon_id) : null,
    gmaxData: canGmax ? getGmaxData(pRow.pokemon_id) : null,
    activeTypes: [...data.types],
    statBoosts: { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 },
    baseMaxHp: hp
  };
}

async function execute(message, args) {
  const userId = message.author.id;
  const channelId = message.channel.id;

  if (!args.length) {
    return message.reply(
      "**⚔️ Battle Commands:**\n" +
      "`p!battle @user` - Challenge a trainer (3v3)\n" +
      "`p!battle ai` - Fight an AI trainer (3v3)\n"
    );
  }

  if (args[0].toLowerCase() === "ai" || args[0].toLowerCase() === "npc" || args[0].toLowerCase() === "cpu") {
    return startAIBattle(message, userId, channelId);
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned) return message.reply("Please mention a user to battle or use `p!battle ai`!");
  if (mentioned.id === userId) return message.reply("You can't battle yourself! Try `p!battle ai` instead.");
  if (mentioned.bot) return message.reply("You can't battle a bot! Try `p!battle ai` instead.");
  if (activeBattles.has(channelId)) return message.reply("There's already a battle in this channel!");

  const user1 = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  const user2 = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [mentioned.id]);
  if (user1.rows.length === 0) return message.reply("You haven't started yet!");
  if (user2.rows.length === 0) return message.reply("That user hasn't started yet!");

  const p1Pokemon = await pool.query("SELECT * FROM pokemon WHERE user_id = $1 ORDER BY level DESC LIMIT 20", [userId]);
  const p2Pokemon = await pool.query("SELECT * FROM pokemon WHERE user_id = $1 ORDER BY level DESC LIMIT 20", [mentioned.id]);

  if (p1Pokemon.rows.length < 1) return message.reply("You need at least 1 Pokemon to battle!");
  if (p2Pokemon.rows.length < 1) return message.reply("Your opponent needs at least 1 Pokemon to battle!");

  const battle = {
    challenger: userId,
    opponent: mentioned.id,
    status: "pending",
    channelId,
    is3v3: true,
    p1Team: [],
    p2Team: [],
    p1Active: null,
    p2Active: null,
    p1Selection: [],
    p2Selection: [],
    p1Pokemon: p1Pokemon.rows,
    p2Pokemon: p2Pokemon.rows,
    turn: null,
    isAI: false
  };

  activeBattles.set(channelId, battle);

  const challengeEmbed = new EmbedBuilder()
    .setTitle("⚔️ Battle Challenge!")
    .setDescription(
      `${message.author} challenges ${mentioned} to a **3v3 Pokemon Battle**!\n\n` +
      `Each trainer will select 3 Pokemon.\n` +
      `Pokemon choices are hidden from the opponent!\n\n` +
      `React below to accept or decline.`
    )
    .setColor(0xe74c3c)
    .setFooter({ text: "Challenge expires in 60 seconds" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("battle_accept").setLabel("Accept").setEmoji("⚔️").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("battle_decline").setLabel("Decline").setEmoji("❌").setStyle(ButtonStyle.Danger)
  );

  const challengeMsg = await message.channel.send({ embeds: [challengeEmbed], components: [row] });

  const acceptCollector = challengeMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === mentioned.id,
    time: 60000,
    max: 1
  });

  acceptCollector.on("collect", async (interaction) => {
    if (interaction.customId === "battle_decline") {
      activeBattles.delete(channelId);
      return interaction.update({
        embeds: [new EmbedBuilder().setTitle("❌ Challenge Declined").setColor(0x95a5a6)],
        components: []
      });
    }

    if (interaction.customId === "battle_accept") {
      await interaction.update({
        embeds: [new EmbedBuilder().setTitle("⚔️ Challenge Accepted!").setDescription("Both trainers: check your DMs to select your team!").setColor(0x2ecc71)],
        components: []
      });

      battle.status = "selecting";
      await collectTeamSelection(message, battle, userId, p1Pokemon.rows, "p1Selection", "Challenger");
      await collectTeamSelection(message, battle, mentioned.id, p2Pokemon.rows, "p2Selection", "Opponent");
    }
  });

  acceptCollector.on("end", (collected) => {
    if (collected.size === 0) {
      activeBattles.delete(channelId);
      challengeMsg.edit({
        embeds: [new EmbedBuilder().setTitle("⏰ Challenge Expired").setColor(0x95a5a6)],
        components: []
      }).catch(() => {});
    }
  });
}

async function collectTeamSelection(message, battle, playerId, pokemonRows, selectionKey, label) {
  const channel = message.channel;
  const maxPicks = Math.min(3, pokemonRows.length);

  const options = pokemonRows.slice(0, 15).map((p, i) => {
    const data = getPokemonById(p.pokemon_id);
    const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
    return {
      label: `${name} (Lv. ${p.level})`,
      value: `select_${p.id}`,
      description: `ID: ${p.id} | IV: ${totalIV({ hp: p.iv_hp, atk: p.iv_atk, def: p.iv_def, spatk: p.iv_spatk, spdef: p.iv_spdef, spd: p.iv_spd })}%`
    };
  });

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Select Your Team — ${label}`)
    .setDescription(
      `<@${playerId}>, pick ${maxPicks} Pokemon for battle!\n` +
      `Use the buttons below to select your team.\n` +
      `Your opponent **cannot** see your choices.\n\n` +
      `**Your Pokemon:**\n` +
      pokemonRows.slice(0, 15).map((p, i) => {
        const data = getPokemonById(p.pokemon_id);
        const name = p.nickname || (data ? capitalize(data.name) : `#${p.pokemon_id}`);
        return `\`${i + 1}.\` ${p.shiny ? "✨ " : ""}**${name}** — Lv. ${p.level}`;
      }).join("\n") +
      `\n\nSelected: **0/${maxPicks}**`
    )
    .setColor(0x3498db)
    .setFooter({ text: "60 seconds to pick your team" });

  const buttonRows = [];
  for (let r = 0; r < Math.ceil(Math.min(15, pokemonRows.length) / 5); r++) {
    const row = new ActionRowBuilder();
    for (let i = r * 5; i < Math.min((r + 1) * 5, pokemonRows.length, 15); i++) {
      const data = getPokemonById(pokemonRows[i].pokemon_id);
      const shortName = (pokemonRows[i].nickname || (data ? capitalize(data.name) : `#${pokemonRows[i].pokemon_id}`)).substring(0, 15);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`team_${pokemonRows[i].id}`)
          .setLabel(`${i + 1}. ${shortName}`)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    buttonRows.push(row);
  }

  const selectMsg = await channel.send({ content: `<@${playerId}>`, embeds: [embed], components: buttonRows });

  return new Promise((resolve) => {
    const selected = [];
    const collector = selectMsg.createMessageComponentCollector({
      filter: (i) => i.user.id === playerId,
      time: 60000,
      max: maxPicks
    });

    collector.on("collect", async (interaction) => {
      const pokeId = parseInt(interaction.customId.replace("team_", ""));
      if (selected.includes(pokeId)) {
        return interaction.reply({ content: "You already selected that Pokemon!", ephemeral: true });
      }

      selected.push(pokeId);
      const pRow = pokemonRows.find(p => p.id === pokeId);
      const data = getPokemonById(pRow.pokemon_id);
      const name = pRow.nickname || (data ? capitalize(data.name) : `#${pRow.pokemon_id}`);

      if (selected.length >= maxPicks) {
        battle[selectionKey] = selected;

        await interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle("✅ Team Selected!")
            .setDescription(`<@${playerId}> has selected their team of ${maxPicks}!`)
            .setColor(0x2ecc71)],
          components: []
        });

        const readyFn = battle.isAI ? checkBothReadyAI : checkBothReady;
        readyFn(message, battle);
        resolve();
      } else {
        await interaction.reply({
          content: `Selected **${name}**! (${selected.length}/${maxPicks})`,
          ephemeral: true
        });
      }
    });

    collector.on("end", (collected) => {
      if (selected.length < maxPicks) {
        const remaining = pokemonRows.filter(p => !selected.includes(p.id));
        while (selected.length < maxPicks && remaining.length > 0) {
          selected.push(remaining.shift().id);
        }
        battle[selectionKey] = selected;
        selectMsg.edit({
          embeds: [new EmbedBuilder()
            .setTitle("⏰ Time's Up!")
            .setDescription(`<@${playerId}>'s team was auto-completed.`)
            .setColor(0xe67e22)],
          components: []
        }).catch(() => {});
        const readyFn = battle.isAI ? checkBothReadyAI : checkBothReady;
        readyFn(message, battle);
        resolve();
      }
    });
  });
}

async function checkBothReady(message, battle) {
  if (battle.p1Selection.length === 0 || battle.p2Selection.length === 0) return;
  if (battle.status === "active") return;

  battle.status = "active";

  const p1Rows = await Promise.all(battle.p1Selection.map(async id => {
    const r = await pool.query("SELECT * FROM pokemon WHERE id = $1", [id]);
    return r.rows[0];
  }));
  const p2Rows = await Promise.all(battle.p2Selection.map(async id => {
    const r = await pool.query("SELECT * FROM pokemon WHERE id = $1", [id]);
    return r.rows[0];
  }));

  battle.p1Team = p1Rows.filter(Boolean).map(row => {
    const data = getPokemonById(row.pokemon_id);
    return data ? preparePokemonForBattle(row, data) : null;
  }).filter(Boolean);

  battle.p2Team = p2Rows.filter(Boolean).map(row => {
    const data = getPokemonById(row.pokemon_id);
    return data ? preparePokemonForBattle(row, data) : null;
  }).filter(Boolean);

  if (battle.p1Team.length === 0 || battle.p2Team.length === 0) {
    activeBattles.delete(battle.channelId);
    return message.channel.send("Battle cancelled — couldn't load Pokemon data.");
  }

  battle.p1Active = battle.p1Team[0];
  battle.p2Active = battle.p2Team[0];
  battle.turn = battle.challenger;

  const p1Names = battle.p1Team.map(p => getBattleName(p)).join(", ");
  const p2Names = battle.p2Team.map(p => getBattleName(p)).join(", ");

  const revealEmbed = new EmbedBuilder()
    .setTitle("⚔️ 3v3 Battle Begins!")
    .setDescription(
      `**<@${battle.challenger}>'s Team:**\n${p1Names}\n\n` +
      `**<@${battle.opponent}>'s Team:**\n${p2Names}\n\n` +
      `First Pokemon sent out!\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(0xe74c3c)
    .setThumbnail(getPokeImage(battle.p1Active))
    .setImage(getPokeImage(battle.p2Active));

  await message.channel.send({ embeds: [revealEmbed] });
  await new Promise(r => setTimeout(r, 2000));
  return startBattleTurn(message, battle, battle.channelId, "Battle begins! Choose your move!");
}

function generateAIPokemon(playerLevel) {
  const { generateIVs, randomNature } = require("../utils/helpers");
  const totalPokemon = 1025;
  let aiPokemonId, aiData, attempts = 0;
  do {
    aiPokemonId = Math.floor(Math.random() * totalPokemon) + 1;
    aiData = getPokemonById(aiPokemonId);
    attempts++;
  } while ((!aiData || !aiData.baseStats) && attempts < 50);

  if (!aiData) return null;

  const aiLevel = Math.max(5, playerLevel + Math.floor(Math.random() * 11) - 5);
  const aiIVs = generateIVs();
  const aiShiny = Math.random() < 0.01;

  const aiRow = {
    id: -(Math.floor(Math.random() * 100000) + 1), user_id: "AI_TRAINER", pokemon_id: aiPokemonId,
    level: aiLevel, shiny: aiShiny,
    iv_hp: aiIVs.hp, iv_atk: aiIVs.atk, iv_def: aiIVs.def,
    iv_spatk: aiIVs.spatk, iv_spdef: aiIVs.spdef, iv_spd: aiIVs.spd,
    nature: randomNature(), nickname: null, held_item: null, favorite: false,
    move1: null, move2: null, move3: null, move4: null
  };

  const aiCanGmax = getGmaxData(aiPokemonId);
  const aiCanMega = getMegaData(aiPokemonId);
  if (aiCanGmax && Math.random() < 0.4) aiRow.held_item = "gmax_ring";
  else if (aiCanMega && Math.random() < 0.4) aiRow.held_item = "mega_stone";

  return { row: aiRow, data: aiData };
}

async function startAIBattle(message, userId, channelId) {
  if (activeBattles.has(channelId)) return message.reply("There's already a battle in this channel!");

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet!");

  const p1Pokemon = await pool.query("SELECT * FROM pokemon WHERE user_id = $1 ORDER BY level DESC LIMIT 20", [userId]);
  if (p1Pokemon.rows.length < 1) return message.reply("You need at least 1 Pokemon to battle!");

  const avgLevel = Math.floor(p1Pokemon.rows.slice(0, 3).reduce((s, p) => s + p.level, 0) / Math.min(3, p1Pokemon.rows.length));

  const aiTeamData = [];
  for (let i = 0; i < 3; i++) {
    const ai = generateAIPokemon(avgLevel);
    if (ai) aiTeamData.push(ai);
  }
  if (aiTeamData.length === 0) return message.reply("Failed to generate AI opponent. Try again!");

  const battle = {
    challenger: userId,
    opponent: "AI_TRAINER",
    status: "pending",
    channelId,
    is3v3: true,
    p1Team: [],
    p2Team: [],
    p1Active: null,
    p2Active: null,
    p1Selection: [],
    p2Selection: [],
    p1Pokemon: p1Pokemon.rows,
    p2Pokemon: [],
    turn: null,
    isAI: true,
    aiTeamData,
    aiDifficulty: Math.min(1, avgLevel / 100 + 0.2)
  };

  activeBattles.set(channelId, battle);

  const aiNames = aiTeamData.map(a => `${a.row.shiny ? "✨ " : ""}🤖 ${capitalize(a.data.name)} (Lv.${a.row.level})`).join(", ");

  const challengeEmbed = new EmbedBuilder()
    .setTitle("🤖 AI Trainer Challenge!")
    .setDescription(
      `An AI Trainer appears with a team of **${aiTeamData.length} Pokemon**!\n\n` +
      `🤖 AI Team: ${aiNames}\n\n` +
      `Select your team of 3 Pokemon to battle!`
    )
    .setColor(0x9b59b6)
    .setFooter({ text: "3v3 Battle — Same rules as PvP!" });

  await message.channel.send({ embeds: [challengeEmbed] });

  battle.status = "selecting";
  await collectTeamSelection(message, battle, userId, p1Pokemon.rows, "p1Selection", "Your Team");

  battle.p2Selection = aiTeamData.map(a => a.row.id);

  if (battle.status !== "active") {
    checkBothReadyAI(message, battle);
  }
}

async function checkBothReadyAI(message, battle) {
  if (battle.p1Selection.length === 0) return;
  if (battle.status === "active") return;

  battle.status = "active";

  const p1Rows = await Promise.all(battle.p1Selection.map(async id => {
    const r = await pool.query("SELECT * FROM pokemon WHERE id = $1", [id]);
    return r.rows[0];
  }));

  battle.p1Team = p1Rows.filter(Boolean).map(row => {
    const data = getPokemonById(row.pokemon_id);
    return data ? preparePokemonForBattle(row, data) : null;
  }).filter(Boolean);

  battle.p2Team = battle.aiTeamData.map(a => preparePokemonForBattle(a.row, a.data));

  if (battle.p1Team.length === 0 || battle.p2Team.length === 0) {
    activeBattles.delete(battle.channelId);
    return message.channel.send("Battle cancelled — couldn't load Pokemon data.");
  }

  battle.p1Active = battle.p1Team[0];
  battle.p2Active = battle.p2Team[0];
  battle.turn = battle.challenger;

  const p1Names = battle.p1Team.map(p => getBattleName(p)).join(", ");
  const p2Names = battle.p2Team.map(p => `🤖 ${getBattleName(p)}`).join(", ");

  const revealEmbed = new EmbedBuilder()
    .setTitle("⚔️ 3v3 AI Battle Begins!")
    .setDescription(
      `**<@${battle.challenger}>'s Team:**\n${p1Names}\n\n` +
      `**🤖 AI Trainer's Team:**\n${p2Names}\n\n` +
      `First Pokemon sent out!\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setColor(0x9b59b6)
    .setThumbnail(getPokeImage(battle.p1Active))
    .setImage(getPokeImage(battle.p2Active));

  await message.channel.send({ embeds: [revealEmbed] });
  await new Promise(r => setTimeout(r, 2000));
  return startBattleTurn(message, battle, battle.channelId, "AI Battle begins! Choose your move!");
}

async function startBattleTurn(message, battle, channelId, actionLog) {
  const isP1Turn = battle.turn === battle.challenger;
  const attacker = isP1Turn ? battle.p1Active : battle.p2Active;
  const defender = isP1Turn ? battle.p2Active : battle.p1Active;

  if (attacker.gmaxed) {
    attacker.gmaxTurns--;
    if (attacker.gmaxTurns <= 0) {
      attacker.gmaxed = false;
      attacker.activeTypes = [...attacker.data.types];
      attacker.statBoosts = { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
      const hpRatio = attacker.currentHp / attacker.maxHp;
      attacker.maxHp = attacker.baseMaxHp;
      attacker.currentHp = Math.max(1, Math.floor(hpRatio * attacker.baseMaxHp));
      const name = attacker.nickname || capitalize(attacker.data.name);
      actionLog = `${actionLog ? actionLog + "\n" : ""}💍 **${name}**'s Gigantamax wore off!`;
    }
  }

  if (battle.isAI && battle.turn === "AI_TRAINER") {
    return executeAITurn(message, battle, channelId, attacker, defender, isP1Turn, actionLog);
  }

  const embed = buildBattleEmbed(battle, actionLog);
  const moveRow = buildMoveButtons(attacker, "battle_move");
  const rows = [moveRow];

  const canMegaNow = attacker.canMega && !attacker.megaEvolved && !attacker.gmaxed;
  const canGmaxNow = attacker.canGmax && !attacker.gmaxed && !attacker.megaEvolved;
  const canSwitch = battle.is3v3 && (isP1Turn ? battle.p1Team : battle.p2Team).filter(p => p.currentHp > 0 && p !== attacker).length > 0;

  if (canMegaNow || canGmaxNow || canSwitch) {
    const transformRow = new ActionRowBuilder();
    if (canMegaNow) {
      const label = attacker.megaData?.isPrimal ? "Primal Reversion" : "Mega Evolve";
      transformRow.addComponents(
        new ButtonBuilder().setCustomId("battle_mega").setLabel(label).setEmoji("💎").setStyle(ButtonStyle.Danger)
      );
    }
    if (canGmaxNow) {
      transformRow.addComponents(
        new ButtonBuilder().setCustomId("battle_gmax").setLabel("Gigantamax").setEmoji("💍").setStyle(ButtonStyle.Danger)
      );
    }
    if (canSwitch) {
      transformRow.addComponents(
        new ButtonBuilder().setCustomId("battle_switch").setLabel("Switch").setEmoji("🔄").setStyle(ButtonStyle.Secondary)
      );
    }
    rows.push(transformRow);
  }

  const reply = await message.channel.send({ embeds: [embed], components: rows });

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === battle.turn,
    time: 60000,
    max: 1
  });

  collector.on("collect", async (interaction) => {
    const customId = interaction.customId;

    if (customId === "battle_switch") {
      const team = isP1Turn ? battle.p1Team : battle.p2Team;
      const alive = team.filter(p => p.currentHp > 0 && p !== attacker);

      const switchRow = new ActionRowBuilder();
      alive.forEach((p, i) => {
        switchRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`switch_${i}`)
            .setLabel(`${getBattleName(p)} (Lv.${p.level} HP:${p.currentHp}/${p.maxHp})`.substring(0, 80))
            .setStyle(ButtonStyle.Primary)
        );
      });

      await interaction.update({
        embeds: [new EmbedBuilder().setTitle("🔄 Switch Pokemon").setDescription("Choose a Pokemon to switch to:").setColor(0x3498db)],
        components: [switchRow]
      });

      const switchCollector = reply.createMessageComponentCollector({
        filter: (i2) => i2.user.id === battle.turn,
        time: 30000, max: 1
      });

      switchCollector.on("collect", async (si) => {
        const idx = parseInt(si.customId.replace("switch_", ""));
        const switchTo = alive[idx];
        if (!switchTo) return;

        if (isP1Turn) battle.p1Active = switchTo;
        else battle.p2Active = switchTo;

        const switchText = `🔄 **${getBattleName(attacker)}** was switched out for **${getBattleName(switchTo)}**!`;
        battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;

        await si.update({ embeds: [{ description: switchText, color: 0x3498db }], components: [] });
        await new Promise(r => setTimeout(r, 500));
        startBattleTurn(message, battle, channelId, switchText);
      });

      switchCollector.on("end", (c) => {
        if (c.size === 0) {
          battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;
          startBattleTurn(message, battle, channelId, `${getBattleName(attacker)} stayed in!`);
        }
      });
      return;
    }

    if (customId === "battle_mega") {
      const megaData = attacker.megaData;
      attacker.megaEvolved = true;
      attacker.canMega = false;
      attacker.activeTypes = megaData.types || attacker.activeTypes;
      attacker.statBoosts = megaData.statBoost;

      const newMaxHp = attacker.maxHp + Math.floor(megaData.statBoost.hp * attacker.level / 100);
      if (newMaxHp > attacker.maxHp) {
        attacker.currentHp += (newMaxHp - attacker.maxHp);
        attacker.maxHp = newMaxHp;
      }

      const transformName = megaData.isPrimal ? "underwent Primal Reversion" : "Mega Evolved";
      const transformText = `💎 **${attacker.nickname || capitalize(attacker.data.name)}** ${transformName} into **${megaData.name}**!`;

      const moveSelectEmbed = buildBattleEmbed(battle, transformText + "\n\nNow choose your move:");
      moveSelectEmbed.setThumbnail(getPokeImage(attacker));
      const newMoveRow = buildMoveButtons(attacker, "battle_tmove");
      await interaction.update({ embeds: [moveSelectEmbed], components: [newMoveRow] });

      const moveCollector = reply.createMessageComponentCollector({
        filter: (i2) => i2.user.id === battle.turn,
        time: 60000, max: 1
      });

      moveCollector.on("collect", async (mi) => {
        const moveIdx = parseInt(mi.customId.replace("battle_tmove_", ""));
        const moves = getCurrentMoves(attacker);
        const move = moves[moveIdx] || attacker.moves[0];
        await executeBattleMove(mi, battle, channelId, attacker, defender, move, isP1Turn, message, transformText);
      });

      moveCollector.on("end", (c) => {
        if (c.size === 0) {
          const move = getCurrentMoves(attacker)[0] || attacker.moves[0];
          executeBattleMove(null, battle, channelId, attacker, defender, move, isP1Turn, message, transformText);
        }
      });
      return;
    }

    if (customId === "battle_gmax") {
      const gmaxData = attacker.gmaxData;
      attacker.gmaxed = true;
      attacker.canGmax = false;
      attacker.gmaxTurns = 3;
      attacker.currentHp = Math.floor(attacker.currentHp * 1.5);
      attacker.maxHp = Math.floor(attacker.maxHp * 1.5);

      const transformText = `💍 **${attacker.nickname || capitalize(attacker.data.name)}** Gigantamaxed into **${gmaxData.name}**!\nAll moves replaced with G-Max moves for 3 turns!`;

      const moveSelectEmbed = buildBattleEmbed(battle, transformText + "\n\nChoose your G-Max move:");
      moveSelectEmbed.setThumbnail(getPokeImage(attacker));
      const newMoveRow = buildMoveButtons(attacker, "battle_tmove");
      await interaction.update({ embeds: [moveSelectEmbed], components: [newMoveRow] });

      const moveCollector = reply.createMessageComponentCollector({
        filter: (i2) => i2.user.id === battle.turn,
        time: 60000, max: 1
      });

      moveCollector.on("collect", async (mi) => {
        const moveIdx = parseInt(mi.customId.replace("battle_tmove_", ""));
        const moves = getCurrentMoves(attacker);
        await executeBattleMove(mi, battle, channelId, attacker, defender, moves[moveIdx] || moves[0], isP1Turn, message, transformText);
      });

      moveCollector.on("end", (c) => {
        if (c.size === 0) {
          const moves = getCurrentMoves(attacker);
          executeBattleMove(null, battle, channelId, attacker, defender, moves[0], isP1Turn, message, transformText);
        }
      });
      return;
    }

    const moveIdx = parseInt(customId.replace("battle_move_", ""));
    const moves = getCurrentMoves(attacker);
    const move = moves[moveIdx] || moves[0];
    await executeBattleMove(interaction, battle, channelId, attacker, defender, move, isP1Turn, message, "");
  });

  collector.on("end", (collected) => {
    if (collected.size === 0) {
      activeBattles.delete(channelId);
      reply.edit({ content: "Battle timed out! No move selected.", components: [] }).catch(() => {});
    }
  });
}

async function executeAITurn(message, battle, channelId, attacker, defender, isP1Turn, prevLog) {
  const moves = getCurrentMoves(attacker);
  const difficulty = battle.aiDifficulty || 0.5;

  let transformText = "";
  if (attacker.canGmax && !attacker.gmaxed && !attacker.megaEvolved && Math.random() < 0.6) {
    const gmaxData = attacker.gmaxData;
    attacker.gmaxed = true;
    attacker.canGmax = false;
    attacker.gmaxTurns = 3;
    attacker.currentHp = Math.floor(attacker.currentHp * 1.5);
    attacker.maxHp = Math.floor(attacker.maxHp * 1.5);
    transformText = `💍 🤖 **${attacker.nickname || capitalize(attacker.data.name)}** Gigantamaxed into **${gmaxData.name}**!`;
  } else if (attacker.canMega && !attacker.megaEvolved && !attacker.gmaxed && Math.random() < 0.6) {
    const megaData = attacker.megaData;
    attacker.megaEvolved = true;
    attacker.canMega = false;
    attacker.activeTypes = megaData.types || attacker.activeTypes;
    attacker.statBoosts = megaData.statBoost;
    const transformName = megaData.isPrimal ? "underwent Primal Reversion" : "Mega Evolved";
    transformText = `💎 🤖 **${attacker.nickname || capitalize(attacker.data.name)}** ${transformName} into **${megaData.name}**!`;
  }

  const currentMoves = getCurrentMoves(attacker);
  let chosenMove;

  if (Math.random() < difficulty) {
    let bestMove = currentMoves[0];
    let bestScore = -1;
    for (const move of currentMoves) {
      if (move.isProtect) continue;
      const moveType = move.type || attacker.activeTypes[0] || "normal";
      const effectiveness = getEffectiveness(moveType, defender.activeTypes || defender.data.types);
      const stab = (attacker.activeTypes || attacker.data.types).includes(moveType);
      const score = move.power * effectiveness * (stab ? 1.5 : 1) * ((move.accuracy || 100) / 100);
      if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    chosenMove = bestMove;
  } else {
    const validMoves = currentMoves.filter(m => !m.isProtect);
    chosenMove = validMoves[Math.floor(Math.random() * validMoves.length)] || currentMoves[0];
  }

  const prefix = transformText ? transformText + "\n" : "";
  await executeBattleMove(null, battle, channelId, attacker, defender, chosenMove, isP1Turn, message, prefix);
}

async function executeBattleMove(interaction, battle, channelId, attacker, defender, move, isP1Turn, message, prefixText) {
  const attackerName = getBattleName(attacker);
  const defenderName = getBattleName(defender);

  if (move.isProtect) {
    const resultText = `🛡️ **${attackerName}** used **${move.name}**! Protected from the next attack!`;
    battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;

    const embed = buildBattleEmbed(battle, `${prefixText}${resultText}`);
    embed.setThumbnail(getPokeImage(attacker));

    if (interaction) {
      await interaction.update({ embeds: [embed], components: [] });
    } else {
      await message.channel.send({ embeds: [embed] });
    }
    return startBattleTurn(message, battle, channelId, `${attackerName} is protecting!`);
  }

  const atkBoost = attacker.statBoosts?.atk || 0;
  const defBoost = defender.statBoosts?.def || 0;

  const atkStat = calcStat(attacker.data.baseStats.atk, attacker.iv_atk, attacker.level, atkBoost);
  const defStat = calcStat(defender.data.baseStats.def, defender.iv_def, defender.level, defBoost);

  const moveType = move.type || attacker.activeTypes[0] || "normal";
  const effectiveness = getEffectiveness(moveType, defender.activeTypes || defender.data.types);
  const stab = (attacker.activeTypes || attacker.data.types).includes(moveType);

  const hit = Math.random() * 100 <= (move.accuracy || 100);
  let damage = 0;
  let effectText = "";

  if (hit) {
    damage = calcDamage(attacker.level, move.power, atkStat, defStat, effectiveness, stab);
    if (attacker.gmaxed) damage = Math.floor(damage * 1.3);
    if (effectiveness > 1) effectText = "💥 It's super effective! ";
    else if (effectiveness < 1 && effectiveness > 0) effectText = "😐 It's not very effective... ";
    else if (effectiveness === 0) { effectText = "❌ It had no effect! "; damage = 0; }
  }

  defender.currentHp = Math.max(0, defender.currentHp - damage);

  const resultText = hit
    ? `**${attackerName}** used **${move.name}**! ${effectText}Dealt **${damage}** damage!`
    : `**${attackerName}** used **${move.name}** but it missed!`;

  if (defender.currentHp <= 0) {
    return handleFaint(interaction, battle, channelId, attacker, defender, isP1Turn, message, `${prefixText}${resultText}`);
  }

  battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;

  if (interaction) {
    await interaction.update({ embeds: [{ description: `${prefixText}${resultText}`, color: 0xff9900 }], components: [] });
  } else {
    await message.channel.send({ embeds: [{ description: `${prefixText}${resultText}`, color: 0xff9900 }] });
  }

  await new Promise(r => setTimeout(r, battle.isAI ? 1500 : 500));
  startBattleTurn(message, battle, channelId, resultText);
}

async function handleFaint(interaction, battle, channelId, attacker, defender, isP1Turn, message, actionLog) {
  const defenderTeam = isP1Turn ? battle.p2Team : battle.p1Team;
  const attackerTeam = isP1Turn ? battle.p1Team : battle.p2Team;
  const defenderOwner = isP1Turn ? battle.opponent : battle.challenger;

  const faintText = `${actionLog}\n\n💀 **${getBattleName(defender)}** fainted!`;

  const aliveDefenders = defenderTeam.filter(p => p.currentHp > 0);

  if (aliveDefenders.length === 0) {
    return endBattle(interaction, battle, channelId, attacker, defender, isP1Turn, message, faintText);
  }

  if (battle.isAI && defenderOwner === "AI_TRAINER") {
    const nextPoke = aliveDefenders[0];
    if (isP1Turn) battle.p2Active = nextPoke;
    else battle.p1Active = nextPoke;

    const switchText = `${faintText}\n🤖 AI sent out **${getBattleName(nextPoke)}**!`;

    if (interaction) {
      await interaction.update({ embeds: [{ description: switchText, color: 0xff9900 }], components: [] });
    } else {
      await message.channel.send({ embeds: [{ description: switchText, color: 0xff9900 }] });
    }

    await new Promise(r => setTimeout(r, 1500));
    return startBattleTurn(message, battle, channelId, switchText);
  }

  if (interaction) {
    await interaction.update({ embeds: [{ description: faintText, color: 0xff9900 }], components: [] });
  } else {
    await message.channel.send({ embeds: [{ description: faintText, color: 0xff9900 }] });
  }

  const switchRow = new ActionRowBuilder();
  aliveDefenders.forEach((p, i) => {
    switchRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`faintswitch_${i}`)
        .setLabel(`${getBattleName(p)} (Lv.${p.level} HP:${p.currentHp}/${p.maxHp})`.substring(0, 80))
        .setStyle(ButtonStyle.Primary)
    );
  });

  const switchEmbed = new EmbedBuilder()
    .setTitle("💀 Pokemon Fainted!")
    .setDescription(`<@${defenderOwner}>, choose your next Pokemon!`)
    .setColor(0xe74c3c);

  const switchMsg = await message.channel.send({ content: `<@${defenderOwner}>`, embeds: [switchEmbed], components: [switchRow] });

  const switchCollector = switchMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === defenderOwner,
    time: 30000,
    max: 1
  });

  switchCollector.on("collect", async (si) => {
    const idx = parseInt(si.customId.replace("faintswitch_", ""));
    const nextPoke = aliveDefenders[idx];
    if (!nextPoke) return;

    if (isP1Turn) battle.p2Active = nextPoke;
    else battle.p1Active = nextPoke;

    await si.update({
      embeds: [new EmbedBuilder().setTitle("🔄 Switch!").setDescription(`**${getBattleName(nextPoke)}** was sent out!`).setColor(0x3498db)],
      components: []
    });

    battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;
    await new Promise(r => setTimeout(r, 1000));
    startBattleTurn(message, battle, channelId, `${getBattleName(nextPoke)} enters the battle!`);
  });

  switchCollector.on("end", (c) => {
    if (c.size === 0) {
      const nextPoke = aliveDefenders[0];
      if (isP1Turn) battle.p2Active = nextPoke;
      else battle.p1Active = nextPoke;
      battle.turn = battle.turn === battle.challenger ? battle.opponent : battle.challenger;
      startBattleTurn(message, battle, channelId, `${getBattleName(nextPoke)} was auto-sent out!`);
    }
  });
}

async function endBattle(interaction, battle, channelId, attacker, defender, isP1Turn, message, actionLog) {
  const winner = isP1Turn ? battle.challenger : battle.opponent;
  const loser = isP1Turn ? battle.opponent : battle.challenger;
  const winnerPoke = attacker;
  const loserPoke = defender;
  const winnerName = getBattleName(winnerPoke);

  const isAIWin = winner === "AI_TRAINER";
  const isAILoss = loser === "AI_TRAINER";

  const reward = Math.floor(Math.random() * 300) + 150;
  const xpGain = Math.floor(Math.random() * 50) + 30;

  if (!isAIWin) {
    await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [reward, winner]);
    const winnerTeam = isP1Turn ? battle.p1Team : battle.p2Team;
    for (const p of winnerTeam) {
      if (p.id > 0) {
        await pool.query("UPDATE pokemon SET xp = xp + $1 WHERE id = $2", [xpGain, p.id]);
      }
    }
  }
  if (!isAILoss && !isAIWin) {
    const xpLoser = Math.floor(xpGain / 3);
    const loserTeam = isP1Turn ? battle.p2Team : battle.p1Team;
    for (const p of loserTeam) {
      if (p.id > 0) {
        await pool.query("UPDATE pokemon SET xp = xp + $1 WHERE id = $2", [xpLoser, p.id]);
      }
    }
  }
  if (battle.isAI && !isAIWin) {
    const aiBonus = Math.floor(Math.random() * 100) + 50;
    await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [aiBonus, winner]);
  }

  const endEmbed = new EmbedBuilder()
    .setTitle("⚔️ Battle Over!")
    .setDescription(
      `${actionLog}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🏆 **${winnerName}** wins the battle!\n` +
      (isAIWin
        ? `The AI Trainer was victorious! Better luck next time!`
        : `<@${winner}> earned **${reward}** Cybercoins and **${xpGain}** XP per Pokemon!` +
          (battle.isAI ? `\n🤖 AI Battle Bonus: **+${Math.floor(Math.random() * 100) + 50}** Cybercoins!` : ""))
    )
    .setColor(0x2ecc71)
    .setThumbnail(getPokeImage(winnerPoke));

  activeBattles.delete(channelId);
  if (interaction) {
    return interaction.update({ embeds: [endEmbed], components: [] });
  } else {
    return message.channel.send({ embeds: [endEmbed] });
  }
}

module.exports = { name: "battle", aliases: ["duel", "fight"], description: "Battle another trainer or AI", execute };
