require("dotenv").config();

const path = require("node:path");
const { ShardingManager } = require("discord.js");

if (!process.env.DISCORD_TOKEN) {
  console.error("[manager] DISCORD_TOKEN is missing.");
  process.exit(1);
}

const requestedShards = process.env.SHARD_COUNT ? Number(process.env.SHARD_COUNT) : "auto";
if (requestedShards !== "auto" && (!Number.isInteger(requestedShards) || requestedShards < 1)) {
  console.error("[manager] SHARD_COUNT must be a positive integer or unset for automatic sharding.");
  process.exit(1);
}

const manager = new ShardingManager(path.join(__dirname, "index.js"), {
  token: process.env.DISCORD_TOKEN,
  totalShards: requestedShards,
  respawn: true,
  mode: "process"
});

manager.on("shardCreate", shard => {
  console.log(`[manager] Launched shard ${shard.id}`);
  shard.on("death", () => console.warn(`[manager] Shard ${shard.id} exited`));
  shard.on("error", error => console.error(`[manager] Shard ${shard.id} error:`, error.message));
});

manager.spawn({ amount: requestedShards })
  .then(shards => console.log(`[manager] Spawned ${shards.size} shard(s)`))
  .catch(error => {
    console.error("[manager] Failed to spawn shards:", error.message);
    process.exit(1);
  });

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[manager] Received ${signal}; stopping all shards`);
  for (const shard of manager.shards.values()) {
    shard.kill().catch(error => console.warn(`[manager] Could not stop shard ${shard.id}:`, error.message));
  }
  setTimeout(() => process.exit(0), 1500).unref();
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
