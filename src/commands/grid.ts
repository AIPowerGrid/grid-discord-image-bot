import { Colors, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { Command } from "../classes/command";
import { CommandContext } from "../classes/commandContext";

const command_data = new SlashCommandBuilder()
    .setName("grid")
    .setDMPermission(false)
    .setDescription(`Shows information on AIPG Grid`)

export default class extends Command {
    constructor() {
        super({
            name: "grid",
            command_data: command_data.toJSON(),
            staff_only: false,
        })
    }

    override async run(ctx: CommandContext): Promise<any> {
        //const news = await ctx.ai_horde_manager.getNews()
        //const article = news[0]
        const embed = new EmbedBuilder({
            color: Colors.Blue,
            title: "AI GRID",
            //TODO: Add more info in the future
            description: `Proof of Useful Work (POUW) is a paradigm shift in the world of blockchain and cryptocurrency, designed to address the sustainability concerns of traditional Proof of Work (PoW) systems.`
        })
        return ctx.interaction.reply({
            embeds: [embed],
            ephemeral: true
        })
    }
}
