// MATERIAL · MOVIMIENTOS — el libro del stock, más nuevo primero (calcado de Movimientos de Herramientas).
//
// Cada renglón es un asiento inmutable de `material_movimiento`: llegó (sobre un pedido), ingreso (sin
// pedido), usé, envío (con su remito), recuento o llegada anulada. Nada se edita: lo mal cargado se
// corrige con otro asiento, así que lo que se ve acá es la historia completa de cada saldo.

import Link from 'next/link'
import { Filtros } from '@/shared/components/ds'
import { eyebrow, V } from '@/features/herramientas/components/estilo'
import { fechaHora } from '@/features/herramientas/components/formato'
import { libroMaterial, TIPOS_LIBRO, type MovimientoMaterial, type TipoMovimiento } from '../logica/inventario'
import type { Lugar, Remito } from '../logica/stock'
import { MAX_MOVIMIENTOS } from '../services/stockService'

const BASE = '/herramientas/material'
const COLS = '120px minmax(0,1.3fr) 130px minmax(0,1.2fr) minmax(0,1fr)'

export function VistaMovimientosMaterial({ movimientos, lugares, remitos, tipo, lugar, rotulosObra = {} }: {
  movimientos: MovimientoMaterial[]
  lugares: Lugar[]
  remitos: Remito[]
  tipo: TipoMovimiento | null
  lugar: string | null
  /** «OB-00xx · Obra» por id, para nombrar el acopio de cada asiento. */
  rotulosObra?: Record<string, string>
}) {
  const filas = libroMaterial(movimientos, lugares, remitos, { tipo, lugar }, rotulosObra)
  const href = (t: TipoMovimiento | null, l: string | null) => {
    const p = new URLSearchParams({ ver: 'movimientos' })
    if (t) p.set('tipo', t)
    if (l) p.set('lugar', l)
    return `${BASE}?${p}`
  }
  const usados = new Set(movimientos.flatMap((m) => [m.origen_id, m.destino_id]).filter(Boolean))
  const lugaresConMov = lugares.filter((l) => usados.has(l.id))
  const deLugar = lugar ? lugares.find((l) => l.id === lugar) : null

  return (
    <div className="flex flex-col gap-4" data-testid="movimientos-material">
      <Filtros
        testid="filtro-tipo"
        cuenta={tipo || lugar ? { n: filas.length, total: movimientos.length } : null}
        opciones={[
          { label: 'Todos', href: href(null, lugar), activo: !tipo, testid: 'tipo-todos' },
          ...TIPOS_LIBRO.map((t) => ({ label: t.label, href: href(t.id, lugar), activo: tipo === t.id, testid: `tipo-${t.id}` })),
        ]}
      />
      {lugaresConMov.length > 1 && (
        <Filtros
          testid="filtro-lugar-mov"
          opciones={[
            { label: 'Todos los lugares', href: href(tipo, null), activo: !lugar },
            ...lugaresConMov.map((l) => ({ label: l.rotulo, href: href(tipo, l.id), activo: lugar === l.id })),
          ]}
        />
      )}

      {movimientos.length === 0 ? (
        <div style={{ fontSize: '13.5px', color: V.apagado, padding: '14px 0' }} data-testid="libro-vacio">Todavía no hay movimientos de material.</div>
      ) : filas.length === 0 ? (
        <div style={{ fontSize: '13.5px', color: V.apagado, padding: '14px 0' }}>
          Ningún movimiento {deLugar ? `en ${deLugar.rotulo} ` : ''}con ese filtro. <Link href={href(null, null)} prefetch={false} style={{ textDecoration: 'underline' }}>Ver todos</Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: 720 }}>
            <div style={{ ...eyebrow, display: 'grid', gridTemplateColumns: COLS, gap: 18, height: 34, alignItems: 'center', borderBottom: `1px solid ${V.linea}` }}>
              <div>Cuándo</div><div>Material</div><div style={{ textAlign: 'right' }}>Cantidad</div><div>Qué · dónde</div><div>Quién · nota</div>
            </div>
            {filas.map((f, i) => (
              <div key={f.id} data-testid="libro-fila"
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: 18, minHeight: 44, alignItems: 'center', padding: '6px 0', borderBottom: i < filas.length - 1 ? `1px solid ${V.linea}` : undefined, fontSize: '13px' }}>
                <div style={{ color: V.tintaSuave, fontSize: '12.5px' }}>{fechaHora(f.creado_en)}</div>
                <div style={{ fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.material}</div>
                <div className="font-mono tabular-nums" style={{ textAlign: 'right', fontWeight: 500, color: f.cantidad.startsWith('−') ? V.tintaSuave : V.tinta }}>{f.cantidad}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{f.que}{f.remito && <span style={{ color: V.apagado, fontWeight: 400 }}> · {f.remito}</span>}</div>
                  <div style={{ fontSize: '12px', color: V.apagado }}>
                    {f.desde && f.hacia ? `${f.desde} → ${f.hacia}` : (f.hacia ?? f.desde ?? '—')}
                  </div>
                </div>
                <div style={{ minWidth: 0, fontSize: '12.5px' }}>
                  <div style={{ color: f.quien ? V.tintaSuave : V.tenue }}>{f.quien ?? 'sin usuario'}</div>
                  {f.nota && <div style={{ fontSize: '12px', color: V.apagado, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nota}>{f.nota}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {movimientos.length >= MAX_MOVIMIENTOS && (
        <div style={{ fontSize: '12px', color: V.apagado }}>Se muestran los {MAX_MOVIMIENTOS} movimientos más nuevos.</div>
      )}
    </div>
  )
}
