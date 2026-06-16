import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { stmts, getSettings } from '../database.js';
import { buildSettingsEmbed } from '../embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('View or change WikiRoll server settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s
      .setName('view')
      .setDescription('View current settings')
    )
    .addSubcommand(s => s
      .setName('cooldown')
      .setDescription('Change the roll cooldown duration')
      .addIntegerOption(o =>
        o.setName('minutes')
          .setDescription('Minutes between rolls (default 60)')
          .setMinValue(1)
          .setMaxValue(1440)
          .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('claimwindow')
      .setDescription('Change how long characters stay claimable after a roll')
      .addIntegerOption(o =>
        o.setName('minutes')
          .setDescription('Minutes characters stay claimable (default 5)')
          .setMinValue(1)
          .setMaxValue(60)
          .setRequired(true)
      )
    )
    .addSubcommand(s => s
      .setName('notifychannel')
      .setDescription('Set a channel for WikiRoll announcements')
      .addChannelOption(o =>
        o.setName('channel')
          .setDescription('Announcement channel (leave empty to clear)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
    )
    .addSubcommand(s => s
      .setName('timezone')
      .setDescription('Set the server timezone for daily resets (default: America/Los_Angeles)')
      .addStringOption(o =>
        o.setName('tz')
          .setDescription('IANA timezone e.g. America/New_York, America/Chicago, Europe/London')
          .setRequired(true)
          .addChoices(
            { name: 'Pacific (PST/PDT)', value: 'America/Los_Angeles' },
            { name: 'Mountain (MST/MDT)', value: 'America/Denver' },
            { name: 'Central (CST/CDT)', value: 'America/Chicago' },
            { name: 'Eastern (EST/EDT)', value: 'America/New_York' },
            { name: 'UTC', value: 'UTC' },
            { name: 'London (GMT/BST)', value: 'Europe/London' },
            { name: 'Central Europe (CET/CEST)', value: 'Europe/Berlin' },
          )
      )
    ),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'view') {
      const settings = getSettings(guildId);
      return interaction.reply({ embeds: [buildSettingsEmbed(settings)], ephemeral: true });
    }

    if (sub === 'cooldown') {
      const mins = interaction.options.getInteger('minutes');
      stmts.upsertSettings.run({
        guild_id: guildId,
        roll_cooldown_minutes: mins,
        claim_window_minutes: null,
        notify_channel: null,
        timezone: null,
      });
      return interaction.reply({ content: `✅ Roll cooldown set to **${mins} minutes**.`, ephemeral: true });
    }

    if (sub === 'claimwindow') {
      const mins = interaction.options.getInteger('minutes');
      stmts.upsertSettings.run({
        guild_id: guildId,
        roll_cooldown_minutes: null,
        claim_window_minutes: mins,
        notify_channel: null,
        timezone: null,
      });
      return interaction.reply({ content: `✅ Claim window set to **${mins} minutes**.`, ephemeral: true });
    }

    if (sub === 'notifychannel') {
      const ch = interaction.options.getChannel('channel');
      stmts.upsertSettings.run({
        guild_id: guildId,
        roll_cooldown_minutes: null,
        claim_window_minutes: null,
        notify_channel: ch?.id ?? null,
        timezone: null,
      });
      return interaction.reply({
        content: ch ? `✅ Notify channel set to <#${ch.id}>.` : '✅ Notify channel cleared.',
        ephemeral: true,
      });
    }

    if (sub === 'timezone') {
      const tz = interaction.options.getString('tz');
      stmts.upsertSettings.run({
        guild_id: guildId,
        roll_cooldown_minutes: null,
        claim_window_minutes: null,
        notify_channel: null,
        timezone: tz,
      });
      return interaction.reply({ content: `✅ Timezone set to **${tz}**. Daily resets will now follow this timezone.`, ephemeral: true });
    }
  },
};
