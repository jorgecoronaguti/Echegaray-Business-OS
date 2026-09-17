'use client'

// CUÁNTO COBRA ESA PERSONA, EN LA ÚNICA COLUMNA QUE NO SE VA CON EL SCROLL (dueño, 17/09/2026: «liq de hs, no está
// claro cuánto cobra cada uno»).
//
// ═══ POR QUÉ ACÁ Y NO EN UNA COLUMNA NUEVA ═══
//
// Total · Pagado · Saldo ya existen: son las tres últimas columnas del bloque «Resto del cálculo». El problema es que
// el cuadro de jornaleros mide ~2.900 px y ese bloque cae fuera de pantalla: para saber cuánto cobra alguien hay que
// desplazarse hasta el final y perder el nombre de vista. La columna Persona es pegajosa (`COLUMNA_FIJA`), así que lo
// que se escribe acá se ve siempre, al lado de quien cobra.
//
// NO SE CALCULA NADA NI SE AGREGA NINGÚN DATO: son exactamente los valores que dibujan `CeldaTotal` (`linea.cobra`),
// `CeldaPagadoTotal` (`pago.pagado`) y `CeldaSaldo` de lado «total» (`pago.saldoTotal`) — y el `pago` lo pasa quien
// arma la fila, igual que a esas celdas: el de la línea en jornaleros, `pagoDelMensual` en mensuales. Si mañana
// cambia la cuenta, cambia en un solo lugar y acá se ve el mismo número.
//
// JERARQUÍA: manda lo que cobra —tinta, 13 px, 600—; pagado y saldo van subordinados a 11 px y tenue. El saldo se
// pinta ámbar en negativo con el mismo criterio que la columna: ahí se pagó de más.

import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { motivoSinCobra } from './estadoDelPago'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import type { PagoDeLaLinea } from '../../../services/pagoDeLaQuincena'

/** Un dato subordinado: el rótulo y su cifra, en un solo bocado que no se parte al envolver. */
const Menor = ({ rotulo, valor, tono }: { rotulo: string; valor: string; tono?: string }) => (
  <span style={{ whiteSpace: 'nowrap' }}>{`${rotulo} `}<span style={{ color: tono }}>{valor}</span></span>
)

export function LoQueCobra({ fila, pago }: {
  fila: FilaDelEspejo
  /** El mismo pago que recibe `CeldaPagadoTotal`. Por defecto el de la línea; mensuales pasan `pagoDelMensual`. */
  pago?: PagoDeLaLinea
}) {
  const l = fila.linea
  const p = pago ?? l.pago
  const porMes = l.modalidad === 'mensual'
  const saldo = p.saldoTotal
  return (
    <div data-testid={`cobro-${fila.personaId}`}
      title={porMes ? 'Cobra por mes: el sueldo del mes, lo ya pagado y el saldo que resta' : 'Lo que cobra por la quincena, lo ya pagado y el saldo que resta'}
      style={{
        // ENVUELVE, NO RECORTA: a 390 px la columna Persona mide 170 y las tres cifras no entran en un renglón. Cortar
        // con puntos suspensivos escondería justamente el saldo, que es lo que se va a pagar.
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, rowGap: 0,
        fontSize: '11px', lineHeight: '15px', color: V.tenue, fontVariantNumeric: 'tabular-nums',
      }}>
      {l.cobra == null ? (
        <span data-testid={`cobro-total-${fila.personaId}`} style={{ color: V.tenue }}>{motivoSinCobra(l)}</span>
      ) : (
        <span data-testid={`cobro-total-${fila.personaId}`} style={{ fontSize: '13px', fontWeight: 600, color: V.tinta }}>
          {`${porMes ? 'Cobra al mes' : 'Cobra'} ${pesos(l.cobra)}`}
        </span>
      )}
      <Menor rotulo="pagado" valor={pesos(p.pagado)} tono={p.pagado === 0 ? V.tenue : V.apagado} />
      {saldo != null && <Menor rotulo="saldo" valor={pesos(saldo)} tono={saldo < 0 ? V.warn : V.apagado} />}
    </div>
  )
}
