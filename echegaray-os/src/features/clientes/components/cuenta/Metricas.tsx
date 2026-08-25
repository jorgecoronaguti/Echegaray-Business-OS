// LAS CINCO CIFRAS QUE CORONAN LA 28 (`28:82`–`28:110`).
//
//   rótulo  10,5px `#91918B`, `letterSpacing:.05em`
//   número  mono 27px/600, `letterSpacing:-.02em`, `marginTop:1px`
//   detalle 11,5px `#91918B` a la derecha, alineado por `baseline` con `gap:7px`
//
// NINGUNA ESCRIBE UN CERO POR UNA AUSENCIA. Un «$ 0» en SALDO dice que el cliente no debe nada y
// un «—» dice que no lo sabemos; sobre esta pantalla la diferencia es una llamada que se hace o no
// se hace. El detalle de abajo explica cuál de las dos es.

import type { ReactNode } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { montoM } from '../../services/cobranzaFormato'
import { diaMes } from '../../services/cobranzaFormato'
import type { CuentaCorriente } from '../../types/cobranzas'

function Metrica({ rotulo, valor, color = C.tinta, detalle, testid }: {
  rotulo: string
  valor: string
  color?: string
  detalle?: ReactNode
  testid?: string
}) {
  return (
    <div data-testid={testid}>
      <div style={{ fontSize: '10.5px', color: C.tenue, letterSpacing: '.05em' }}>{rotulo}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '7px', marginTop: '1px' }}>
        <span style={{
          fontFamily: MONO, fontSize: '27px', fontWeight: 600, color,
          letterSpacing: '-.02em',
        }}>{valor}</span>
        {detalle && <span style={{ fontSize: '11.5px', color: C.tenue }}>{detalle}</span>}
      </div>
    </div>
  )
}

const SIN_DATO = <span style={{ color: C.fantasma }}>sin dato todavía</span>

export function Metricas({ cuenta }: { cuenta: CuentaCorriente | null }) {
  const c = cuenta
  const dso = c?.dso_dias
  const efec = c?.efectividad_pct
  const delta = c?.efectividad_delta_pts
  const libera = diaMes(c?.fondo_reparo_libera)
  return (
    <div
      data-testid="metricas-cuenta"
      style={{ display: 'flex', alignItems: 'flex-start', gap: '42px', flexWrap: 'wrap' }}
    >
      <Metrica rotulo="SALDO" valor={montoM(c?.saldo)} detalle={c?.saldo == null ? SIN_DATO : undefined} testid="metrica-saldo" />
      <Metrica
        rotulo="VENCIDO"
        valor={montoM(c?.vencido)}
        // El rojo es del NÚMERO, no del rótulo: `28:92`. Y sólo cuando hay algo vencido — un
        // vencido en cero pintado de rojo entrena a no mirar el rojo.
        color={c?.vencido ? C.neg : C.tinta}
        detalle={c?.vencido == null ? SIN_DATO : undefined}
        testid="metrica-vencido"
      />
      <Metrica
        rotulo="DSO"
        valor={dso == null ? '—' : `${dso} d`}
        // `#B54708` cuando está por encima del objetivo (`28:97`); sin objetivo no hay contra qué
        // pintarlo, así que queda en tinta.
        color={dso != null && c?.dso_objetivo != null && dso > c.dso_objetivo ? C.warn : C.tinta}
        detalle={dso == null ? SIN_DATO : c?.dso_objetivo != null ? `objetivo ${c.dso_objetivo}` : undefined}
        testid="metrica-dso"
      />
      <Metrica
        rotulo="EFECTIVIDAD"
        valor={efec == null ? '—' : `${efec} %`}
        color={efec == null ? C.tinta : efec >= 80 ? C.pos : C.warn}
        detalle={
          efec == null ? SIN_DATO : delta == null ? undefined : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              color: delta >= 0 ? C.pos : C.neg,
            }}>
              <Ico d={P.arriba} s={11} w={2.4} style={{ transform: delta >= 0 ? undefined : 'rotate(180deg)' }} />
              {Math.abs(delta)} pts
            </span>
          )
        }
        testid="metrica-efectividad"
      />
      <Metrica
        rotulo="FONDO DE REPARO"
        valor={montoM(c?.fondo_reparo)}
        detalle={c?.fondo_reparo == null ? SIN_DATO : libera ? `libera ${libera}` : 'sin fecha de liberación'}
        testid="metrica-reparo"
      />
    </div>
  )
}
