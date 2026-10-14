import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envoi d'e-mails par Resend (API REST). Configuration uniquement dans l'environnement :
 * RESEND_API_KEY, MAIL_FROM (adresse d'un domaine vérifié dans Resend). Sans clé, rien n'est envoyé (aucune erreur).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string | null;
  private readonly from: string | null;

  constructor(config: ConfigService) {
    const mail = config.get<{ apiKey: string | null; from: string | null }>('mail');
    this.apiKey = mail?.apiKey || null;
    this.from = mail?.from || null;
  }

  get enabled() {
    return !!(this.apiKey && this.from);
  }

  /** Envoie l'e-mail ; renvoie false (sans lever d'erreur) si l'envoi est impossible */
  async send(input: MailInput): Promise<boolean> {
    const to = (Array.isArray(input.to) ? input.to : [input.to]).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x || ''));
    if (!this.enabled || !to.length) return false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to, subject: input.subject, text: input.text, html: input.html }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => '')).slice(0, 300);
        this.logger.warn(`E-mail non envoyé (${input.subject}) : Resend ${res.status} ${body}`);
        return false;
      }
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
