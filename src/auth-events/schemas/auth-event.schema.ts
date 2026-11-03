export enum AuthEventKind {
  LOGIN = 'login',
  LOGIN_OTP = 'login_otp',
  LOGIN_2FA = 'login_2fa',
  LOGOUT = 'logout',
  REFRESH = 'refresh',
  REGISTER = 'register',
  PASSWORD_RESET = 'password_reset',
  TWO_FACTOR_ENABLE = '2fa_enable',
  TWO_FACTOR_DISABLE = '2fa_disable',
  CLERK_LOGIN = 'clerk_login',
}
export class AuthEvent {
  userId!: string | null;
  kind!: AuthEventKind;
  succeeded!: boolean;
  ip!: string | null;
  userAgent!: string | null;
  createdAt!: Date;
}
