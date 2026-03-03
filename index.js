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

// ---------- EXPRESS SERVER FOR RENDER ----------
const app = express();
const PORT = process.env.PORT || 3000;

console.log("Starting web server...");

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
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ count: 0, vouches: [] }, null, 2)
    );
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { count: 0, vouches: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------- CREATE CLIENT ----------
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
      o.setName("product")
        .setDescription("Product name")
        .setRequired(true))
    .addStringOption(o =>
      o.setName("description")
        .setDescription("Vouch description")
        .setRequired(true))
    .addIntegerOption(o =>
      o.setName("rating")
        .setDescription("Rating 1–5")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5))
    .addUserOption(o =>
      o.setName("voucher")
        .setDescription("Who is giving the vouch")
        .setRequired(false))
].map(c => c.toJSON());

// ---------- CUSTOM EMOJI ----------
const STAR_EMOJI = "<:bluestar:1476760052106006598>";

// ---------- AUTO STICKY SYSTEM ----------
let stickyMessageId = null;
const STICKY_TITLE = `${STAR_EMOJI} Sylix Vouch Channel`;

async function postSticky(channel) {
  const stickyEmbed = new EmbedBuilder()
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

  const msg = await channel.send({ embeds: [stickyEmbed] });
  stickyMessageId = msg.id;
}

// ---------- READY EVENT ----------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("Slash command registered successfully");
  } catch (error) {
    console.error("Error registering commands:", error);
  }

  const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
  if (!channel) return;

  const pinned = await channel.messages.fetchPinned();
  const oldStickies = pinned.filter(
    m => m.author.id === client.user.id && m.embeds[0]?.title === STICKY_TITLE
  );

  for (const [, msg] of oldStickies) {
    try {
      await msg.delete().catch(() => {});
    } catch {}
  }

  await postSticky(channel);
});

// ---------- AUTO STICKY LISTENER ----------
let isUpdatingSticky = false;

client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (message.channel.id !== VOUCH_CHANNEL_ID) return;
  if (isUpdatingSticky) return;

  const channel = message.channel;

  try {
    isUpdatingSticky = true;

    // Delete previous sticky if exists
    if (stickyMessageId) {
      try {
        const oldSticky = await channel.messages.fetch(stickyMessageId);
        if (oldSticky) await oldSticky.delete().catch(() => {});
      } catch {}
    }

    await postSticky(channel);

  } catch (err) {
    console.error("Sticky error:", err);
  } finally {
    isUpdatingSticky = false;
  }
});

// ---------- INTERACTION HANDLER ----------
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "vouch") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const product = interaction.options.getString("product");
      const description = interaction.options.getString("description");
      const rating = interaction.options.getInteger("rating");
      const voucher = interaction.options.getUser("voucher") || interaction.user;

      const stars = STAR_EMOJI.repeat(rating);

      const data = getData();
      data.count += 1;

      const newVouch = {
        id: data.count,
        product,
        description,
        rating,
        voucherId: voucher.id,
        date: new Date().toISOString()
      };

      data.vouches.push(newVouch);
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
        .setFooter({ text: `Total Vouches: ${data.count}` })
        .setTimestamp();

      const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
      if (!channel) {
        return await interaction.editReply({
          content: "Vouch channel not found."
        });
      }

      await channel.send({ embeds: [embed] });

      await interaction.editReply({
        content: "Your vouch has been submitted successfully."
      });

    } catch (error) {
      console.error("Interaction error:", error);

      if (!interaction.replied) {
        await interaction.editReply({ content: "Something went wrong." });
      }
    }
  }
});

// ---------- LOGIN ----------
client.login(BOT_TOKEN);