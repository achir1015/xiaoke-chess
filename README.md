# 小柯機器人象棋遊戲

**遊戲開發：吳玉柱 與 Claude AI Opus 5.5**
<img width="1910" height="1079" alt="image" src="https://github.com/user-attachments/assets/f5f40310-80ce-4cfa-846d-21b352bd0f62" />
<img width="1913" height="1079" alt="image" src="https://github.com/user-attachments/assets/1bdc61df-38ea-45a4-ab30-92b28585c57e" />
<img width="622" height="941" alt="image" src="https://github.com/user-attachments/assets/8e6b601a-a85f-4107-b2a3-64815e55a54c" />

3D 立體中國象棋遊戲：Windows 11、MacBook Pro 桌面版，以及 Android 手機版（直立）。從「小柯機器人遠端連線」的構想延伸而來，沿用同一套 WebRTC 點對點連線。

## 功能

- **整盤象棋**與**半盤象棋（暗棋）**，首頁上方切換。
- **A. 與 AI 對賽**：不需網路。五種難度（入門～大師）。整盤有開局庫；半盤 AI 只看翻開的棋子，以機率計算翻子。
- **B. 與真人對賽**：一方「建立房間」得到 6 位數房號，另一方「加入房間」。
  - 輪到誰下，只有誰能動棋；畫面上方大字提示「輪到您下棋」或「換您觀棋」。
  - 悔棋、提和、再來一局都要對方同意；認輸立即生效；斷線會提示。
  - 文字聊天、**語音通話**（通話時背景音樂自動降低音量）。
- **C. AI 與 AI 對賽**：整盤、半盤都可以觀戰，兩邊難度可分開設定，可調速度、暫停、請軍師講解。
- **頭像與 AI 軍師（必選）**：60 張原創半身頭像——男英雄 20 位、女佳人 20 位（以古代人物姓氏命名），AI 軍師 20 位（男女各 10，標明「軍師」）。比賽時雙方都顯示自己的頭像與軍師，開局有對陣畫面。
- **軍師代打**：臨時有事要離開時，按「🧙 軍師代打」讓自己的 AI 軍師接手下棋；回來按「↩ 交還主位」。對方畫面會即時顯示主位換人（卡片換成軍師頭像、聊天室與提示通知）。代打期間對方提出的悔棋、和棋、再來一局會自動婉拒。
- **📖 遊戲說明**：整盤 10 課、半盤 6 課，動畫示範每種棋子的走法與常見錯誤，語音解說，並有練習題；對局中走錯也會即時說明原因。
- **日期時間與音量**：對局畫面上方顯示西元年月日與時間；背景音樂音量（右側直立滑桿）與落子音效音量（左側直立滑桿），往上大聲、往下小聲。
- **3D 立體棋盤棋子**：大字楷書棋子，紅黑分明；斜視、俯視、立體三種視角，右鍵拖曳旋轉、滾輪縮放。
- **背景音樂**：內建 20 首原創古風曲（每首 3 分 18 秒～3 分 39 秒），雙方各自播放；也能加入自己的 MP3。
- **AI 軍師**：右側小視窗，雙方都能請教。本機象棋引擎先算出候選著法，再由 Claude 用白話解說；沒有 API 金鑰時提供離線的引擎建議。
- **棋譜庫與 AI 學習**：每一局（AI 對局、真人對局、匯入的棋譜）都自動收錄。AI 下棋時會參考：曾經贏棋的著法優先採用，曾經輸棋的著法盡量避開。可重播、匯出（中文記譜文字檔）、匯入。

## 半盤（暗棋）規則

規則依照 [lwher/Chinese-chess-half-mode](https://github.com/lwher/Chinese-chess-half-mode)：

- 4 列 × 8 行，32 顆棋子全部蓋著隨機擺放。第一個翻棋的人，翻出什麼顏色就執什麼顏色。
- 每回合可以翻開一顆暗子，或把自己的明子上下左右走一步（移動到空格或吃子）。
- 大小：帥 > 士 > 相 > 車 > 馬 > 炮 > 兵。大吃小、同大小可互吃；帥不能吃兵，兵可以吃帥。
- 炮只能走一步到空格；吃子時要隔一顆棋子（明暗皆可）打兩格外的明子，可以打任何棋子。
- 吃光對方的棋子獲勝。本程式另外補上：輪到的一方無子可動判負；連續 80 步沒有吃子也沒有翻子判和。

## Android 手機版（v1.4.0 起）

到 [Releases](https://github.com/achir1015/xiaoke-chess/releases/latest) 下載 `XiaokeChess-版本-android.apk`，在手機上開啟安裝（第一次要允許「安裝未知應用程式」）。需要 Android 8.0 以上。

- **直立畫面**：手機多半直著拿，單手就能下棋；整盤棋盤九路寬剛好佔滿螢幕寬度，半盤（4×8）自動轉成直的。
- 桌面版功能都有：整盤／半盤、與 AI、與真人遠端（可和電腦版互連）、AI 對 AI、語音通話、20 首背景音樂、AI 軍師與軍師代打、頭像、遊戲說明（手機內建中文語音）、棋譜庫、檢查更新。
- 著法、軍師、音樂放在下方抽屜，點分頁拉起；兩指拖曳旋轉、捏合縮放棋盤；返回鍵會先關掉面板與視窗。
- 更新：在「關於與更新」按檢查更新，下載後由 Android 安裝程式覆蓋安裝（資料保留）。

## 版本更新

程式開啟時會自動檢查 GitHub 上的新版本（也可在首頁「關於與更新」手動檢查）：

- Windows 安裝版：下載後自動安裝，完成後重新開啟。
- Windows 免安裝版：新版放在原資料夾並自動開啟。
- macOS：下載 dmg 並開啟，把程式拖到「應用程式」覆蓋舊版即可。

v1.0.0 沒有更新功能，請手動下載一次 v1.1.0，之後就會自動更新。

## 開發

```bash
npm install
npm start            # 啟動
npm test             # 規則／引擎／棋譜庫單元測試
npm run e2e          # 單機端對端測試（整盤、半盤、AI 對 AI、關於與更新）
node e2e/net.mjs     # 遠端整盤對賽端對端測試（本機配對伺服器＋兩個實例）
node e2e/net-half.mjs # 遠端半盤對賽端對端測試
npm run dist:win     # Windows 安裝檔與免安裝版
npm run music        # 重新產生 20 首背景音樂（需要 Python numpy/scipy 與 ffmpeg）
npm run portraits    # 重新產生 60 張頭像（SVG）
node e2e/net-proxy.mjs # 遠端對賽頭像互通與軍師代打測試
node e2e/guide.mjs   # 遊戲說明（動畫、語音、練習）測試
npm run mobile       # 產生手機版網頁（mobile/www）
node e2e/mobile.mjs  # 手機版網頁測試（Chrome 手機模擬）
python android/build.py            # 建置 Android APK（不用 Gradle；需 JDK 17、Android SDK）
python android/build.py debug install  # 除錯版裝到手機，再用 node e2e/phone.mjs 實機測試
```

## 架構

| 檔案 | 用途 |
|---|---|
| `src/renderer/js/xiangqi.js` | 規則：著法產生、將軍、王見王、長將判負、中文記譜 |
| `src/renderer/js/engine.js` | AI：PVS 搜尋、置換表、靜態搜尋、空步裁剪（在 Worker 執行） |
| `src/renderer/js/book.js` | 內建開局庫與學習棋譜 |
| `src/renderer/js/banqi.js` | 半盤（暗棋）規則與 AI（機率期望值搜尋） |
| `src/main/updater.js` | 版本更新（GitHub Release） |
| `src/renderer/js/portraits.js` | 頭像與軍師選擇 |
| `src/renderer/js/guide.js` | 遊戲說明：動畫棋盤、語音解說、課程與練習 |
| `src/renderer/js/explain.js` | 錯誤走法的原因說明 |
| `scripts/gen_portraits.mjs` | 60 張半身頭像產生器（原創向量插畫） |
| `src/renderer/js/board3d.js` | Three.js 3D 棋盤 |
| `src/renderer/js/net.js` | PeerJS 連線（資料通道＋語音） |
| `src/main/advisor.js` | AI 軍師（Anthropic SDK，串流回覆） |
| `scripts/gen_music.py` | 五聲音階程序作曲與合成 |

## 遠端連線說明

預設使用 PeerJS 公用配對伺服器與 Google/Cloudflare STUN。若兩邊網路都有嚴格防火牆而連不上，可在「設定」填入自架 PeerJS 伺服器或 TURN 伺服器。
