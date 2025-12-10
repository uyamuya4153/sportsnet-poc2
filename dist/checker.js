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
exports.checkTarget = checkTarget;
exports.printSummary = printSummary;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const scraper_1 = require("./scraper");
/**
 * 時間文字列を正規化（"9:00" と "9" を同一視）
 */
function normalizeTime(time) {
    // 「9:00」→「9」、「13:30」→「13:30」のように処理
    const match = time.match(/^(\d+):?(\d*)$/);
    if (!match)
        return time;
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
function timesMatch(time1, time2) {
    const n1 = normalizeTime(time1);
    const n2 = normalizeTime(time2);
    // 完全一致
    if (n1 === n2)
        return true;
    // 「9」と「9:00」の比較
    if (n1 === n2.split(':')[0])
        return true;
    if (n2 === n1.split(':')[0])
        return true;
    return false;
}
/**
 * 指定した部屋の指定時間帯に空きがあるかチェック
 */
function findAvailableSlots(roomData, targetTimeSlots) {
    const availableSlots = [];
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
function generateScreenshotFilename(target, screenshotDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const facilityShort = target.facility.replace(/[\\/:*?"<>|]/g, '_').slice(0, 20);
    const roomShort = target.room.replace(/[\\/:*?"<>|]/g, '_').slice(0, 20);
    const filename = `${target.date}_${facilityShort}_${roomShort}_${timestamp}.png`;
    return path.join(screenshotDir, filename);
}
/**
 * 単一のターゲットをチェック
 */
async function checkTarget(page, target, screenshotDir) {
    const result = {
        facility: target.facility,
        room: target.room,
        date: target.date,
        availableSlots: [],
        checkedAt: new Date(),
    };
    try {
        // 施設ページに移動
        console.log(`[INFO] 施設を確認中: ${target.facility}`);
        await (0, scraper_1.navigateToFacility)(page, target.facility);
        // 指定日付に移動
        console.log(`[INFO] 日付を移動中: ${target.date}`);
        await (0, scraper_1.navigateToDate)(page, target.date);
        // 空き状況を解析
        console.log(`[INFO] 空き状況を解析中...`);
        const availabilityData = await (0, scraper_1.parseAvailabilityTable)(page);
        // 対象の部屋を検索
        const roomData = availabilityData.find(room => room.roomName.includes(target.room) || target.room.includes(room.roomName));
        if (!roomData) {
            console.log(`[WARN] 部屋が見つかりません: ${target.room}`);
            return result;
        }
        // 指定時間帯の空きをチェック
        const availableSlots = findAvailableSlots(roomData, target.timeSlots);
        result.availableSlots = availableSlots;
        // 空きがあればスクリーンショットを保存
        if (availableSlots.length > 0) {
            // screenshotDirが存在しない場合は作成
            if (!fs.existsSync(screenshotDir)) {
                fs.mkdirSync(screenshotDir, { recursive: true });
            }
            const screenshotPath = generateScreenshotFilename(target, screenshotDir);
            await (0, scraper_1.takeScreenshot)(page, screenshotPath);
            result.screenshotPath = screenshotPath;
            console.log(`[SUCCESS] 空きを発見!`);
            console.log(`  施設: ${target.facility}`);
            console.log(`  部屋: ${target.room}`);
            console.log(`  日付: ${target.date}`);
            console.log(`  空き時間帯: ${availableSlots.join(', ')}`);
            console.log(`  スクリーンショット: ${screenshotPath}`);
        }
        else {
            console.log(`[INFO] 空きなし: ${target.facility} / ${target.room} / ${target.date}`);
        }
    }
    catch (error) {
        console.error(`[ERROR] チェック中にエラーが発生: ${target.facility}`);
        console.error(error);
    }
    return result;
}
/**
 * 結果のサマリーを表示
 */
function printSummary(results) {
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
//# sourceMappingURL=checker.js.map