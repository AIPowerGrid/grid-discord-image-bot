import {readFileSync} from "fs"
import {ActivityType, ApplicationCommandType, InteractionType, PartialMessageReaction, Partials, PartialUser, PresenceUpdateStatus} from "discord.js";
import { AIHordeClient } from "./classes/client";
import { handleCommands } from "./handlers/commandHandler";
import { handleComponents } from "./handlers/componentHandler";
import { handleModals } from "./handlers/modalHandler";
import { Pool } from "pg"
import { handleAutocomplete } from "./handlers/autocompleteHandler";
import { AIHorde } from "aipg_horde";
import { handleContexts } from "./handlers/contextHandler";
import {existsSync, mkdirSync} from "fs"
import { handleMessageReact } from "./handlers/messageReact";

const RE_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/

// Try to find .env file in multiple locations
const envPaths = [
    `${process.cwd()}/.env`,    // For local development and Docker
    './.env',                   // Relative path fallback
    `${process.cwd()}/src/.env`, // Alternative Docker location
    './src/.env'                // Alternative relative path
];

let envContent = '';
let envLoaded = false;

for (const envPath of envPaths) {
    try {
        envContent = readFileSync(envPath, 'utf8');
        console.log(`Loaded .env from: ${envPath}`);
        envLoaded = true;
        break;
    } catch (error) {
        // Continue to next path
    }
}

if (envLoaded) {
    // Parse .env file if found
    for (const line of envContent.split(/[\r\n]/)) {
        const [, key, value] = line.match(RE_INI_KEY_VAL) || []
        if (!key) continue

        process.env[key] = value?.trim() || ""
    }
} else {
    // No .env file found - this is normal in containerized deployments
    console.log('No .env file found - using environment variables directly (normal for Docker/container deployments)');
    
    // Validate that required environment variables are set
    const requiredEnvVars = ['DISCORD_TOKEN'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.error('Missing required environment variables:', missingVars);
        console.error('Please set these environment variables in your deployment platform');
        process.exit(1);
    }
}

let connection: Pool | undefined


const client = new AIHordeClient({
    intents: ["Guilds", "GuildMessageReactions", "GuildMessages", "MessageContent"],
    partials: [Partials.Reaction, Partials.Message]
})

if(client.config.advanced?.encrypt_token && !process.env["ENCRYPTION_KEY"]?.length)
    throw new Error("Either give a valid encryption key (you can generate one with 'npm run generate-key') or disable token encryption in your config.json file.")

if(client.config.use_database !== false) {
    connection = new Pool({
        user: process.env["DB_USERNAME"],
        host: process.env["DB_IP"],
        database: process.env["DB_NAME"],
        password: process.env["DB_PASSWORD"],
        port: Number(process.env["DB_PORT"]),
    })
    
    connection.connect().then(async () => {
        await connection!.query("CREATE TABLE IF NOT EXISTS user_tokens (index SERIAL, id VARCHAR(100) PRIMARY KEY, token VARCHAR(100) NOT NULL, horde_id int NOT NULL DEFAULT 0)")
        await connection!.query("CREATE TABLE IF NOT EXISTS parties (index SERIAL, channel_id VARCHAR(100) PRIMARY KEY, guild_id VARCHAR(100) NOT NULL, creator_id VARCHAR(100) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ends_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, style VARCHAR(1000) NOT NULL, award INT NOT NULL DEFAULT 1, recurring BOOLEAN NOT NULL DEFAULT false, users VARCHAR(100)[] NOT NULL DEFAULT '{}', shared_key VARCHAR(100), wordlist text[] NOT NULL DEFAULT '{}')")
        await connection!.query("CREATE TABLE IF NOT EXISTS pending_kudos (index SERIAL, unique_id VARCHAR(200) PRIMARY KEY, target_id VARCHAR(100) NOT NULL, from_id VARCHAR(100) NOT NULL, amount int NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    }).catch(console.error);

    setInterval(async () => {
        await connection?.query("DELETE FROM pending_kudos WHERE updated_at <= CURRENT_TIMESTAMP - interval '1 week'").catch(console.error)
    }, 1000 * 60 * 60 * 24)
}

const ai_horde_manager = new AIHorde({
    default_token: client.config.default_token,
    cache_interval: 1000,
    cache: {
        models: 1000 * 10,
        performance: 1000 * 10,
        teams: 1000 * 10
    },
    client_agent: `ZeldaFan-Discord-Bot:${client.bot_version}:https://github.com/ZeldaFan0225/AI_Horde_Discord`
})

client.login(process.env["DISCORD_TOKEN"])

if(client.config.logs?.enabled) {
    client.initLogDir()
}

if(!existsSync(`${process.cwd()}/node_modules/webp-converter/temp`)) {
    mkdirSync("./node_modules/webp-converter/temp")
}


client.on("ready", async () => {
    client.commands.loadClasses().catch(console.error)
    client.components.loadClasses().catch(console.error)
    client.contexts.loadClasses().catch(console.error)
    client.modals.loadClasses().catch(console.error)
    client.user?.setPresence({activities: [{type: ActivityType.Listening, name: "your generation requests | https://api.aipowergrid.io/"}], status: PresenceUpdateStatus.DoNotDisturb, })
    if(client.config.generate?.enabled) {
        await client.loadHordeStyles()
        await client.loadHordeStyleCategories()
        await client.loadHordeCuratedLORAs()
        setInterval(async () => {
            await client.loadHordeStyles()
            await client.loadHordeStyleCategories()
            await client.loadHordeCuratedLORAs()
        }, 1000 * 60 * 60 * 24)
    }
    console.log(`Ready`)
    await client.application?.commands.set([...client.commands.createPostBody(), ...client.contexts.createPostBody()]).catch(console.error)
    if((client.config.advanced_generate?.user_restrictions?.amount?.max ?? 4) > 10) throw new Error("More than 10 images are not supported in the bot")
    if(client.config.filter_actions?.guilds?.length && (client.config.filter_actions?.mode !== "whitelist" && client.config.filter_actions?.mode !== "blacklist")) throw new Error("The actions filter mode must be set to either whitelist, blacklist.")
    if(client.config.party?.enabled && !client.config.generate?.enabled) throw new Error("When party is enabled the /generate command also needs to be enabled")

    if(client.config.party?.enabled && connection) {
        await client.cleanUpParties(ai_horde_manager, connection)
        setInterval(async () => await client.cleanUpParties(ai_horde_manager, connection), 1000 * 60 * 5)
    }
})

if(client.config.react_to_transfer?.enabled) client.on("messageReactionAdd", async (r, u) => await handleMessageReact(r as PartialMessageReaction, u as PartialUser, client, connection, ai_horde_manager).catch(console.error))

client.on("interactionCreate", async (interaction) => {
    switch(interaction.type) {
        case InteractionType.ApplicationCommand: {
            switch(interaction.commandType) {
                case ApplicationCommandType.ChatInput: {
                    return await handleCommands(interaction, client, connection, ai_horde_manager).catch(console.error);
                }
                case ApplicationCommandType.User:
                case ApplicationCommandType.Message: {
                    return await handleContexts(interaction, client, connection, ai_horde_manager).catch(console.error);
                }
            }
        };
        case InteractionType.MessageComponent: {
			return await handleComponents(interaction, client, connection, ai_horde_manager).catch(console.error);
        };
        case InteractionType.ApplicationCommandAutocomplete: {
			return await handleAutocomplete(interaction, client, connection, ai_horde_manager).catch(console.error);
        };
        case InteractionType.ModalSubmit: {
			return await handleModals(interaction, client, connection, ai_horde_manager).catch(console.error);
        };
    }
})

client.on("messageCreate", async (message) => {
    if (message.author.bot || message.content.startsWith("/") || message.content.startsWith("!")) return;
    
    if (!message.guild || !message.channel.isTextBased()) return;

    // Check if channel is in the allowed list
    const allowedChannels = process.env["ALLOWED_CHANNELS"]?.split(",") || [];
    
    // If ALLOWED_CHANNELS is set but empty, don't respond in any channel
    if (process.env["ALLOWED_CHANNELS"] === "") return;
    
    // If ALLOWED_CHANNELS has values, check if current channel is allowed
    if (allowedChannels.length > 0 && !allowedChannels.includes(message.channel.id))
        return;

    // Check if this is a video generation channel
    const channelConfig = client.config.channel_overrides?.[message.channel.id];
    const isVideoChannel = channelConfig?.content_type === "video";

    // Customize message based on channel type (video or image)
    const contentType = isVideoChannel ? "video" : "image";

    // Create components based on channel type
    let components: any[] = [];
    
    if (isVideoChannel && channelConfig?.allowed_styles && channelConfig.allowed_styles.length > 1) {
        // Get available models and worker counts with GPU filtering
        const models = await ai_horde_manager.getModels({force: true}).catch(() => []);
        const workers = await ai_horde_manager.getWorkers().catch(() => []);
        
        // Filter workers by GPU series for different quality levels
        const gpuFilteredWorkers = {
            low: workers.filter(w => w.bridge_agent?.includes('RTX 3') || w.bridge_agent?.includes('RTX 4') || w.bridge_agent?.includes('RTX 5') || w.bridge_agent?.includes('RTX 6') || w.bridge_agent?.includes('GTX 1') || w.bridge_agent?.includes('GTX 2') || w.bridge_agent?.includes('GTX 3') || w.bridge_agent?.includes('GTX 4') || w.bridge_agent?.includes('GTX 5') || w.bridge_agent?.includes('GTX 6')),
            standard: workers.filter(w => w.bridge_agent?.includes('RTX 5') || w.bridge_agent?.includes('RTX 6') || w.bridge_agent?.includes('GTX 5') || w.bridge_agent?.includes('GTX 6')),
            high: workers.filter(w => w.bridge_agent?.includes('RTX 6') || w.bridge_agent?.includes('GTX 6'))
        };
        
        console.log(`[DEBUG] Total workers: ${workers.length}`);
        console.log(`[DEBUG] GPU filtered workers - low: ${gpuFilteredWorkers.low.length}, standard: ${gpuFilteredWorkers.standard.length}, high: ${gpuFilteredWorkers.high.length}`);
        
        const modelWorkerMap: Record<string, number> = {};
        models.forEach(model => {
            if (model.name) {
                // Get workers supporting this model
                const modelWorkers = workers.filter(w => w.models?.includes(model.name!));
                
                console.log(`[DEBUG] Model ${model.name}: ${modelWorkers.length} workers support this model`);
                
                // Count workers by quality level - use less restrictive filtering
                let workerCount = 0;
                if (model.name.includes('5b')) {
                    // Low quality - 3000 series or better, but fallback to all if none found
                    workerCount = modelWorkers.filter(w => gpuFilteredWorkers.low.includes(w)).length;
                    if (workerCount === 0) {
                        workerCount = modelWorkers.length; // Fallback to all workers
                        console.log(`[DEBUG] No GPU-filtered workers for 5b model, using all ${workerCount} workers`);
                    }
                } else if (model.name.includes('14b') && !model.name.includes('hq')) {
                    // Standard quality - 5000 series or better, but fallback to all if none found
                    workerCount = modelWorkers.filter(w => gpuFilteredWorkers.standard.includes(w)).length;
                    if (workerCount === 0) {
                        workerCount = modelWorkers.length; // Fallback to all workers
                        console.log(`[DEBUG] No GPU-filtered workers for 14b model, using all ${workerCount} workers`);
                    }
                } else if (model.name.includes('14b_hq') || model.name.includes('hq')) {
                    // High quality - 6000 series or better, but fallback to all if none found
                    workerCount = modelWorkers.filter(w => gpuFilteredWorkers.high.includes(w)).length;
                    if (workerCount === 0) {
                        workerCount = modelWorkers.length; // Fallback to all workers
                        console.log(`[DEBUG] No GPU-filtered workers for 14b_hq model, using all ${workerCount} workers`);
                    }
                } else {
                    // Fallback to all workers
                    workerCount = modelWorkers.length;
                }
                
                // Don't divide by 2 for now - show actual worker count
                modelWorkerMap[model.name] = workerCount;
                
                console.log(`[DEBUG] Model ${model.name}: ${modelWorkers.length} total workers, ${workerCount} final count`);
            }
        });
        
        console.log('[DEBUG] Available models from API:', Object.keys(modelWorkerMap));
        console.log('[DEBUG] Worker counts:', modelWorkerMap);
        
        // For video channels with multiple styles, create buttons for each style
        const videoStyleButtons = channelConfig.allowed_styles.slice(0, 5).map((styleName: string) => {
            // Get model name from styles config
            const styleConfig = client.horde_styles?.[styleName];
            const modelName = styleConfig?.model;
            
            console.log(`[DEBUG] Style ${styleName} -> model: ${modelName}, workers: ${modelName ? modelWorkerMap[modelName] : 'N/A'}`);
            
            // Subtract 1 from worker count (reserve one worker)
            const actualWorkerCount = modelName ? modelWorkerMap[modelName] || 0 : 0;
            const workerCount = Math.max(0, actualWorkerCount - 1);
            const workerText = workerCount > 0 ? ` (${workerCount} worker${workerCount !== 1 ? 's' : ''})` : ' (0 workers)';
            
            // Create descriptive button labels with worker counts
            let buttonLabel = "Video";
            if (styleConfig?.button_label) {
                // Use button label from styles config
                buttonLabel = `${styleConfig.button_label}${workerText}`;
            } else {
                // Fallback to style name formatting
                buttonLabel = styleName.replace("wan2-", "").replace("-video", "").replace("-", " ");
            }
            
            return {
                type: 2,
                style: 1,
                custom_id: `quickgenerate_style:${styleName}_${message.content.substring(0, 200)}`,
                label: buttonLabel
            };
        });
        
        // Split into rows of 5 buttons max
        const rows = [];
        for (let i = 0; i < videoStyleButtons.length; i += 5) {
            rows.push({
                type: 1,
                components: videoStyleButtons.slice(i, i + 5)
            });
        }
        components = rows;
        
    } else {
        // Default single button for image channels or video channels with one style
        components = [{
            type: 1,
            components: [{
                type: 2,
                style: 1,
                custom_id: `quickgenerate_${message.content.substring(0, 200)}`,
                label: `Generate this ${contentType}`
            }]
        }];
    }

    await message.reply({
        content: `💡 You can use \`/generate prompt:${message.content}\` to create a ${contentType}. ${isVideoChannel && channelConfig?.allowed_styles && channelConfig.allowed_styles.length > 1 ? 'Choose your video model:' : `Would you like me to generate a ${contentType} from your message?`}`,
        components
    });
});

