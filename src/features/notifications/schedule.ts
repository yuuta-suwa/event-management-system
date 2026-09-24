export type EventNotificationConfig = {
  eveNotificationEnabled: boolean;
  eveNotificationTime: string;
  dayOfNotificationEnabled: boolean;
  dayOfNotificationTime: string;
  beforeStartNotificationEnabled: boolean;
  beforeStartNotificationMinutes: number;
};

export type ScheduleRuleType = "EVENT_EVE" | "EVENT_DAY_OF" | "EVENT_THREE_HOURS";

export type NotificationRule = { type: ScheduleRuleType; label: string; scheduledAt: Date; enabled: boolean };

function jstClockOnDate(jstMidnight: Date, hhmm: string, dayOffset: number): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(jstMidnight.getTime() + dayOffset * 86400000 + ((h || 0) * 60 + (m || 0)) * 60000);
}

export function beforeStartLabel(minutes: number) {
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}時間前` : `${minutes}分前`;
}

export function notificationRules(event: { eventDate: Date; startTime: Date }, config: EventNotificationConfig): NotificationRule[] {
  return [
    { type: "EVENT_EVE", label: "前日通知", scheduledAt: jstClockOnDate(event.eventDate, config.eveNotificationTime, -1), enabled: config.eveNotificationEnabled },
    { type: "EVENT_DAY_OF", label: "当日通知", scheduledAt: jstClockOnDate(event.eventDate, config.dayOfNotificationTime, 0), enabled: config.dayOfNotificationEnabled },
    { type: "EVENT_THREE_HOURS", label: `開始${beforeStartLabel(config.beforeStartNotificationMinutes)}通知`, scheduledAt: new Date(event.startTime.getTime() - config.beforeStartNotificationMinutes * 60000), enabled: config.beforeStartNotificationEnabled },
  ];
}
