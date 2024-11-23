import discord
from discord.ext import commands, tasks
import asyncio
import os
from dotenv import load_dotenv

# 加載 .env 檔案中的環境變數
load_dotenv()

intents = discord.Intents.default()
intents.members = True
intents.voice_states = True

bot = commands.Bot(command_prefix='!', intents=intents)

# 主機器人配置
TOKEN = os.getenv('DISCORD_TOKEN')
GUILD_ID = int(os.getenv('GUILD_ID'))
MONITOR_CHANNEL_ID = int(os.getenv('MONITOR_CHANNEL_ID'))
MAX_DISCUSSION_ROOMS = int(os.getenv('MAX_DISCUSSION_ROOMS', 3))
RECORDER_BOT_IDS = [int(id.strip()) for id in os.getenv('RECORDER_BOT_IDS').split(',')]
SILENCE_THRESHOLD = int(os.getenv('SILENCE_THRESHOLD', 5))
SILENCE_TIMEOUT = int(os.getenv('SILENCE_TIMEOUT', 300))
BOT_COMMAND_CHANNEL_ID = int(os.getenv('BOT_COMMAND_CHANNEL_ID'))

discussion_rooms = {}  # 記錄討論室的編號和頻道 ID
available_recorder_bots = RECORDER_BOT_IDS.copy()

@bot.event
async def on_ready():
    print(f'已登入為 {bot.user}')

@bot.event
async def on_voice_state_update(member, before, after):
    if member.bot:
        return

    if before.channel is None and after.channel is not None:
        if after.channel.id == MONITOR_CHANNEL_ID:
            await handle_user_join(member)

    if before.channel is not None and before.channel.id in discussion_rooms.values():
        await check_empty_channel(before.channel)

async def handle_user_join(member):
    channel_number = find_available_channel_number()
    if channel_number is None:
        await member.send('目前沒有可用的討論室，請稍後再試。')
        return

    guild = bot.get_guild(GUILD_ID)
    overwrites = {
        guild.default_role: discord.PermissionOverwrite(connect=False),
        member: discord.PermissionOverwrite(connect=True)
    }
    new_channel = await guild.create_voice_channel(
        f'討論室{channel_number}', overwrites=overwrites)
    discussion_rooms[channel_number] = new_channel.id

    await member.move_to(new_channel)

    await summon_recorder_bot(new_channel, channel_number)

    bot.loop.create_task(monitor_silence(new_channel))

def find_available_channel_number():
    for num in range(1, MAX_DISCUSSION_ROOMS + 1):
        if num not in discussion_rooms:
            return num
    return None

async def summon_recorder_bot(channel, channel_number):
    if not available_recorder_bots:
        print('沒有空閒的錄音機器人')
        return

    recorder_bot_id = available_recorder_bots.pop(0)
    recorder_bot_member = channel.guild.get_member(recorder_bot_id)
    if recorder_bot_member is None:
        print('無法找到錄音機器人')
        return

    command_channel = bot.get_channel(BOT_COMMAND_CHANNEL_ID)
    if command_channel is None:
        print('無法找到指令頻道')
        return

    try:
        # 根據錄音機器人對應的 ID 發送不同的指令格式
        if recorder_bot_id == RECORDER_BOT_IDS[0]:
            await command_channel.send(f'!1start_recording {channel.id}')
        elif recorder_bot_id == RECORDER_BOT_IDS[1]:
            await command_channel.send(f'!2start_recording {channel.id}')
        print(f'已通知錄音機器人 {recorder_bot_member} 加入 {channel}')
    except Exception as e:
        print(f'無法發送指令給錄音機器人: {e}')

async def monitor_silence(channel):
    silent_seconds = 0
    while True:
        await asyncio.sleep(1)
        non_bot_members = [member for member in channel.members if not member.bot]
        if all(member.voice.self_mute or member.voice.mute for member in non_bot_members):
            silent_seconds += 1
        else:
            silent_seconds = 0

        if silent_seconds >= SILENCE_TIMEOUT:
            await close_discussion_room(channel)
            break

async def close_discussion_room(channel):
    for member in channel.members:
        if not member.bot:
            try:
                await member.send('由於長時間無人講話，討論室已關閉。')
            except Exception as e:
                print(f'無法發送訊息給 {member}: {e}')
            await member.move_to(None)

    for member in channel.members:
        if member.bot and member.id in RECORDER_BOT_IDS:
            command_channel = bot.get_channel(BOT_COMMAND_CHANNEL_ID)
            if command_channel is not None:
                try:
                    await command_channel.send(f'<@{member.id}> !stop_recording')
                    print(f'已通知錄音機器人 {member} 停止錄音')
                except Exception as e:
                    print(f'無法發送停止指令給錄音機器人: {e}')
            available_recorder_bots.append(member.id)

    try:
        await channel.delete()
        print(f'已刪除頻道 {channel.name}')
    except Exception as e:
        print(f'無法刪除頻道 {channel.name}: {e}')
    channel_number = int(channel.name.replace('討論室', ''))
    discussion_rooms.pop(channel_number, None)

async def check_empty_channel(channel):
    if len(channel.members) == 0:
        await close_discussion_room(channel)

bot.run(TOKEN)
