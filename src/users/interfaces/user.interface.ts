import { AccountType } from '../enums/account-type.enum';
import { AuthProvider } from '../enums/auth-provider.enum';
import { BuyerNotificationPreferences, UserGender } from '../schemas/user.schema';

export interface IUser {
  _id: string;
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  password: string | null;
  accountType: AccountType;
  accountTypes?: AccountType[];
  authProvider: AuthProvider;
  clerkId: string | null;
  phoneNumber: string | null;
  isPhoneVerified: boolean;
  dateOfBirth: Date | null;
  gender: UserGender | null;
  avatarUrl: string | null;
  avatarPublicId: string | null;
  notificationPreferences: BuyerNotificationPreferences;
  isVerified: boolean;
  isActive: boolean;
  isTwoFactorEnabled: boolean;
  termsAcceptedAt: Date | null;
  lastLoginAt: Date | null;
  refreshToken: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
}
