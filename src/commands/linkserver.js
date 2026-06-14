import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { stmts } from '../database.js';

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
        return interaction.reply({ content: '❌ Cannot link a server to itself.', flags: 64 });
      }

      // Check not already linked
      const existing = stmts.getGuildLinks.all(guildId, guildId);
      if (existing.some(r => r.other_guild === targetGuild)) {
        return interaction.reply({ content: '❌ Already linked with that server.', flags: 64 });
      }

      const code = randomCode();
      const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24 hours
      stmts.createLinkRequest.run(guildId, interaction.user.id, targetGuild, code, expiresAt);

      return interaction.reply({
        flags: 64,
        content:
          `✅ Link request created!\n\n` +
          `Have an admin in server **${targetGuild}** run:\n` +
          `\`\`\`\n/linkserver confirm code:${code}\n\`\`\`\n` +
          `Code expires in 24 hours. Once confirmed, both servers will share claimed character ownership.`,
      });
    }

    if (sub === 'confirm') {
      const code = interaction.options.getString('code').toUpperCase();
      const request = stmts.getLinkRequest.get(code);

      if (!request) {
        return interaction.reply({ content: '❌ Invalid or expired link code.', flags: 64 });
      }

      if (request.target_guild !== guildId) {
        return interaction.reply({
          content: `❌ This code was created for server \`${request.target_guild}\`, not this server.`,
          flags: 64,
        });
      }

      if (request.initiator_guild === guildId) {
        return interaction.reply({ content: '❌ Cannot confirm your own link request.', flags: 64 });
      }

      // Create bidirectional link
      stmts.createLink.run(request.initiator_guild, guildId);
      stmts.createLink.run(guildId, request.initiator_guild);
      stmts.deleteLinkRequest.run(code);

      return interaction.reply({
        content:
          `✅ Servers linked! This server and **${request.initiator_guild}** now share claimed character ownership.\n` +
          `Characters claimed in either server will appear as claimed in both.`,
      });
    }

    if (sub === 'status') {
      const links = stmts.getGuildLinks.all(guildId, guildId);
      const pending = stmts.getPendingLinksByGuild.all(guildId, guildId);

      let msg = '';

      if (links.length) {
        msg += `**Linked servers:**\n${links.map(r => `• \`${r.other_guild}\``).join('\n')}\n\n`;
      } else {
        msg += '**Linked servers:** None\n\n';
      }

      const outgoing = pending.filter(r => r.initiator_guild === guildId);
      const incoming = pending.filter(r => r.target_guild === guildId);

      if (outgoing.length) {
        msg += `**Pending outgoing requests:**\n${outgoing.map(r => `• Code \`${r.code}\` → \`${r.target_guild}\``).join('\n')}\n\n`;
      }
      if (incoming.length) {
        msg += `**Pending incoming requests:**\n${incoming.map(r => `• Code \`${r.code}\` from \`${r.initiator_guild}\``).join('\n')}\n\n`;
      }

      return interaction.reply({ content: msg.trim() || 'No links or pending requests.', flags: 64 });
    }

    if (sub === 'unlink') {
      const targetGuild = interaction.options.getString('server_id');
      stmts.removeLink.run(guildId, targetGuild, targetGuild, guildId);
      return interaction.reply({ content: `✅ Unlinked from server \`${targetGuild}\`.`, flags: 64 });
    }
  },
};
