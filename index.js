// ---------- START ----------
console.log("BOT PROCESS STARTED");

// ---------- IMPORTS ----------
const express = require("express");
const fs = require("fs");
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const GUILD_ID = "1463364200540799040";
const VOUCH_CHANNEL_ID = "1465800235673452722";
const WELCOME_CHANNEL_ID = "1465839225789354145";

const DATA_FILE = "./vouches.json";

// ---------- TOKEN CHECK ----------
if (!BOT_TOKEN) {
  console.error("❌ TOKEN missing from environment variables.");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("❌ CLIENT_ID missing from environment variables.");
  process.exit(1);
}

console.log("✅ Environment variables loaded");

// ---------- EXPRESS SERVER ----------
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("Bot is running!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// ---------- DATA ----------
function getData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ vouches: [] }, null, 2));
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE));
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
    GatewayIntentBits.GuildMembers,
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
        .setDescription("Rating 1-5")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5))
    .addUserOption(o =>
      o.setName("voucher")
        .setDescription("Who is giving the vouch"))
].map(c => c.toJSON());

// ---------- STICKY ----------
const STAR = "<:bluestar:1476760052106006598>";
const STICKY_TITLE = `${STAR} Sylix Vouch Channel`;

function buildSticky() {
  return new EmbedBuilder()
    .setColor(0x4587ff)
    .setTitle(STICKY_TITLE)
   .setDescription(
  "Welcome to the official vouch channel!\n\n" +
  "• Use /vouch to leave a review\n" +
  "• Be honest and detailed\n" +
  "• Fake vouches will be removed\n\n" +
  "Thank you for supporting Sylix!"
)
    )
    .setFooter({ text: "This message stays at the bottom." })
    .setTimestamp();
}

async function moveSticky(channel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 10 });

    const sticky = msgs.find(
      m => m.author.id === client.user.id &&
      m.embeds.length &&
      m.embeds[0].title === STICKY_TITLE
    );

    if (sticky) await sticky.delete().catch(() => {});

    await channel.send({ embeds: [buildSticky()] });

  } catch (err) {
    console.error("Sticky error:", err);
  }
}

// ---------- READY ----------
client.once("ready", async () => {

  console.log(`🤖 Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Slash commands registered");

  } catch (err) {
    console.error("Command register error:", err);
  }

  try {
    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);
    if (channel) await channel.send({ embeds: [buildSticky()] });
  } catch (err) {
    console.error("Sticky startup error:", err);
  }

});

// ---------- WELCOME ----------
const botStart = Date.now();

client.on("guildMemberAdd", async member => {

  if (member.joinedTimestamp < botStart) return;

  try {

    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x4587ff)
      .setTitle(`Hi ${member.user.username}`)
      .setDescription("Welcome to **Sylix.cc**!")
      .setFooter({
        text: `Member #${member.guild.memberCount}`
      })
      .setThumbnail(member.user.displayAvatarURL());

    channel.send({ embeds: [embed] });

  } catch (err) {
    console.error("Welcome error:", err);
  }

});

// ---------- STICKY MOVE ----------
client.on("messageCreate", async msg => {

  if (msg.author.bot) return;
  if (msg.channel.id !== VOUCH_CHANNEL_ID) return;

  moveSticky(msg.channel);

});

// ---------- VOUCH ----------
client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "vouch") return;

  await interaction.deferReply({ ephemeral: true });

  try {

    const product = interaction.options.getString("product");
    const description = interaction.options.getString("description");
    const rating = interaction.options.getInteger("rating");
    const voucher = interaction.options.getUser("voucher") || interaction.user;

    const stars = STAR.repeat(rating);

    const data = getData();

    data.vouches.push({
      product,
      description,
      rating,
      user: voucher.id
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
        `**Product**\n${product}\n\n` +
        `**Rating**\n${stars}\n\n` +
        `**Review**\n${description}`
      )
      .setFooter({ text: `Total Vouches: ${data.vouches.length}` })
      .setTimestamp();

    const channel = await client.channels.fetch(VOUCH_CHANNEL_ID);

    if (channel) {
      await channel.send({ embeds: [embed] });
    }

    interaction.editReply("✅ Vouch submitted");

  } catch (err) {

    console.error("Vouch error:", err);

    interaction.editReply("❌ Something went wrong");

  }

});

// ---------- LOGIN ----------
client.login(BOT_TOKEN);