import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { clearAllData } from '../utils/clearData.js';
import { resetAllDiscordRestrictions } from '../utils/discordReset.js';
import { createSuccessEmbed, createWarningEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
  .setName('study')
  .setDescription('勉強管理コマンド')
  .addSubcommand(subcommand =>
    subcommand
      .setName('clear')
      .setDescription('すべての制限・記録・登録を削除（管理者のみ）')
  );

async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'clear') {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // 権限チェック
  const allowedUserId = '1265259424340250625';
  const hasAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  const isAllowedUser = interaction.user.id === allowedUserId;

  if (!hasAdmin && !isAllowedUser) {
    const embed = createWarningEmbed(
      '権限不足',
      'このコマンドは管理者、または許可されたユーザーのみが実行できます。'
    );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // 実行禁止警告
  const embed = createWarningEmbed(
    '使用不可',
    '**セキュリティのため、このコマンドはDiscord上からは実行できません。**\n\nデータの初期化を行う場合は、サーバーのコンソールで以下のコマンドを実行してください：\n`node src/scripts/clear-cli.js`'
  );

  await interaction.editReply({ embeds: [embed] });
}

export const clear = { data, execute };

