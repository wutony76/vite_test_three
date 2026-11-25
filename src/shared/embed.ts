/**
 * 頁面被別的頁面「偷偷載進 iframe」時的溝通。
 *
 * 例：editorial 自燃期間把 product.html 載進 iframe，等 product 真的準備好
 * （3D 模型畫出來）才把它換成可見，燒光時再直接切換過去（不重新載入）。
 * iframe 的 load 事件不夠用：load 只代表 HTML 載完，3D 模型這時多半還沒出來。
 */
export const EMBED_READY = 'embed-ready'

/** 被嵌入的頁面呼叫：通知上一層「我準備好了」。沒有被嵌入時什麼都不做 */
export function notifyEmbedReady() {
  if (window.parent === window) return
  window.parent.postMessage({ type: EMBED_READY }, window.location.origin)
}
