/**
 * Contratos compartilhados entre `apps/api` e `apps/web`.
 * Enums refletem a linguagem ubíqua — ver docs/glossary.md.
 * Nomes em inglês (código); termos de negócio mapeados no glossário.
 */

/** Perfil de usuário (RB-040..RB-042). */
export enum Role {
  EMPLOYEE = 'EMPLOYEE',
  CASHIER = 'CASHIER',
  ADMIN = 'ADMIN',
}

/** Tipo da conta de consumo: pulseira / comanda / mesa (RB-002). */
export enum TabType {
  WRISTBAND = 'WRISTBAND',
  COMANDA = 'COMANDA',
  TABLE = 'TABLE',
}

/** Estado da conta-sessão (RB-004). */
export enum AccountStatus {
  OPEN = 'OPEN',
  PAID = 'PAID',
  CANCELED = 'CANCELED',
}

/** Tipo de produto (RB-013). */
export enum ProductType {
  UNIT = 'UNIT',
  WEIGHED = 'WEIGHED',
}

/** Status de produção do item no KDS (RB-023). */
export enum KdsStatus {
  PENDING = 'PENDING',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  CANCELED = 'CANCELED',
}

/** Tipo de movimentação de caixa (RB-010). */
export enum CashMovementType {
  SALE_RECEIPT = 'SALE_RECEIPT',
  WITHDRAWAL = 'WITHDRAWAL',
  SUPPLY = 'SUPPLY',
}

/** Tipo de desconto (RB-027). */
export enum DiscountType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

/** Forma de pagamento (RB-037). */
export enum PaymentMethod {
  CASH = 'CASH',
  PIX = 'PIX',
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

/** Status genérico aberto/fechado (operação e caixa). */
export enum OpenClosedStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/** Resposta do health check da API. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

/** Credenciais de login (RB-040..042). */
export interface LoginRequest {
  username: string;
  password: string;
}

/** Usuário autenticado exposto ao cliente (sem hash de senha). */
export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

/** Resposta do login: token de acesso + usuário. */
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** Payload assinado no JWT (access-only). */
export interface JwtPayload {
  sub: string; // user id
  name: string;
  role: Role;
}

/** Operação / período operacional (RB-006..008). */
export interface BusinessSessionDto {
  id: string;
  name: string;
  status: OpenClosedStatus;
  openedById: string;
  openedAt: string; // ISO 8601
  closedAt: string | null;
}

/** Abertura de operação. */
export interface OpenSessionRequest {
  name: string;
}

/** GET /business-sessions/current — embrulhado para JSON sempre válido (evita corpo vazio quando null). */
export interface CurrentSessionResponse {
  session: BusinessSessionDto | null;
}

/** Caixa (RB-009..012). `openingAmount` = string decimal canônica (ex.: "100.00"); nunca float (RB-047). */
export interface RegisterDto {
  id: string;
  businessSessionId: string;
  operatorId: string;
  openingAmount: string;
  status: OpenClosedStatus;
  openedAt: string; // ISO 8601
  closedAt: string | null;
}

/** Abertura de caixa (RB-009). */
export interface OpenRegisterRequest {
  openingAmount: string; // string decimal, ex.: "100.00"
}

/** GET /registers/current — caixa OPEN do operador logado (ou null). */
export interface CurrentRegisterResponse {
  register: RegisterDto | null;
}
