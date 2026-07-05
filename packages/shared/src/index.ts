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

/** Tipo de movimentação de caixa (RB-010/049). */
export enum CashMovementType {
  SALE_RECEIPT = 'SALE_RECEIPT',
  WITHDRAWAL = 'WITHDRAWAL',
  SUPPLY = 'SUPPLY',
  PAYMENT_REVERSAL = 'PAYMENT_REVERSAL',
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

/** Status da liquidação (RB-037..039, RB-048). */
export enum PaymentStatus {
  PENDING = 'PENDING',
  SETTLED = 'SETTLED',
  CANCELED = 'CANCELED',
  REVERSED = 'REVERSED',
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

/** Cancela UM item (RB-029/056). Motivo obrigatório (auditoria RB-031). */
export interface CancelItemRequest {
  reason: string;
}

/** Transfere UM item p/ outra conta OPEN da operação (RB-032/034). Não reimprime (RB-033). */
export interface TransferItemRequest {
  toAccountId: string;
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

/** POST /payments/:id/reverse — estorno (RB-048): motivo obrigatório, auditado. */
export interface ReversePaymentRequest {
  reason: string;
}

/** Referência de conta na listagem de pagamentos (reconhecimento visual no caixa). */
export interface PaymentAccountRef {
  id: string;
  tabType: TabType;
  number: number;
}

/** Item de GET /payments — pagamentos da operação corrente (base do estorno). */
export interface PaymentListItemDto {
  id: string;
  total: string;
  status: PaymentStatus;
  tenders: PaymentTenderDto[];
  accounts: PaymentAccountRef[];
  createdAt: string; // ISO 8601
}

/** GET /payments — mais recente primeiro. */
export interface PaymentListResponse {
  payments: PaymentListItemDto[];
}

/** GET /registers/current/closing-summary — prévia do fechamento (RB-011/052). */
export interface RegisterCloseSummary {
  registerId: string;
  openingAmount: string;
  cashReceipts: string; // Σ recebimentos em dinheiro (SALE_RECEIPT)
  cashSupplies: string; // Σ suprimentos (RB-052 — soma no esperado)
  cashWithdrawals: string; // Σ sangrias (RB-052 — subtrai do esperado)
  cashReversals: string; // Σ estornos em dinheiro (RB-049 — subtrai do esperado)
  expectedAmount: string; // abertura + recebimentos + suprimentos − sangrias − estornos
  openAccountCount: number; // >0 bloqueia o fechamento (RB-012/012a)
}

// ----------------------------------------------------------------------------
// Sangria / Suprimento (F-1 — RB-010/052)
// ----------------------------------------------------------------------------

/** POST /registers/current/withdrawals — sangria (RB-052: valor + motivo, Caixa). */
export interface CashWithdrawalRequest {
  amount: string; // Money string (RB-047), > 0
  reason: string; // obrigatório (RB-052)
}

/** POST /registers/current/supplies — suprimento (RB-052: valor + motivo, Caixa). */
export interface CashSupplyRequest {
  amount: string;
  reason: string;
}

/** Movimentação de caixa (RB-010). */
export interface CashMovementDto {
  id: string;
  type: CashMovementType;
  amount: string;
  reason: string | null; // SALE_RECEIPT não carrega motivo
  createdAt: string; // ISO 8601
}

/** GET /registers/current/movements — todos os tipos, mais recente primeiro. */
export interface RegisterMovementsResponse {
  movements: CashMovementDto[];
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

// ----------------------------------------------------------------------------
// Relatórios (F-7 — RB-053/053a): 5 projeções query-time por operação.
// Money = string decimal (RB-047). MVP = JSON; ?format=csv reservado (futuro).
// ----------------------------------------------------------------------------

export type ReportKind =
  | 'closing'
  | 'sales-by-method'
  | 'sales-by-product'
  | 'exceptions'
  | 'ticket';

/** (1) Fechamento + diferença por caixa. Caixa OPEN: esperado corrente, contado/diferença null. */
export interface ClosingReportRow {
  registerId: string;
  operatorName: string;
  status: OpenClosedStatus;
  openingAmount: string;
  cashReceipts: string;
  cashSupplies: string;
  cashWithdrawals: string;
  cashReversals: string;
  expectedAmount: string;
  countedAmount: string | null;
  difference: string | null;
}
export interface ClosingReport {
  businessSessionId: string;
  registers: ClosingReportRow[];
}

/** (2) Vendas por forma de pagamento — tenders de pagamentos SETTLED (estornado sai). */
export interface SalesByMethodRow {
  method: PaymentMethod;
  total: string;
}
export interface SalesByMethodReport {
  businessSessionId: string;
  rows: SalesByMethodRow[];
  total: string;
}

/** (3) Vendas por produto/categoria — itens ativos de contas PAID, ranking por R$ desc. */
export interface SalesByProductRow {
  productId: string;
  productName: string;
  categoryName: string;
  quantity: number; // unidades (UNIT)
  weightGrams: number; // Σ gramas (WEIGHED); 0 quando UNIT
  total: string;
}
export interface SalesByProductReport {
  businessSessionId: string;
  rows: SalesByProductRow[];
}

/** (4) Exceções — cancelamentos, descontos e estornos com operador e motivo (do AuditLog). */
export type ExceptionType = 'ITEM_CANCELED' | 'ACCOUNT_CANCEL' | 'DISCOUNT_APPLIED' | 'PAYMENT_REVERSED';
export interface ExceptionRow {
  at: string; // ISO 8601
  type: ExceptionType;
  operatorName: string;
  reason: string | null;
  detail: string | null; // valor/contexto do metadata quando disponível
}
export interface ExceptionsReport {
  businessSessionId: string;
  rows: ExceptionRow[];
}

/** (5) Ticket médio por conta — contas PAID da operação. */
export interface TicketReport {
  businessSessionId: string;
  accountCount: number;
  revenue: string;
  average: string;
}

// ----------------------------------------------------------------------------
// Impressão de preparo (F-6 — RB-022/051, ADR-0012/0015/0020)
// Fila no Postgres, dona = API; apps/print-service consome por poll e dá ACK.
// ----------------------------------------------------------------------------

/** Ciclo do cupom (state-machines.md). Thin-slice usa QUEUED→PRINTED/FAILED; EXPIRED = F-6 full. */
export enum PrintJobStatus {
  QUEUED = 'QUEUED',
  PRINTED = 'PRINTED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

/** Item do cupom — snapshot congelado no lançamento (nome/obs não seguem o catálogo). */
export interface PrintJobItem {
  name: string;
  quantity: number;
  weightGrams: number | null;
  observations: string[];
}

/** Conteúdo do cupom de preparo (payload congelado do PrintJob). */
export interface PrintJobPayload {
  tabType: TabType;
  number: number;
  stationName: string;
  items: PrintJobItem[];
  placedBy: string; // nome do autor do lançamento
  placedAt: string; // ISO 8601
}

export interface PrintJobDto {
  id: string;
  accountId: string;
  stationId: string;
  batchId: string; // Idempotency-Key do PLACE_ORDER (ADR-0015: 1 cupom por lançamento)
  status: PrintJobStatus;
  payload: PrintJobPayload;
  error: string | null;
  createdAt: string; // ISO 8601
  ackedAt: string | null;
  dismissedAt: string | null; // ciência do alerta EXPIRED/FAILED pelo autor (RB-051)
}

/** GET /print-jobs?status= — poll do Print Service (FIFO: mais antigo primeiro). */
export interface PrintJobListResponse {
  jobs: PrintJobDto[];
}

/** POST /print-jobs/:id/ack — resultado reportado pelo Print Service (idempotente por transição). */
export interface AckPrintJobRequest {
  result: PrintJobStatus.PRINTED | PrintJobStatus.FAILED;
  error?: string;
}

/** Autenticação do print-service (cliente headless, mesmo host): chave estática via env. */
export const PRINT_SERVICE_KEY_HEADER = 'X-Print-Service-Key';

// ----------------------------------------------------------------------------
// Idempotência (ADR-0019/0026): mutação financeira exige este header (UUID por
// intenção, gerado pelo cliente). Retry com a mesma chave devolve a resposta
// original; mesma chave com payload diferente → 409.
// ----------------------------------------------------------------------------

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
