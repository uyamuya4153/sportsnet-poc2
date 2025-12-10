import * as fs from 'fs';
import * as path from 'path';
import { Config, CheckResult } from './types';
import { launchBrowser } from './scraper';
import { checkTarget, printSummary } from './checker';

/**
 * 設定ファイルを読み込む
 */
function loadConfig(configPath: string): Config {
  if (!fs.existsSync(configPath)) {
    throw new Error(`設定ファイルが見つかりません: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as Config;
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  console.log('========================================');
  console.log('富山県公共施設予約システム 空き監視ツール');
  console.log('========================================\n');

  // 設定ファイルのパスを決定
  const configPath = process.argv[2] || path.join(process.cwd(), 'config.json');
  console.log(`[INFO] 設定ファイル: ${configPath}`);

  // 設定を読み込み
  let config: Config;
  try {
    config = loadConfig(configPath);
    console.log(`[INFO] 監視対象数: ${config.targets.length}`);
  } catch (error) {
    console.error('[ERROR] 設定ファイルの読み込みに失敗しました');
    console.error(error);
    process.exit(1);
  }

  // スクリーンショット保存先を絶対パスに変換
  const screenshotDir = path.isAbsolute(config.screenshotDir)
    ? config.screenshotDir
    : path.join(process.cwd(), config.screenshotDir);

  // ブラウザを起動
  console.log('[INFO] ブラウザを起動中...');
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: CheckResult[] = [];

  try {
    // 各ターゲットをチェック
    for (let i = 0; i < config.targets.length; i++) {
      const target = config.targets[i];
      console.log(`\n[INFO] チェック中 (${i + 1}/${config.targets.length})`);
      console.log(`  施設: ${target.facility}`);
      console.log(`  部屋: ${target.room}`);
      console.log(`  日付: ${target.date}`);
      console.log(`  時間帯: ${target.timeSlots.join(', ')}`);

      const result = await checkTarget(page, target, screenshotDir);
      results.push(result);

      // 次のターゲットとの間に少し待機（サーバー負荷軽減）
      if (i < config.targets.length - 1) {
        await page.waitForTimeout(1000);
      }
    }
  } finally {
    // ブラウザを終了
    console.log('\n[INFO] ブラウザを終了中...');
    await browser.close();
  }

  // 結果サマリーを表示
  printSummary(results);

  // 空きが見つかった場合は終了コード0、見つからなかった場合は1
  const foundCount = results.filter(r => r.availableSlots.length > 0).length;
  process.exit(foundCount > 0 ? 0 : 1);
}

// エントリーポイント
main().catch(error => {
  console.error('[FATAL] 予期しないエラーが発生しました');
  console.error(error);
  process.exit(2);
});
