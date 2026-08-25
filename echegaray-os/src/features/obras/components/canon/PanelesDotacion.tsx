'use client'

// 08 · LA COLUMNA DERECHA DEL CANÓNICO — impacto, dotación por semana y límites reales.
//
// Las tres tarjetas del mockup «08 · Obra Dotación y Proyección.dc.html», con sus medidas: tarjeta
// blanca de radio 10 y borde #E7E6E2, cabecera de 11px/16px con hairline #EFEEEA, celdas de impacto
// `flex:1 minWidth:170px` con padding 12/16, rótulo de 10,5px y cifra mono de 18/600.
//
// Vive aparte de `SimuladorDotacion.tsx` por tamaño: el simulador ya es el archivo más largo del
// módulo y estas tres tarjetas no comparten estado con él — reciben lo ya calculado.

import type { ReactNode } from 'react'
import { C, MONO } from './tokens'
import { Ico, P } from './Ico'
import type { CeldaImpacto, Direccion, EstadoImpacto } from '../../services/impactoDotacion'

const TARJETA = {
  background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px', overflow: 'hidden',
} as const

const CABECERA = {
  display: 'flex', alignItems: 'center', gap: '9px', padding: '11px 16px',
  borderBottom: `1px solid ${C.bordeTarjeta}`,
} as const

const TITULO = { fontSize: '13px', fontWeight: 600, color: C.tinta } as const

function Cabecera({ icono, titulo, derecha }: { icono?: ReactNode; titulo: string; derecha?: ReactNode }) {
  return (
    <div style={CABECERA}>
      {icono}
      <div style={TITULO}>{titulo}</div>
      {derecha}
    </div>
  )
}

const TONO: Record<CeldaImpacto['tono'], string> = { neg: C.neg, pos: C.pos, neutro: C.tintaSuave }
const FLECHA: Record<Direccion, typeof P.sube> = { sube: P.sube, baja: P.baja, igual: P.igual }

/**
 * IMPACTO DE LA SIMULACIÓN — el valor del plan grande y el simulado al lado, con su flecha.
 *
 * NULL SE DICE CON SU PALABRA. Una celda sin dato muestra «sin dato» en tenue, no un guión: el
 * guión se lee como cero cuando la columna de al lado tiene números. Y hoy el lado «plan» está
 * vacío en las 17 obras —ninguna tiene `dotacion_prevista` cargada—, así que esta celda es la que
 * de verdad se ve.
 */
export function ImpactoSimulacion({ estado, celdas }: { estado: EstadoImpacto; celdas: CeldaImpacto[] }) {
  const color = estado.tono === 'neg' ? C.neg : (estado.tono === 'warn' ? C.warn : C.pos)
  const icono = estado.tono === 'neg' ? P.alerta : (estado.tono === 'warn' ? P.sube : P.ok)
  return (
    <div style={TARJETA} data-testid="impacto-simulacion">
      <Cabecera
        titulo="Impacto de la simulación"
        derecha={(
          <span style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '11.5px', color,
          }} data-testid="estado-impacto"
          >
            <Ico d={icono} s={14} />
            {estado.texto}
          </span>
        )}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {celdas.map((c) => (
          <div
            key={c.clave} data-celda={c.clave}
            style={{
              flex: 1, minWidth: '170px', padding: '12px 16px',
              borderRight: `1px solid ${C.bordeTarjeta}`, borderBottom: `1px solid ${C.bordeTarjeta}`,
            }}
          >
            <div style={{ fontSize: '10.5px', color: C.tenue, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
              {c.rotulo}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: MONO, fontSize: '18px', fontWeight: 600,
                color: c.plan == null ? C.tenue : C.tinta, whiteSpace: 'nowrap',
              }}
              >
                {c.plan ?? 'sin dato'}
              </span>
              {c.simulado != null && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '4px', fontFamily: MONO,
                  fontSize: '13px', color: TONO[c.tono], whiteSpace: 'nowrap',
                }}
                >
                  <Ico d={FLECHA[c.direccion]} s={12} />
                  {c.simulado}
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>{c.detalle}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * DOTACIÓN POR SEMANA — la tarjeta del canónico que HOY NO SE PUEDE DIBUJAR.
 *
 * ═══ POR QUÉ NO HAY GRÁFICO ═══
 *
 * El mockup dibuja tres series por semana —plan, real y necesario para llegar— y las tres piden un
 * dato que la base no tiene (medido el 25/08/2026, contra la base de producción):
 *
 *   · PLAN: sale de `obra_actividad.dotacion_prevista` repartida sobre la ventana de plan.
 *     **0 filas** en TODA la base tienen `dotacion_prevista`. Se carga aplicando esta misma
 *     pantalla, que es lo que el botón de abajo hace.
 *   · REAL: gente que estuvo en la obra cada semana. `asistencia_marca` tiene 2 filas en toda la
 *     base y **ninguna con `obra_id`**; `obra_asignacion` tiene 7 filas y **una sola con `desde`**,
 *     así que no hay historia de la que sacar un plantel semanal — todas las semanas darían el
 *     mismo número, que es peor que no dibujar nada.
 *   · NECESARIO: se calcula contra las otras dos. Sin ellas no existe.
 *
 * Dibujar el eje con barras en cero diría «esta obra tuvo cero gente», que es una afirmación falsa
 * sobre la obra y no sobre el sistema. Se dibuja la tarjeta —el canónico la tiene, y su ausencia
 * silenciosa sería peor— con la línea accionable que dice qué falta y quién la carga.
 */
export function DotacionPorSemana({ faltante }: { faltante: string }) {
  return (
    <div style={TARJETA} data-testid="dotacion-por-semana">
      <Cabecera
        icono={<span style={{ display: 'flex', color: C.tintaSuave }}><Ico d={P.avance} s={15} /></span>}
        titulo="Dotación por semana"
        derecha={<span style={{ marginLeft: 'auto', fontSize: '11.5px', color: C.tintaSuave }}>{faltante}</span>}
      />
      <div style={{ padding: '16px' }}>
        <p style={{ margin: 0, fontSize: '12.5px', color: C.tintaSuave, lineHeight: 1.5 }}>
          Todavía no hay con qué dibujarlo. El plan por semana sale de la dotación prevista de cada
          actividad —que se escribe con <strong style={{ fontWeight: 600, color: C.tinta }}>Aplicar
          al cronograma</strong>, acá al lado— y la línea real, de la presencia registrada por obra,
          que hoy no se está cargando.
        </p>
      </div>
    </div>
  )
}

export interface FilaLimite {
  clave: string
  icono: typeof P.espacio
  tono: 'neg' | 'warn' | 'pos' | 'faint'
  que: string
  detalle: string
  valor: string
}

const TONO_LIMITE: Record<FilaLimite['tono'], string> = {
  neg: C.neg, warn: C.warn, pos: C.pos, faint: C.tenue,
}

/**
 * LÍMITES REALES — lo que impide que más gente acorte el plazo.
 *
 * El canónico lista cuatro: tope físico del frente, plantel disponible, equipo único y material.
 * Las dos últimas no tienen fuente (no hay tabla de equipo crítico por frente ni de stock por
 * obra), así que no se dibujan: un límite inventado hace tomar una decisión sobre una restricción
 * que no existe. Las que quedan se dicen con el número que la obra tiene, y «sin declarar» cuando
 * nadie lo cargó — que es un dato faltante, no un permiso.
 */
export function LimitesReales({ filas }: { filas: FilaLimite[] }) {
  return (
    <div style={TARJETA} data-testid="limites-reales">
      <Cabecera
        icono={<span style={{ display: 'flex', color: C.warn }}><Ico d={P.alerta} s={15} /></span>}
        titulo="Límites reales"
      />
      {filas.map((f) => (
        <div
          key={f.clave} data-limite={f.clave}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 16px',
            borderBottom: `1px solid ${C.bordeLista}`,
          }}
        >
          <span style={{ display: 'flex', color: TONO_LIMITE[f.tono], flexShrink: 0 }}>
            <Ico d={f.icono} s={16} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '12.5px', color: C.tinta }}>{f.que}</div>
            <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>{f.detalle}</div>
          </div>
          <span style={{
            fontFamily: MONO, fontSize: '12.5px', fontWeight: 600,
            color: TONO_LIMITE[f.tono], flexShrink: 0,
          }}
          >
            {f.valor}
          </span>
        </div>
      ))}
    </div>
  )
}
