import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  orderUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  promotions?: boolean;

  @IsOptional()
  @IsBoolean()
  newsletter?: boolean;

  @IsOptional()
  @IsBoolean()
  securityAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  supportUpdates?: boolean;
}

export class BroadcastDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsString()
  accountType?: string;
}

export class NotificationDeviceDto {
  @ApiProperty({
    description: 'Firebase Installation ID for this signed-in buyer device.',
    minLength: 10,
    maxLength: 512,
    example: 'fcm-installation-id',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  fid!: string;
}
