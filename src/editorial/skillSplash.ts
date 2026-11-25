/**
 * 技能發動演出：在目前畫面上蓋一層「黑幕」，黑幕從正中間被一道白光劃開，
 * 上下兩片往外滑開並淡出，露出原本的畫面（約 0.6 秒）。
 *
 * 只用 DOM ＋ CSS 動畫（transform / opacity）：
 * - 底下的頁面完全不動，不需要拍快照
 * - transform 與 opacity 由瀏覽器合成層處理，不會觸發重新排版，很省
 * 動畫結束後整個元素移除，不留任何東西。
 */

/** 要跟 style.scss 裡 .skill-splash 的動畫時間一致 */
const SPLASH_MS = 600

export function playSkillSplash() {
  if (document.querySelector('.skill-splash')) return
  const root = document.createElement('div')
  root.className = 'skill-splash'
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML =
    '<div class="skill-splash__half skill-splash__half--top"></div>' +
    '<div class="skill-splash__half skill-splash__half--bottom"></div>' +
    '<div class="skill-splash__flash"></div>'
  document.body.appendChild(root)
  setTimeout(() => root.remove(), SPLASH_MS + 50)
}
