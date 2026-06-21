const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const resolveTimezone = (timezone) => {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  const candidate = timezone || fallback;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch (err) {
    return fallback;
  }
};

const parseTime = (time, fallback = '09:00') => {
  const [hour, minute] = String(time || fallback).split(':').map(Number);
  if (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  ) {
    return { hour, minute, totalMinutes: hour * 60 + minute };
  }

  return parseTime(fallback, '09:00');
};

const getZonedParts = (date, timezone) => {
  const resolvedTimezone = resolveTimezone(timezone);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimezone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    timezone: resolvedTimezone,
    weekday: parts.weekday.toLowerCase(),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
};

const getTimezoneOffsetMs = (date, timezone) => {
  const parts = getZonedParts(date, timezone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
};

const zonedTimeToUtc = (year, month, day, hour, minute, timezone) => {
  const resolvedTimezone = resolveTimezone(timezone);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const firstOffset = getTimezoneOffsetMs(utcGuess, resolvedTimezone);
  const firstCandidate = new Date(utcGuess.getTime() - firstOffset);
  const secondOffset = getTimezoneOffsetMs(firstCandidate, resolvedTimezone);
  return new Date(utcGuess.getTime() - secondOffset);
};

const addCalendarDays = ({ year, month, day }, daysToAdd) => {
  const date = new Date(Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: DAY_NAMES[date.getUTCDay()]
  };
};

const findNextAllowedStart = (now, timezone, days, startTime, offsetDays = 0) => {
  const resolvedTimezone = resolveTimezone(timezone);
  const nowParts = getZonedParts(now, resolvedTimezone);
  const start = parseTime(startTime);

  for (let offset = offsetDays; offset < offsetDays + 14; offset += 1) {
    const candidateDay = addCalendarDays(nowParts, offset);
    const isAllowedDay = !days || days[candidateDay.weekday] !== false;
    if (!isAllowedDay) continue;

    const candidate = zonedTimeToUtc(
      candidateDay.year,
      candidateDay.month,
      candidateDay.day,
      start.hour,
      start.minute,
      resolvedTimezone
    );

    if (candidate > now) return candidate;
  }

  const fallbackDay = addCalendarDays(nowParts, offsetDays + 1);
  return zonedTimeToUtc(fallbackDay.year, fallbackDay.month, fallbackDay.day, start.hour, start.minute, resolvedTimezone);
};

const getZonedDayBounds = (date, timezone) => {
  const resolvedTimezone = resolveTimezone(timezone);
  const parts = getZonedParts(date, resolvedTimezone);
  const nextDay = addCalendarDays(parts, 1);

  return {
    start: zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, resolvedTimezone),
    end: zonedTimeToUtc(nextDay.year, nextDay.month, nextDay.day, 0, 0, resolvedTimezone)
  };
};

const getAutopilotWindowState = (autopilot, now = new Date()) => {
  if (!autopilot?.enabled) {
    return { allowed: true, timezone: resolveTimezone(autopilot?.timezone), zonedNow: getZonedParts(now, autopilot?.timezone) };
  }

  const timezone = resolveTimezone(autopilot.timezone);
  const zonedNow = getZonedParts(now, timezone);
  const start = parseTime(autopilot.startTime, '09:00');
  const end = parseTime(autopilot.endTime, '17:00');
  const currentMinutes = zonedNow.hour * 60 + zonedNow.minute;
  const days = autopilot.days || {};
  const isAllowedDay = days[zonedNow.weekday] !== false;

  if (!isAllowedDay) {
    return {
      allowed: false,
      reason: 'day',
      timezone,
      zonedNow,
      nextRun: findNextAllowedStart(now, timezone, days, autopilot.startTime, 1)
    };
  }

  if (currentMinutes < start.totalMinutes) {
    return {
      allowed: false,
      reason: 'before-window',
      timezone,
      zonedNow,
      nextRun: findNextAllowedStart(now, timezone, days, autopilot.startTime, 0)
    };
  }

  if (currentMinutes > end.totalMinutes) {
    return {
      allowed: false,
      reason: 'after-window',
      timezone,
      zonedNow,
      nextRun: findNextAllowedStart(now, timezone, days, autopilot.startTime, 1)
    };
  }

  return { allowed: true, timezone, zonedNow };
};

module.exports = {
  DAY_NAMES,
  DEFAULT_TIMEZONE,
  resolveTimezone,
  parseTime,
  getZonedParts,
  getZonedDayBounds,
  getAutopilotWindowState
};
