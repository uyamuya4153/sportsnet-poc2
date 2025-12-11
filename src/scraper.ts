import { chromium, Browser, Page } from 'playwright-core';
import { RoomAvailability, TimeSlotStatus, AvailabilityStatus } from './types';

const BASE_URL = 'https://k4.p-kashikan.jp/toyama-pref/';

/**
 * Playwrightブラウザを起動
 * Lambda環境では @sparticuz/chromium を使用
 */
export async function launchBrowser(): Promise<Browser> {
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isLambda) {
    // Lambda環境: @sparticuz/chromium を使用
    const chromiumLambda = await import('@sparticuz/chromium');
    const executablePath = await chromiumLambda.default.executablePath();

    return await chromium.launch({
      args: chromiumLambda.default.args,
      executablePath,
      headless: true,
    });
  } else {
    // ローカル環境: 通常のPlaywrightを使用
    const playwrightFull = await import('playwright');
    return await playwrightFull.chromium.launch({
      headless: true,
    });
  }
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

  // 「施設の空き状況」タブをクリックして、1日の全時間帯を表示
  // すでに選択されている場合（class="tab on"）はスキップ
  const facilityTabLink = page.locator('a:has-text("施設の空き状況"):not(.on)');
  if (await facilityTabLink.count() > 0) {
    await facilityTabLink.click({ force: true });
    await page.waitForTimeout(2000);
  }

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
  // 空き: ●（黒丸）、〇（二重丸/白丸）、○（丸）
  if (text === '●' || text === '〇' || text === '○') {
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
 * 施設によって異なる時間刻みがある:
 * - 30分刻み: セル数がヘッダー時間数の2倍
 * - 1時間刻み: セル数がヘッダー時間数と同じ
 * - 2時間刻み: セル数がヘッダー時間数の半分（colspanで2時間ずつ表示）
 */
function getTimeFromIndex(headerHours: string[], cellIndex: number, totalCells: number): string[] {
  const headerCount = headerHours.length;

  // セル数とヘッダー数の比率で刻みを判定
  const ratio = totalCells / headerCount;

  if (ratio >= 1.5) {
    // 30分刻み: 各時間に2つのセル
    const hourIndex = Math.floor(cellIndex / 2);
    const isFirstHalf = cellIndex % 2 === 0;

    if (hourIndex >= headerCount) {
      return ['unknown'];
    }

    const hour = parseInt(headerHours[hourIndex], 10);
    if (isFirstHalf) {
      return [`${hour}:00`];
    } else {
      return [`${hour}:30`];
    }
  } else if (ratio >= 0.8) {
    // 1時間刻み: 各時間に1つのセル
    if (cellIndex >= headerCount) {
      return ['unknown'];
    }

    const hour = parseInt(headerHours[cellIndex], 10);
    return [`${hour}:00`];
  } else {
    // 2時間刻み（または複数時間刻み）: 各セルが複数時間をカバー
    // セル数からスパン数を計算
    const hoursPerCell = Math.round(headerCount / totalCells);
    const startHourIndex = cellIndex * hoursPerCell;

    const times: string[] = [];
    for (let i = 0; i < hoursPerCell && (startHourIndex + i) < headerCount; i++) {
      const hour = parseInt(headerHours[startHourIndex + i], 10);
      times.push(`${hour}:00`);
    }

    return times.length > 0 ? times : ['unknown'];
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

  // デバッグ: テーブルの構造を確認
  const debugInfo = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    const info: string[] = [];
    tables.forEach((table, idx) => {
      const rows = table.querySelectorAll('tr');
      info.push(`Table ${idx}: ${rows.length} rows`);
      if (rows.length > 0) {
        const firstRow = rows[0];
        const cells = firstRow.querySelectorAll('th, td');
        const cellTexts = Array.from(cells).map(c => c.textContent?.trim()).join(' | ');
        info.push(`  First row: ${cellTexts}`);
      }
    });
    return info;
  });
  console.log('[DEBUG] テーブル構造:');
  debugInfo.forEach(line => console.log(`  ${line}`));

  // JavaScript評価でDOMから直接データを取得
  const tableData = await page.evaluate(() => {
    const data: { roomName: string; cells: string[]; headerHours: string[] }[] = [];

    // すべてのテーブルを取得
    const tables = document.querySelectorAll('table');

    // 最初にヘッダーテーブルを見つけて時間帯を取得
    let globalHeaderHours: string[] = [];
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) return;

      const firstRow = rows[0];
      const cells = firstRow.querySelectorAll('th, td');

      cells.forEach(cell => {
        const text = cell.textContent?.trim() || '';
        if (text === '施設') {
          // このテーブルがヘッダーテーブル
          cells.forEach(c => {
            const t = c.textContent?.trim() || '';
            if (/^\d+$/.test(t)) {
              globalHeaderHours.push(t);
            }
          });
        }
      });
    });

    // 次に各テーブルからデータを収集
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) return;

      // 各行を処理
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length === 0) return;

        const roomName = cells[0]?.textContent?.trim() || '';

        // スキップすべき行
        if (!roomName || roomName === '施設') return;
        if (/^\d+月$/.test(roomName)) return;
        if (/^\d+$/.test(roomName)) return;
        if (['●', '×', '〇', '-', '空き', '予約済'].includes(roomName)) return;
        if (roomName.includes('ヶ月') || roomName.includes('週間') || roomName.includes('日前') || roomName.includes('日後')) return;
        if (roomName === '本日' || roomName === '前へ' || roomName === '次へ') return;
        if (roomName.includes('地域') || roomName.includes('圏域')) return;
        if (roomName.includes('日') && roomName.includes('週間')) return;

        const cellTexts: string[] = [];
        for (let j = 1; j < cells.length; j++) {
          cellTexts.push(cells[j]?.textContent?.trim() || '');
        }

        // 有効なデータ行（空き状況のセルが存在する）
        if (cellTexts.length > 0 && cellTexts.some(c => ['●', '×', '〇', '○', '-'].includes(c))) {
          data.push({ roomName, cells: cellTexts, headerHours: globalHeaderHours });
        }
      });
    });

    return data;
  });

  // 取得したデータを変換
  for (const row of tableData) {
    const timeSlots: TimeSlotStatus[] = [];

    // ヘッダーから時間帯を取得（なければデフォルト）
    const headerHours = row.headerHours.length > 0
      ? row.headerHours
      : ['9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

    const totalCells = row.cells.length;

    for (let i = 0; i < row.cells.length; i++) {
      const cellText = row.cells[i];
      const status = parseAvailabilityStatus(cellText);
      const times = getTimeFromIndex(headerHours, i, totalCells);

      // 各時間帯に同じステータスを設定（複数時間をカバーするセルの場合）
      for (const time of times) {
        timeSlots.push({
          time,
          status,
        });
      }
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
