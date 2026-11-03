import { Injectable } from '@nestjs/common';
import { ConfigService } from '@config/config.service';

export type SellerKycIdType = 'nin' | 'drivers_license' | 'passport' | 'voter_id';
export type KycProviderResult = {
  status: 'verified' | 'not_verified' | 'sandbox' | 'review_required' | 'unavailable';
  mode: 'test' | 'live';
  providerCode: string | null;
  nameMatch: boolean | null;
};

@Injectable()
export class SellerKycProviderService {
  constructor(private readonly config: ConfigService) {}

  get mode(): 'test' | 'live' {
    return this.config.stackApiKyc.mode;
  }

  get consentVersion(): string {
    return this.config.stackApiKyc.consentVersion;
  }

  async verifyIdentity(input: {
    idType: SellerKycIdType;
    idNumber: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: Date | null;
  }): Promise<KycProviderResult> {
    const fields: Record<string, string> = {};
    if (input.idType === 'nin') {
      fields.level = 'basic';
      fields.nin = input.idNumber;
      fields.first_name = input.firstName;
      fields.last_name = input.lastName;
      if (input.dateOfBirth) fields.date_of_birth = input.dateOfBirth.toISOString().slice(0, 10);
    } else if (input.idType === 'drivers_license') {
      fields.licence_number = input.idNumber;
      fields.first_name = input.firstName;
      fields.last_name = input.lastName;
      if (input.dateOfBirth) fields.date_of_birth = input.dateOfBirth.toISOString().slice(0, 10);
    } else if (input.idType === 'passport') {
      fields.passport_number = input.idNumber;
      fields.last_name = input.lastName;
    } else {
      fields.vin = input.idNumber;
      fields.last_name = input.lastName;
    }

    const endpoint = {
      nin: 'verify-nin',
      drivers_license: 'verify-drivers-licence',
      passport: 'verify-passport',
      voter_id: 'verify-voter-id',
    }[input.idType];
    return this.verify(endpoint, fields);
  }

  async verifyBusiness(input: {
    registrationNumber: string;
    companyType: 'RC' | 'BN' | 'LP';
  }): Promise<KycProviderResult> {
    return this.verify('verify-cac', {
      rc_number: input.registrationNumber,
      company_type: input.companyType,
      level: 'basic',
    });
  }

  private async verify(endpoint: string, body: Record<string, string>): Promise<KycProviderResult> {
    const settings = this.config.stackApiKyc;
    const mode = settings.mode;
    if (mode === 'live' && !settings.liveEnabled) {
      return {
        status: 'unavailable',
        mode,
        providerCode: 'LIVE_CHECKS_DISABLED',
        nameMatch: null,
      };
    }
    const apiKey = mode === 'test' ? settings.testApiKey : settings.liveApiKey;
    const publicKey = mode === 'test' ? settings.testPublicKey : settings.livePublicKey;
    if (!apiKey || !publicKey) {
      return {
        status: 'unavailable',
        mode,
        providerCode: 'PROVIDER_NOT_CONFIGURED',
        nameMatch: null,
      };
    }

    let response: Response;
    let result: Record<string, any>;
    try {
      response = await fetch(`https://api.stackapi.app/v1/identity/${endpoint}`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'X-Public-Key': publicKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const payload: unknown = await response.json();
      result =
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, any>)
          : {};
    } catch {
      return { status: 'unavailable', mode, providerCode: 'PROVIDER_UNAVAILABLE', nameMatch: null };
    }

    const rawProviderCode =
      typeof result.code === 'string'
        ? result.code
        : typeof result.error?.code === 'string'
          ? result.error.code
          : null;
    const providerCode =
      rawProviderCode && /^[a-z0-9_]{1,80}$/i.test(rawProviderCode) ? rawProviderCode : null;
    if (!response.ok) {
      if (response.status >= 500) {
        return {
          status: 'unavailable',
          mode,
          providerCode: providerCode ?? 'PROVIDER_UNAVAILABLE',
          nameMatch: null,
        };
      }
      return {
        status: 'review_required',
        mode,
        providerCode: providerCode ?? `HTTP_${response.status}`,
        nameMatch: null,
      };
    }

    const nameMatch = typeof result.match?.all === 'boolean' ? result.match.all : null;
    const resultStatus = String(result.status ?? '').toLowerCase();
    if (mode === 'test' || resultStatus === 'sandbox' || result.mode === 'test') {
      return { status: 'sandbox', mode, providerCode, nameMatch };
    }
    if (resultStatus === 'verified' && (endpoint === 'verify-cac' || nameMatch === true)) {
      return { status: 'verified', mode, providerCode, nameMatch };
    }
    if (resultStatus === 'not_verified') {
      return { status: 'not_verified', mode, providerCode, nameMatch };
    }
    return {
      status: 'review_required',
      mode,
      providerCode: providerCode ?? 'UNRECOGNIZED_RESULT',
      nameMatch,
    };
  }
}
