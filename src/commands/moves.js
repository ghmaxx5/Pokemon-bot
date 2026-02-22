const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { pool } = require("../database");
const { getPokemonById } = require("../data/pokemonLoader");
const { capitalize, getTypeEmoji } = require("../utils/helpers");
const { getAvailableMoves } = require("../data/learnsets");

async function execute(message, args) {
  const userId = message.author.id;

  const user = await pool.query("SELECT * FROM users WHERE user_id = $1 AND started = TRUE", [userId]);
  if (user.rows.length === 0) return message.reply("You haven't started yet! Use `p!start` to begin.");

  let pokemonDbId;
  if (args.length > 0 && !isNaN(args[0])) {
    pokemonDbId = parseInt(args[0]);
  } else {
    pokemonDbId = user.rows[0].selected_pokemon_id;
  }

  if (!pokemonDbId) return message.reply("Select a Pokemon first or specify an ID! Use `p!select <id>`.");

  const result = await pool.query("SELECT * FROM pokemon WHERE id = $1 AND user_id = $2", [pokemonDbId, userId]);
  if (result.rows.length === 0) return message.reply("That Pokemon was not found in your collection.");

  const p = result.rows[0];
  const data = getPokemonById(p.pokemon_id);
  if (!data) return message.reply("Pokemon data not found.");

  const pokeName = p.nickname || capitalize(data.name);

  if (args[0] === "set" || args[0] === "equip") {
    return handleEquipMove(message, args, p, data, pokeName, userId);
  }

  const availableMoves = getAvailableMoves(data.types, p.level, p.pokemon_id);
  const equippedMoves = [p.move1, p.move2, p.move3, p.move4].filter(Boolean);

  let moveList = "";
  for (let i = 0; i < availableMoves.length; i++) {
    const m = availableMoves[i];
    const equipped = equippedMoves.includes(m.name);
    const emoji = getTypeEmoji(m.type);
    const eqMark = equipped ? " **[EQUIPPED]**" : "";
    moveList += `${emoji} **${m.name}** — ${capitalize(m.type)} | Power: ${m.power} | Acc: ${m.accuracy}% | Lv.${m.learnLevel}${eqMark}\n`;
  }

  if (moveList.length > 4000) {
    moveList = moveList.substring(0, 3900) + "\n... and more!";
  }

  const embed = new EmbedBuilder()
    .setTitle(`${p.shiny ? "✨ " : ""}${pokeName}'s Moves`)
    .setDescription(
      `**Level:** ${p.level} | **Available Moves:** ${availableMoves.length}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `**Equipped Moves:**\n` +
      formatEquippedMoves(equippedMoves, availableMoves, data.types) + "\n\n" +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `**All Available Moves:**\n${moveList}`
    )
    .setColor(0x3498db)
    .setFooter({ text: "Use p!moves set <slot 1-4> <move name> to equip a move" });

  if (availableMoves.length > 4) {
    const selectOptions = availableMoves.slice(0, 25).map((m, i) => ({
      label: m.name,
      description: `${capitalize(m.type)} | Pow: ${m.power} | Acc: ${m.accuracy}% | Lv.${m.learnLevel}`,
      value: `equip_${m.name}`,
      emoji: getTypeEmoji(m.type)
    }));

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("move_equip_select")
        .setPlaceholder("Quick equip a move to next open slot...")
        .addOptions(selectOptions)
    );

    const reply = await message.channel.send({ embeds: [embed], components: [selectRow] });

    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === userId,
      time: 60000,
      max: 10
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId === "move_equip_select") {
        const moveName = interaction.values[0].replace("equip_", "");

        // Defer immediately to prevent "interaction failed" on slow DB calls
        await interaction.deferReply({ ephemeral: true });

        const current = await pool.query("SELECT move1, move2, move3, move4 FROM pokemon WHERE id = $1", [p.id]);
        const row = current.rows[0];
        const slots = [row.move1, row.move2, row.move3, row.move4];

        if (slots.includes(moveName)) {
          return interaction.editReply({ content: `**${moveName}** is already equipped!` });
        }

        let slotIdx = slots.findIndex(s => !s);
        if (slotIdx === -1) {
          // All slots full — show replace buttons in a follow-up non-ephemeral message
          // so the collector on `reply` can see the button clicks
          const replaceRow = new ActionRowBuilder();
          for (let i = 0; i < 4; i++) {
            replaceRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`replace_${i}_${moveName}`)
                .setLabel(`Slot ${i + 1}: ${slots[i] || "Empty"}`.substring(0, 80))
                .setStyle(ButtonStyle.Secondary)
            );
          }
          await interaction.editReply({ content: `All 4 slots are full! Choose which to **replace** with **${moveName}**:` });
          // Send the replace buttons on the main reply so the collector can pick them up
          await reply.edit({ components: [replaceRow] }).catch(() => {});
          return;
        }

        const slotCol = `move${slotIdx + 1}`;
        await pool.query(`UPDATE pokemon SET ${slotCol} = $1 WHERE id = $2`, [moveName, p.id]);

        const moveEmoji = getTypeEmoji(availableMoves.find(m => m.name === moveName)?.type || "normal");
        await interaction.editReply({
          content: `${moveEmoji} **${pokeName}** equipped **${moveName}** in slot ${slotIdx + 1}!`
        });

        // Restore original select menu after equipping
        const updatedResult = await pool.query("SELECT move1, move2, move3, move4 FROM pokemon WHERE id = $1", [p.id]);
        const updatedSlots = [updatedResult.rows[0].move1, updatedResult.rows[0].move2, updatedResult.rows[0].move3, updatedResult.rows[0].move4].filter(Boolean);
        embed.setDescription(
          `**Level:** ${p.level} | **Available Moves:** ${availableMoves.length}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `**Equipped Moves:**\n` +
          formatEquippedMoves(updatedSlots, availableMoves, data.types) + "\n\n" +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**All Available Moves:**\n${moveList}`
        );
        await reply.edit({ embeds: [embed], components: [selectRow] }).catch(() => {});

      } else if (interaction.customId.startsWith("replace_")) {
        // Defer immediately
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        const slotIdx = parseInt(parts[1]);
        const moveName = parts.slice(2).join("_");

        const current = await pool.query("SELECT move1, move2, move3, move4 FROM pokemon WHERE id = $1", [p.id]);
        const oldMove = current.rows[0][`move${slotIdx + 1}`];

        const slotCol = `move${slotIdx + 1}`;
        await pool.query(`UPDATE pokemon SET ${slotCol} = $1 WHERE id = $2`, [moveName, p.id]);

        const moveEmoji = getTypeEmoji(availableMoves.find(m => m.name === moveName)?.type || "normal");

        // Refresh equipped moves display
        const updatedResult = await pool.query("SELECT move1, move2, move3, move4 FROM pokemon WHERE id = $1", [p.id]);
        const updatedSlots = [updatedResult.rows[0].move1, updatedResult.rows[0].move2, updatedResult.rows[0].move3, updatedResult.rows[0].move4].filter(Boolean);
        embed.setDescription(
          `**Level:** ${p.level} | **Available Moves:** ${availableMoves.length}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `**Equipped Moves:**\n` +
          formatEquippedMoves(updatedSlots, availableMoves, data.types) + "\n\n" +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `**All Available Moves:**\n${moveList}`
        );

        // Restore original select menu and update the embed
        await reply.edit({
          embeds: [embed],
          components: [selectRow]
        }).catch(() => {});

        // Send confirmation as a new ephemeral follow-up
        await interaction.followUp({
          content: `${moveEmoji} **${pokeName}** replaced **${oldMove || "empty"}** with **${moveName}** in slot ${slotIdx + 1}!`,
          ephemeral: true
        });
      }
    });
  } else {
    message.channel.send({ embeds: [embed] });
  }
}

async function handleEquipMove(message, args, p, data, pokeName, userId) {
  if (args.length < 3) {
    return message.reply("Usage: `p!moves set <slot 1-4> <move name>`\nExample: `p!moves set 1 Flamethrower`");
  }

  const slot = parseInt(args[1]);
  if (isNaN(slot) || slot < 1 || slot > 4) {
    return message.reply("Slot must be between 1 and 4!");
  }

  const moveName = args.slice(2).join(" ");
  const availableMoves = getAvailableMoves(data.types, p.level, p.pokemon_id);
  const move = availableMoves.find(m => m.name.toLowerCase() === moveName.toLowerCase());

  if (!move) {
    return message.reply(`**${moveName}** is not available for this Pokemon at level ${p.level}! Use \`p!moves\` to see available moves.`);
  }

  const slotCol = `move${slot}`;
  await pool.query(`UPDATE pokemon SET ${slotCol} = $1 WHERE id = $2`, [move.name, p.id]);

  const emoji = getTypeEmoji(move.type);
  return message.reply(`${emoji} **${pokeName}** learned **${move.name}** in slot ${slot}! (${capitalize(move.type)} | Power: ${move.power} | Acc: ${move.accuracy}%)`);
}

function formatEquippedMoves(equippedNames, availableMoves, types) {
  if (equippedNames.length === 0) return "No moves equipped yet! Use `p!moves set <slot> <move>` to equip moves.";

  let text = "";
  for (let i = 0; i < 4; i++) {
    const name = equippedNames[i] || i < equippedNames.length ? equippedNames[i] : null;
    if (name) {
      const moveData = availableMoves.find(m => m.name === name);
      const emoji = getTypeEmoji(moveData?.type || types[0] || "normal");
      text += `**Slot ${i + 1}:** ${emoji} ${name} (${capitalize(moveData?.type || "normal")} | Pow: ${moveData?.power || "?"} | Acc: ${moveData?.accuracy || "?"}%)\n`;
    } else {
      text += `**Slot ${i + 1}:** _Empty_\n`;
    }
  }
  return text;
}

module.exports = { name: "moves", aliases: ["moveset", "ms"], description: "View and equip moves for your Pokemon", execute };
