import { z } from 'zod';
export const envSchema = z.object({
  NODE_ENV: z.enum(['dev', 'staging', 'prod']).default('dev'),
  PORT: z.coerce.number().optional(),
  APP_PORT: z.coerce.number().default(3000),
  APP_NAME: z.string().default('cadna-mart-backend'),
  API_PREFIX: z.string().default('api'),
  API_DEFAULT_VERSION: z.string().default('1'),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
      message: 'DATABASE_URL must be a PostgreSQL connection string',
    }),
  DATABASE_URL_POOLED: z
    .string()
    .optional()
    .refine(
      (value) =>
        value === undefined || value.startsWith('postgresql://') || value.startsWith('postgres://'),
      { message: 'DATABASE_URL_POOLED must be a PostgreSQL connection string' },
    ),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  SESSION_SECRET: z.string().min(32),
  SESSION_MAX_AGE: z.coerce.number().default(86400000),
  CORS_ORIGIN: z.string().default('*'),
  THROTTLE_TTL: z.coerce.number().default(60000),
  THROTTLE_LIMIT: z.coerce.number().default(100),
  RESEND_API_KEY: z.string().min(1).default('re_placeholder'),
  EMAIL_FROM: z.string().default('Cadna Mart <noreply@cadnamart.com>'),
  EMAIL_LOGO_URL: z
    .string()
    .url()
    .default('https://res.cloudinary.com/dwrhjddpn/image/upload/v1779286047/cadna_logo_you5ek.png'),
  STACKAPI_SECRET_KEY: z.string().default(''),
  // Backward compatibility for deployments configured before StackAPI's
  // documented STACKAPI_SECRET_KEY name was adopted.
  STACKAPI_API_KEY: z.string().default(''),
  STACKAPI_PUBLIC_KEY: z.string().default(''),
  STACKAPI_LOGISTICS_BASE_URL: z.string().url().default('https://api.stackapi.app/v1/logistics'),
  LOGISTICS_ALERT_EMAIL: z.string().email().default('cadnamart@gmail.com'),
  STACKAPI_KYC_MODE: z.enum(['test', 'live']).default('test'),
  STACKAPI_KYC_LIVE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  STACKAPI_KYC_TEST_SECRET_KEY: z.string().default(''),
  STACKAPI_KYC_LIVE_SECRET_KEY: z.string().default(''),
  STACKAPI_KYC_TEST_PUBLIC_KEY: z.string().default(''),
  STACKAPI_KYC_LIVE_PUBLIC_KEY: z.string().default(''),
  STACKAPI_KYC_CONSENT_VERSION: z.string().default('2026-11-02'),
  FCM_PROJECT_ID: z.string().default(''),
  CLERK_WEBHOOK_SECRET: z.string().default(''),
  CLERK_SECRET_KEY: z.string().default(''),
  CLERK_JWT_KEY: z.string().default(''),
  PAYSTACK_SECRET_KEY: z.string().default(''),
  PAYSTACK_WEBHOOK_SECRET: z.string().default(''),
  PAYSTACK_CALLBACK_URL: z.string().default(''),
  SELLER_BANK_VERIFICATION_PROVIDER: z.enum(['paystack', 'nomba']).optional(),
  NOMBA_ACCOUNT_ID: z.string().default(''),
  NOMBA_CLIENT_ID: z.string().default(''),
  NOMBA_CLIENT_SECRET: z.string().default(''),
  SELLER_PII_ENCRYPTION_KEY: z.string().default(''),
  DEALS_FEE_PER_PRODUCT: z.coerce.number().default(5000),
  DEALS_MAX_PRODUCTS: z.coerce.number().default(10),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('debug'),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
});
export type EnvConfig = z.infer<typeof envSchema>;
