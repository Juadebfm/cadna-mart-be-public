import { Injectable } from '@nestjs/common';
import {
  Ack,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@config/config.service';
import { UsersService } from '@users/users.service';
import { AddMessageDto } from './dto/ticket.dto';
import { SupportService } from './support.service';

type SocketIdentity = {
  userId: string;
  accountType: string;
  accountTypes: string[];
};
type SupportSocket = Socket & {
  data: {
    identity?: SocketIdentity;
    ticketContexts?: Record<string, string>;
    messageTimes?: number[];
  };
};
type AckResponse = (value: { ok: boolean; data?: unknown; error?: string }) => void;

@Injectable()
@WebSocketGateway({ namespace: '/support', transports: ['websocket'] })
export class SupportGateway implements OnGatewayInit {
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly supportService: SupportService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server): void {
    server.use(async (socket: SupportSocket, next) => {
      try {
        if (!this.isAllowedOrigin(socket.handshake.headers.origin)) {
          next(new Error('Origin is not allowed'));
          return;
        }
        const token = this.readToken(socket);
        if (!token) {
          next(new Error('Authentication required'));
          return;
        }
        const payload = await this.jwtService.verifyAsync<{ sub?: string }>(token);
        if (!payload.sub) {
          next(new Error('Authentication required'));
          return;
        }
        const user = await this.usersService.findById(payload.sub);
        if (!user?.isActive) {
          next(new Error('Authentication required'));
          return;
        }
        socket.data.identity = {
          userId: payload.sub,
          accountType: String(user.accountType),
          accountTypes: user.accountTypes?.length
            ? user.accountTypes.map(String)
            : [String(user.accountType)],
        };
        socket.data.ticketContexts = {};
        socket.data.messageTimes = [];
        next();
      } catch {
        next(new Error('Authentication required'));
      }
    });
  }

  @SubscribeMessage('support:ticket:join')
  async joinTicket(
    @ConnectedSocket() socket: SupportSocket,
    @MessageBody() payload: { ticketId?: unknown; accountType?: unknown },
    @Ack() ack: AckResponse,
  ): Promise<void> {
    const identity = socket.data.identity;
    const ticketId = typeof payload?.ticketId === 'string' ? payload.ticketId : '';
    const requestedType =
      typeof payload?.accountType === 'string' ? payload.accountType : undefined;
    if (!identity || !/^[a-f0-9]{24}$/i.test(ticketId)) {
      ack({ ok: false, error: 'Invalid ticket access request' });
      return;
    }
    const authorized = await this.supportService.authorizeRealtimeAccess(
      ticketId,
      identity.userId,
      identity.accountTypes,
      requestedType,
    );
    if (!authorized) {
      ack({ ok: false, error: 'Ticket not found' });
      return;
    }
    socket.data.ticketContexts![ticketId] = identity.accountTypes.includes('admin')
      ? 'admin'
      : requestedType!;
    await socket.join(this.ticketRoom(ticketId));
    ack({ ok: true, data: { ticketId } });
  }

  @SubscribeMessage('support:ticket:leave')
  async leaveTicket(
    @ConnectedSocket() socket: SupportSocket,
    @MessageBody() payload: { ticketId?: unknown },
    @Ack() ack: AckResponse,
  ): Promise<void> {
    const ticketId = typeof payload?.ticketId === 'string' ? payload.ticketId : '';
    if (!/^[a-f0-9]{24}$/i.test(ticketId)) {
      ack({ ok: false, error: 'Invalid ticket request' });
      return;
    }
    delete socket.data.ticketContexts?.[ticketId];
    await socket.leave(this.ticketRoom(ticketId));
    ack({ ok: true, data: { ticketId } });
  }

  @SubscribeMessage('support:message:send')
  async sendMessage(
    @ConnectedSocket() socket: SupportSocket,
    @MessageBody()
    payload: {
      ticketId?: unknown;
      body?: unknown;
      clientMessageId?: unknown;
    },
    @Ack() ack: AckResponse,
  ): Promise<void> {
    const identity = socket.data.identity;
    const ticketId = typeof payload?.ticketId === 'string' ? payload.ticketId : '';
    const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
    const clientMessageId =
      typeof payload?.clientMessageId === 'string' ? payload.clientMessageId : '';
    if (!identity || !/^[a-f0-9]{24}$/i.test(ticketId) || !body || body.length > 5000) {
      ack({ ok: false, error: 'Message is invalid' });
      return;
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(clientMessageId)) {
      ack({ ok: false, error: 'A valid clientMessageId is required' });
      return;
    }
    if (!socket.rooms.has(this.ticketRoom(ticketId)) || !socket.data.ticketContexts?.[ticketId]) {
      ack({ ok: false, error: 'Join this ticket before sending a message' });
      return;
    }
    if (!this.consumeMessageAllowance(socket)) {
      ack({ ok: false, error: 'Too many messages; please wait before sending again' });
      return;
    }

    try {
      const message = await this.supportService.addRealtimeMessage(
        ticketId,
        { body, clientMessageId } as AddMessageDto,
        {
          ...identity,
          accountType: socket.data.ticketContexts[ticketId],
        },
      );
      ack({ ok: true, data: message });
    } catch {
      ack({ ok: false, error: 'Message could not be sent to this ticket' });
    }
  }

  publishTicketMessage(eventId: string, ticketId: string, message: object): void {
    this.server?.to(this.ticketRoom(ticketId)).emit('support:message.created', {
      eventId,
      ticketId,
      message,
    });
  }

  publishTicketUpdated(eventId: string, ticketId: string, data: object): void {
    this.server?.to(this.ticketRoom(ticketId)).emit('support:ticket.updated', {
      eventId,
      ticketId,
      ...data,
    });
  }

  private readToken(socket: SupportSocket): string | null {
    const authToken = socket.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }
    const header = socket.handshake.headers.authorization;
    if (typeof header === 'string' && /^Bearer\s+\S+/i.test(header)) {
      return header.replace(/^Bearer\s+/i, '').trim();
    }
    return null;
  }

  private isAllowedOrigin(origin?: string): boolean {
    if (!origin) return true;
    const allowed = this.configService.cors.origin;
    if (allowed === true) return true;
    if (typeof allowed === 'string') return origin === allowed;
    if (Array.isArray(allowed)) return allowed.includes(origin);
    if (this.configService.isDev) {
      return /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i.test(origin);
    }
    return false;
  }

  private consumeMessageAllowance(socket: SupportSocket): boolean {
    const now = Date.now();
    const recent: number[] = (socket.data.messageTimes ?? []).filter(
      (sentAt: number) => now - sentAt < 10_000,
    );
    if (recent.length >= 10) {
      socket.data.messageTimes = recent;
      return false;
    }
    recent.push(now);
    socket.data.messageTimes = recent;
    return true;
  }

  private ticketRoom(ticketId: string): string {
    return `support-ticket:${ticketId}`;
  }
}
