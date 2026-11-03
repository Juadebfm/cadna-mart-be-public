import { HttpException, HttpStatus } from '@nestjs/common';

export class BusinessException extends HttpException {
  public readonly errorCode: string;

  constructor(message: string, errorCode: string, statusCode: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, statusCode);
    this.errorCode = errorCode;
  }
}
