# 小柯機器人象棋遊戲
<img width="1910" height="1079" alt="image" src="https://github.com/user-attachments/assets/f5f40310-80ce-4cfa-846d-21b352bd0f62" />

3D 立體中國象棋桌面遊戲（Windows 11 優先，MacBook Pro 次之）。從「小柯機器人遠端連線」的構想延伸而來，沿用同一套 WebRTC 點對點連線。

## 功能

- **整盤象棋**（半盤象棋即將推出）
- **A. 與 AI 對賽**：不需網路。五種難度（入門～大師），內建開局庫。
- **B. 與真人對賽**：一方「建立房間」得到 6 位數房號，另一方「加入房間」。
  - 輪到誰下，只有誰能動棋；畫面上方大字提示「輪到您下棋」或「換您觀棋」。
  - 悔棋、提和、再來一局都要對方同意；認輸立即生效；斷線會提示。
  - 文字聊天、**語音通話**（通話時背景音樂自動降低音量）。
- **3D 立體棋盤棋子**：大字楷書棋子，紅黑分明；斜視、俯視、立體三種視角，右鍵拖曳旋轉、滾輪縮放。
- **背景音樂**：內建 20 首原創古風曲（每首 3 分 18 秒～3 分 39 秒），雙方各自播放；也能加入自己的 MP3。
- **AI 軍師**：右側小視窗，雙方都能請教。本機象棋引擎先算出候選著法，再由 Claude 用白話解說；沒有 API 金鑰時提供離線的引擎建議。
- **棋譜庫與 AI 學習**：每一局（AI 對局、真人對局、匯入的棋譜）都自動收錄。AI 下棋時會參考：曾經贏棋的著法優先採用，曾經輸棋的著法盡量避開。可重播、匯出（中文記譜文字檔）、匯入。

## 開發

```bash
npm install
npm start            # 啟動
npm test             # 規則／引擎／棋譜庫單元測試
npm run e2e          # 單機端對端測試（node e2e/smoke.mjs）
node e2e/net.mjs     # 遠端對賽端對端測試（本機配對伺服器＋兩個實例）
npm run dist:win     # Windows 安裝檔與免安裝版
npm run music        # 重新產生 20 首背景音樂（需要 Python numpy/scipy 與 ffmpeg）
```

## 架構

| 檔案 | 用途 |
|---|---|
| `src/renderer/js/xiangqi.js` | 規則：著法產生、將軍、王見王、長將判負、中文記譜 |
| `src/renderer/js/engine.js` | AI：PVS 搜尋、置換表、靜態搜尋、空步裁剪（在 Worker 執行） |
| `src/renderer/js/book.js` | 內建開局庫與學習棋譜 |
| `src/renderer/js/board3d.js` | Three.js 3D 棋盤 |
| `src/renderer/js/net.js` | PeerJS 連線（資料通道＋語音） |
| `src/main/advisor.js` | AI 軍師（Anthropic SDK，串流回覆） |
| `scripts/gen_music.py` | 五聲音階程序作曲與合成 |

## 遠端連線說明

預設使用 PeerJS 公用配對伺服器與 Google/Cloudflare STUN。若兩邊網路都有嚴格防火牆而連不上，可在「設定」填入自架 PeerJS 伺服器或 TURN 伺服器。
