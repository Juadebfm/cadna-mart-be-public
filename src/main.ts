import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  CorsOptions,
  CustomOrigin,
} from '@nestjs/common/interfaces/external/cors-options.interface';
/* eslint-disable @typescript-eslint/no-require-imports */
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const PgSessionStore = require('connect-pg-simple')(session);
import { Pool } from 'pg';
const passport = require('passport');
const helmet = require('helmet');
import { AppModule } from './app.module';
import { ConfigService } from '@config/config.service';
import { LoggerService } from '@logger/logger.service';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from '@common/interceptors/response-transform.interceptor';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { TimeoutInterceptor } from '@common/interceptors/timeout.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const loggerService = app.get(LoggerService);
  app.useLogger(loggerService);

  // Global prefix and versioning
  app.setGlobalPrefix(configService.app.apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: configService.app.apiDefaultVersion,
  });

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  const configuredCorsOrigin = configService.cors.origin;
  const devLocalhostOriginRegex = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i;
  const isConfiguredOriginAllowed = (requestOrigin: string): boolean => {
    if (configuredCorsOrigin === true) {
      return true;
    }
    if (Array.isArray(configuredCorsOrigin)) {
      return configuredCorsOrigin.includes(requestOrigin);
    }
    if (typeof configuredCorsOrigin === 'string') {
      return configuredCorsOrigin === requestOrigin;
    }

    return false;
  };
  const corsOrigin: CorsOptions['origin'] = configService.isDev
    ? (requestOrigin: string | undefined, callback: Parameters<CustomOrigin>[1]) => {
        // Browserless requests (curl/Postman/server-to-server) may omit Origin.
        if (!requestOrigin) {
          callback(null, true);
          return;
        }

        if (isConfiguredOriginAllowed(requestOrigin)) {
          callback(null, true);
          return;
        }

        if (devLocalhostOriginRegex.test(requestOrigin)) {
          callback(null, true);
          return;
        }

        loggerService.warn(`Blocked CORS origin in dev: ${requestOrigin}`, 'Bootstrap');
        callback(null, false);
      }
    : configuredCorsOrigin;

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-guest-token'],
  });

  // Session (dual-layer auth) persisted in PostgreSQL.
  const sessionPool = new Pool({
    connectionString: configService.database.pooledUrl ?? configService.database.directUrl,
  });
  app.use(
    session({
      secret: configService.session.secret,
      resave: false,
      saveUninitialized: false,
      store: new PgSessionStore({
        pool: sessionPool,
        tableName: 'user_sessions',
        createTableIfMissing: true,
      }),
      cookie: {
        maxAge: configService.session.maxAge,
        httpOnly: true,
        secure: configService.isProd,
        sameSite: configService.isProd ? 'strict' : 'lax',
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new AllExceptionsFilter(loggerService));
  app.useGlobalInterceptors(
    new ResponseTransformInterceptor(),
    new LoggingInterceptor(loggerService),
    new TimeoutInterceptor(),
  );

  // Swagger
  // Off by default in prod for safety, but allow ENABLE_SWAGGER=true to expose
  // it on the prod deployment (needed while FE is still integrating).
  const swaggerEnabled = !configService.isProd || process.env.ENABLE_SWAGGER === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Cadna Mart API')
      .setDescription(
        [
          'Backend API for the Cadna Mart marketplace.',
          '',
          '### Response envelope',
          'Every successful response is wrapped by the global response interceptor:',
          '```json',
          '{',
          '  "success": true,',
          '  "statusCode": 200,',
          '  "data": { ... },',
          '  "message": "...",',
          '  "meta": { "correlationId": "...", "timestamp": "..." }',
          '}',
          '```',
          'When documenting individual endpoints below, the schema describes the `data` payload only.',
          '',
          '### Authentication',
          '- **Bearer JWT** (`Authorization: Bearer <accessToken>`) for authenticated user routes.',
          '- **Guest token** (`x-guest-token: <token>`) for guest-cart endpoints. Returned once from `POST /cart`.',
          '',
          '### Error shape',
          'Errors flow through the global `AllExceptionsFilter`:',
          '```json',
          '{',
          '  "success": false,',
          '  "statusCode": 400,',
          '  "message": "Validation failed",',
          '  "errorCode": "BAD_REQUEST",',
          '  "path": "/api/v1/...",',
          '  "correlationId": "..."',
          '}',
          '```',
        ].join('\n'),
      )
      .setVersion('1.0')
      .setContact('Cadna Mart Engineering', '', 'cadnamart@gmail.com')
      .addServer('https://cadna-mart-be-nsz2.onrender.com', 'Production (Render)')
      .addServer(`http://localhost:${configService.app.port}`, 'Local dev')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token returned from /auth/login or /auth/otp/verify',
        },
        'bearer',
      )
      .addApiKey(
        {
          type: 'apiKey',
          name: 'x-guest-token',
          in: 'header',
          description: 'Guest cart access token (returned once from POST /cart for guests)',
        },
        'guestToken',
      )
      .addTag('Auth', 'Login, registration, OTP, password reset, 2FA, audit log')
      .addTag('Users', 'Self profile, addresses, NDPR consent/export/delete')
      .addTag('User Addresses', 'CRUD over the current user shipping/billing addresses')
      .addTag('Categories', 'Catalog taxonomy and category-scoped product listings')
      .addTag('Products', 'Product catalog: detail, variants, availability, policies, related')
      .addTag('Collections', 'Featured / Flash Sales / Best Deals product rails')
      .addTag('Search', 'Full search + autocomplete')
      .addTag('Brands', 'Distinct brand list with product counts')
      .addTag('Cart', 'Cart (auth + guest) — items, totals, validate, merge')
      .addTag('Wishlist', 'Authenticated user wishlist')
      .addTag('Reviews', 'Product reviews')
      .addTag('Sellers', 'Public seller profile + seller self-management')
      .addTag('Newsletter', 'Newsletter subscription')
      .addTag('Policies', 'Per-product return / warranty policies')
      .addTag('Shipping', 'Shipping estimates (placeholder)')
      .addTag('Site Config', 'Public app config (feature flags, fees)')
      .addTag('Deals', 'Seller-paid deal campaigns (promo precursor)')
      .addTag('Webhooks', 'Inbound signed webhooks (Clerk, Paystack)')
      .addTag('Health', 'Liveness + DB connectivity')
      .addTag('Admin', 'Admin-only catalogue / seller / deals operations')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${configService.app.apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
        docExpansion: 'none',
      },
      customSiteTitle: 'Cadna Mart API Docs',
      jsonDocumentUrl: `${configService.app.apiPrefix}/openapi.json`,
    });

    // When SWAGGER_EXPORT=true is set, dump the OpenAPI spec to docs/openapi.json
    // and exit. Lets FE/PMs import a fresh spec into Postman/Bruno without booting
    // the full HTTP server long-term.
    if (process.env.SWAGGER_EXPORT === 'true') {
      const outDir = join(process.cwd(), 'docs');
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, 'openapi.json');
      writeFileSync(outPath, JSON.stringify(document, null, 2));
      loggerService.log(`OpenAPI spec written to ${outPath}`, 'Bootstrap');
      await app.close();
      process.exit(0);
    }
  }

  const port = configService.app.port;
  await app.listen(port, '0.0.0.0');
  loggerService.log(
    `Application running on http://localhost:${port}/${configService.app.apiPrefix}/v${configService.app.apiDefaultVersion}`,
    'Bootstrap',
  );
  loggerService.log(
    `Swagger docs available at http://localhost:${port}/${configService.app.apiPrefix}/docs`,
    'Bootstrap',
  );
}

void bootstrap().catch((error) => {
  console.error('Fatal startup error:', error);
  process.exit(1);
});
