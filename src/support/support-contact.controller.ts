import { Controller, Post, Body, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@auth/decorators/public.decorator';
import { EmailService } from '@email/email.service';
import { SiteConfigService } from '@site-config/site-config.service';
import { ContactMessageDto } from './dto/ticket.dto';

@ApiTags('Contact')
@Controller('support/contact')
export class SupportContactController {
  constructor(
    private readonly emailService: EmailService,
    private readonly siteConfigService: SiteConfigService,
  ) {}

  @Public()
  @Post('/')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Email support from the public website contact form' })
  async sendContactMessage(@Body() dto: ContactMessageDto): Promise<{ accepted: true }> {
    const config = await this.siteConfigService.getPublicConfig();
    const sent = await this.emailService.sendContactMessage({
      to: config.contact.email,
      replyTo: dto.email.trim(),
      name: dto.name.trim(),
      subject: dto.subject.trim(),
      message: dto.message.trim(),
    });
    if (!sent) {
      throw new ServiceUnavailableException(
        'The contact message could not be sent. Please try again.',
      );
    }
    return { accepted: true };
  }
}
