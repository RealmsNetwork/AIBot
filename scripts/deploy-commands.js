require("dotenv").config();

const { REST, Routes } = require("discord.js");
const commands = require("../src/commands");

async function main() {
  const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
    throw new Error("Set DISCORD_TOKEN and DISCORD_CLIENT_ID in .env before deploying commands.");
  }
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  const route = DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
    : Routes.applicationCommands(DISCORD_CLIENT_ID);
  await rest.put(route, { body: commands });
  console.log(`Registered ${commands.length} slash commands ${DISCORD_GUILD_ID ? `to guild ${DISCORD_GUILD_ID}` : "globally"}.`);
}

main().catch(error => {
  console.error("Command deployment failed:", error.message);
  process.exitCode = 1;
});
