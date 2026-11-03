import { BadRequestException } from '@nestjs/common';
import { ERROR_MESSAGES } from '@common/constants/error-messages.constants';

export interface PasswordContext {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export function validatePasswordStrength(password: string, context?: PasswordContext): void {
  if (password.length < 8) {
    throw new BadRequestException(ERROR_MESSAGES.PASSWORD_TOO_WEAK);
  }

  if (/\s/.test(password)) {
    throw new BadRequestException(ERROR_MESSAGES.PASSWORD_CONTAINS_SPACES);
  }

  if (context) {
    const lowerPassword = password.toLowerCase();
    const nameParts = [context.firstName, context.lastName, context.email?.split('@')[0]].filter(
      (part): part is string => !!part && part.length >= 3,
    );

    for (const part of nameParts) {
      if (lowerPassword.includes(part.toLowerCase())) {
        throw new BadRequestException(ERROR_MESSAGES.PASSWORD_CONTAINS_NAME);
      }
    }
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasSymbol || !hasNumber) {
    throw new BadRequestException(ERROR_MESSAGES.PASSWORD_NO_SYMBOL_OR_NUMBER);
  }
}
