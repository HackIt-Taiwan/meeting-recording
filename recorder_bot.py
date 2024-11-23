import discord
from discord.ext import commands
import asyncio
import os
from dotenv import load_dotenv

# 加載 .env 文件
load_dotenv()
if not discord.opus.is_loaded():
    discord.opus.load_opus('opus.dll')  # 確保此檔案存在並與架構匹配
    print("Opus 已加載")

# 環境變數
BOT_TOKEN_1 = os.getenv('RECORDER_BOT_TOKEN_1')  # 第一台錄音機器人的 Token
BOT_TOKEN_2 = os.getenv('RECORDER_BOT_TOKEN_2')  # 第二台錄音機器人的 Token
MAIN_BOT_ID = int(os.getenv('MAIN_BOT_ID'))  # 主機器人的 ID
SILENCE_TIMEOUT = int(os.getenv('RECORDER_SILENCE_TIMEOUT', 300))  # 靜默超時（秒）

# 創建兩個 Bot 實例
intents = discord.Intents.default()
intents.voice_states = True
intents.messages = True

bot1 = commands.Bot(command_prefix="!1", intents=intents)
bot2 = commands.Bot(command_prefix="!2", intents=intents)

async def start_audio_recording(voice_client, ctx):
    """
    模擬錄音功能，並監控靜默超時。
    """
    await ctx.send(f"錄音已開始於頻道: {voice_client.channel.name}")
    silent_seconds = 0
    while True:
        await asyncio.sleep(1)
        if len([m for m in voice_client.channel.members if not m.bot]) == 0:
            silent_seconds += 1
        else:
            silent_seconds = 0

        if silent_seconds >= SILENCE_TIMEOUT:
            break

    await ctx.send("錄音結束")
    await voice_client.disconnect()

async def ensure_permissions(channel, ctx):
    """
    確保語音頻道權限正確。
    """
    try:
        overwrite = discord.PermissionOverwrite(connect=True, speak=True)
        await channel.set_permissions(ctx.guild.me, overwrite=overwrite)
    except Exception as e:
        await ctx.send(f"無法修改權限: {e}")
        raise e

@bot1.event
async def on_ready():
    print(f"錄音機器人 1 已登入為 {bot1.user}")

@bot2.event
async def on_ready():
    print(f"錄音機器人 2 已登入為 {bot2.user}")

@bot1.event
@bot2.event
async def on_message(message):
    """
    處理收到的消息。
    """
    if message.author.bot and message.author.id != MAIN_BOT_ID:
        return  # 忽略非主機器人的機器人消息
    await message.channel.send(f"收到指令: {message.content}")
    await bot1.process_commands(message) if message.content.startswith("!1") else await bot2.process_commands(message)

@bot1.command(name="start_recording")
async def bot1_start_recording(ctx, channel_id: int):
    """
    Bot 1 開始錄音。
    """
    channel = bot1.get_channel(channel_id)
    if channel is None:
        await ctx.send(f"無法找到語音頻道 ID: {channel_id}")
        return

    try:
        await ensure_permissions(channel, ctx)
        voice_client = await channel.connect()
        await start_audio_recording(voice_client, ctx)
    except Exception as e:
        await ctx.send(f"無法處理錄音請求: {e}")

@bot2.command(name="start_recording")
async def bot2_start_recording(ctx, channel_id: int):
    """
    Bot 2 開始錄音。
    """
    channel = bot2.get_channel(channel_id)
    if channel is None:
        await ctx.send(f"無法找到語音頻道 ID: {channel_id}")
        return

    try:
        await ensure_permissions(channel, ctx)
        voice_client = await channel.connect()
        await start_audio_recording(voice_client, ctx)
    except Exception as e:
        await ctx.send(f"無法處理錄音請求: {e}")

async def main():
    """
    同時啟動兩台錄音機器人。
    """
    await asyncio.gather(
        bot1.start(BOT_TOKEN_1),
        bot2.start(BOT_TOKEN_2)
    )

if __name__ == "__main__":
    asyncio.run(main())
