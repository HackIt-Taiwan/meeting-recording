# meeting-recording （會議錄音機器人）

## **錄音流程**
1. **加入 Discord 頻道**：
   當 BOT 檢測到使用者進入指定的語音頻道後，會自動開始錄音，並將音檔保存為 `.pcm` 格式。

2. **無人離開頻道後處理錄音**：
   - 當頻道中無人時，BOT 停止錄音，並執行以下處理：
     1. 將 `.pcm` 轉換為 `.wav`。
     2. 使用 OpenAI Whisper API 將 `.wav` 轉錄為文字。
     3. 使用 OpenAI GPT 生成會議摘要。
     4. 保存轉錄文字（與 `.wav` 同名 `.txt`）。
     5. 保存會議摘要到 `summary.txt`。
     6. 將 `.wav` 文件上傳至 Google Cloud Storage。

3. **處理完成後清理暫存檔案**：
   - 自動刪除本地的 `.pcm` 和 `.wav` 檔案。


## **上傳至 Google Cloud**
1. **上傳的檔案**：
   - 生成的 `.wav` 檔案會自動上傳到指定的 Google Cloud Storage Bucket。

2. **檔案路徑格式**：
   - 上傳的檔案名稱格式為：`audio/<檔案名稱>.wav`。


## **文件生成**
1. **本地生成的檔案**：
   - 轉錄結果：與 `.wav` 檔案同名 `.txt` 文件。
   - 摘要結果：`summary.txt`。


## 安裝所有依賴
```
npm install discord.js @discordjs/voice dotenv @google-cloud/storage openai
```
