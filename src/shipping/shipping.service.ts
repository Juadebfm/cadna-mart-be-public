import { Injectable } from '@nestjs/common';

function formatMoney(amount: number, currency = 'NGN') {
  return { amount, currency, formatted: `₦${amount.toLocaleString('en-NG')}` };
}

@Injectable()
export class ShippingService {
  async getEstimate(_productId: string, city: string, _variantId?: string) {
    const normalizedCity = city?.toLowerCase().trim() ?? '';

    return {
      city: normalizedCity,
      sameCityDelivery: '2-4 working days',
      otherCitiesDelivery: '5-7 working days',
      freeShippingThreshold: formatMoney(150000),
      estimatedShippingCost: formatMoney(0),
    };
  }
}
