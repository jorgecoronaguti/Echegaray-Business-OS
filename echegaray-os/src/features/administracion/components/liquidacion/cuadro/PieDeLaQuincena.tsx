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
import { horas as nHoras, pesos } from '../formato'
import { CANAL_SCROLL } from '../solapas/tabla'
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

export function ResumenJornaleros({ t, sellada = false }: { t: TotalesDeJornaleros; sellada?: boolean }) {
  const cierre = cierreDeTotales(t)
  const avisos: string[] = []
  if (cierre?.cierra === false) avisos.push(`no cierra por ${pesos(cierre.diferencia)}`)
  // EN LA CERRADA «SIN SALDO» ES «NADIE REGISTRÓ LO PAGADO» (`pagoSinRegistrar`): no se da por debido ni por pagado.
  if (t.pago.sinSaldo > 0) avisos.push(sellada ? `${t.pago.sinSaldo} con el pago sin registrar: no se afirma saldo` : `${t.pago.sinSaldo} sin saldo`)
  if (t.sinNeto > 0) avisos.push(`${t.sinNeto} sin neto`)
  if (t.sinTarifa > 0) avisos.push(`${t.sinTarifa} sin retribución`)
  if (t.estimados > 0) avisos.push(`${t.estimados} con blanco estimado`)
  return (
    <Tira testid="espejo-pie">
      <Cifra rotulo="Horas" valor={nHoras(t.horasPagas)} testid="pie-horas" />
      <Cifra rotulo="Banco" valor={pesos(t.netoBandas)} testid="pie-neto" />
      <Cifra rotulo="Pagado banco" valor={pesos(t.pago.pagadoBanco)} testid="pie-pagado-banco" />
      <Cifra rotulo="Saldo banco" valor={pesos(t.pago.saldoBanco)} testid="pie-saldo-banco" />
      <Cifra rotulo="Negro" valor={pesos(t.negro)} testid="pie-negro" />
      <Cifra rotulo="Pagado efectivo" valor={pesos(t.pago.pagadoEfectivo)} testid="pie-pagado-efectivo" />
      <Cifra rotulo="Saldo efectivo" valor={pesos(t.pago.saldoEfectivo)} testid="pie-saldo-efectivo" />
      <Cifra rotulo="Presentismo en juego" valor={pesos(t.presentismoEnJuego)} testid="pie-presentismo" />
      {t.presentismoPerdidos > 0 && (
        <Cifra rotulo={`perdido (${t.presentismoPerdidos})`} valor={`−${pesos(t.presentismoPerdido)}`} testid="pie-presentismo-perdido" tono={V.warn} />
      )}
      <Cifra rotulo="Efectivo redondeado" valor={pesos(t.redondeo > 0 ? t.redondeo : null)} testid="pie-redondeo" />
      <Cifra rotulo="Total" valor={pesos(t.cobra)} testid="pie-total" />
      <Cifra rotulo="Pagado" valor={pesos(t.pago.pagado)} testid="pie-pagado" />
      <Cifra rotulo="Saldo" valor={pesos(t.pago.saldoTotal)} testid="pie-saldo" />
      <Cifra rotulo="Saldo redondeado" valor={pesos(t.saldoRedondeado > 0 ? t.saldoRedondeado : null)} testid="pie-saldo-redondeado" />
      {/* LA LÍNEA DEL DÍA DE PAGO: el exceso de un lado ya está descontado del otro, así que suman el saldo y no más. */}
      <Cifra rotulo="A pagar hoy:" valor={`efectivo ${pesos(t.pago.aPagarEfectivo)} · banco ${pesos(t.pago.aPagarBanco)}`} testid="pie-a-pagar" />
      {avisos.length > 0 && <Aviso tono={cierre?.cierra === false ? V.neg : V.apagado}>{avisos.join(' · ')}</Aviso>}
    </Tira>
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
