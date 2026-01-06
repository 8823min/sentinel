import http from 'http';
import dotenv from 'dotenv';
import { SentinelBot } from './bot.js';

// 環境変数の読み込み
dotenv.config();

const port = process.env.PORT || 8000;
const bot = new SentinelBot();

/**
 * Webサーバーの作成 (エントリポイント)
 */
const server = http.createServer((req, res) => {
    // CORSヘッダー
    res.setHeader('Access-Control-Allow-Origin', '*');

    // ルーティング
    const url = req.url;

    if (url === '/health' || url === '/') {
        const isReady = bot.isReady();
        res.writeHead(isReady ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: isReady ? 'healthy' : 'initializing',
            uptime: process.uptime(),
            bot: bot.status,
            timestamp: new Date().toISOString()
        }, null, 2));
        return;
    }

    if (url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'pong' }));
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
});

// 1. まずWebサーバーを起動 (Koyebなどのプラットフォーム要件を満たすため)
server.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Webサーバーが起動しました: http://0.0.0.0:${port}`);
    console.log(`📡 ヘルスチェック: http://localhost:${port}/health`);

    // 2. サーバーが起動したらBotを始動
    bot.init().then(() => {
        console.log('🚀 Botの起動シーケンスが完了しました');
    }).catch(err => {
        console.error('❌ Botの起動に失敗しました:', err);
        // 致命的なエラーの場合はプロセスを終了させる（プラットフォームが再起動を試みる）
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    });
});

// エラーハンドリング
server.on('error', (err) => {
    console.error('❌ サーバーエラー:', err);
});

// シグナルハンドリング
process.on('SIGINT', () => {
    console.log('Stopping...');
    server.close();
    process.exit(0);
});
