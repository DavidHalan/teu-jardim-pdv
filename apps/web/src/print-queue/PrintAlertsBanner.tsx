import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { PrintJobStatus } from '@teu-jardim/shared';
import type { PrintJobDto } from '@teu-jardim/shared';
import { printQueueApi } from './print-queue-api';
import { Button } from '../shared/ui';

const POLL_MS = 20_000;

const TAB_SINGULAR: Record<string, string> = {
  WRISTBAND: 'Pulseira',
  COMANDA: 'Comanda',
  TABLE: 'Mesa',
};

/**
 * Fallback de voz (RB-051): cupom EXPIRED/FAILED do operador logado vira faixa fixa no
 * topo até ele dar ciência ("Avisei a estação"). Polling leve — read-snapshot periódico
 * (ADR-0023 proíbe fila offline/otimista, não leitura); alertas de produção são o único
 * dado "contínuo" do front (frontend-arch §UX).
 */
export function PrintAlertsBanner(): React.JSX.Element | null {
  const [alerts, setAlerts] = useState<PrintJobDto[]>([]);
  const [dismissing, setDismissing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const res = await printQueueApi.alerts();
        if (alive) setAlerts(res.jobs);
      } catch {
        // silencioso: sem rede/401 não pode derrubar a tela operacional; próximo tick tenta de novo
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  function dismiss(job: PrintJobDto): void {
    if (dismissing) return;
    setDismissing(job.id);
    printQueueApi
      .dismiss(job.id)
      .then((updated) => setAlerts((cur) => cur.filter((a) => a.id !== updated.id)))
      .catch(() => undefined) // 404 = já dispensado noutro kiosk; o poll reconcilia
      .finally(() => setDismissing(null));
  }

  if (alerts.length === 0) return null;

  return (
    <div style={styles.band} role="alert" aria-label="Cupons sem impressão">
      {alerts.map((job) => (
        <div key={job.id} style={styles.row}>
          <span style={styles.text}>
            <strong>
              {job.status === PrintJobStatus.FAILED ? 'Impressão falhou' : 'Cupom não saiu'}
            </strong>
            {' — '}
            {TAB_SINGULAR[job.payload.tabType] ?? job.payload.tabType} {job.payload.number} ·{' '}
            {job.payload.stationName}. Avise a estação de viva voz.
          </span>
          <Button
            variant="secondary"
            style={styles.ackBtn}
            onClick={() => dismiss(job)}
            busy={dismissing === job.id}
          >
            Avisei a estação
          </Button>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  band: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'grid',
    gap: '1px',
    background: 'var(--tj-warn-tint)',
    borderBottom: '1px solid var(--tj-hairline)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
    padding: 'var(--tj-space-2) var(--tj-space-4)',
  },
  text: {
    fontSize: '15px',
    lineHeight: 1.4,
    color: 'var(--tj-warn)',
  },
  ackBtn: { minHeight: '40px', padding: '0 var(--tj-space-3)', fontSize: '14px', flexShrink: 0 },
};
