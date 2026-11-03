import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { DataRetentionCategory } from '../schemas/data-request.schema';

export enum DataRequestDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
}

export class DataRequestRetentionItemDto {
  @IsEnum(DataRetentionCategory)
  category!: DataRetentionCategory;

  @IsString()
  @Length(3, 500)
  lawfulBasis!: string;

  @IsString()
  @Length(3, 500)
  purpose!: string;

  @IsDateString()
  retainUntil!: string;
}

export class ProcessDataRequestDto {
  @IsEnum(DataRequestDecision)
  decision!: DataRequestDecision;

  @IsOptional()
  @IsString()
  @Length(3, 1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.values(DataRetentionCategory).length)
  @ValidateNested({ each: true })
  @Type(() => DataRequestRetentionItemDto)
  retentionItems?: DataRequestRetentionItemDto[];
}
