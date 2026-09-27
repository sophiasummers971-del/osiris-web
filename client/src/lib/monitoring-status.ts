const monitoringErrorMessages: Record<string, string> = {
  GOOGLE_REAUTHORIZATION_REQUIRED:
    "Google access expired or was revoked. Connect the account again.",
  GOOGLE_HISTORY_EXPIRED:
    "Google history is no longer available. Coverage has a gap; reconnect to establish a new baseline.",
  GOOGLE_MAIL_BACKLOG:
    "Too much new mail for one bounded check. Monitoring is behind; no history was silently skipped.",
  GOOGLE_NOT_CONFIGURED:
    "Google monitoring is disabled or its configuration is missing.",
  GOOGLE_MONITORING_FAILED:
    "Google monitoring failed. Coverage is not current; retry or review the connection.",
  GITHUB_MONITORING_FAILED:
    "GitHub could not be checked. Try again or reconnect the account.",
  MISSING_ENCRYPTED_TOKEN:
    "The stored GitHub authorization is unavailable. Reconnect the account.",
};

export function formatMonitoringTimestamp(value: Date | string | null) {
  if (!value) return "Not yet";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function describeMonitoringError(errorCode: string | null) {
  if (!errorCode) return null;
  return (
    monitoringErrorMessages[errorCode] ??
    "The latest account check failed. Try again or reconnect the account."
  );
}
