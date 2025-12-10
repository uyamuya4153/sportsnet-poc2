"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const scraper_1 = require("./scraper");
const checker_1 = require("./checker");
/**
 * 設定ファイルを読み込む
 */
function loadConfig(configPath) {
    if (!fs.existsSync(configPath)) {
        throw new Error(`設定ファイルが見つかりません: ${configPath}`);
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
}
/**
 * メイン処理
 */
async function main() {
    console.log('========================================');
    console.log('富山県公共施設予約システム 空き監視ツール');
    console.log('========================================\n');
    // 設定ファイルのパスを決定
    const configPath = process.argv[2] || path.join(process.cwd(), 'config.json');
    console.log(`[INFO] 設定ファイル: ${configPath}`);
    // 設定を読み込み
    let config;
    try {
        config = loadConfig(configPath);
        console.log(`[INFO] 監視対象数: ${config.targets.length}`);
    }
    catch (error) {
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
    const browser = await (0, scraper_1.launchBrowser)();
    const context = await browser.newContext();
    const page = await context.newPage();
    const results = [];
    try {
        // 各ターゲットをチェック
        for (let i = 0; i < config.targets.length; i++) {
            const target = config.targets[i];
            console.log(`\n[INFO] チェック中 (${i + 1}/${config.targets.length})`);
            console.log(`  施設: ${target.facility}`);
            console.log(`  部屋: ${target.room}`);
            console.log(`  日付: ${target.date}`);
            console.log(`  時間帯: ${target.timeSlots.join(', ')}`);
            const result = await (0, checker_1.checkTarget)(page, target, screenshotDir);
            results.push(result);
            // 次のターゲットとの間に少し待機（サーバー負荷軽減）
            if (i < config.targets.length - 1) {
                await page.waitForTimeout(1000);
            }
        }
    }
    finally {
        // ブラウザを終了
        console.log('\n[INFO] ブラウザを終了中...');
        await browser.close();
    }
    // 結果サマリーを表示
    (0, checker_1.printSummary)(results);
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
//# sourceMappingURL=index.js.map