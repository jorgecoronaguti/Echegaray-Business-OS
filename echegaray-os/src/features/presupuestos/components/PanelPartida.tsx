// 15 · EL PANEL DERECHO — la partida seleccionada, en compacto.
//
// Tres números arriba (cantidad · HH previstas · subtotal), el análisis abajo, los totales al pie y
// una frase que dice qué va a pasar cuando esto se convierta en obra. Nada de eso se calcula acá:
// la cantidad y las HH salen de `cotizacion_partida_valorizada`, el desglose de la composición y la
// incidencia de la cascada.

import Link from 'next/link'
import { Aviso, Nulo } from '@/shared/components/ds'
import type { PartidaValorizada, PresupuestoCascada } from '../types'
import type { Composicion } from '../services/presupuestosService'
import { desglosar, desgloseCierra } from '../services/composicion'
import { incidencia } from '../services/cascada'
import { cantidad as fCantidad, hh as fHH, importe, plata, porcentaje, porcentajeDeFraccion, rendimiento } from '../services/formato'
import { TablaComposicion } from './TablaComposicion'

export function PanelPartida({
  p,
  presupuesto,
  composicion,
}: {
  p: PartidaValorizada
  presupuesto: PresupuestoCascada
  composicion: Composicion
}) {
  const desglose = desglosar(composicion.lineas)
  const control = desgloseCierra(desglose.totalDesglose, p.costo_unitario)
  const inc = incidencia(p.subtotal, presupuesto.costo_directo)

  return (
    <aside className="min-w-0" data-testid="panel-partida">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10.5px] tabular-nums text-faint">
            {p.codigo ?? 'sin código'}
            {composicion.origen === 'congelada' && ' · composición congelada'}
            {composicion.origen === 'viva' && ' · base maestra, precios de hoy'}
          </div>
          <h3 className="mt-0.5 text-[15.5px] font-semibold leading-tight text-ink">{p.descripcion}</h3>
        </div>
        <Link href={`/presupuestos/${presupuesto.id}`} aria-label="Cerrar el panel"
          className="shrink-0 text-[13px] text-faint hover:text-ink" data-testid="cerrar-panel">✕</Link>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-[#EFEEEA] border-y border-[#EFEEEA] py-2.5">
        <Dato rotulo="Cantidad" valor={p.cantidad === null ? null : `${fCantidad(p.cantidad)} ${p.unidad ?? ''}`.trim()} falta="sin cómputo" />
        <Dato rotulo="HH previstas" valor={fHH(p.hh)} falta="sin dato" />
        <Dato rotulo="Subtotal" valor={importe(p.subtotal)} falta="sin cargar" />
      </div>

      <h4 className="mt-4 text-[13px] font-semibold text-ink">Análisis de la partida</h4>
      <div className="mt-2">
        <TablaComposicion desglose={desglose} compacta testid="composicion-panel" />
      </div>

      {!control.cierra && (
        <div className="mt-3">
          {/* UN CONTROL QUE NO SE VALIDA CONTRA LO QUE PRODUCE: el desglose se suma por un lado y
              el costo unitario sale de la vista por otro. Que no cierren es información. */}
          <Aviso tono="warn" titulo="El desglose no cierra contra el costo unitario" testid="aviso-desglose">
            La suma de las líneas da {importe(desglose.totalDesglose)} y el costo unitario que entra
            en la cascada es {importe(p.costo_unitario)}. La diferencia es de{' '}
            {importe(control.diferencia)}: hay líneas sin precio o la copia congelada quedó incompleta.
          </Aviso>
        </div>
      )}

      <dl className="mt-4 border-t border-line-strong pt-2.5 text-[12.5px]">
        <Fila k="Costo unitario" v={plata(p.costo_unitario)} falta="sin dato" fuerte />
        <Fila
          k={p.cantidad === null ? 'Por la cantidad' : `× ${fCantidad(p.cantidad)} ${p.unidad ?? ''}`.trim()}
          v={plata(p.subtotal)} falta="sin cargar" fuerte
        />
        <Fila k="Incidencia en el presupuesto" v={porcentaje(inc, 'auto')} falta="sin base" />
        <Fila k="HH previstas" v={fHH(p.hh)} falta="sin dato" />
        <Fila k="Rendimiento" v={p.hs_unitarias === null ? null : `${rendimiento(p.hs_unitarias)} hs/${p.unidad ?? 'un'}`} falta="sin dato" />
        {/* BENEFICIO, no «margen»: el 22 % se aplica sobre el costo industrial, así que es markup
            sobre el costo y no margen sobre el precio. El margen sobre el precio lo publica la
            cascada aparte y siempre da menos — confundirlos es el error más caro de presupuestar. */}
        <Fila k="Beneficio aplicado" v={porcentajeDeFraccion(presupuesto.pct_beneficio)} falta="sin cargar" />
      </dl>

      <div className="mt-4 rounded-card bg-surface-quiet px-3 py-2.5 text-[12px] leading-relaxed text-muted">
        <span className="font-medium text-ink">Al convertir a obra: </span>
        {p.cantidad === null ? (
          <>esta partida todavía no se puede convertir: sin cómputo no hay cantidad que repartir entre frentes.</>
        ) : p.sin_analisis ? (
          <>esta partida se convierte igual, <span className="text-warn">sin HH y sin plazo</span>, marcada como deuda de carga. La cantidad no cambia.</>
        ) : (
          <>
            esta partida se reparte entre los frentes que elijas, con la plantilla que elijas, y cada
            actividad guarda {p.codigo ?? 'la partida'} y su análisis. Las {fHH(p.hh)} HH se reparten
            por el peso de cada paso. La cantidad no cambia.
          </>
        )}
      </div>

      <div className="mt-3">
        <Link href={`/presupuestos/${presupuesto.id}/partida/${p.partida_id}`}
          className="text-[12.5px] text-ink underline underline-offset-2" data-testid="ver-analisis-completo">
          Ver el análisis completo
        </Link>
      </div>
    </aside>
  )
}

function Dato({ rotulo, valor, falta }: { rotulo: string; valor: string | null; falta: string }) {
  return (
    <div className="px-2.5 first:pl-0 last:pr-0">
      <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{rotulo}</div>
      <div className="mt-0.5 font-mono text-[17px] font-semibold tabular-nums text-ink">
        {valor ?? <span className="font-sans text-[12.5px] font-normal text-faint">{falta}</span>}
      </div>
    </div>
  )
}

function Fila({ k, v, falta, fuerte }: { k: string; v: string | null; falta: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className={`font-mono tabular-nums ${fuerte ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
        {v ?? <Nulo>{falta}</Nulo>}
      </dd>
    </div>
  )
}
