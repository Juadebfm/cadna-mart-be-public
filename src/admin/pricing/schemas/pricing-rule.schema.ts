import { BaseSchema } from '@shared/base/base.schema';
export enum PricingRuleType {
  MARKUP = 'markup',
  PLATFORM_FEE = 'platform_fee',
  DELIVERY_FEE = 'delivery_fee',
}
export enum PricingRuleScope {
  ALL = 'all',
  CATEGORY = 'category',
  BRAND = 'brand',
}
export enum PricingRuleValueType {
  PERCENT = 'percent',
  FIXED = 'fixed',
}
export class PricingRule extends BaseSchema {
  name!: string;
  type!: PricingRuleType;
  scope!: PricingRuleScope;
  scopeValue!: string | null;
  value!: number;
  valueType!: PricingRuleValueType;
  isActive!: boolean;
  description!: string | null;
}
