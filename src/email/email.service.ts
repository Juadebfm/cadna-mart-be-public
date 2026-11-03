import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@config/config.service';
import { LoggerService } from '@logger/logger.service';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly fromAddress: string;
  private readonly logoUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.resend = new Resend(this.configService.email.resendApiKey);
    this.fromAddress = this.configService.email.fromAddress;
    this.logoUrl = this.configService.email.logoUrl;
  }

  // Hosted-image header rendered in every transactional email. Inline styles +
  // explicit width attribute so Outlook/legacy clients respect sizing.
  private logoHeader(): string {
    if (!this.logoUrl) return '';
    return `<div style="text-align: center; padding: 16px 0 24px;">
        <img src="${this.logoUrl}" alt="Cadna Mart" width="160" style="max-width: 160px; height: auto; display: inline-block; border: 0;" />
      </div>`;
  }

  async sendNotificationEmail(input: {
    to: string;
    title: string;
    body: string;
    actionUrl?: string;
  }): Promise<boolean> {
    const safeTitle = this.escapeHtml(input.title);
    const safeBody = this.escapeHtml(input.body).replace(/\r?\n/g, '<br />');
    const safeActionUrl =
      input.actionUrl?.startsWith('/') && !input.actionUrl.startsWith('//')
        ? this.escapeHtml(input.actionUrl)
        : null;
    const action = safeActionUrl
      ? `<p><a href="${safeActionUrl}" style="color: #6C63FF;">View details</a></p>`
      : '';

    return this.send(
      input.to,
      `Cadna Mart: ${input.title}`,
      `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        ${this.logoHeader()}
        <h2 style="color: #6C63FF;">${safeTitle}</h2>
        <p>${safeBody}</p>
        ${action}
      </div>`,
    );
  }

  async sendContactMessage(input: {
    to: string;
    replyTo: string;
    name: string;
    subject: string;
    message: string;
  }): Promise<boolean> {
    const name = this.escapeHtml(input.name);
    const replyTo = this.escapeHtml(input.replyTo);
    const subject = this.escapeHtml(input.subject);
    const message = this.escapeHtml(input.message).replace(/\r?\n/g, '<br />');
    const mailSubject = input.subject
      .replace(/[\r\n\0]+/g, ' ')
      .trim()
      .slice(0, 200);
    return this.send(
      input.to,
      `Website contact: ${mailSubject}`,
      `<div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
        ${this.logoHeader()}
        <h2>Website contact message</h2>
        <p><strong>From:</strong> ${name} (${replyTo})</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p>${message}</p>
      </div>`,
      input.replyTo,
    );
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    await this.send(
      email,
      'Verify your Cadna Mart account',
      `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        ${this.logoHeader()}
        <h2 style="color: #6C63FF;">Verify your email</h2>
        <p>Your verification code is:</p>
        <div style="background: #f4f4f8; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #6C63FF;">${code}</span>
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color: #888; font-size: 12px;">If you didn't request this code, you can safely ignore this email.</p>
      </div>`,
    );
  }

  async sendLoginOtp(email: string, code: string): Promise<void> {
    await this.send(
      email,
      'Your Cadna Mart login code',
      `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        ${this.logoHeader()}
        <h2 style="color: #6C63FF;">Login verification</h2>
        <p>Your login verification code is:</p>
        <div style="background: #f4f4f8; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #6C63FF;">${code}</span>
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color: #888; font-size: 12px;">If you didn't try to log in, please secure your account immediately.</p>
      </div>`,
    );
  }

  async sendPasswordResetOtp(email: string, code: string): Promise<void> {
    await this.send(
      email,
      'Reset your Cadna Mart password',
      `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        ${this.logoHeader()}
        <h2 style="color: #6C63FF;">Password reset</h2>
        <p>Your password reset code is:</p>
        <div style="background: #f4f4f8; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #6C63FF;">${code}</span>
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color: #888; font-size: 12px;">If you didn't request a password reset, you can safely ignore this email.</p>
      </div>`,
    );
  }

  async sendSellerWelcome(email: string, firstName: string, businessName: string): Promise<void> {
    await this.send(
      email,
      'Welcome to Cadna Mart — your seller account is under review',
      `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        ${this.logoHeader()}
        <h2 style="color: #6C63FF;">Welcome, ${firstName}!</h2>
        <p>Your seller account for <strong>${businessName}</strong> has been received and is currently under review.</p>
        <p>Our team typically reviews new seller applications within <strong>1-2 business days</strong>. You'll receive a follow-up email once your account has been approved.</p>
        <p>Please also verify your email address using the code we sent in a separate message.</p>
        <p style="color: #888; font-size: 12px;">If you didn't create this account, please contact us immediately.</p>
      </div>`,
    );
  }

  async sendAdminNewSellerAlert(
    adminEmail: string,
    sellerEmail: string,
    businessName: string,
  ): Promise<void> {
    await this.send(
      adminEmail,
      `[Action Required] New seller application: ${businessName}`,
      `<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        ${this.logoHeader()}
        <h2 style="color: #6C63FF;">New seller application</h2>
        <p>A new seller has completed onboarding and is awaiting approval.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 0; font-weight: bold;">Business</td><td>${businessName}</td></tr>
          <tr><td style="padding: 6px 0; font-weight: bold;">Email</td><td>${sellerEmail}</td></tr>
        </table>
        <p>Log in to the admin panel to review and approve this application.</p>
      </div>`,
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    replyTo?: string,
  ): Promise<boolean> {
    try {
      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject,
        html,
        ...(replyTo ? { replyTo } : {}),
      });
      if (error) {
        this.logger.warn('Resend rejected an email notification.', 'EmailService');
        return false;
      }
      return true;
    } catch {
      this.logger.warn('Email provider request failed.', 'EmailService');
      return false;
    }
  }
}
