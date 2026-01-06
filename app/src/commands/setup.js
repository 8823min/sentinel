import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getOrCreateUser, updateUserBoardChannel } from '../utils/db.js';
import { getOrCreatePersonalRole } from '../utils/roles.js';
import { createSuccessEmbed, createInfoEmbed } from '../utils/embed.js';

export const data = new SlashCommandBuilder()
  .setName('study')
  .setDescription('勉強管理コマンド')
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup')
      .setDescription('初期セットアップ（学習用チャンネル設定）')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('制限中も閲覧したいチャンネルを選択')
          .setRequired(true)
      )
  );

async function execute(interaction) {
  if (interaction.options.getSubcommand() !== 'setup') {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;
  const guild = interaction.guild;

  try {
    // ユーザーをデータベースに登録
    getOrCreateUser(userId);

    // ユーザーを取得
    const member = await guild.members.fetch(userId);

    // 個人ロールを作成
    const personalRole = await getOrCreatePersonalRole(guild, member.user);

    // 個人掲示板チャンネルを取得（必須）
    const selectedChannel = interaction.options.getChannel('channel');
    if (!selectedChannel) {
      throw new Error('チャンネルが選択されていません');
    }

    const boardChannel = guild.channels.cache.get(selectedChannel.id);
    if (!boardChannel) {
      throw new Error('選択されたチャンネルが見つかりません');
    }

    // チャンネルがテキストチャンネルか確認
    if (boardChannel.type !== 0) {
      throw new Error('テキストチャンネルを選択してください');
    }

    // DBに保存
    updateUserBoardChannel(userId, boardChannel.id);

    const embed = createSuccessEmbed(
      'セットアップ完了',
      '学習用チャンネルの設定が完了しました。',
      [
        { name: '個人ロール', value: `<@&${personalRole.id}>`, inline: true },
        { name: '学習用チャンネル', value: `<#${boardChannel.id}>`, inline: true },
      ]
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('セットアップエラー:', error);

    let errorMessage = 'セットアップ中にエラーが発生しました。';

    if (error.code === 50013 || error.message.includes('権限')) {
      errorMessage = error.message || 'Botに必要な権限がありません。\n\n必要な権限:\n- ロールの管理\n- チャンネルの管理\n\nまた、Botのロールを@everyoneより上に配置してください。';
    } else if (error.message) {
      errorMessage = error.message;
    }

    const embed = createInfoEmbed(
      'エラー',
      errorMessage
    );

    await interaction.editReply({ embeds: [embed] });
  }
}

export const setup = { data, execute };

