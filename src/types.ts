/**
 * 監視対象の施設・日付・時間帯の設定
 */
export interface Target {
  /** 施設名（例: "富山県総合体育センター"） */
  facility: string;
  /** 部屋名（例: "大アリーナ全面"） */
  room: string;
  /** 監視対象の日付（YYYY-MM-DD形式） */
  date: string;
  /** 監視対象の時間帯（例: ["9:00", "10:00", "13:00"]） */
  timeSlots: string[];
}

/**
 * 設定ファイルの構造
 */
export interface Config {
  /** 監視対象のリスト */
  targets: Target[];
  /** スクリーンショット保存先ディレクトリ */
  screenshotDir: string;
}

/**
 * 空き状況の種類
 */
export type AvailabilityStatus =
  | 'available'      // 空き（●）
  | 'reserved'       // 予約済み（×）
  | 'outside_period' // 受付期間外（-）
  | 'unavailable'    // 利用不可
  | 'unknown';       // 不明

/**
 * 時間枠ごとの空き状況
 */
export interface TimeSlotStatus {
  /** 時間（例: "9:00"） */
  time: string;
  /** 空き状況 */
  status: AvailabilityStatus;
}

/**
 * 部屋ごとの空き状況
 */
export interface RoomAvailability {
  /** 部屋名 */
  roomName: string;
  /** 各時間枠の空き状況 */
  timeSlots: TimeSlotStatus[];
}

/**
 * 施設の空き状況チェック結果
 */
export interface CheckResult {
  /** 施設名 */
  facility: string;
  /** 部屋名 */
  room: string;
  /** 日付 */
  date: string;
  /** 空きが見つかった時間帯 */
  availableSlots: string[];
  /** スクリーンショットのパス（空きがあった場合） */
  screenshotPath?: string;
  /** チェック日時 */
  checkedAt: Date;
}
