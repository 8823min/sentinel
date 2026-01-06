import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getRestriction } from '../utils/db.js';
import { createInfoEmbed, createSuccessEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
  .setName('study')
  .setDescription('勉強管理コマンド')
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('現在の制限状態を表示')
  );

async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'status') {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;

  try {
    const restriction = getRestriction(userId);

    if (!restriction) {
      const embed = createInfoEmbed(
        '制限状態',
        '現在、制限は設定されていません。'
      );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const statusText = {
      inactive: '制限なし',
      scheduled: '開始待ち',
      active: '制限中',
      expired: '終了済',
    }[restriction.status] || restriction.status;

    const fields = [];

    if (restriction.start_datetime) {
      fields.push({
        name: '開始日時',
        value: formatDateTime(new Date(restriction.start_datetime)),
        inline: true,
      });
    }

    if (restriction.end_datetime) {
      fields.push({
        name: '終了日時',
        value: formatDateTime(new Date(restriction.end_datetime)),
        inline: true,
      });
    }

    fields.push({
      name: '状態',
      value: statusText,
      inline: true,
    });

    const color = restriction.status === 'active'
      ? 0x2ecc71 // 緑
      : restriction.status === 'scheduled'
        ? 0x3498db // 青
        : 0x95a5a6; // グレー

    const embed = createInfoEmbed(
      '制限状態',
      '現在の学習制限の状態です。',
      fields
    );
    embed.setColor(color);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('状態取得エラー:', error);

    const embed = createInfoEmbed(
      'エラー',
      '状態の取得中にエラーが発生しました。'
    );

    await interaction.editReply({ embeds: [embed] });
  }
}

export const status = { data, execute };

/**
 * 日時をフォーマット
 * @param {Date} date - 日時
 * @returns {string} フォーマットされた文字列
 */
function formatDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

