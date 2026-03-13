// ---------- WELCOME ----------
client.on("guildMemberAdd", async (member) => {

  if (welcomedUsers.has(member.id)) return;
  welcomedUsers.add(member.id);

  try {
    const channel = await client.channels
      .fetch(WELCOME_CHANNEL_ID)
      .catch(() => null);

    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(0x4587ff)
      .setTitle("hi")
      .setDescription(
`**<:sylix:1468005258126163990> Welcome To Sylix.cc!**
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