// LOS RECIBOS EN PAPEL — la vista imprimible (D12 «Imprimir» y «Descargar PDF», D11 «Imprimir los N»).
//
// La app no genera PDF en el servidor ni escribe Drive: el navegador imprime esta hoja, y «Descargar
// PDF» es el mismo diálogo con «Guardar como PDF». Es el patrón de la planilla de Herramientas
// (`VistaPlanilla.tsx`): CSS de impresión, un recibo por hoja A4, y la barra de la app afuera.

import type { ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import type { ReciboDePago } from '../datos'
import { Imprimir } from './Botones'
import { DocumentoRecibo } from './piezas'

export function HojaImprimible({ recibos, titulo, pdf, volver }: {
  recibos: ReciboDePago[]; titulo: string; pdf: boolean; volver: ReactNode
}) {
  return (
    <div style={{ background: V.fondo, minHeight: '100vh', padding: '22px 20px 40px' }} data-testid="recibos-imprimibles">
      <style>{`@media print {
        header, nav, [data-no-imprimir] { display: none !important; }
        body { background: #fff; }
        @page { size: A4; margin: 14mm; }
        [data-hoja-recibo] { break-after: page; break-inside: avoid; padding: 0 !important; }
        [data-hoja-recibo]:last-child { break-after: auto; }
      }`}</style>
      <div data-no-imprimir style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 640, margin: '0 auto 18px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '15px', fontWeight: 600 }}>{titulo}</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {volver}
          <Imprimir texto={pdf ? 'Guardar como PDF' : 'Imprimir'} testid="imprimir-hoja" />
        </div>
        {pdf && <div style={{ width: '100%', fontSize: '12px', color: V.apagado }}>En el diálogo de impresión elegí «Guardar como PDF».</div>}
      </div>
      {recibos.length === 0 && (
        <div style={{ maxWidth: 640, margin: '0 auto', fontSize: '13px', color: V.apagado }}>No hay recibos para imprimir.</div>
      )}
      {recibos.map((r) => (
        <div key={r.id} data-hoja-recibo style={{ maxWidth: 640, margin: '0 auto 24px' }}>
          <DocumentoRecibo testid={`hoja-${r.codigo}`} d={{
            codigo: r.codigo, personaNombre: r.personaNombre, desde: r.desde, hasta: r.hasta, obra: r.obra, foto: r, trazo: r.trazo,
          }} />
        </div>
      ))}
    </div>
  )
}
