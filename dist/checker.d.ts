import { Page } from 'playwright';
import { Target, CheckResult } from './types';
/**
 * 単一のターゲットをチェック
 */
export declare function checkTarget(page: Page, target: Target, screenshotDir: string): Promise<CheckResult>;
/**
 * 結果のサマリーを表示
 */
export declare function printSummary(results: CheckResult[]): void;
//# sourceMappingURL=checker.d.ts.map