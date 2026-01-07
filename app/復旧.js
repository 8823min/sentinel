import { Client, GatewayIntentBits } from "discord.js";
import "dotenv/config";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const GUILD_ID = "989882412660047942";
const USER_ID = "1265259424340250625";
const ROLE_ID = "996031904979636365";

client.once("ready", async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(USER_ID);
    await member.roles.add(ROLE_ID);

    console.log("ロールを付与しました");
  } catch (err) {
    console.error("ロール付与に失敗:", err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
