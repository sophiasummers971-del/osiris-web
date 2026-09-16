const monitoringErrorMessages: Record<string, string> = {
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
