import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@config/config.service';

type BankOption = { code: string; name: string };
type BankLookup = { accountName: string; bankCode: string; bankName: string };

@Injectable()
export class SellerBankingService {
  private nombaToken?: { value: string; expiresAt: number };
  private banksCache?: { provider: string; expiresAt: number; items: BankOption[] };

  constructor(private readonly config: ConfigService) {}

  get providerName(): string {
    return this.config.sellerBankVerification.provider ?? 'unconfigured';
  }

  async listBanks(): Promise<BankOption[]> {
    const settings = this.config.sellerBankVerification;
    const provider = settings.provider;
    if (!provider) {
      throw new ServiceUnavailableException(
        'Choose a seller bank verification provider in the service environment',
      );
    }
    if (this.banksCache?.provider === provider && this.banksCache.expiresAt > Date.now()) {
      return this.banksCache.items;
    }

    let banks: BankOption[];
    if (provider === 'paystack') {
      if (!settings.paystackSecretKey)
        throw new ServiceUnavailableException('Paystack is not configured for seller bank lookup');
      const response = await fetch('https://api.paystack.co/bank?country=nigeria&perPage=100', {
        headers: { Authorization: `Bearer ${settings.paystackSecretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await this.readJson(response);
      if (!response.ok || body.status !== true || !Array.isArray(body.data)) {
        throw new BadGatewayException('Could not load banks from Paystack');
      }
      banks = body.data
        .filter((bank: any) => bank?.code && bank?.name && bank.active !== false)
        .map((bank: any) => ({ code: String(bank.code), name: String(bank.name) }));
    } else {
      const token = await this.getNombaToken();
      const response = await fetch('https://api.nomba.com/v1/transfers/banks', {
        headers: { Authorization: `Bearer ${token}`, accountId: settings.nombaAccountId },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await this.readJson(response);
      if (!response.ok || body.code !== '00' || !Array.isArray(body.data)) {
        throw new BadGatewayException('Could not load banks from Nomba');
      }
      banks = body.data
        .filter((bank: any) => bank?.code && bank?.name)
        .map((bank: any) => ({ code: String(bank.code), name: String(bank.name) }));
    }
    this.banksCache = { provider, expiresAt: Date.now() + 60 * 60 * 1000, items: banks };
    return banks;
  }

  async resolveAccount(bankCode: string, accountNumber: string): Promise<BankLookup> {
    const settings = this.config.sellerBankVerification;
    if (settings.provider === 'paystack') {
      if (!settings.paystackSecretKey)
        throw new ServiceUnavailableException('Paystack is not configured for seller bank lookup');
      const query = new URLSearchParams({ bank_code: bankCode, account_number: accountNumber });
      const response = await fetch(`https://api.paystack.co/bank/resolve?${query}`, {
        headers: { Authorization: `Bearer ${settings.paystackSecretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await this.readJson(response);
      if (!response.ok || body.status !== true || !body.data?.account_name) {
        throw new BadGatewayException('The bank account could not be verified by Paystack');
      }
      const bank = (await this.listBanks()).find((item) => item.code === bankCode);
      if (!bank) throw new BadGatewayException('Bank code is not available through Paystack');
      return { accountName: String(body.data.account_name), bankCode, bankName: bank.name };
    }
    if (settings.provider === 'nomba') {
      const token = await this.getNombaToken();
      const response = await fetch('https://api.nomba.com/v1/transfers/bank/lookup', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          accountId: settings.nombaAccountId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bankCode, accountNumber }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await this.readJson(response);
      if (!response.ok || body.code !== '00' || !body.data?.accountName) {
        throw new BadGatewayException('The bank account could not be verified by Nomba');
      }
      const bank = (await this.listBanks()).find((item) => item.code === bankCode);
      if (!bank) throw new BadGatewayException('Bank code is not available through Nomba');
      return { accountName: String(body.data.accountName), bankCode, bankName: bank.name };
    }
    throw new ServiceUnavailableException(
      'Choose a seller bank verification provider in the service environment',
    );
  }

  private async getNombaToken(): Promise<string> {
    const settings = this.config.sellerBankVerification;
    if (!settings.nombaAccountId || !settings.nombaClientId || !settings.nombaClientSecret) {
      throw new ServiceUnavailableException(
        'Nomba seller bank lookup credentials are not configured',
      );
    }
    if (this.nombaToken && this.nombaToken.expiresAt > Date.now() + 30_000) {
      return this.nombaToken.value;
    }
    const response = await fetch('https://api.nomba.com/v1/auth/token/issue', {
      method: 'POST',
      headers: { accountId: settings.nombaAccountId, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: settings.nombaClientId,
        client_secret: settings.nombaClientSecret,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await this.readJson(response);
    const token = body.data?.access_token;
    const expiry = Date.parse(body.data?.expiresAt ?? '');
    if (
      !response.ok ||
      body.code !== '00' ||
      typeof token !== 'string' ||
      !Number.isFinite(expiry)
    ) {
      throw new BadGatewayException('Could not authenticate with Nomba');
    }
    this.nombaToken = { value: token, expiresAt: expiry };
    return token;
  }

  private async readJson(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      throw new BadGatewayException('Bank verification provider returned an invalid response');
    }
  }
}
