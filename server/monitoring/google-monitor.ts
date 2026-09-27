import type { PegasusEvent } from "../pegasus.js";
import { googleGet } from "./google-oauth.js";

type MailMetadata = {
  id?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};
// A deliberately narrow first collector. Sender/subject are untrusted email
// content, not evidence of a successful login, a compromise, or sender identity.
export function securityMailObservation(
  message: MailMetadata,
  accountId: string,
  now: Date
) {
  if (!message.id || !/^[a-zA-Z0-9_-]+$/.test(message.id)) return null;
  const headers = message.payload?.headers ?? [];
  const from = headers.filter(h => h.name.toLowerCase() === "from");
  const subjects = headers.filter(h => h.name.toLowerCase() === "subject");
  if (from.length !== 1 || subjects.length !== 1) return null;
  const sender = from[0].value.trim().toLowerCase();
  const subject = subjects[0].value;
  if (!/^(?:[^<>\r\n]*<)?no-reply@accounts\.google\.com>?$/.test(sender))
    return null;
  if (
    !/security alert|critical security|password (?:changed|reset)|recovery (?:email|phone)|2.step verification|new sign.in/i.test(
      subject
    )
  )
    return null;
  const timestamp = Number(message.internalDate);
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    timestamp > now.getTime() + 300_000
  )
    return null;
  const event: PegasusEvent = {
    source: "google-mail",
    category: "authentication",
    signal: "SECURITY_EMAIL_REVIEW",
    severity: "medium",
    confidence: 80,
    observedAt: new Date(timestamp),
    details: {
      providerAccountId: accountId,
      messageId: message.id,
      senderVerified: false,
      interpretation:
        "A security-related email was observed. Review it through Google Account; this does not establish a compromise.",
    },
  };
  return {
    externalId: `google:mail:${accountId}:${message.id}`,
    kind: "google.security_email",
    event,
  };
}
export async function monitorGoogleMail(options: {
  accessToken: string;
  accountId: string;
  previousCheckpoint: Record<string, unknown>;
  observedAt: Date;
  fetch?: typeof globalThis.fetch;
}) {
  const start = options.previousCheckpoint.historyId;
  if (typeof start !== "string" || !/^\d+$/.test(start))
    throw new Error("GOOGLE_HISTORY_EXPIRED");
  // Persist unfinished work so a busy mailbox can drain across scheduled runs.
  const previous = options.previousCheckpoint;
  const pending = previous.googlePendingIds;
  if (
    pending !== undefined &&
    (!Array.isArray(pending) ||
      pending.some(
        id => typeof id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(id)
      ))
  )
    throw new Error("GOOGLE_API_FAILED");
  let ids = new Set<string>((pending as string[] | undefined) ?? []);
  let pageToken =
    typeof previous.googleNextPageToken === "string"
      ? previous.googleNextPageToken
      : undefined;
  let historyId =
    typeof previous.googleTargetHistoryId === "string"
      ? previous.googleTargetHistoryId
      : start;
  if (!/^\d+$/.test(historyId)) throw new Error("GOOGLE_API_FAILED");
  if (!ids.size) {
    const query = new URLSearchParams({
      startHistoryId: start,
      historyTypes: "messageAdded",
      maxResults: "10",
    });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await googleGet(
      `history?${query}`,
      options.accessToken,
      options.fetch
    );
    if (
      typeof response.historyId !== "string" ||
      !/^\d+$/.test(response.historyId)
    )
      throw new Error("GOOGLE_API_FAILED");
    historyId = response.historyId;
    for (const item of response.history ?? [])
      for (const added of item.messagesAdded ?? []) {
        if (typeof added.message?.id === "string") ids.add(added.message.id);
      }
    if (ids.size > 1000) throw new Error("GOOGLE_MAIL_BACKLOG");
    pageToken = response.nextPageToken;
    if (pageToken !== undefined && typeof pageToken !== "string")
      throw new Error("GOOGLE_API_FAILED");
  }
  const batch = Array.from(ids);
  const observations = [];
  for (const id of batch.slice(0, 10)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("GOOGLE_API_FAILED");
    const query = new URLSearchParams({ format: "metadata" });
    query.append("metadataHeaders", "From");
    query.append("metadataHeaders", "Subject");
    let message;
    try {
      message = await googleGet(
        `messages/${id}?${query}`,
        options.accessToken,
        options.fetch
      );
    } catch (error) {
      if (error instanceof Error && error.message === "GOOGLE_HISTORY_EXPIRED")
        continue;
      throw error;
    }
    const observation = securityMailObservation(
      message,
      options.accountId,
      options.observedAt
    );
    if (observation) observations.push(observation);
  }
  return {
    checkpoint: {
      ...options.previousCheckpoint,
      historyId: batch.length > 10 || pageToken ? start : historyId,
      googlePendingIds: batch.slice(10),
      googleNextPageToken: pageToken ?? null,
      googleTargetHistoryId: historyId,
    },
    observations,
  };
}
