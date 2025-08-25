import { AttachmentBuilder, ButtonBuilder, Colors, ComponentType, EmbedBuilder, InteractionButtonComponentData } from "discord.js";
import { Component } from "../classes/component";
import { ComponentContext } from "../classes/componentContext";

export default class extends Component {
    constructor() {
        super({
            name: "regenerate",
            staff_only: false,
            regex: /regenerate_.+/
        })
    }

    override async run(ctx: ComponentContext<ComponentType.Button>): Promise<any> {
        // Extract the prompt and user ID from the custom_id
        const customIdParts = ctx.interaction.customId.split('_');
        
        // Extract user ID and prompt from the custom ID
        const userId = customIdParts[1];
        const prompt = customIdParts.slice(2).join('_');
        
        if(userId !== ctx.interaction.user.id) 
            return ctx.error({error: "Only the creator of this image can regenerate it"});
        
        // Defer the update so we can work with it
        try {
            await ctx.interaction.deferReply();
        } catch (error) {
            // Handle expired interactions gracefully
            if (error && typeof error === 'object' && 'code' in error && (error as any).code === 10062) {
                console.log('[WARNING] Interaction expired - user should try again');
                return; // Silently ignore expired interactions
            }
            throw error; // Re-throw other errors
        }
        
        try {
            // Set a default style (this will be overridden if we find a style in metadata)
            let originalStyle = ctx.client.config.generate?.default?.style ?? "flux-portrait"; // default fallback
            
            // Get the message being replied to, and check its embeds for style info
            const message = await ctx.interaction.message.fetch();
            if (message.embeds?.length > 0) {
                const embed = message.embeds[0];
                if (embed) {
                    const descriptionText = embed.description || "";
                    
                    // Extract style from description
                    const styleMatch = descriptionText.match(/\*\*Style\*\* `([^`]+)`/);
                    if (styleMatch && styleMatch[1]) {
                        // Found the style in the embed description
                        originalStyle = styleMatch[1];
                    }
                }
            }
            
            // Reload per-channel overrides
            if (ctx.client.config.channel_overrides?.[ctx.interaction.channelId!]) {
                await ctx.client.loadHordeStyles(ctx.interaction.channelId!);
                await ctx.client.loadHordeStyleCategories(ctx.interaction.channelId!);
            }
            // Enforce channel style/category allowlist
            const channelCfg = ctx.client.config.channel_overrides?.[ctx.interaction.channelId!];
            if (channelCfg && (channelCfg.allowed_styles || channelCfg.allowed_categories)) {
                const candidate = originalStyle.toLowerCase();
                const allowed = (channelCfg.allowed_styles?.includes(candidate)) || (channelCfg.allowed_categories?.includes(candidate));
                if (!allowed) {
                    return ctx.error({error: `This channel only allows styles/categories: ${(channelCfg.allowed_styles||[]).concat(channelCfg.allowed_categories||[]).map(s=>`\`${s}\``).join(', ')}`});
                }
            }
            const style = ctx.client.getHordeStyle(originalStyle);
            
            if (!style?.prompt?.length) {
                return ctx.error({error: "Unable to find style. Please try again later."});
            }
            
            // Apply the style to the prompt
            let formattedPrompt = style.prompt.slice().replace("{p}", prompt);
            formattedPrompt = formattedPrompt.replace("{np}", "");
            
            // Get the token
            const token = await ctx.client.getUserToken(ctx.interaction.user.id, ctx.database) || 
                          process.env['GLOBAL_GRID_API_KEY'] || 
                          ctx.client.config.default_token || 
                          "0000000000";
            
            // Prepare generation parameters
            const denoise = (ctx.client.config.generate?.default?.denoise ?? 50) / 100;
            const amount = 1;
            
            // Create the generation request parameters
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
                if(ctx.client.config.advanced?.dev) console.error(e);
                return e.rawError as any;
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
            const showInitialEta = currentFrameIdx >= 1;
            const embed = new EmbedBuilder({
                color: Colors.Blue,
                title: "Generation started",
                description: `**Position:** \`${start_status?.queue_position}\`/\`${start_horde_data.queued_requests}\`
**Credits Consumed:** \`${start_status?.kudos}\`
**Workers:** \`${start_horde_data.worker_count}\`

\`${start_status?.waiting ?? 0}\`/\`${amount}\` **Images waiting**
\`${start_status?.processing ?? 0}\`/\`${amount}\` **Images processing**
\`${start_status?.finished ?? 0}\`/\`${amount}\` **Images finished**

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
            
            const edit_btn: InteractionButtonComponentData = {
                label: "Edit",
                customId: `edit_prompt_${ctx.interaction.user.id}_${prompt.substring(0, Math.max(0, 90 - ctx.interaction.user.id.length - 11))}`,
                style: 2,
                type: 2,
                emoji: { name: "✏️" }
            };
            
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
                    // Check generation status
                    const status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start.id);
                    const horde_data = await ctx.ai_horde_manager.getPerformance();
                    
                    if (!status || status.faulted) {
                        if (!done) {
                            await ctx.interaction.editReply({
                                content: "Image generation has been cancelled", 
                                embeds: [],
                                components: []
                            }).catch(console.error);
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
                            }).catch(console.error);
                        }
                        clearInterval(interval);
                        return;
                    }
                    
                    // Update the embed with new status
                    const showEta = currentFrameIdx >= 1;
                    const updatedEmbed = new EmbedBuilder({
                        color: Colors.Blue,
                        title: "Generation started",
                        description: `**Position:** \`${status.queue_position}\`/\`${horde_data.queued_requests}\`
**Credits Consumed:** \`${status?.kudos}\`
**Workers:** \`${horde_data.worker_count}\`

\`${status.waiting ?? 0}\`/\`${amount}\` **Images waiting**
\`${status.processing ?? 0}\`/\`${amount}\` **Images processing**
\`${status.finished ?? 0}\`/\`${amount}\` **Images finished**

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
                    if (status.done) {
                        done = true;
                        clearInterval(interval);
                        
                        // Get the generation results
                        const images = await ctx.ai_horde_manager.getImageGenerationStatus(generation_start.id);
                        
                        // Debug logging to see which format is being used
                        console.log('[DEBUG] result_structure_v2_enabled:', ctx.client.config.advanced?.result_structure_v2_enabled);
                        console.log('[DEBUG] Using format:', (ctx.client.config.advanced?.result_structure_v2_enabled ?? true) ? 'v2' : 'legacy');
                        console.log('[DEBUG] generationParams:', generationParams);
                        console.log('[DEBUG] generationParams.width:', generationParams.width);
                        console.log('[DEBUG] generationParams.height:', generationParams.height);
                        console.log('[DEBUG] generationParams.steps:', generationParams.steps);
                        console.log('[DEBUG] generationParams.cfg_scale:', generationParams.cfg_scale);
                        console.log('[DEBUG] generationParams.sampler_name:', generationParams.sampler_name);
                        
                        if (ctx.client.config.advanced?.result_structure_v2_enabled ?? true) {
                            const image_map_r = images.generations?.map(async g => {
                                // Check if img URL exists
                                if (!g.img || g.censored) return {attachment: null, generation: g};
                                
                                try {
                                    // First, check if this is a Base64 image
                                    let buffer: Buffer;
                                    
                                    // Log the first 30 chars of the img data for debugging
                                    console.log(`[DEBUG] Image data type: ${typeof g.img}, First 30 chars: ${g.img.substring ? g.img.substring(0, 30) + '...' : 'non-string data'}`);
                                    
                                    // Check if it's a data URL (base64 with prefix)
                                    if (typeof g.img === 'string' && g.img.startsWith('data:')) {
                                        console.log('[DEBUG] Processing data URL (base64 with prefix)');
                                        // Extract the base64 part and convert to buffer
                                        const parts = g.img.split(',');
                                        if (parts.length > 1) {
                                            const base64Data = parts[1];
                                            buffer = Buffer.from(base64Data as string, 'base64');
                                        } else {
                                            console.error('[ERROR] Invalid data URL format');
                                            return {attachment: null, generation: g};
                                        }
                                    } 
                                    // Check if it's a raw base64 string (without data: prefix)
                                    else if (typeof g.img === 'string' && /^[A-Za-z0-9+/=]+$/.test(g.img.substring(0, 20))) {
                                        console.log('[DEBUG] Processing raw base64 string');
                                        buffer = Buffer.from(g.img, 'base64');
                                    }
                                    // Otherwise treat as URL
                                    else if (typeof g.img === 'string') {
                                        // Validate URL before fetching
                                        try {
                                            new URL(g.img);
                                            console.log('[DEBUG] Processing URL: ', g.img);
                                            const req = await fetch(g.img);
                                            const blob = await req.blob();
                                            buffer = Buffer.from(await blob.arrayBuffer());
                                        } catch (urlError) {
                                            console.error('[ERROR] Invalid URL:', urlError, 'URL attempted:', g.img);
                                            return {attachment: null, generation: g};
                                        }
                                    }
                                    else {
                                        console.error('[ERROR] Image data is not a string:', g.img);
                                        return {attachment: null, generation: g};
                                    }
                                    
                                    const attachment = new AttachmentBuilder(buffer, {name: `${g.id}.webp`});
                                    return {attachment, generation: g};
                                } catch (error) {
                                    console.error('[ERROR] Failed to process image:', error);
                                    return {attachment: null, generation: g};
                                }
                            }) || [];
                            
                            const image_map = await Promise.all(image_map_r);
                            const files = image_map.filter(i => i.attachment).map(i => i.attachment) as AttachmentBuilder[];
                            
                            const resultComponents = [{type: 1, components: [regenerate_btn, edit_btn, delete_btn]}];
                            const resultEmbeds = [
                                new EmbedBuilder({
                                    title: "Generation Finished",
                                    description: `**Prompt** ${prompt}\n**Style** \`${style?.name ?? originalStyle}\`\n📏\`${generationParams.width}x${generationParams.height}\` | 🔄\`${generationParams.steps} steps\` | ⚖️\`CFG ${generationParams.cfg_scale}\` | 🎲\`${generationParams.sampler_name}\`${image_map.length === 1 && image_map[0]?.generation?.seed ? ` | 🌱\`Seed ${image_map[0].generation.seed}\`` : ""}\n**Credits Consumed** \`${images.kudos}\`${image_map.length !== amount ? "\nCensored Images are not displayed" : ""}${image_map.length === 1 && image_map[0]?.generation?.worker_name ? `\n**Generated by** ${image_map[0].generation.worker_name}\n(\`${image_map[0].generation.worker_id ?? "unknown"}\`)` : ""}`,
                                    color: Colors.Blue,
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
                            // Legacy format
                            const image_map_r = images.generations?.map(async (g, i) => {
                                // Check if img URL exists
                                if (!g.img) return null;
                                
                                try {
                                    // First, check if this is a Base64 image
                                    let buffer: Buffer;
                                    
                                    // Log the first 30 chars of the img data for debugging
                                    console.log(`[DEBUG] Image data type: ${typeof g.img}, First 30 chars: ${g.img.substring ? g.img.substring(0, 30) + '...' : 'non-string data'}`);
                                    
                                    // Check if it's a data URL (base64 with prefix)
                                    if (typeof g.img === 'string' && g.img.startsWith('data:')) {
                                        console.log('[DEBUG] Processing data URL (base64 with prefix)');
                                        // Extract the base64 part and convert to buffer
                                        const parts = g.img.split(',');
                                        if (parts.length > 1) {
                                            const base64Data = parts[1];
                                            buffer = Buffer.from(base64Data as string, 'base64');
                                        } else {
                                            console.error('[ERROR] Invalid data URL format');
                                            return null;
                                        }
                                    } 
                                    // Check if it's a raw base64 string (without data: prefix)
                                    else if (typeof g.img === 'string' && /^[A-Za-z0-9+/=]+$/.test(g.img.substring(0, 20))) {
                                        console.log('[DEBUG] Processing raw base64 string');
                                        buffer = Buffer.from(g.img, 'base64');
                                    }
                                    // Otherwise treat as URL
                                    else if (typeof g.img === 'string') {
                                        // Validate URL before fetching
                                        try {
                                            new URL(g.img);
                                            console.log('[DEBUG] Processing URL: ', g.img);
                                            const req = await fetch(g.img, { 
                                                signal: AbortSignal.timeout(30000) 
                                            });
                                            if (!req.ok) throw new Error(`HTTP ${req.status}`);
                                            const blob = await req.blob();
                                            buffer = Buffer.from(await blob.arrayBuffer());
                                        } catch (urlError) {
                                            console.error('[ERROR] Invalid URL:', urlError, 'URL attempted:', g.img);
                                            return null;
                                        }
                                    }
                                    else {
                                        console.error('[ERROR] Image data is not a string:', g.img);
                                        return null;
                                    }
                                    
                                    const attachment = new AttachmentBuilder(buffer, {name: `${g.seed ?? `image${i}`}.webp`});
                                    const embed = new EmbedBuilder({
                                        title: `Image ${i+1}`,
                                        image: {url: `attachment://${g.seed ?? `image${i}`}.webp`},
                                        color: Colors.Blue,
                                        description: `${!i ? `**Raw Prompt:** ${prompt}\n**Processed Prompt:** ${formattedPrompt}\n**Style:** \`${style?.name ?? originalStyle}\`\n📏\`${generationParams.width}x${generationParams.height}\` | 🔄\`${generationParams.steps} steps\` | ⚖️\`CFG ${generationParams.cfg_scale}\` | 🎲\`${generationParams.sampler_name}\`${g.seed ? ` | 🌱\`Seed ${g.seed}\`` : ""}\n**Total Tokens Cost:** \`${images.kudos}\`` : ""}${g.worker_name ? `\n**Generated by** ${g.worker_name}\n(\`${g.worker_id ?? "unknown"}\`)` : ""}` || undefined,
                                    });
                                    return {attachment, embed};
                                } catch (error) {
                                    console.error('[ERROR] Failed to process image:', error);
                                    return null;
                                }
                            }) || [];
                            
                            // Filter out null values
                            const image_map = (await Promise.all(image_map_r)).filter(item => item !== null);
                            const resultEmbeds = image_map.map(i => i!.embed);
                            const files = image_map.map(i => i!.attachment);
                            
                            await ctx.interaction.editReply({
                                content: null, 
                                components: [{type: 1, components: [regenerate_btn, edit_btn, delete_btn]}], 
                                embeds: resultEmbeds, 
                                files
                            }).catch(console.error);
                        }
                    } else {
                        // Update with current status
                        await ctx.interaction.editReply({
                            content: "",
                            embeds,
                            components
                        }).catch(console.error);
                    }
                } catch (error) {
                    // Handle Discord API errors gracefully
                    if (error && typeof error === 'object' && 'code' in error) {
                        const discordError = error as any;
                        if (discordError.code === 10008) {
                            // Unknown Message - the message was deleted or we can't edit it
                            console.log('[WARNING] Cannot edit message - it may have been deleted');
                            clearInterval(interval);
                            return;
                        }
                    }
                    console.error('[ERROR] Error in status update loop:', error);
                }
            }, 1000 * (ctx.client.config?.generate?.update_generation_status_interval_seconds || 5));
            
        } catch (error) {
            console.error("Error regenerating image:", error);
            return ctx.interaction.editReply("An error occurred while regenerating the image. Please try again later.").catch(console.error);
        }
    }
} 