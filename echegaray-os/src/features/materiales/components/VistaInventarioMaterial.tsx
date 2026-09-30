// MATERIAL · INVENTARIO — una fila por material con su total y dónde está (calcado del Inventario de
// Herramientas; dueño, 29/09 y 30/09/2026). Sin stock mínimo ni «Reponer» (29/09).
//
// Se filtra por texto y por lugar en la URL (la vista filtrada se pasa por chat). El «Ingresar» es la
// entrada sin pedido (stock inicial, compra directa); mover, usar y contar se hacen en Ubicaciones, que es
// donde el material está.

import Link from 'next/link'
import { BuscadorURL, Filtros } from '@/shared/components/ds'
import { eyebrow, V } from '@/features/herramientas/components/estilo'
import { cuando } from '@/features/herramientas/components/formato'
import { inventarioPorMaterial, type MovimientoMaterial } from '../logica/inventario'
import { textoStock, type Destino, type Existencia, type Lugar } from '../logica/stock'
import { IngresarEscritorio } from './IngresarEscritorio'

const BASE = '/herramientas/material'
const COLS = 'minmax(0,1.3fr) 120px minmax(0,1.6fr) 110px'

export function VistaInventarioMaterial({ existencias, lugares, movimientos, destinos, q, lugar, puedeOperar, hoy = new Date() }: {
  existencias: Existencia[]
  lugares: Lugar[]
  movimientos: MovimientoMaterial[]
  destinos: Destino[]
  q: string | null
  lugar: string | null
  puedeOperar: boolean
  hoy?: Date
}) {
  const todas = inventarioPorMaterial(existencias, lugares, movimientos)
  const filas = inventarioPorMaterial(existencias, lugares, movimientos, { q, lugar })
  const conStock = new Set(existencias.filter((e) => e.cantidad > 0).map((e) => e.ubicacion_id))
  const lugaresConStock = lugares.filter((l) => conStock.has(l.id))
  const href = (l: string | null) => {
    const p = new URLSearchParams({ ver: 'inventario' })
    if (q) p.set('q', q)
    if (l) p.set('lugar', l)
    return `${BASE}?${p}`
  }

  return (
    <div className="flex flex-col gap-4" data-testid="inventario-material">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BuscadorURL accion={BASE} q={q ?? ''} placeholder="Buscar material" oculto={{ ver: 'inventario', lugar: lugar ?? undefined }} testid="buscar-material" />
        {puedeOperar && <IngresarEscritorio destinos={destinos} lugarInicial={lugar ?? undefined} />}
      </div>
      {lugaresConStock.length > 1 && (
        <Filtros
          testid="filtro-lugar"
          cuenta={q || lugar ? { n: filas.length, total: todas.length } : null}
          opciones={[
            { label: 'Todos los lugares', href: href(null), activo: !lugar, testid: 'lugar-todos' },
            ...lugaresConStock.map((l) => ({ label: l.rotulo, href: href(l.id), activo: lugar === l.id, testid: `lugar-${l.id}` })),
          ]}
        />
      )}

      {todas.length === 0 ? (
        <div style={{ fontSize: '13.5px', color: V.apagado, padding: '14px 0' }} data-testid="inventario-vacio">
          Todavía no hay material en stock. Entra con «Llegó» sobre un pedido o con «Ingresar material».
        </div>
      ) : filas.length === 0 ? (
        <div style={{ fontSize: '13.5px', color: V.apagado, padding: '14px 0' }}>Ningún material coincide con el filtro.</div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 620 }}>
            <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
              <div>Material</div><div style={{ textAlign: 'right' }}>Total</div><div>Dónde está</div><div style={{ textAlign: 'right' }}>Último mov.</div>
            </div>
            {filas.map((f, i) => (
              <div key={f.material_id} data-testid="inventario-fila" className="hover:bg-surface-quiet"
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 44, alignItems: 'center', padding: '6px 0', borderBottom: i < filas.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13.5px' }}>
                <div style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.material}</div>
                <div className="font-mono tabular-nums" style={{ textAlign: 'right', fontWeight: 500 }}>{textoStock(f.total, f.unidad)}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', color: V.tintaSuave, fontSize: '12.5px' }}>
                  {f.lugares.map((l) => (
                    <Link key={l.id} href={href(l.id)} prefetch={false} style={{ whiteSpace: 'nowrap' }}>
                      {l.rotulo} <span className="font-mono tabular-nums" style={{ color: V.tinta }}>{textoStock(l.cantidad, f.unidad)}</span>
                    </Link>
                  ))}
                </div>
                <div style={{ textAlign: 'right', color: f.ultimo ? V.tintaSuave : V.tenue, fontSize: '12.5px' }}>{f.ultimo ? cuando(f.ultimo, hoy) : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {puedeOperar && todas.length > 0 && (
        <div style={{ fontSize: '12.5px', color: V.apagado }}>
          Para usar, contar o mandar sobrante al Taller: <Link href={`${BASE}?ver=ubicaciones`} prefetch={false} style={{ textDecoration: 'underline' }}>Ubicaciones</Link>.
        </div>
      )}
    </div>
  )
}
