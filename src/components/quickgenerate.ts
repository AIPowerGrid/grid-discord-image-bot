import { AttachmentBuilder, ButtonBuilder, Colors, ComponentType, EmbedBuilder, InteractionButtonComponentData } from "discord.js";
import { Component } from "../classes/component";
import { ComponentContext } from "../classes/componentContext";
import { GenerationStable } from "../types/generation";

export default class extends Component {
    constructor() {
        super({
            name: "quickgenerate",
            regex: /^quickgenerate_.+$/
        })
    }

    override async run(ctx: ComponentContext<ComponentType.Button>): Promise<any> {
        // Get prompt from the custom_id
        const customId = ctx.interaction.customId;
        
        // Check if the custom_id includes style information (format: quickgenerate_style:stylename_prompt)
        // Get channel-specific default style or fall back to global default
        const channelCfg = ctx.client.config.channel_overrides?.[ctx.interaction.channelId!];
        const isVideoChannel = channelCfg?.content_type === "video";
        let style_raw = channelCfg?.default_style ?? ctx.client.config.generate?.default?.style ?? "flux-portrait";
        let prompt = "";
        
        if (customId.includes("style:")) {
            // Extract style and prompt from custom_id with style information
            const parts = customId.substring(13).split("_"); // Remove "quickgenerate_"
            const styleInfo = parts[0]; // This should be "style:stylename"
            if (styleInfo && styleInfo.startsWith("style:")) {
                style_raw = styleInfo.substring(6); // Remove "style:" to get stylename
            }
            prompt = parts.slice(1).join("_"); // Rest is the prompt
        } else {
            // Original format without style
            prompt = customId.substring(13); // "quickgenerate_".length
        }
        
        if (!prompt) return ctx.error({ error: "No prompt found in the button." });

        await ctx.interaction.deferReply();

        try {
            // Use the style from the custom_id or the default
            const style = ctx.client.getHordeStyle(style_raw);
            
            if (!style?.prompt?.length) {
                return ctx.error({error: "Unable to find style. Please try again later."});
            }
            
            // Apply the style to the prompt
            let formattedPrompt = style.prompt.slice().replace("{p}", prompt);
            formattedPrompt = formattedPrompt.replace("{np}", "");
            
            // Get the token
            const token = process.env['GLOBAL_GRID_API_KEY'] || ctx.client.config.default_token || "0000000000";
            
            // Prepare generation parameters
            const denoise = (ctx.client.config.generate?.default?.denoise ?? 50) / 100;
            const amount = 1;
            
            // Create the generation request
            const generationParams = {
                sampler_name: style.sampler_name as any,
                height: style.height,
                width: style.width,
                n: amount,
                tiling: false,
                denoising_strength: denoise,
                cfg_scale: style.cfg_scale,
                loras: style.loras,
                steps: style.steps,
                tis: style.tis,
                hires_fix: style.hires_fix
            };
            
            const generation_data = {
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
            
            // Start the generation
            const generation_start = await ctx.ai_horde_manager.postAsyncImageGenerate(generation_data, {token})
            .catch((e) => {
                return e.rawError;
            });
            
            if (!generation_start || !generation_start.id) {
                return ctx.error({error: `Unable to start generation: ${generation_start.message || "Unknown error"}${Object.entries(generation_start.errors || {}).map(([k, v]) => `\n${k}: ${v}`).join("")}`});
            }
            
            // Get initial status
            const start_status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start.id);
            const start_horde_data = await ctx.ai_horde_manager.getPerformance();
            
            const chickenSequence = ['🥚', '🐣', '🐤', '🐔', '🔥', '🍗', '😋'] as const;
            let currentFrameIdx = -1; // Start before the first frame

            const getNextEmojiInSequence = () => {
                currentFrameIdx = (currentFrameIdx + 1) % chickenSequence.length;
                return chickenSequence[currentFrameIdx];
            };
            
            const initialEmoji = getNextEmojiInSequence(); // Gets the first emoji
            
            // Create the same styled embed as the generate command
            const contentType = isVideoChannel ? "video" : "image";
            const contentTypePlural = isVideoChannel ? "videos" : "images";
            
            const embed = new EmbedBuilder({
                color: Colors.Blue,
                title: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} generation started`,
                description: `**Position:** \`${start_status?.queue_position}\`/\`${start_horde_data.queued_requests}\`
**Credits Consumed:** \`${start_status?.kudos}\`
**Workers:** \`${start_horde_data.worker_count}\`

\`${start_status?.waiting ?? 0}\`/\`${amount}\` **${contentTypePlural.charAt(0).toUpperCase() + contentTypePlural.slice(1)} waiting**
\`${start_status?.processing ?? 0}\`/\`${amount}\` **${contentTypePlural.charAt(0).toUpperCase() + contentTypePlural.slice(1)} processing**
\`${start_status?.finished ?? 0}\`/\`${amount}\` **${contentTypePlural.charAt(0).toUpperCase() + contentTypePlural.slice(1)} finished**

${initialEmoji}

${!start_status?.is_possible ? "**Request can not be fulfilled with current amount of workers...**\n" : ""}
**ETA:** <t:${Math.floor(Date.now()/1000)+(start_status?.wait_time ?? 0)}:R>`
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
            
            const delete_btn: InteractionButtonComponentData = {
                label: "Delete",
                customId: `delete_${ctx.interaction.user.id}`,
                style: 4,
                type: 2,
                emoji: { name: "🗑️" }
            };
            
            const regenerate_btn: InteractionButtonComponentData = {
                label: "Regenerate",
                customId: `regenerate_${ctx.interaction.user.id}_${prompt.substring(0, Math.max(0, 90 - ctx.interaction.user.id.length - 11))}`,
                style: 1,
                type: 2,
                emoji: { name: "🎲" }
            };
            
            const components = [{type: 1, components: [btn.toJSON()]}];
            
            // Send the initial reply without capturing the message
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
                
                // Check generation status
                const status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start.id);
                const horde_data = await ctx.ai_horde_manager.getPerformance();
                
                // Debug: Log the status for video generations
                if (isVideoChannel) {
                    console.log('[DEBUG] Video generation status:', {
                        done: status?.done,
                        faulted: status?.faulted,
                        waiting: status?.waiting,
                        processing: status?.processing,
                        finished: status?.finished
                    });
                }
                
                if (!status || status.faulted) {
                    if (!done) {
                        await ctx.interaction.editReply({
                            content: "Image generation has been cancelled", 
                            embeds: [],
                            components: []
                        });
                    }
                    clearInterval(interval);
                    return;
                }
                
                if (status?.wait_time === 0 && prev_left !== 0) error_timeout = Date.now();
                prev_left = status?.wait_time ?? 1;
                
                if (error_timeout < (Date.now()-1000*60*2) || start_status?.faulted) {
                    if (!done) {
                        await ctx.ai_horde_manager.deleteImageGenerationRequest(generation_start.id);
                        await ctx.interaction.editReply({
                            components: [],
                            content: "Generation cancelled due to errors",
                            embeds: []
                        });
                    }
                    clearInterval(interval);
                    return;
                }
                
                // Update the embed with new status
                const contentType = isVideoChannel ? "video" : "image";
                const contentTypePlural = isVideoChannel ? "videos" : "images";
                
                const updatedEmbed = new EmbedBuilder({
                    color: Colors.Blue,
                    title: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} generation started`,
                    description: `**Position:** \`${status.queue_position}\`/\`${horde_data.queued_requests}\`
**Credits Consumed:** \`${status?.kudos}\`
**Workers:** \`${horde_data.worker_count}\`

\`${status.waiting ?? 0}\`/\`${amount}\` **${contentTypePlural.charAt(0).toUpperCase() + contentTypePlural.slice(1)} waiting**
\`${status.processing ?? 0}\`/\`${amount}\` **${contentTypePlural.charAt(0).toUpperCase() + contentTypePlural.slice(1)} processing**
\`${status.finished ?? 0}\`/\`${amount}\` **${contentTypePlural.charAt(0).toUpperCase() + contentTypePlural.slice(1)} finished**

${getNextEmojiInSequence()}

${!status.is_possible ? "**Request can not be fulfilled with current amount of workers...**\n" : ""}
**ETA:** <t:${Math.floor(Date.now()/1000)+(status?.wait_time ?? 0)}:R>`
                });
                
                let embeds = token === (ctx.client.config.default_token ?? "0000000000") ? [updatedEmbed.toJSON(), login_embed.toJSON()] : [updatedEmbed.toJSON()];
                
                if ((status?.wait_time ?? 0) > 60 * 2) {
                    embeds.push(new EmbedBuilder({
                        color: Colors.Yellow,
                        title: "The Grid is currently experiencing high load",
                        description: "You can contribute your GPUs processing power to the project.\nRead more: https://aipowergrid.io/"
                    }).toJSON());
                }
                
                // Check if generation is complete
                let generationComplete = status.done;
                
                // Fallback: For video generations, check if result is actually ready
                if (!generationComplete && isVideoChannel && ((status?.finished && status.finished > 0) || status?.processing === 0)) {
                    console.log('[DEBUG] Video generation: checking if result is ready despite status.done being false');
                    try {
                        const testImages = await ctx.ai_horde_manager.getImageGenerationStatus(generation_start.id);
                        if (testImages.generations && testImages.generations.length > 0) {
                            console.log('[DEBUG] Found video result, proceeding with completion');
                            generationComplete = true;
                        }
                    } catch (e) {
                        console.log('[DEBUG] Fallback check failed:', e);
                    }
                }
                
                // If generation is complete
                if (generationComplete) {
                    done = true;
                    clearInterval(interval);
                    
                    // Get the generation results
                    const images = await ctx.ai_horde_manager.getImageGenerationStatus(generation_start.id);
                    
                    if (ctx.client.config.advanced?.result_structure_v2_enabled ?? true) {
                        // Debug: Log the entire response structure
                        console.log('[DEBUG] Full images response:', JSON.stringify(images, null, 2));
                        console.log('[DEBUG] Generations array:', images.generations);
                        
                        if (images.generations && images.generations.length > 0) {
                            console.log('[DEBUG] First generation object:', JSON.stringify(images.generations[0], null, 2));
                            if (images.generations[0]) {
                                console.log('[DEBUG] First generation keys:', Object.keys(images.generations[0]));
                            }
                        }
                        
                        // Cast generations array to our extended type
                        const generations = images.generations as GenerationStable[] | undefined;
                        
                        // Check if this is a video response
                        const isVideoResponse = generations?.some(g => 
                            g.media_type === 'video' || g.form === 'video' || g.type === 'video'
                        ) || false;
                        
                        // Fallback: Check if any generation has a video filename
                        const hasVideoFilename = generations?.some(g => 
                            g.filename && g.filename.toLowerCase().includes('.mp4')
                        ) || false;
                        
                        console.log('[DEBUG] isVideoResponse:', isVideoResponse);
                        console.log('[DEBUG] hasVideoFilename:', hasVideoFilename);
                        console.log('[DEBUG] Final video detection:', isVideoResponse || hasVideoFilename);
                        
                        const image_map_r = generations?.map(async g => {
                            // Check if media URL exists
                            if (!g.img || g.censored) return {attachment: null, generation: g};
                            
                            // Determine if this is a video based on generation data or response type
                            const isVideo = g.media_type === 'video' || g.form === 'video' || g.type === 'video' || isVideoResponse || hasVideoFilename;
                            const fileExtension = isVideo ? '.mp4' : '.webp';
                            const mediaType = isVideo ? 'video' : 'image';
                            
                            console.log(`Processing ${mediaType} data for generation ${g.id}`);
                            
                            const req = await fetch(g.img);
                            const blob = await req.blob();
                            const buffer = Buffer.from(await blob.arrayBuffer());
                            const attachment = new AttachmentBuilder(buffer, {name: `${g.id}${fileExtension}`});
                            return {attachment, generation: g};
                        }) || [];
                        
                        const image_map = await Promise.all(image_map_r);
                        const files = image_map.filter(i => i.attachment).map(i => i.attachment) as AttachmentBuilder[];
                        
                        const contentType = (isVideoResponse || hasVideoFilename) ? "video" : "image";
                        const contentTypePlural = (isVideoResponse || hasVideoFilename) ? "videos" : "images";
                        const resultComponents = [{type: 1, components: [regenerate_btn, delete_btn]}];
                        const resultEmbeds = [
                            new EmbedBuilder({
                                title: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} Generation Finished`,
                                description: `**Prompt** ${prompt}\n**Style** \`${style?.name ?? style_raw}\`\n**Credits Consumed** \`${images.kudos}\`${image_map.length !== amount ? `\nCensored ${contentTypePlural} are not displayed` : ""}${image_map.length === 1 && image_map[0]?.generation?.worker_name ? `\n**Generated by** ${image_map[0].generation.worker_name}\n(\`${image_map[0].generation.worker_id ?? "unknown"}\`)` : ""}`,
                                color: Colors.Blue,
                                footer: {text: `Generation ID ${generation_start.id}`}
                            })
                        ];
                        
                        await ctx.interaction.editReply({
                            content: null, 
                            components: resultComponents, 
                            embeds: resultEmbeds, 
                            files
                        });
                    } else {
                        // Legacy format
                        const image_map_r = images.generations?.map(async (g, i) => {
                            // Check if media URL exists
                            if (!g.img) return null;
                            
                            // Determine if this is a video based on generation data
                            const generation = g as GenerationStable;
                            const isVideo = generation.media_type === 'video' || generation.form === 'video' || generation.type === 'video';
                            const fileExtension = isVideo ? '.mp4' : '.webp';
                            const mediaType = isVideo ? 'video' : 'image';
                            const contentType = isVideo ? "Video" : "Image";
                            
                            console.log(`Processing ${mediaType} data for generation ${g.id}`);
                            
                            const req = await fetch(g.img);
                            const blob = await req.blob();
                            const buffer = Buffer.from(await blob.arrayBuffer());
                            const attachment = new AttachmentBuilder(buffer, {name: `${g.seed ?? `${mediaType}${i}`}${fileExtension}`});
                            const embed = new EmbedBuilder({
                                title: `${contentType} ${i+1}`,
                                image: {url: `attachment://${g.seed ?? `${mediaType}${i}`}${fileExtension}`},
                                color: Colors.Blue,
                                description: `${!i ? `**Raw Prompt:** ${prompt}\n**Processed Prompt:** ${formattedPrompt}\n**Style:** \`${style?.name ?? style_raw}\`\n**Total Tokens Cost:** \`${images.kudos}\`` : ""}${g.worker_name ? `\n**Generated by** ${g.worker_name}\n(\`${g.worker_id ?? "unknown"}\`)` : ""}` || undefined,
                            });
                            return {attachment, embed};
                        }) || [];
                        
                        // Filter out null values
                        const image_map = (await Promise.all(image_map_r)).filter(item => item !== null);
                        const resultEmbeds = image_map.map(i => i!.embed);
                        const files = image_map.map(i => i!.attachment);
                        
                        await ctx.interaction.editReply({
                            content: null, 
                            components: [{type: 1, components: [regenerate_btn, delete_btn]}], 
                            embeds: resultEmbeds, 
                            files
                        });
                    }
                } else {
                    // Update with current status
                    await ctx.interaction.editReply({
                        content: "",
                        embeds,
                        components
                    });
                }
            }, 1000 * (ctx.client.config?.generate?.update_generation_status_interval_seconds || 5));
            
        } catch (error) {
            console.error("Error in quickgenerate:", error);
            return ctx.interaction.editReply("An error occurred while generating the image. Please try again later.");
        }
    }
} 