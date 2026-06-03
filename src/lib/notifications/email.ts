import nodemailer from "nodemailer";

export async function sendEmail(
  subject: string,
  body: string,
): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.SMTP_TO;
  const from = process.env.SMTP_FROM ?? "system-guardian@localhost";

  if (!host || !to) return false;

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: user && pass ? { user, pass } : undefined,
  });

  await transporter.sendMail({ from, to, subject, text: body, html: body.replace(/\n/g, "<br>") });
  return true;
}
