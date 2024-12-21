require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { Configuration, OpenAIApi } = require('openai');
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

function convertPcmToWav(inputFile, outputFile, callback) {
  const command = `ffmpeg -f s16le -ar 48000 -ac 2 -i ${inputFile} ${outputFile}`;
  exec(command, (err, stdout, stderr) => {
    if (err) {
      console.error('Error converting PCM to WAV:', stderr);
      callback(err);
    } else {
      console.log('PCM successfully converted to WAV.');
      callback(null, outputFile);
    }
  });
}

async function uploadToGoogleCloud(filePath) {
  try {
    const destination = `audio/${path.basename(filePath)}`;
    await bucket.upload(filePath, {
      destination: destination,
    });
    console.log(`File uploaded to Google Cloud Storage: ${destination}`);
  } catch (err) {
    console.error('Error uploading to Google Cloud Storage:', err);
    throw err;
  }
}

async function transcribeAudio(wavFilePath) {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  try {
    const audioFile = fs.createReadStream(wavFilePath);
    const response = await openai.createTranscription(audioFile, 'whisper-1');
    console.log('Transcription complete:', response.data.text);
    return response.data.text;
  } catch (err) {
    console.error('Error during transcription:', err.response ? err.response.data : err.message);
    throw err;
  }
}

async function generateSummary(transcription) {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: '你是一個會議摘要專家，請幫助總結會議內容。' },
        { role: 'user', content: `以下是會議的逐字稿，請生成簡潔的摘要：\n\n${transcription}` },
      ],
      max_tokens: 300,
      temperature: 0.5,
    });

    const summary = response.data.choices[0].message.content;
    console.log('Summary generated:', summary);
    return summary;
  } catch (err) {
    console.error('Error generating summary:', err.response ? err.response.data : err.message);
    throw err;
  }
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
  let recordedFileName = null;
  let startTime = null;
  let leaveTimer = null;

  botClient.once('ready', () => {
    console.log(`Logged in as ${botClient.user.tag}`);
  });

  botClient.on('voiceStateUpdate', async (oldState, newState) => {
    const newChannel = newState.channel;
    const oldChannel = oldState.channel;

    if (newChannel && newChannel.id === config.channelId) {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
        console.log(`[${botClient.user.tag}] User rejoined channel, canceling stop timer.`);
      }

      if (!voiceConnection || voiceConnection.joinConfig.channelId !== config.channelId) {
        startRecording(newChannel);
      }
    }

    if (oldChannel && oldChannel.id === config.channelId) {
      const channel = oldState.guild.channels.cache.get(config.channelId);
      if (channel && channel.members.filter(m => !m.user.bot).size === 0) {
        console.log(`[${botClient.user.tag}] Channel empty, will stop recording in 2 minutes if no one re-enters.`);
        leaveTimer = setTimeout(() => {
          console.log(`[${botClient.user.tag}] No one returned, stopping recording now.`);
          stopRecordingAndProcess();
          leaveTimer = null;
        }, 2 * 60 * 1000);
      }
    }
  });

  // 開始錄音的主要邏輯，將錄音流保存為 PCM 格式的檔案。
  async function startRecording(channel) {
    try {
      voiceConnection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

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

  async function stopRecordingAndProcess() {
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

    const pcmFileName = `recording-${formatTimestamp(startTime)}-${endTimeStr}.pcm`;
    const wavFileName = `recording-${formatTimestamp(startTime)}-${endTimeStr}.wav`;

    const localTempFilePath = path.resolve(recordedFileName);
    const localPcmFilePath = path.resolve(pcmFileName);

    fs.renameSync(localTempFilePath, localPcmFilePath);

    console.log(`[${botClient.user.tag}] Converting PCM to WAV...`);
    convertPcmToWav(localPcmFilePath, wavFileName, async (err, wavFilePath) => {
      if (err) {
        console.error('Failed to convert PCM to WAV:', err);
        return;
      }

      console.log(`[${botClient.user.tag}] WAV file created: ${wavFilePath}`);

      try {
        const transcription = await transcribeAudio(wavFilePath);
        const summary = await generateSummary(transcription);

        fs.writeFileSync(wavFilePath.replace('.wav', '.txt'), transcription, 'utf8');
        fs.writeFileSync('summary.txt', summary, 'utf8');

        await uploadToGoogleCloud(wavFilePath);
      } catch (err) {
        console.error('Failed to process transcription or summary:', err);
      } finally {
        fs.unlinkSync(localPcmFilePath);
        fs.unlinkSync(wavFilePath);
        console.log('Temporary files deleted.');
      }
    });
  }

  botClient.login(config.token);
}
