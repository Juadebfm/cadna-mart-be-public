export class PendingBuyerSignup {
  email!: string;
  firstName!: string;
  lastName!: string;
  dateOfBirth!: Date | null;
  phoneNumber!: string | null;
  passwordHash!: string;
  termsAccepted!: boolean;
  expiresAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
