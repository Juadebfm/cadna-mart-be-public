import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ERROR_MESSAGES } from '../constants/error-messages.constants';

@Injectable()
export class ParsePublicIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[a-f\d]{24}$/i.test(value)) {
      throw new BadRequestException(ERROR_MESSAGES.INVALID_PUBLIC_ID);
    }
    return value;
  }
}
