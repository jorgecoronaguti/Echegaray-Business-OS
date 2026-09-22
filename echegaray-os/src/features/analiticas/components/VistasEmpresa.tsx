// NÓMINA Y COBRANZA — dos lecturas de la empresa, al final del módulo. (Caja vive en VistaCaja.tsx:
// desde el 18/09/2026 es la pestaña CAJA leída de su espejo, no un cálculo sobre egresos.)
//
// Diseño v6: columnas mensuales (nómina apilada blanco/negro), barras por área, la banda de
// antigüedad apilada y la tabla de clientes con el verbo del día.
// Lo que el diseño trae escrito a mano (3.053,5 h, 396 h, «27 de 30») sale acá de los datos o no sale.
import Link from 'next/link'
import { millones, pctEntero } from '../services/formato'
import { bandasDeCobranza, cifrasCobranza, cobranza, legajos, type FilaCobranza } from '../services/empresa'
import type { MesPagado, NominaPagada, PersonaPagada } from '../services/nominaPagada'
import { aUrl, type Filtros } from '../services/filtros'
import type { ClaveBanda } from '../../clientes/services/reglasCobranza'
import { documentosDeCobranzas } from '../../clientes/services/documentoDeCobranza'
import { diaMes, diaMesAnio } from '../../clientes/services/cobranzaFormato'
import { agendaDeCobro, cuando, proximoPorCliente, type AgendaDeCobro, type CobroProximo } from '../services/cobrosProximos'
import { ancho, Cabecera, ENCABEZADO, rotuloMes, Seccion, SinLectura, Valor } from './Piezas'
import { Torta } from './Torta'

/** Columnas mensuales con el valor arriba y el mes abajo; `partes` se apilan de arriba hacia abajo. */
export function Columnas({ meses }: { meses: { mes: string; valor: string | null; color?: string; partes: { alto: number; clase: string }[]; nota?: string }[] }) {
  const cruza = new Set(meses.map((m) => m.mes.slice(0, 4))).size > 1
  return (
    <div className="grid h-[220px] items-end gap-2 lg:gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(meses.length, 1)}, minmax(0, 1fr))` }}>
      {meses.map((m) => (
        <div key={m.mes} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
          <div className={`whitespace-nowrap text-[11px] font-semibold lg:text-[12.5px] ${m.valor == null ? 'font-normal text-faint' : m.color ?? 'text-ink'}`}>{m.valor ?? m.nota}</div>
          <div className="flex w-full max-w-[120px] flex-col overflow-hidden rounded-t-[2px]">
            {m.partes.map((p, i) => <div key={i} className={p.clase} style={{ height: `${Math.max(0, p.alto)}px` }} />)}
          </div>
          <div className="text-[11px] text-faint">{rotuloMes(m.mes, cruza)}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * NÓMINA — LO PAGADO A LA GENTE EN EL AÑO, EN BLANCO Y EN NEGRO, SIN CARGAS SOCIALES.
 *
 * Dueño, 22/09/2026: *«la sección "nómina" no es de utilidad así como está; tiene que salir lo pagado
 * en conceptos negro y blanco de todo el año, sin cargas sociales»*. Antes mostraba el COSTO de
 * nómina de `nomina_por_mes` —jornales + cargas, y desde agosto un factor 2,04 en vez de pesos—: ni
 * separaba blanco de negro, ni sacaba las cargas, ni llegaba a hoy.
 *
 * La cuenta entera vive en `nominaPagada.ts` y se prueba sin base; acá no se suma ni un peso. El año
 * es CALENDARIO y fijo: el control de período no aplica a esta vista (`razonNoAplica`), porque «todo
 * el año» fue el pedido y una serie recortada a un mes no se lee contra el resto.
 */
export function VistaNomina({ pagado, personas, filtros, mes }: {
  pagado: NominaPagada | null
  personas: unknown[] | null
  filtros: Filtros
  /** El mes que abre el detalle por persona, ya elegido por la página. */
  mes: string | null
}) {
  if (!pagado) return <SinLectura que="la liquidación de sueldos" />
  const l = personas ? legajos(personas) : null
  const { total, meses, avisos } = pagado
  const max = Math.max(1, ...meses.map((m) => m.total ?? 0))
  const detalle = mes ? pagado.porPersona.get(mes) ?? [] : []
  const maxPersona = Math.max(1, ...detalle.map((p) => p.total))
  return (
    <>
      <Cabecera titulo="Nómina" detalle={`año ${pagado.anio} · lo pagado a la gente, sin cargas sociales`}
        cifras={[
          { rotulo: 'pagado en el año', valor: millones(total?.total), falta: 'sin quincena cerrada',
            nota: total ? `${total.meses} ${total.meses === 1 ? 'mes' : 'meses'} con quincena cerrada` : null },
          { rotulo: 'en blanco', valor: millones(total?.blanco), nota: 'neto de los recibos' },
          { rotulo: 'en negro', valor: millones(total?.negro), nota: 'lo que el recibo no paga' },
          { rotulo: 'en negro', valor: pctEntero(pagado.pctNegro), falta: '—', tono: (pagado.pctNegro ?? 0) > 0.5 ? 'warn' : undefined,
            nota: 'del total pagado' },
          { rotulo: 'plantel', valor: l ? String(l.plantel) : null, nota: 'por pertenencia' },
        ]} />
      <Seccion titulo="Lo pagado, mes a mes" arriba="pt-8"
        aclaracion="neto de recibo y plata en mano; ninguna carga social, ninguna liquidación final"
        detalle="Blanco: el neto del recibo del estudio (recibo_sueldo_linea). Negro: lo cobrado en la quincena cerrada menos ese neto. Las contribuciones patronales, el F931 y las cargas sociales no entran en ninguna de las dos."
        leyenda={[{ color: 'bg-serie-1', rotulo: 'blanco (recibo)' }, { color: 'bg-serie-2', rotulo: 'negro (en mano)' }]}>
        <Columnas meses={meses.map((m) => (m.total == null ? { mes: m.mes, valor: null, nota: 'en curso', partes: [] } : {
          mes: m.mes, valor: millones(m.total),
          partes: [
            { alto: ((m.negro ?? 0) / max) * 170, clase: 'bg-serie-2' },
            { alto: ((m.blanco ?? 0) / max) * 170, clase: 'bg-serie-1' },
          ],
        }))} />
      </Seccion>
      <Seccion titulo="Cada mes, en números" filo
        aclaracion={mes ? 'el mes elegido abre el detalle de abajo' : 'ningún mes con quincena cerrada todavía'}>
        <div className="flex flex-col">
          <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[110px_repeat(3,minmax(0,1fr))_90px] ${ENCABEZADO}`}>
            <div>Mes</div><div className="text-right">Blanco</div><div className="text-right">Negro</div>
            <div className="text-right">Total</div><div className="text-right">% negro</div>
          </div>
          {meses.map((m) => <FilaMes key={m.mes} m={m} elegido={m.mes === mes} href={aUrl(filtros, { mes: m.mes })} />)}
        </div>
      </Seccion>
      {mes ? (
        <Seccion titulo={`Quién cobró en ${rotuloMes(mes, true)}`} filo
          aclaracion={`${detalle.length} ${detalle.length === 1 ? 'persona' : 'personas'} · lo que se le pagó, no lo que le costó a la empresa`}>
          <div className="flex flex-col">
            <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[minmax(0,1fr)_110px_110px_110px_120px] ${ENCABEZADO}`}>
              <div>Persona</div><div className="text-right">Blanco</div><div className="text-right">Negro</div>
              <div className="text-right">Total</div><div />
            </div>
            {detalle.length === 0
              ? <p className="py-4 text-sm text-faint">ninguna línea de liquidación cerrada en el mes</p>
              : detalle.map((p) => <FilaPersonaPagada key={p.personaId} p={p} max={maxPersona} />)}
          </div>
        </Seccion>
      ) : null}
      <Seccion titulo="Lo que no se puede decir" filo>
        <div className="grid gap-6 pb-9 sm:grid-cols-2">
          <Hueco que={avisos.sinRecibo.n ? `${avisos.sinRecibo.n} · ${millones(avisos.sinRecibo.importe)}` : '0'} falta="ninguno"
            porque="pagos sin recibo cargado" destraba="contados enteros en negro" />
          <Hueco que={avisos.reciboMayor.n ? `${avisos.reciboMayor.n} · ${millones(avisos.reciboMayor.importe)}` : '0'} falta="ninguno"
            porque="el recibo superó lo cobrado" destraba="el negro se apoya en 0" />
          <Hueco que={avisos.sinLinea.n ? `${avisos.sinLinea.n} · ${millones(avisos.sinLinea.importe)}` : '0'} falta="ninguno"
            porque="recibos sin línea de quincena" destraba="suman blanco sin negro al lado" />
          <Hueco que={`${avisos.mesesSinCerrar} · ${avisos.quincenasAbiertas} quincenas`}
            porque="meses sin ninguna quincena cerrada" destraba="no valen 0: no publican cifra" />
          <Hueco que={l ? `${l.sinCategoria} de ${l.plantel}` : null} falta="sin registrar"
            porque="legajos sin categoría" destraba="sin categoría no hay jornal" />
          <Hueco que="0" porque="cargas sociales incluidas" destraba="ninguna cifra las lleva adentro" />
        </div>
      </Seccion>
    </>
  )
}

/** Una fila del cuadro mensual. El mes sin quincena cerrada dice «en curso» y no publica ni un cero. */
function FilaMes({ m, elegido, href }: { m: MesPagado; elegido: boolean; href: string }) {
  const pct = m.total ? m.negro! / m.total : null
  return (
    <Link href={href} scroll={false}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line py-2.5 hover:bg-surface-quiet lg:grid-cols-[110px_repeat(3,minmax(0,1fr))_90px] lg:gap-6 lg:py-3 ${elegido ? 'bg-surface-quiet' : ''}`}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-[13px] font-medium text-ink">{rotuloMes(m.mes, true)}</span>
        {m.estado === 'parcial' ? <span className="whitespace-nowrap text-[11px] text-warn">media quincena sin cerrar</span> : null}
      </div>
      <div className="text-right text-[13px] tabular-nums text-ink-soft"><Valor v={millones(m.blanco)} falta="en curso" /></div>
      <div className="text-right text-[13px] tabular-nums text-ink-soft"><Valor v={millones(m.negro)} falta="" /></div>
      <div className="text-right text-[13px] font-semibold tabular-nums text-ink"><Valor v={millones(m.total)} falta="" /></div>
      <div className={`text-right text-[13px] tabular-nums ${(pct ?? 0) > 0.5 ? 'text-warn' : 'text-muted'}`}><Valor v={pctEntero(pct)} falta="" /></div>
    </Link>
  )
}

/** Una persona del mes elegido, con la barra de lo que cobró y la marca de lo que no se pudo afirmar. */
function FilaPersonaPagada({ p, max }: { p: PersonaPagada; max: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 lg:grid-cols-[minmax(0,1fr)_110px_110px_110px_120px] lg:gap-6 lg:py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-ink">{p.nombre}</span>
        {p.sinRecibo ? <span className="text-[11px] text-warn">sin recibo cargado: todo contado en negro</span> : null}
        {p.sinLinea ? <span className="text-[11px] text-warn">sin línea de quincena: sólo se puede afirmar el recibo</span> : null}
        {p.reciboMayor != null ? <span className="text-[11px] text-warn">el recibo supera lo cobrado en {millones(p.reciboMayor)}</span> : null}
      </div>
      <div className="text-right text-[13px] tabular-nums text-ink-soft">{millones(p.blanco)}</div>
      <div className="text-right text-[13px] tabular-nums text-ink-soft">{millones(p.negro)}</div>
      <div className="text-right text-[13px] font-semibold tabular-nums text-ink">{millones(p.total)}</div>
      <div className="col-span-2 row-start-2 flex h-3 overflow-hidden rounded-[2px] lg:col-span-1 lg:row-auto">
        <div className="h-full bg-serie-1" style={{ width: ancho(p.blanco, max) }} />
        <div className="h-full bg-serie-2" style={{ width: ancho(p.negro, max) }} />
      </div>
    </div>
  )
}

/** Una tarjeta de hueco, con el mismo dibujo que las del Resumen: filo arriba, `que` 13px/500. */
function Hueco({ que, falta = 'sin registrar', porque, destraba }: {
  que: string | null; falta?: string; porque: string; destraba: string
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <div className={`text-[13px] font-medium tabular-nums ${que == null ? 'text-faint' : 'text-ink'}`}>{que ?? falta}</div>
      <div className="text-[11.5px] leading-normal text-muted">{porque}</div>
      <div className="font-mono text-[11px] text-faint">{destraba}</div>
    </div>
  )
}

const TONO_BANDA: Record<ClaveBanda, { fondo: string; texto: string }> = {
  por_vencer: { fondo: 'bg-pos', texto: 'text-pos' },
  d1_30: { fondo: 'bg-warn', texto: 'text-warn' },
  d31_60: { fondo: 'bg-warn', texto: 'text-warn' },
  d61_90: { fondo: 'bg-dato-mora', texto: 'text-dato-mora' },
  d90: { fondo: 'bg-neg', texto: 'text-neg' },
}

/**
 * COBRANZA — primero lo que entra, después lo que se debe.
 *
 * El dueño (21/09/2026): «la pestaña de Cobranza no es de utilidad si no me marca con claridad los
 * cobros próximos». La antigüedad sola no alcanza: el 21/09/2026 los $ 221,11 M de deuda estaban
 * enteros «por vencer», así que la pantalla decía «al día» y nada sobre los $ 29,06 M que entraban
 * al día siguiente. Por eso la agenda de cobro abre la vista y la antigüedad queda debajo.
 *
 * Las tres cifras del diseño v9 (por cobrar · a más de 60 días · al día) se quedan; al lado entran
 * las dos que el dueño pidió (7 y 30 días), que completan la fila de cinco de la cabecera.
 */
export function VistaCobranza({ cuenta, documentos, agenda, hoy, periodo }: {
  cuenta: unknown[] | null
  /** Filas de `cliente_cobranza` (deuda) recortadas por el período: de acá sale la acción del día. */
  documentos: unknown[] | null
  /** Las mismas filas SIN recortar por período: la agenda mira para adelante. `null` = no se leyeron. */
  agenda: unknown[] | null
  hoy: string
  periodo: string
}) {
  if (!cuenta) return <SinLectura que="la cuenta corriente" />
  const filas = cobranza(cuenta, documentos ?? [], hoy)
  const c = cifrasCobranza(filas)
  const bandas = bandasDeCobranza(cuenta)
  const maxSaldo = Math.max(1, ...filas.map((f) => f.saldo))
  const nombres = new Map(filas.map((f) => [f.clienteId, f.nombre] as const))
  const a = agendaDeCobro(documentosDeCobranzas(agenda ?? [], hoy), nombres, hoy)
  const proximos = proximoPorCliente(a)
  return (
    <>
      <Cabecera titulo="Cobranza" detalle={`${periodo} · emitido y no cobrado`}
        cifras={[
          { rotulo: 'por cobrar', valor: millones(c.porCobrar) },
          { rotulo: 'entra en 7 días', valor: a.en7 > 0 ? millones(a.en7) : null, falta: 'nada' },
          { rotulo: 'entra en 30 días', valor: a.en30 > 0 ? millones(a.en30) : null, falta: 'nada' },
          { rotulo: 'a más de 60 días', valor: c.masDe60 > 0 ? millones(c.masDe60) : null, falta: 'ninguno', tono: 'neg' },
          { rotulo: 'al día', valor: c.alDia > 0 ? millones(c.alDia) : null, falta: 'ninguno', tono: 'pos' },
        ]} />
      <CobrosProximos a={a} agenda={agenda} hoy={hoy} />
      <Seccion titulo="Antigüedad de lo que se debe" filo>
        {c.porCobrar > 0 ? (
          <Torta centro={millones(c.porCobrar)} centroNota="por cobrar"
            gajos={bandas.map((b) => ({ rotulo: b.rotulo.toLowerCase(), monto: b.monto, color: TONO_BANDA[b.clave].texto, falta: 'ninguno' }))} />
        ) : <p className="text-sm text-faint">nada por cobrar</p>}
      </Seccion>
      <Seccion titulo="Por cliente" filo>
        <div className="flex flex-col pb-9">
          {/* ═══ EL SALDO VA PEGADO AL NOMBRE, NO DEL OTRO LADO DE LA BARRA (diseño v9) ═══
              `gFilaCobro: '150px 96px minmax(0,1fr) 150px 170px'`. Estaba al revés: la barra entre
              el cliente y el saldo empujaba el número a 600 px de distancia. El dato que decide
              —cuánto se debe— quedaba detrás del adorno que sólo lo ilustra. */}
          <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[150px_96px_minmax(0,1fr)_150px_170px] ${ENCABEZADO}`}>
            <div>Cliente</div><div className="text-right">Saldo</div><div /><div>Antigüedad</div><div>Hoy</div>
          </div>
          {filas.map((f) => <FilaCliente key={f.clienteId} f={f} max={maxSaldo} documentos={documentos} proximo={proximos.get(f.clienteId) ?? null} />)}
        </div>
      </Seccion>
    </>
  )
}

/** El tono de una fila de la agenda: vencido, inminente, dentro del mes, más lejos. */
function tonoDeCobro(dias: number, vencido: boolean): { fondo: string; texto: string } {
  if (vencido || dias < 0) return { fondo: 'bg-neg', texto: 'text-neg' }
  if (dias <= 2) return { fondo: 'bg-warn', texto: 'text-warn' }
  if (dias <= 30) return { fondo: 'bg-accent', texto: 'text-ink' }
  return { fondo: 'bg-dato-referencia', texto: 'text-muted' }
}

/**
 * LA AGENDA: un comprobante por fila, en el día en que se cobra. Se muestran los vencidos y los
 * próximos 30 días —la ventana en la que se decide algo— y lo que queda después se dice en una línea
 * con su plata, nunca se esconde.
 */
function CobrosProximos({ a, agenda, hoy }: { a: AgendaDeCobro; agenda: unknown[] | null; hoy: string }) {
  if (agenda == null) return <Seccion titulo="Cobros próximos"><p className="text-sm text-muted">No se pudo leer Cobranzas.</p></Seccion>
  const cerca = a.filas.filter((f) => f.dias <= 30)
  const lejos = a.filas.filter((f) => f.dias > 30)
  const max = Math.max(1, ...a.filas.map((f) => f.monto))
  const aclaracion = [
    'por la fecha de cobro de Cobranzas, la única que existe: no hay promesa de pago',
    'no se recorta por el período de arriba',
    a.sinFecha.n ? `${a.sinFecha.n} sin fecha de cobro por ${millones(a.sinFecha.total)}: no entran en ningún día` : 'ninguno sin fecha de cobro',
  ].join(' · ')
  return (
    <Seccion titulo="Cobros próximos" aclaracion={aclaracion} arriba="pt-8">
      <div className="flex flex-col" data-testid="cobranza-proximos">
        <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[150px_110px_minmax(0,1fr)_150px_170px] ${ENCABEZADO}`}>
          <div>Cuándo</div><div className="text-right">Monto</div><div /><div>Cliente</div><div>Comprobante</div>
        </div>
        {cerca.length === 0 ? (
          <p className="py-4 text-sm text-faint">
            {a.filas.length ? `nada en los próximos 30 días · el primero es el ${diaMesAnio(a.primero?.fecha) ?? '—'}` : 'ningún comprobante de deuda con fecha de cobro'}
          </p>
        ) : cerca.map((f) => {
          const tono = tonoDeCobro(f.dias, f.vencido)
          return (
            <div key={f.id} data-testid="cobranza-proximo" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 hover:bg-surface-quiet lg:h-11 lg:grid-cols-[150px_110px_minmax(0,1fr)_150px_170px] lg:gap-6 lg:py-0">
              {/* EN EL TELÉFONO EL TIEMPO BAJA UNA LÍNEA antes que truncarse: «mañ…» no es una palabra. */}
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-ink">{diaMesAnio(f.fecha)}</span>
                <span className={`whitespace-nowrap text-[11.5px] ${tono.texto}`}>{cuando(f.dias)}</span>
              </div>
              <div className="whitespace-nowrap text-right text-[13px] font-semibold tabular-nums text-ink">{millones(f.monto)}</div>
              <div className="col-span-2 row-start-2 h-3 lg:col-span-1 lg:row-auto"><div className={`h-full rounded-[2px] ${tono.fondo}`} style={{ width: ancho(f.monto, max) }} /></div>
              <div className="truncate text-xs text-ink-soft">{f.cliente ?? <span className="text-faint">sin cliente en la cuenta corriente</span>}</div>
              <div className="truncate text-xs text-muted">{f.documento}</div>
            </div>
          )
        })}
        {lejos.length ? (
          <p className="pt-3 text-[11.5px] text-muted">
            y {lejos.length} {lejos.length === 1 ? 'comprobante' : 'comprobantes'} después de los 30 días por {millones(lejos.reduce((s, f) => s + f.monto, 0))} · el último, el {diaMesAnio(lejos[lejos.length - 1].fecha)}
          </p>
        ) : null}
        {a.vencido.n ? (
          <p className="pt-2 text-[11.5px] text-neg">▲ {a.vencido.n} {a.vencido.n === 1 ? 'comprobante vencido' : 'comprobantes vencidos'} por {millones(a.vencido.total)} · al {diaMesAnio(hoy)}</p>
        ) : null}
      </div>
    </Seccion>
  )
}

function FilaCliente({ f, max, documentos, proximo }: { f: FilaCobranza; max: number; documentos: unknown[] | null; proximo: CobroProximo | null }) {
  const tono = f.tramo ? TONO_BANDA[f.tramo] : { fondo: 'bg-dato-referencia', texto: 'text-faint' }
  // SIN ACCIÓN DEL DÍA, EL PRÓXIMO COBRO (dueño, 21/09/2026): un «—» no dice nada; «cobra el 22/09»
  // sí. Nunca se inventa: si el cliente no tiene documento con fecha, sigue diciendo por qué no hay.
  const sinVerbo = documentos == null ? 'no se pudo leer Cobranzas' : f.evaluado ? null : 'no evaluado'
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 hover:bg-surface-quiet lg:h-[52px] lg:grid-cols-[150px_96px_minmax(0,1fr)_150px_170px] lg:gap-6 lg:py-0">
      <div className="truncate text-[13px] font-medium text-ink">{f.nombre}</div>
      <div className={`whitespace-nowrap text-right text-[13px] font-semibold ${f.estado === 'vencido' ? 'text-neg' : 'text-ink'}`}>{millones(f.saldo)}</div>
      <div className="col-span-2 row-start-2 h-3 lg:col-span-1 lg:row-auto"><div className={`h-full rounded-[2px] ${tono.fondo}`} style={{ width: ancho(f.saldo, max) }} /></div>
      <div className={`text-xs ${tono.texto}`}>{f.rotuloTramo ?? 'sin vencimiento'}</div>
      <div className="flex flex-col gap-0.5 text-right text-xs lg:text-left">
        {f.verbo ? <span className="text-ink-soft">{f.verbo}</span> : proximo ? null : <span className="text-faint">{sinVerbo ?? 'sin acción pendiente'}</span>}
        {proximo
          ? <span className={tonoDeCobro(proximo.dias, proximo.vencido).texto}>cobra el {diaMes(proximo.fecha)} · {cuando(proximo.dias)}</span>
          : <span className="text-faint">sin fecha de cobro</span>}
      </div>
    </div>
  )
}
