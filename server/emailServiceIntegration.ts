/**
 * Email Service Integration
 * Supports SendGrid and Mailgun with fallback to console logging for development
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send email using configured service
 * Supports: SendGrid, Mailgun, or console logging (development)
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const emailService = process.env.EMAIL_SERVICE || "console";
  const fromEmail = options.from || process.env.EMAIL_FROM || "noreply@osirisweb.com";

  try {
    if (emailService === "sendgrid") {
      return await sendViaSendGrid(options, fromEmail);
    } else if (emailService === "mailgun") {
      return await sendViaMailgun(options, fromEmail);
    } else {
      // Development/fallback: log to console
      console.log("[Email Service] Development mode - Email would be sent:", {
        to: options.to,
        subject: options.subject,
        from: fromEmail,
      });
      return { success: true, messageId: "dev-" + Date.now() };
    }
  } catch (error) {
    console.error("[Email Service] Failed to send email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send email via SendGrid
 */
async function sendViaSendGrid(
  options: EmailOptions,
  fromEmail: string
): Promise<EmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY environment variable not set");
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: options.to }],
          subject: options.subject,
        },
      ],
      from: { email: fromEmail },
      content: [
        {
          type: "text/html",
          value: options.html,
        },
      ],
      replyTo: options.replyTo ? { email: options.replyTo } : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SendGrid API error: ${response.status} - ${error}`);
  }

  return {
    success: true,
    messageId: response.headers.get("x-message-id") || "sendgrid-" + Date.now(),
  };
}

/**
 * Send email via Mailgun
 */
async function sendViaMailgun(
  options: EmailOptions,
  fromEmail: string
): Promise<EmailResult> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey || !domain) {
    throw new Error("MAILGUN_API_KEY or MAILGUN_DOMAIN environment variable not set");
  }

  const formData = new URLSearchParams();
  formData.append("from", fromEmail);
  formData.append("to", options.to);
  formData.append("subject", options.subject);
  formData.append("html", options.html);
  if (options.text) {
    formData.append("text", options.text);
  }
  if (options.replyTo) {
    formData.append("h:Reply-To", options.replyTo);
  }

  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mailgun API error: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { id: string };
  return {
    success: true,
    messageId: data.id,
  };
}

/**
 * Send HTML email with template
 */
export async function sendTemplatedEmail(
  to: string,
  subject: string,
  templateName: string,
  templateData: Record<string, string | number | boolean>
): Promise<EmailResult> {
  const html = renderEmailTemplate(templateName, templateData);
  return sendEmail({
    to,
    subject,
    html,
  });
}

/**
 * Simple email template renderer
 */
function renderEmailTemplate(
  templateName: string,
  data: Record<string, string | number | boolean>
): string {
  const templates: Record<string, (data: Record<string, string | number | boolean>) => string> = {
    "notification-alert": (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>${data.title}</h2>
        <p>${data.message}</p>
        ${data.actionUrl ? `<a href="${data.actionUrl}" style="background-color: #0ea5e9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">${data.actionLabel || "View"}</a>` : ""}
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="font-size: 12px; color: #6b7280;">OpenOSINT Notifications</p>
      </div>
    `,
    "payment-confirmation": (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Payment Confirmation</h2>
        <p>Thank you for your purchase!</p>
        <p><strong>Amount:</strong> $${data.amount}</p>
        <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
        <p>Your receipt has been sent to this email address.</p>
        <a href="${data.receiptUrl}" style="background-color: #0ea5e9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">View Receipt</a>
      </div>
    `,
    "welcome": (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to OpenOSINT!</h2>
        <p>Hi ${data.name},</p>
        <p>Thank you for joining our community. You now have access to exclusive content and features.</p>
        <a href="${data.dashboardUrl}" style="background-color: #0ea5e9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Go to Dashboard</a>
      </div>
    `,
  };

  const template = templates[templateName];
  if (!template) {
    throw new Error(`Email template "${templateName}" not found`);
  }

  return template(data);
}
