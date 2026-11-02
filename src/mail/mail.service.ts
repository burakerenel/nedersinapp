import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * SMTP ile e-posta. Ortam değişkenleri:
 *   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE (false), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM ("NeDersin <no-reply@nedersin.app>")
 * SMTP_HOST tanımlı değilse e-posta gönderilmez, içerik log'a yazılır
 * (test ortamında kodu log'dan okumak için).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.MAIL_FROM || 'NeDersin <no-reply@nedersin.app>';
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    } else {
      this.transporter = null;
      this.logger.warn(
        "SMTP_HOST tanımlı değil; e-postalar gönderilmeyecek, log'a yazılacak",
      );
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(to: string, subject: string, text: string, html?: string) {
    if (!this.transporter) {
      this.logger.warn(`[MAIL → ${to}] ${subject}\n${text}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html,
      });
    } catch (err) {
      this.logger.error(`E-posta gönderilemedi (${to}): ${String(err)}`);
    }
  }

  async sendPasswordResetCode(to: string, code: string, minutes: number) {
    const text =
      `NeDersin şifre sıfırlama kodunuz: ${code}\n\n` +
      `Kod ${minutes} dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.`;
    const html =
      `<p>NeDersin şifre sıfırlama kodunuz:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p>` +
      `<p>Kod ${minutes} dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>`;
    await this.send(to, 'NeDersin şifre sıfırlama kodu', text, html);
  }
}
