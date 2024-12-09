const { Client, GatewayIntentBits } = require('discord.js'); 
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');
const { google } = require('googleapis');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

const BOT_TOKEN = process.env.RECORDER_BOT_TOKEN__2;
const SERVICE_ACCOUNT_FILE = process.env.SERVICE_ACCOUNT_FILE;
const UPLOAD_FOLDER_ID = process.env.UPLOAD_FOLDER_ID;
const SILENCE_TIMEOUT = parseInt(process.env.SILENCE_TIMEOUT, 10) || 300;

const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_FILE,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

// 用於存儲正在錄音的頻道
const recordingConnections = new Map();

client.once('ready', () => {
    console.log(`錄音機器人已登入：${client.user.tag}`);
});

// 檢測語音頻道人數變化
client.on('voiceStateUpdate', async (oldState, newState) => {
    const connection = getVoiceConnection(newState.guild.id);

    if (connection) {
        const voiceChannel = newState.guild.channels.cache.get(connection.joinConfig.channelId);
        if (voiceChannel && voiceChannel.members.size === 1) { // 只剩下機器人
            console.log(`語音頻道 ${voiceChannel.name} 已無人，錄音機器人將退出並刪除該頻道`);
            
            // 停止錄音並退出
            stopRecording(connection, voiceChannel.id);

            // 刪除語音頻道
            try {
                await voiceChannel.delete();
                console.log(`語音頻道 ${voiceChannel.name} 已刪除`);
            } catch (error) {
                console.error(`刪除語音頻道時發生錯誤：${error.message}`);
            }
        }
    }
});

// 處理指令
client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!start_recording')) {
        const args = message.content.split(' ');
        const channelId = args[1];
        if (!channelId) {
            console.log('指令缺少語音頻道 ID');
            return;
        }

        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel || channel.type !== 2) {
                console.log(`無效的語音頻道 ID：${channelId}`);
                return;
            }

            console.log(`準備加入語音頻道：${channel.name}`);
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });

            console.log(`已成功加入語音頻道：${channel.name}`);
            startRecording(connection, `./recording-${channelId}.pcm`, channelId);
        } catch (error) {
            console.error(`處理指令時發生錯誤：${error.message}`);
        }
    }

    if (message.content.startsWith('!stop_recording')) {
        const connection = getVoiceConnection(message.guild.id);
        if (!connection) {
            console.log('沒有正在進行的錄音');
            return;
        }

        console.log('收到停止錄音指令，將退出語音頻道');
        stopRecording(connection, connection.joinConfig.channelId);
    }
});

// 開始錄音
function startRecording(connection, recordingFile, channelId) {
    const receiver = connection.receiver;

    // 保存錄音連接
    recordingConnections.set(channelId, {
        connection,
        recordingFile,
    });

    // 訂閱語音數據
    const writeStream = createWriteStream(recordingFile);
    receiver.speaking.on('start', (userId) => {
        console.log(`開始錄音：用戶 ${userId}`);
        const audioStream = receiver.subscribe(userId, { end: { behavior: 'manual' } });

        // 保存語音到文件
        pipeline(audioStream, writeStream, (err) => {
            if (err) {
                console.error(`錄音時發生錯誤：${err.message}`);
            } else {
                console.log(`錄音保存完成：${recordingFile}`);
            }
        });
    });

    // 停止錄音的靜默超時
    setTimeout(() => {
        console.log('靜默超時，停止錄音並退出語音頻道');
        stopRecording(connection, channelId);
    }, SILENCE_TIMEOUT * 1000);
}

// 停止錄音並清理
async function stopRecording(connection, channelId) {
    if (!recordingConnections.has(channelId)) return;

    const { recordingFile } = recordingConnections.get(channelId);

    // 結束連接並刪除記錄
    connection.destroy();
    recordingConnections.delete(channelId);

    // 上傳到 Google Drive
    console.log(`錄音完成，開始上傳到 Google Drive：${recordingFile}`);
    await uploadToDrive(recordingFile, `recording-${channelId}.mp3`);

    // 清理本地錄音文件
    try {
        require('fs').unlinkSync(recordingFile);
        console.log(`已刪除本地錄音文件：${recordingFile}`);
    } catch (err) {
        console.error(`刪除本地錄音文件時發生錯誤：${err.message}`);
    }
}

// 上傳文件到 Google Drive
async function uploadToDrive(filePath, fileName) {
    try {
        const fileMetadata = {
            name: fileName,
            parents: [UPLOAD_FOLDER_ID],
        };
        const media = {
            mimeType: 'audio/mp3',
            body: require('fs').createReadStream(filePath),
        };

        const response = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id',
        });

        console.log(`錄音文件已成功上傳到 Google Drive：${response.data.id}`);
    } catch (error) {
        console.error(`上傳錄音文件到 Google Drive 時發生錯誤：${error.message}`);
    }
}

// 啟動機器人
client.login(BOT_TOKEN);
