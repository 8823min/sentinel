import { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } from 'discord.js';
import * as cron from 'node-cron';
import { initializeDatabase } from './database/schema.js';
import { setup } from './commands/setup.js';
import { start } from './commands/start.js';
import { stop } from './commands/stop.js';
import { status } from './commands/status.js';
import { clear } from './commands/clear.js';
import { whitelist } from './commands/whitelist.js';
import { settings } from './commands/settings.js';
import { updateRestrictionStatuses } from './utils/restrictions.js';
import { recordDiscordActivity } from './utils/discordActivity.js';
import { generateDailyReport } from './utils/report.js';
import { getOrCreateUser } from './utils/db.js';
import { updateAllTwitterActivity } from './utils/twitter.js';

export class SentinelBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildVoiceStates,
            ],
        });
        this.client.commands = new Collection();
    }

    async init() {
        console.log('🤖 Botを初期化中...');

        // データベースの初期化
        initializeDatabase();

        // コマンド登録用プレースホルダー
        this.client.commands.set('study', { execute: null });

        this.setupHandlers();

        const token = process.env.DISCORD_TOKEN;
        if (!token) {
            throw new Error('❌ DISCORD_TOKEN が設定されていません。');
        }

        await this.client.login(token);
    }

    setupHandlers() {
        this.client.once('ready', async () => {
            console.log(`✅ ${this.client.user.tag} としてログインしました`);
            console.log(`📊 接続中のサーバー数: ${this.client.guilds.cache.size}`);

            await this.registerCommands();

            // スケジューラーの開始
            this.startSchedulers();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;
            if (interaction.commandName !== 'study') return;

            const subcommand = interaction.options.getSubcommand(false);
            const group = interaction.options.getSubcommandGroup(false);

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
                } else if (group === 'settings') {
                    await settings.execute(interaction);
                } else if (subcommand === 'report_trigger') {
                    await interaction.reply({ content: '📊 日次レポートの強制実行を開始します...', flags: MessageFlags.Ephemeral });
                    // 集計直前に活動データを更新
                    await updateAllTwitterActivity();
                    await generateDailyReport(this.client);
                    await interaction.followUp({ content: '✅ 日次レポートの実行が完了しました。ログを確認してください。', flags: MessageFlags.Ephemeral });
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

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.guild) return;
            try {
                getOrCreateUser(message.author.id);
                recordDiscordActivity(message.author.id);
            } catch (error) {
                console.error('活動記録エラー:', error);
            }
        });

        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            if (newState.member?.user.bot) return;
            if (!oldState.channelId && newState.channelId) {
                try {
                    getOrCreateUser(newState.member.user.id);
                    recordDiscordActivity(newState.member.user.id);
                } catch (error) {
                    console.error('活動記録エラー:', error);
                }
            }
        });
    }

    async registerCommands() {
        try {
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
            const clientId = process.env.DISCORD_CLIENT_ID || this.client.application.id;

            if (!clientId) {
                console.warn('⚠️ CLIENT_IDが取得できませんでした。');
                return;
            }

            const studyCommand = {
                name: 'study',
                description: '勉強管理コマンド',
                options: [
                    {
                        name: 'setup',
                        description: '初期セットアップ',
                        type: 1,
                        options: [{ name: 'channel', description: '掲示板チャンネル', type: 7, required: true }],
                    },
                    {
                        name: 'start',
                        description: '制限を開始',
                        type: 1,
                        options: [
                            {
                                name: 'duration',
                                description: '勉強時間',
                                type: 3,
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
                                ],
                            },
                        ],
                    },
                    {
                        name: 'whitelist',
                        description: 'チャンネル管理',
                        type: 1,
                        options: [
                            { name: 'action', description: 'アクション', type: 3, required: true, choices: [{ name: '追加', value: 'add' }, { name: '削除', value: 'remove' }, { name: '一覧', value: 'list' }] },
                            { name: 'target_channel', description: '対象チャンネル', type: 7, required: false }
                        ]
                    },
                    { name: 'stop', description: '制限を解除', type: 1 },
                    { name: 'status', description: '現在の状態', type: 1 },
                    { name: 'clear', description: 'データを消去', type: 1 },
                    { name: 'report_trigger', description: '【管理者用】日次レポートを強制的に実行します', type: 1 },
                    {
                        name: 'settings',
                        description: '各種設定',
                        type: 2, // Subcommand Group
                        options: [
                            {
                                name: 'twitter',
                                description: 'Twitter(X)のユーザー名を登録',
                                type: 1,
                                options: [{ name: 'username', description: 'Twitter ID (@以降)', type: 3, required: true }]
                            }
                        ]
                    }
                ],
            };

            if (process.env.DISCORD_GUILD_ID) {
                await rest.put(Routes.applicationGuildCommands(clientId, process.env.DISCORD_GUILD_ID), { body: [studyCommand] });
                console.log(`✅ ギルドコマンドを登録しました: ${process.env.DISCORD_GUILD_ID}`);
            } else {
                await rest.put(Routes.applicationCommands(clientId), { body: [studyCommand] });
                console.log('✅ グローバルコマンドを登録しました');
            }
        } catch (error) {
            console.error('コマンド登録エラー:', error);
        }
    }

    startSchedulers() {
        cron.schedule('* * * * *', async () => {
            try {
                await updateRestrictionStatuses(this.client);
            } catch (e) {
                console.error('制限更新エラー:', e);
            }
        });

        cron.schedule('0 0 * * *', async () => {
            try {
                // レポート送信前にTwitterデータを更新
                await updateAllTwitterActivity();
                await generateDailyReport(this.client);
            } catch (e) {
                console.error('レポート生成エラー:', e);
            }
        });
        console.log('✅ スケジューラーを開始しました');
    }

    isReady() {
        return this.client.isReady();
    }

    get status() {
        return {
            uptime: process.uptime(),
            ping: this.client.ws.ping,
            guilds: this.client.guilds.cache.size,
            user: this.client.user?.tag
        };
    }
}
