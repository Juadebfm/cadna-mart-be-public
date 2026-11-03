import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { UsersService } from '@users/users.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly usersService: UsersService) {
    super();
  }

  serializeUser(user: unknown, done: (err: Error | null, id?: string) => void): void {
    const candidate = user as {
      userId?: string;
      id?: string;
      _id?: { toString?: () => string } | string;
    };
    const userId =
      candidate?.userId ??
      candidate?.id ??
      (typeof candidate?._id === 'string' ? candidate._id : candidate?._id?.toString?.());

    if (!userId) {
      done(new Error('Failed to serialize user: no id on user object'));
      return;
    }

    done(null, userId);
  }

  async deserializeUser(
    userId: string,
    done: (err: Error | null, user?: unknown) => void,
  ): Promise<void> {
    try {
      const user = await this.usersService.findById(userId);
      done(null, user);
    } catch (err) {
      done(err as Error);
    }
  }
}
