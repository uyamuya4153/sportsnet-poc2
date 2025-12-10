import { chromium, Browser, Page } from 'playwright';
import { RoomAvailability, TimeSlotStatus, AvailabilityStatus } from './types';

const BASE_URL = 'https://k4.p-kashikan.jp/toyama-pref/';

/**
 * Playwrightブラウザを起動
 */
export async function launchBrowser(): Promise<Browser> {
  return await chromium.launch({
    headless: true,
  });
}

/**
 * 施設の空き状況ページに移動
 */
export async function navigateToFacility(
  page: Page,
  facilityName: string
): Promise<void> {
  // トップページにアクセス
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // 「施設の空きを見る」をクリック
  await page.click('text=施設 の空きを見る');
  await page.waitForLoadState('networkidle');

  // 施設一覧が表示されるのを待つ
  await page.waitForTimeout(1000);

  // 施設一覧から目的の施設を選択
  const facilityRadio = page.getByRole('radio', { name: facilityName });
  await facilityRadio.click();

  // 施設選択後、空き状況テーブルのヘッダー（時間帯）が表示されるのを待つ
  // h3に施設名と日付が表示されるのが空き状況画面の特徴
  await page.waitForSelector('h3:has-text("年")', { timeout: 15000 });

  // 空き状況テーブルが完全に読み込まれるのを待つ
  await page.waitForTimeout(1000);
}

/**
 * 指定した日付に移動
 * @param page Playwrightのページ
 * @param targetDate 目標日付（YYYY-MM-DD形式）
 */
export async function navigateToDate(
  page: Page,
  targetDate: string
): Promise<void> {
  const target = new Date(targetDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 日数差を計算
  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // 本日の場合は移動不要
    return;
  }

  // 月の差を計算して月単位で移動
  const diffMonths =
    (target.getFullYear() - today.getFullYear()) * 12 +
    (target.getMonth() - today.getMonth());

  // 月単位で移動
  for (let i = 0; i < Math.abs(diffMonths); i++) {
    if (diffMonths > 0) {
      await page.click('text=1ヶ月後');
    } else {
      await page.click('text=1ヶ月前');
    }
    await page.waitForLoadState('networkidle');
  }

  // カレンダーを開いて日付をクリック
  const calendarButton = page.locator('text=カレンダーを開く');
  if (await calendarButton.isVisible()) {
    await calendarButton.click();
    await page.waitForTimeout(500);
  }

  // 日付をクリック（日にちの数字）
  const day = target.getDate().toString();
  await page.click(`table >> text="${day}"`);
  await page.waitForLoadState('networkidle');

  // 空き状況テーブルが再読み込みされるのを待つ
  await page.waitForTimeout(2000);
}

/**
 * セルのテキストから空き状況を判定
 */
function parseAvailabilityStatus(cellText: string): AvailabilityStatus {
  const text = cellText.trim();
  if (text === '●' || text === '〇') {
    return 'available';
  } else if (text === '×') {
    return 'reserved';
  } else if (text === '-') {
    return 'outside_period';
  } else if (text === '不可' || text === '休館・保守') {
    return 'unavailable';
  }
  return 'unknown';
}

/**
 * 時間ヘッダーから時間枠の時間を取得
 * テーブルのヘッダーは「9」「10」「11」のように表示されている
 * 各時間に対して30分刻みで2つのセルがある（9:00-9:30, 9:30-10:00）
 */
function getTimeFromIndex(headerHours: string[], cellIndex: number): string {
  // cellIndexは0始まり、各時間に2つのセルがある
  const hourIndex = Math.floor(cellIndex / 2);
  const isFirstHalf = cellIndex % 2 === 0;

  if (hourIndex >= headerHours.length) {
    return 'unknown';
  }

  const hour = parseInt(headerHours[hourIndex], 10);
  if (isFirstHalf) {
    return `${hour}:00`;
  } else {
    return `${hour}:30`;
  }
}

/**
 * 空き状況テーブルを解析
 */
export async function parseAvailabilityTable(
  page: Page
): Promise<RoomAvailability[]> {
  const results: RoomAvailability[] = [];

  // ページ安定化のために少し待機
  await page.waitForTimeout(1000);

  // JavaScript評価でDOMから直接データを取得
  const tableData = await page.evaluate(() => {
    const data: { roomName: string; cells: string[] }[] = [];

    // すべてのテーブルを取得
    const tables = document.querySelectorAll('table');

    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        const roomName = cells[0]?.textContent?.trim() || '';
        // 「施設」ヘッダー行やヘッダー行をスキップ
        if (!roomName || roomName === '施設' || roomName === '●' || roomName === '×') return;

        const cellTexts: string[] = [];
        for (let i = 1; i < cells.length; i++) {
          cellTexts.push(cells[i]?.textContent?.trim() || '');
        }

        if (cellTexts.length > 0) {
          data.push({ roomName, cells: cellTexts });
        }
      });
    });

    return data;
  });

  // デフォルトの時間帯（サイトの仕様から推測）
  const headerHours = ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

  // 取得したデータを変換
  for (const row of tableData) {
    const timeSlots: TimeSlotStatus[] = [];

    for (let i = 0; i < row.cells.length; i++) {
      const cellText = row.cells[i];
      const status = parseAvailabilityStatus(cellText);
      const time = getTimeFromIndex(headerHours, i);

      timeSlots.push({
        time,
        status,
      });
    }

    if (timeSlots.length > 0) {
      results.push({
        roomName: row.roomName,
        timeSlots,
      });
    }
  }

  return results;
}

/**
 * スクリーンショットを取得
 */
export async function takeScreenshot(
  page: Page,
  path: string
): Promise<void> {
  await page.screenshot({
    path,
    fullPage: true,
  });
}
