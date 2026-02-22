const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById, getPokemonImage } = require("../data/pokemonLoader");
const { capitalize, totalIV } = require("../utils/helpers");
const { getMovesForPokemon, getEquippedMoves } = require("../data/moves");
const { getEffectiveness } = require("../data/types");
const { getMegaData, getGmaxData, getGmaxMoves } = require("../data/mega");
const { generateBattleImage } = require("../utils/battleImage");

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

async function buildBattleEmbed(battle, actionLog) {
  // Sanitize — Discord rejects empty strings in description
  if (!actionLog || actionLog.trim() === "") actionLog = null;
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

  // Build team dot arrays for 3v3 indicator
  const p1Dots = battle.is3v3 ? battle.p1Team.map(p => p.currentHp > 0) : null;
  const p2Dots = battle.is3v3 ? battle.p2Team.map(p => p.currentHp > 0) : null;

  // Generate the combined battle image via canvas
  let attachment = null;
  let imageUrl = getPokeImage(p2);
  try {
    const imgBuffer = await generateBattleImage(
      { currentHp: p1.currentHp, maxHp: p1.maxHp, displayName: p1Name, level: p1.level, teamDots: p1Dots },
      { currentHp: p2.currentHp, maxHp: p2.maxHp, displayName: p2Name, level: p2.level, teamDots: p2Dots },
      getPokeImage(p1),
      getPokeImage(p2)
    );
    attachment = new AttachmentBuilder(imgBuffer, { name: "battle.png" });
    imageUrl = "attachment://battle.png";
  } catch (err) {
    console.error("Battle image generation failed:", err);
  }

  const embed = new EmbedBuilder()
    .setTitle("⚔️ Pokémon Battle!")
    .setDescription(
      (statusLines ? `${statusLines}\n` : "") +
      (actionLog ? actionLog : "⚔️ Battle in progress!")
    )
    .setColor(0xe74c3c)
    .setImage(imageUrl)
    .setFooter({ text: `${p1Name} [${p1Types}] vs ${p2Name} [${p2Types}] • 60s to choose` });

  return { embed, attachment };
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
      "`p!battle ai` - Fight an AI trainer (3v3)\n" +
      "`p!battle quit` - Forfeit the current battle\n"
    );
  }

  // ── Quit / Forfeit ──
  if (args[0].toLowerCase() === "quit" || args[0].toLowerCase() === "forfeit" || args[0].toLowerCase() === "ff") {
    const battle = activeBattles.get(channelId);

    if (!battle) {
      return message.reply("There's no active battle in this channel!");
    }

    // Only participants can quit
    const isChallenger = userId === battle.challenger;
    const isOpponent = userId === battle.opponent;
    if (!isChallenger && !isOpponent) {
      return message.reply("You're not part of the battle in this channel!");
    }

    // Can't quit during team selection phase — battle must be active
    if (battle.status !== "active") {
      activeBattles.delete(channelId);
      return message.reply("Battle cancelled.");
    }

    const quitter = isChallenger ? battle.challenger : battle.opponent;
    const winner = isChallenger ? battle.opponent : battle.challenger;
    const isAIWin = winner === "AI_TRAINER";

    // Give winner reward
    const reward = 200;
    const xpGain = 30;
    if (!isAIWin) {
      await pool.query("UPDATE users SET balance = balance + $1 WHERE user_id = $2", [reward, winner]);
      const winnerTeam = isChallenger ? battle.p2Team : battle.p1Team;
      for (const p of winnerTeam) {
        if (p.id > 0) await pool.query("UPDATE pokemon SET xp = xp + $1 WHERE id = $2", [xpGain, p.id]);
      }
    }

    activeBattles.delete(channelId);

    const forfeitEmbed = new EmbedBuilder()
      .setTitle("🏳️ Battle Forfeited!")
      .setDescription(
        `<@${quitter}> has forfeited the battle!\n\n` +
        (isAIWin
          ? `🤖 The AI Trainer wins by default!`
          : `🏆 <@${winner}> wins by default and earns **${reward}** Cybercoins + **${xpGain}** XP per Pokémon!`)
      )
      .setColor(0x95a5a6)
      .setFooter({ text: "Better luck next time!" });

    return message.channel.send({ embeds: [forfeitEmbed] });
  }

  if (args[0].toLowerCase() === "ai" || args[0].toLowerCase() === "npc" || args[0].toLowerCase() === "cpu") {
    return startAIBattle(message, userId, channelId);
  }
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

// ── Poketwo-style: both players pick moves simultaneously, then resolve by speed ──

function getSpeed(poke) {
  const boost = poke.statBoosts?.spd || 0;
  return calcStat(poke.data.baseStats.spd || poke.data.baseStats.speed || 50, poke.iv_spd, poke.level, boost);
}

function buildTurnEmbed(battle, actionLog) {
  const p1 = battle.p1Active;
  const p2 = battle.p2Active;
  const p1Name = getBattleName(p1);
  const p2Name = getBattleName(p2);
  const p1Dots = battle.is3v3 ? battle.p1Team.map(p => p.currentHp > 0) : null;
  const p2Dots = battle.is3v3 ? battle.p2Team.map(p => p.currentHp > 0) : null;
  return { p1Name, p2Name, p1Dots, p2Dots };
}

function buildPlayerMoveEmbed(battle, playerId, waitingMsg) {
  const isP1 = playerId === battle.challenger;
  const poke = isP1 ? battle.p1Active : battle.p2Active;
  const name = getBattleName(poke);
  const types = (poke.activeTypes || poke.data.types).map(t => capitalize(t)).join("/");

  const statusLines = [];
  if (poke.megaEvolved) statusLines.push(`💎 ${name} is Mega Evolved!`);
  if (poke.gmaxed) statusLines.push(`💍 ${name} is Gigantamaxed! (${poke.gmaxTurns} turns left)`);

  return new EmbedBuilder()
    .setTitle("⚔️ Choose Your Move!")
    .setDescription(
      (statusLines.length ? statusLines.join("\n") + "\n\n" : "") +
      `**${name}** [${types}] — Lv. ${poke.level}\n` +
      `HP: **${poke.currentHp}**/${poke.maxHp}\n\n` +
      (waitingMsg || "Pick your move below. Your opponent is choosing too!") +
      `\n\n⏱️ 60 seconds to choose`
    )
    .setColor(0x3498db)
    .setThumbnail(getPokeImage(poke))
    .setFooter({ text: "Moves show: Name (Power/Accuracy)" });
}

async function startBattleTurn(message, battle, channelId, actionLog) {
  // Gmax tick for both active pokemon
  for (const poke of [battle.p1Active, battle.p2Active]) {
    if (poke.gmaxed) {
      poke.gmaxTurns--;
      if (poke.gmaxTurns <= 0) {
        poke.gmaxed = false;
        poke.activeTypes = [...poke.data.types];
        poke.statBoosts = { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0 };
        const hpRatio = poke.currentHp / poke.maxHp;
        poke.maxHp = poke.baseMaxHp;
        poke.currentHp = Math.max(1, Math.floor(hpRatio * poke.baseMaxHp));
        actionLog = `${actionLog ? actionLog + "\n" : ""}💍 **${getBattleName(poke)}**'s Gigantamax wore off!`;
      }
    }
  }

  // Show previous turn result image if there's an actionLog
  if (actionLog) {
    const { embed: resultEmbed, attachment: resultAttachment } = await buildBattleEmbed(battle, actionLog);
    const resultOpts = { embeds: [resultEmbed], components: [] };
    if (resultAttachment) resultOpts.files = [resultAttachment];
    await message.channel.send(resultOpts);
    await new Promise(r => setTimeout(r, 1200));
  }

  // AI battle: collect p1 move via buttons, AI picks simultaneously, then resolve
  if (battle.isAI) {
    return startSimultaneousTurnAI(message, battle, channelId);
  }

  // PvP: send each player their own move selection message (DM-style in channel, ephemeral feel)
  return startSimultaneousTurnPvP(message, battle, channelId);
}

async function startSimultaneousTurnPvP(message, battle, channelId) {
  const p1 = battle.p1Active;
  const p2 = battle.p2Active;

  // ── Build initial move rows for a pokemon ──
  function buildInitialRows(poke, prefix) {
    const rows = [];
    const moveRow = buildMoveButtons(poke, `${prefix}_move`);

    // Add "Do Nothing / Pass" button to move row
    moveRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${prefix}_pass`)
        .setLabel("Pass")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Secondary)
    );
    rows.push(moveRow);

    const canMega = poke.canMega && !poke.megaEvolved && !poke.gmaxed;
    const canGmax = poke.canGmax && !poke.gmaxed && !poke.megaEvolved;
    const team = poke === p1 ? battle.p1Team : battle.p2Team;
    const canSwitch = battle.is3v3 && team.filter(p => p.currentHp > 0 && p !== poke).length > 0;

    if (canMega || canGmax || canSwitch) {
      const row2 = new ActionRowBuilder();
      if (canMega) row2.addComponents(new ButtonBuilder().setCustomId(`${prefix}_mega`).setLabel(poke.megaData?.isPrimal ? "Primal Reversion" : "Mega Evolve").setEmoji("💎").setStyle(ButtonStyle.Danger));
      if (canGmax) row2.addComponents(new ButtonBuilder().setCustomId(`${prefix}_gmax`).setLabel("Gigantamax").setEmoji("💍").setStyle(ButtonStyle.Danger));
      if (canSwitch) row2.addComponents(new ButtonBuilder().setCustomId(`${prefix}_switch`).setLabel("Switch").setEmoji("🔄").setStyle(ButtonStyle.Secondary));
      rows.push(row2);
    }
    return rows;
  }

  // ── Shared state ──
  let p1Choice = null;
  let p2Choice = null;
  let p1Transform = "";
  let p2Transform = "";
  let resolved = false;

  // Send battle image (no action log — just the field)
  const { embed: turnEmbed, attachment: turnAttachment } = await buildBattleEmbed(battle, null);
  turnEmbed.setTitle("⚔️ Both trainers — choose your move!");
  turnEmbed.setDescription(
    `<@${battle.challenger}> and <@${battle.opponent}> — both pick your move below!\n` +
    `Your choice is **hidden** from your opponent until both have locked in.\n\n⏱️ 60 seconds`
  );
  const turnOpts = { content: `<@${battle.challenger}> <@${battle.opponent}>`, embeds: [turnEmbed], components: [] };
  if (turnAttachment) turnOpts.files = [turnAttachment];
  await message.channel.send(turnOpts);

  // Individual selector messages
  const p1Embed = buildPlayerMoveEmbed(battle, battle.challenger, null);
  const p2Embed = buildPlayerMoveEmbed(battle, battle.opponent, null);
  const p1Rows = buildInitialRows(p1, "p1mv");
  const p2Rows = buildInitialRows(p2, "p2mv");

  const p1Msg = await message.channel.send({ content: `<@${battle.challenger}> — your move:`, embeds: [p1Embed], components: p1Rows });
  const p2Msg = await message.channel.send({ content: `<@${battle.opponent}> — your move:`, embeds: [p2Embed], components: p2Rows });

  // ── Try to resolve when both choices are in ──
  async function tryResolve() {
    if (resolved) return;
    if (!p1Choice || !p2Choice) return;
    resolved = true;
    // Disable both messages silently (no move names shown)
    await p1Msg.edit({ embeds: [new EmbedBuilder().setDescription("✅ Both trainers have chosen! Resolving...").setColor(0x2ecc71)], components: [] }).catch(() => {});
    await p2Msg.edit({ embeds: [new EmbedBuilder().setDescription("✅ Both trainers have chosen! Resolving...").setColor(0x2ecc71)], components: [] }).catch(() => {});
    await resolveSimultaneousMoves(message, battle, channelId, p1, p2, p1Choice, p2Choice, p1Transform, p2Transform);
  }

  // ── Show move buttons after a transform (mega/gmax) — MUST choose move before resolving ──
  async function showMoveSelectionAfterTransform(msg, poke, prefix, isP1, transformText) {
    const afterPrefix = `${prefix}_after`;
    const moveRow = buildMoveButtons(poke, `${afterPrefix}_move`);
    moveRow.addComponents(
      new ButtonBuilder().setCustomId(`${afterPrefix}_pass`).setLabel("Pass").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
    );
    const rows = [moveRow];
    await msg.edit({
      embeds: [buildPlayerMoveEmbed(battle, isP1 ? battle.challenger : battle.opponent, `${transformText}\n\n**Now choose your move:**`)],
      components: rows
    }).catch(() => {});

    // New collector — only responds to this player, only for afterPrefix buttons
    const afterCollector = msg.createMessageComponentCollector({
      filter: i => i.user.id === (isP1 ? battle.challenger : battle.opponent) && i.customId.startsWith(afterPrefix),
      time: 60000,
      max: 1
    });

    afterCollector.on("collect", async (mi) => {
      let move;
      if (mi.customId === `${afterPrefix}_pass`) {
        move = { isPass: true, name: "Pass" };
      } else {
        const moveIdx = parseInt(mi.customId.replace(`${afterPrefix}_move_`, ""));
        move = getCurrentMoves(poke)[moveIdx] || getCurrentMoves(poke)[0];
      }
      if (isP1) p1Choice = move; else p2Choice = move;
      // Show locked-in WITHOUT revealing the move name to channel
      await mi.update({
        embeds: [new EmbedBuilder().setDescription("✅ Move locked in! Waiting for opponent...").setColor(0x2ecc71)],
        components: []
      }).catch(() => {});
      tryResolve();
    });

    afterCollector.on("end", c => {
      if (c.size === 0 && !(isP1 ? p1Choice : p2Choice)) {
        // Auto-pick first move on timeout
        const move = getCurrentMoves(poke)[0];
        if (isP1) p1Choice = move; else p2Choice = move;
        tryResolve();
      }
    });
  }

  // ── Handle a button click from either player ──
  async function handleChoice(interaction, poke, prefix, isP1) {
    const id = interaction.customId;
    const msg = isP1 ? p1Msg : p2Msg;
    const playerId = isP1 ? battle.challenger : battle.opponent;

    // Pass / Do Nothing
    if (id === `${prefix}_pass`) {
      if (isP1) p1Choice = { isPass: true, name: "Pass" };
      else p2Choice = { isPass: true, name: "Pass" };
      await interaction.update({
        embeds: [new EmbedBuilder().setDescription("✅ Passing this turn! Waiting for opponent...").setColor(0x95a5a6)],
        components: []
      });
      tryResolve();
      return;
    }

    // Switch
    if (id === `${prefix}_switch`) {
      const team = isP1 ? battle.p1Team : battle.p2Team;
      const alive = team.filter(p => p.currentHp > 0 && p !== poke);
      const switchRow = new ActionRowBuilder();
      alive.forEach((p, i) => switchRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${prefix}_sw_${i}`)
          .setLabel(`${getBattleName(p)} (HP:${p.currentHp}/${p.maxHp})`.substring(0, 80))
          .setStyle(ButtonStyle.Primary)
      ));
      // Show switch options to this player only — not revealing to channel
      await interaction.update({
        embeds: [buildPlayerMoveEmbed(battle, playerId, "Choose who to switch in:")],
        components: [switchRow]
      });

      const swCollector = msg.createMessageComponentCollector({
        filter: i => i.user.id === playerId && i.customId.startsWith(`${prefix}_sw_`),
        time: 30000, max: 1
      });
      swCollector.on("collect", async (si) => {
        const idx = parseInt(si.customId.replace(`${prefix}_sw_`, ""));
        const switchTo = alive[idx];
        if (!switchTo) return;
        if (isP1) battle.p1Active = switchTo;
        else battle.p2Active = switchTo;
        const tf = `🔄 **${getBattleName(poke)}** → **${getBattleName(switchTo)}**!`;
        if (isP1) { p1Transform = tf; p1Choice = { isSwitchOnly: true }; }
        else { p2Transform = tf; p2Choice = { isSwitchOnly: true }; }
        await si.update({
          embeds: [new EmbedBuilder().setDescription("✅ Switch locked in! Waiting for opponent...").setColor(0x2ecc71)],
          components: []
        });
        tryResolve();
      });
      swCollector.on("end", c => {
        if (c.size === 0) {
          if (isP1) p1Choice = { isSwitchOnly: true };
          else p2Choice = { isSwitchOnly: true };
          tryResolve();
        }
      });
      return;
    }

    // Mega Evolve — apply transform, THEN force move selection
    if (id === `${prefix}_mega`) {
      const megaData = poke.megaData;
      poke.megaEvolved = true; poke.canMega = false;
      poke.activeTypes = megaData.types || poke.activeTypes;
      poke.statBoosts = megaData.statBoost;
      const newMaxHp = poke.maxHp + Math.floor((megaData.statBoost?.hp || 0) * poke.level / 100);
      if (newMaxHp > poke.maxHp) { poke.currentHp += (newMaxHp - poke.maxHp); poke.maxHp = newMaxHp; }
      const tname = megaData.isPrimal ? "Primal Reversion" : "Mega Evolution";
      const tf = `💎 **${getBattleName(poke)}** triggered ${tname}!`;
      if (isP1) p1Transform = tf; else p2Transform = tf;
      // Acknowledge interaction first, then edit to show move selection
      await interaction.deferUpdate().catch(() => {});
      await showMoveSelectionAfterTransform(msg, poke, prefix, isP1, tf);
      return;
    }

    // Gigantamax — apply transform, THEN force move selection
    if (id === `${prefix}_gmax`) {
      const gmaxData = poke.gmaxData;
      poke.gmaxed = true; poke.canGmax = false; poke.gmaxTurns = 3;
      poke.currentHp = Math.floor(poke.currentHp * 1.5);
      poke.maxHp = Math.floor(poke.maxHp * 1.5);
      const tf = `💍 **${getBattleName(poke)}** Gigantamaxed into **${gmaxData.name}**! G-Max moves active for 3 turns!`;
      if (isP1) p1Transform = tf; else p2Transform = tf;
      await interaction.deferUpdate().catch(() => {});
      await showMoveSelectionAfterTransform(msg, poke, prefix, isP1, tf);
      return;
    }

    // Normal move button
    if (id.startsWith(`${prefix}_move_`)) {
      const moveIdx = parseInt(id.replace(`${prefix}_move_`, ""));
      const move = getCurrentMoves(poke)[moveIdx] || getCurrentMoves(poke)[0];
      if (isP1) p1Choice = move; else p2Choice = move;
      // IMPORTANT: Don't reveal move name in message — just show locked in
      await interaction.update({
        embeds: [new EmbedBuilder().setDescription("✅ Move locked in! Waiting for opponent...").setColor(0x2ecc71)],
        components: []
      });
      tryResolve();
      return;
    }
  }

  // ── Collectors — each only responds to correct player ──
  const p1Collector = p1Msg.createMessageComponentCollector({
    filter: i => i.user.id === battle.challenger && !i.customId.startsWith("p1mv_after") && !i.customId.startsWith("p1mv_sw_"),
    time: 60000, max: 1
  });
  const p2Collector = p2Msg.createMessageComponentCollector({
    filter: i => i.user.id === battle.opponent && !i.customId.startsWith("p2mv_after") && !i.customId.startsWith("p2mv_sw_"),
    time: 60000, max: 1
  });

  p1Collector.on("collect", i => handleChoice(i, p1, "p1mv", true));
  p2Collector.on("collect", i => handleChoice(i, p2, "p2mv", false));

  p1Collector.on("end", c => {
    if (c.size === 0 && !p1Choice) {
      p1Choice = getCurrentMoves(p1)[0];
      tryResolve();
    }
  });
  p2Collector.on("end", c => {
    if (c.size === 0 && !p2Choice) {
      p2Choice = getCurrentMoves(p2)[0];
      tryResolve();
    }
  });
}

async function startSimultaneousTurnAI(message, battle, channelId) {
  const p1 = battle.p1Active;
  const p2 = battle.p2Active; // AI

  // AI picks its move immediately
  const aiMove = pickAIMove(battle, p2, p1);
  let aiTransform = "";

  // Handle AI mega/gmax
  if (p2.canGmax && !p2.gmaxed && !p2.megaEvolved && Math.random() < 0.6) {
    p2.gmaxed = true; p2.canGmax = false; p2.gmaxTurns = 3;
    p2.currentHp = Math.floor(p2.currentHp * 1.5);
    p2.maxHp = Math.floor(p2.maxHp * 1.5);
    aiTransform = `💍 🤖 **${getBattleName(p2)}** Gigantamaxed into **${p2.gmaxData.name}**!`;
  } else if (p2.canMega && !p2.megaEvolved && !p2.gmaxed && Math.random() < 0.6) {
    const md = p2.megaData;
    p2.megaEvolved = true; p2.canMega = false;
    p2.activeTypes = md.types || p2.activeTypes;
    p2.statBoosts = md.statBoost;
    aiTransform = `💎 🤖 **${getBattleName(p2)}** ${md.isPrimal ? "underwent Primal Reversion" : "Mega Evolved"}!`;
  }

  // Show battle image + player move selector
  const { embed: turnEmbed, attachment: turnAttachment } = await buildBattleEmbed(battle, null);
  turnEmbed.setTitle("⚔️ Choose Your Move!");
  turnEmbed.setDescription(`<@${battle.challenger}> — pick your move! The AI is ready.\n\n⏱️ 60 seconds`);
  const turnOpts = { embeds: [turnEmbed], components: [] };
  if (turnAttachment) turnOpts.files = [turnAttachment];
  await message.channel.send(turnOpts);

  const p1Embed = buildPlayerMoveEmbed(battle, battle.challenger, "🤖 AI has chosen its move!");
  const moveRow = buildMoveButtons(p1, "p1mv_move");
  moveRow.addComponents(
    new ButtonBuilder().setCustomId("p1mv_pass").setLabel("Pass").setEmoji("⏭️").setStyle(ButtonStyle.Secondary)
  );
  const moveRows = [moveRow];
  const canMega = p1.canMega && !p1.megaEvolved && !p1.gmaxed;
  const canGmax = p1.canGmax && !p1.gmaxed && !p1.megaEvolved;
  if (canMega || canGmax) {
    const row2 = new ActionRowBuilder();
    if (canMega) row2.addComponents(new ButtonBuilder().setCustomId("p1mv_mega").setLabel(p1.megaData?.isPrimal ? "Primal Reversion" : "Mega Evolve").setEmoji("💎").setStyle(ButtonStyle.Danger));
    if (canGmax) row2.addComponents(new ButtonBuilder().setCustomId("p1mv_gmax").setLabel("Gigantamax").setEmoji("💍").setStyle(ButtonStyle.Danger));
    moveRows.push(row2);
  }

  const p1Msg = await message.channel.send({ content: `<@${battle.challenger}>`, embeds: [p1Embed], components: moveRows });
  let p1Transform = "";

  const collector = p1Msg.createMessageComponentCollector({
    filter: i => i.user.id === battle.challenger,
    time: 60000, max: 1
  });

  async function gotP1Move(p1Move) {
    await p1Msg.edit({ embeds: [new EmbedBuilder().setDescription("✅ Move selected! Resolving turn...").setColor(0x2ecc71)], components: [] }).catch(() => {});
    await resolveSimultaneousMoves(message, battle, channelId, p1, p2, p1Move, aiMove, p1Transform, aiTransform);
  }

  collector.on("collect", async (interaction) => {
    const id = interaction.customId;

    // Pass
    if (id === "p1mv_pass") {
      await interaction.update({ components: [] });
      gotP1Move({ isPass: true, name: "Pass" });
      return;
    }

    // Mega evolve — apply, then FORCE move selection
    if (id === "p1mv_mega") {
      const md = p1.megaData;
      p1.megaEvolved = true; p1.canMega = false;
      p1.activeTypes = md.types || p1.activeTypes;
      p1.statBoosts = md.statBoost;
      const newMaxHp = p1.maxHp + Math.floor((md.statBoost?.hp || 0) * p1.level / 100);
      if (newMaxHp > p1.maxHp) { p1.currentHp += (newMaxHp - p1.maxHp); p1.maxHp = newMaxHp; }
      p1Transform = `💎 **${getBattleName(p1)}** ${md.isPrimal ? "underwent Primal Reversion" : "Mega Evolved"}!`;
      const afterMoveRow = buildMoveButtons(p1, "p1mv_after_move");
      afterMoveRow.addComponents(new ButtonBuilder().setCustomId("p1mv_after_pass").setLabel("Pass").setEmoji("⏭️").setStyle(ButtonStyle.Secondary));
      await interaction.update({
        embeds: [buildPlayerMoveEmbed(battle, battle.challenger, `${p1Transform}\n\n**Now choose your move:**`)],
        components: [afterMoveRow]
      });
      const mc = p1Msg.createMessageComponentCollector({
        filter: i => i.user.id === battle.challenger && (i.customId.startsWith("p1mv_after_move_") || i.customId === "p1mv_after_pass"),
        time: 60000, max: 1
      });
      mc.on("collect", async mi => {
        const mv = mi.customId === "p1mv_after_pass"
          ? { isPass: true, name: "Pass" }
          : getCurrentMoves(p1)[parseInt(mi.customId.replace("p1mv_after_move_", ""))] || getCurrentMoves(p1)[0];
        await mi.update({ components: [] });
        gotP1Move(mv);
      });
      mc.on("end", c => { if (c.size === 0) gotP1Move(getCurrentMoves(p1)[0]); });
      return;
    }

    // Gmax — apply, then FORCE move selection
    if (id === "p1mv_gmax") {
      p1.gmaxed = true; p1.canGmax = false; p1.gmaxTurns = 3;
      p1.currentHp = Math.floor(p1.currentHp * 1.5); p1.maxHp = Math.floor(p1.maxHp * 1.5);
      p1Transform = `💍 **${getBattleName(p1)}** Gigantamaxed into **${p1.gmaxData.name}**!`;
      const afterMoveRow = buildMoveButtons(p1, "p1mv_after_move");
      afterMoveRow.addComponents(new ButtonBuilder().setCustomId("p1mv_after_pass").setLabel("Pass").setEmoji("⏭️").setStyle(ButtonStyle.Secondary));
      await interaction.update({
        embeds: [buildPlayerMoveEmbed(battle, battle.challenger, `${p1Transform}\n\n**Choose your G-Max move:**`)],
        components: [afterMoveRow]
      });
      const gc = p1Msg.createMessageComponentCollector({
        filter: i => i.user.id === battle.challenger && (i.customId.startsWith("p1mv_after_move_") || i.customId === "p1mv_after_pass"),
        time: 60000, max: 1
      });
      gc.on("collect", async mi => {
        const mv = mi.customId === "p1mv_after_pass"
          ? { isPass: true, name: "Pass" }
          : getCurrentMoves(p1)[parseInt(mi.customId.replace("p1mv_after_move_", ""))] || getCurrentMoves(p1)[0];
        await mi.update({ components: [] });
        gotP1Move(mv);
      });
      gc.on("end", c => { if (c.size === 0) gotP1Move(getCurrentMoves(p1)[0]); });
      return;
    }

    // Normal move
    if (id.startsWith("p1mv_move_")) {
      const moveIdx = parseInt(id.replace("p1mv_move_", ""));
      const move = getCurrentMoves(p1)[moveIdx] || getCurrentMoves(p1)[0];
      await interaction.update({ components: [] });
      gotP1Move(move);
    }
  });

  collector.on("end", c => {
    if (c.size === 0) gotP1Move(getCurrentMoves(p1)[0]);
  });
}

function pickAIMove(battle, attacker, defender) {
  const moves = getCurrentMoves(attacker);
  const difficulty = battle.aiDifficulty || 0.5;
  if (Math.random() < difficulty) {
    let best = moves[0]; let bestScore = -1;
    for (const m of moves) {
      if (m.isProtect) continue;
      const eff = getEffectiveness(m.type || attacker.activeTypes[0] || "normal", defender.activeTypes || defender.data.types);
      const stab = (attacker.activeTypes || attacker.data.types).includes(m.type || attacker.activeTypes[0] || "normal");
      const score = m.power * eff * (stab ? 1.5 : 1) * ((m.accuracy || 100) / 100);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }
  const valid = moves.filter(m => !m.isProtect);
  return valid[Math.floor(Math.random() * valid.length)] || moves[0];
}

async function resolveSimultaneousMoves(message, battle, channelId, p1, p2, p1Move, p2Move, p1Transform, p2Transform) {
  const p1Name = getBattleName(p1);
  const p2Name = getBattleName(p2);

  // Determine speed order
  const p1Speed = getSpeed(p1);
  const p2Speed = getSpeed(p2);
  const p1GoesFirst = p1Speed >= p2Speed; // tie = p1 first

  const lines = [];

  // Transform announcements first
  if (p1GoesFirst) {
    if (p1Transform) lines.push(p1Transform);
    if (p2Transform) lines.push(p2Transform);
  } else {
    if (p2Transform) lines.push(p2Transform);
    if (p1Transform) lines.push(p1Transform);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Switch-only actions
  const p1SwitchOnly = p1Move?.isSwitchOnly;
  const p2SwitchOnly = p2Move?.isSwitchOnly;

  if (p1SwitchOnly && p1Transform) lines.push(p1Transform);
  if (p2SwitchOnly && p2Transform) lines.push(p2Transform);

  // Execute in speed order and collect results
  let p1Fainted = false;
  let p2Fainted = false;

  function executeMoveCalc(attacker, defender, move) {
    if (!move || move.isSwitchOnly) return null;

    if (move.isPass) {
      return { text: `⏭️ **${getBattleName(attacker)}** passed their turn!`, damage: 0, passed: true };
    }

    if (move.isProtect) {
      return { text: `🛡️ **${getBattleName(attacker)}** used **${move.name}**! It's protecting itself!`, damage: 0, protected: true };
    }

    const atkBoost = attacker.statBoosts?.atk || 0;
    const defBoost = defender.statBoosts?.def || 0;
    const atkStat = calcStat(attacker.data.baseStats.atk, attacker.iv_atk, attacker.level, atkBoost);
    const defStat = calcStat(defender.data.baseStats.def, defender.iv_def, defender.level, defBoost);
    const moveType = move.type || attacker.activeTypes[0] || "normal";
    const effectiveness = getEffectiveness(moveType, defender.activeTypes || defender.data.types);
    const stab = (attacker.activeTypes || attacker.data.types).includes(moveType);
    const hit = Math.random() * 100 <= (move.accuracy || 100);

    if (!hit) {
      return { text: `**${getBattleName(attacker)}** used **${move.name}** — but it missed!`, damage: 0, missed: true };
    }

    let damage = calcDamage(attacker.level, move.power, atkStat, defStat, effectiveness, stab);
    if (attacker.gmaxed) damage = Math.floor(damage * 1.3);

    let effectText = "";
    if (effectiveness === 0) { effectText = " ❌ No effect!"; damage = 0; }
    else if (effectiveness > 1) effectText = " 💥 Super effective!";
    else if (effectiveness < 1) effectText = " 😐 Not very effective...";

    return {
      text: `**${getBattleName(attacker)}** used **${move.name}**!${effectText} Dealt **${damage}** dmg!`,
      damage,
      effectiveness
    };
  }

  // First mover
  const first = p1GoesFirst ? p1 : p2;
  const second = p1GoesFirst ? p2 : p1;
  const firstMove = p1GoesFirst ? p1Move : p2Move;
  const secondMove = p1GoesFirst ? p2Move : p1Move;
  const firstIsP1 = p1GoesFirst;

  const speedLabel = p1GoesFirst
    ? `⚡ **${getBattleName(p1)}** is faster! (${p1Speed} vs ${p2Speed} Spd)`
    : `⚡ **${getBattleName(p2)}** is faster! (${p2Speed} vs ${p1Speed} Spd)`;
  lines.push(speedLabel);
  lines.push("");

  // First move
  const r1 = executeMoveCalc(first, second, firstMove);
  if (r1) {
    lines.push(`🔹 ${r1.text}`);
    if (r1.damage > 0) {
      second.currentHp = Math.max(0, second.currentHp - r1.damage);
      if (second === p2) p2Fainted = second.currentHp <= 0;
      else p1Fainted = second.currentHp <= 0;
    }
    // Show HP after first move
    const hpTarget = second.currentHp;
    const hpMax = second.maxHp;
    const pct = hpTarget / hpMax;
    const bar = `[${"█".repeat(Math.round(pct * 10))}${"░".repeat(10 - Math.round(pct * 10))}]`;
    lines.push(`   └─ ${getBattleName(second)} HP: **${hpTarget}**/${hpMax} \`${bar}\``);
  }

  // Second move only executes if second pokemon didn't faint
  const secondFainted = firstIsP1 ? p2Fainted : p1Fainted;
  if (!secondFainted) {
    lines.push("");
    const r2 = executeMoveCalc(second, first, secondMove);
    if (r2) {
      lines.push(`🔸 ${r2.text}`);
      if (r2.damage > 0) {
        first.currentHp = Math.max(0, first.currentHp - r2.damage);
        if (first === p1) p1Fainted = first.currentHp <= 0;
        else p2Fainted = first.currentHp <= 0;
      }
      const hpTarget = first.currentHp;
      const hpMax = first.maxHp;
      const pct = hpTarget / hpMax;
      const bar = `[${"█".repeat(Math.round(pct * 10))}${"░".repeat(10 - Math.round(pct * 10))}]`;
      lines.push(`   └─ ${getBattleName(first)} HP: **${hpTarget}**/${hpMax} \`${bar}\``);
    }
  }

  const actionLog = lines.join("\n");

  // Check faint conditions
  if (p1Fainted || p2Fainted) {
    // Show the result image with final HP
    const { embed: faintEmbed, attachment: faintAttach } = await buildBattleEmbed(battle, actionLog);
    const faintOpts = { embeds: [faintEmbed], components: [] };
    if (faintAttach) faintOpts.files = [faintAttach];
    await message.channel.send(faintOpts);
    await new Promise(r => setTimeout(r, 1000));

    if (p1Fainted && p2Fainted) {
      // Both faint — check teams
      const p1Alive = battle.p1Team.filter(p => p.currentHp > 0);
      const p2Alive = battle.p2Team.filter(p => p.currentHp > 0);
      if (p1Alive.length === 0 && p2Alive.length === 0) {
        return endBattle(null, battle, channelId, p1, p2, true, message, actionLog + "\n\n💀 Both Pokemon fainted! It's a draw!");
      }
    }

    if (p2Fainted) {
      lines.push(`\n💀 **${getBattleName(p2)}** fainted!`);
      return handleFaint(null, battle, channelId, p1, p2, true, message, actionLog + `\n💀 **${getBattleName(p2)}** fainted!`);
    }
    if (p1Fainted) {
      lines.push(`\n💀 **${getBattleName(p1)}** fainted!`);
      return handleFaint(null, battle, channelId, p2, p1, false, message, actionLog + `\n💀 **${getBattleName(p1)}** fainted!`);
    }
  }

  // No faints — next turn (pass actionLog to show image at start of next turn)
  await new Promise(r => setTimeout(r, battle.isAI ? 1500 : 800));
  startBattleTurn(message, battle, channelId, actionLog);
}

async function handleFaint(interaction, battle, channelId, attacker, defender, isP1Turn, message, actionLog) {
  const defenderTeam = isP1Turn ? battle.p2Team : battle.p1Team;
  const defenderOwner = isP1Turn ? battle.opponent : battle.challenger;

  const aliveDefenders = defenderTeam.filter(p => p.currentHp > 0);

  if (aliveDefenders.length === 0) {
    return endBattle(null, battle, channelId, attacker, defender, isP1Turn, message, actionLog);
  }

  // AI auto-switches
  if (battle.isAI && defenderOwner === "AI_TRAINER") {
    const nextPoke = aliveDefenders[0];
    if (isP1Turn) battle.p2Active = nextPoke;
    else battle.p1Active = nextPoke;
    const switchText = `${actionLog}\n🤖 AI sent out **${getBattleName(nextPoke)}**!`;
    await message.channel.send({ embeds: [new EmbedBuilder().setDescription(switchText).setColor(0xff9900)] });
    await new Promise(r => setTimeout(r, 1500));
    return startBattleTurn(message, battle, channelId, null);
  }

  // Player must choose next pokemon
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
    .setTitle("💀 Pokémon Fainted!")
    .setDescription(`<@${defenderOwner}>, your Pokémon fainted! Choose your next one:`)
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
      embeds: [new EmbedBuilder().setTitle("🔄 Go!").setDescription(`**${getBattleName(nextPoke)}** enters the battle!`).setColor(0x3498db)],
      components: []
    });

    await new Promise(r => setTimeout(r, 1000));
    startBattleTurn(message, battle, channelId, `**${getBattleName(nextPoke)}** enters the battle!`);
  });

  switchCollector.on("end", (c) => {
    if (c.size === 0) {
      const nextPoke = aliveDefenders[0];
      if (isP1Turn) battle.p2Active = nextPoke;
      else battle.p1Active = nextPoke;
      startBattleTurn(message, battle, channelId, `**${getBattleName(nextPoke)}** was auto-sent out!`);
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
