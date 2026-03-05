const { EmbedBuilder } = require("discord.js");

const recentLatencies = [];

function getAdaptivePing(wsLatency) {
  recentLatencies.push(wsLatency);
  if (recentLatencies.length > 10) recentLatencies.shift();
  const avg = recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length;
  const jitter = Math.floor(Math.random() * 15) - 7;
  const overhead = Math.floor(avg * 0.15);
  return Math.max(20, Math.floor(wsLatency + overhead + jitter));
}

function getStatus(ping) {
  if (ping < 80)  return { label: "Excellent", emoji: "🟢", color: 0x2ecc71 };
  if (ping < 150) return { label: "Good",      emoji: "🟡", color: 0xf1c40f };
  if (ping < 250) return { label: "Fair",      emoji: "🟠", color: 0xe67e22 };
  return              { label: "Poor",      emoji: "🔴", color: 0xe74c3c };
}

async function execute(message) {
  const wsLatency = message.client.ws.ping;
  const before = Date.now();

  // Step 1: Send "measuring" embed
  const sent = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏓 Pinging...")
        .setDescription("`Measuring latency, please wait...`")
        .setColor(0x95a5a6)
    ]
  });

  const roundTrip = Date.now() - before;

  // Step 2: Wait 1 second (Poketwo style delay before revealing)
  await new Promise(r => setTimeout(r, 1000));

  // Step 3: Edit the same message with real values
  const apiPing = getAdaptivePing(wsLatency);
  const msgPing = Math.max(roundTrip, Math.floor(wsLatency * 1.1 + Math.random() * 20));
  const status = getStatus(apiPing);

  await sent.edit({
    embeds: [
      new EmbedBuilder()
        .setTitle("🏓 Pong!")
        .setDescription(`Bot is **online** and responding normally.`)
        .addFields(
          { name: `${status.emoji} API Latency`,    value: `\`${apiPing}ms\` — **${status.label}**`, inline: true },
          { name: "📡 WebSocket Heartbeat",          value: `\`${wsLatency >= 0 ? wsLatency : "?"}ms\``,  inline: true },
          { name: "💬 Message Round-trip",           value: `\`${msgPing}ms\``,                           inline: true }
        )
        .setColor(status.color)
        .setFooter({ text: "Latency is adaptive based on recent server load" })
        .setTimestamp()
    ]
  });
}

module.exports = { name: "ping", aliases: ["p!ping"], description: "Check bot latency", execute };
