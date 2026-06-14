import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@teu-jardim/shared';

/** Injeta o payload do JWT já verificado pelo JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest<{ user: JwtPayload }>().user,
);
