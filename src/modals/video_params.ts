import { Colors, EmbedBuilder, ButtonBuilder } from "discord.js";
import { Modal } from "../classes/modal";
import { ModalContext } from "../classes/modalContext";
import { ImageGenerationInput } from "aipg_horde";

export default class extends Modal {
    constructor() {
        super({
            name: "video_params",
            staff_only: false,
            regex: /video_params_.+/
        });
    }

    override async run(ctx: ModalContext): Promise<any> {
        // Extract prompt from custom_id
        const customId = ctx.interaction.customId;
        const prompt = customId.substring(13); // Remove "video_params_"
        
        await ctx.interaction.deferReply();
        
        try {
            // Get values from modal inputs
            const model = ctx.interaction.fields.getTextInputValue('model') || 'wan2-5b-video';
            const videoLength = parseInt(ctx.interaction.fields.getTextInputValue('video_length')) || 81;
            const fps = parseInt(ctx.interaction.fields.getTextInputValue('fps')) || 24;
            const resolution = ctx.interaction.fields.getTextInputValue('resolution') || '1280x704';
            const advanced = ctx.interaction.fields.getTextInputValue('advanced') || '20,5,k_euler';
            
            // Parse resolution
            const [width, height] = resolution.split('x').map(n => parseInt(n.trim()));
            if (!width || !height || width < 64 || height < 64 || width > 3072 || height > 3072) {
                return ctx.error({error: "Invalid resolution. Use format like '1280x704' with values between 64-3072."});
            }
            
            // Parse advanced parameters
            const [steps, cfg_scale, sampler_name] = advanced.split(',').map(s => s.trim());
            
            // Get the style or create custom parameters
            let style = ctx.client.getHordeStyle(model);
            if (!style) {
                return ctx.error({error: `Unknown video model: ${model}. Use one of: wan2-5b-video, wan2.2-t2v-a14b, wan2-14b-video-quality`});
            }
            
            // Apply custom formatting to prompt
            let formattedPrompt = style.prompt.replace("{p}", prompt);
            formattedPrompt = formattedPrompt.replace("{np}", "");
            
            // Get user token
            const token = await ctx.client.getUserToken(ctx.interaction.user.id, ctx.database) || 
                          process.env['GLOBAL_GRID_API_KEY'] || 
                          ctx.client.config.default_token || 
                          "0000000000";
            
            // Create custom generation parameters
            const generationParams = {
                sampler_name: (sampler_name || style.sampler_name) as any,
                height: height,
                width: width,
                n: 1,
                tiling: false,
                cfg_scale: parseFloat(cfg_scale || style.cfg_scale?.toString() || '5'),
                steps: parseInt(steps || style.steps?.toString() || '20'),
                video_length: videoLength,
                fps: fps
            };
            
            const generation_data: ImageGenerationInput = {
                prompt: formattedPrompt,
                params: generationParams,
                replacement_filter: ctx.client.config.generate?.replacement_filter,
                nsfw: ctx.client.config.generate?.user_restrictions?.allow_nsfw,
                censor_nsfw: ctx.client.config.generate?.censor_nsfw,
                trusted_workers: ctx.client.config.generate?.trusted_workers,
                workers: ctx.client.config.generate?.workers,
                models: style.model ? [style.model] : undefined,
                r2: true,
                shared: false
            };
            
            // Debug logging
            console.log(`[DEBUG] Custom video generation - Model: ${style.model}, Params:`, {
                width: generationParams.width,
                height: generationParams.height,
                video_length: generationParams.video_length,
                fps: generationParams.fps,
                steps: generationParams.steps,
                cfg_scale: generationParams.cfg_scale,
                sampler: generationParams.sampler_name
            });
            
            // Start generation
            const generation_start = await ctx.ai_horde_manager.postAsyncImageGenerate(generation_data, {token})
                .catch((e) => {
                    return e.rawError;
                });
            
            if (!generation_start || !generation_start.id) {
                return ctx.error({error: `Unable to start generation: ${generation_start.message || "Unknown error"}`});
            }
            
            // Show initial status
            const start_status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start.id);
            
            const embed = new EmbedBuilder({
                color: Colors.Blue,
                title: "🎬 Custom Video Generation Started",
                description: `**Prompt:** ${prompt}
**Model:** \`${style.model}\`
**Resolution:** \`${width}x${height}\`
**Video Length:** \`${videoLength} frames\`
**FPS:** \`${fps}\`
**Steps:** \`${generationParams.steps}\`
**CFG Scale:** \`${generationParams.cfg_scale}\`
**Sampler:** \`${generationParams.sampler_name}\`

**Position:** \`${start_status?.queue_position || '?'}\`
**Credits Consumed:** \`${start_status?.kudos || 0}\`

\`1/1\` **Videos waiting**
\`0/1\` **Videos processing**
\`0/1\` **Videos finished**

🥚

**ETA:** <t:${Math.floor(Date.now()/1000)+(start_status?.wait_time ?? 0)}:R>`
            });
            
            const cancelBtn = new ButtonBuilder({
                label: "Cancel",
                custom_id: `cancel_gen_${generation_start.id}`,
                style: 4
            });
            
            await ctx.interaction.editReply({
                embeds: [embed],
                components: [{type: 1, components: [cancelBtn.toJSON()]}]
            });
            
            // Note: The actual monitoring would be handled by existing generation monitoring logic
            // This creates the initial response; the quickgenerate monitoring system would take over
            
        } catch (error) {
            console.error("Error in custom video generation:", error);
            return ctx.error({error: "An error occurred while starting custom video generation."});
        }
    }
}
