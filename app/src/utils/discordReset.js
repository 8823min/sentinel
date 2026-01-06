import { removeRestrictionsFromAllChannels } from './roles.js';

/**
 * Discord上のすべての制限を解除
 * すべての「_勉強中」ロールを検索し、メンバーから剥奪してチャンネル権限を削除
 * @param {import('discord.js').Guild} guild - Discordサーバー
 * @returns {Object} 処理結果
 */
export async function resetAllDiscordRestrictions(guild) {
  const results = {
    rolesFound: 0,
    rolesRemoved: 0,
    membersUpdated: 0,
    channelsUpdated: 0,
    errors: [],
  };
  
  try {
    // 「_勉強中」で終わるロールを検索
    const studyRoles = guild.roles.cache.filter(role => role.name.endsWith('_勉強中'));
    results.rolesFound = studyRoles.size;
    
    for (const role of studyRoles.values()) {
      try {
        // このロールを持つすべてのメンバーを取得
        const membersWithRole = role.members;
        
        // メンバーからロールを剥奪
        for (const member of membersWithRole.values()) {
          try {
            await member.roles.remove(role, 'Sentinel: 全データリセット');
            results.membersUpdated++;
          } catch (error) {
            results.errors.push(`メンバー ${member.user.tag} からロール削除失敗: ${error.message}`);
          }
        }
        
        // 全チャンネルからこのロールの権限を削除
        let channelCount = 0;
        for (const channel of guild.channels.cache.values()) {
          if (channel.type !== 0 && channel.type !== 2) continue; // Text or Voice only
          
          try {
            const overwrite = channel.permissionOverwrites.cache.get(role.id);
            if (overwrite) {
              await channel.permissionOverwrites.delete(role, {
                reason: 'Sentinel: 全データリセット',
              });
              channelCount++;
            }
          } catch (error) {
            results.errors.push(`チャンネル ${channel.name} の権限削除失敗: ${error.message}`);
          }
        }
        results.channelsUpdated += channelCount;
        results.rolesRemoved++;
        
      } catch (error) {
        results.errors.push(`ロール ${role.name} の処理失敗: ${error.message}`);
      }
    }
    
  } catch (error) {
    results.errors.push(`全体的なエラー: ${error.message}`);
  }
  
  return results;
}

