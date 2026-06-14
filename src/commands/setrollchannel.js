import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { stmts } from '../database.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setrollchannel')
    .setDescription('Restrict /roll to a specific channel (admins only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Set the roll channel.')
      .addChannelOption(opt => opt
        .setName('channel')
        .setDescription('Channel to restrict rolls to (defaults to current channel).')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false)
      )
    )
    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Remove the roll channel restriction.')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      stmts.setRollChannel.run(guildId, channel.id);
      return interaction.reply({ content: `✅ Rolls are now restricted to <#${channel.id}>.`, flags: 64 });
    }

    if (sub === 'clear') {
      stmts.setRollChannel.run(guildId, null);
      return interaction.reply({ content: '✅ Roll channel restriction removed — rolls allowed anywhere.', flags: 64 });
    }
  },
};
