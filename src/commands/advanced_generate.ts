import { AttachmentBuilder, ButtonBuilder, ChannelType, Colors, EmbedBuilder, InteractionButtonComponentData, SlashCommandAttachmentOption, SlashCommandBooleanOption, SlashCommandBuilder, SlashCommandIntegerOption, SlashCommandStringOption } from "discord.js";
import { Command } from "../classes/command";
import { CommandContext } from "../classes/commandContext";
import { Config } from "../types";
import {readFileSync} from "fs"
import { AutocompleteContext } from "../classes/autocompleteContext";
import Centra from "centra";
const {buffer2webpbuffer} = require("webp-converter")
import { appendFileSync } from "fs"
import { ImageGenerationInput, ModelGenerationInputStableSamplers, ModelGenerationInputPostProcessingTypes } from "aipg_horde";
import { GenerationStable } from "../types/generation";

const config = JSON.parse(readFileSync("./config.json").toString()) as Config

const command_data = new SlashCommandBuilder()
    .setName("advanced_generate")
    .setDMPermission(false)
    .setDescription(`Generates an image with AIPG Grid`)
    if(config.advanced_generate?.enabled) {
        command_data.addStringOption(
            new SlashCommandStringOption()
            .setName("prompt")
            .setDescription("The prompt to generate an image with")
            .setRequired(true)
        )
        if(config.advanced_generate?.user_restrictions?.allow_source_image) {
            command_data
            .addAttachmentOption(
                new SlashCommandAttachmentOption()
                .setName("source_image")
                .setDescription("The image to use as the source image; max: 3072px")
            )
            .addBooleanOption(
                new SlashCommandBooleanOption()
                .setName("keep_original_ratio")
                .setDescription("Whether to keep the aspect ratio and image size of the original image")
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_negative_prompt) {
            command_data.addStringOption(
                new SlashCommandStringOption()
                .setName("negative_prompt")
                .setDescription("The negative prompt to generate an image with")
                .setRequired(false)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_karras) {
            command_data
            .addBooleanOption(
                new SlashCommandBooleanOption()
                .setName("karras")
                .setDescription("Set to True to enable karras noise scheduling tweaks")
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_sampler) {
            command_data
            .addStringOption(
                new SlashCommandStringOption()
                .setName("sampler")
                .setDescription("The sampler to use")
                .setChoices(
                    ...Object.keys(ModelGenerationInputStableSamplers).map(k => ({name: k, value: k}))
                )
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_cfg) {
            command_data
            .addIntegerOption(
                new SlashCommandIntegerOption()
                .setName("cfg")
                .setDescription("How strictly to follow the given prompt")
                .setMinValue(config.advanced_generate?.user_restrictions.cfg?.min ?? 1)
                .setMaxValue(config.advanced_generate?.user_restrictions.cfg?.max ?? 100)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_denoise) {
            command_data
            .addIntegerOption(
                new SlashCommandIntegerOption()
                .setName("denoise")
                .setDescription("How much to denoise in %")
                .setMinValue(config.advanced_generate?.user_restrictions?.denoise?.min ?? 0)
                .setMaxValue(config.advanced_generate?.user_restrictions?.denoise?.max ?? 100)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_seed) {
            command_data
            .addStringOption(
                new SlashCommandStringOption()
                .setName("seed")
                .setDescription("The seed to use")
            )
        }
        if(config.advanced_generate?.user_restrictions?.height) {
            command_data
            .addIntegerOption(
                new SlashCommandIntegerOption()
                .setName("height")
                .setDescription("The height of the result image")
                .setMinValue(config.advanced_generate?.user_restrictions?.height?.min ?? 64)
                .setMaxValue(config.advanced_generate?.user_restrictions?.height?.max ?? 3072)
                .setAutocomplete(true)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_width) {
            command_data
            .addIntegerOption(
                new SlashCommandIntegerOption()
                .setName("width")
                .setDescription("How width of the result image")
                .setMinValue(config.advanced_generate?.user_restrictions?.width?.min ?? 64)
                .setMaxValue(config.advanced_generate?.user_restrictions?.width?.max ?? 3072)
                .setAutocomplete(true)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_gfpgan) {
            command_data
            .addBooleanOption(
                new SlashCommandBooleanOption()
                .setName("use_gfpgan")
                .setDescription("Whether to use GFPGAN post processing")
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_real_esrgan) {
            command_data
            .addBooleanOption(
                new SlashCommandBooleanOption()
                .setName("use_real_esrgan")
                .setDescription("Whether to use RealESRGAN_x4plus post processing")
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_seed_variation) {
            command_data
            .addIntegerOption(
                new SlashCommandIntegerOption()
                .setName("seed_variation")
                .setDescription("(amount needs to be provided) increment for the seed on each image")
                .setMinValue(1)
                .setMaxValue(1000)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_tiling) {
            command_data
            .addBooleanOption(
                new SlashCommandBooleanOption()
                .setName("tiling")
                .setDescription("Makes generated image have a seemless transition when stitched together")
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_steps) {
            command_data
            .addIntegerOption(
                new SlashCommandIntegerOption()
                .setName("steps")
                .setDescription("How many steps to go though while creating the image")
                .setMinValue(config.advanced_generate?.user_restrictions?.steps?.min ?? 1)
                .setMaxValue(config.advanced_generate?.user_restrictions?.steps?.max ?? 500)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_amount) {
            command_data
            .addIntegerOption(
                new SlashCommandIntegerOption()
                .setName("amount")
                .setDescription("How many images to generate")
                .setMinValue(1)
                .setMaxValue(config.advanced_generate?.user_restrictions?.amount?.max ?? 4)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_style) {
            command_data.addStringOption(
                new SlashCommandStringOption()
                .setName("style")
                .setDescription("The style for this image")
                .setRequired(false)
                .setAutocomplete(true)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_models) {
            command_data
            .addStringOption(
                new SlashCommandStringOption()
                .setName("model")
                .setDescription("The model to use for this generation")
                .setAutocomplete(true)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_sharing) {
            command_data
            .addBooleanOption(
                new SlashCommandBooleanOption()
                .setName("share_result")
                .setDescription("Whether to share your generation result for research")
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_lora) {
            command_data
            .addStringOption(
                new SlashCommandStringOption()
                .setName("lora")
                .setDescription("The LORA, LoCon or LyCORIS to use for this request")
                .setAutocomplete(true)
            )
        }
        if(config.advanced_generate?.user_restrictions?.allow_tis) {
            command_data
            .addStringOption(
                new SlashCommandStringOption()
                .setName("textual_inversion")
                .setDescription("The textual inversions IDs to apply separated with comma")
            )
        }
        if(config.advanced_generate.user_restrictions?.allow_hires_fix) {
            command_data
            .addBooleanOption(
                new SlashCommandBooleanOption()
                .setName("hires_fix")
                .setDescription("Whether to apply hires_fix to the generation")
            )
        }
    }


    // 21 out of 25 options used

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
            name: "advanced_generate",
            command_data: command_data.toJSON(),
            staff_only: false,
        })
    }

    override async run(ctx: CommandContext): Promise<any> {
        if(!ctx.client.config.advanced_generate?.enabled) return ctx.error({error: "Generation is disabled."})

        await ctx.interaction.deferReply({})
        let prompt = ctx.interaction.options.getString("prompt", true)
        
        // Reload per-channel overrides
        if (ctx.client.config.channel_overrides?.[ctx.interaction.channelId!]) {
            await ctx.client.loadHordeStyles(ctx.interaction.channelId!);
            await ctx.client.loadHordeStyleCategories(ctx.interaction.channelId!);
        }
        const channelCfg = ctx.client.config.channel_overrides?.[ctx.interaction.channelId!];

        const style_raw = ctx.interaction.options.getString("style") ?? ctx.client.config.advanced_generate?.default?.style
        // Enforce channel allowlist for styles/categories
        if (channelCfg && (channelCfg.allowed_styles || channelCfg.allowed_categories) && style_raw) {
            const isAllowedStyle = channelCfg.allowed_styles?.includes(style_raw.toLowerCase());
            const isAllowedCategory = channelCfg.allowed_categories?.includes(style_raw.toLowerCase());
            if (!isAllowedStyle && !isAllowedCategory) {
                return ctx.error({error: `This channel only allows styles/categories: ${(channelCfg.allowed_styles||[]).concat(channelCfg.allowed_categories||[]).map(s=>`\`${s}\``).join(', ')}`});
            }
        }
        const style = ctx.client.horde_styles[style_raw?.toLowerCase() ?? ""] || {prompt: "{p}{np}"}

        const negative_prompt = ctx.interaction.options.getString("negative_prompt") ?? ""
        const sampler = (ctx.interaction.options.getString("sampler") ?? ctx.client.config.advanced_generate?.default?.sampler ?? ModelGenerationInputStableSamplers.k_euler) as any
        const cfg = ctx.interaction.options.getInteger("cfg") ?? style.cfg_scale ?? ctx.client.config.advanced_generate?.default?.cfg ?? 7.5
        const denoise = (ctx.interaction.options.getInteger("denoise") ?? ctx.client.config.advanced_generate?.default?.denoise ?? 50)/100
        const seed = ctx.interaction.options.getString("seed")
        const gfpgan = !!(ctx.interaction.options.getBoolean("use_gfpgan") ?? ctx.client.config.advanced_generate?.default?.gfpgan)
        const real_esrgan = !!(ctx.interaction.options.getBoolean("use_real_esrgan") ?? ctx.client.config.advanced_generate?.default?.real_esrgan)
        const seed_variation = ctx.interaction.options.getInteger("seed_variation")
        const tiling = !!(ctx.interaction.options.getBoolean("tiling") ?? ctx.client.config.advanced_generate?.default?.tiling)
        const steps = ctx.interaction.options.getInteger("steps") ?? style.steps ?? ctx.client.config.advanced_generate?.default?.steps ?? 30
        const amount = ctx.interaction.options.getInteger("amount") ?? ctx.client.config.advanced_generate?.default?.amount ?? 1
        let height = ctx.interaction.options.getInteger("height") ?? style?.height ?? ctx.client.config.advanced_generate?.default?.resolution?.height ?? 512
        let width = ctx.interaction.options.getInteger("width") ?? style?.width ?? ctx.client.config.advanced_generate?.default?.resolution?.width ?? 512
        const model = ctx.interaction.options.getString("model") ?? style?.model ?? ctx.client.config.advanced_generate?.default?.model
        const keep_ratio = ctx.interaction.options.getBoolean("keep_original_ratio") ?? ctx.client.config.advanced_generate?.default?.keep_original_ratio ?? true
        const karras = ctx.interaction.options.getBoolean("karras") ?? ctx.client.config.advanced_generate?.default?.karras ?? false
        const share_result = ctx.interaction.options.getBoolean("share_result") ?? ctx.client.config.advanced_generate?.default?.share
        const lora_id = ctx.interaction.options.getString("lora")
        const ti_raw = ctx.interaction.options.getString("textual_inversion") ?? ctx.client.config.advanced_generate.default?.tis
        const hires_fix = ctx.interaction.options.getBoolean("hires_fix") ?? ctx.client.config.advanced_generate.default?.hires_fix ?? false
        let img = ctx.interaction.options.getAttachment("source_image")

        const user_token = await ctx.client.getUserToken(ctx.interaction.user.id, ctx.database)
        const ai_horde_user = await ctx.ai_horde_manager.findUser({token: user_token  || ctx.client.config?.default_token || "0000000000"}).catch((e) => ctx.client.config.advanced?.dev ? console.error(e) : null);
        const can_bypass = ctx.client.config.advanced_generate?.source_image?.whitelist?.bypass_checks && ctx.client.config.advanced_generate?.source_image?.whitelist?.user_ids?.includes(ctx.interaction.user.id)
        const party = await ctx.client.getParty(ctx.interaction.channelId, ctx.database)

        if(lora_id) {
            const lora = await ctx.client.fetchLORAByID(lora_id, ctx.client.config.advanced_generate.user_restrictions?.allow_nsfw)
            if(ctx.client.config.advanced?.dev) console.log(lora)
            if(!lora) return ctx.error({error: "A LORA ID from https://civitai.com/ has to be given. LoCon and LyCORIS are also acceptable.", codeblock: false})
            if(lora.type !== "LORA" && lora.type !== "LoCon") return ctx.error({error: "The given ID is not a LORA, LoCon or LyCORIS"})
            if(lora.modelVersions[0]?.files[0]?.sizeKB && lora.modelVersions[0]?.files[0]?.sizeKB > 225280 && !ctx.client.horde_curated_loras?.includes(lora.id)) return ctx.error({error: "The given LORA, LoCon or LyCORIS is larger than 220mb"})
            // Enforce per-channel allow/deny for LORAs by numeric ID
            if (channelCfg) {
                if (channelCfg.allowed_loras && !channelCfg.allowed_loras.includes(lora.id)) {
                    return ctx.error({error: `This channel only allows specific LORAs.`});
                }
                if (channelCfg.disallowed_loras && channelCfg.disallowed_loras.includes(lora.id)) {
                    return ctx.error({error: `This LORA is not permitted in this channel.`});
                }
            }
        }

        if(party?.channel_id) return ctx.error({error: `You can only use ${await ctx.client.getSlashCommandTag("generate")} in parties`, codeblock: false})
        if(ctx.client.config.advanced_generate?.require_login && !user_token) return ctx.error({error: `You are required to ${await ctx.client.getSlashCommandTag("login")} to use ${await ctx.client.getSlashCommandTag("advanced_generate")}`, codeblock: false})
        if(ctx.client.config.advanced_generate?.blacklist_regex && new RegExp(ctx.client.config.advanced_generate.blacklist_regex, "i").test(prompt.replace(/[\u0300-\u036f]/g, ""))) return ctx.error({error: "Your prompt included one or more blacklisted words"})
        if(ctx.client.config.advanced_generate?.blacklisted_words?.some(w => prompt.toLowerCase().includes(w.toLowerCase()))) return ctx.error({error: "Your prompt included one or more blacklisted words"})
        if(height % 64 !== 0) return ctx.error({error: "Height must be a multiple of 64"})
        if(width % 64 !== 0) return ctx.error({error: "Width must be a multiple of 64"})
        if(model && ctx.client.config.advanced_generate?.blacklisted_models?.includes(model)) return ctx.error({error: "This model is blacklisted"})
        if(model && model !== "YOLO" && !(await ctx.ai_horde_manager.getModels()).find(m => m.name === model)) return ctx.error({error: "Unable to find this model"})
        if(img && !can_bypass && !user_token) return ctx.error({error: `You need to ${await ctx.client.getSlashCommandTag("login")} and agree to our ${await ctx.client.getSlashCommandTag("terms")} first before being able to use a source image`, codeblock: false})
        if(img && ctx.client.config.advanced_generate?.source_image?.require_ai_horde_account_oauth_connection && (!ai_horde_user || ai_horde_user.pseudonymous)) return ctx.error({error: "Your ai horde account needs to be created with a oauth connection"})
        if(img && !can_bypass && ctx.client.config.advanced_generate?.source_image?.require_nsfw_channel && (ctx.interaction.channel?.type !== ChannelType.GuildText || !ctx.interaction.channel.nsfw)) return ctx.error({error: "This channel needs to be marked as age restricted to use a source image"})
        if(img && !img.contentType?.startsWith("image/")) return ctx.error({error: "Source Image input must be a image"})
        if(img && ((img.height ?? 0) > 3072 || (img.width ?? 0) > 3072)) return ctx.error({error: "Source Image input too large (max. 3072 x 3072)"})
        if(img && !can_bypass && !ctx.client.config?.advanced_generate?.source_image?.allow_non_webp && img.contentType !== "image/webp") return ctx.error({error: "You can only upload webp as the source image"})
        if(img && ctx.client.config.advanced_generate?.source_image?.whitelist?.only_allow_whitelist && !ctx.client.config.advanced_generate?.source_image?.whitelist?.user_ids?.includes(ctx.interaction.user.id)) return ctx.error({error: "You are not whitelisted to use a source image"})

        if(keep_ratio && img?.width && img?.height) {
            const ratio = img?.width/img?.height
            const largest = ratio >= 1 ? img.width : img.height
            const m = largest > 3072 ? 3072/largest : 1
            const mod_height = Math.round(img.height*m)
            const mod_width = Math.round(img.width*m)
            height = mod_height%64 <= 32 ? mod_height-(mod_height%64) : mod_height+(64-(mod_height%64))
            width = mod_width%64 <= 32 ? mod_width-(mod_width%64) : mod_width+(64-(mod_width%64))
        }

        height = ctx.interaction.options.getInteger("height") ?? height
        width = ctx.interaction.options.getInteger("width") ?? width

        if(ctx.client.config.advanced_generate.convert_a1111_weight_to_horde_weight) {
            prompt = prompt.replace(/(\(+|\[+)|(?<!:\d(\.\d+)?)(\)+|]+)/g, (w) => {
                if(w.startsWith("(") || w.startsWith("[")) return "("
                if(w.startsWith(":")) return w;
                const weight = 1 + (0.1 * (w.startsWith(")") ? 1 : -1) * w.length)
                return `:${weight.toFixed(1)})`
            })
        }

        const tis = ti_raw?.split(",").map(ti => ti.trim()).filter(v => v).map(ti => ({name: ti, inject_ti: prompt.toLowerCase().indexOf("embedding:") === -1 ? "prompt" as const : undefined}))
        
        prompt = style.prompt.slice().replace("{p}", prompt)
        prompt = prompt.replace("{np}", !negative_prompt || prompt.includes("###") ? negative_prompt : `###${negative_prompt}`)
        
        if(party && party.wordlist.length) {
            if(ctx.client.config.advanced?.dev) {
                console.log(party.wordlist)
            }
            if(!party.wordlist.every(w => prompt.toLowerCase().includes(w))) return ctx.error({error: "Your prompt does not include all required words"})
        }
        
        if(ctx.client.config.advanced?.dev) {
            console.log(img?.height)
            console.log(img?.width)
            console.log(height)
            console.log(width)
        }

        const token = party?.shared_key || user_token || ctx.client.config.default_token || "0000000000"
        let img_data: Buffer | undefined
        if(img) {
            let img_data_res = await Centra(img.url, "GET")
                .send()
            
            if(img.contentType === "image/webp") img_data = img_data_res.body
            else {
                img_data = await buffer2webpbuffer(img_data_res.body, img.contentType?.replace("image/",""),"-q 80").catch((e: Error) => ctx.client.config.advanced?.dev ? console.error(e) : null)
                if(!img_data) return ctx.error({
                    error: "Image format conversion to webp failed"
                })
            }
            if(ctx.client.config.advanced?.dev) {
                console.log("Source image data length:", img_data?.length)
                console.log("Source image data preview:", img_data?.toString("base64").substring(0, 100))
            }
        }

        const post_processing = [] as (typeof ModelGenerationInputPostProcessingTypes[keyof typeof ModelGenerationInputPostProcessingTypes])[]

        if(gfpgan) post_processing.push(ModelGenerationInputPostProcessingTypes.GFPGAN)
        if(real_esrgan) post_processing.push(ModelGenerationInputPostProcessingTypes.RealESRGAN_x4plus)

        let generationParams = {
            sampler_name: sampler,
            cfg_scale: cfg,
            seed: seed ?? undefined,
            height,
            width,
            seed_variation: seed_variation ?? undefined,
            post_processing,
            tiling,
            steps,
            n: amount,
            denoising_strength: denoise,
            karras,
            loras: lora_id ? [{name: lora_id}] : undefined,
            tis,
            hires_fix
        };
        
        // Apply model reference constraints if a model is specified
        if (model && model !== "YOLO") {
            try {
                // Log that we're applying model reference constraints
                if (ctx.client.config.advanced?.dev) {
                    console.log(`Applying model reference constraints for model: ${model}`);
                }
                
                // Apply the constraints from the model reference
                generationParams = await ctx.client.applyModelReferenceConstraints(model, generationParams);
                
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
        
        const generation_data: ImageGenerationInput = {
            prompt,
            params: generationParams,
            replacement_filter: ctx.client.config.advanced_generate.replacement_filter,
            nsfw: ctx.client.config.advanced_generate?.user_restrictions?.allow_nsfw,
            censor_nsfw: ctx.client.config.advanced_generate?.censor_nsfw,
            trusted_workers: ctx.client.config.advanced_generate?.trusted_workers,
            workers: ctx.client.config.advanced_generate?.workers,
            models: !model ? undefined : model === "YOLO" ? [] : [model],
            source_image: img_data ? img_data.toString("base64") : undefined,
            source_processing: img_data ? "img2img" : undefined,
            r2: true, // Always use R2 for output, input image is handled separately
            shared: share_result
        }
        
        if(ctx.client.config.advanced?.dev) {
            console.log("Generation data source_image length:", generation_data.source_image?.length)
            console.log("Generation data source_image preview:", generation_data.source_image?.substring(0, 100))
        }

        if(token === "0000000000" && ((generation_data.params?.width ?? 512) > 1024 || (generation_data.params?.height ?? 512) > 1024 || (generation_data.params?.steps ?? 512) > 100)) return ctx.error({error: "You need to be logged in to generate images with a size over 1024*1024 or more than 100 steps"})

        if(ctx.client.config.advanced?.dev) {
            console.log(token)
            console.log(generation_data)
        }

        const generation_start = await ctx.ai_horde_manager.postAsyncImageGenerate(generation_data, {token})
        .catch((e) => {
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
**ETA:** <t:${Math.floor(Date.now()/1000)+(start_status?.wait_time ?? 0)}:R>`
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
            customId: `regenerate_${ctx.interaction.user.id}_${prompt}`,
            style: 1,
            type: 2,
            emoji: { name: "🎲" }
        }

        const initialComponents = [{type: 1, components: [btn.toJSON()]}]

        ctx.interaction.editReply({
            content: "",
            embeds: token === (ctx.client.config.default_token ?? "0000000000") ? [embed.toJSON(), login_embed.toJSON()] : [embed.toJSON()],
            components: initialComponents
        })

        const message = await ctx.interaction.fetchReply()

        let error_timeout = Date.now()*2
        let prev_left = 1

        let done = false

        if(ctx.client.config.advanced_generate?.improve_loading_time && (start_status?.wait_time ?? 0) <= 3) {
            // wait before starting the loop so that the first iteration can already pick up the result
            const pre_test = await new Promise((resolve) => setTimeout(async () => {resolve(await getCheckAndDisplayResult().catch(console.error))},((start_status?.wait_time ?? 0) + 0.1) * 1000))
            if(!pre_test) return;
        }
        
        const inter = setInterval(async () => {
            const d = await getCheckAndDisplayResult().catch(console.error)
            if(!d) return;
            const {status, horde_data} = d
            if(ctx.client.config.advanced_generate?.improve_loading_time && (status.wait_time ?? 0) <= 3) {
                // try to display result faster
                setTimeout(async () => {await getCheckAndDisplayResult().catch(console.error)},((start_status?.wait_time ?? 0) + 0.1) * 1000)
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

            // Using the same emoji from outer scope for consistency
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
**ETA:** <t:${Math.floor(Date.now()/1000)+(status?.wait_time ?? 0)}:R>`
            })

            if(ctx.client.config.advanced?.dev) embed.setFooter({text: generation_start?.id ?? "Unknown ID"})

            let embeds = token === (ctx.client.config.default_token ?? "0000000000") ? [embed.toJSON(), login_embed.toJSON()] : [embed.toJSON()]

            if((status?.wait_time ?? 0) > 60 * 2) {
                embeds.push(new EmbedBuilder({
                    color: Colors.Yellow,
                    title: "AI Horde currently is under high load",
                    description: "You can contribute your GPUs processing power to the project.\nRead more: https://https://aipowergrid.io/"
                }).toJSON())
            }

            return message.edit({
                content: "",
                embeds,
                components: initialComponents
            })
        }, 1000 * (ctx.client.config?.advanced_generate?.update_generation_status_interval_seconds || 5))

        async function getCheckAndDisplayResult(precheck?: boolean) {
            if(done) return;
            const status = await ctx.ai_horde_manager.getImageGenerationCheck(generation_start!.id!, {force: true}).catch((e) => ctx.client.config.advanced?.dev ? console.error(e) : null);
            done = !!status?.done
            const horde_data = await ctx.ai_horde_manager.getPerformance()
            if(!status || (status as any).faulted) {
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

                if(ctx.client.config.advanced?.result_structure_v2_enabled ?? true) {
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
                        try {
                            if (!g.img || typeof g.img !== 'string') {
                                console.error(`Invalid media data received: ${g.img}`);
                                return {attachment: null, generation: g};
                            }
                            
                            // Determine if this is a video based on generation data or response type
                            const isVideo = g.media_type === 'video' || g.form === 'video' || g.type === 'video' || isVideoResponse || hasVideoFilename;
                            const fileExtension = isVideo ? '.mp4' : '.webp';
                            const mediaType = isVideo ? 'video' : 'image';
                            
                            console.log(`Processing ${mediaType} data for generation ${g.id}`);
                            
                            // Log the media data type and check if it's a valid URL
                            let isValidUrl = false;
                            try {
                                // Just check if the URL is valid, don't actually fetch it yet
                                new URL(g.img);
                                isValidUrl = true;
                                console.log(`${mediaType} data appears to be a valid URL`);
                            } catch (e) {
                                console.log(`${mediaType} data is not a valid URL, treating as Base64`);
                                isValidUrl = false;
                            }
                            
                            let attachment = null;
                            if (g.censored) {
                                return {attachment: null, generation: g};
                            } else if (g.img.startsWith('data:')) {
                                // Standard Base64 media with data: prefix
                                console.log(`Processing as Base64 ${mediaType} with data: prefix`);
                                const parts = g.img.split(',');
                                if (parts.length > 1) {
                                    const buffer = Buffer.from(parts[1] as string, 'base64');
                                    attachment = new AttachmentBuilder(buffer, {name: `${g.id}${fileExtension}`});
                                } else {
                                    throw new Error(`Invalid Base64 format with data: prefix`);
                                }
                            } else if (!isValidUrl) {
                                // Raw Base64 media without data: prefix
                                console.log(`Processing as raw Base64 ${mediaType} without data: prefix`);
                                try {
                                    const buffer = Buffer.from(g.img, 'base64');
                                    attachment = new AttachmentBuilder(buffer, {name: `${g.id}${fileExtension}`});
                                } catch (base64Error) {
                                    console.error(`Failed to process as raw Base64:`, base64Error);
                                }
                            } else {
                                // Valid URL media
                                console.log(`Fetching ${mediaType} URL: ${g.img}`);
                                try {
                                    const req = await Centra(g.img, "GET").timeout(30000).send();
                                    attachment = new AttachmentBuilder(req.body, {name: `${g.id}${fileExtension}`});
                                } catch (urlError) {
                                    console.error(`Failed to fetch ${mediaType} URL:`, urlError);
                                    // Try with fetch as fallback
                                    try {
                                        console.log('Trying fetch as fallback...');
                                        const response = await fetch(g.img, { 
                                            signal: AbortSignal.timeout(30000) 
                                        });
                                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                                        const arrayBuffer = await response.arrayBuffer();
                                        attachment = new AttachmentBuilder(Buffer.from(arrayBuffer), {name: `${g.id}${fileExtension}`});
                                    } catch (fetchError) {
                                        console.error('Fetch fallback also failed:', fetchError);
                                        // If URL fetch fails, try as base64 as a last resort
                                        if (g.img.length > 100) {
                                            console.log(`URL fetch failed, trying as Base64 as last resort`);
                                            try {
                                                const buffer = Buffer.from(g.img, 'base64');
                                                attachment = new AttachmentBuilder(buffer, {name: `${g.id}${fileExtension}`});
                                            } catch (fallbackError) {
                                                console.error('Fallback to Base64 also failed:', fallbackError);
                                            }
                                        }
                                    }
                                }
                            }
                            
                            return {attachment, generation: g};
                        } catch (error: unknown) {
                            console.error(`Error processing media: ${error instanceof Error ? error.message : String(error)}`);
                            return {attachment: null, generation: g};
                        }
                    }) || [];
                    if(!precheck) clearInterval(inter);

                    const image_map = await Promise.all(image_map_r);
                    const files = image_map.filter(i => i.attachment !== null).map(i => i.attachment!) as AttachmentBuilder[];
                    if(img_data && image_map.length < 10) files.push(new AttachmentBuilder(img_data, {name: "original.webp"}));
                    let components = [{type: 1, components: [regenerate_btn, delete_btn]}]
                    
                    // Determine content type for display
                    const contentType = (isVideoResponse || hasVideoFilename) ? "video" : "image";
                    const contentTypePlural = (isVideoResponse || hasVideoFilename) ? "videos" : "images";
                    
                    const embeds = [
                        new EmbedBuilder({
                            title: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} Generation Finished`,
                            description: `**Prompt** ${prompt}\n**Style** ${style_raw}\n**Credits Consumed** \`${images.kudos}\`${image_map.length !== amount ? `\nCensored ${contentTypePlural} are not displayed` : ""}`,
                            color: Colors.Blue,
                            footer: {text: `Generation ID ${generation_start!.id}`},
                            thumbnail: img_data && image_map.length < 10 ? {url: "attachment://original.webp"} : img_data ? {url: img!.url} : undefined
                        })
                    ]

                    if(ctx.client.config.advanced_generate?.user_restrictions?.allow_rating && (generation_data.shared ?? true) && files.length === 1) {
                        components = [...generateButtons(generation_start!.id!), ...components] as { type: number; components: Array<any> }[]
                    }
                    await message.edit({content: null, components, embeds, files});
                    return null
                }

                const image_map_r = images.generations?.map(async (g, i) => {
                    try {
                        if (!g.img || typeof g.img !== 'string') {
                            console.error(`Invalid media data received: ${g.img}`);
                            return {
                                attachment: null,
                                embed: new EmbedBuilder({
                                    title: `Media ${i+1} (Error)`,
                                    color: Colors.Red,
                                    description: `Failed to load media. ${!i ? `\n**Prompt:** ${prompt}\n**Style:** ${style_raw}\n**Credits Consumed** \`${images.kudos}\`` : ""}`,
                                })
                            };
                        }
                        
                        // Determine if this is a video based on generation data
                        const generation = g as GenerationStable;
                        const isVideo = generation.media_type === 'video' || generation.form === 'video' || generation.type === 'video';
                        const fileExtension = isVideo ? '.mp4' : '.webp';
                        const mediaType = isVideo ? 'video' : 'image';
                        const contentType = isVideo ? 'Video' : 'Image';
                        
                        console.log(`Processing ${mediaType} data for generation ${g.id}`);
                        
                        // Check if it's a valid URL
                        let isValidUrl = false;
                        try {
                            new URL(g.img);
                            isValidUrl = true;
                            console.log(`${mediaType} data appears to be a valid URL`);
                        } catch (e) {
                            console.log(`${mediaType} data is not a valid URL, treating as Base64`);
                            isValidUrl = false;
                        }
                        
                        let attachment = null;
                        if (g.img.startsWith('data:')) {
                            // Standard Base64 media with data: prefix
                            console.log(`Processing as Base64 ${mediaType} with data: prefix`);
                            try {
                                const parts = g.img.split(',');
                                if (parts.length > 1) {
                                    const buffer = Buffer.from(parts[1] as string, 'base64');
                                    attachment = new AttachmentBuilder(buffer, {name: `${g.seed ?? `${mediaType.toLowerCase()}${i}`}${fileExtension}`});
                                } else {
                                    throw new Error(`Invalid Base64 format with data: prefix`);
                                }
                            } catch (base64Error) {
                                console.error(`Failed to process Base64 ${mediaType} with prefix:`, base64Error);
                                throw base64Error;
                            }
                        } else if (!isValidUrl) {
                            // Raw Base64 media without data: prefix
                            console.log(`Processing as raw Base64 ${mediaType} without data: prefix`);
                            try {
                                const buffer = Buffer.from(g.img, 'base64');
                                attachment = new AttachmentBuilder(buffer, {name: `${g.seed ?? `${mediaType.toLowerCase()}${i}`}${fileExtension}`});
                            } catch (base64Error) {
                                console.error(`Failed to process as raw Base64:`, base64Error);
                                throw base64Error;
                            }
                        } else {
                            // Valid URL media
                            console.log(`Fetching ${mediaType} URL: ${g.img}`);
                            try {
                                const req = await Centra(g.img, "get").send();
                                if(ctx.client.config.advanced?.dev) console.log(req);
                                attachment = new AttachmentBuilder(req.body, {name: `${g.seed ?? `${mediaType.toLowerCase()}${i}`}${fileExtension}`});
                            } catch (urlError) {
                                console.error(`Failed to fetch ${mediaType} URL:`, urlError);
                                // If URL fetch fails, try as base64 as a last resort
                                if (g.img.length > 100) {
                                    console.log(`URL fetch failed, trying as Base64 as last resort`);
                                    try {
                                        const buffer = Buffer.from(g.img, 'base64');
                                        attachment = new AttachmentBuilder(buffer, {name: `${g.seed ?? `${mediaType.toLowerCase()}${i}`}${fileExtension}`});
                                    } catch (fallbackError) {
                                        console.error('Fallback to Base64 also failed');
                                        throw urlError;
                                    }
                                } else {
                                    throw urlError;
                                }
                            }
                        }
                        
                        const embed = new EmbedBuilder({
                            title: `${contentType} ${i+1}`,
                            image: {url: `attachment://${g.seed ?? `${mediaType.toLowerCase()}${i}`}${fileExtension}`},
                            color: Colors.Blue,
                            description: `**Seed:** ${g.seed}\n**Model:** ${g.model}\n**Generated by** ${g.worker_name}\n(\`${g.worker_id}\`)${!i ? `\n**Prompt:** ${prompt}\n**Total Kudos Cost:** \`${images.kudos}\`` : ""}${ctx.client.config.advanced?.dev ? `\n\n**${contentType} ID** ${g.id}` : ""}`,
                        });
                        if(img_data) embed.setThumbnail(`attachment://original.webp`);
                        return {attachment, embed};
                    } catch (error: unknown) {
                        console.error(`Error processing media: ${error instanceof Error ? error.message : String(error)}`);
                        return {
                            attachment: null,
                            embed: new EmbedBuilder({
                                title: `Media ${i+1} (Error)`,
                                color: Colors.Red,
                                description: `Failed to load media. ${!i ? `\n**Prompt:** ${prompt}\n**Style:** ${style_raw}\n**Credits Consumed** \`${images.kudos}\`` : ""}`,
                            })
                        };
                    }
                }) || [];
                if(!precheck) clearInterval(inter);

                const image_map = await Promise.all(image_map_r);
                const embeds = image_map.map(i => i.embed);
                if(ctx.client.config.advanced?.dev) embeds.at(-1)?.setFooter({text: `Generation ID ${generation_start!.id}`});
                const files = image_map.filter(i => i.attachment !== null).map(i => i.attachment!) as AttachmentBuilder[];
                if(img_data) files.push(new AttachmentBuilder(img_data, {name: "original.webp"}));
                let components = [{type: 1, components: [regenerate_btn, delete_btn]}]
                if(ctx.client.config.advanced_generate?.user_restrictions?.allow_rating && (generation_data.shared ?? true) && files.length === 1) {
                    components = [...generateButtons(generation_start!.id!), ...components] as { type: number; components: Array<any> }[]
                }
                await message.edit({content: `Image generation finished\n\n**A new view is available, check it out by enabling \`result_structure_v2_enabled\` in the bots config**`, components, embeds, files}).catch(console.error);
                return null
            } 
        }
    }

    override async autocomplete(context: AutocompleteContext): Promise<any> {
        const option = context.interaction.options.getFocused(true)
        switch(option.name) {
            case "model": {
                const models = await context.ai_horde_manager.getModels()
                if(context.client.config.advanced?.dev) console.log(models)
                const available = [{name: "Any Model", value: "YOLO"}, ...models.sort((a, b) => b.performance!-a.performance!).map(m => ({name: `${m.name} | Workers: ${m.count} | Performance: ${m.performance} | Queued: ${m.queued}`, value: m.name!}))].filter(v => !context.client.config.advanced_generate?.blacklisted_models?.includes(v.value)).filter(v => !option.value || v.name.toLowerCase().includes(option.value.toLowerCase()))
                return await context.interaction.respond(available.filter(o => o.name?.toLowerCase().includes(option.value.toLowerCase())).slice(0,25))
            }
            case "width":
            case "height": {
                const steps = Array.from({length: 3072/64}).map((_, i) => ({name: `${(i+1)*64}px${(i+1)*64 > 1024 ? " (Requires Tokens upfront)" : ""}`, value: (i+1)*64})).filter(v => v.value >= (context.client.config.advanced_generate?.user_restrictions?.height?.min ?? 64) && v.value <= (context.client.config.advanced_generate?.user_restrictions?.height?.max ?? 3072))
                const inp = context.interaction.options.getFocused(true)
                return await context.interaction.respond(steps.filter((v) => !inp.value || v.name.includes(inp.value)).slice(0,25))
            }
            case "style": {
                const channelCfg = context.client.config.channel_overrides?.[context.interaction.channelId!]
                const styles = Object.keys(context.client.horde_styles).filter(s => !channelCfg?.allowed_styles || channelCfg.allowed_styles.includes(s))
                const categories = Object.keys(context.client.horde_style_categories).filter(c => !channelCfg?.allowed_categories || channelCfg.allowed_categories.includes(c))
                const available = [...styles.map(s => ({name: `Style: ${s}`, value: s})), ...categories.map(c => ({name: `Category: ${c}`, value: c}))]
                const ret = option.value ? available.filter(s => s.name.toLowerCase().includes(option.value.toLowerCase())) : available
                return await context.interaction.respond(ret.slice(0,25))
            }
            case "lora": {
                const ret: {name: string, value: string}[] = []
                const channelCfg = context.client.config.channel_overrides?.[context.interaction.channelId!]

                if(!isNaN(Number(option.value)) && option.value) {
                    const lora_by_id = await context.client.fetchLORAByID(option.value, context.client.config.advanced_generate?.user_restrictions?.allow_nsfw)
                    if(lora_by_id?.name && (lora_by_id?.modelVersions[0]?.files[0]?.sizeKB && (lora_by_id?.modelVersions[0]?.files[0]?.sizeKB <= 225280 || context.client.horde_curated_loras?.includes(lora_by_id.id)))) {
                        // Enforce per-channel allow/deny
                        const allowed = !channelCfg?.allowed_loras || channelCfg.allowed_loras.includes(lora_by_id.id)
                        const denied = !!channelCfg?.disallowed_loras && channelCfg.disallowed_loras.includes(lora_by_id.id)
                        if (allowed && !denied) {
                            ret.push({name: lora_by_id.name, value: lora_by_id.id.toString()})
                        }
                    }
                } else {
                    const loras = await context.client.fetchLORAs(option.value, 10, context.client.config.advanced_generate?.user_restrictions?.allow_nsfw)
                    ret.push(
                        ...loras.items
                            .filter(l => l?.name && l?.id.toString())
                            .filter(l => !channelCfg?.allowed_loras || channelCfg.allowed_loras.includes(l.id))
                            .filter(l => !channelCfg?.disallowed_loras || !channelCfg.disallowed_loras.includes(l.id))
                            .map(l => ({ name: l!.name, value: l!.id.toString() }))
                    )
                }

                return await context.interaction.respond(ret.slice(0,25)).catch(() => null)
            }
        }
    }
}

