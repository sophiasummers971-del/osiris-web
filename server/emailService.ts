import { getDb, getPendingEmails, updateEmailStatus } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "./emailServiceIntegration";

/**
 * Email configuration
 */
const EMAIL_CONFIG = {
  from: process.env.EMAIL_FROM || "noreply@openosint.com",
};

/**
 * Send email via configured service (SendGrid, Mailgun, or console)
 */
async function sendEmailViaService(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await sendEmail({
      to,
      subject,
      html,
      from: EMAIL_CONFIG.from,
    });
    return result;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Build HTML email template
 */
function buildEmailTemplate(
  title: string,
  message: string,
  actionUrl?: string,
  actionLabel?: string
): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
      .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
      .cta { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; margin-top: 16px; }
      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1 style="margin: 0;">${escapeHtml(title)}</h1>
      </div>
      <div class="content">
        <p>${escapeHtml(message)}</p>
        ${
          actionUrl
            ? `<a href="${escapeHtml(actionUrl)}" class="cta">${escapeHtml(actionLabel || "View More")}</a>`
            : ""
        }
      </div>
      <div class="footer">
        <p>© 2026 OpenOSINT. All rights reserved.</p>
        <p><a href="https://openosint.com/preferences" style="color: #667eea;">Manage notification preferences</a></p>
      </div>
    </div>
  </body>
</html>
  `;
}

/**
 * Escape HTML to prevent injection
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Process pending emails from the queue
 * Should be called periodically (e.g., every 5 minutes via cron)
 */
export async function processPendingEmails(): Promise<{
  processed: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) {
    console.warn("[Email] Database not available");
    return { processed: 0, failed: 0 };
  }

  try {
    const pendingEmails = await getPendingEmails(50);
    let processed = 0;
    let failed = 0;

    for (const email of pendingEmails) {
      try {
        const result = await sendEmailViaService(
          email.recipientEmail,
          email.subject,
          email.htmlBody
        );

        if (result.success) {
          await updateEmailStatus(email.id, "sent");
          processed++;
        } else {
          // Retry up to 3 times before marking as failed
          if (email.attemptCount >= 3) {
            await updateEmailStatus(email.id, "failed", result.error);
            failed++;
          } else {
            // Will retry on next run
            console.log(
              `[Email] Retrying email ${email.id} (attempt ${email.attemptCount + 1})`
            );
          }
        }
      } catch (error) {
        console.error(`[Email] Error processing email ${email.id}:`, error);
        failed++;
      }
    }

    console.log(`[Email] Processed ${processed} emails, ${failed} failed`);
    return { processed, failed };
  } catch (error) {
    console.error("[Email] Failed to process pending emails:", error);
    return { processed: 0, failed: 0 };
  }
}

/**
 * Send a notification email to a user
 */
export async function sendNotificationEmail(
  userId: number,
  title: string,
  message: string,
  actionUrl?: string,
  actionLabel?: string
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Email] Database not available");
    return false;
  }

  try {
    // Get user email
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user[0]?.email) {
      console.warn(`[Email] User ${userId} has no email address`);
      return false;
    }

    const htmlBody = buildEmailTemplate(title, message, actionUrl, actionLabel);

    // Send immediately (or queue for later processing)
    const result = await sendEmailViaService(user[0].email, title, htmlBody);

    return result.success;
  } catch (error) {
    console.error("[Email] Failed to send notification email:", error);
    return false;
  }
}

export { buildEmailTemplate, sendEmailViaService };
