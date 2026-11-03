import { BaseSchema } from '@shared/base/base.schema';
class PolicyItem {
  title!: string;
  summary!: string;
  detailsUrl!: string | null;
}
export class ProductPolicy extends BaseSchema {
  product!: string;
  returnPolicy!: PolicyItem;
  warrantyPolicy!: PolicyItem;
}
