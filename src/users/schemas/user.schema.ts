import { BaseSchema } from '@shared/base/base.schema';
import { AccountType } from '../enums/account-type.enum';
import { AuthProvider } from '../enums/auth-provider.enum';
export enum UserGender {
  FEMALE = 'female',
  MALE = 'male',
  OTHERS = 'others',
  RATHER_NOT_SAY = 'rather_not_say',
}
export interface BuyerNotificationPreferences {
  orderUpdates: boolean;
  promotions: boolean;
  newsletter: boolean;
  securityAlerts: boolean;
  supportUpdates: boolean;
}
export class User extends BaseSchema {
  firstName!: string;
  lastName!: string;
  email!: string | null;
  password!: string | null;
  accountType!: AccountType;
  accountTypes?: AccountType[];
  authProvider!: AuthProvider;
  clerkId!: string | null;
  phoneNumber!: string | null;
  isPhoneVerified!: boolean;
  dateOfBirth!: Date | null;
  gender!: UserGender | null;
  avatarUrl!: string | null;
  avatarPublicId!: string | null;
  notificationPreferences!: BuyerNotificationPreferences;
  isVerified!: boolean;
  isActive!: boolean;
  isTwoFactorEnabled!: boolean;
  termsAcceptedAt!: Date | null;
  lastLoginAt!: Date | null;
  marketingConsentAt!: Date | null;
  refreshToken!: string | null;
}
