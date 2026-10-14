import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export interface MailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envoi d'e-mails par SMTP (Gmail, Brevo, Mailgun…). Configuration uniquement dans l'environnement :
 * SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM. Sans SMTP_HOST, rien n'est envoyé (aucune erreur).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string | null;

  constructor(config: ConfigService) {
    const mail = config.get<{ host: string | null; port: number; user: string | null; pass: string | null; from: string | null }>('mail');
    this.from = mail?.from || null;
    this.transport = mail?.host
      ? nodemailer.createTransport({
          host: mail.host,
          port: mail.port,
          secure: mail.port === 465,
          auth: mail.user ? { user: mail.user, pass: mail.pass || '' } : undefined,
          connectionTimeout: 15_000,
        })
      : null;
  }

  get enabled() {
    return !!this.transport;
  }

  /** Envoie l'e-mail ; renvoie false (sans lever d'erreur) si l'envoi est impossible */
  async send(input: MailInput): Promise<boolean> {
    const to = (Array.isArray(input.to) ? input.to : [input.to]).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x || ''));
    if (!this.transport || !to.length) return false;
    try {
      await this.transport.sendMail({ from: this.from || undefined, to, subject: input.subject, text: input.text, html: input.html });
      return true;
    } catch (e) {
      this.logger.warn(`E-mail non envoyé (${input.subject}) : ${(e as Error).message}`);
      return false;
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
