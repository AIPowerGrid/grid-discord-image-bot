import { ActionRowBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Component } from "../classes/component";
import { ComponentContext } from "../classes/componentContext";

export default class extends Component {
    constructor() {
        super({
            name: "edit_prompt",
            regex: /^edit_prompt_.+$/
        })
    }

    override async run(ctx: ComponentContext<ComponentType.Button>): Promise<any> {
        // Extract the user ID and current prompt from the custom_id
        const parts = ctx.interaction.customId.split("_");
        const userId = parts[1];
        const currentPrompt = parts.slice(2).join("_");
        
        if(userId !== ctx.interaction.user.id) 
            return ctx.error({error: "Only the creator of this image can edit it"});

        // Create the modal
        const modal = new ModalBuilder()
            .setCustomId(`regenerate_${userId}_modal`)
            .setTitle('Edit Prompt');

        // Add the prompt input field
        const promptInput = new TextInputBuilder()
            .setCustomId('prompt')
            .setLabel('Enter your new prompt')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(currentPrompt)
            .setRequired(true);

        // Create an action row and add the text input
        const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(promptInput);

        // Add the components to the modal
        modal.addComponents(actionRow);

        // Show the modal
        await ctx.interaction.showModal(modal);
    }
} 