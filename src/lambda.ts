import { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { launchBrowser } from './scraper';
import { checkTarget } from './checker';
import { DynamoDBTarget, CheckResult, LambdaResult, Target } from './types';

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'facility-availability-targets';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * 未チェックの監視対象をDynamoDBから取得
 */
async function getUncheckedTargets(): Promise<DynamoDBTarget[]> {
  const command = new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'checked = :checked',
    ExpressionAttributeValues: {
      ':checked': false,
    },
  });

  const response = await docClient.send(command);
  return (response.Items || []) as DynamoDBTarget[];
}

/**
 * 監視対象を更新（空きが見つかった場合）
 */
async function markAsChecked(
  pk: string,
  foundSlots: string[]
): Promise<void> {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk },
    UpdateExpression: 'SET checked = :checked, foundSlots = :foundSlots, foundAt = :foundAt, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':checked': true,
      ':foundSlots': foundSlots,
      ':foundAt': new Date().toISOString(),
      ':updatedAt': new Date().toISOString(),
    },
  });

  await docClient.send(command);
}

/**
 * Lambdaハンドラー
 */
export const handler: Handler = async (): Promise<LambdaResult> => {
  console.log('[INFO] Lambda実行開始');
  console.log(`[INFO] テーブル名: ${TABLE_NAME}`);

  // 監視対象を取得
  const targets = await getUncheckedTargets();
  console.log(`[INFO] 監視対象数: ${targets.length}`);

  if (targets.length === 0) {
    console.log('[INFO] 監視対象がありません');
    return {
      statusCode: 200,
      body: {
        totalTargets: 0,
        checkedTargets: 0,
        foundAvailability: 0,
        results: [],
      },
    };
  }

  // ブラウザを起動
  console.log('[INFO] ブラウザを起動中...');
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: CheckResult[] = [];

  try {
    for (const dbTarget of targets) {
      const target: Target = {
        facility: dbTarget.facility,
        room: dbTarget.room,
        date: dbTarget.date,
        timeSlots: dbTarget.timeSlots,
      };

      console.log(`[INFO] チェック中: ${target.facility} / ${target.room} / ${target.date}`);

      // スクリーンショットは不要なので screenshotDir を省略
      const result = await checkTarget(page, target);
      results.push(result);

      // 空きが見つかった場合はDynamoDBを更新
      if (result.availableSlots.length > 0) {
        console.log(`[SUCCESS] 空き発見: ${result.availableSlots.join(', ')}`);
        await markAsChecked(dbTarget.pk, result.availableSlots);
        console.log(`[INFO] DynamoDB更新完了: checked=true`);
      }

      // 次のターゲットとの間に少し待機（サイトへの負荷軽減）
      await page.waitForTimeout(1000);
    }
  } finally {
    console.log('[INFO] ブラウザを終了中...');
    await browser.close();
  }

  // 結果サマリー
  const foundCount = results.filter(r => r.availableSlots.length > 0).length;
  console.log(`[INFO] 結果: ${targets.length}件中 ${foundCount}件で空き発見`);

  // 詳細結果をJSON出力（CloudWatch Logs用）
  console.log('[RESULT]', JSON.stringify({
    timestamp: new Date().toISOString(),
    totalTargets: targets.length,
    foundAvailability: foundCount,
    results: results.map(r => ({
      facility: r.facility,
      room: r.room,
      date: r.date,
      availableSlots: r.availableSlots,
      checkedAt: r.checkedAt,
    })),
  }));

  return {
    statusCode: 200,
    body: {
      totalTargets: targets.length,
      checkedTargets: targets.length,
      foundAvailability: foundCount,
      results,
    },
  };
};
