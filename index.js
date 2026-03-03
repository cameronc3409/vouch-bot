// index.js

// ---------- IMPORTS ----------
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  REST,
  Routes
} = require("discord.js");
const fs = require("fs");
require("dotenv").config();

// ---------- EXPRESS SERVER ----------
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("Bot is running!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PORT OPENED ON ${PORT}`);
});

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = "1463364200540799040";
const VOUCH_CHANNEL_ID = "1465800235673452722";
const DATA_FILE = "./vouches.json";

// ---------- DATA HANDLING ----------
function getData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ vouches: [] }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { vouches: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------- CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---------- SLASH COMMAND ----------
const commands = [
  new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Leave a vouch")
    .addStringOption(o =>
      o.setName("product").setDescription("Product name").setRequired(true))
    .addStringOption(o =>
      o.setName("description").setDescription("Vouch description").setRequired(true))
    .addIntegerOption(o =>
      o.setName("rating")
        .setDescription("Rating 1–5")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5))
    .addUserOption(o =>
      o.setName("voucher").setDescription("Who is giving the vouch"))
].map(c => c.toJSON());

// ---------- STICKY ----------
const STAR_EMOJI = "<:bluestar:1476760052106006598>";
const STICKY_TITLE = `${STAR_EMOJI} Sylix Vouch Channel`;
let stickyMessageId = null;
const movingStickyChannels = new Set();

async function createSticky(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x4587ff)
    .setTitle(STICKY_TITLE)
    .setDescription(
      `Welcome to the official vouch channel!\n\n` +
      `• Use /vouch to leave a review.\n` +
      `• Be honest and detailed.\n` +
      `• Fake vouches will be removed.\n\n` +
      `Thank you for supporting Sylix!`
    )
    .setFooter({ text: "This message stays at the bottom." })
    .setTimestamp();

  const msg = await channel.send({ embeds: [embed] });
  stickyMessageId = msg.id;
  return msg;
}

// ---------- READY ----------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("Slash commands registered.");
  } catch (err) {
    console.error("Error registering commands:", err);
  }

  try {
    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
    if (channel) await createSticky(channel);
  } catch (err) {
    console.error("Error creating sticky on startup:", err);
  }
});

// ---------- AUTO MOVE STICKY (fixed) ----------
client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (message.channel.id !== VOUCH_CHANNEL_ID) return;
  if (movingStickyChannels.has(message.channel.id)) return;

  movingStickyChannels.add(message.channel.id);

  try {
    if (stickyMessageId) {
      try {
        const oldSticky = await message.channel.messages.fetch(stickyMessageId);
        if (oldSticky) await oldSticky.delete().catch(() => {});
      } catch {}
    }
    await createSticky(message.channel);
  } catch (err) {
    console.error("Sticky move error:", err);
  }

  movingStickyChannels.delete(message.channel.id);
});

// ---------- AUTO RECOVER ----------
client.on("messageDelete", async message => {
  if (!message.guild) return;
  if (message.channel.id !== VOUCH_CHANNEL_ID) return;
  if (message.id !== stickyMessageId) return;

  try {
    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
    if (channel) await createSticky(channel);
  } catch (err) {
    console.error("Sticky recover error:", err);
  }
});

// ---------- INTERACTION ----------
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "vouch") return;

  try {
    // Defer reply immediately
    await interaction.deferReply({ flags: 64 });

    const product = interaction.options.getString("product");
    const description = interaction.options.getString("description");
    const rating = interaction.options.getInteger("rating");
    const voucher = interaction.options.getUser("voucher") || interaction.user;

    const stars = STAR_EMOJI.repeat(rating);

    const data = getData();
    const newId = data.vouches.length + 1;

    data.vouches.push({
      id: newId,
      product,
      description,
      rating,
      voucherId: voucher.id,
      date: new Date().toISOString()
    });

    saveData(data);

    const embed = new EmbedBuilder()
      .setColor(0x4587ff)
      .setAuthor({
        name: `${voucher.username} • Verified Customer`,
        iconURL: voucher.displayAvatarURL()
      })
      .setTitle("Sylix.cc Vouches")
      .setDescription(
        `**Product**\n\`${product}\`\n\n` +
        `**Rating**\n${stars}\n\n` +
        `**Review**\n${description}`
      )
      .setThumbnail(voucher.displayAvatarURL({ size: 512 }))
      .setFooter({ text: `Total Vouches: ${data.vouches.length}` })
      .setTimestamp();

    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
    if (!channel) {
      return await interaction.editReply({ content: "Vouch channel not found." });
    }

    await channel.send({ embeds: [embed] });
    await interaction.editReply({ content: "✅ Your vouch has been submitted." });

  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "❌ Something went wrong.", ephemeral: true });
    } else {
      await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
    }
  }
});

// ---------- LOGIN ----------
client.login(BOT_TOKEN);