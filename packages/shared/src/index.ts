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

/* ---------------------------------------------------------------------------
 * Catálogo de produtos (RB-013..017) — S3
 * ------------------------------------------------------------------------- */

/** Observação configurável de um produto (RB-016). */
export interface ProductObservationDto {
  id: string;
  name: string;
}

/** Produto do catálogo. `price` = string decimal canônica (por unidade OU por kg); nunca float (RB-047). */
export interface ProductDto {
  id: string;
  categoryId: string;
  name: string;
  price: string;
  type: ProductType; // UNIT | WEIGHED (RB-013)
  usesObservations: boolean; // RB-016
  observations: ProductObservationDto[]; // [] quando não usa
}

/** Categoria com seus produtos ativos. */
export interface CategoryDto {
  id: string;
  name: string;
  sortOrder: number;
  products: ProductDto[];
}

/** GET /products/catalog — catálogo ativo agrupado por categoria. */
export interface CatalogResponse {
  categories: CategoryDto[];
}

/* ---------------------------------------------------------------------------
 * Contas de consumo (RB-001..006, RB-018..021) — S3
 * ------------------------------------------------------------------------- */

/** Abertura de conta (RB-003: ≤1 OPEN por tabType+number). */
export interface OpenAccountRequest {
  tabType: TabType;
  number: number;
}

/** Observação registrada no item (snapshot do nome — RB-021). */
export interface AccountItemObservationDto {
  text: string;
}

/** Item lançado (RB-019: unitPrice/lineTotal congelados). Decimais como string (RB-047). */
export interface AccountItemDto {
  id: string;
  productId: string;
  productName: string; // snapshot p/ exibição
  type: ProductType;
  quantity: number;
  weightGrams: number | null; // preenchido p/ WEIGHED
  unitPrice: string; // por unidade ou por kg, snapshot
  lineTotal: string;
  observations: AccountItemObservationDto[];
}

/** Conta com itens e totais (resumo — RB-018). */
export interface AccountDto {
  id: string;
  tabType: TabType;
  number: number;
  status: AccountStatus;
  openedAt: string; // ISO 8601
  subtotal: string;
  discountTotal: string;
  total: string;
  items: AccountItemDto[];
}

/** Resumo enxuto de uma conta aberta (lista — RB-005 "Em Uso" derivado). */
export interface AccountSummaryDto {
  id: string;
  tabType: TabType;
  number: number;
  total: string;
  itemCount: number;
}

/** GET /accounts — contas OPEN da operação corrente. */
export interface AccountListResponse {
  accounts: AccountSummaryDto[];
}

/** Uma linha do pedido a lançar. UNIT usa `quantity`; WEIGHED usa `weightGrams` (RB-014). */
export interface PlaceItemInput {
  productId: string;
  quantity?: number; // UNIT (default 1)
  weightGrams?: number; // WEIGHED (gramas, inteiro)
  observationIds?: string[]; // ids de ProductObservation selecionadas (RB-016)
}

/** POST /accounts/:id/items — lança o pedido montado de uma vez (carrinho, RB-018). */
export interface PlaceItemsRequest {
  items: PlaceItemInput[];
}

/* ---------------------------------------------------------------------------
 * Pagamento / Desconto / Cancelamento / Fechamento (RB-007/011/012/026..039) — S4
 * ------------------------------------------------------------------------- */

/** Status da liquidação (RB-037..039). */
export enum PaymentStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
  CANCELED = 'CANCELED',
}

/** Aplica desconto na conta (RB-026/027). PERCENT: `value` em % (ex.: "10"); FIXED: R$ (ex.: "5.00"). */
export interface ApplyDiscountRequest {
  type: DiscountType; // PERCENT | FIXED
  value: string; // string decimal canônica
  reason?: string;
}

/** Cancela a conta inteira (RB-030). Motivo obrigatório (auditoria RB-031). */
export interface CancelAccountRequest {
  reason: string;
}

/** Uma forma de pagamento da venda (RB-037). `amount` = string decimal canônica. */
export interface PaymentTenderInput {
  method: PaymentMethod; // CASH | PIX | CREDIT | DEBIT
  amount: string;
}

/** Liquida 1+ contas (grupo). MVP S4 paga 1; `accountIds` aceita N p/ agrupamento futuro (RB-035). */
export interface PayRequest {
  accountIds: string[];
  tenders: PaymentTenderInput[];
}

/** Forma de pagamento registrada na liquidação. */
export interface PaymentTenderDto {
  method: PaymentMethod;
  amount: string;
}

/** Liquidação concluída (RB-037/038). */
export interface PaymentDto {
  id: string;
  accountGroupId: string;
  registerId: string;
  total: string;
  status: PaymentStatus; // SETTLED no fluxo S4
  tenders: PaymentTenderDto[];
  accountIds: string[];
  createdAt: string; // ISO 8601
}

/** GET /registers/current/closing-summary — prévia do fechamento (RB-011). */
export interface RegisterCloseSummary {
  registerId: string;
  openingAmount: string;
  cashReceipts: string; // Σ recebimentos em dinheiro (SALE_RECEIPT)
  expectedAmount: string; // abertura + recebimentos em dinheiro
  openAccountCount: number; // >0 bloqueia o fechamento (RB-012/012a)
}

/** Fecha o caixa: operador informa o valor contado (RB-011). */
export interface CloseRegisterRequest {
  countedAmount: string;
}

/** Resultado do fechamento (RB-011). */
export interface RegisterClosedDto {
  id: string;
  status: OpenClosedStatus; // CLOSED
  openingAmount: string;
  expectedAmount: string;
  countedAmount: string;
  difference: string; // contado − esperado (pode ser negativo)
  closedAt: string; // ISO 8601
}
