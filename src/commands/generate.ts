import { AttachmentBuilder, ButtonBuilder, Colors, EmbedBuilder, InteractionButtonComponentData, SlashCommandAttachmentOption, SlashCommandBuilder, SlashCommandStringOption } from "discord.js";
import { Command } from "../classes/command";
import { CommandContext } from "../classes/commandContext";
import { AutocompleteContext } from "../classes/autocompleteContext";
import { readFileSync, appendFileSync } from "fs";
import { Config } from "../types";
import {ModelGenerationInputStableSamplers, ImageGenerationInput} from "aipg_horde";
import Centra from "centra";
const {buffer2webpbuffer} = require("webp-converter")

const config = JSON.parse(readFileSync("./config.json").toString()) as Config

const command_data = new SlashCommandBuilder()
    .setName("generate")
    .setDMPermission(false)
    .setDescription(`Generates an image with AIPG Grid`)
    if(config.generate?.enabled) {
        command_data.addStringOption(
            new SlashCommandStringOption()
            .setName("prompt")
            .setDescription("The prompt to generate an image with")
            .setRequired(true)
        )
        command_data.addStringOption(
            new SlashCommandStringOption()
            .setName("style")
            .setDescription("The style for this image")
            .setRequired(false)
            .setAutocomplete(true)
        )
        if(config.generate?.user_restrictions?.allow_negative_prompt) {
            command_data.addStringOption(
                new SlashCommandStringOption()
                .setName("negative_prompt")
                .setDescription("The negative prompt to generate an image with")
                .setRequired(false)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_source_image) {
            command_data
            .addAttachmentOption(
                new SlashCommandAttachmentOption()
                .setName("source_image")
                .setDescription("The image to use as the source image; max: 3072px")
            )
        }
    }

function generateButtons(id: string) {
    let i = 0
    const getId = () => `followuprate_${i+1}_${id}`
    const components: Array<{ type: number; components: Array<any> }> = []
    while(i < 10) {
        const btn = {
            type: 2,
            label: `${i+1}`,
            customId: getId(),
            style: 1
        }
        if(!components[Math.floor(i/5)]?.components) components.push({type: 1, components: []})
        // Non-null assertion is safe here because we just checked and added if needed
        components[Math.floor(i/5)]!.components.push(btn)
        ++i
    }
    return components
}

export default class extends Command {
    constructor() {
        super({
            name: "generate",
            command_data: command_data.toJSON(),
            staff_only: false,
        })
    }

    override async run(ctx: CommandContext): Promise<any> {
        if(!ctx.client.config.generate?.enabled) return ctx.error({error: "Generation is disabled."})

        await ctx.interaction.deferReply({})
        const party = await ctx.client.getParty(ctx.interaction.channelId, ctx.database)
        let prompt = ctx.interaction.options.getString("prompt", true)
        const negative_prompt = ctx.interaction.options.getString("negative_prompt") ?? ""
        // Get channel-specific default style or fall back to global default
        const channelCfg = ctx.client.config.channel_overrides?.[ctx.interaction.channelId!];
        const defaultStyle = channelCfg?.default_style ?? ctx.client.config.generate?.default?.style ?? "flux-portrait";
        const style_raw = ctx.interaction.options.getString("style") ?? defaultStyle
        const denoise_config = ctx.client.config.generate?.default?.denoise ?? 50
        const denoise = denoise_config / 100
        const amount = 1
        const tiling = !!ctx.client.config.generate?.default?.tiling
        const share_result = ctx.client.config.generate?.default?.share ?? false
        const keep_ratio = true
        let img = ctx.interaction.options.getAttachment("source_image")

        // Reload per-channel styles/categories if overrides exist
        if (ctx.client.config.channel_overrides?.[ctx.interaction.channelId!]) {
            await ctx.client.loadHordeStyles(ctx.interaction.channelId!);
            await ctx.client.loadHordeStyleCategories(ctx.interaction.channelId!);
        }

        // Enforce channel allowlist for styles/categories
        if (channelCfg) {
            const isAllowedStyle = channelCfg.allowed_styles?.includes(style_raw.toLowerCase());
            const isAllowedCategory = channelCfg.allowed_categories?.includes(style_raw.toLowerCase());
            if (channelCfg.allowed_styles || channelCfg.allowed_categories) {
                if (!isAllowedStyle && !isAllowedCategory) {
                    return ctx.error({error: `This channel only allows styles/categories: ${(channelCfg.allowed_styles||[]).concat(channelCfg.allowed_categories||[]).map(s=>`\`${s}\``).join(', ')}`});
                }
            }
        }

        const style = ctx.client.getHordeStyle(style_raw)

        let height = style?.height
        let width = style?.width

        if(ctx.client.config.advanced?.dev) {
            console.log(style)
        }

        const user_token = await ctx.client.getUserToken(ctx.interaction.user.id, ctx.database)
        // Comment out unused variables
        // const ai_horde_user = await ctx.ai_horde_manager.findUser({token: user_token  || ctx.client.config?.default_token || "0000000000"}).catch((e) => ctx.client.config.advanced?.dev ? console.error(e) : null);
        // const can_bypass = ctx.client.config.generate?.source_image?.whitelist?.bypass_checks && ctx.client.config.generate?.source_image?.whitelist?.user_ids?.includes(ctx.interaction.user.id)

        if(!style?.prompt?.length) return ctx.error({error: "Unable to find style for input"})
        if(party?.style && party.style !== style_raw.toLowerCase()) return ctx.error({error: `Please use the style '${party.style}' for this party`})
        if(ctx.client.config.generate.blacklist_regex && new RegExp(ctx.client.config.generate.blacklist_regex, "i").test(prompt.replace(/[\u0300-\u036f]/g, ""))) return ctx.error({error: "Your prompt included one or more blacklisted words"})
        if(ctx.client.config.generate?.blacklisted_words?.some(w => prompt.toLowerCase().includes(w.toLowerCase()))) return ctx.error({error: "Your prompt included one or more blacklisted words"})
        if(ctx.client.config.generate?.blacklisted_styles?.includes(style_raw.toLowerCase())) return ctx.error({error: "The chosen style or category is blacklisted"})
        if(ctx.client.config.generate?.blacklisted_styles?.includes(style.name)) return ctx.error({error: "The randomly chosen style from the category is blacklisted"})
        if(img && !img.contentType?.startsWith("image/")) return ctx.error({error: "Source Image input must be a image"})
        if(img && ((img.height ?? 0) > 3072 || (img.width ?? 0) > 3072)) return ctx.error({error: "Source Image input too large (max. 3072 x 3072)"})

        if(ctx.client.config.generate.convert_a1111_weight_to_horde_weight) {
            prompt = prompt.replace(/(\(+|\[+)|(?<!\:\d(\.\d+)?)(\)+|\]+)/g, (w) => {
                if(w.startsWith("(") || w.startsWith("[")) return "("
                const weight = 1 + (0.1 * (w.startsWith(")") ? 1 : -1) * w.length)
                return `:${weight.toFixed(1)})`
            })
        }
        
        prompt = style.prompt.slice().replace("{p}", prompt)
        prompt = prompt.replace("{np}", !negative_prompt || prompt.includes("###") ? negative_prompt : `###${negative_prompt}`)
        
        if(party && party.wordlist?.length) {
            if(ctx.client.config.advanced?.dev) {
                console.log(party.wordlist)
            }
            if(!party.wordlist?.every(w => prompt.toLowerCase().includes(w))) return ctx.error({error: "Your prompt does not include all required words"})
        }

        if(keep_ratio && img?.width && img?.height) {
            const ratio = img?.width/img?.height
            const largest = ratio >= 1 ? img.width : img.height
            const m = largest > 3072 ? 3072/largest : 1
            const mod_height = Math.round(img.height*m)
            const mod_width = Math.round(img.width*m)
            height = mod_height%64 <= 32 ? mod_height-(mod_height%64) : mod_height+(64-(mod_height%64))
            width = mod_width%64 <= 32 ? mod_width-(mod_width%64) : mod_width+(64-(mod_width%64))
        }
        
        if(ctx.client.config.advanced?.dev) {
            console.log(img?.height)
            console.log(img?.width)
            console.log(height)
            console.log(width)
        }

        const token = process.env['GLOBAL_GRID_API_KEY'] || party?.shared_key || user_token || ctx.client.config.default_token || "0000000000"
        let img_data: Buffer | undefined
        if(img) {
            if(ctx.client.config.advanced?.dev) {
                console.log("Processing source image:", img.url);
                console.log("Image content type:", img.contentType);
                console.log("Image dimensions:", img.width, "x", img.height);
            }
            
            let img_data_res = await Centra(img.url, "GET")
                .send()
            
            if(ctx.client.config.advanced?.dev) {
                console.log("Downloaded image size:", img_data_res.body.length);
            }
            
            if(img.contentType === "image/webp") {
                img_data = img_data_res.body
                if(ctx.client.config.advanced?.dev) {
                    console.log("Using original webp image");
                }
            } else {
                if(ctx.client.config.advanced?.dev) {
                    console.log("Converting to webp format...");
                }
                img_data = await buffer2webpbuffer(img_data_res.body, img.contentType?.replace("image/",""),"-q 80").catch((e: Error) => {
                    if(ctx.client.config.advanced?.dev) console.error("Webp conversion error:", e);
                    return null;
                })
                if(!img_data) return ctx.error({
                    error: "Image format conversion to webp failed"
                })
                if(ctx.client.config.advanced?.dev) {
                    console.log("Webp conversion successful, new size:", img_data.length);
                }
            }
        }


        // Create initial generation parameters
        let generationParams = {
            sampler_name: style.sampler_name as typeof ModelGenerationInputStableSamplers[keyof typeof ModelGenerationInputStableSamplers],
            height: height,
            width: width,
            n: amount,
            tiling,
            denoising_strength: denoise,
            cfg_scale: style.cfg_scale,
            loras: style.loras,
            steps: style.steps,
            tis: style.tis,
            hires_fix: style.hires_fix
        };
        
        // Apply model reference constraints if a model is specified in the style
        if (style.model) {
            try {
                // Log that we're applying model reference constraints
                if (ctx.client.config.advanced?.dev) {
                    console.log(`Applying model reference constraints for model: ${style.model}`);
                }
                
                // Apply the constraints from the model reference
                generationParams = await ctx.client.applyModelReferenceConstraints(style.model, generationParams);
                
                // Log the updated parameters after applying constraints
                if (ctx.client.config.advanced?.dev) {
                    console.log('Updated parameters after applying model reference constraints:', generationParams);
                }
            } catch (error) {
                // Log any errors but continue with original parameters
                if (ctx.client.config.advanced?.dev) {
                    console.error('Error applying model reference constraints:', error);
                }
            }
        }
        
        if (ctx.client.config.advanced?.dev && img_data) {
            console.log("Source image data length:", img_data.length);
            console.log("Source image base64 preview:", img_data.toString("base64").substring(0, 100) + "...");
        }

        // Check if image is too large for API (max ~10MB base64)
        if (img_data && img_data.length > 10000000) {
            return ctx.error({error: "Source image is too large. Please use a smaller image (max ~10MB)."});
        }

        const generation_data: ImageGenerationInput = {
            prompt,
            params: generationParams,
            replacement_filter: ctx.client.config.generate.replacement_filter,
            nsfw: ctx.client.config.generate?.user_restrictions?.allow_nsfw,
            censor_nsfw: ctx.client.config.generate?.censor_nsfw,
            trusted_workers: ctx.client.config.generate?.trusted_workers,
            workers: ctx.client.config.generate?.workers,
            models: !style.model ? undefined : style.model === "YOLO" ? [] : [style.model],
            source_image: img_data ? img_data.toString("base64") : undefined,
            source_processing: img_data ? "img2img" : undefined,
            r2: true, // Always use R2 for output, input image is handled separately
            shared: share_result
        }
        
        if(token === "0000000000" && ((generation_data.params?.width ?? 512) > 1024 || (generation_data.params?.height ?? 512) > 1024 || (generation_data.params?.steps ?? 512) > 100)) return ctx.error({error: "You need to be logged in to generate images with a size over 1024*1024 or more than 100 steps"})

        if(ctx.client.config.advanced?.dev) {
            console.log("API Token:", token);
            console.log("Generation data keys:", Object.keys(generation_data));
            console.log("Source image present:", !!generation_data.source_image);
            console.log("Source processing:", generation_data.source_processing);
            console.log("R2 enabled:", generation_data.r2);
            console.log("MODEL NAME:", style.model);
            console.log("STYLE:", style_raw);
        }

        const generation_start = await ctx.ai_horde_manager.postAsyncImageGenerate(generation_data, {token})
        .catch((e) => {
            console.error("API ERROR:", e)
            if(ctx.client.config.advanced?.dev) console.error(e)
            return e.rawError as any;
        })
        if(!generation_start || !generation_start.id) return ctx.error({error: `Unable to start generation: ${generation_start.message}${Object.entries(generation_start.errors || {}).map(([k, v]) => `\n${k}: ${v}`).join("")}`});


        if (ctx.client.config.logs?.enabled) {
            if (ctx.client.config.logs.log_actions?.with_source_image && img) {
                if (ctx.client.config.logs.plain) logGeneration("txt");
                if (ctx.client.config.logs.csv) logGeneration("csv");
            } else if(ctx.client.config.logs.log_actions?.without_source_image && !img) {
                if (ctx.client.config.logs.plain) logGeneration("txt");
                if (ctx.client.config.logs.csv) logGeneration("csv");
            }
            function logGeneration(type: "txt" | "csv") {
                ctx.client.initLogDir();
                const log_dir = ctx.client.config.logs?.directory ?? "/logs";
                const content = type === "csv" ? `\n${new Date().toISOString()},${ctx.interaction.user.id},${generation_start?.id},${!!img},"${prompt}"` : `\n${new Date().toISOString()} | ${ctx.interaction.user.id}${" ".repeat(20 - ctx.interaction.user.id.length)} | ${generation_start?.id} | ${!!img}${" ".repeat(img ? 10 : 9)} | ${prompt}`;
                appendFileSync(`${process.cwd()}${log_dir}/logs_${new Date().getMonth() + 1}-${new Date().getFullYear()}.${type}`, content);
            }
        }

        if(ctx.client.config.advanced?.dev) console.log(`${ctx.interaction.user.id} generated${!!img ? " using a source image":""} with prompt "${prompt}" (${generation_start?.id})`)

        const chickenSequence = ['🥚', '🐣', '🐤', '🐔', '🔥', '🍗', '😋'] as const;
        let currentFrameIdx = -1; // Start before the first frame

        const getNextEmojiInSequence = () => {
            currentFrameIdx = (currentFrameIdx + 1) % chickenSequence.length;
            return chickenSequence[currentFrameIdx];
        };
            
        const initialEmoji = getNextEmojiInSequence(); // Gets the first emoji

        const start_status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start.id!).catch((e) => ctx.client.config.advanced?.dev ? console.error(e) : null);
        const start_horde_data = await ctx.ai_horde_manager.getPerformance()

        if(ctx.client.config.advanced?.dev) {
            console.log(start_status)
        }

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
        })

        const login_embed = new EmbedBuilder({
            color: Colors.Red,
            title: "You are not logged in",
            description: `This will make your requests appear anonymous.\nThis can result in low generation speed due to low priority.\nLog in now with ${await ctx.client.getSlashCommandTag("login")}\n\nDon't know what the token is?\nCreate an ai horde account here: https://api.aipowergrid.io/register`
        })

        if(ctx.client.config.advanced?.dev) embed.setFooter({text: generation_start.id})

        const btn = new ButtonBuilder({
            label: "Cancel",
            custom_id: `cancel_gen_${generation_start.id}`,
            style: 4
        })
        const delete_btn: InteractionButtonComponentData = {
            label: "Delete",
            customId: `delete_${ctx.interaction.user.id}`,
            style: 4,
            type: 2,
            emoji: { name: "🗑️" }
        }
        
        const regenerate_btn: InteractionButtonComponentData = {
            label: "Regenerate",
            customId: `regenerate_${ctx.interaction.user.id}_${ctx.interaction.options.getString("prompt", true).substring(0, Math.max(0, 90 - ctx.interaction.user.id.length - 11))}`,
            style: 1,
            type: 2,
            emoji: { name: "🎲" }
        }

        const components = [{type: 1, components: [btn.toJSON()]}]

        ctx.interaction.editReply({
            content: "",
            embeds: token === (ctx.client.config.default_token ?? "0000000000") ? [embed.toJSON(), login_embed.toJSON()] : [embed.toJSON()],
            components
        })

        const message = await ctx.interaction.fetchReply()

        let error_timeout = Date.now()*2
        let prev_left = 1

        let done = false

        if(ctx.client.config.generate?.improve_loading_time && (start_status?.wait_time ?? 0) <= 3) {
            // wait before starting the loop so that the first iteration can already pick up the result
            const pre_test = await new Promise((resolve) => setTimeout(async () => {resolve(await getCheckAndDisplayResult())},((start_status?.wait_time ?? 0) + 0.1) * 1000))
            if(!pre_test) return;
        }
        
        const inter = setInterval(async () => {
            const d = await getCheckAndDisplayResult()
            if(!d) return;
            const {status, horde_data} = d
            if(ctx.client.config.generate?.improve_loading_time && (status.wait_time ?? 0) <= 3) {
                // try to display result faster
                setTimeout(async () => {await getCheckAndDisplayResult()},((start_status?.wait_time ?? 0) + 0.1) * 1000)
            }

            if(status?.wait_time === 0 && prev_left !== 0) error_timeout = Date.now()
            prev_left = status?.wait_time ?? 1

            if(error_timeout < (Date.now()-1000*60*2) || start_status?.faulted) {
                if(!done) {
                    await ctx.ai_horde_manager.deleteImageGenerationRequest(generation_start.id!)
                    message.edit({
                        components: [],
                        content: "Generation cancelled due to errors",
                        embeds: []
                    })
                }
                clearInterval(inter)
                return;
            }

            // Using the same emoji from outside to ensure consistency
            const showEta = currentFrameIdx >= 1;
            const embed = new EmbedBuilder({
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
            })

            if(ctx.client.config.advanced?.dev) embed.setFooter({text: generation_start?.id ?? "Unknown ID"})

            let embeds = token === (ctx.client.config.default_token ?? "0000000000") ? [embed.toJSON(), login_embed.toJSON()] : [embed.toJSON()]

            if((status?.wait_time ?? 0) > 60 * 2) {
                embeds.push(new EmbedBuilder({
                    color: Colors.Yellow,
                    title: "The Grid is currently experiencing high load",
                    description: "You can contribute your GPUs processing power to the project.\nRead more: https://aipowergrid.io/"
                }).toJSON())
            }

            return message.edit({
                content: "",
                embeds,
                components
            })
        }, 1000 * (ctx.client.config?.generate?.update_generation_status_interval_seconds || 5))

        async function getCheckAndDisplayResult(precheck?: boolean) {
            if(done) return;
            const status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start!.id!).catch((e) => ctx.client.config.advanced?.dev ? console.error(e) : null);
            done = !!status?.done
            const horde_data = await ctx.ai_horde_manager.getPerformance()
            if(!status || status.faulted) {
                if(!done) await message.edit({content: "Image generation has been cancelled", embeds: []});
                if(!precheck) clearInterval(inter)
                return null;
            }

            if(ctx.client.config.advanced?.dev) {
                console.log(status)
            }

            if(!status.done) return {status, horde_data}
            else {
                done = true
                const images = await ctx.ai_horde_manager.getImageGenerationStatus(generation_start!.id!)

                // Debug logging to see which format is being used
                console.log('[DEBUG] result_structure_v2_enabled:', ctx.client.config.advanced?.result_structure_v2_enabled);
                console.log('[DEBUG] Using format:', (ctx.client.config.advanced?.result_structure_v2_enabled ?? true) ? 'v2' : 'legacy');
                console.log('[DEBUG] generationParams:', generationParams);
                console.log('[DEBUG] generationParams.width:', generationParams.width);
                console.log('[DEBUG] generationParams.height:', generationParams.height);
                console.log('[DEBUG] generationParams.steps:', generationParams.steps);
                console.log('[DEBUG] generationParams.cfg_scale:', generationParams.cfg_scale);
                console.log('[DEBUG] generationParams.sampler_name:', generationParams.sampler_name);

                if(ctx.client.config.advanced?.result_structure_v2_enabled ?? true) {
                    const image_map_r = images.generations?.map(async g => {
                        try {
                            if (!g.img || typeof g.img !== 'string') {
                                console.error(`Invalid image data received: ${g.img}`);
                                return {attachment: null, generation: g};
                            }
                            
                            // Log the image data type and check if it's a valid URL
                            let isValidUrl = false;
                            try {
                                // Just check if the URL is valid, don't actually fetch it yet
                                new URL(g.img);
                                isValidUrl = true;
                                console.log(`Image data appears to be a valid URL`);
                            } catch (e) {
                                console.log(`Image data is not a valid URL, treating as Base64`);
                                isValidUrl = false;
                            }
                            
                            let attachment = null;
                            if (g.censored) {
                                return {attachment: null, generation: g};
                            } else if (g.img.startsWith('data:')) {
                                // Standard Base64 image with data: prefix
                                console.log('Processing as Base64 image with data: prefix');
                                const parts = g.img.split(',');
                                if (parts.length > 1) {
                                    const buffer = Buffer.from(parts[1] as string, 'base64');
                                    attachment = new AttachmentBuilder(buffer, {name: `${g.id}.webp`});
                                } else {
                                    throw new Error('Invalid Base64 format with data: prefix');
                                }
                            } else if (!isValidUrl) {
                                // Raw Base64 image without data: prefix
                                console.log('Processing as raw Base64 image without data: prefix');
                                try {
                                    const buffer = Buffer.from(g.img, 'base64');
                                    attachment = new AttachmentBuilder(buffer, {name: `${g.id}.webp`});
                                } catch (base64Error) {
                                    console.error('Failed to process as raw Base64:', base64Error);
                                }
                            } else {
                                // Valid URL image
                                console.log(`Fetching URL: ${g.img}`);
                                try {
                                    const req = await Centra(g.img, "GET").send();
                                    attachment = new AttachmentBuilder(req.body, {name: `${g.id}.webp`});
                                } catch (urlError) {
                                    console.error('Failed to fetch image URL:', urlError);
                                    // If URL fetch fails, try as base64 as a last resort
                                    if (g.img.length > 100) {
                                        console.log('URL fetch failed, trying as Base64 as last resort');
                                        try {
                                            const buffer = Buffer.from(g.img, 'base64');
                                            attachment = new AttachmentBuilder(buffer, {name: `${g.id}.webp`});
                                        } catch (fallbackError) {
                                            console.error('Fallback to Base64 also failed:', fallbackError);
                                        }
                                    }
                                }
                            }
                            
                            return {attachment, generation: g};
                        } catch (error: unknown) {
                            console.error(`Error processing image: ${error instanceof Error ? error.message : String(error)}`);
                            return {attachment: null, generation: g};
                        }
                    }) || [];
                    if(!precheck) clearInterval(inter);

                    const image_map = await Promise.all(image_map_r)
                    const files = image_map.filter(i => i.attachment !== null).map(i => i.attachment!) as AttachmentBuilder[]
                    if(img_data && image_map.length < 10) files.push(new AttachmentBuilder(img_data, {name: "original.webp"}))
                    let components = [{type: 1, components: [regenerate_btn, delete_btn]}]
                    const embeds = [
                        new EmbedBuilder({
                            title: "Generation Finished",
                            description: `**Prompt** ${ctx.interaction.options.getString("prompt", true)}\n**Style** \`${style?.name ?? style_raw}\`${style?.type === "category-style" ? ` from category \`${style_raw}\`` : ""}\n**Parameters** \`${generationParams.width}x${generationParams.height}\` | \`${generationParams.steps} steps\` | \`CFG ${generationParams.cfg_scale}\` | \`${generationParams.sampler_name}\`${image_map.length === 1 && image_map[0]?.generation?.seed ? ` | \`Seed ${image_map[0].generation.seed}\`` : ""}\n**Credits Consumed** \`${images.kudos}\`${image_map.length !== amount ? "\nCensored Images are not displayed" : ""}${image_map.length === 1 && image_map[0]?.generation?.worker_name ? `\n**Generated by** ${image_map[0].generation.worker_name}\n(\`${image_map[0].generation.worker_id ?? "unknown"}\`)` : ""}`,
                            color: Colors.Blue,
                            footer: {text: `Generation ID ${generation_start!.id}`},
                            thumbnail: img_data && image_map.length < 10 ? {url: "attachment://original.webp"} : img_data ? {url: img!.url} : undefined
                        })
                    ]

                    if(ctx.client.config.generate?.user_restrictions?.allow_rating && (generation_data.shared ?? true) && files.length === 1) {
                        components = [...generateButtons(generation_start!.id!), ...components] as { type: number; components: Array<any> }[]
                    }
                    await message.edit({content: null, components, embeds, files});
                    if(party) await handlePartySubmit()
                    return null
                }



                const image_map_r = images.generations?.map(async (g, i) => {
                    try {
                        if (!g.img || typeof g.img !== 'string') {
                            console.error(`Invalid image data received: ${g.img}`);
                            return {
                                attachment: null,
                                embed: new EmbedBuilder({
                                    title: `Image ${i+1} (Error)`,
                                    color: Colors.Red,
                                    description: `Failed to load image. ${!i ? `\n**Raw Prompt:** ${ctx.interaction.options.getString("prompt", true)}\n**Processed Prompt:** ${prompt}\n**Style:** \`${style?.name ?? style_raw}\`${style?.type === "category-style" ? ` from category \`${style_raw}\`` : ""}\n**Total Tokens Cost:** \`${images.kudos}\`` : ""}`,
                                })
                            };
                        }
                        
                        // Check if it's a valid URL
                        let isValidUrl = false;
                        try {
                            new URL(g.img);
                            isValidUrl = true;
                            console.log(`Image data appears to be a valid URL`);
                        } catch (e) {
                            console.log(`Image data is not a valid URL, treating as Base64`);
                            isValidUrl = false;
                        }
                        
                        let attachment = null;
                        if (g.img.startsWith('data:')) {
                            // Standard Base64 image with data: prefix
                            console.log('Processing as Base64 image with data: prefix');
                            try {
                                const parts = g.img.split(',');
                                if (parts.length > 1) {
                                    const buffer = Buffer.from(parts[1] as string, 'base64');
                                    attachment = new AttachmentBuilder(buffer, {name: `${g.seed ?? `image${i}`}.webp`});
                                } else {
                                    throw new Error('Invalid Base64 format with data: prefix');
                                }
                            } catch (base64Error) {
                                console.error('Failed to process Base64 image with prefix:', base64Error);
                                throw base64Error;
                            }
                        } else if (!isValidUrl) {
                            // Raw Base64 image without data: prefix
                            console.log('Processing as raw Base64 image without data: prefix');
                            try {
                                const buffer = Buffer.from(g.img, 'base64');
                                attachment = new AttachmentBuilder(buffer, {name: `${g.seed ?? `image${i}`}.webp`});
                            } catch (base64Error) {
                                console.error('Failed to process as raw Base64:', base64Error);
                                throw base64Error;
                            }
                        } else {
                            // Valid URL image
                            console.log(`Fetching URL: ${g.img}`);
                            try {
                                const req = await Centra(g.img, "get").timeout(30000).send();
                                if(ctx.client.config.advanced?.dev) console.log(req);
                                attachment = new AttachmentBuilder(req.body, {name: `${g.seed ?? `image${i}`}.webp`});
                            } catch (urlError) {
                                console.error('Failed to fetch image URL:', urlError);
                                // Try with fetch as fallback
                                try {
                                    console.log('Trying fetch as fallback...');
                                    const response = await fetch(g.img, { 
                                        signal: AbortSignal.timeout(30000) 
                                    });
                                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                    const arrayBuffer = await response.arrayBuffer();
                                    attachment = new AttachmentBuilder(Buffer.from(arrayBuffer), {name: `${g.seed ?? `image${i}`}.webp`});
                                } catch (fetchError) {
                                    console.error('Fetch fallback also failed:', fetchError);
                                    // If URL fetch fails, try as base64 as a last resort
                                    if (g.img.length > 100) {
                                        console.log('URL fetch failed, trying as Base64 as last resort');
                                        try {
                                            const buffer = Buffer.from(g.img, 'base64');
                                            attachment = new AttachmentBuilder(buffer, {name: `${g.seed ?? `image${i}`}.webp`});
                                        } catch (fallbackError) {
                                            console.error('Fallback to Base64 also failed');
                                            throw urlError;
                                        }
                                    } else {
                                        throw urlError;
                                    }
                                }
                            }
                        }
                        
                        const embed = new EmbedBuilder({
                            title: `Image ${i+1}`,
                            image: {url: `attachment://${g.seed ?? `image${i}`}.webp`},
                            color: Colors.Blue,
                            description: `${!i ? `**Raw Prompt:** ${ctx.interaction.options.getString("prompt", true)}\n**Processed Prompt:** ${prompt}\n**Style:** \`${style?.name ?? style_raw}\`${style?.type === "category-style" ? ` from category \`${style_raw}\`` : ""}\n**Parameters:** \`${generationParams.width}x${generationParams.height}\` | \`${generationParams.steps} steps\` | \`CFG ${generationParams.cfg_scale}\` | \`${generationParams.sampler_name}\`${g.seed ? ` | \`Seed ${g.seed}\`` : ""}\n**Total Tokens Cost:** \`${images.kudos}\`` : ""}${ctx.client.config.advanced?.dev ? `\n\n**Image ID** ${g.id}` : ""}` || undefined,
                        });
                        if(img_data) embed.setThumbnail(`attachment://original.webp`);
                        return {attachment, embed};
                    } catch (error: unknown) {
                        console.error(`Error processing image: ${error instanceof Error ? error.message : String(error)}`);
                        return {
                            attachment: null,
                            embed: new EmbedBuilder({
                                title: `Image ${i+1} (Error)`,
                                color: Colors.Red,
                                description: `Failed to load image. ${!i ? `\n**Raw Prompt:** ${ctx.interaction.options.getString("prompt", true)}\n**Processed Prompt:** ${prompt}\n**Style:** \`${style?.name ?? style_raw}\`${style?.type === "category-style" ? ` from category \`${style_raw}\`` : ""}\n**Total Tokens Cost:** \`${images.kudos}\`` : ""}`,
                            })
                        };
                    }
                }) || [];
                if(!precheck) clearInterval(inter);

                const image_map = await Promise.all(image_map_r)
                const embeds = image_map.map(i => i.embed)
                if(ctx.client.config.advanced?.dev) embeds.at(-1)?.setFooter({text: `Generation ID ${generation_start!.id}`})
                const files = image_map.filter(i => i.attachment !== null).map(i => i.attachment!) as AttachmentBuilder[]
                if(img_data) files.push(new AttachmentBuilder(img_data, {name: "original.webp"}))
                let components = [{type: 1, components: [regenerate_btn, delete_btn]}]
                if(ctx.client.config.generate?.user_restrictions?.allow_rating && (generation_data.shared ?? true) && files.length === 1) {
                    components = [...generateButtons(generation_start!.id!), ...components] as { type: number; components: Array<any> }[]
                }
                await message.edit({content: `Image generation finished\n\n**A new view is available, check it out by enabling \`result_structure_v2_enabled\` in the bots config**`, components, embeds, files});
                if(party) await handlePartySubmit()
                return null
            } 
        }

        async function handlePartySubmit() {
            if(ctx.client.config.advanced?.dev) console.log(party)
            const p = await ctx.client.getParty(party?.channel_id!, ctx.database)
            if(!p?.award || !message) return;
            if(!p.recurring && p.users.includes(ctx.interaction.user.id)) return;
            if(ctx.interaction.user.id === p.creator_id) return;
            const creator_token = await ctx.client.getUserToken(p.creator_id, ctx.database)
            const target_token = await ctx.client.getUserToken(ctx.interaction.user.id, ctx.database)
            if(!target_token) return message.reply({content: "You need to be logged in to receive rewards for this party"})
            const target_suser = await ctx.ai_horde_manager.findUser({token: target_token})
            if(!target_suser?.username || target_suser.id === 0) return message.reply({content: "Your saved token is invalid, please renew it to claim rewards"})
            if(!creator_token) return message.reply({content: "The creator of the party is logged out...\nLooks like you won't get any tokens"})
            const transfer = await ctx.ai_horde_manager.postKudosTransfer({username: target_suser.username, amount: p.award}, {token: creator_token}).catch(console.error)
            if(!transfer?.transferred) return message.reply({content: "Unable to send you the reward"})

            await message.reply({allowedMentions: {parse: []}, content: `<@${ctx.interaction.user.id}>, the creator of the party <@${p.creator_id}> awarded you ${p.award} tokens for your ${p.recurring ? "" : "first "}generation.${p.recurring ? "\nIf you submit another generation you can claim the reward again" : "\nYou can not receive the reward again"}`})
            const update = await ctx.database?.query("UPDATE parties SET users=array_append(array_remove(users, $2), $2) WHERE channel_id=$1 RETURNING *", [ctx.interaction.channelId, ctx.interaction.user.id])
            if(update?.rowCount) ctx.client.cache.set(`party-${ctx.interaction.channelId}`, update.rows[0]!)
            return;
        }
    }

    override async autocomplete(context: AutocompleteContext): Promise<any> {
        const option = context.interaction.options.getFocused(true)
        switch(option.name) {
            case "style": {
                const party = await context.client.getParty(context.interaction.channelId, context.database)
                if(party) return context.interaction.respond([{name: party.style, value: party.style}])
                const channelCfg = context.client.config.channel_overrides?.[context.interaction.channelId!]
                // Filter allowed styles/categories if configured
                const styles = Object.keys(context.client.horde_styles).filter(s => !channelCfg?.allowed_styles || channelCfg.allowed_styles.includes(s))
                const categories = Object.keys(context.client.horde_style_categories).filter(c => !channelCfg?.allowed_categories || channelCfg.allowed_categories.includes(c))
                const available = [...styles.map(s => ({name: `Style: ${s}`, value: s})), ...categories.map(s => ({name: `Category: ${s}`, value: s}))]
                const ret = option.value ? available.filter(s => s.value.toLowerCase().includes(option.value.toLowerCase())) : available
                return await context.interaction.respond(ret.slice(0,25))
            }
        }
    }
}