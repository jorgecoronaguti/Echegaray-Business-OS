// EL PIE DEL CUADRO DE LA QUINCENA — los totales, bloque por bloque.
//
// Salió de `GrillaEspejoQuincena.tsx` el 17/09/2026, cuando el dueño pidió distinguir horas, recibo blanco, recibo
// negro y el resto del cálculo. Hasta ese día el pie era una tira de catorce cifras seguidas; ahora son cuatro
// grupos con el mismo rótulo que el bloque de columnas de arriba, y cada total queda debajo de su bloque en vez
// de perderse en la tira. Ni una cifra cambió ni se fue: las mismas, de los mismos `totales`, en el mismo orden.
//
// BANCO + NEGRO + SUELDOS MENSUALES = TOTAL QUINCENA, exacto. Los mensuales no son de ningún recibo por horas:
// van con el resto del cálculo.

import type { ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { horas as nHoras, pesos } from '../formato'
import { MONO } from '../solapas/tabla'
import { BLOQUES, type ClaveDeBloque } from './bloquesDelCuadro'
import { cierreDeTotales } from '../../../services/cuadroDeJornales'
import type { TotalesDelEspejo } from '../../../services/espejoDeJornales'

const rotuloDe = (clave: ClaveDeBloque): string => BLOQUES.find((b) => b.clave === clave)?.rotulo ?? clave
const fondoDe = (clave: ClaveDeBloque): string | undefined => BLOQUES.find((b) => b.clave === clave)?.fondo

/** Un renglón del pie: rótulo a la izquierda, cifra a la derecha, alineada. */
function cifra(rotulo: string, valor: number | null, testid: string, texto?: string) {
  return (
    <div data-testid={testid} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: V.apagado }}>{rotulo}</span>
      <strong style={{ whiteSpace: 'nowrap' }}>{texto ?? pesos(valor)}</strong>
    </div>
  )
}

function Grupo({ bloque, children }: { bloque: ClaveDeBloque; children: ReactNode }) {
  return (
    <section data-testid={`pie-bloque-${bloque}`} style={{
      display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 12px 12px', borderRadius: '0 0 6px 6px',
      background: fondoDe(bloque), borderTop: `1px solid ${V.grafito}`,
    }}>
      <div style={{ fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', textTransform: 'uppercase', color: V.tinta, fontWeight: 600, paddingBottom: 4 }}>
        {rotuloDe(bloque)}
      </div>
      {children}
    </section>
  )
}

/**
 * EL PIE: los totales de cada bloque —las horas, lo que va al lote del banco, lo del negro, y el cierre— y lo que
 * el total no pudo sumar. Recorta con el filtro, porque sale de los mismos totales que la fila de total.
 */
export function PieDelEspejo({ totales, redondeo, saldoRed }: { totales: TotalesDelEspejo; redondeo: number; saldoRed: number }) {
  const cierre = cierreDeTotales(totales)
  const p = totales.pago
  const avisos: string[] = []
  if (cierre?.cierra === false) avisos.push(`el total no cierra por ${pesos(cierre.diferencia)}`)
  // LO QUE EL PIE NO PUDO SUMAR SE CUENTA, no se omite: un saldo que parece completo y le falta gente manda a
  // pagar de menos. Los sueldos mensuales quedan fuera del reparto banco/efectivo y por eso van aparte.
  if (p.sinSaldo > 0) avisos.push(`${p.sinSaldo} sin saldo: no se pudo afirmar cuánto falta`)
  if (totales.sinNeto > 0) avisos.push(`${totales.sinNeto} sin neto: sin recibo previo, no suman`)
  if (totales.sinTarifa > 0) avisos.push(`${totales.sinTarifa} sin retribución cargada (no suman a la plata)`)
  if (totales.estimados > 0) avisos.push(`${totales.estimados} con blanco estimado`)
  return (
    <div data-testid="espejo-pie" style={{ padding: '12px 20px 16px', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(216px, 1fr))', gap: 8 }}>
        <Grupo bloque="horas">
          {cifra('Horas pagas', totales.horasPagas, 'pie-horas', `${nHoras(totales.horasPagas)} h`)}
          {cifra('Personas', totales.personas, 'pie-personas', String(totales.personas))}
        </Grupo>
        <Grupo bloque="blanco">
          {cifra('Banco', totales.netoBandas, 'pie-neto')}
          {cifra('Pagado banco', p.pagadoBanco, 'pie-pagado-banco')}
          {cifra('Saldo banco', p.saldoBanco, 'pie-saldo-banco')}
        </Grupo>
        <Grupo bloque="negro">
          {cifra('Negro', totales.negro, 'pie-negro')}
          {cifra('Pagado efectivo', p.pagadoEfectivo, 'pie-pagado-efectivo')}
          {cifra('Saldo efectivo', p.saldoEfectivo, 'pie-saldo-efectivo')}
        </Grupo>
        <Grupo bloque="resto">
          {/* PRESENTISMO: lo que está en juego en las filas visibles y lo que se perdió. Se dicen los dos porque el
              dueño decide con los dos: cuánto pesa la regla y cuánto costó esta quincena. */}
          {cifra('Presentismo en juego', totales.presentismoEnJuego, 'pie-presentismo')}
          {totales.presentismoPerdidos > 0 && (
            <div data-testid="pie-presentismo-perdido" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: V.warn }}>
              <span>{`Presentismo perdido (${totales.presentismoPerdidos})`}</span><strong>{`−${pesos(totales.presentismoPerdido)}`}</strong>
            </div>
          )}
          {cifra('Efectivo redondeado', redondeo > 0 ? redondeo : null, 'pie-redondeo')}
          {totales.mensuales > 0 && cifra('Sueldos mensuales', totales.mensuales, 'pie-mensuales')}
          {cifra('Total', totales.cobra, 'pie-total')}
          {cifra('Pagado', p.pagado, 'pie-pagado')}
          {cifra('Saldo', p.saldoTotal, 'pie-saldo')}
          {cifra('Saldo redondeado', saldoRed > 0 ? saldoRed : null, 'pie-saldo-redondeado')}
        </Grupo>
      </div>
      {/* LA LÍNEA QUE CONTESTA LA PREGUNTA DEL DÍA DE PAGO: con la caja en la mano, cuánto sale por cada canal.
          El exceso de un lado ya está descontado del otro, así que estas dos SUMAN el saldo y no más. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 16, rowGap: 4, paddingTop: 12 }}>
        <span data-testid="pie-a-pagar" style={{ fontWeight: 600 }}>
          <span style={{ color: V.apagado }}>A pagar hoy: </span>
          {`efectivo ${pesos(p.aPagarEfectivo)} · banco ${pesos(p.aPagarBanco)}`}
        </span>
        {avisos.length > 0 && (
          <span style={{ fontSize: '11.5px', color: cierre?.cierra === false ? V.neg : V.apagado }}>{avisos.join(' · ')}</span>
        )}
      </div>
    </div>
  )
}
