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

// Axios for SellAuth
const axios = require("axios");

// ---------- CONFIG ----------
const BOT_TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const GUILD_ID = "1463364200540799040";
const VOUCH_CHANNEL_ID = "1465800235673452722";
const WELCOME_CHANNEL_ID = "1465839225789354145";
const DATA_FILE = "./vouches.json";

// SellAuth stock config
const API_KEY = "5617211|cdpWyPOBL8BPWPBh5eAtip7fIuAcoFgMsBBulktJ193f760c";
const STOCK_CHANNEL_ID = "1465838878970871889"; // Channel for restock embeds
let lastStock = {};

// ---------- WELCOME DUPLICATE PROTECTION ----------
const welcomedUsers = new Set();

// ---------- EXPRESS SERVER ----------
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.status(200).send("Bot is running!"));

app.listen(PORT, () => {
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

// ---------- STOCK CHECK FUNCTION (FULL DEBUG) ----------
async function checkStock(client) {
  try {
    console.log("===== Running stock check =====");

    const channel = await client.channels.fetch(STOCK_CHANNEL_ID).catch(err => {
      console.error("Failed to fetch stock channel:", err);
    });
    if (!channel) {
      console.error("Stock channel not found! Check STOCK_CHANNEL_ID and permissions.");
      return;
    }
    console.log("Channel fetched:", channel.id);

    const res = await axios.get("https://api.sellauth.com/v1/products", {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    console.log("Raw SellAuth data:", JSON.stringify(res.data, null, 2));

    const products = res.data.data;
    if (!products || !products.length) {
      console.log("No products returned from SellAuth.");
      return;
    }

    for (const product of products) {
      console.log("Checking product:", product);
      const name = product.name || "UNKNOWN PRODUCT";
      const stockRaw = product.stock;
      const stock = Number(stockRaw);

      console.log(`Product: ${name} | Stock raw: ${stockRaw} | Stock number: ${stock} | Last stock: ${lastStock[name]}`);

      if (!(name in lastStock)) {
        console.log(`Initializing lastStock for ${name}`);
        lastStock[name] = 0;
      }

      if (stock > lastStock[name]) {
        console.log(`Stock increased for ${name}: ${lastStock[name]} → ${stock} ✅ Sending embed...`);

        const embed = new EmbedBuilder()
          .setAuthor({ name: "Sylix", iconURL: "https://i.imgur.com/yourlogo.png" })
          .setTitle("Restock Notifications")
          .setDescription(`**Product: ${name} has been restocked**\nStock Level: ${stock}`)
          .setColor("#2b2d31")
          .setFooter({ text: "Discord Notify 1.3.1" })
          .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(err => {
          console.error("Failed to send restock embed:", err);
        });
      }

      lastStock[name] = stock;
    }

    console.log("===== Stock check complete =====\n");

  } catch (err) {
    console.error("Stock check error:", err);
  }
}

// ---------- READY ----------
client.once("ready", async () => {
  try {
    console.log(`Logged in as ${client.user.tag}`);

    // ---------- REGISTER SLASH COMMANDS ----------
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

    // ---------- STICKY VOUCH MESSAGE ----------
    try {
      const vouchChannel = await client.channels.fetch(VOUCH_CHANNEL_ID);
      if (vouchChannel) {
        await ensureSingleSticky(vouchChannel);
      }
    } catch (err) {
      console.error("Sticky startup error:", err);
    }

    // ---------- INITIAL STOCK CHECK ----------
    console.log("Running initial stock check...");
    await checkStock(client);

    // ---------- TEST EMBED FOR STOCK CHANNEL ----------
    try {
      const testChannel = await client.channels.fetch(STOCK_CHANNEL_ID);
      if (testChannel) {
        console.log("Sending test embed to verify stock channel...");
        const testEmbed = new EmbedBuilder()
          .setTitle("TEST EMBED")
          .setDescription("✅ Bot can post in this channel")
          .setColor("#00ff00")
          .setTimestamp();
        await testChannel.send({ embeds: [testEmbed] });
      }
    } catch (err) {
      console.error("Failed to send test embed:", err);
    }

    // ---------- REPEATING STOCK CHECK ----------
    setInterval(() => {
      checkStock(client);
    }, 60000);

  } catch (err) {
    console.error("Ready event error:", err);
  }
});

// ---------- WELCOME ----------
client.on("guildMemberAdd", async (member) => {
  try {
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const messages = await channel.messages.fetch({ limit: 20 });
    const alreadyWelcomed = messages.some(msg =>
      msg.author.id === client.user.id &&
      msg.mentions.users.has(member.id)
    );
    if (alreadyWelcomed) return;

    const embed = new EmbedBuilder()
      .setColor(0x4587ff)
      .setTitle("Welcome!")
      .setDescription(
`**<:sylix:1468005258126163990> Welcome To Sylix.cc <@${member.id}>**
<:discordemoji:1479274884809883762> Please make sure to [verify](https://discord.com/channels/1463364200540799040/1465839281808609381) to gain full access
<:discordemoji:1479274884809883762> Check out our [website](https://sylix.cc/)
<:discordemoji:1479274884809883762> If you need support please make a [ticket](https://discord.com/channels/1463364200540799040/1465800232502825275)
<:discorde:1479274851444330570> Make sure to read all of the [rules](https://discord.com/channels/1463364200540799040/1465937574169411686)`
      )
      .setThumbnail("https://i.ibb.co/ymn10dMY/your-image.png")
      .setFooter({
        text: `Sylix • Member #${member.guild.memberCount}`,
        iconURL: member.guild.iconURL()
      });

    await channel.send({
      content: `<@${member.id}>`,
      embeds: [embed]
    });

  } catch (err) {
    console.error("Welcome event error:", err);
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

    await moveStickyToBottom(channel);
    await ensureSingleSticky(channel);

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
  .then(() => console.log("Bot logged in successfully."))
  .catch(err => {
    console.error("Bot login failed:", err);
  });