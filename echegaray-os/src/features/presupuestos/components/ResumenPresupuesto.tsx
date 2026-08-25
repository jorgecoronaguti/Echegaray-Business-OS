// 15 · LA FRANJA DE CINCO NÚMEROS — porte literal de `15 · Presupuesto Edición.dc.html`, línea 88.
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
//
// ═══ LA GEOMETRÍA ES LA DEL CANÓNICO, NO UNA GRILLA RESPONSIVA ═══
//
// Era `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` con celdas de 16/12px y valores de 22 y 19px. El
// canónico dibuja UNA fila flexible de celdas de `minWidth:172px` con `padding:11px 16px` y el
// valor SIEMPRE en 20px: la franja se parte sola cuando no entra, en vez de saltar entre tres
// disposiciones distintas. Y los cinco números pesan lo mismo — el TOTAL no necesita ser más grande
// que el COSTO para que se lo encuentre, está primero.

import type { PresupuestoCascada } from '../types'
import { tieneCifras } from '../services/cascada'
import { C, FranjaKpis, entero, pesos, porcentajeCanon } from '@/shared/components/canon'

export function ResumenPresupuesto({ p }: { p: PresupuestoCascada }) {
  const hay = tieneCifras(p)
  const sinAnalisis = p.n_sin_analisis
  return (
    <div data-testid="resumen-presupuesto">
      <FranjaKpis
        minColumna={172}
        kpis={[
          {
            rotulo: 'TOTAL',
            valor: (hay ? pesos(p.precio_venta) : null) ?? 'sin cargar',
            color: hay && p.precio_venta !== null ? C.tinta : C.tenue,
            detalle: `${p.n_partidas} ${p.n_partidas === 1 ? 'partida' : 'partidas'}`,
          },
          {
            rotulo: 'COSTO',
            valor: (hay ? pesos(p.costo_directo) : null) ?? 'sin cargar',
            color: hay && p.costo_directo !== null ? C.tinta : C.tenue,
            detalle: 'directo',
          },
          {
            rotulo: 'MARGEN',
            valor: porcentajeCanon(p.margen_sobre_precio_pct) ?? 'sin dato',
            color: p.margen_sobre_precio_pct === null ? C.tenue : C.pos,
            detalle: 'sobre venta',
          },
          {
            rotulo: 'HH DEL CÓMPUTO',
            valor: (hay ? entero(p.hh_previstas) : null) ?? 'sin cargar',
            color: hay && p.hh_previstas !== null ? C.tinta : C.tenue,
            detalle: 'base maestra',
          },
          {
            // Cero partidas sin análisis no es un logro que haya que anunciar en 20px de mono: la
            // celda dice «ninguna» y deja de competir con los cuatro números que sí se leen.
            //
            // El detalle dice «partidas» y no el conteo de las que están sin cómputo (canon 15): son
            // dos deudas distintas y meterlas en una sola celda hacía leer «3 · 2 sin cómputo» como
            // si el 3 se descompusiera. La deuda de cómputo tiene su propio chip en la barra de la
            // tabla, que además FILTRA — el número al lado de las filas que hay que arreglar.
            rotulo: 'SIN ANÁLISIS',
            valor: sinAnalisis === 0 ? 'ninguna' : String(sinAnalisis),
            color: sinAnalisis > 0 ? C.warn : C.pos,
            detalle: 'partidas',
            testid: 'celda-sin-analisis',
          },
        ]}
      />
    </div>
  )
}
