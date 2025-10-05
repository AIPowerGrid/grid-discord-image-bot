import { AttachmentBuilder, ButtonBuilder, Colors, ComponentType, EmbedBuilder, InteractionButtonComponentData } from "discord.js";
import { Component } from "../classes/component";
import { ComponentContext } from "../classes/componentContext";
import { GenerationStable } from "../types/generation";
import Centra from "centra";

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
        console.log(`[DEBUG] Button customId: "${customId}"`);
        
        // Check if the custom_id includes style information (format: quickgenerate_style:stylename_messageId)
        // Get channel-specific default style or fall back to global default
        const channelCfg = ctx.client.config.channel_overrides?.[ctx.interaction.channelId!];
        const isVideoChannel = channelCfg?.content_type === "video";
        let style_raw = channelCfg?.default_style ?? ctx.client.config.generate?.default?.style ?? "flux-portrait";
        let prompt = "";
        
        if (customId.includes("style:")) {
            // Extract style and messageId from custom_id with style information
            // Format: quickgenerate_style:stylename_messageId
            const afterPrefix = customId.substring(13); // Remove "quickgenerate_"
            console.log(`[DEBUG] After prefix: "${afterPrefix}"`);
            
            // Find the first underscore after "style:" to separate style from messageId
            const styleStart = afterPrefix.indexOf("style:");
            const styleEnd = afterPrefix.indexOf("_", styleStart);
            
            if (styleStart !== -1 && styleEnd !== -1) {
                const styleInfo = afterPrefix.substring(styleStart, styleEnd);
                console.log(`[DEBUG] Style info part: "${styleInfo}"`);
                
                if (styleInfo.startsWith("style:")) {
                    style_raw = styleInfo.substring(6); // Remove "style:" to get stylename
                    console.log(`[DEBUG] Extracted style from button: "${style_raw}"`);
                }
                
                const messageId = afterPrefix.substring(styleEnd + 1); // Everything after the underscore
                console.log(`[DEBUG] Message ID from button: "${messageId}"`);
                
                // Fetch the original message to get the full prompt
                try {
                    const originalMessage = await ctx.interaction.channel?.messages.fetch(messageId);
                    if (originalMessage) {
                        prompt = originalMessage.content;
                        console.log(`[DEBUG] Retrieved full prompt from message: "${prompt.substring(0, 100)}..."`);
                    } else {
                        console.log(`[DEBUG] Could not fetch message with ID: ${messageId}`);
                    }
                } catch (error) {
                    console.error(`[ERROR] Failed to fetch original message: ${error}`);
                }
            } else {
                console.log(`[DEBUG] Failed to parse style info from: "${afterPrefix}"`);
            }
        } else {
            // Original format without style - extract messageId
            const messageId = customId.substring(13); // "quickgenerate_".length
            console.log(`[DEBUG] Message ID from button: "${messageId}"`);
            
            // Fetch the original message to get the full prompt
            try {
                const originalMessage = await ctx.interaction.channel?.messages.fetch(messageId);
                if (originalMessage) {
                    prompt = originalMessage.content;
                    console.log(`[DEBUG] Retrieved full prompt from message: "${prompt.substring(0, 100)}..."`);
                } else {
                    console.log(`[DEBUG] Could not fetch message with ID: ${messageId}`);
                }
            } catch (error) {
                console.error(`[ERROR] Failed to fetch original message: ${error}`);
            }
        }
        
        // Clean up the prompt - trim whitespace
        prompt = prompt.trim();
        
        if (!prompt) return ctx.error({ error: "No prompt found in the original message." });

        await ctx.interaction.deferReply();

        try {
            // Use the style from the custom_id or the default
            console.log(`[DEBUG] Looking up style: "${style_raw}"`);
            const style = ctx.client.getHordeStyle(style_raw);
            console.log(`[DEBUG] Found style:`, style ? { name: style.name, model: style.model } : null);
            
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
                hires_fix: style.hires_fix,
                // Add video parameters for video channels
                ...(isVideoChannel && {
                    length: (style as any).length || (style as any).video_length || 81,
                    fps: (style as any).fps || 16
                })
            };
            
            // For now, don't filter workers - let the API handle worker selection
            // TODO: Implement proper worker filtering once we understand the bridge_agent format
            let filteredWorkers: string[] | undefined = undefined;

            const generation_data = {
                prompt: formattedPrompt,
                params: generationParams,
                replacement_filter: ctx.client.config.generate?.replacement_filter,
                nsfw: ctx.client.config.generate?.user_restrictions?.allow_nsfw,
                censor_nsfw: ctx.client.config.generate?.censor_nsfw,
                trusted_workers: ctx.client.config.generate?.trusted_workers,
                workers: filteredWorkers || ctx.client.config.generate?.workers,
                models: style.model ? (style.model === "YOLO" ? [] : [style.model]) : undefined,
                r2: true,
                shared: false,
                // Add video parameters at top level for API
                ...(isVideoChannel && {
                    length: (style as any).length || (style as any).video_length || 81,
                    fps: (style as any).fps || 16
                })
            };
            
            // Debug: Log generation parameters for video channels
            if (isVideoChannel) {
                console.log(`[DEBUG] Video generation request - Model: ${style.model}, Style length: ${(style as any).length}, Generation data length: ${generation_data.length}, Params:`, {
                    width: generationParams.width,
                    height: generationParams.height,
                    length: (generationParams as any).length,
                    fps: (generationParams as any).fps,
                    steps: generationParams.steps,
                    cfg_scale: generationParams.cfg_scale
                });
                console.log(`[DEBUG] Full generation_data object:`, JSON.stringify(generation_data, null, 2));
            }
            
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
            
            // Set up interval to update status - use longer interval for video generation
            const pollInterval = isVideoChannel ? 20 : (ctx.client.config?.generate?.update_generation_status_interval_seconds || 5);
            let consecutiveErrors = 0;
            
            const interval = setInterval(async () => {
                if (done) return;
                
                try {
                    // Check generation status
                    const status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start.id);
                    const horde_data = await ctx.ai_horde_manager.getPerformance();
                    consecutiveErrors = 0; // Reset error count on success
                
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
                
                // Use longer timeout for video generations (10 minutes vs 2 minutes)
                const timeoutMs = isVideoChannel ? 1000*60*10 : 1000*60*2;
                if (error_timeout < (Date.now()-timeoutMs) || start_status?.faulted) {
                    if (!done) {
                        await ctx.ai_horde_manager.deleteImageGenerationRequest(generation_start.id);
                        await ctx.interaction.editReply({
                            components: [],
                            content: isVideoChannel ? "Video generation cancelled due to timeout (10 minutes)" : "Generation cancelled due to errors",
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
                
                // Conservative fallback: Only check if finished > 0 (not just processing === 0)
                if (!generationComplete && isVideoChannel && status?.finished && status.finished > 0) {
                    console.log('[DEBUG] Video generation: checking if result is ready (finished > 0)');
                    try {
                        const testImages = await ctx.ai_horde_manager.getImageGenerationStatus(generation_start.id);
                        if (testImages.generations && testImages.generations.length > 0) {
                            console.log('[DEBUG] Found video result, proceeding with completion');
                            generationComplete = true;
                        }
                    } catch (e: any) {
                        console.log('[DEBUG] Fallback check failed:', e?.message || 'unknown error');
                        // Don't do fallback checks if we're rate limited
                        if (e?.status === 429) {
                            console.log('[DEBUG] Rate limited, skipping fallback checks');
                        }
                    }
                }
                
                // If generation is complete
                if (generationComplete) {
                    done = true;
                    clearInterval(interval);
                    
                        // Get the generation results
                        const images = await ctx.ai_horde_manager.getImageGenerationStatus(generation_start.id);
                        
                        console.log('[DEBUG] Channel configuration:', {
                            isVideoChannel,
                            channelType: channelCfg?.content_type,
                            defaultStyle: style_raw
                        });
                        
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
                        
                        // Additional check: detect video content from base64 MP4 data or WebP in video channels
                        const hasVideoContent = generations?.some(g => {
                            if (!g.img) return false;
                            // Check for base64 encoded MP4 data (starts with MP4 file signature)
                            if (g.img.startsWith('AAAAIGZ0eXBpc29tAAA') || g.img.startsWith('AAAAFGZ0eXBpc29t')) return true;
                            // Only treat WebP as video if we're in a video channel context
                            if (isVideoChannel && g.img.toLowerCase().includes('.webp')) return true;
                            return false;
                        }) || false;
                        
                        console.log('[DEBUG] isVideoResponse:', isVideoResponse);
                        console.log('[DEBUG] hasVideoFilename:', hasVideoFilename);
                        console.log('[DEBUG] hasVideoContent:', hasVideoContent);
                        console.log('[DEBUG] Final video detection:', isVideoResponse || hasVideoFilename || hasVideoContent);
                        
                        const image_map_r = generations?.map(async g => {
                            // Check if media URL exists
                            if (!g.img || g.censored) return {attachment: null, generation: g};
                            
                            // Determine if this is a video based on generation data or response type
                            const isVideo = g.media_type === 'video' || g.form === 'video' || g.type === 'video' || isVideoResponse || hasVideoFilename || hasVideoContent;
                            
                            // Determine file extension based on content type and data format
                            let fileExtension = '.webp'; // Default for images
                            if (isVideo) {
                                // Check if it's base64 MP4 data
                                if (g.img && (g.img.startsWith('AAAAIGZ0eXBpc29tAAA') || g.img.startsWith('AAAAFGZ0eXBpc29t'))) {
                                    fileExtension = '.mp4';
                                } else if (g.img && g.img.toLowerCase().includes('.webp')) {
                                    fileExtension = '.webp'; // Animated WebP
                                } else {
                                    fileExtension = '.mp4'; // Default for video
                                }
                            }
                            
                            const mediaType = isVideo ? 'video' : 'image';
                            
                            console.log(`Processing ${mediaType} data for generation ${g.id}`);
                            
                            // Log the image URL for debugging
                            console.log(`[DEBUG] Trying to fetch: ${g.img}`);
                            
                            try {
                                const req = await fetch(g.img);
                                if (!req.ok) {
                                    throw new Error(`HTTP error! Status: ${req.status}`);
                                }
                                const blob = await req.blob();
                                const buffer = Buffer.from(await blob.arrayBuffer());
                                const filename = `${g.id}${fileExtension}`;
                                console.log(`[DEBUG] Creating attachment with filename: ${filename}`);
                                
                                const attachment = new AttachmentBuilder(buffer, {
                                    name: filename
                                });
                                console.log(`[DEBUG] Successfully fetched and processed ${mediaType}`);
                                return {attachment, generation: g};
                            } catch (fetchError) {
                                console.error(`[ERROR] Failed to fetch ${mediaType}: ${fetchError}`);
                                
                                // Try with Centra as fallback
                                try {
                                    console.log(`[DEBUG] Trying with Centra as fallback...`);
                                    const centraReq = await Centra(g.img, "GET").timeout(30000).send();
                                    const filename = `${g.id}${fileExtension}`;
                                    console.log(`[DEBUG] Creating attachment with filename: ${filename}`);
                                    const buffer = centraReq.body;
                                    
                                    const attachment = new AttachmentBuilder(buffer, {
                                        name: filename
                                    });
                                    console.log(`[DEBUG] Centra fallback succeeded`);
                                    return {attachment, generation: g};
                                } catch (centraError) {
                                    console.error(`[ERROR] Centra fallback failed: ${centraError}`);
                                    
                                    // Last resort - try to interpret as base64
                                    if (g.img && g.img.length > 100) {
                                        try {
                                            console.log(`[DEBUG] Trying as base64...`);
                                            const base64Data = g.img.includes(',') ? g.img.split(',')[1] : g.img;
                                            if (base64Data) {
                                                const buffer = Buffer.from(base64Data, 'base64');
                                                const filename = `${g.id}${fileExtension}`;
                                                console.log(`[DEBUG] Creating attachment with filename: ${filename}`);
                                                
                                                const attachment = new AttachmentBuilder(buffer, {
                                                    name: filename
                                                });
                                                return {attachment, generation: g};
                                            }
                                            throw new Error("No valid base64 data found");
                                        } catch (base64Error) {
                                            console.error(`[ERROR] Base64 processing failed: ${base64Error}`);
                                        }
                                    }
                                    
                                    // If all attempts fail
                                    return {attachment: null, generation: g};
                                }
                            }
                        }) || [];
                        
                        const image_map = await Promise.all(image_map_r);
                        const files = image_map.filter(i => i.attachment).map(i => i.attachment) as AttachmentBuilder[];
                        
                        const contentType = (isVideoResponse || hasVideoFilename || hasVideoContent) ? "video" : "image";
                        const contentTypePlural = (isVideoResponse || hasVideoFilename || hasVideoContent) ? "videos" : "images";
                        const resultComponents = [{type: 1, components: [regenerate_btn, delete_btn]}];
                        const resultEmbeds = [
                            new EmbedBuilder({
                                title: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} Generation Finished`,
                                description: `**Prompt** ${prompt}\n**Style** \`${style?.name ?? style_raw}\`\n**Parameters** \`${generationParams.width}x${generationParams.height}\` | \`${generationParams.steps} steps\` | \`CFG ${generationParams.cfg_scale}\` | \`${generationParams.sampler_name}\`${image_map.length === 1 && image_map[0]?.generation?.seed ? ` | \`Seed ${image_map[0].generation.seed}\`` : ""}\n**Credits Consumed** \`${images.kudos}\`${image_map.length !== amount ? `\nCensored ${contentTypePlural} are not displayed` : ""}${image_map.length === 1 && image_map[0]?.generation?.worker_name ? `\n**Generated by** ${image_map[0].generation.worker_name}\n(\`${image_map[0].generation.worker_id ?? "unknown"}\`)` : ""}`,
                                color: Colors.Blue,
                                footer: {text: `Generation ID ${generation_start.id}`}
                            })
                        ];
                        
                        console.log(`[DEBUG] About to send response with contentType: ${contentType}`);
                        
                        // Special handling for video content with actual URLs (not base64)
                        if (contentType === "video" && generations && generations.length > 0 && generations[0]?.img) {
                            const imgData = generations[0].img!;
                            
                            // Check if it's a valid URL (not base64 data)
                            const isValidUrl = imgData.startsWith('http://') || imgData.startsWith('https://');
                            
                            if (isValidUrl && imgData.length <= 2048) {
                                console.log(`[DEBUG] Using video-optimized response with direct URL`);
                                
                                const videoEmbed = new EmbedBuilder({
                                    title: `Video Generation Finished`,
                                    description: `**Prompt:** ${prompt}\n**Style:** \`${style?.name ?? style_raw}\`\n**Parameters:** \`${generationParams.width}x${generationParams.height}\` | \`${generationParams.steps} steps\` | \`CFG ${generationParams.cfg_scale}\` | \`${generationParams.sampler_name}\`\n**Credits Consumed:** \`${images.kudos}\``,
                                    image: { url: imgData }, // Use direct URL for animated WebP
                                    color: Colors.Blue,
                                    footer: {text: `Generation ID ${generation_start.id}`}
                                });
                                
                                await ctx.interaction.editReply({
                                    content: null,
                                    components: resultComponents, 
                                    embeds: [videoEmbed],
                                    files: []
                                });
                            } else {
                                // Base64 data - use standard attachment approach but with video title
                                console.log(`[DEBUG] Using attachment-based response for base64 video data`);
                                
                                // Update the embed title to show "Video Generation Finished"
                                resultEmbeds[0] = new EmbedBuilder({
                                    title: `Video Generation Finished`,
                                    description: `**Prompt** ${prompt}\n**Style** \`${style?.name ?? style_raw}\`\n**Parameters** \`${generationParams.width}x${generationParams.height}\` | \`${generationParams.steps} steps\` | \`CFG ${generationParams.cfg_scale}\` | \`${generationParams.sampler_name}\`${image_map.length === 1 && image_map[0]?.generation?.seed ? ` | \`Seed ${image_map[0].generation.seed}\`` : ""}\n**Credits Consumed** \`${images.kudos}\`${image_map.length !== amount ? `\nCensored ${contentTypePlural} are not displayed` : ""}${image_map.length === 1 && image_map[0]?.generation?.worker_name ? `\n**Generated by** ${image_map[0].generation.worker_name}\n(\`${image_map[0].generation.worker_id ?? "unknown"}\`)` : ""}`,
                                    color: Colors.Blue,
                                    footer: {text: `Generation ID ${generation_start.id}`}
                                });
                                
                                await ctx.interaction.editReply({
                                    content: null,
                                    components: resultComponents,
                                    embeds: resultEmbeds,
                                    files
                                });
                            }
                        } else {
                            // Standard response for images
                            await ctx.interaction.editReply({
                                content: null,
                                components: resultComponents,
                                embeds: resultEmbeds,
                                files
                            });
                        }
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
                } catch (error: any) {
                    consecutiveErrors++;
                    console.error(`[ERROR] Status check failed (attempt ${consecutiveErrors}):`, error?.message || 'unknown error');
                    
                    // Handle rate limiting
                    if (error?.status === 429) {
                        console.log('[DEBUG] Rate limited, increasing poll interval temporarily');
                        // Don't clear interval, just skip this iteration
                        return;
                    }
                    
                    // If too many consecutive errors, give up
                    if (consecutiveErrors >= 5) {
                        console.error('[ERROR] Too many consecutive failures, stopping generation monitoring');
                        clearInterval(interval);
                        if (!done) {
                            await ctx.interaction.editReply({
                                content: "❌ Generation monitoring failed due to repeated errors. The generation may still complete.",
                                components: [],
                                embeds: []
                            }).catch(console.error);
                        }
                        return;
                    }
                }
            }, 1000 * pollInterval);
            
        } catch (error) {
            console.error("Error in quickgenerate:", error);
            return ctx.interaction.editReply("An error occurred while generating the image. Please try again later.");
        }
    }
} 