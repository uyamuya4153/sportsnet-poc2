import { Browser, Page } from 'playwright';
import { RoomAvailability } from './types';
/**
 * Playwrightブラウザを起動
 */
export declare function launchBrowser(): Promise<Browser>;
/**
 * 施設の空き状況ページに移動
 */
export declare function navigateToFacility(page: Page, facilityName: string): Promise<void>;
/**
 * 指定した日付に移動
 * @param page Playwrightのページ
 * @param targetDate 目標日付（YYYY-MM-DD形式）
 */
export declare function navigateToDate(page: Page, targetDate: string): Promise<void>;
/**
 * 空き状況テーブルを解析
 */
export declare function parseAvailabilityTable(page: Page): Promise<RoomAvailability[]>;
/**
 * スクリーンショットを取得
 */
export declare function takeScreenshot(page: Page, path: string): Promise<void>;
//# sourceMappingURL=scraper.d.ts.map