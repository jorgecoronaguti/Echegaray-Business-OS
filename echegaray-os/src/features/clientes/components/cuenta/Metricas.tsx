// LAS CINCO CIFRAS QUE CORONAN LA 28 (`28:82`–`28:110`).
//
//   rótulo  10,5px `#91918B`, `letterSpacing:.05em`
//   número  mono 27px/600, `letterSpacing:-.02em`, `marginTop:1px`
//   detalle 11,5px `#91918B` a la derecha, alineado por `baseline` con `gap:7px`
//
// NINGUNA ESCRIBE UN CERO POR UNA AUSENCIA. Un «$ 0» en SALDO dice que el cliente no debe nada y
// un «—» dice que no lo sabemos; sobre esta pantalla la diferencia es una llamada que se hace o no
// se hace. El detalle de abajo explica cuál de las dos es.
//
// ═══ TRES ADORNOS DEL MOCKUP QUE SE CAYERON, Y POR QUÉ ═══
//
// El mockup pintaba el DSO contra un OBJETIVO, la efectividad contra el PERÍODO ANTERIOR, y el
// fondo de reparo con su FECHA DE LIBERACIÓN. Ninguno de los tres tiene fuente: nadie declaró un
// objetivo de DSO, no se guarda la efectividad de un período para poder restarla, y
// `certificado_cliente` no tiene fecha de liberación del reparo. Se caen enteros —el número, el
// color condicional y el renglón de abajo— en vez de dibujarse con un valor de relleno: un
// «objetivo 45» inventado convierte esta pantalla en la que decide a quién se llama primero.

import type { ReactNode } from 'react'
import { C, MONO } from '../canon/tokens'
import { montoM } from '../../services/cobranzaFormato'
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
  const dso = c?.dso
  const efec = c?.efectividad_pct
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
        // El mockup lo pinta `#B54708` por encima del objetivo. Sin objetivo declarado no hay contra
        // qué pintarlo, y elegir un umbral acá sería fijar una política de cobranzas desde una hoja
        // de estilos. Queda en tinta hasta que el dueño declare el objetivo.
        detalle={dso == null ? SIN_DATO : undefined}
        testid="metrica-dso"
      />
      <Metrica
        rotulo="EFECTIVIDAD"
        valor={efec == null ? '—' : `${efec} %`}
        color={efec == null ? C.tinta : efec >= 80 ? C.pos : C.warn}
        // NO DICE «efectividad de pago en término»: es cobrado 90d / (cobrado 90d + vencido), que
        // es «de la plata que debería estar en la mano, cuánta está». La otra no es computable
        // porque la columna Q pisa la promesa con la fecha real. Está declarado en la vista.
        detalle={efec == null ? SIN_DATO : undefined}
        testid="metrica-efectividad"
      />
      <Metrica
        rotulo="FONDO DE REPARO"
        valor={montoM(c?.fondo_reparo)}
        detalle={c?.fondo_reparo == null ? SIN_DATO : 'sin fecha de liberación'}
        testid="metrica-reparo"
      />
    </div>
  )
}
