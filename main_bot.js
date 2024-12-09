const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const ROOM_PREFIX = '討論室'; // 討論室名稱前綴
const MAX_ROOMS = 10; // 最大討論室數量
const ROOM_USER_LIMIT = 5; // 每個討論室的用戶限制
const RECORDER_BOT_TOKEN = process.env.DISCORD_TOKEN;

// 機器人啟動時
client.once('ready', () => {
    console.log(`主機器人已登入：${client.user.tag}`);
});

// 呼叫錄音機器人進入語音頻道
async function callRecorderBot(channelId, guildId) {
    const { Client: RecorderClient, GatewayIntentBits: RecorderIntents } = require('discord.js');
    const { joinVoiceChannel } = require('@discordjs/voice');

    const recorderClient = new RecorderClient({
        intents: [
            RecorderIntents.Guilds,
            RecorderIntents.GuildVoiceStates,
        ],
    });

    recorderClient.once('ready', () => {
        console.log(`錄音機器人已登入：${recorderClient.user.tag}`);
        const connection = joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: recorderClient.guilds.cache.get(guildId).voiceAdapterCreator,
        });
        console.log(`錄音機器人已加入語音頻道：${channelId}`);
    });

    recorderClient.login(RECORDER_BOT_TOKEN);
}

// 檢查並創建必要的討論室
async function ensureRoomsExist(guild) {
    const channels = guild.channels.cache.filter(ch => ch.type === 2 && ch.name.startsWith(ROOM_PREFIX)); // 只檢查語音頻道
    const existingRooms = Array.from(channels.keys())
        .map(id => parseInt(channels.get(id).name.replace(ROOM_PREFIX, ''), 10))
        .sort((a, b) => a - b); // 獲取現有討論室編號，並排序

    for (let i = 1; i <= MAX_ROOMS; i++) {
        if (!existingRooms.includes(i)) {
            const roomName = `${ROOM_PREFIX}${i}`;
            console.log(`創建討論室：${roomName}`);
            const newChannel = await guild.channels.create({
                name: roomName,
                type: 2, // 語音頻道
                userLimit: ROOM_USER_LIMIT,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: ['Connect', 'ViewChannel'],
                    },
                ],
            });

            // 呼叫錄音機器人
            await callRecorderBot(newChannel.id, guild.id);
            return; // 每次只創建一個缺失的討論室
        }
    }
}

// 偵測用戶加入語音頻道
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;

    // 如果是用戶加入新的語音頻道
    if (!oldState.channel && newState.channel) {
        console.log(`用戶加入語音頻道：${newState.channel.name}`);
        await ensureRoomsExist(guild); // 確保討論室連續性
    }

    // 如果語音頻道內沒有人，且該頻道是討論室，則刪除頻道
    if (oldState.channel && oldState.channel.members.size === 0 && oldState.channel.name.startsWith(ROOM_PREFIX)) {
        console.log(`刪除空的討論室：${oldState.channel.name}`);
        try {
            await oldState.channel.delete();
        } catch (error) {
            console.error(`刪除討論室時發生錯誤：${error.message}`);
        }
    }
});

// 啟動機器人
client.login(process.env.MAIN_BOT_TOKEN);