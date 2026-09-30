'use client'

// LOS SUBTOTALES DE CADA CUADRO Y EL TOTAL GENERAL (dueño, 17/09/2026).
//
// El pie de antes era una sola tira que mezclaba jornaleros y mensuales: «Efectivo redondeado» sumaba el sueldo
// entero de los jefes y «el total no cierra por $3.600.000» era la suma de los mensuales, no un error. Ahora cada
// cuadro dice lo suyo al lado de su título, y abajo va el total general con una sola pregunta contestada: ¿Total −
// Pagado = Saldo? Si no, por cuánto y por qué (`totalGeneral`).
//
// Las cifras salen de `liquidacionPorTipo.ts`; acá no se suma nada.

import type { ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { CANAL_SCROLL } from '../solapas/tabla'
import { conciliarPlata } from './conciliacionDePlata'
import type { PagoDeLaLinea } from '../../../services/pagoDeLaQuincena'
import { cierreDeTotales } from '../../../services/cuadroDeJornales'
import type { TotalGeneral, TotalesDeJornaleros, TotalesDeMensuales } from '../../../services/liquidacionPorTipo'

const Cifra = ({ rotulo, valor, testid, tono }: { rotulo: string; valor: ReactNode; testid: string; tono?: string }) => (
  // En el teléfono una cifra puede partirse: «A pagar hoy: efectivo … · banco …» mide más que la pantalla.
  <span data-testid={testid} className="max-md:!whitespace-normal" style={{ whiteSpace: 'nowrap', color: tono }}>
    {/* EL RÓTULO, TENUE (limpieza 17/09/2026): quince pares rótulo+cifra con el rótulo casi tan oscuro como la cifra
        obligaban a leer la tira entera. El ORDEN y las cifras no cambian: se intentó reordenarlo el 17/09 y el dueño
        lo rechazó («rompiste el diseño… rehacer eso»). */}
    <span style={{ color: tono ?? V.tenue }}>{`${rotulo} `}</span><strong>{valor}</strong>
  </span>
)

const Tira = ({ children, testid }: { children: ReactNode; testid: string }) => (
  <div data-testid={testid} style={{
    display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 16, rowGap: 4,
    fontSize: '12px', fontVariantNumeric: 'tabular-nums', color: V.tinta,
  }}>{children}</div>
)

const Aviso = ({ children, tono }: { children: ReactNode; tono: string }) => (
  <span style={{ fontSize: '11.5px', color: tono }}>{children}</span>
)

// LA PLATA COMO DECISIÓN DE PAGO (dueño, 30/09/2026: «esto así no me sirve, es inentendible… quiero lo de plata»).
// Una tira con ~20 cifras corridas obligaba a leer todo para responder una sola pregunta: ¿cuánto pongo hoy en el
// banco y cuánto en mano? Ahora arriba va esa respuesta y abajo, canal × (Total, Pagado, Saldo). Horas, presentismo
// y «con blanco estimado» salieron de ESTE resumen (siguen en la tabla y en el panel de la persona). Los valores son
// los mismos de `TotalesDeJornaleros`; acá no se calcula nada, y los redondeados sólo van donde deciden (en mano).
const ROT = { color: V.tenue, fontSize: '11px', fontWeight: 500 } as const
const NUM = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const

const APagar = ({ rotulo, valor, testid }: { rotulo: string; valor: number | null; testid: string }) => (
  <div data-testid={testid} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
    <span style={ROT}>{rotulo}</span>
    <strong style={{ fontSize: '18px', lineHeight: '24px', fontVariantNumeric: 'tabular-nums', color: V.tinta }}>{pesos(valor)}</strong>
  </div>
)

const Celda = ({ valor, testid, fuerte }: { valor: number | null; testid: string; fuerte?: boolean }) => (
  <div style={NUM}>
    <span data-testid={testid} style={{ fontWeight: fuerte ? 600 : 400 }}>{pesos(valor)}</span>
  </div>
)

// UNA NOTA VISIBLE, NUNCA UN title: es lo que hace que la fila cierre a la vista (auditor 30/09/2026).
const Nota = ({ children, testid, tono }: { children: ReactNode; testid: string; tono?: string }) => (
  <div data-testid={testid} style={{ gridColumn: '1 / -1', ...ROT, fontSize: '11px', color: tono ?? V.tenue, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{children}</div>
)

// El universo de las tres columnas es UNO: las filas con saldo que afirmar (`conciliarPlata`). Las demás se cuentan
// en un aviso visible en vez de entrar en Total pero no en Saldo.
export function ResumenJornaleros({ t, pagos, sellada = false }: { t: TotalesDeJornaleros; pagos: readonly PagoDeLaLinea[]; sellada?: boolean }) {
  const cierre = cierreDeTotales(t)
  const c = conciliarPlata(pagos)
  const avisos: string[] = []
  if (cierre?.cierra === false) avisos.push(`no cierra por ${pesos(cierre.diferencia)}`)
  // EN LA CERRADA «SIN SALDO» ES «NADIE REGISTRÓ LO PAGADO» (`pagoSinRegistrar`): no se da por debido ni por pagado.
  if (c.sinSaldo > 0) avisos.push(sellada ? `${c.sinSaldo} con el pago sin registrar: no entran en Total, Pagado ni Saldo` : `${c.sinSaldo} sin saldo: no entran en Total, Pagado ni Saldo`)
  if (t.sinNeto > 0) avisos.push(`${t.sinNeto} sin neto`)
  if (t.sinTarifa > 0) avisos.push(`${t.sinTarifa} sin retribución`)
  // Columna de rótulo angosta y tres de cifras iguales: en 390 px cada cifra («$3.536.928,84») entra sin partirse.
  const fila = { display: 'grid', gridTemplateColumns: 'minmax(56px, auto) repeat(3, minmax(0, 1fr))', columnGap: 12, alignItems: 'baseline', padding: '6px 0', borderTop: `1px solid ${V.linea}` } as const
  const notasDeCanal = (k: 'banco' | 'efectivo', otro: string) => (
    <>
      {c[k].descontado > 0 && <Nota testid={`pie-descuento-${k}`}>{`${otro} pagado de más, se descuenta de acá: −${pesos(c[k].descontado)}`}</Nota>}
      {c[k].sobrepasado > 0 && <Nota testid={`pie-sobrepasado-${k}`}>{`Cobraron de más por acá: +${pesos(c[k].sobrepasado)}`}</Nota>}
    </>
  )
  return (
    <div data-testid="espejo-pie" style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '12px', color: V.tinta }}>
      {/* LA LÍNEA DEL DÍA DE PAGO: el exceso de un lado ya está descontado del otro. */}
      <div data-testid="pie-a-pagar" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 32, rowGap: 8 }}>
        <APagar rotulo="A pagar hoy · banco" valor={c.aPagarBanco} testid="pie-a-pagar-banco" />
        <div>
          <APagar rotulo="A pagar hoy · efectivo" valor={c.aPagarEfectivo} testid="pie-a-pagar-efectivo" />
          {t.redondeo > 0 && <div data-testid="pie-redondeo" style={ROT}>{`Efectivo redondeado ${pesos(t.redondeo)}`}</div>}
        </div>
      </div>
      {c.cobraronDeMas.personas > 0 && (
        <Aviso tono={V.warn}><span data-testid="pie-cobraron-de-mas">{`${c.cobraronDeMas.personas} cobraron de más: ${pesos(c.cobraronDeMas.importe)} (banco + efectivo a pagar suman esto más que el Saldo)`}</span></Aviso>
      )}
      <div style={{ maxWidth: 560 }}>
        <div style={{ ...fila, borderTop: 'none', paddingTop: 0 }}>
          <span />
          <span style={{ ...ROT, ...NUM }}>Total</span>
          <span style={{ ...ROT, ...NUM }}>Pagado</span>
          <span style={{ ...ROT, ...NUM }}>Saldo</span>
        </div>
        <div style={fila}>
          <span style={ROT}>Banco</span>
          <Celda valor={c.banco.total} testid="pie-neto" />
          <Celda valor={c.banco.pagado} testid="pie-pagado-banco" />
          <Celda valor={c.banco.saldo} testid="pie-saldo-banco" />
          {notasDeCanal('banco', 'Efectivo')}
        </div>
        <div style={fila}>
          <span style={ROT}>Efectivo</span>
          <Celda valor={c.efectivo.total} testid="pie-negro" />
          <Celda valor={c.efectivo.pagado} testid="pie-pagado-efectivo" />
          <Celda valor={c.efectivo.saldo} testid="pie-saldo-efectivo" />
          {notasDeCanal('efectivo', 'Banco')}
        </div>
        <div style={{ ...fila, borderTop: `1px solid ${V.grafito}` }}>
          <span style={{ ...ROT, color: V.tinta, fontWeight: 600 }}>Total</span>
          <Celda valor={c.total.total} testid="pie-total" fuerte />
          <Celda valor={c.total.pagado} testid="pie-pagado" fuerte />
          <Celda valor={c.total.saldo} testid="pie-saldo" fuerte />
          {t.saldoRedondeado > 0 && <Nota testid="pie-saldo-redondeado">{`Saldo redondeado ${pesos(t.saldoRedondeado)}`}</Nota>}
        </div>
      </div>
      {avisos.length > 0 && <Aviso tono={cierre?.cierra === false ? V.neg : V.apagado}>{avisos.join(' · ')}</Aviso>}
    </div>
  )
}

export function ResumenMensuales({ t, sellada = false }: { t: TotalesDeMensuales; sellada?: boolean }) {
  const avisos: string[] = []
  if (t.noCierran > 0) avisos.push(`${t.noCierran} no cierra${t.noCierran === 1 ? '' : 'n'} por ${pesos(t.diferencia)}`)
  // EN LA CERRADA NO HAY PENDIENTES QUE CARGAR (auditor, 18/09/2026): «sin sueldo cargado» y «sin recibo todavía» son
  // avisos de algo por hacer, y sobre una quincena cerrada no hay nada por hacer. Se dice lo que es.
  if (t.sinSueldo > 0) avisos.push(sellada ? `${t.sinSueldo} sin línea sellada` : `${t.sinSueldo} sin sueldo cargado`)
  if (t.sinRecibo > 0 && !sellada) avisos.push(`${t.sinRecibo} sin recibo todavía: banco y efectivo sin repartir`)
  if (sellada && t.sinSaldo > 0) avisos.push('cobran por mes: el saldo es del mes, no de la quincena')
  // UNA CERRADA SIN NINGUNA LÍNEA SELLADA DE MENSUALES (Oficina 16–31/08 no tiene cabecera): no hay cifra que dar, y
  // «$0 · falta recibo» afirmaría un importe y un pendiente que no existen.
  if (sellada && t.personas > 0 && t.sinSueldo === t.personas) {
    return (
      <Tira testid="pie-mensuales">
        <Cifra rotulo="Liquidado en la quincena" valor="sin línea sellada" testid="pie-mensuales-sueldo" />
        <Aviso tono={V.apagado}>ningún mensual tiene línea sellada en esta quincena cerrada</Aviso>
      </Tira>
    )
  }
  return (
    <Tira testid="pie-mensuales">
      {/* UNA CERRADA NO TIENE «SUELDO DEL MES»: la foto es lo liquidado en la quincena (Maldonado 16–31/03, 105 h × $8.125). */}
      {sellada
        ? <Cifra rotulo="Liquidado en la quincena" valor={pesos(t.sueldo)} testid="pie-mensuales-sueldo" />
        : <Cifra rotulo="Sueldos del mes" valor={pesos(t.sueldo)} testid="pie-mensuales-sueldo" />}
      <Cifra rotulo="Banco" valor={t.sinRecibo === t.personas - t.sinSueldo ? 'falta recibo' : pesos(t.banco)} testid="pie-mensuales-banco" />
      <Cifra rotulo="Efectivo" valor={t.sinRecibo === t.personas - t.sinSueldo ? 'falta recibo' : pesos(t.efectivo)} testid="pie-mensuales-efectivo" />
      <Cifra rotulo="Pagado" valor={pesos(t.pagado)} testid="pie-mensuales-pagado" />
      <Cifra rotulo="Saldo" valor={pesos(t.saldoTotal)} testid="pie-mensuales-saldo" />
      <Cifra rotulo="Saldo red." valor={pesos(t.saldoRedondeado > 0 ? t.saldoRedondeado : null)} testid="pie-mensuales-saldo-redondeado" />
      {avisos.length > 0 && <Aviso tono={t.noCierran > 0 ? V.neg : V.apagado}>{avisos.join(' · ')}</Aviso>}
    </Tira>
  )
}

/** El total general: jornaleros (la quincena) + mensuales (el sueldo del mes), y si cierra. */
export function PieTotalGeneral({ g, hayMensuales }: { g: TotalGeneral; hayMensuales: boolean }) {
  return (
    <div data-testid="pie-total-general" style={{ padding: `12px ${CANAL_SCROLL}px 16px`, borderTop: `1px solid ${V.grafito}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Tira testid="pie-general">
        <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{hayMensuales ? 'Total general · jornaleros + mensuales' : 'Total general'}</span>
        <Cifra rotulo="Total" valor={pesos(g.total)} testid="pie-general-total" />
        <Cifra rotulo="Pagado" valor={pesos(g.pagado)} testid="pie-general-pagado" />
        <Cifra rotulo="Saldo" valor={pesos(g.saldo)} testid="pie-general-saldo" />
        <Cifra rotulo="Efectivo redondeado" valor={pesos(g.redondeo > 0 ? g.redondeo : null)} testid="pie-general-redondeo" />
        <Cifra rotulo="Saldo red." valor={pesos(g.saldoRedondeado > 0 ? g.saldoRedondeado : null)} testid="pie-general-saldo-redondeado" />
        {g.cierra
          ? <Aviso tono={V.pos}>el total cierra: total − pagado = saldo</Aviso>
          : g.sinAlarma ? (
            // CERRADA, Y LO ÚNICO QUE FALTA ES LO QUE NADIE REGISTRÓ: no es una deuda ni un error, se dice apagado.
            <span data-testid="pie-general-sin-registro" style={{ fontSize: '11.5px', color: V.apagado }}>
              {`quincena cerrada · no se afirma saldo por ${pesos(g.descuadre)}: ${g.causas.map((c) => `${c.causa} ${pesos(c.importe)}`).join(' · ')}`}
            </span>
          ) : (
            <span data-testid="pie-general-no-cierra" style={{ fontSize: '11.5px', color: V.neg }}>
              {`no cierra por ${pesos(g.descuadre)}: ${g.causas.map((c) => `${c.causa} ${pesos(c.importe)}`).join(' · ')}`}
            </span>
          )}
      </Tira>
    </div>
  )
}
