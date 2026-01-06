import { getDatabase } from '../config/database.js';

/**
 * すべてのデータを削除
 * 制限、記録、警告、ユーザー登録をすべて削除
 */
export function clearAllData() {
  const db = getDatabase();
  
  try {
    // トランザクション開始
    db.exec('BEGIN TRANSACTION');
    
    // 削除前にカウントを取得
    const warningsCount = db.prepare('SELECT COUNT(*) as count FROM warnings').get().count;
    const twitterCount = db.prepare('SELECT COUNT(*) as count FROM twitter_activity').get().count;
    const discordCount = db.prepare('SELECT COUNT(*) as count FROM discord_activity').get().count;
    const restrictionsCount = db.prepare('SELECT COUNT(*) as count FROM restrictions').get().count;
    const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    
    // 警告履歴を削除
    db.prepare('DELETE FROM warnings').run();
    
    // Twitter活動記録を削除
    db.prepare('DELETE FROM twitter_activity').run();
    
    // Discord活動記録を削除
    db.prepare('DELETE FROM discord_activity').run();
    
    // 制限を削除
    db.prepare('DELETE FROM restrictions').run();
    
    // ユーザー登録を削除
    db.prepare('DELETE FROM users').run();
    
    // トランザクションコミット
    db.exec('COMMIT');
    
    return {
      success: true,
      deleted: {
        warnings: warningsCount,
        twitterActivity: twitterCount,
        discordActivity: discordCount,
        restrictions: restrictionsCount,
        users: usersCount,
      },
    };
  } catch (error) {
    // エラー時はロールバック
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * 特定ユーザーのデータを削除
 * @param {string} userId - DiscordユーザーID
 */
export function clearUserData(userId) {
  const db = getDatabase();
  
  try {
    db.exec('BEGIN TRANSACTION');
    
    // 警告履歴を削除
    db.prepare('DELETE FROM warnings WHERE user_id = ?').run(userId);
    
    // Twitter活動記録を削除
    db.prepare('DELETE FROM twitter_activity WHERE user_id = ?').run(userId);
    
    // Discord活動記録を削除
    db.prepare('DELETE FROM discord_activity WHERE user_id = ?').run(userId);
    
    // 制限を削除
    db.prepare('DELETE FROM restrictions WHERE user_id = ?').run(userId);
    
    // ユーザー登録を削除
    db.prepare('DELETE FROM users WHERE user_id = ?').run(userId);
    
    db.exec('COMMIT');
    
    return { success: true };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

