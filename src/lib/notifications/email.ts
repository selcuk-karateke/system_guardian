import nodemailer from "nodemailer";
import { resolveSmtpCreds } from "./config";

export async function sendEmail(
  subject: string,
  body: string,
): Promise<boolean> {
  const creds = await resolveSmtpCreds();
  if (!creds) return false;

  const transporter = nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.port === 465,
    auth:
      creds.user && creds.pass
        ? { user: creds.user, pass: creds.pass }
        : undefined,
  });

  await transporter.sendMail({
    from: creds.from,
    to: creds.to,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br>"),
  });
  return true;
}
