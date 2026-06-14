import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { stmts } from '../database.js';
import { buildTradeEmbed } from '../embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Offer a trade with another server member')
    .addUserOption(o => o.setName('user').setDescription('Who to trade with').setRequired(true))
    .addStringOption(o => o.setName('offer').setDescription('Your character to offer').setRequired(true))
    .addStringOption(o => o.setName('want').setDescription('Their character you want').setRequired(true)),

  async execute(interaction) {
    const target    = interaction.options.getUser('user');
    const offerQ    = interaction.options.getString('offer');
    const wantQ     = interaction.options.getString('want');
    const guildId   = interaction.guildId;
    const userId    = interaction.user.id;

    if (target.id === userId)   return interaction.reply({ content: 'You cannot trade with yourself.', ephemeral: true });
    if (target.bot)             return interaction.reply({ content: 'You cannot trade with a bot.', ephemeral: true });

    const myChars   = stmts.searchChars.all(guildId, `%${offerQ}%`).filter(c => c.owner_id === userId);
    if (!myChars.length) return interaction.reply({ content: `You don't own a character matching **"${offerQ}"**.`, ephemeral: true });

    const theirChars = stmts.searchChars.all(guildId, `%${wantQ}%`).filter(c => c.owner_id === target.id);
    if (!theirChars.length) return interaction.reply({ content: `<@${target.id}> doesn't own a character matching **"${wantQ}"**.`, ephemeral: true });

    const offerChar   = myChars[0];
    const requestChar = theirChars[0];

    const now       = Math.floor(Date.now() / 1000);
    const expiresAt = now + 600;

    const trade = stmts.createTrade.run({
      guild_id:          guildId,
      initiator_id:      userId,
      target_id:         target.id,
      initiator_char_id: offerChar.id,
      target_char_id:    requestChar.id,
      message_id:        null,
      expires_at:        expiresAt,
    });
    const tradeId = trade.lastInsertRowid;

    const embed = buildTradeEmbed(
      interaction.user.username,
      target.username,
      offerChar,
      requestChar
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`trade_accept_${tradeId}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`trade_decline_${tradeId}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    );

    const msg = await interaction.reply({ content: `<@${target.id}>`, embeds: [embed], components: [row], fetchReply: true });
    stmts.setTradeMessageId.run(msg.id, tradeId);

    setTimeout(async () => {
      try {
        await msg.edit({ content: '⏰ Trade offer expired.', embeds: [], components: [] });
      } catch {}
    }, 600_000);
  },
};
