import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { stmts } from '../database.js';
import { buildTradeEmbed } from '../embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Offer a trade or gift a character to another server member')
    .addUserOption(o => o.setName('user').setDescription('Who to trade with').setRequired(true))
    .addStringOption(o => o.setName('offer').setDescription('Your character to offer').setRequired(true))
    .addStringOption(o => o.setName('want').setDescription('Their character you want in return (omit to gift for free)').setRequired(false)),

  async execute(interaction) {
    const target  = interaction.options.getUser('user');
    const offerQ  = interaction.options.getString('offer');
    const wantQ   = interaction.options.getString('want');
    const guildId = interaction.guildId;
    const userId  = interaction.user.id;

    if (target.id === userId) return interaction.reply({ content: 'You cannot trade with yourself.', flags: 64 });
    if (target.bot)           return interaction.reply({ content: 'You cannot trade with a bot.', flags: 64 });

    const myChars = stmts.searchChars.all(guildId, `%${offerQ}%`).filter(c => c.owner_id === userId);
    if (!myChars.length) return interaction.reply({ content: `You don't own a character matching **"${offerQ}"**.`, flags: 64 });
    const offerChar = myChars[0];

    let requestChar = null;
    if (wantQ) {
      const theirChars = stmts.searchChars.all(guildId, `%${wantQ}%`).filter(c => c.owner_id === target.id);
      if (!theirChars.length) return interaction.reply({ content: `<@${target.id}> doesn't own a character matching **"${wantQ}"**.`, flags: 64 });
      requestChar = theirChars[0];
    }

    const now       = Math.floor(Date.now() / 1000);
    const expiresAt = now + 600;

    const trade = stmts.createTrade.run({
      guild_id:          guildId,
      initiator_id:      userId,
      target_id:         target.id,
      initiator_char_id: offerChar.id,
      target_char_id:    requestChar?.id ?? null,
      message_id:        null,
      expires_at:        expiresAt,
    });
    const tradeId = trade.lastInsertRowid;

    const embed = buildTradeEmbed(interaction.user.username, target.username, offerChar, requestChar);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`trade_accept_${tradeId}`).setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('✅'),
      new ButtonBuilder().setCustomId(`trade_decline_${tradeId}`).setLabel('Decline').setStyle(ButtonStyle.Danger).setEmoji('❌')
    );

    const offerType = requestChar ? 'Trade' : 'Gift';

    // Try to DM the target first
    let sentViaDM = false;
    try {
      const dm = await target.createDM();
      const dmMsg = await dm.send({
        content: requestChar
          ? `🔄 **${interaction.user.username}** wants to trade with you in **${interaction.guild?.name}**!`
          : `🎁 **${interaction.user.username}** is gifting you a character in **${interaction.guild?.name}**!`,
        embeds: [embed],
        components: [row],
      });
      stmts.setTradeMessageId.run(dmMsg.id, tradeId);
      sentViaDM = true;
    } catch {}

    if (sentViaDM) {
      return interaction.reply({ content: `📨 ${offerType} offer sent to <@${target.id}> via DM!`, flags: 64 });
    }

    // Fallback: post in channel with ping
    const msg = await interaction.reply({
      content: `<@${target.id}>`,
      embeds: [embed],
      components: [row],
      fetchReply: true,
    });
    stmts.setTradeMessageId.run(msg.id, tradeId);

    setTimeout(async () => {
      try { await msg.edit({ content: '⏰ Trade offer expired.', embeds: [], components: [] }); } catch {}
    }, 600_000);
  },
};
