import { AttachmentBuilder, ButtonBuilder, Colors, ComponentType, EmbedBuilder, InteractionButtonComponentData } from "discord.js";
import { Component } from "../classes/component";
import { ComponentContext } from "../classes/componentContext";
import { ImageGenerationInput } from "aipg_horde";
import Centra from "centra";

export default class extends Component {
    constructor() {
        super({
            name: "animate",
            staff_only: false,
            regex: /animate_.+/
        })
    }

    override async run(ctx: ComponentContext<ComponentType.Button>): Promise<any> {
        // Extract the user ID and prompt from the custom_id
        const customIdParts = ctx.interaction.customId.split('_');
        const userId = customIdParts[1];
        const prompt = customIdParts.slice(2).join('_');
        
        if(userId !== ctx.interaction.user.id) 
            return ctx.error({error: "Only the creator of this image can animate it"});
        
        // Defer the update so we can work with it
        try {
            await ctx.interaction.deferReply();
        } catch (error) {
            // Handle expired interactions gracefully
            if (error && typeof error === 'object' && 'code' in error && (error as any).code === 10062) {
                console.log('[WARNING] Interaction expired - user should try again');
                return;
            }
            throw error;
        }
        
        try {
            // Get the source image from the message
            const message = await ctx.interaction.message.fetch();
            let sourceImageUrl: string | null = null;
            
            // Check for image in embeds
            if (message.embeds?.length > 0) {
                for (const embed of message.embeds) {
                    if (embed.image?.url) {
                        sourceImageUrl = embed.image.url;
                        break;
                    }
                }
            }
            
            // Check for image in attachments
            if (!sourceImageUrl && message.attachments?.size > 0) {
                const firstAttachment = message.attachments.first();
                if (firstAttachment && firstAttachment.contentType?.startsWith('image/')) {
                    sourceImageUrl = firstAttachment.url;
                }
            }
            
            if (!sourceImageUrl) {
                return ctx.error({error: "No source image found to animate"});
            }
            
            console.log('[DEBUG] Animating image from URL:', sourceImageUrl);
            
            // Download the source image
            const img_data_res = await Centra(sourceImageUrl, "GET").send();
            const img_data = img_data_res.body;
            
            // Use wan2-5b-video style for animation
            const defaultStyle = "wan2-5b-video";
            await ctx.client.loadHordeStyles();
            const style = ctx.client.getHordeStyle(defaultStyle);
            
            if (!style?.prompt?.length) {
                return ctx.error({error: "Unable to find animation style. Please try again later."});
            }
            
            // Apply the style to the prompt
            let formattedPrompt = style.prompt.slice().replace("{p}", prompt || "Animate this image");
            formattedPrompt = formattedPrompt.replace("{np}", "");
            
            // Get the token
            const token = await ctx.client.getUserToken(ctx.interaction.user.id, ctx.database) || 
                          process.env['GLOBAL_GRID_API_KEY'] || 
                          ctx.client.config.default_token || 
                          "0000000000";
            
            // Create the generation request parameters for video
            const generationParams = {
                sampler_name: style.sampler_name as any,
                height: style.height,
                width: style.width,
                n: 1,
                tiling: false,
                cfg_scale: style.cfg_scale,
                steps: style.steps,
                video_length: (style as any).video_length || 121,
                fps: (style as any).fps || 24
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
                source_image: img_data.toString("base64"),
                source_processing: "img2img" as const,
                r2: true,
                shared: false
            };
            
            // Start the generation
            const generation_start = await ctx.ai_horde_manager.postAsyncImageGenerate(generation_data, {token})
            .catch((e) => {
                if(ctx.client.config.advanced?.dev) console.error(e);
                return e.rawError as any;
            });
            
            if (!generation_start || !generation_start.id) {
                return ctx.error({error: `Unable to start animation: ${generation_start.message || "Unknown error"}${Object.entries(generation_start.errors || {}).map(([k, v]) => `\n${k}: ${v}`).join("")}`});
            }
            
            // Get initial status
            const start_status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start.id);
            const start_horde_data = await ctx.ai_horde_manager.getPerformance();
            
            const chickenSequence = ['🥚', '🐣', '🐤', '🐔', '🔥', '🍗', '😋'] as const;
            let currentFrameIdx = -1;

            const getNextEmojiInSequence = () => {
                currentFrameIdx = (currentFrameIdx + 1) % chickenSequence.length;
                return chickenSequence[currentFrameIdx];
            };
            
            const initialEmoji = getNextEmojiInSequence();
            
            // Create the styled embed
            const showInitialEta = currentFrameIdx >= 1;
            const embed = new EmbedBuilder({
                color: Colors.Blue,
                title: "🎬 Animation started",
                description: `**Position:** \`${start_status?.queue_position}\`/\`${start_horde_data.queued_requests}\`
**Credits Consumed:** \`${start_status?.kudos}\`
**Workers:** \`${start_horde_data.worker_count}\`

\`${start_status?.waiting ?? 0}\`/\`1\` **Videos waiting**
\`${start_status?.processing ?? 0}\`/\`1\` **Videos processing**
\`${start_status?.finished ?? 0}\`/\`1\` **Videos finished**

${initialEmoji}

${!start_status?.is_possible ? "**Request can not be fulfilled with current amount of workers...**\n" : ""}
${showInitialEta ? `**ETA:** <t:${Math.floor(Date.now()/1000)+(start_status?.wait_time ?? 0)}:R>` : "**Searching for workers...**"}`
            });
            
            const login_embed = new EmbedBuilder({
                color: Colors.Red,
                title: "You are not logged in",
                description: `This will make your requests appear anonymous.\nThis can result in low generation speed due to low priority.\nLog in now with ${await ctx.client.getSlashCommandTag("login")}\n\nDon't know what the token is?\nCreate an ai horde account here: https://api.aipowergrid.io/register`
            });
            
            // Add cancel button
            const btn = new ButtonBuilder({
                label: "Cancel",
                custom_id: `cancel_gen_${generation_start.id}`,
                style: 4
            });
            
            const components = [{type: 1, components: [btn.toJSON()]}];
            
            // Send the initial reply
            await ctx.interaction.editReply({
                content: "",
                embeds: token === (ctx.client.config.default_token ?? "0000000000") ? [embed.toJSON(), login_embed.toJSON()] : [embed.toJSON()],
                components
            });
            
            let error_timeout = Date.now()*2;
            let prev_left = 1;
            let done = false;
            
            // Set up interval to update status
            const interval = setInterval(async () => {
                if (done) return;
                
                try {
                    const status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start.id);
                    const horde_data = await ctx.ai_horde_manager.getPerformance();
                    
                    if (!status || status.faulted) {
                        if (!done) {
                            await ctx.interaction.editReply({
                                content: "Animation has been cancelled", 
                                embeds: [],
                                components: []
                            }).catch(console.error);
                        }
                        clearInterval(interval);
                        return;
                    }
                    
                    if (status?.wait_time === 0 && prev_left !== 0) error_timeout = Date.now();
                    prev_left = status?.wait_time ?? 1;
                    
                    if (error_timeout < (Date.now()-1000*60*5) || start_status?.faulted) {
                        if (!done) {
                            await ctx.ai_horde_manager.deleteImageGenerationRequest(generation_start.id);
                            await ctx.interaction.editReply({
                                components: [],
                                content: "Animation cancelled due to errors",
                                embeds: []
                            }).catch(console.error);
                        }
                        clearInterval(interval);
                        return;
                    }
                    
                    // Update the embed with new status
                    const showEta = currentFrameIdx >= 1;
                    const updatedEmbed = new EmbedBuilder({
                        color: Colors.Blue,
                        title: "🎬 Animation in progress",
                        description: `**Position:** \`${status.queue_position}\`/\`${horde_data.queued_requests}\`
**Credits Consumed:** \`${status?.kudos}\`
**Workers:** \`${horde_data.worker_count}\`

\`${status.waiting ?? 0}\`/\`1\` **Videos waiting**
\`${status.processing ?? 0}\`/\`1\` **Videos processing**
\`${status.finished ?? 0}\`/\`1\` **Videos finished**

${getNextEmojiInSequence()}

${!status.is_possible ? "**Request can not be fulfilled with current amount of workers...**\n" : ""}
${showEta ? `**ETA:** <t:${Math.floor(Date.now()/1000)+(status?.wait_time ?? 0)}:R>` : "**Searching for workers...**"}`
                    });
                    
                    let embeds = token === (ctx.client.config.default_token ?? "0000000000") ? [updatedEmbed.toJSON(), login_embed.toJSON()] : [updatedEmbed.toJSON()];
                    
                    if ((status?.wait_time ?? 0) > 60 * 2) {
                        embeds.push(new EmbedBuilder({
                            color: Colors.Yellow,
                            title: "The Grid is currently experiencing high load",
                            description: "You can contribute your GPUs processing power to the project.\nRead more: https://aipowergrid.io/"
                        }).toJSON());
                    }
                    
                    // If generation is complete
                    if (status.done || (status.finished && status.finished > 0)) {
                        done = true;
                        clearInterval(interval);
                        
                        // Get the generation results
                        const videos = await ctx.ai_horde_manager.getImageGenerationStatus(generation_start.id);
                        
                        const video_map_r = videos.generations?.map(async g => {
                            if (!g.img || g.censored) return {attachment: null, generation: g};
                            
                            try {
                                let buffer: Buffer;
                                
                                if (typeof g.img === 'string' && g.img.startsWith('data:')) {
                                    const parts = g.img.split(',');
                                    if (parts.length > 1) {
                                        buffer = Buffer.from(parts[1] as string, 'base64');
                                    } else {
                                        return {attachment: null, generation: g};
                                    }
                                } else if (typeof g.img === 'string') {
                                    try {
                                        new URL(g.img);
                                        const req = await Centra(g.img, "GET").send();
                                        buffer = req.body;
                                    } catch (urlError) {
                                        // Try as base64
                                        buffer = Buffer.from(g.img, 'base64');
                                    }
                                } else {
                                    return {attachment: null, generation: g};
                                }
                                
                                // Determine file extension
                                const fileExtension = buffer.toString('hex', 0, 4).includes('6674797069736f6d') || buffer.toString('hex', 0, 4).includes('667479706d703432') ? '.mp4' : '.webp';
                                const attachment = new AttachmentBuilder(buffer, {name: `${g.id}${fileExtension}`});
                                return {attachment, generation: g};
                            } catch (error) {
                                console.error('[ERROR] Failed to process video:', error);
                                return {attachment: null, generation: g};
                            }
                        }) || [];
                        
                        const video_map = await Promise.all(video_map_r);
                        const files = video_map.filter(i => i.attachment).map(i => i.attachment) as AttachmentBuilder[];
                        
                        const delete_btn: InteractionButtonComponentData = {
                            label: "Delete",
                            customId: `delete_${ctx.interaction.user.id}`,
                            style: 4,
                            type: 2,
                            emoji: { name: "🗑️" }
                        };
                        
                        const resultComponents = [{type: 1, components: [delete_btn]}];
                        const resultEmbeds = [
                            new EmbedBuilder({
                                title: "🎬 Animation Finished",
                                description: `**Prompt** ${prompt}\n**Style** \`${style?.name ?? defaultStyle}\`\n📏\`${generationParams.width}x${generationParams.height}\` | 🔄\`${generationParams.steps} steps\` | ⚖️\`CFG ${generationParams.cfg_scale}\` | 🎲\`${generationParams.sampler_name}\` | 🎞️\`${generationParams.video_length} frames @ ${generationParams.fps}fps\`\n**Credits Consumed** \`${videos.kudos}\`${video_map.length === 0 ? "\nCensored videos are not displayed" : ""}${video_map.length === 1 && video_map[0]?.generation?.worker_name ? `\n**Generated by** ${video_map[0].generation.worker_name}\n(\`${video_map[0].generation.worker_id ?? "unknown"}\`)` : ""}`,
                                color: Colors.Green,
                                footer: {text: `Generation ID ${generation_start.id}`}
                            })
                        ];
                        
                        await ctx.interaction.editReply({
                            content: null, 
                            components: resultComponents, 
                            embeds: resultEmbeds, 
                            files
                        }).catch(console.error);
                    } else {
                        // Update with current status
                        await ctx.interaction.editReply({
                            content: "",
                            embeds,
                            components
                        }).catch(console.error);
                    }
                } catch (error) {
                    if (error && typeof error === 'object' && 'code' in error) {
                        const discordError = error as any;
                        if (discordError.code === 10008) {
                            console.log('[WARNING] Cannot edit message - it may have been deleted');
                            clearInterval(interval);
                            return;
                        }
                    }
                    console.error('[ERROR] Error in status update loop:', error);
                }
            }, 1000 * (ctx.client.config?.generate?.update_generation_status_interval_seconds || 5));
            
        } catch (error) {
            console.error("Error animating image:", error);
            return ctx.interaction.editReply("An error occurred while animating the image. Please try again later.").catch(console.error);
        }
    }
}

