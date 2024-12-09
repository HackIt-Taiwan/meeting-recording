# meeting-recording （會議錄音機器人）

## 專案概述
會議錄音機器人由三個 Discord 語音機器人組成：
1. 主 bot 負責檢測進入指定語音頻道的用戶，並將他們移動到討論室。
2. 錄音 bot 進入語音頻道並錄製用戶音頻。
3. 錄音完成後，音檔會自動上傳至 Google 雲端硬碟。
## 安裝所有依賴
```
npm install discord.js @discordjs/voice dotenv googleapis
```
