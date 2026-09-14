// LAS COTIZACIONES DE DRIVE, DEBAJO DE LOS PRESUPUESTOS DEL MÓDULO (dueño, 14/09/2026).
//
// Una lista compacta, no una tabla nueva: nombre, dónde está, fecha y el enlace a Drive. El archivo se
// abre en Drive —no se copia al OS— y el porqué de la clasificación va en el `title`, no en un párrafo.

import { V } from '@/shared/components/v2/patron'
import type { CotizacionDeDrive } from '../services/cotizacionesDeDrive'

const fechaCorta = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Argentina/San_Juan' })
}

export function CotizacionesDeDrive({ filas, truncado = false, error = null }: {
  filas: CotizacionDeDrive[]
  truncado?: boolean
  error?: string | null
}) {
  return (
    <div data-testid="cotizaciones-drive" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 8, borderBottom: `1px solid ${V.linea}` }}>
        <span style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}>Cotizaciones en Drive</span>
        <span style={{ fontSize: '11.5px', color: V.apagado }} data-testid="cotizaciones-drive-n">
          {error ? 'no se pudo leer la carpeta' : `${filas.length}${truncado ? '+' : ''}`}
        </span>
      </div>
      {error ? (
        <p style={{ fontSize: '12px', color: V.warn, paddingTop: 8 }}>{error}</p>
      ) : filas.length === 0 ? (
        <p style={{ fontSize: '12px', color: V.apagado, paddingTop: 8 }} data-testid="cotizaciones-drive-vacio">
          No hay archivos de cotización en la carpeta del cliente.
        </p>
      ) : (
        filas.map((c) => (
          <div key={c.id} data-testid="fila-cotizacion-drive" title={c.porque ?? undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32, borderBottom: `1px solid ${V.lineaFila}`, fontSize: '12.5px' }}>
            <span className="truncate" style={{ flex: 1, minWidth: 0, color: V.tinta }}>
              {c.nombre}
              {c.subcarpeta ? <span style={{ color: V.tenue, fontSize: '11px', marginLeft: 8 }}>{c.subcarpeta}</span> : null}
            </span>
            <span className="font-mono tabular-nums" style={{ fontSize: '11.5px', color: V.apagado, flexShrink: 0 }}>
              {fechaCorta(c.fecha)}
            </span>
            {c.href ? (
              <a href={c.href} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: V.tinta, textDecoration: 'none', flexShrink: 0 }}>
                Abrir en Drive ↗
              </a>
            ) : <span style={{ fontSize: '12px', color: V.tenue, flexShrink: 0 }}>sin enlace</span>}
          </div>
        ))
      )}
    </div>
  )
}
