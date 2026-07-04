import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../prisma/client';
import type { IdempotencyKey } from '../prisma/client';
import { hashRequest } from './request-hash';

interface ExecuteOptions<T> {
  /** Identificador do comando (EN, ex.: 'PAY') — escopo da unicidade (command, key). */
  command: string;
  /** Idempotency-Key do cliente (UUID por intenção — ADR-0026 §6). */
  key: string;
  /** Payload da intenção — hash detecta reuso da chave com payload diferente. */
  request: unknown;
  /** Comando de domínio. Roda DENTRO da transação que grava a chave e a resposta. */
  run: (tx: Prisma.TransactionClient) => Promise<T>;
}

/**
 * Dedup de comando financeiro (ADR-0019/0025/0026). Chave e resposta são gravadas na
 * MESMA transação do comando: replay devolve a resposta original sem reexecutar; corrida
 * com a mesma chave é arbitrada pelo unique (command, key) no banco (o INSERT vem ANTES
 * do comando — o concorrente bloqueia no índice e nunca executa o comando duas vezes).
 * Erro de domínio aborta a transação e NÃO grava a chave — retry pós-erro reexecuta limpo
 * (só sucesso é cacheado).
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>({ command, key, request, run }: ExecuteOptions<T>): Promise<T> {
    const requestHash = hashRequest(request);

    // Replay barato: chave já registrada → devolve sem tocar no domínio.
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { command_key: { command, key } },
    });
    if (existing) return this.replay<T>(existing, requestHash);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({ data: { command, key, requestHash } });
        const body = await run(tx);
        await tx.idempotencyKey.update({
          where: { command_key: { command, key } },
          data: { responseStatus: 201, responseBody: body as Prisma.InputJsonValue },
        });
        return body;
      });
    } catch (err) {
      // P2002 na chave = corrida perdida para uma execução já commitada → replay dela.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const row = await this.prisma.idempotencyKey.findUnique({
          where: { command_key: { command, key } },
        });
        if (row) return this.replay<T>(row, requestHash);
      }
      throw err;
    }
  }

  private replay<T>(row: IdempotencyKey, requestHash: string): T {
    if (row.requestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key já usada com outro payload — gere uma chave nova por intenção.',
      );
    }
    if (row.responseBody === null) {
      // Inatingível com o desenho in-tx (linha commitada sempre tem resposta); defensivo.
      throw new ConflictException('Comando ainda em processamento — tente novamente.');
    }
    return row.responseBody as T;
  }
}
