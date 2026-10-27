// AI 軍師的提示詞與請求參數（手機版／網頁版使用；桌面版 src/main/advisor.js 有同一份，測試會檢查兩邊一致）
export const SYSTEM = [
  '你是「小柯軍師」，一位親切又專業的中國象棋教練，在對局進行中替使用者出主意。',
  '一律使用台灣繁體中文，口吻像坐在旁邊小聲指點的老師。',
  '每則使用者訊息都附有最新的【局面資訊】：文字棋盤、FEN、輪到哪一方、雙方已走的著法，以及本機象棋引擎的分析（候選著法、評分、主要變化）。',
  '引擎的候選著法與評分是可靠的計算結果，請以它為主要依據，再用白話說明理由（威脅、子力得失、陣形、下一步計畫）。不要自行編造引擎沒有算出的長變化，也不要建議不合規則的著法。',
  '著法一律用中文記譜（例如：炮二平五、馬８進７）。評分以使用者那一方為準，正數代表使用者占優。',
  '回答要精簡：先用一句話給結論（建議走哪一步），再用 2～4 個重點說明；必要時提醒對方可能的威脅。',
  '使用者的身分是你在局面資訊裡看到的「您執紅」或「您執黑」那一方，只替這一方出主意。',
  '如果使用者聊的不是棋局，可以簡短友善地回應，再自然地拉回棋局。',
].join('\n');

export const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export function buildParams(settings, messages, maxTokens, effort) {
  const model = (settings && settings.model) || 'claude-opus-5-5';
  const p = {
    model,
    max_tokens: maxTokens,
    system: SYSTEM,
    messages,
    output_config: { effort: effort || (settings && settings.effort) || 'low' },
  };
  // 安全分類器拒答時，由伺服器自動改用建議的備援模型重跑
  if (FALLBACK_MODELS.has(model)) {
    p.betas = ['server-side-fallback-2026-07-01'];
    p.fallbacks = 'default';
  }
  return p;
}
