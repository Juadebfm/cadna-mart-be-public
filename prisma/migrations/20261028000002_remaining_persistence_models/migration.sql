-- DropIndex
DROP INDEX "deal_campaigns_sellerId_status_idx";

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "reviewerName" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "deal_campaigns" DROP COLUMN "data",
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" VARCHAR(24),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "feeAmount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxProducts" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentAccessCode" TEXT,
ADD COLUMN     "paymentAuthorizationUrl" TEXT,
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
ADD COLUMN     "selectedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "return_requests" DROP COLUMN "data",
ADD COLUMN     "adjustmentReason" TEXT,
ADD COLUMN     "adminOverrideById" VARCHAR(24),
ADD COLUMN     "adminOverrideNote" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "items" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "orderItemName" TEXT NOT NULL,
ADD COLUMN     "orderItemProductId" TEXT NOT NULL,
ADD COLUMN     "orderItemVariantId" TEXT,
ADD COLUMN     "orderRef" TEXT NOT NULL,
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "previousOrderStatus" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL,
ADD COLUMN     "reason" TEXT NOT NULL,
ADD COLUMN     "refundAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "refundMethod" TEXT,
ADD COLUMN     "refundProcessedAt" TIMESTAMP(3),
ADD COLUMN     "refundProviderId" TEXT,
ADD COLUMN     "refundProviderStatus" TEXT,
ADD COLUMN     "refundReference" TEXT,
ADD COLUMN     "refundStatus" TEXT,
ADD COLUMN     "requestType" TEXT NOT NULL DEFAULT 'item_return',
ADD COLUMN     "sellerDecidedAt" TIMESTAMP(3),
ADD COLUMN     "sellerDecision" TEXT,
ADD COLUMN     "sellerDecisionNote" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "userId" VARCHAR(24) NOT NULL;

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" VARCHAR(24) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "userId" VARCHAR(24),
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "deliveryAddress" JSONB,
    "addressValidated" BOOLEAN NOT NULL DEFAULT false,
    "deliveryMode" TEXT,
    "pickupDetails" JSONB,
    "pricingSnapshot" JSONB,
    "pricingLocked" BOOLEAN NOT NULL DEFAULT false,
    "orderId" VARCHAR(24),
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "type" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_devices" (
    "id" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "fid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recently_viewed" (
    "id" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "productId" VARCHAR(24) NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recently_viewed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_configs" (
    "id" VARCHAR(24) NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_policies" (
    "id" VARCHAR(24) NOT NULL,
    "productId" VARCHAR(24) NOT NULL,
    "returnPolicy" JSONB NOT NULL,
    "warrantyPolicy" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24),
    "guestEmail" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedToId" VARCHAR(24),
    "messages" JSONB NOT NULL DEFAULT '[]',
    "orderId" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_followers" (
    "id" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "sellerId" VARCHAR(24) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_followers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "balanceKobo" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "holds" JSONB NOT NULL DEFAULT '[]',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" VARCHAR(24) NOT NULL,
    "walletId" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "type" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "runningBalanceKobo" INTEGER NOT NULL,
    "reference" TEXT,
    "orderId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_bookings" (
    "id" VARCHAR(24) NOT NULL,
    "bookingRef" TEXT NOT NULL,
    "orderId" VARCHAR(24) NOT NULL,
    "orderRef" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalBookingId" TEXT,
    "trackingUrl" TEXT,
    "pickupAddress" JSONB,
    "dropoffAddress" JSONB,
    "trackingEvents" JSONB NOT NULL DEFAULT '[]',
    "podArtifacts" JSONB NOT NULL DEFAULT '[]',
    "quotedFeeKobo" INTEGER NOT NULL DEFAULT 0,
    "cancelReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "scopeValue" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'percent',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_profiles" (
    "id" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "kycSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "agreementAccepted" BOOLEAN NOT NULL DEFAULT false,
    "agreementAcceptedAt" TIMESTAMP(3),
    "fundingCapNGN" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedById" VARCHAR(24),
    "approvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_commitments" (
    "id" VARCHAR(24) NOT NULL,
    "partnerId" VARCHAR(24) NOT NULL,
    "productId" VARCHAR(24) NOT NULL,
    "amountNGN" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" VARCHAR(24),
    "approvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_disputes" (
    "id" VARCHAR(24) NOT NULL,
    "partnerId" VARCHAR(24) NOT NULL,
    "commitmentId" VARCHAR(24) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedById" VARCHAR(24),
    "resolution" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_slot_types" (
    "id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "maxItems" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_slot_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_duration_tiers" (
    "id" VARCHAR(24) NOT NULL,
    "slotTypeId" VARCHAR(24) NOT NULL,
    "label" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "priceNGN" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_duration_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_slots" (
    "id" VARCHAR(24) NOT NULL,
    "slotTypeId" VARCHAR(24) NOT NULL,
    "date" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'available',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_bookings" (
    "id" VARCHAR(24) NOT NULL,
    "sellerId" VARCHAR(24) NOT NULL,
    "slotId" VARCHAR(24) NOT NULL,
    "durationTierId" VARCHAR(24) NOT NULL,
    "productId" VARCHAR(24) NOT NULL,
    "amountPaidNGN" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paystackReference" TEXT,
    "paystackAuthUrl" TEXT,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "suspendReason" TEXT,
    "suspendedById" VARCHAR(24),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards_program" (
    "id" VARCHAR(24) NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "logoUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards_tiers" (
    "id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "minPoints" INTEGER NOT NULL,
    "maxPoints" INTEGER,
    "cashbackRate" DOUBLE PRECISION NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards_campaigns" (
    "id" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "pointsMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards_accounts" (
    "id" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "cashbackKobo" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "isAffiliate" BOOLEAN NOT NULL DEFAULT false,
    "affiliateCode" TEXT,
    "referredBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards_transactions" (
    "id" VARCHAR(24) NOT NULL,
    "accountId" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "cashbackKobo" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "orderId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_sessionId_key" ON "checkout_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "checkout_sessions_expiresAt_idx" ON "checkout_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "checkout_sessions_cartId_status_idx" ON "checkout_sessions"("cartId", "status");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_devices_fid_key" ON "notification_devices"("fid");

-- CreateIndex
CREATE INDEX "notification_devices_userId_updatedAt_idx" ON "notification_devices"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "recently_viewed_userId_viewedAt_idx" ON "recently_viewed"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "recently_viewed_userId_productId_key" ON "recently_viewed"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "site_configs_key_key" ON "site_configs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "product_policies_productId_key" ON "product_policies"("productId");

-- CreateIndex
CREATE INDEX "support_tickets_userId_createdAt_idx" ON "support_tickets"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_status_assignedToId_idx" ON "support_tickets"("status", "assignedToId");

-- CreateIndex
CREATE INDEX "seller_followers_sellerId_idx" ON "seller_followers"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "seller_followers_userId_sellerId_key" ON "seller_followers"("userId", "sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_transactions_userId_createdAt_idx" ON "wallet_transactions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_bookings_bookingRef_key" ON "logistics_bookings"("bookingRef");

-- CreateIndex
CREATE INDEX "logistics_bookings_status_provider_idx" ON "logistics_bookings"("status", "provider");

-- CreateIndex
CREATE INDEX "logistics_bookings_orderId_idx" ON "logistics_bookings"("orderId");

-- CreateIndex
CREATE INDEX "pricing_rules_isActive_idx" ON "pricing_rules"("isActive");

-- CreateIndex
CREATE INDEX "pricing_rules_deletedAt_idx" ON "pricing_rules"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "partner_profiles_userId_key" ON "partner_profiles"("userId");

-- CreateIndex
CREATE INDEX "partner_profiles_status_idx" ON "partner_profiles"("status");

-- CreateIndex
CREATE INDEX "partner_commitments_partnerId_status_idx" ON "partner_commitments"("partnerId", "status");

-- CreateIndex
CREATE INDEX "partner_disputes_partnerId_status_idx" ON "partner_disputes"("partnerId", "status");

-- CreateIndex
CREATE INDEX "promo_slot_types_placement_idx" ON "promo_slot_types"("placement");

-- CreateIndex
CREATE INDEX "promo_duration_tiers_slotTypeId_idx" ON "promo_duration_tiers"("slotTypeId");

-- CreateIndex
CREATE INDEX "promo_slots_slotTypeId_date_idx" ON "promo_slots"("slotTypeId", "date");

-- CreateIndex
CREATE INDEX "promo_slots_status_startsAt_idx" ON "promo_slots"("status", "startsAt");

-- CreateIndex
CREATE INDEX "slot_bookings_sellerId_createdAt_idx" ON "slot_bookings"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "slot_bookings_slotId_idx" ON "slot_bookings"("slotId");

-- CreateIndex
CREATE INDEX "slot_bookings_status_paymentStatus_idx" ON "slot_bookings"("status", "paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_program_slug_key" ON "rewards_program"("slug");

-- CreateIndex
CREATE INDEX "rewards_campaigns_isActive_startsAt_endsAt_idx" ON "rewards_campaigns"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "rewards_accounts_userId_key" ON "rewards_accounts"("userId");

-- CreateIndex
CREATE INDEX "rewards_transactions_accountId_createdAt_idx" ON "rewards_transactions"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "rewards_transactions_userId_createdAt_idx" ON "rewards_transactions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deal_campaigns_paymentReference_key" ON "deal_campaigns"("paymentReference");

-- CreateIndex
CREATE INDEX "deal_campaigns_sellerId_createdAt_idx" ON "deal_campaigns"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "deal_campaigns_status_paymentStatus_idx" ON "deal_campaigns"("status", "paymentStatus");

-- CreateIndex
CREATE INDEX "deal_campaigns_selectedProductIds_idx" ON "deal_campaigns" USING GIN ("selectedProductIds");

-- CreateIndex
CREATE INDEX "return_requests_userId_createdAt_idx" ON "return_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "return_requests_status_createdAt_idx" ON "return_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "return_requests_paymentReference_refundStatus_idx" ON "return_requests"("paymentReference", "refundStatus");

-- AddForeignKey
ALTER TABLE "deal_campaigns" ADD CONSTRAINT "deal_campaigns_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_devices" ADD CONSTRAINT "notification_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_policies" ADD CONSTRAINT "product_policies_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_followers" ADD CONSTRAINT "seller_followers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_followers" ADD CONSTRAINT "seller_followers_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_bookings" ADD CONSTRAINT "logistics_bookings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commitments" ADD CONSTRAINT "partner_commitments_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_commitments" ADD CONSTRAINT "partner_commitments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_disputes" ADD CONSTRAINT "partner_disputes_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_disputes" ADD CONSTRAINT "partner_disputes_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "partner_commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_duration_tiers" ADD CONSTRAINT "promo_duration_tiers_slotTypeId_fkey" FOREIGN KEY ("slotTypeId") REFERENCES "promo_slot_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_slots" ADD CONSTRAINT "promo_slots_slotTypeId_fkey" FOREIGN KEY ("slotTypeId") REFERENCES "promo_slot_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "promo_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_durationTierId_fkey" FOREIGN KEY ("durationTierId") REFERENCES "promo_duration_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_bookings" ADD CONSTRAINT "slot_bookings_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards_accounts" ADD CONSTRAINT "rewards_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards_transactions" ADD CONSTRAINT "rewards_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "rewards_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards_transactions" ADD CONSTRAINT "rewards_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
