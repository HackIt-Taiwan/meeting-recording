require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const clientsConfig = [
  { token: process.env.BOT1_TOKEN, channelId: process.env.BOT1_CHANNEL_ID },
  { token: process.env.BOT2_TOKEN, channelId: process.env.BOT2_CHANNEL_ID },
  { token: process.env.BOT3_TOKEN, channelId: process.env.BOT3_CHANNEL_ID },
];

const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

const storage = new Storage({
  keyFilename: GOOGLE_APPLICATION_CREDENTIALS,
});
const bucket = storage.bucket(GCS_BUCKET_NAME);

// 日期格式化函式
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}_${hh}${mm}${ss}`;
}

for (const config of clientsConfig) {
  const botClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  let isRecording = false;
  let voiceConnection = null;
  let writeStream = null;
  let recordedFileName = null; // 暫時檔名(以開始時間建檔)
  let startTime = null; // 錄音開始時間戳記
  let leaveTimer = null; // 記錄離開計時器ID

  botClient.once('ready', () => {
    console.log(`Logged in as ${botClient.user.tag}`);
  });

  botClient.on('voiceStateUpdate', async (oldState, newState) => {
    const newChannel = newState.channel;
    const oldChannel = oldState.channel;

    // 有人加入目標頻道
    if (newChannel && newChannel.id === config.channelId) {
      // 若原本有計時器要停止錄音，取消它
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
        console.log(`[${botClient.user.tag}] User rejoined channel, canceling stop timer.`);
      }

      if (!voiceConnection || voiceConnection.joinConfig.channelId !== config.channelId) {
        startRecording(newChannel);
      }
    }

    // 有人離開目標頻道，檢查剩下的人
    if (oldChannel && oldChannel.id === config.channelId) {
      const channel = oldState.guild.channels.cache.get(config.channelId);
      if (channel && channel.members.filter(m => !m.user.bot).size === 0) {
        // 頻道沒有人了，等2分鐘後再停止錄音
        console.log(`[${botClient.user.tag}] Channel empty, will stop recording in 2 minutes if no one re-enters.`);
        leaveTimer = setTimeout(() => {
          console.log(`[${botClient.user.tag}] No one returned, stopping recording now.`);
          stopRecordingAndUpload();
          leaveTimer = null;
        }, 2 * 60 * 1000); // 2分鐘(120000毫秒)
      }
    }
  });

  async function startRecording(channel) {
    try {
      voiceConnection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

      // 等待連線就緒
      await new Promise(resolve => {
        voiceConnection.on('stateChange', (oldState, newState) => {
          if (newState.status === 'ready') {
            resolve();
          }
        });
      });

      console.log(`[${botClient.user.tag}] Joined the channel ${channel.name} and is ready to record.`);
      isRecording = true;
      startTime = Date.now();
      const startTimeStr = formatTimestamp(startTime);

      recordedFileName = `recording-${startTimeStr}.pcm`;
      writeStream = fs.createWriteStream(recordedFileName);

      const receiver = voiceConnection.receiver;

      // 訂閱頻道內的使用者音訊
      channel.members.forEach(member => {
        if (!member.user.bot) {
          const audioStream = receiver.subscribe(member.id, { end: { behavior: 'manual' } });
          audioStream.on('data', (chunk) => {
            writeStream.write(chunk);
          });
        }
      });

    } catch (err) {
      console.error(`[${botClient.user.tag}] Error starting recording:`, err);
    }
  }

  async function stopRecordingAndUpload() {
    if (!isRecording) return;
    console.log(`[${botClient.user.tag}] Stopping recording...`);
    isRecording = false;

    if (writeStream) {
      writeStream.end();
    }

    if (voiceConnection) {
      voiceConnection.destroy();
      voiceConnection = null;
    }

    const endTime = Date.now();
    const endTimeStr = formatTimestamp(endTime);

    const finalFileName = `recording-${formatTimestamp(startTime)}-${endTimeStr}.pcm`;

    const localTempFilePath = path.resolve(recordedFileName);
    const localFinalFilePath = path.resolve(finalFileName);

    fs.renameSync(localTempFilePath, localFinalFilePath);

    console.log(`[${botClient.user.tag}] Final filename: ${finalFileName}`);
    console.log(`[${botClient.user.tag}] Uploading file to GCS: ${localFinalFilePath}`);

    try {
      await bucket.upload(localFinalFilePath, {
        destination: `recordings/${path.basename(localFinalFilePath)}`,
      });
      console.log(`[${botClient.user.tag}] Upload successful!`);
      fs.unlinkSync(localFinalFilePath); // 刪除本地檔案（可選）
    } catch (uploadErr) {
      console.error(`[${botClient.user.tag}] Error uploading file:`, uploadErr);
    }

    recordedFileName = null;
    startTime = null;
  }

  botClient.login(config.token);
}
