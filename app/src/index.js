import { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } from 'discord.js';
import dotenv from 'dotenv';
import * as cron from 'node-cron';
import { initializeDatabase } from './database/schema.js';
import { setup } from './commands/setup.js';
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { status } from './commands/status.js';

import { clear } from './commands/clear.js';
import { whitelist } from './commands/whitelist.js';
import { updateRestrictionStatuses } from './utils/restrictions.js';
import { recordDiscordActivity } from './utils/discordActivity.js';
import { generateDailyReport } from './utils/report.js';
import { getOrCreateUser } from './utils/db.js';

// 環境変数の読み込み
dotenv.config();

// データベースの初期化
initializeDatabase();

// Discord Botクライアントの作成
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// コマンドコレクション
client.commands = new Collection();

// コマンドを登録（studyコマンドとして登録）
client.commands.set('study', { execute: null }); // サブコマンドで処理するため

// Bot起動時の処理
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} としてログインしました`);
  console.log(`📊 接続中のサーバー数: ${client.guilds.cache.size}`);

  // スラッシュコマンドを登録
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    // CLIENT_IDを取得（環境変数またはクライアントから）
    const clientId = process.env.DISCORD_CLIENT_ID || client.application.id;

    if (!clientId) {
      console.warn('⚠️ CLIENT_IDが取得できませんでした。コマンド登録をスキップします。');
      return;
    }

    // 既存のコマンドを削除（グローバルとギルドの両方）
    try {
      // グローバルコマンドを削除
      try {
        const globalCommands = await rest.get(
          Routes.applicationCommands(clientId)
        );

        for (const command of globalCommands) {
          await rest.delete(
            Routes.applicationCommand(clientId, command.id)
          );
          console.log(`🗑️ グローバルコマンドを削除: ${command.name} (ID: ${command.id})`);
        }

        if (globalCommands.length > 0) {
          console.log(`✅ ${globalCommands.length}個のグローバルコマンドを削除しました`);
        }
      } catch (globalError) {
        console.warn('⚠️ グローバルコマンドの削除中にエラー:', globalError.message);
      }

      // 全ギルドのコマンドを削除
      for (const guild of client.guilds.cache.values()) {
        try {
          const guildCommands = await rest.get(
            Routes.applicationGuildCommands(clientId, guild.id)
          );

          for (const command of guildCommands) {
            await rest.delete(
              Routes.applicationGuildCommand(clientId, guild.id, command.id)
            );
            console.log(`🗑️ ギルドコマンドを削除: ${command.name} (Guild: ${guild.name}, ID: ${command.id})`);
          }

          if (guildCommands.length > 0) {
            console.log(`✅ ${guildCommands.length}個のギルドコマンドを削除しました (Guild: ${guild.name})`);
          }
        } catch (guildError) {
          console.warn(`⚠️ ギルドコマンドの削除中にエラー (Guild: ${guild.name}):`, guildError.message);
        }
      }
    } catch (deleteError) {
      console.warn('⚠️ 既存コマンドの削除中にエラーが発生しました（無視して続行）:', deleteError.message);
    }

    // サブコマンドを統合して1つのコマンドとして登録
    const studyCommand = {
      name: 'study',
      description: '勉強管理コマンド',
      options: [
        {
          name: 'setup',
          description: '初期セットアップ（ロール・掲示板生成）',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'channel',
              description: '個人掲示板チャンネルを選択',
              type: 7, // CHANNEL
              required: true,
            },
          ],
        },
        {
          name: 'start',
          description: '制限を開始',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'duration',
              description: '勉強時間を選択',
              type: 3, // STRING
              required: true,
              choices: [
                { name: '1分(テスト用)', value: '60' },
                { name: '30分', value: '1800' },
                { name: '1時間', value: '3600' },
                { name: '2時間', value: '7200' },
                { name: '12時間', value: '43200' },
                { name: '1日', value: '86400' },
                { name: '2日', value: '172800' },
                { name: '3日', value: '259200' },
                { name: '1週間', value: '604800' },
                { name: '1か月', value: '2592000' },
                { name: '半年', value: '15768000' },
                { name: '1年', value: '31536000' },
              ],
            },
          ],
        },
        {
          name: 'whitelist',
          description: '制限中も閲覧可能なチャンネルを管理（管理者のみ）',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'action',
              description: 'アクション',
              type: 3, // STRING
              required: true,
              choices: [
                { name: '追加', value: 'add' },
                { name: '削除', value: 'remove' },
                { name: '一覧', value: 'list' }
              ]
            },
            {
              name: 'target_channel',
              description: '対象チャンネル（追加・削除時）',
              type: 7, // CHANNEL
              required: false
            }
          ]
        },
        {
          name: 'stop',
          description: '制限を解除',
          type: 1, // SUB_COMMAND
        },
        {
          name: 'status',
          description: '現在の制限状態を表示',
          type: 1, // SUB_COMMAND
        },
        {
          name: 'clear',
          description: 'すべての制限・記録・登録を削除（管理者のみ）',
          type: 1, // SUB_COMMAND
        },
      ],
    };

    const commandsData = [studyCommand];

    if (process.env.DISCORD_GUILD_ID) {
      // ギルドコマンドとして登録（開発用、即座に反映）
      await rest.put(
        Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID),
        { body: commandsData }
      );
      console.log(`✅ ギルドコマンドを登録しました（Guild ID: ${process.env.DISCORD_GUILD_ID}）`);
    } else {
      // グローバルコマンドとして登録（反映に時間がかかる）
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandsData }
      );
      console.log('✅ グローバルコマンドを登録しました（反映まで最大1時間かかる場合があります）');
    }
  } catch (error) {
    console.error('コマンド登録エラー:', error);
    console.error('エラー詳細:', error.message);
  }

  // 制限状態の自動更新（1分ごと）
  cron.schedule('* * * * *', async () => {
    try {
      const result = await updateRestrictionStatuses(client);
      if (result.scheduledToActive > 0 || result.activeToExpired > 0) {
        console.log(`制限状態を更新: scheduled→active: ${result.scheduledToActive}, active→expired: ${result.activeToExpired}`);
      }
    } catch (error) {
      console.error('制限状態更新エラー:', error);
    }
  });

  console.log('✅ 制限状態自動更新スケジューラーを開始しました（1分ごと）');

  // 日次レポート送信（毎日0:00）
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('📊 日次レポート生成を開始します...');
      await generateDailyReport(client);
    } catch (error) {
      console.error('日次レポート生成エラー:', error);
    }
  });
  console.log('✅ 日次レポートスケジューラーを開始しました（毎日0:00）');
});

// インタラクション（スラッシュコマンド）の処理
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== 'study') {
    console.error(`不明なコマンド: ${interaction.commandName}`);
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const command = client.commands.get('study');

  if (!command) {
    console.error('studyコマンドが見つかりません');
    return;
  }

  // 各サブコマンドのexecute関数を呼び出し
  try {
    if (subcommand === 'setup') {
      await setup.execute(interaction);
    } else if (subcommand === 'start') {
      await start.execute(interaction);
    } else if (subcommand === 'stop') {
      await stop.execute(interaction);
    } else if (subcommand === 'status') {
      await status.execute(interaction);
    } else if (subcommand === 'clear') {
      await clear.execute(interaction);
    } else if (subcommand === 'whitelist') {
      await whitelist.execute(interaction);
    }
  } catch (error) {
    console.error('コマンド実行エラー:', error);

    const errorMessage = { content: 'コマンドの実行中にエラーが発生しました。', flags: MessageFlags.Ephemeral };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    } catch (e) {
      console.error('エラーメッセージ送信失敗:', e);
    }
  }
});

// Discord活動監視（メッセージ送信）
client.on('messageCreate', async (message) => {
  // Bot自身のメッセージは無視
  if (message.author.bot) return;

  // DMは無視
  if (!message.guild) return;

  try {
    // ユーザーを登録
    getOrCreateUser(message.author.id);

    // 活動を記録（1日1回まで）
    const recorded = recordDiscordActivity(message.author.id);
    if (recorded) {
      console.log(`Discord活動を記録: ${message.author.tag} (メッセージ送信)`);
    }
  } catch (error) {
    console.error('Discord活動記録エラー:', error);
  }
});

// Discord活動監視（VC参加）
client.on('voiceStateUpdate', async (oldState, newState) => {
  // Bot自身は無視
  if (newState.member?.user.bot) return;

  // VCに参加した場合のみ記録（退出は記録しない）
  if (!oldState.channelId && newState.channelId) {
    try {
      // ユーザーを登録
      getOrCreateUser(newState.member.user.id);

      // 活動を記録（1日1回まで）
      const recorded = recordDiscordActivity(newState.member.user.id);
      if (recorded) {
        console.log(`Discord活動を記録: ${newState.member.user.tag} (VC参加)`);
      }
    } catch (error) {
      console.error('Discord活動記録エラー:', error);
    }
  }
});

// エラーハンドリング
client.on('error', (error) => {
  console.error('Discordクライアントエラー:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('未処理のPromise拒否:', error);
});

// Botログイン
const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('❌ DISCORD_TOKEN が設定されていません。.env ファイルを確認してください。');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('ログインエラー:', error);
  process.exit(1);
});

