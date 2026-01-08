import { Scraper } from '@the-convocation/twitter-scraper';
import { getDatabase } from '../config/database.js';
import { getJSTDateString } from './discordActivity.js';

let scraperInstance = null;

/**
 * Twitterスクレイパーのインスタンスを取得
 */
async function getScraper() {
    if (scraperInstance) return scraperInstance;

    const scraper = new Scraper();

    // ログイン情報の取得
    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;
    const email = process.env.TWITTER_EMAIL;
    const twoFactorSecret = process.env.TWITTER_2FA_SECRET;

    if (username && password) {
        try {
            console.log(`[Twitter] アカウント @${username} でログインを試行します...`);
            await scraper.login(username, password, email, twoFactorSecret);
            console.log('[Twitter] ログインに成功しました。');
            scraperInstance = scraper;
        } catch (error) {
            console.error('[Twitter] ログイン失敗:', error.message);
            // 失敗してもインスタンスは返すが、取得できない可能性が高い
            return scraper;
        }
    } else {
        console.warn('[Twitter] Xのログイン情報が設定されていません。取得が制限される可能性があります。');
        return scraper;
    }

    return scraperInstance;
}

/**
 * ユーザーのTwitter活動を記録
 * @param {string} userId - DiscordユーザーID
 * @param {number} tweetCount - ツイート数
 * @param {Date} date - 対象日
 */
export function recordTwitterActivity(userId, tweetCount, date = new Date()) {
    const db = getDatabase();
    const activityDate = getJSTDateString(date);

    db.prepare(`
    INSERT INTO twitter_activity (user_id, activity_date, tweet_count)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, activity_date) DO UPDATE SET
    tweet_count = excluded.tweet_count,
    updated_at = CURRENT_TIMESTAMP
  `).run(userId, activityDate, tweetCount);
}

/**
 * Xのタイムラインから本日のツイート数を取得
 * @param {string} username - Twitterユーザー名
 * @param {Date} [targetDate] - 対象日（省略時は今日）
 * @returns {Promise<number|null>} ツイート数（取得失敗時はnull）
 */
export async function fetchDailyTweetCount(username, targetDate = new Date()) {
    const targetDateStr = getJSTDateString(targetDate);

    try {
        const scraper = await getScraper();
        const query = `from:${username}`;
        let count = 0;

        // 指定ユーザーの最近のツイートを取得（上限20件程度で十分）
        const tweets = scraper.getTweets(query, 50);

        for await (const tweet of tweets) {
            if (!tweet.timeParsed) continue;

            const tweetDate = new Date(tweet.timeParsed);
            const tweetDateStr = getJSTDateString(tweetDate);

            if (tweetDateStr === targetDateStr) {
                count++;
            } else if (tweetDate < targetDate) {
                // 対象日より古いツイートが出てきたら終了
                // (Twitterの検索結果は概ね降順)
                break;
            }
        }

        console.log(`[Twitter] @${username} の ${targetDateStr} の活動数: ${count}`);
        return count;
    } catch (error) {
        console.warn(`[Twitter] @${username} のデータ取得中にエラーが発生しました:`, error.message);
        return null;
    }
}

/**
 * 全ユーザーのTwitter活動を更新
 * @param {Date} [targetDate] - 対象日（省略時は今日）
 */
export async function updateAllTwitterActivity(targetDate = new Date()) {
    const db = getDatabase();
    const users = db.prepare('SELECT user_id, twitter_username FROM users WHERE twitter_username IS NOT NULL').all();

    const targetDateStr = getJSTDateString(targetDate);
    console.log(`[Twitter] ${users.length} 件のアカウント集計を開始します (${targetDateStr})...`);

    for (const user of users) {
        const count = await fetchDailyTweetCount(user.twitter_username, targetDate);
        if (count !== null) {
            recordTwitterActivity(user.user_id, count, targetDate);
        } else {
            console.warn(`[Twitter] @${user.twitter_username} のデータ取得に失敗しました。`);
        }
        // 負荷軽減のため少し待機
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

/**
 * 指定日のTwitter活動データを取得
 * @param {string} userId - DiscordユーザーID
 * @param {Date} date - 日付
 * @returns {Object|null} 活動データ
 */
export function getTwitterActivityByDate(userId, date) {
    const db = getDatabase();
    const dateStr = getJSTDateString(date);

    return db.prepare(`
    SELECT * FROM twitter_activity
    WHERE user_id = ? AND activity_date = ?
  `).get(userId, dateStr);
}
