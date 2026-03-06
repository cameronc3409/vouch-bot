// ---------- index.js ----------

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

// ---------- EXPRESS SERVER ----------
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.status(200).send("Bot is running!"));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PORT OPENED ON ${PORT}`);
});

// ---------- DATA HANDLING ----------
function getData() {
  if (!fs.existsSync(DATA_FILE))
    fs.writeFileSync(DATA_FILE, JSON.stringify({ vouches: [] }, null, 2));

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
        .setDescription("Rating 1–5")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5))
    .addUserOption(o =>
      o.setName("voucher")
        .setDescription("Who is giving the vouch"))
].map(c => c.toJSON());

// ---------- STICKY SYSTEM ----------
const STAR_EMOJI = "<:bluestar:1476760052106006598>";
const STICKY_TITLE = `${STAR_EMOJI} Sylix Vouch Channel`;

async function buildStickyEmbed() {
  return new EmbedBuilder()
    .setColor(0x4587ff)
    .setTitle(STICKY_TITLE)
    .setDescription(
      "Welcome to the official vouch channel!\n\n" +
      "• Use /vouch to leave a review.\n" +
      "• Be honest and detailed.\n" +
      "• Fake vouches will be removed.\n\n" +
      "Thank you for supporting Sylix!"
    )
    .setFooter({ text: "This message stays at the bottom." })
    .setTimestamp();
}

async function ensureSingleSticky(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 25 });

    const stickies = messages.filter(
      m =>
        m.author.id === client.user.id &&
        m.embeds.length &&
        m.embeds[0].title === STICKY_TITLE
    );

    if (stickies.size > 1) {
      const sorted = [...stickies.values()].sort(
        (a, b) => b.createdTimestamp - a.createdTimestamp
      );

      const newest = sorted[0];

      for (let i = 1; i < sorted.length; i++)
        await sorted[i].delete().catch(() => {});

      return newest;
    }

    if (stickies.size === 1) return stickies.first();

    const embed = await buildStickyEmbed();
    return channel.send({ embeds: [embed] });

  } catch (err) {
    console.error("Error ensuring sticky:", err);
    return null;
  }
}

async function moveStickyToBottom(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 10 });

    const sticky = messages.find(
      m =>
        m.author.id === client.user.id &&
        m.embeds.length &&
        m.embeds[0].title === STICKY_TITLE
    );

    if (!sticky) return ensureSingleSticky(channel);

    await sticky.delete().catch(() => {});

    const embed = await buildStickyEmbed();
    return channel.send({ embeds: [embed] });

  } catch (err) {
    console.error("Error moving sticky:", err);
    return null;
  }
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
    const vouchChannel = await client.channels.fetch(VOUCH_CHANNEL_ID);

    if (vouchChannel)
      await ensureSingleSticky(vouchChannel);

  } catch (err) {
    console.error("Sticky startup error:", err);
  }

});

// ---------- WELCOME ----------
const botReadyTime = Date.now();

client.on("guildMemberAdd", async member => {

  try {

    if (member.joinedTimestamp < botReadyTime) return;

    const channel = await client.channels
      .fetch(WELCOME_CHANNEL_ID)
      .catch(() => null);

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x4587ff)
      .setTitle(`Hi <@${member.id}>`)
      .setDescription(
`**<:sylix:1468005258126163990> Welcome To Sylix.cc!**
<:discordemoji:1479274884809883762> Check out our [website](https://sylix.cc/)
<:discordemoji:1479274884809883762> If you need support please make a [ticket](https://discord.com/channels/1463364200540799040/1465800232502825275)
<:discorde:1479274851444330570> Make sure to read all of the [rules](https://discord.com/channels/1463364200540799040/1465937574169411686)`
      )
      .setThumbnail("https://i.ibb.co/ymn10dMY/your-image.png")
      .setFooter({
        text: `Sylix • Welcome System • Member #${member.guild.memberCount}`,
        iconURL: member.guild.iconURL()
      });

    await channel.send({ embeds: [embed] });

  } catch (err) {
    console.error("Welcome event error:", err);
  }

});

// ---------- AUTO MOVE STICKY ----------
client.on("messageCreate", async message => {

  if (message.author.bot) return;
  if (message.channel.id !== VOUCH_CHANNEL_ID) return;

  try {

    await moveStickyToBottom(message.channel);
    await ensureSingleSticky(message.channel);

  } catch (err) {
    console.error("Message create sticky error:", err);
  }

});

// ---------- INTERACTION ----------
client.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "vouch") return;

  try {

    await interaction.deferReply({ ephemeral: true });

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
`**Product**
\`${product}\`

**Rating**
${stars}

**Review**
${description}`
      )
      .setThumbnail(voucher.displayAvatarURL({ size: 512 }))
      .setFooter({ text: `Total Vouches: ${data.vouches.length}` })
      .setTimestamp();

    const channel = await client.channels
      .fetch(VOUCH_CHANNEL_ID)
      .catch(() => null);

    if (!channel)
      return interaction.editReply({ content: "Vouch channel not found." });

    await channel.send({ embeds: [embed] });

    await interaction.editReply({
      content: "✅ Your vouch has been submitted."
    });

  } catch (err) {

    console.error("Interaction error:", err);

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: "❌ Something went wrong.",
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: "❌ Something went wrong.",
        ephemeral: true
      });
    }

  }

});

// ---------- LOGIN ----------
client.login(BOT_TOKEN)
.catch(err => console.error("Bot login failed:", err));