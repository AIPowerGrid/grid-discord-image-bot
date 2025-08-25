import { ButtonInteraction, ComponentType, ModalSubmitInteraction } from "discord.js";
import { Component } from "../classes/component";
import { ComponentContext } from "../classes/componentContext";

export default class extends Component {
    constructor() {
        super({
            name: "edit_prompt_modal",
            regex: /^regenerate_.+_modal$/
        })
    }

    override async run(ctx: ComponentContext<ModalSubmitInteraction>): Promise<any> {
        // Extract the user ID from the custom_id
        const parts = ctx.interaction.customId.split("_");
        const userId = parts[1];
        
        if(userId !== ctx.interaction.user.id) 
            return ctx.error({error: "Only the creator of this image can edit it"});

        // Get the new prompt from the modal
        const newPrompt = ctx.interaction.fields.getTextInputValue('prompt');
        
        // Create a regenerate button with the new prompt
        const customId = `regenerate_${userId}_${newPrompt.substring(0, Math.max(0, 90 - userId.length - 11))}`;
        
        // Trigger the regenerate component
        const components = ctx.client.components as unknown as Map<string, Component>;
        const regenerateComponent = Array.from(components.values()).find((c: Component) => c.name === "regenerate");
        if (!regenerateComponent) {
            return ctx.error({error: "Unable to regenerate. Please try again later."});
        }

        // Create a new context with the regenerate customId
        const newCtx = new ComponentContext({
            ...ctx,
            interaction: {
                ...ctx.interaction,
                customId,
                componentType: ComponentType.Button
            } as unknown as ButtonInteraction
        });

        // Run the regenerate component
        await (regenerateComponent as Component).run(newCtx as ComponentContext<ComponentType.Button>);
    }
} 