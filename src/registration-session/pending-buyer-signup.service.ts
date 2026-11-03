import { Injectable } from '@nestjs/common';
import {
  PendingBuyerSignupRepository,
  PendingBuyerSignupRow,
} from './pending-buyer-signup.repository';

const PENDING_SIGNUP_TTL_MINUTES = 30;

export interface CreatePendingBuyerSignup {
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date | null;
  phoneNumber?: string | null;
  passwordHash: string;
  termsAccepted: boolean;
}

@Injectable()
export class PendingBuyerSignupService {
  constructor(private readonly repository: PendingBuyerSignupRepository) {}

  async create(signup: CreatePendingBuyerSignup): Promise<PendingBuyerSignupRow> {
    return this.repository.create({
      ...signup,
      email: signup.email.trim().toLowerCase(),
      expiresAt: new Date(Date.now() + PENDING_SIGNUP_TTL_MINUTES * 60 * 1000),
    });
  }

  findByEmail(email: string): Promise<PendingBuyerSignupRow | null> {
    return this.repository.findByEmail(email);
  }

  deleteByEmail(email: string): Promise<void> {
    return this.repository.deleteByEmail(email);
  }
}
