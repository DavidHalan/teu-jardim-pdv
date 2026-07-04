import type { PrintJobPayload } from '@teu-jardim/shared';

const WIDTH = 32; // MP-100S TH (57mm) = 32 colunas em fonte A

const TAB_LABEL: Record<string, string> = {
  WRISTBAND: 'PULSEIRA',
  COMANDA: 'COMANDA',
  TABLE: 'MESA',
};

function center(text: string): string {
  const pad = Math.max(0, Math.floor((WIDTH - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function line(char: string): string {
  return char.repeat(WIDTH);
}

/** Térmicas comuns não têm acento no code page default — normaliza p/ ASCII. */
function ascii(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Corpo do cupom de preparo — texto plano 32 col (a mesma string vai pro driver console). */
export function formatCoupon(payload: PrintJobPayload): string {
  const placedAt = new Date(payload.placedAt);
  const when = placedAt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const out: string[] = [];
  out.push(line('='));
  out.push(center(ascii(payload.stationName).toUpperCase()));
  out.push(line('='));
  out.push(`${TAB_LABEL[payload.tabType] ?? payload.tabType} ${payload.number}`);
  out.push(ascii(`${when}  por ${payload.placedBy}`));
  out.push(line('-'));
  for (const item of payload.items) {
    const qty = item.weightGrams !== null ? `${item.weightGrams}g` : `${item.quantity}x`;
    out.push(ascii(`${qty} ${item.name}`));
    for (const obs of item.observations) {
      out.push(ascii(`   - ${obs}`));
    }
  }
  out.push(line('-'));
  return out.join('\n');
}

const ESC = 0x1b;
const GS = 0x1d;
const INIT = Buffer.from([ESC, 0x40]); // ESC @
const DOUBLE_ON = Buffer.from([GS, 0x21, 0x11]); // GS ! — dobro altura+largura
const DOUBLE_OFF = Buffer.from([GS, 0x21, 0x00]);
const FEED_CUT = Buffer.from([0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00]); // feed + partial cut

/**
 * Bytes ESC/POS do cupom: init, cabeçalho em dobro (número da conta legível de longe),
 * corpo em fonte normal, feed+corte. Latin1 basta p/ o texto já normalizado em ASCII.
 */
export function escposEncode(payload: PrintJobPayload): Buffer {
  const header = `${TAB_LABEL[payload.tabType] ?? payload.tabType} ${payload.number}\n`;
  return Buffer.concat([
    INIT,
    DOUBLE_ON,
    Buffer.from(ascii(header), 'latin1'),
    DOUBLE_OFF,
    Buffer.from(formatCoupon(payload) + '\n', 'latin1'),
    FEED_CUT,
  ]);
}
