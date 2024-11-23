# meeting-recording （會議錄音機器人）

## 專案概述
會議錄音機器人由三個 Discord 語音機器人組成：
1. 主 bot 負責檢測進入指定語音頻道的用戶，並將他們移動到討論室。
2. 錄音 bot 進入語音頻道並錄製用戶音頻。
3. 錄音完成後，音檔會自動上傳至 Google 雲端硬碟。

## 系統功能
1. **錄音功能**  
   - 錄音機器人接收指令後，自動進入指定的 Discord 語音頻道。  
   - 使用 MP3 格式錄音，錄音完成後保存音檔。

2. **靜默監控**  
   - 如果語音頻道中長時間無人說話（超過 300 秒），錄音機器人會自動停止錄音並退出頻道。

3. **音檔管理**  
   - 錄音完成後，音檔會自動上傳至 Google 雲端硬碟的指定資料夾。

4. **手動控制**  
   - 提供管理員手動指令，允許停止錄音或強制退出頻道。
   - 指令列表：
     - `!start_recording <channel_id>`：開始錄音
     - `!stop_recording`：停止錄音
     - `!help`：列出所有可用指令

5. **環境變數管理**  
   - 所有敏感信息與配置參數均存儲在 `.env` 文件中。
   - `.env` 文件已加入 `.gitignore`，避免敏感資料被提交到版本控制。

---

## 環境配置

### 1. 必要依賴
請確保安裝以下 Python 套件。將以下內容存入 `requirements.txt` 文件：

```plaintext
discord.py[voice]
PyNaCl
google-api-python-client
google-auth
google-auth-httplib2
google-auth-oauthlib
python-dotenv
```

安裝依賴：
```bash
pip install -r requirements.txt
```

### 2. 環境變數
請根據下列範例建立 `.env` 文件：

```plaintext
RECORDER_BOT_TOKEN=your-bot-token
SERVICE_ACCOUNT_FILE=service_account.json
GDRIVE_FOLDER_ID=your-google-drive-folder-id
RECORDER_SILENCE_TIMEOUT=300
```

**注意**：  
- 請不要將 `.env` 文件提交至版本控制，確保敏感資訊安全。
- 項目已包含 `.env.template` 文件作為示例，方便使用者配置。

### 3. Google Drive API 配置
- 使用 Service Account，並將 `service_account.json` 文件放置於專案目錄中。
- 將 Service Account 的 `client_email` 添加至目標 Google 雲端硬碟資料夾的共享名單中。

---

## 注意事項
- 請確保 `.gitignore` 文件中包含以下條目：
  ```plaintext
  .env
  service_account.json
  ```
- 在發布至 GitHub 前，檢查是否有敏感資料未移除。
