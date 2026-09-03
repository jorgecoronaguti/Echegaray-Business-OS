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
  hrefCerrar,
}: {
  p: PartidaValorizada
  presupuesto: PresupuestoCascada
  composicion: Composicion
  /**
   * A dónde vuelve el cierre. `null` = el panel NO dibuja su propia cruz porque quien lo monta ya
   * tiene una: dentro del cajón del entorno había DOS cierres a dos centímetros, y el de acá además
   * volvía a `/presupuestos/{id}` pelado, perdiendo la vista y la cola que estaban abiertas.
   */
  hrefCerrar?: string | null
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
        {hrefCerrar !== null && (
          <Link href={hrefCerrar ?? `/presupuestos/${presupuesto.id}`} aria-label="Cerrar el panel"
            className="shrink-0 text-[13px] text-faint hover:text-ink" data-testid="cerrar-panel">✕</Link>
        )}
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
        {/* ESFUERZO Y NO «RENDIMIENTO»: hs/unidad baja cuando la tarea mejora. Con el rótulo viejo,
            cotizar «con más rendimiento» significaba cotizar con MÁS horas. */}
        <Fila k="Esfuerzo" v={p.hs_unitarias === null ? null : `${rendimiento(p.hs_unitarias)} hs/${p.unidad ?? 'un'}`} falta="sin dato" />
        {/* BENEFICIO, no «margen»: el 22 % se aplica sobre el costo industrial, así que es markup
            sobre el costo y no margen sobre el precio. El margen sobre el precio lo publica la
            cascada aparte y siempre da menos — confundirlos es el error más caro de presupuestar. */}
        <Fila k="Beneficio aplicado" v={porcentajeDeFraccion(presupuesto.pct_beneficio)} falta="sin cargar" />
      </dl>

      {/* NORMAL SILENCIOSO, PROBLEMA VISIBLE (Design 23/08). Cuando la partida se convierte sin
          reparos —el caso de las 65 de 68— el párrafo explicaba el mecanismo de la conversión en la
          pantalla equivocada: eso lo dice la 13, con el árbol delante. Acá sólo queda lo que
          BLOQUEA o DEGRADA la conversión. */}
      {p.cantidad === null ? (
        <p className="mt-4 border-l-2 border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn" data-testid="nota-conversion">
          Sin cómputo no se puede convertir: no hay cantidad que repartir entre frentes.
        </p>
      ) : p.sin_analisis ? (
        <p className="mt-4 border-l-2 border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn" data-testid="nota-conversion">
          Se convierte igual, sin HH y sin plazo, marcada como deuda de carga.
        </p>
      ) : null}

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
