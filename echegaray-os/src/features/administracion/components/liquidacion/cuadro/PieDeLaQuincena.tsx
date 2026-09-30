'use client'

// LOS SUBTOTALES DE CADA CUADRO Y EL TOTAL GENERAL (dueño, 17/09/2026).
//
// El pie de antes era una sola tira que mezclaba jornaleros y mensuales: «Efectivo redondeado» sumaba el sueldo
// entero de los jefes y «el total no cierra por $3.600.000» era la suma de los mensuales, no un error. Ahora cada
// cuadro dice lo suyo debajo de su título, y abajo va el total general con una sola pregunta contestada: ¿Total −
// Pagado = Saldo? Si no, por cuánto y por qué (`totalGeneral`).
//
// Las cifras salen de `liquidacionPorTipo.ts` y `conciliacionDePlata.ts`; acá no se suma nada.
//
// REHECHO SEGÚN LA SKILL DE DISEÑO (dueño, 30/09/2026: «esto claramente no respetó ningún lineamiento de ux ui,
// rehacer»). Lo que se corrigió, y por qué, para que el próximo cambio no lo deshaga:
//  · Tokens de Tailwind, ningún estilo en línea ni hex: el pie era la única pieza del cuadro con su propia paleta.
//  · Los dos «A pagar hoy» son la respuesta, con el mismo tamaño los dos; la tabla es el detalle y va al costado
//    (PC) o debajo (teléfono), nunca antes.
//  · «Cobraron de más» es un aviso del sistema (`Callout`), no una línea roja suelta entre cifras.
//  · Lo que separa el saldo de «total − pagado» ya no cuelga pegado debajo de cada número: va en un bloque de
//    ajustes, con el importe en la columna Saldo, para que la resta se lea en vertical.

import type { ReactNode } from 'react'
import { Callout } from '@/shared/components/ui/Callout'
import { pesos } from '../formato'
import { conciliarPlata, type ConciliacionDePlata } from './conciliacionDePlata'
import type { PagoDeLaLinea } from '../../../services/pagoDeLaQuincena'
import { cierreDeTotales } from '../../../services/cuadroDeJornales'
import type { TotalGeneral, TotalesDeJornaleros, TotalesDeMensuales } from '../../../services/liquidacionPorTipo'

// UNA SOLA ESCALA PARA TODO EL PIE: rótulo 11 px tenue arriba, cifra 12,5 px (la de las filas del cuadro), y sólo la
// respuesta del día más grande. Una tercera o cuarta medida es lo que hacía que el pie pareciera de otra pantalla.
const ROTULO = 'text-[11px] font-medium leading-4 text-faint'
const NUMERO = 'text-right tabular-nums whitespace-nowrap'

/** Rótulo chico arriba, valor abajo: el patrón de fila de KPIs de la skill, sin tarjeta. */
const Cifra = ({ rotulo, valor, testid, tono = 'text-ink' }: { rotulo: string; valor: ReactNode; testid: string; tono?: string }) => (
  <div data-testid={testid} className="flex min-w-0 flex-col gap-0.5">
    <span className={ROTULO}>{rotulo}</span>
    <span className={`text-[13px] font-semibold leading-5 tabular-nums ${tono}`}>{valor}</span>
  </div>
)

/**
 * Las cifras de mensuales y del total general, en fila con aire. El ORDEN no cambia: se intentó reordenarlo el
 * 17/09 y el dueño lo rechazó («rompiste el diseño… rehacer eso»).
 */
const Tira = ({ children, testid }: { children: ReactNode; testid: string }) => (
  <div data-testid={testid} className="flex flex-wrap items-end gap-x-8 gap-y-3">{children}</div>
)

/** Un estado del cuadro en una línea: apagado si es informativo, en su color sólo si es un problema o un cierre. */
const Estado = ({ children, tono = 'text-muted', testid }: { children: ReactNode; tono?: string; testid?: string }) => (
  <p data-testid={testid} className={`m-0 text-[11.5px] leading-4 ${tono}`}>{children}</p>
)

// ─── Jornaleros ─────────────────────────────────────────────────────────────────────────────────────────────────

// Primero el componente que se exporta y debajo sus partes: el recorte `ResumenJornaleros…ResumenMensuales` es lo
// que leen `solapaQuincena.test.ts` y `pieSegunLaSkill.test.ts`.
export function ResumenJornaleros({ t, pagos, sellada = false }: { t: TotalesDeJornaleros; pagos: readonly PagoDeLaLinea[]; sellada?: boolean }) {
  const cierre = cierreDeTotales(t)
  const c = conciliarPlata(pagos)
  const avisos: string[] = []
  if (cierre?.cierra === false) avisos.push(`no cierra por ${pesos(cierre.diferencia)}`)
  // EN LA CERRADA «SIN SALDO» ES «NADIE REGISTRÓ LO PAGADO» (`pagoSinRegistrar`): no se da por debido ni por pagado.
  if (c.sinSaldo > 0) avisos.push(sellada ? `${c.sinSaldo} con el pago sin registrar: no entran en Total, Pagado ni Saldo` : `${c.sinSaldo} sin saldo: no entran en Total, Pagado ni Saldo`)
  if (t.sinNeto > 0) avisos.push(`${t.sinNeto} sin neto`)
  if (t.sinTarifa > 0) avisos.push(`${t.sinTarifa} sin retribución`)
  return (
    <div data-testid="espejo-pie" className="flex flex-col gap-4">
      {/* PC: la respuesta a la izquierda, el detalle a la derecha, alineados arriba. Teléfono: uno debajo del otro. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-12">
        <LoQueDecide t={t} c={c} />
        <DetalleDePlata t={t} c={c} />
      </div>
      {avisos.length > 0 && (cierre?.cierra === false
        ? <Callout tono="neg" className="w-fit max-w-full">{avisos.join(' · ')}</Callout>
        : <Estado>{avisos.join(' · ')}</Estado>)}
    </div>
  )
}

// LA PLATA COMO DECISIÓN DE PAGO (dueño, 30/09/2026: «esto así no me sirve, es inentendible… quiero lo de plata»).
// La pregunta es una sola: ¿cuánto pongo hoy en el banco y cuánto en mano? Las horas, el presentismo y el recibo
// estimado no van en este resumen (siguen en la tabla y en el panel de la persona).
const APagar = ({ rotulo, valor, testid, children }: { rotulo: string; valor: number | null; testid: string; children?: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1">
    <div data-testid={testid} className="flex flex-col gap-0.5">
      <span className={ROTULO}>{rotulo}</span>
      <strong className="text-lg font-semibold leading-7 tabular-nums text-ink md:text-xl">{pesos(valor)}</strong>
    </div>
    {children}
  </div>
)

/** Lo que acompaña a una cifra del día, en segundo plano: el rótulo apagado y el importe en tinta suave. */
const Acompana = ({ testid, rotulo, valor }: { testid: string; rotulo: string; valor: number | null }) => (
  <span data-testid={testid} className="text-[11.5px] leading-4 text-muted">
    {`${rotulo} `}<span className="tabular-nums text-ink-soft">{pesos(valor)}</span>
  </span>
)

function LoQueDecide({ t, c }: { t: TotalesDeJornaleros; c: ConciliacionDePlata }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* LA LÍNEA DEL DÍA DE PAGO: el exceso de un lado ya está descontado del otro. Dos columnas también en el
          teléfono: son la respuesta, y apiladas la segunda queda debajo del pliegue. */}
      <div data-testid="pie-a-pagar" className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-x-8">
        <APagar rotulo="A pagar hoy · banco" valor={c.aPagarBanco} testid="pie-a-pagar-banco">
          {/* LA RESTA DE RECIBOS ANTERIORES VA APARTE: sale por banco pero ya está dentro del efectivo. */}
          {(t.arrastre?.importe ?? 0) > 0 && <Acompana testid="pie-arrastre" rotulo="+ Resta recibo anterior (banco)" valor={t.arrastre?.importe ?? null} />}
        </APagar>
        <APagar rotulo="A pagar hoy · efectivo" valor={c.aPagarEfectivo} testid="pie-a-pagar-efectivo">
          {t.redondeo > 0 && <Acompana testid="pie-redondeo" rotulo="Efectivo redondeado" valor={t.redondeo} />}
        </APagar>
      </div>
      {c.cobraronDeMas.personas > 0 && (
        <Callout tono="warn" className="w-fit max-w-full">
          <span data-testid="pie-cobraron-de-mas">{`${c.cobraronDeMas.personas} cobraron de más: ${pesos(c.cobraronDeMas.importe)} (banco + efectivo a pagar suman esto más que el Saldo)`}</span>
        </Callout>
      )}
    </div>
  )
}

// Columna de rótulo angosta y tres de cifras iguales: en 390 px cada cifra («$3.536.928,84») entra sin partirse.
const GRILLA = 'grid grid-cols-[minmax(56px,auto)_repeat(3,minmax(0,1fr))] items-baseline gap-x-2 sm:gap-x-3'

const Celda = ({ valor, testid, fuerte }: { valor: number | null; testid: string; fuerte?: boolean }) => (
  <div className={NUMERO}>
    <span data-testid={testid} className={fuerte ? 'font-semibold' : undefined}>{pesos(valor)}</span>
  </div>
)

/** Un ajuste del saldo: el texto ocupa Total y Pagado, el importe cae en la columna Saldo, debajo de lo que corrige. */
const Ajuste = ({ testid, children, valor }: { testid: string; children: ReactNode; valor: string }) => (
  <div data-testid={testid} className={`${GRILLA} py-1`}>
    <span className="col-span-3 text-[11.5px] leading-4 text-muted">{children}</span>
    <span className={`${NUMERO} text-[11.5px] leading-4 text-ink-soft`}>{valor}</span>
  </div>
)

// UNA NOTA VISIBLE, NUNCA UN title (auditor 30/09/2026): es lo que hace que cada fila cierre a la vista. Con los
// importes en la columna Saldo, «Total − Pagado − descontado + cobrado de más = Saldo» se lee de arriba abajo.
function AjustesDelSaldo({ t, c }: { t: TotalesDeJornaleros; c: ConciliacionDePlata }) {
  const lineas: ReactNode[] = []
  for (const [k, otro] of [['banco', 'efectivo'], ['efectivo', 'banco']] as const) {
    if (c[k].descontado > 0) lineas.push(<Ajuste key={`d-${k}`} testid={`pie-descuento-${k}`} valor={`−${pesos(c[k].descontado)}`}>{`Saldo ${k}: se descuenta lo pagado de más en ${otro}`}</Ajuste>)
    if (c[k].sobrepasado > 0) lineas.push(<Ajuste key={`s-${k}`} testid={`pie-sobrepasado-${k}`} valor={`+${pesos(c[k].sobrepasado)}`}>{`Saldo ${k}: cobraron de más por ${k}`}</Ajuste>)
  }
  if (t.saldoRedondeado > 0) lineas.push(<Ajuste key="red" testid="pie-saldo-redondeado" valor={pesos(t.saldoRedondeado)}>Saldo redondeado</Ajuste>)
  if (lineas.length === 0) return null
  return (
    <div className="mt-2 border-t border-line-hairline pt-1">
      <span className={ROTULO}>Ajustes del saldo</span>
      {lineas}
    </div>
  )
}

// El universo de las tres columnas es UNO: las filas con saldo que afirmar (`conciliarPlata`). Las demás se cuentan
// en un aviso visible en vez de entrar en Total pero no en Saldo.
function DetalleDePlata({ t, c }: { t: TotalesDeJornaleros; c: ConciliacionDePlata }) {
  const fila = `${GRILLA} border-t border-line py-2`
  return (
    <div className="w-full min-w-0 text-[12px] leading-4 text-ink sm:text-[12.5px] lg:max-w-[560px]">
      <div className={`${GRILLA} pb-1`}>
        <span />
        <span className={`${ROTULO} text-right`}>Total</span>
        <span className={`${ROTULO} text-right`}>Pagado</span>
        <span className={`${ROTULO} text-right`}>Saldo</span>
      </div>
      <div className={fila}>
        <span className="text-muted">Banco</span>
        <Celda valor={c.banco.total} testid="pie-neto" />
        <Celda valor={c.banco.pagado} testid="pie-pagado-banco" />
        <Celda valor={c.banco.saldo} testid="pie-saldo-banco" />
      </div>
      <div className={fila}>
        <span className="text-muted">Efectivo</span>
        <Celda valor={c.efectivo.total} testid="pie-negro" />
        <Celda valor={c.efectivo.pagado} testid="pie-pagado-efectivo" />
        <Celda valor={c.efectivo.saldo} testid="pie-saldo-efectivo" />
      </div>
      <div className={`${GRILLA} border-t border-accent py-2`}>
        <span className="font-semibold">Total</span>
        <Celda valor={c.total.total} testid="pie-total" fuerte />
        <Celda valor={c.total.pagado} testid="pie-pagado" fuerte />
        <Celda valor={c.total.saldo} testid="pie-saldo" fuerte />
      </div>
      <AjustesDelSaldo t={t} c={c} />
    </div>
  )
}

// ─── Mensuales ──────────────────────────────────────────────────────────────────────────────────────────────────

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
      <div className="flex flex-col gap-2">
        <Tira testid="pie-mensuales">
          <Cifra rotulo="Liquidado en la quincena" valor="sin línea sellada" testid="pie-mensuales-sueldo" tono="text-muted" />
        </Tira>
        <Estado>ningún mensual tiene línea sellada en esta quincena cerrada</Estado>
      </div>
    )
  }
  const faltaRecibo = t.sinRecibo === t.personas - t.sinSueldo
  return (
    <div className="flex flex-col gap-2">
      <Tira testid="pie-mensuales">
        {/* UNA CERRADA NO TIENE «SUELDO DEL MES»: la foto es lo liquidado en la quincena (Maldonado 16–31/03, 105 h × $8.125). */}
        {sellada
          ? <Cifra rotulo="Liquidado en la quincena" valor={pesos(t.sueldo)} testid="pie-mensuales-sueldo" />
          : <Cifra rotulo="Sueldos del mes" valor={pesos(t.sueldo)} testid="pie-mensuales-sueldo" />}
        <Cifra rotulo="Banco" valor={faltaRecibo ? 'falta recibo' : pesos(t.banco)} testid="pie-mensuales-banco" tono={faltaRecibo ? 'text-muted' : undefined} />
        <Cifra rotulo="Efectivo" valor={faltaRecibo ? 'falta recibo' : pesos(t.efectivo)} testid="pie-mensuales-efectivo" tono={faltaRecibo ? 'text-muted' : undefined} />
        <Cifra rotulo="Pagado" valor={pesos(t.pagado)} testid="pie-mensuales-pagado" />
        <Cifra rotulo="Saldo" valor={pesos(t.saldoTotal)} testid="pie-mensuales-saldo" />
        <Cifra rotulo="Saldo red." valor={pesos(t.saldoRedondeado > 0 ? t.saldoRedondeado : null)} testid="pie-mensuales-saldo-redondeado" />
      </Tira>
      {avisos.length > 0 && (t.noCierran > 0
        ? <Callout tono="neg" className="w-fit max-w-full">{avisos.join(' · ')}</Callout>
        : <Estado>{avisos.join(' · ')}</Estado>)}
    </div>
  )
}

// ─── Total general ──────────────────────────────────────────────────────────────────────────────────────────────

/** El total general: jornaleros (la quincena) + mensuales (el sueldo del mes), y si cierra. */
export function PieTotalGeneral({ g, hayMensuales }: { g: TotalGeneral; hayMensuales: boolean }) {
  return (
    // `px-5` = `CANAL_SCROLL` (20 px): el mismo margen que los títulos y la cinta de los cuadros de arriba.
    <div data-testid="pie-total-general" className="flex flex-col gap-3 border-t border-accent px-5 pb-4 pt-3">
      <h3 className="m-0 text-[13px] font-semibold leading-5 text-ink">{hayMensuales ? 'Total general · jornaleros + mensuales' : 'Total general'}</h3>
      <Tira testid="pie-general">
        <Cifra rotulo="Total" valor={pesos(g.total)} testid="pie-general-total" />
        <Cifra rotulo="Pagado" valor={pesos(g.pagado)} testid="pie-general-pagado" />
        <Cifra rotulo="Saldo" valor={pesos(g.saldo)} testid="pie-general-saldo" />
        <Cifra rotulo="Efectivo redondeado" valor={pesos(g.redondeo > 0 ? g.redondeo : null)} testid="pie-general-redondeo" />
        <Cifra rotulo="Saldo red." valor={pesos(g.saldoRedondeado > 0 ? g.saldoRedondeado : null)} testid="pie-general-saldo-redondeado" />
      </Tira>
      {g.cierra
        ? <Estado tono="text-pos">el total cierra: total − pagado = saldo</Estado>
        : g.sinAlarma ? (
          // CERRADA, Y LO ÚNICO QUE FALTA ES LO QUE NADIE REGISTRÓ: no es una deuda ni un error, se dice apagado.
          <Estado testid="pie-general-sin-registro">
            {`quincena cerrada · no se afirma saldo por ${pesos(g.descuadre)}: ${g.causas.map((c) => `${c.causa} ${pesos(c.importe)}`).join(' · ')}`}
          </Estado>
        ) : (
          <Callout tono="neg" className="w-fit max-w-full">
            <span data-testid="pie-general-no-cierra">{`no cierra por ${pesos(g.descuadre)}: ${g.causas.map((c) => `${c.causa} ${pesos(c.importe)}`).join(' · ')}`}</span>
          </Callout>
        )}
    </div>
  )
}
