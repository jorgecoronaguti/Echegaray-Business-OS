// NÓMINA Y COBRANZA — dos lecturas de la empresa, al final del módulo. (Caja vive en VistaCaja.tsx:
// desde el 18/09/2026 es la pestaña CAJA leída de su espejo, no un cálculo sobre egresos.)
//
// Diseño v6: columnas mensuales (caja apilada obra/estructura; nómina con la suba sobre marzo en
// ámbar), barras por área, la banda de antigüedad apilada y la tabla de clientes con el verbo del día.
// Lo que el diseño trae escrito a mano (3.053,5 h, 396 h, «27 de 30») sale acá de los datos o no sale.
import { millones, pctConSigno } from '../services/formato'
import { bandasDeCobranza, cifrasCobranza, cobranza, legajos, MES_BASE, nomina, seisMesesReales, type FilaCobranza } from '../services/empresa'
import type { ClaveBanda } from '../../clientes/services/reglasCobranza'
import { documentosDeCobranzas } from '../../clientes/services/documentoDeCobranza'
import { diaMes, diaMesAnio } from '../../clientes/services/cobranzaFormato'
import { agendaDeCobro, cuando, proximoPorCliente, type AgendaDeCobro, type CobroProximo } from '../services/cobrosProximos'
import { ancho, Cabecera, ENCABEZADO, rotuloMes, Seccion, SinLectura } from './Piezas'
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

export function VistaNomina({ filas, quincenas, personas, rango, periodo, hoy }: {
  filas: unknown[] | null
  quincenas: unknown[] | null
  personas: unknown[] | null
  rango: { desde: string | null; hasta: string | null }
  periodo: string
  hoy: string
}) {
  if (!filas) return <SinLectura que="la nómina" />
  const { base, meses: todos } = nomina(filas, rango, quincenas ?? [])
  // LOS MESES QUE VIENEN NO SON NÓMINA: `nomina_por_mes` proyecta hasta diciembre. Se dibuja hasta hoy.
  const meses = todos.filter((m) => m.mes <= hoy.slice(0, 7))
  const ultimo = meses.filter((m) => m.estado === 'real').at(-1)
  const seis = seisMesesReales(meses)
  const incompletos = meses.filter((m) => m.estado !== 'real').length
  const l = personas ? legajos(personas) : null
  const max = Math.max(1, ...meses.map((m) => (m.estado === 'real' ? m.costo ?? 0 : 0)))
  return (
    <>
      <Cabecera titulo="Nómina" detalle={`${periodo} · sueldos y cargas`}
        cifras={[
          { rotulo: seis && seis.meses < 6 ? `últimos ${seis.meses} meses liquidados` : 'seis meses', valor: seis ? millones(seis.total) : null },
          { rotulo: ultimo ? `${rotuloMes(ultimo.mes)} contra ${rotuloMes(MES_BASE)}` : `contra ${rotuloMes(MES_BASE)}`, valor: pctConSigno(ultimo?.contraBase), falta: '—', tono: (ultimo?.contraBase ?? 0) > 0 ? 'warn' : undefined },
          { rotulo: 'plantel', valor: l ? String(l.plantel) : null, nota: 'por pertenencia' },
          { rotulo: 'repartido a obra', valor: null, falta: 'sin repartir' },
        ]} />
      <Seccion titulo="Costo de la nómina, por mes" aclaracion={base != null ? `en ámbar, lo que subió sobre ${rotuloMes(MES_BASE)} (${millones(base)})` : `sin ${rotuloMes(MES_BASE)} liquidado no hay base`} arriba="pt-8">
        <Columnas meses={meses.map((m) => {
          if (m.estado !== 'real' || m.costo == null) return { mes: m.mes, valor: null, nota: m.estado === 'estimacion' ? 'estimación' : 'incompleto', partes: [] }
          const sube = base != null ? Math.max(0, m.costo - base) : 0
          return {
            mes: m.mes, valor: millones(m.costo), color: (m.contraBase ?? 0) > 0.2 ? 'text-warn' : undefined,
            partes: [{ alto: (sube / max) * 170, clase: 'bg-warn' }, { alto: ((m.costo - sube) / max) * 170, clase: 'bg-accent' }],
          }
        })} />
      </Seccion>
      {/* ═══ ES UNA SECCIÓN, CON SU TÍTULO Y SU FILO (diseño v9) ═══
          Era una línea suelta en minúscula de 11.5 px, sin `<h2>` y sin filo sobre las tarjetas, y
          el valor se dibujaba a 22 px en gris: «0 de 17» salía enorme y apagado donde el diseño
          pone el dato chico y en tinta. Se usa el mismo dibujo de huecos que el Resumen. */}
      <Seccion titulo="Lo que no se puede decir" filo>
        <div className="grid gap-6 pb-9 sm:grid-cols-2">
          <Hueco que={l ? `${l.sinCategoria} de ${l.plantel}` : null} falta="sin registrar"
            porque="legajos sin categoría" destraba="sin categoría no hay jornal" />
          <Hueco que={String(incompletos)} porque="meses sin liquidar del todo" destraba="no entran a la suba" />
        </div>
      </Seccion>
    </>
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
