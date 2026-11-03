import { BadRequestException } from '@nestjs/common';
import { validatePasswordStrength } from './password-strength.validator';

describe('validatePasswordStrength', () => {
  it('accepts a password with letters, a number, and a symbol', () => {
    expect(() => validatePasswordStrength('Shopper!42')).not.toThrow();
  });

  it('rejects passwords that have numbers and symbols but no letters', () => {
    expect(() => validatePasswordStrength('1234567!')).toThrow(BadRequestException);
  });

  it('rejects passwords that contain whitespace', () => {
    expect(() => validatePasswordStrength('Shopper !42')).toThrow(BadRequestException);
  });

  it('rejects a password containing the buyer name or email prefix', () => {
    expect(() =>
      validatePasswordStrength('Benjamin!42', {
        firstName: 'Benjamin',
        email: 'benjamin@example.com',
      }),
    ).toThrow(BadRequestException);
  });
});
