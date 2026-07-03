import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { User } from '../../prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Usuário ativo por username, ou null. Inclui passwordHash (uso interno do AuthService). */
  findActiveByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { username, active: true } });
  }
}
