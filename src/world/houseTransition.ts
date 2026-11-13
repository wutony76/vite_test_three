// 點房子時的轉場，比照 Game Boy 上皮卡丘遇到野生怪物的那一段
// 方塊直接從外圈旋進中央，蓋滿後從中心旋開，回到原來的畫面
// 方塊是一格一格跳出來的，不淡入：淡入會像現在的介面轉場，不像那種卡帶畫面

const COLUMNS_ON_SHORT_SIDE = 9;
const CLOSE_MS = 780;
const HOLD_MS = 140;
const OPEN_MS = 640;
// 蓋板只留一瞬間，接著就掀開。綠球要從遠處跑進來，蓋太久會把那段遮掉
const LOAD_HOLD_MS = 40;
const LOAD_OPEN_MS = 420;
// 旋進來的方塊顏色。控制面板可以改，這裡是一打開時的顏色
const CURTAIN_COLOR = '#dae5e6';

export const transitionSettings = {
  color: CURTAIN_COLOR,
};

/** 畫布要的是 #rrggbb。面板有時會拿掉井字號 */
function curtainColor() {
  const color = transitionSettings.color.trim();
  return color.startsWith('#') ? color : `#${color}`;
}

let playing: Promise<void> | null = null;

export function isHouseTransitionPlaying() {
  return playing !== null;
}

/** 播放轉場。已經在播就沿用同一個，不要疊兩層黑幕 */
export function playHouseTransition() {
  if (playing) return playing;
  playing = run().finally(() => {
    playing = null;
  });
  return playing;
}

/** 場景載入：黑幕先蓋滿，可選的 prepare 完成後再從中心旋開 */
export function playSceneLoad(prepare?: () => Promise<void>) {
  if (playing) return playing;
  playing = runLoad(prepare).finally(() => {
    playing = null;
  });
  return playing;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function tween(from: number, to: number, duration: number, apply: (value: number) => void) {
  return new Promise<void>((resolve) => {
    const start = performance.now();
    function frame(now: number) {
      const t = Math.min(1, (now - start) / duration);
      apply(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

/** 短邊大約 9 格，方塊才夠大，看得出是在旋，而不是整片一起變黑 */
function gridSize(width: number, height: number) {
  const landscape = width >= height;
  const cols = landscape ? Math.round(COLUMNS_ON_SHORT_SIDE * width / height) : COLUMNS_ON_SHORT_SIDE;
  const rows = landscape ? COLUMNS_ON_SHORT_SIDE : Math.round(COLUMNS_ON_SHORT_SIDE * height / width);
  return { cols: Math.max(cols, 1), rows: Math.max(rows, 1) };
}

/**
 * 從外圈順時針旋到中心的格子順序
 * 關起來時照這個順序塗黑；打開時從最後一格（中心）開始清掉
 */
function spiral(cols: number, rows: number) {
  const cells: { col: number; row: number }[] = [];
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;
  while (top <= bottom && left <= right) {
    for (let col = left; col <= right; col++) cells.push({ col, row: top });
    top++;
    for (let row = top; row <= bottom; row++) cells.push({ col: right, row });
    right--;
    if (top <= bottom) {
      for (let col = right; col >= left; col--) cells.push({ col, row: bottom });
      bottom--;
    }
    if (left <= right) {
      for (let row = bottom; row >= top; row--) cells.push({ col: left, row });
      left++;
    }
  }
  return cells;
}

type Curtain = {
  canvas: HTMLCanvasElement;
  paint: (count: number) => void;
  cellCount: number;
};

function removeSceneCover() {
  document.getElementById('scene-cover')?.remove();
}

/** 鋪一層方塊畫布。畫不出來就拿掉 HTML 蓋板，避免畫面一直被擋住 */
function mountCurtain(): Curtain | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'house-transition';
  canvas.setAttribute('aria-hidden', 'true');
  // 蓋過控制面板和房子名字。轉場進行時擋住點擊，避免連點再播一次、或把房子拖走
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:10000;pointer-events:auto;';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    removeSceneCover();
    return null;
  }

  const { cols, rows } = gridSize(width, height);
  const cells = spiral(cols, rows);
  // 用整數像素切格，相鄰的方塊才會接死，不會露出一條細縫
  function fillCell(col: number, row: number) {
    const x0 = Math.floor(col * width / cols);
    const x1 = Math.floor((col + 1) * width / cols);
    const y0 = Math.floor(row * height / rows);
    const y1 = Math.floor((row + 1) * height / rows);
    ctx!.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  function paint(count: number) {
    ctx!.clearRect(0, 0, width, height);
    ctx!.fillStyle = curtainColor();
    const n = Math.max(0, Math.min(cells.length, count));
    for (let i = 0; i < n; i++) fillCell(cells[i].col, cells[i].row);
  }

  return { canvas, paint, cellCount: cells.length };
}

async function run() {
  const curtain = mountCurtain();
  if (!curtain) return;
  const { canvas, paint, cellCount } = curtain;
  document.body.appendChild(canvas);
  removeSceneCover();
  try {
    await tween(0, cellCount, CLOSE_MS, (value) => paint(Math.floor(value)));
    paint(cellCount);
    await wait(HOLD_MS);
    await tween(cellCount, 0, OPEN_MS, (value) => paint(Math.ceil(value)));
    paint(0);
  } finally {
    canvas.remove();
  }
}

async function runLoad(prepare?: () => Promise<void>) {
  const curtain = mountCurtain();
  if (!curtain) {
    removeSceneCover();
    if (prepare) {
      try {
        await Promise.race([prepare(), wait(18_000)]);
      } catch (err) {
        console.warn('[world] scene load prepare failed:', err);
      }
    }
    return;
  }
  const { canvas, paint, cellCount } = curtain;
  // 先塗滿再掛上，第一眼就是蓋住的，不會先閃出場景
  paint(cellCount);
  document.body.appendChild(canvas);
  removeSceneCover();
  try {
    if (prepare) {
      await Promise.race([prepare(), wait(18_000)]);
    }
    await wait(LOAD_HOLD_MS);
    await tween(cellCount, 0, LOAD_OPEN_MS, (value) => paint(Math.ceil(value)));
    paint(0);
  } catch (err) {
    console.warn('[world] scene load prepare failed, opening anyway:', err);
    paint(0);
  } finally {
    canvas.remove();
    removeSceneCover();
  }
}
