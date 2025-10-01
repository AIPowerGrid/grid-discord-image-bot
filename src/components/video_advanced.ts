import { ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { Component } from "../classes/component";
import { ComponentContext } from "../classes/componentContext";

export default class extends Component {
    constructor() {
        super({
            name: "video_advanced",
            staff_only: false,
            regex: /video_advanced_.+/
        })
    }

    override async run(ctx: ComponentContext<ComponentType.Button>): Promise<any> {
        // Extract the prompt from the custom_id
        const customId = ctx.interaction.customId;
        const prompt = customId.substring(14); // Remove "video_advanced_"
        
        // Get channel config for default values
        const channelCfg = ctx.client.config.channel_overrides?.[ctx.interaction.channelId!];
        const defaultStyle = channelCfg?.default_style ?? "wan2-5b-video";
        
        // Create modal with video parameter inputs
        const modal = new ModalBuilder()
            .setCustomId(`video_params_${prompt}`)
            .setTitle("Advanced Video Generation Settings");

        // Video Model selection
        const modelInput = new TextInputBuilder()
            .setCustomId('model')
            .setLabel('Video Model')
            .setStyle(TextInputStyle.Short)
            .setValue(defaultStyle)
            .setPlaceholder('wan2-5b-video, wan2.2-t2v-a14b, wan2-14b-video-quality')
            .setRequired(true);

        // Video Length
        const lengthInput = new TextInputBuilder()
            .setCustomId('video_length')
            .setLabel('Video Length (frames)')
            .setStyle(TextInputStyle.Short)
            .setValue('81')
            .setPlaceholder('49 (short), 81 (standard), 121 (long)')
            .setRequired(true);

        // FPS
        const fpsInput = new TextInputBuilder()
            .setCustomId('fps')
            .setLabel('Frames Per Second (FPS)')
            .setStyle(TextInputStyle.Short)
            .setValue('24')
            .setPlaceholder('16, 24, 30')
            .setRequired(true);

        // Resolution
        const resolutionInput = new TextInputBuilder()
            .setCustomId('resolution')
            .setLabel('Resolution (width x height)')
            .setStyle(TextInputStyle.Short)
            .setValue('1280x704')
            .setPlaceholder('640x640, 1280x704, 1024x1024, 1920x1080')
            .setRequired(true);

        // Advanced Parameters
        const advancedInput = new TextInputBuilder()
            .setCustomId('advanced')
            .setLabel('Advanced (steps,cfg_scale,sampler)')
            .setStyle(TextInputStyle.Short)
            .setValue('20,5,k_euler')
            .setPlaceholder('steps,cfg_scale,sampler_name')
            .setRequired(false);

        // Add inputs to action rows
        const rows = [
            new ActionRowBuilder<TextInputBuilder>().addComponents(modelInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(lengthInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(fpsInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(resolutionInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(advancedInput)
        ];

        modal.addComponents(...rows);

        // Show the modal
        await ctx.interaction.showModal(modal);
    }
}
