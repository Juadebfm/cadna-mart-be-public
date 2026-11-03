import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiResponseMetaDto {
  @ApiProperty()
  timestamp!: string;

  @ApiPropertyOptional()
  correlationId?: string;

  @ApiPropertyOptional()
  path?: string;
}

export class ApiSuccessResponseDto<T> {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 200 })
  statusCode!: number;

  @ApiProperty()
  data!: T;

  @ApiProperty()
  meta!: ApiResponseMetaDto;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiPropertyOptional()
  details?: unknown[];

  @ApiProperty()
  meta!: ApiResponseMetaDto;
}
