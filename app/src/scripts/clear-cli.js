import prompts from 'prompts';
import { Client, GatewayIntentBits } from 'discord.js';
import { clearAllData } from '../utils/clearData.js';
import { resetAllDiscordRestrictions } from '../utils/discordReset.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// .envを読み込む（プロジェクトルートから）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function main() {
    console.log('⚠️  注意: この操作はSentinelデータベースの全データを削除し、Discord上の制限を解除します。');
    console.log('（Botが起動中の場合、一時的に動作が不安定になる可能性があります）');

    const response = await prompts({
        type: 'text',
        name: 'confirmation',
        message: '実行するには "DELETE" と入力してください:',
        validate: value => value === 'DELETE' ? true : '正しく入力されていません'
    });

    if (response.confirmation !== 'DELETE') {
        console.log('操作をキャンセルしました。');
        return;
    }

    console.log('1. データベースのデータを削除しています...');

    try {
        const result = clearAllData();

        console.log('✅ DB削除完了');
        console.log(`- 削除されたユーザー数: ${result.deleted.users}`);
        console.log(`- 削除された制限数: ${result.deleted.restrictions}`);

        console.log('\n2. Discord上の制限を解除しています...');
        console.log('Discordに接続中...');

        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
            ],
        });

        await client.login(process.env.DISCORD_TOKEN);
        console.log(`Logged in as ${client.user.tag}`);

        // 参加している全ギルドで処理を実行
        for (const guild of client.guilds.cache.values()) {
            console.log(`ギルド "${guild.name}" を処理中...`);

            // メンバーキャッシュを更新（重要）
            await guild.members.fetch();
            await guild.roles.fetch();

            const discordResult = await resetAllDiscordRestrictions(guild);

            console.log(`  - 検出されたロール: ${discordResult.rolesFound}`);
            console.log(`  - 削除されたロール: ${discordResult.rolesRemoved}`);
            console.log(`  - メンバー更新数: ${discordResult.membersUpdated}`);
            console.log(`  - チャンネル更新数: ${discordResult.channelsUpdated}`);

            if (discordResult.errors.length > 0) {
                console.warn('  ⚠️ エラー:', discordResult.errors);
            }
        }

        console.log('\n✅ すべての処理が完了しました。');

        // クライアントを終了
        client.destroy();

    } catch (error) {
        console.error('❌ エラーが発生しました:', error);
        process.exit(1);
    }
}

main().catch(console.error);
