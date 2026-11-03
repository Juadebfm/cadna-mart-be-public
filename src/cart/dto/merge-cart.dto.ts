import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MergeCartDto {
  @ApiProperty({ description: 'Plaintext guestToken returned from POST /cart' })
  @IsString()
  @IsNotEmpty()
  guestToken!: string;
}
