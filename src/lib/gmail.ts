import { google } from "googleapis";

// ─── Types ─────────────────────────────────────────────────

interface SendEmailParams {
  userEmail: string;
  accessToken: string;
  refreshToken?: string;
  to: string;
  subject: string;
  body: string;
  attachments: Array<{
    filename: string;
    content: Buffer;
    mimeType: string;
  }>;
}

// ─── Get OAuth2 Client with User Tokens ────────────────────

function getOAuth2Client(accessToken: string, refreshToken?: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

// ─── Build MIME Message ────────────────────────────────────

function buildMimeMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
  attachments: SendEmailParams["attachments"]
): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  let message = "";
  message += `From: ${from}\r\n`;
  message += `To: ${to}\r\n`;
  message += `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\n`;
  message += `MIME-Version: 1.0\r\n`;
  message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

  // Body part
  message += `--${boundary}\r\n`;
  message += `Content-Type: text/plain; charset="UTF-8"\r\n`;
  message += `Content-Transfer-Encoding: base64\r\n\r\n`;
  message += Buffer.from(body).toString("base64") + "\r\n\r\n";

  // Attachment parts
  for (const attachment of attachments) {
    message += `--${boundary}\r\n`;
    message += `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"\r\n`;
    message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
    message += `Content-Transfer-Encoding: base64\r\n\r\n`;
    message += attachment.content.toString("base64") + "\r\n\r\n";
  }

  message += `--${boundary}--`;

  return message;
}

// ─── Send Email via Gmail API ──────────────────────────────

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { userEmail, accessToken, refreshToken, to, subject, body, attachments } = params;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const oauth2Client = getOAuth2Client(accessToken, refreshToken);
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      // Build MIME message using email from session
      const mimeMessage = buildMimeMessage(userEmail, to, subject, body, attachments);

      // Encode for Gmail API (URL-safe base64)
      const encodedMessage = Buffer.from(mimeMessage)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // Send
      const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
        },
      });

      return {
        success: true,
        messageId: result.data.id || undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on auth errors
      if (
        lastError.message.includes("invalid_grant") ||
        lastError.message.includes("Token has been expired")
      ) {
        return {
          success: false,
          error: "Token Google kedaluwarsa. Silakan login ulang.",
        };
      }

      if (lastError.message.includes("Insufficient Permission")) {
        return {
          success: false,
          error: "Izin Gmail tidak mencukupi. Silakan logout lalu login ulang agar izin kirim email (gmail.send) diberikan.",
        };
      }

      // Exponential backoff for retries
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Gagal mengirim email setelah beberapa percobaan.",
  };
}
