import 'dotenv/config';
import { PRINT_SERVICE_KEY_HEADER, PrintJobStatus } from '@teu-jardim/shared';
import type { AckPrintJobRequest, PrintJobDto, PrintJobListResponse } from '@teu-jardim/shared';
import { escposEncode, formatCoupon } from './render';

/**
 * Print Service (ADR-0020): consumidor "burro" da fila — poll QUEUED na API, imprime,
 * ACK PRINTED/FAILED. Nunca toca o Postgres (fala pela API — Fase 11). Roda no host do
 * PC do caixa (ADR-0021). TTL/expiração é policy do SERVIDOR, não daqui.
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.PRINT_SERVICE_API_KEY ?? '';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2000);
const DRIVER = process.env.PRINTER_DRIVER ?? 'console';

if (!API_KEY) {
  console.error('[print-service] PRINT_SERVICE_API_KEY ausente — configure o .env');
  process.exit(1);
}

interface PrinterDriver {
  /** Imprime o cupom. `raw` = bytes ESC/POS; `text` = render legível (drivers sem device). */
  print(raw: Buffer, text: string): Promise<void>;
}

// Driver console (thin-slice, dono 2026-07-04: térmica não conectada neste PC).
// Driver real da Bematech MP-100S TH (ESC/POS por USB/serial) entra no deploy/F-6 full.
const consoleDriver: PrinterDriver = {
  async print(_raw, text) {
    console.log('\n[print-service] CUPOM ↓\n' + text + '\n');
  },
};

const drivers: Record<string, PrinterDriver> = { console: consoleDriver };
const selected = drivers[DRIVER];
if (!selected) {
  console.error(`[print-service] driver desconhecido: ${DRIVER} (disponíveis: ${Object.keys(drivers).join(', ')})`);
  process.exit(1);
}
const defaultDriver: PrinterDriver = selected;

// Roteamento A/B (ADR-0020): mapa estação→driver via env (JSON; chave = stationId ou
// stationName). Estação fora do mapa cai no driver default. Ex. futuro com a térmica:
//   STATION_PRINTERS={"Sucos":"bematech-a","Caixa":"bematech-b"}
const stationPrinters: Record<string, string> = JSON.parse(process.env.STATION_PRINTERS ?? '{}');

function driverFor(job: PrintJobDto): PrinterDriver {
  const name = stationPrinters[job.stationId] ?? stationPrinters[job.payload.stationName];
  if (name === undefined) return defaultDriver;
  const d = drivers[name];
  // driver mal configurado → erro → ACK FAILED com a causa (job não fica preso em QUEUED)
  if (!d) throw new Error(`driver "${name}" da estação ${job.payload.stationName} não existe`);
  return d;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      [PRINT_SERVICE_KEY_HEADER]: API_KEY,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function ack(jobId: string, body: AckPrintJobRequest): Promise<PrintJobDto> {
  return api<PrintJobDto>(`/print-jobs/${jobId}/ack`, { method: 'POST', body: JSON.stringify(body) });
}

async function handle(job: PrintJobDto): Promise<void> {
  try {
    await driverFor(job).print(escposEncode(job.payload), formatCoupon(job.payload));
    await ack(job.id, { result: PrintJobStatus.PRINTED });
    console.log(`[print-service] PRINTED ${job.payload.stationName} · ${job.payload.tabType} ${job.payload.number} (${job.id})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[print-service] FAILED ${job.id}: ${message}`);
    await ack(job.id, { result: PrintJobStatus.FAILED, error: message.slice(0, 500) }).catch((ackErr) =>
      console.error(`[print-service] ack FAILED não entregue (${job.id}): ${String(ackErr)}`),
    );
  }
}

let busy = false;
async function tick(): Promise<void> {
  if (busy) return; // sem reentrância — o próximo tick pega o resto
  busy = true;
  try {
    const { jobs } = await api<PrintJobListResponse>('/print-jobs?status=QUEUED');
    for (const job of jobs) await handle(job); // FIFO, 1 device
  } catch (err) {
    console.error(`[print-service] poll falhou (API fora?): ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    busy = false;
  }
}

console.log(`[print-service] driver=${DRIVER} api=${API_URL} poll=${POLL_INTERVAL_MS}ms`);
setInterval(() => void tick(), POLL_INTERVAL_MS);
void tick();
