import { Injectable, Logger } from '@nestjs/common';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { envSchema, EnvConfig } from './config.schema';
import {
  AppConfig,
  DatabaseConfig,
  JwtConfig,
  SessionConfig,
  CorsConfig,
  ThrottleConfig,
  EmailConfig,
  ClerkConfig,
  PaystackConfig,
  DealsConfig,
  StorageConfig,
  StackApiConfig,
  StackApiLogisticsConfig,
  StackApiKycConfig,
  FirebaseConfig,
} from './config.interface';

const ENVIRONMENT_STATUS_KEYS = [
  ...new Set([
    ...Object.keys(envSchema.shape),
    'APP_VERSION',
    'ENABLE_SWAGGER',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'SWAGGER_EXPORT',
  ]),
].sort();

@Injectable()
export class ConfigService {
  private readonly envConfig: EnvConfig;
  private readonly logger = new Logger(ConfigService.name);
  private hasLoggedCorsOrigin = false;

  private normalizeNodeEnv(value: string | undefined): 'dev' | 'staging' | 'prod' {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'production' || normalized === 'prod') {
      return 'prod';
    }
    if (normalized === 'staging') {
      return 'staging';
    }
    if (normalized === 'development' || normalized === 'dev') {
      return 'dev';
    }
    return 'dev';
  }

  constructor() {
    const originalNodeEnv = process.env.NODE_ENV;
    const nodeEnv = this.normalizeNodeEnv(originalNodeEnv);
    process.env.NODE_ENV = nodeEnv;

    const envFile = `.env.${nodeEnv}`;
    const baseEnvFile = '.env';

    // Load env-specific file first; then fill missing values from base .env.
    dotenvConfig({ path: resolve(process.cwd(), envFile), override: false });
    dotenvConfig({ path: resolve(process.cwd(), baseEnvFile), override: false });

    this.logEnvironmentVariableStatus(originalNodeEnv);

    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const formatted = result.error.format();
      const errorDetails = JSON.stringify(formatted, null, 2);
      const summary =
        `Invalid environment variables for NODE_ENV="${originalNodeEnv ?? 'undefined'}"` +
        ` (normalized to "${nodeEnv}") using ${envFile} + ${baseEnvFile}.`;

      // Keep console output so startup failures are visible even before custom logger init.

      console.error(summary);

      console.error(errorDetails);
      this.logger.error(summary);
      this.logger.error(errorDetails);
      process.exit(1);
    }

    this.envConfig = result.data;
    this.logger.log(`Configuration loaded from ${envFile} + ${baseEnvFile} (${nodeEnv})`);
  }

  private logEnvironmentVariableStatus(originalNodeEnv: string | undefined): void {
    const statusLines = ENVIRONMENT_STATUS_KEYS.map((key) => {
      const value = key === 'NODE_ENV' ? originalNodeEnv : process.env[key];
      const status =
        value === undefined
          ? key === 'NODE_ENV'
            ? 'UNSET (runtime defaults to dev)'
            : 'UNSET'
          : value.trim() === ''
            ? 'EMPTY'
            : 'SET';
      return `${key}: ${status}`;
    });

    // Deliberately log names and presence only. Environment values can contain
    // credentials, tokens, connection strings, and private file paths.
    console.info(`Environment variable status (values withheld):\n${statusLines.join('\n')}`);
  }

  private normalizeCorsOrigin(origin: string): string {
    // Render/hosting UIs sometimes store quoted values or trailing slashes.
    return origin
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .replace(/\/+$/, '');
  }

  private parseCorsOrigin(value: string): string | string[] | boolean {
    const raw = (value ?? '').trim();
    if (!raw) {
      return true;
    }
    if (raw === '*') {
      this.logger.warn(
        'CORS_ORIGIN is "*" which allows any origin with credentials; prefer explicit origins.',
      );
      return true;
    }

    const origins = raw
      .split(',')
      .map((origin) => this.normalizeCorsOrigin(origin))
      .filter((origin) => origin.length > 0);

    if (origins.length === 0) {
      return true;
    }

    const uniqueOrigins = [...new Set(origins)];
    return uniqueOrigins.length === 1 ? uniqueOrigins[0] : uniqueOrigins;
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.envConfig[key];
  }

  get app(): AppConfig {
    return {
      nodeEnv: this.envConfig.NODE_ENV,
      port: this.envConfig.PORT || this.envConfig.APP_PORT,
      name: this.envConfig.APP_NAME,
      apiPrefix: this.envConfig.API_PREFIX,
      apiDefaultVersion: this.envConfig.API_DEFAULT_VERSION,
    };
  }

  get database(): DatabaseConfig {
    return {
      directUrl: this.envConfig.DATABASE_URL,
      pooledUrl: this.envConfig.DATABASE_URL_POOLED,
    };
  }

  get jwt(): JwtConfig {
    return {
      accessSecret: this.envConfig.JWT_ACCESS_SECRET,
      accessExpiration: this.envConfig.JWT_ACCESS_EXPIRATION,
      refreshSecret: this.envConfig.JWT_REFRESH_SECRET,
      refreshExpiration: this.envConfig.JWT_REFRESH_EXPIRATION,
    };
  }

  get session(): SessionConfig {
    return {
      secret: this.envConfig.SESSION_SECRET,
      maxAge: this.envConfig.SESSION_MAX_AGE,
    };
  }

  get cors(): CorsConfig {
    const origin = this.parseCorsOrigin(this.envConfig.CORS_ORIGIN);
    if (!this.hasLoggedCorsOrigin) {
      this.logger.log(
        `Resolved CORS origin: ${Array.isArray(origin) ? origin.join(', ') : String(origin)}`,
      );
      this.hasLoggedCorsOrigin = true;
    }

    return {
      origin,
    };
  }

  get throttle(): ThrottleConfig {
    return {
      ttl: this.envConfig.THROTTLE_TTL,
      limit: this.envConfig.THROTTLE_LIMIT,
    };
  }

  get clerk(): ClerkConfig {
    return {
      webhookSecret: this.envConfig.CLERK_WEBHOOK_SECRET,
      secretKey: this.envConfig.CLERK_SECRET_KEY,
      jwtKey: this.envConfig.CLERK_JWT_KEY.replace(/\\n/g, '\n'),
    };
  }

  get paystack(): PaystackConfig {
    return {
      secretKey: this.envConfig.PAYSTACK_SECRET_KEY,
      webhookSecret: this.envConfig.PAYSTACK_WEBHOOK_SECRET || this.envConfig.PAYSTACK_SECRET_KEY,
      callbackUrl: this.envConfig.PAYSTACK_CALLBACK_URL,
    };
  }

  get sellerBankVerification() {
    return {
      provider: this.envConfig.SELLER_BANK_VERIFICATION_PROVIDER,
      paystackSecretKey: this.envConfig.PAYSTACK_SECRET_KEY,
      nombaAccountId: this.envConfig.NOMBA_ACCOUNT_ID,
      nombaClientId: this.envConfig.NOMBA_CLIENT_ID,
      nombaClientSecret: this.envConfig.NOMBA_CLIENT_SECRET,
    };
  }

  get sellerPiiEncryptionKey(): string {
    return this.envConfig.SELLER_PII_ENCRYPTION_KEY;
  }

  get deals(): DealsConfig {
    return {
      feePerProduct: this.envConfig.DEALS_FEE_PER_PRODUCT,
      maxProducts: this.envConfig.DEALS_MAX_PRODUCTS,
    };
  }

  get email(): EmailConfig {
    return {
      resendApiKey: this.envConfig.RESEND_API_KEY,
      fromAddress: this.envConfig.EMAIL_FROM,
      logoUrl: this.envConfig.EMAIL_LOGO_URL,
    };
  }

  get stackApi(): StackApiConfig {
    return {
      apiKey: this.envConfig.STACKAPI_SECRET_KEY || this.envConfig.STACKAPI_API_KEY,
      publicKey: this.envConfig.STACKAPI_PUBLIC_KEY,
    };
  }

  get stackApiLogistics(): StackApiLogisticsConfig {
    return {
      baseUrl: this.envConfig.STACKAPI_LOGISTICS_BASE_URL,
      alertEmail: this.envConfig.LOGISTICS_ALERT_EMAIL,
    };
  }

  get stackApiKyc(): StackApiKycConfig {
    return {
      mode: this.envConfig.STACKAPI_KYC_MODE,
      liveEnabled: this.envConfig.STACKAPI_KYC_LIVE_ENABLED,
      testApiKey: this.envConfig.STACKAPI_KYC_TEST_SECRET_KEY,
      liveApiKey: this.envConfig.STACKAPI_KYC_LIVE_SECRET_KEY,
      testPublicKey: this.envConfig.STACKAPI_KYC_TEST_PUBLIC_KEY,
      livePublicKey: this.envConfig.STACKAPI_KYC_LIVE_PUBLIC_KEY,
      consentVersion: this.envConfig.STACKAPI_KYC_CONSENT_VERSION,
    };
  }

  get firebase(): FirebaseConfig {
    return {
      projectId: this.envConfig.FCM_PROJECT_ID,
      // Firebase Admin uses Application Default Credentials. The deployment can
      // provide a credentials file path or a workload identity without another key.
      credentialsConfigured: Boolean(this.envConfig.FCM_PROJECT_ID),
    };
  }

  get logLevel(): string {
    return this.envConfig.LOG_LEVEL;
  }

  get isDev(): boolean {
    return this.envConfig.NODE_ENV === 'dev';
  }

  get isStaging(): boolean {
    return this.envConfig.NODE_ENV === 'staging';
  }

  get isProd(): boolean {
    return this.envConfig.NODE_ENV === 'prod';
  }

  get storage(): StorageConfig {
    return {
      cloudName: this.envConfig.CLOUDINARY_CLOUD_NAME,
      apiKey: this.envConfig.CLOUDINARY_API_KEY,
      apiSecret: this.envConfig.CLOUDINARY_API_SECRET,
    };
  }
}
