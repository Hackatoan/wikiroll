import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { stmts } from '../database.js';
import { t } from '../i18n.js';

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default {
  data: new SlashCommandBuilder()
    .setName('linkserver')
    .setDescription('Link two servers to share claimed character ownership.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('start')
      .setDescription('Initiate a link request with another server.')
      .addStringOption(opt => opt
        .setName('server_id')
        .setDescription('The ID of the server you want to link with.')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('confirm')
      .setDescription('Confirm an incoming link request using its code.')
      .addStringOption(opt => opt
        .setName('code')
        .setDescription('The 6-character link code from the other server.')
        .setRequired(true)
      )
    )
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Show current server links and pending requests.')
    )
    .addSubcommand(sub => sub
      .setName('unlink')
      .setDescription('Unlink from another server.')
      .addStringOption(opt => opt
        .setName('server_id')
        .setDescription('The ID of the server to unlink from.')
        .setRequired(true)
      )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'start') {
      const targetGuild = interaction.options.getString('server_id');

      if (targetGuild === guildId) {
        return interaction.reply({ content: t(guildId, 'link.selfLink'), flags: 64 });
      }

      // Check not already linked
      const existing = stmts.getGuildLinks.all(guildId, guildId);
      if (existing.some(r => r.other_guild === targetGuild)) {
        return interaction.reply({ content: t(guildId, 'link.already'), flags: 64 });
      }

      const code = randomCode();
      const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours
      stmts.createLinkRequest.run(guildId, interaction.user.id, targetGuild, code, expiresAt);

      return interaction.reply({
        flags: 64,
        content:
          t(guildId, 'link.created', { target: targetGuild, code }),
      });
    }

    if (sub === 'confirm') {
      const code = interaction.options.getString('code').toUpperCase();
      const request = stmts.getLinkRequest.get(code);

      if (!request) {
        return interaction.reply({ content: t(guildId, 'link.invalidCode'), flags: 64 });
      }

      if (request.target_guild !== guildId) {
        return interaction.reply({
          content: t(guildId, 'link.wrongServer', { server: request.target_guild }),
          flags: 64,
        });
      }

      if (request.initiator_guild === guildId) {
        return interaction.reply({ content: t(guildId, 'link.ownRequest'), flags: 64 });
      }

      // Create bidirectional link
      stmts.createLink.run(request.initiator_guild, guildId);
      stmts.createLink.run(guildId, request.initiator_guild);
      stmts.deleteLinkRequest.run(code);

      return interaction.reply({
        content:
          t(guildId, 'link.confirmed', { server: request.initiator_guild }),
      });
    }

    if (sub === 'status') {
      const links = stmts.getGuildLinks.all(guildId, guildId);
      const pending = stmts.getPendingLinksByGuild.all(guildId, guildId);

      let msg = '';

      if (links.length) {
        msg += t(guildId, 'link.linkedHeader', { list: links.map(r => `• \`${r.other_guild}\``).join('\n') });
      } else {
        msg += t(guildId, 'link.linkedNone');
      }

      const outgoing = pending.filter(r => r.initiator_guild === guildId);
      const incoming = pending.filter(r => r.target_guild === guildId);

      if (outgoing.length) {
        msg += t(guildId, 'link.outgoing', { list: outgoing.map(r => `• \`${r.code}\` → \`${r.target_guild}\``).join('\n') });
      }
      if (incoming.length) {
        msg += t(guildId, 'link.incoming', { list: incoming.map(r => `• \`${r.code}\` — \`${r.initiator_guild}\``).join('\n') });
      }

      return interaction.reply({ content: msg.trim() || t(guildId, 'link.noneAll'), flags: 64 });
    }

    if (sub === 'unlink') {
      const targetGuild = interaction.options.getString('server_id');
      stmts.removeLink.run(guildId, targetGuild, targetGuild, guildId);
      return interaction.reply({ content: t(guildId, 'link.unlinked', { server: targetGuild }), flags: 64 });
    }
  },
};
