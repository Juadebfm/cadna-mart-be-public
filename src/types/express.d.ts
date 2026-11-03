declare global {
  namespace Express {
    interface User {
      userId: string;
      email: string;
      accountType: string;
      accountTypes?: string[];
    }
  }
}

export {};
