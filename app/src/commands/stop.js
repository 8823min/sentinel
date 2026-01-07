import { SlashCommandBuilder } from 'discord.js';
import { stopRestriction, getActiveRestriction } from '../utils/db.js';
import { getPersonalRoleName, removeRestrictionsFromAllChannels } from '../utils/roles.js';
import { createSuccessEmbed, createInfoEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
  .setName('study')
  .setDescription('勉強管理コマンド')
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('制限を解除')
  );

async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'stop') {
    return;
  }

  await interaction.deferReply();

  const userId = interaction.user.id;
  const guild = interaction.guild;

  try {
    // アクティブな制限をチェック
    const restriction = getActiveRestriction(userId);
    const member = await guild.members.fetch(userId);
    const roleName = getPersonalRoleName(member.user);
    const personalRole = guild.roles.cache.find(r => r.name === roleName);

    if (!restriction && !member.roles.cache.has(personalRole?.id)) {
      const embed = createInfoEmbed(
        '制限なし',
        '現在、アクティブな制限はありません。'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // 制限を解除（データベースが存在する場合のみ）
    if (restriction) {
      stopRestriction(userId);
    }

    if (personalRole && member.roles.cache.has(personalRole.id)) {
      // 全チャンネルから制限を解除
      await removeRestrictionsFromAllChannels(guild, personalRole);

      // ロール復元
      if (restriction && restriction.original_roles) {
        try {
          const originalRoleIds = JSON.parse(restriction.original_roles);
          const botMember = guild.members.me;
          const botHighestRole = botMember.roles.highest;

          // 操作不能なロール（Botより上位、Managed、@everyone）は維持
          const unmanageableRoles = member.roles.cache.filter(role =>
            role.position >= botHighestRole.position || role.managed || role.id === guild.id
          ).map(r => r.id);

          // 復元ロールと操作不能ロールを結合し、個人ロールを除外
          const finalRoles = [...new Set([...unmanageableRoles, ...originalRoleIds])].filter(id => id !== personalRole.id);

          await member.roles.set(finalRoles, 'Sentinel: 制限解除（ロール復元）');
        } catch (e) {
          console.error('ロール復元エラー:', e);
          await member.roles.remove(personalRole, 'Sentinel: 制限解除（復元失敗のため削除のみ）');
        }
      } else {
        // DBに記録がない場合、または復元情報がない場合は単純にロールを剥奪
        await member.roles.remove(personalRole, 'Sentinel: 制限解除 (DB記録なし/復元情報なし)');
      }
    }

    const embed = createSuccessEmbed(
      '制限解除',
      '学習制限を解除しました。'
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('制限解除エラー:', error);

    const embed = createInfoEmbed(
      'エラー',
      '制限の解除中にエラーが発生しました。'
    );

    await interaction.editReply({ embeds: [embed] });
  }
}

export const stop = { data, execute };

