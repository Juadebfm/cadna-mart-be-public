export class RegistrationSession {
  sessionId!: string;
  email!: string;
  firstName!: string | null;
  lastName!: string | null;
  dateOfBirth!: Date | null;
  phoneNumber!: string | null;
  termsAccepted!: boolean;
  currentStep!: number;
  expiresAt!: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
