// 15 · LA FRANJA DE CINCO NÚMEROS — nivel 1 del presupuesto (Design 23/08).
//
// ═══ POR QUÉ CINCO Y NO ONCE ═══
//
// La cascada del libro tiene once escalones y todos hacen falta para AUDITAR un precio; ninguno
// hace falta para TRABAJAR con él. Los once ocupaban el primer scroll entero y empujaban la tabla
// de partidas —que es la pantalla— abajo del pliegue.
//
// Nivel 1 (acá): cuánto sale, cuánto cuesta, cuánto queda, cuánto trabajo y qué falta cargar.
// Nivel 3 (`CascadaPrecio`, plegado debajo): de dónde sale cada peso. No se borró un solo número:
// se movió a donde se lo busca.
//
// SIN ANÁLISIS es la quinta celda porque decide si el total de la primera se puede mandar. Estaba
// como bloque de aviso a ancho completo arriba de todo; acá pesa lo mismo que el número al que le
// falta, que es exactamente lo que es.

import { Nulo } from '@/shared/components/ds'
import type { PresupuestoCascada } from '../types'
import { tieneCifras } from '../services/cascada'
import { hh, plata, porcentaje } from '../services/formato'

export function ResumenPresupuesto({ p }: { p: PresupuestoCascada }) {
  const hay = tieneCifras(p)
  return (
    <div
      data-testid="resumen-presupuesto"
      className="grid grid-cols-2 rounded-card border border-line bg-surface sm:grid-cols-3 lg:grid-cols-5"
    >
      <Celda
        rotulo="Total"
        valor={hay ? plata(p.precio_venta) : null}
        falta="sin cargar"
        contexto={`${p.n_partidas} ${p.n_partidas === 1 ? 'partida' : 'partidas'}`}
        grande
      />
      <Celda
        rotulo="Costo"
        valor={hay ? plata(p.costo_directo) : null}
        falta="sin cargar"
        contexto="directo"
      />
      <Celda
        rotulo="Margen"
        valor={porcentaje(p.margen_sobre_precio_pct)}
        falta="sin dato"
        contexto="sobre venta"
        tono="pos"
      />
      <Celda
        rotulo="HH del cómputo"
        valor={hay ? hh(p.hh_previstas) : null}
        falta="sin cargar"
        contexto="base maestra"
      />
      {/* Cero partidas sin análisis no es un logro que haya que anunciar: la celda dice «ninguna»
          en `faint` y deja de competir con los cuatro números que sí se leen.

          El contexto dice «partidas» y no el conteo de las que están sin cómputo (canon 15): son
          dos deudas distintas y meterlas en una sola celda hacía leer «3 · 2 sin cómputo» como si
          el 3 se descompusiera. La deuda de cómputo tiene su propio chip en la toolbar de la
          tabla, que además FILTRA — el número al lado de las filas que hay que arreglar. */}
      <Celda
        rotulo="Sin análisis"
        valor={p.n_sin_analisis === 0 ? null : String(p.n_sin_analisis)}
        falta="ninguna"
        contexto="partidas"
        tono={p.n_sin_analisis > 0 ? 'warn' : undefined}
        testid="celda-sin-analisis"
      />
    </div>
  )
}

function Celda({ rotulo, valor, falta, contexto, tono, grande, testid }: {
  rotulo: string
  valor: string | null
  falta: string
  contexto?: string
  tono?: 'pos' | 'warn'
  grande?: boolean
  testid?: string
}) {
  const color = valor === null ? 'text-faint'
    : tono === 'warn' ? 'text-warn'
    : tono === 'pos' ? 'text-pos'
    : 'text-ink'
  return (
    <div
      data-testid={testid}
      data-celda={rotulo}
      className="min-w-0 border-b border-r border-[#EFEEEA] px-4 py-3 last:border-r-0 lg:border-b-0"
    >
      <div className="text-[10px] uppercase tracking-[0.06em] text-faint">{rotulo}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className={`font-mono font-semibold tabular-nums ${grande ? 'text-[22px]' : 'text-[19px]'} ${color}`}>
          {valor ?? <span className="font-sans text-[13px] font-normal"><Nulo>{falta}</Nulo></span>}
        </span>
        {contexto && <span className="truncate text-[11px] text-faint">{contexto}</span>}
      </div>
    </div>
  )
}
