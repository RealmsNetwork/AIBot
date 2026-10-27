const { SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Chat with the AI assistant")
    .addStringOption(option => option.setName("message").setDescription("What would you like to ask?").setRequired(true).setMaxLength(1800)),
  new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Generate a playful AI roast")
    .addUserOption(option => option.setName("target").setDescription("The friend to roast").setRequired(false))
    .addIntegerOption(option => option.setName("intensity").setDescription("Roast intensity (1-3)").setMinValue(1).setMaxValue(3).setRequired(false)),
  new SlashCommandBuilder().setName("ping").setDescription("Check Discord gateway latency"),
  new SlashCommandBuilder().setName("health").setDescription("Check bot and AI configuration status"),
  new SlashCommandBuilder().setName("clear-chat").setDescription("Clear your private AI conversation context")
];

module.exports = commands.map(command => command.toJSON());
