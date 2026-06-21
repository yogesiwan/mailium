export const COMMON_TIMEZONES = [
  'Asia/Kolkata',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC'
];

export const getBrowserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

export const formatDateTime = (value, timezone) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || getBrowserTimezone()
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
};
