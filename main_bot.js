const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const ROOM_PREFIX = '討論室'; // 討論室名稱前綴
const MAX_ROOMS = 10; // 最大討論室數量
const ROOM_USER_LIMIT = 5; // 每個討論室的用戶限制

// 錄音機器人設定
const RECORDER_BOTS = [
    { token: process.env.RECORDER_BOT_TOKEN_1, inUse: false, id: null },
    { token: process.env.RECORDER_BOT_TOKEN_2, inUse: false, id: null },
];

// 主機器人啟動時
client.once('ready', () => {
    console.log(`主機器人已登入：${client.user.tag}`);
});

// 判斷是否是錄音機器人
function isRecorderBot(userId) {
    return RECORDER_BOTS.some(bot => bot.id === userId);
}

// 呼叫錄音機器人進入語音頻道
async function callRecorderBot(channelId, guildId) {
    const { Client: RecorderClient } = require('discord.js');
    const { joinVoiceChannel } = require('@discordjs/voice');

    const availableBot = RECORDER_BOTS.find(bot => !bot.inUse);
    if (!availableBot) {
        console.log('沒有空閒的錄音機器人');
        return;
    }

    availableBot.inUse = true;

    const recorderClient = new RecorderClient({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
    });

    recorderClient.once('ready', () => {
        console.log(`錄音機器人已登入：${recorderClient.user.tag}`);
        joinVoiceChannel({
            channelId,
            guildId,
            adapterCreator: recorderClient.guilds.cache.get(guildId).voiceAdapterCreator,
        });
        availableBot.id = recorderClient.user.id;
        console.log(`錄音機器人已加入用戶所在的頻道：${channelId}`);
    });

    recorderClient.on('disconnect', () => {
        availableBot.inUse = false;
        availableBot.id = null;
        console.log(`錄音機器人 ${recorderClient.user.tag} 已釋放`);
    });

    recorderClient.login(availableBot.token);
}

// 確保討論室存在
async function ensureRoomsExist(guild) {
    const channels = guild.channels.cache.filter(ch => ch.type === 2 && ch.name.startsWith(ROOM_PREFIX));
    const existingRooms = Array.from(channels.keys())
        .map(id => parseInt(channels.get(id).name.replace(ROOM_PREFIX, ''), 10))
        .sort((a, b) => a - b);

    for (let i = 1; i <= MAX_ROOMS; i++) {
        if (!existingRooms.includes(i)) {
            const roomName = `${ROOM_PREFIX}${i}`;
            console.log(`創建討論室：${roomName}`);
            const newChannel = await guild.channels.create({
                name: roomName,
                type: 2,
                userLimit: ROOM_USER_LIMIT,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: ['Connect', 'ViewChannel'],
                    },
                ],
            });
            return newChannel; // 返回新創建的討論室
        }
    }
    return null;
}

// 移動用戶到頻道
async function moveUserToChannel(userId, targetChannelId, guild) {
    try {
        const member = await guild.members.fetch(userId);
        const targetChannel = guild.channels.cache.get(targetChannelId);

        if (!targetChannel) {
            console.log(`無效的目標頻道 ID：${targetChannelId}`);
            return;
        }

        if (!member.voice.channel) {
            console.log(`用戶 ${member.user.tag} 不在任何語音頻道`);
            return;
        }

        if (member.voice.channel.id !== targetChannelId) {
            await member.voice.setChannel(targetChannelId);
            console.log(`已將用戶 ${member.user.tag} 移動到頻道 ${targetChannel.name}`);
        }
    } catch (error) {
        console.error(`移動用戶時發生錯誤：${error.message}`);
    }
}

// 偵測用戶加入或離開語音頻道
client.on('voiceStateUpdate', async (oldState, newState) => {
    const guild = newState.guild;

    // 檢查是否是錄音機器人
    if (newState.member && isRecorderBot(newState.member.id)) {
        console.log(`錄音機器人 ${newState.member.user.tag} 狀態更新，跳過處理`);
        return;
    }

    // 用戶加入語音頻道
    if (!oldState.channel && newState.channel) {
        const userChannel = newState.channel;

        console.log(`用戶加入語音頻道：${userChannel.name}`);

        if (!userChannel.name.startsWith(ROOM_PREFIX)) {
            console.log(`用戶加入的頻道 ${userChannel.name} 不是討論室，將創建新討論室`);
            const newRoom = await ensureRoomsExist(guild);
            if (newRoom) {
                console.log(`將用戶移動到新創建的討論室：${newRoom.name}`);
                await moveUserToChannel(newState.member.id, newRoom.id, guild);
                await callRecorderBot(newRoom.id, guild.id);
            }
            return;
        }

        if (userChannel.members.size < ROOM_USER_LIMIT) {
            console.log(`討論室 ${userChannel.name} 尚未滿員，用戶將停留在該頻道`);
        } else {
            console.log(`討論室 ${userChannel.name} 已滿員，將創建新的討論室`);
            const newRoom = await ensureRoomsExist(guild);
            if (newRoom) {
                console.log(`將用戶移動到新創建的討論室：${newRoom.name}`);
                await moveUserToChannel(newState.member.id, newRoom.id, guild);
                await callRecorderBot(newRoom.id, guild.id);
            }
        }
    }

    // 如果語音頻道內無人且為討論室，刪除頻道
    if (
        oldState.channel &&
        oldState.channel.members.size === 0 &&
        oldState.channel.name.startsWith(ROOM_PREFIX)
    ) {
        console.log(`檢測到空的討論室：${oldState.channel.name}`);
        try {
            await oldState.channel.delete();
            console.log(`成功刪除討論室：${oldState.channel.name}`);
        } catch (error) {
            console.error(`刪除討論室時發生錯誤：${error.message}`);
        }
    }
});

// 手動呼叫錄音機器人
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!callRecorder')) {
        const args = message.content.split(' ');
        const channelId = args[1];
        if (!channelId) {
            message.reply('請提供頻道 ID');
            return;
        }

        await callRecorderBot(channelId, message.guild.id);
        message.reply(`錄音機器人已被呼叫進入頻道 ID：${channelId}`);
    }
});

// 啟動主機器人
client.login(process.env.MAIN_BOT_TOKEN);
