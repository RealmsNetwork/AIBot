require("dotenv").config();

const path = require("node:path");
const { ShardingManager } = require("discord.js");

if (!process.env.DISCORD_TOKEN) {
  console.error("[manager] DISCORD_TOKEN is missing.");
  process.exit(1);
}

const manager = new ShardingManager(path.join(__dirname, "index.js"), {
  token: process.env.DISCORD_TOKEN,
  totalShards: process.env.SHARD_COUNT ? Number(process.env.SHARD_COUNT) : "auto",
  respawn: true,
  mode: "process"
});

manager.on("shardCreate", shard => {
  console.log(`[manager] Launched shard ${shard.id}`);
  shard.on("death", () => console.warn(`[manager] Shard ${shard.id} exited`));
  shard.on("error", error => console.error(`[manager] Shard ${shard.id} error:`, error.message));
});

manager.spawn({ amount: process.env.SHARD_COUNT ? Number(process.env.SHARD_COUNT) : "auto" })
  .then(shards => console.log(`[manager] Spawned ${shards.size} shard(s)`))
  .catch(error => {
    console.error("[manager] Failed to spawn shards:", error.message);
    process.exit(1);
  });

process.once("SIGINT", () => manager.respawnAll({ delay: 0, timeout: 1000 }).catch(() => process.exit(0)));
process.once("SIGTERM", () => {
  for (const shard of manager.shards.values()) shard.kill().catch(() => {});
  process.exit(0);
});
