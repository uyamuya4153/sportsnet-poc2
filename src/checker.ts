import * as fs from 'fs';
import * as path from 'path';
import { Page } from 'playwright';
import { Target, CheckResult, RoomAvailability } from './types';
import {
  navigateToFacility,
  navigateToDate,
  parseAvailabilityTable,
  takeScreenshot,
} from './scraper';

/**
 * 時間文字列を正規化（"9:00" と "9" を同一視）
 */
function normalizeTime(time: string): string {
  // 「9:00」→「9」、「13:30」→「13:30」のように処理
  const match = time.match(/^(\d+):?(\d*)$/);
  if (!match) return time;

  const hour = match[1];
  const minute = match[2] || '00';

  if (minute === '00') {
    return hour;
  }
  return `${hour}:${minute}`;
}

/**
 * 2つの時間が一致するか判定
 */
function timesMatch(time1: string, time2: string): boolean {
  const n1 = normalizeTime(time1);
  const n2 = normalizeTime(time2);

  // 完全一致
  if (n1 === n2) return true;

  // 「9」と「9:00」の比較
  if (n1 === n2.split(':')[0]) return true;
  if (n2 === n1.split(':')[0]) return true;

  return false;
}

/**
 * 指定した部屋の指定時間帯に空きがあるかチェック
 */
function findAvailableSlots(
  roomData: RoomAvailability,
  targetTimeSlots: string[]
): string[] {
  const availableSlots: string[] = [];

  for (const targetTime of targetTimeSlots) {
    for (const slot of roomData.timeSlots) {
      if (timesMatch(slot.time, targetTime) && slot.status === 'available') {
        availableSlots.push(targetTime);
        break;
      }
    }
  }

  return availableSlots;
}

/**
 * スクリーンショットのファイル名を生成
 */
function generateScreenshotFilename(
  target: Target,
  screenshotDir: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const facilityShort = target.facility.replace(/[\\/:*?"<>|]/g, '_').slice(0, 20);
  const roomShort = target.room.replace(/[\\/:*?"<>|]/g, '_').slice(0, 20);
  const filename = `${target.date}_${facilityShort}_${roomShort}_${timestamp}.png`;
  return path.join(screenshotDir, filename);
}

/**
 * 単一のターゲットをチェック
 */
export async function checkTarget(
  page: Page,
  target: Target,
  screenshotDir: string
): Promise<CheckResult> {
  const result: CheckResult = {
    facility: target.facility,
    room: target.room,
    date: target.date,
    availableSlots: [],
    checkedAt: new Date(),
  };

  try {
    // 施設ページに移動
    console.log(`[INFO] 施設を確認中: ${target.facility}`);
    await navigateToFacility(page, target.facility);

    // 指定日付に移動
    console.log(`[INFO] 日付を移動中: ${target.date}`);
    await navigateToDate(page, target.date);

    // デバッグ用にスクリーンショットを保存
    await takeScreenshot(page, './screenshots/debug_page.png');
    console.log(`[DEBUG] デバッグ用スクリーンショット保存: ./screenshots/debug_page.png`);

    // 空き状況を解析
    console.log(`[INFO] 空き状況を解析中...`);
    const availabilityData = await parseAvailabilityTable(page);

    // デバッグ: 取得した全ての部屋名を表示
    console.log(`[DEBUG] 取得した部屋数: ${availabilityData.length}`);
    for (const room of availabilityData) {
      console.log(`[DEBUG]   部屋名: "${room.roomName}" (時間枠数: ${room.timeSlots.length})`);
    }

    // 対象の部屋を検索（同名の部屋が複数ある場合はすべて取得）
    const matchingRooms = availabilityData.filter(
      room => room.roomName.includes(target.room) || target.room.includes(room.roomName)
    );

    if (matchingRooms.length === 0) {
      console.log(`[WARN] 部屋が見つかりません: ${target.room}`);
      return result;
    }

    console.log(`[DEBUG] マッチした部屋数: ${matchingRooms.length}`);

    // すべてのマッチした部屋から空き時間帯を収集
    const allAvailableSlots = new Set<string>();

    for (let i = 0; i < matchingRooms.length; i++) {
      const roomData = matchingRooms[i];
      console.log(`[DEBUG] 部屋 ${i + 1}: "${roomData.roomName}"`);

      for (const slot of roomData.timeSlots) {
        console.log(`[DEBUG]   ${slot.time}: ${slot.status}`);
      }

      // この部屋の空き時間帯をチェック
      const availableSlots = findAvailableSlots(roomData, target.timeSlots);
      for (const slot of availableSlots) {
        allAvailableSlots.add(slot);
      }
    }

    result.availableSlots = Array.from(allAvailableSlots);

    // 空きがあればスクリーンショットを保存
    if (result.availableSlots.length > 0) {
      // screenshotDirが存在しない場合は作成
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      const screenshotPath = generateScreenshotFilename(target, screenshotDir);
      await takeScreenshot(page, screenshotPath);
      result.screenshotPath = screenshotPath;

      console.log(`[SUCCESS] 空きを発見!`);
      console.log(`  施設: ${target.facility}`);
      console.log(`  部屋: ${target.room}`);
      console.log(`  日付: ${target.date}`);
      console.log(`  空き時間帯: ${result.availableSlots.join(', ')}`);
      console.log(`  スクリーンショット: ${screenshotPath}`);
    } else {
      console.log(`[INFO] 空きなし: ${target.facility} / ${target.room} / ${target.date}`);
    }
  } catch (error) {
    console.error(`[ERROR] チェック中にエラーが発生: ${target.facility}`);
    console.error(error);
  }

  return result;
}

/**
 * 結果のサマリーを表示
 */
export function printSummary(results: CheckResult[]): void {
  console.log('\n========================================');
  console.log('チェック結果サマリー');
  console.log('========================================');

  const foundCount = results.filter(r => r.availableSlots.length > 0).length;
  console.log(`総チェック数: ${results.length}`);
  console.log(`空きが見つかった件数: ${foundCount}`);

  if (foundCount > 0) {
    console.log('\n空きが見つかった対象:');
    for (const result of results) {
      if (result.availableSlots.length > 0) {
        console.log(`  - ${result.facility} / ${result.room} / ${result.date}`);
        console.log(`    時間帯: ${result.availableSlots.join(', ')}`);
        if (result.screenshotPath) {
          console.log(`    スクリーンショット: ${result.screenshotPath}`);
        }
      }
    }
  }

  console.log('========================================\n');
}
