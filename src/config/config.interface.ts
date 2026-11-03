export interface AppConfig {
  nodeEnv: string;
  port: number;
  name: string;
  apiPrefix: string;
  apiDefaultVersion: string;
}

export interface DatabaseConfig {
  directUrl: string;
  pooledUrl?: string;
}

export interface JwtConfig {
  accessSecret: string;
  accessExpiration: string;
  refreshSecret: string;
  refreshExpiration: string;
}

export interface SessionConfig {
  secret: string;
  maxAge: number;
}

export interface CorsConfig {
  origin: string | string[] | boolean;
}

export interface ThrottleConfig {
  ttl: number;
  limit: number;
}

export interface EmailConfig {
  resendApiKey: string;
  fromAddress: string;
  logoUrl: string;
}

export interface StackApiConfig {
  apiKey: string;
  publicKey: string;
}

export interface StackApiLogisticsConfig {
  baseUrl: string;
  alertEmail: string;
}

export interface StackApiKycConfig {
  mode: 'test' | 'live';
  liveEnabled: boolean;
  testApiKey: string;
  liveApiKey: string;
  testPublicKey: string;
  livePublicKey: string;
  consentVersion: string;
}

export interface FirebaseConfig {
  projectId: string;
  credentialsConfigured: boolean;
}

export interface ClerkConfig {
  webhookSecret: string;
  secretKey: string;
  jwtKey: string;
}

export interface PaystackConfig {
  secretKey: string;
  webhookSecret: string;
  callbackUrl: string;
}

export interface DealsConfig {
  feePerProduct: number;
  maxProducts: number;
}

export interface StorageConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}
