// CAJA, NÓMINA Y COBRANZA — las tres lecturas de la empresa, al final del módulo.
//
// Diseño v6: columnas mensuales (caja apilada obra/estructura; nómina con la suba sobre marzo en
// ámbar), barras por área, la banda de antigüedad apilada y la tabla de clientes con el verbo del día.
// Lo que el diseño trae escrito a mano (3.053,5 h, 396 h, «27 de 30») sale acá de los datos o no sale.
import { millones, pctConSigno, pctEntero } from '../services/formato'
import { bandasDeCobranza, caja, cifrasCobranza, cobranza, legajos, leerEgresos, MES_BASE, nomina, seisMesesReales, type FilaCobranza } from '../services/empresa'
import type { ClaveBanda } from '../../clientes/services/reglasCobranza'
import { ancho, Cabecera, ENCABEZADO, rotuloMes, Seccion, SinLectura } from './Piezas'

/**
 * EL RATIO, EN PESOS. «0,41 ×» era incomprensible (dueño, 17/09/2026): un multiplicador no dice de qué.
 * Es plata por plata, así que se escribe como plata —`$ 0,41`— y la nota de abajo dice la frase entera.
 */
const porPesoDeObra = (x: number | null) => (x == null ? null : `$ ${x.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

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

export function VistaCaja({ egresos, periodo }: { egresos: unknown[] | null; periodo: string }) {
  if (!egresos) return <SinLectura que="los egresos" />
  const c = caja(leerEgresos(egresos))
  const max = Math.max(1, ...c.meses.map((m) => m.aObra + m.estructura))
  const areas = [
    { area: 'Obra', monto: c.aObra, tono: 'bg-accent', color: 'text-ink', nota: 'imputado a una obra concreta' },
    ...c.ramas.map((r) => ({ area: r.rotulo, monto: r.total, tono: 'bg-dato-referencia', color: 'text-muted', nota: '' })),
    ...(c.nSinDestino ? [{ area: 'Sin clasificar', monto: c.sinDestino, tono: 'bg-warn', color: 'text-warn', nota: `${c.nSinDestino} filas sin área · esperan destino` }] : []),
  ]
  const maxArea = Math.max(1, ...areas.map((a) => a.monto))
  return (
    <>
      <Cabecera titulo="Caja" detalle={`${periodo} · a dónde fue la plata`}
        cifras={[
          { rotulo: 'salió', valor: millones(c.salio) },
          { rotulo: 'a una obra', valor: millones(c.aObra) },
          { rotulo: 'estructura', valor: millones(c.estructura), tono: 'muted' },
          { rotulo: 'sin destino', valor: c.nSinDestino ? millones(c.sinDestino) : null, falta: 'ninguno', tono: 'warn' },
          { rotulo: 'estructura por cada peso de obra', valor: porPesoDeObra(c.estructuraPorPesoDeObra), falta: '—',
            nota: c.estructuraPorPesoDeObra != null ? `por cada $ 1 que fue a una obra, ${porPesoDeObra(c.estructuraPorPesoDeObra)} fueron a estructura` : undefined },
        ]}
        derecha={c.nSinDestino ? (
          // SIN PANTALLA DE IMPUTACIÓN TODAVÍA: el botón del diseño se muestra, apagado y con la razón.
          <button type="button" disabled title="La imputación de un egreso sin área todavía no tiene pantalla: se corrige en Compras."
            className="h-11 whitespace-nowrap rounded-control bg-marca px-4 text-[12.5px] font-semibold text-accent disabled:cursor-not-allowed disabled:opacity-60 lg:h-[34px]">
            Imputar las {c.nSinDestino} filas sin destino
          </button>
        ) : undefined} />
      {/* EL GRÁFICO NO DECÍA DE QUÉ PERÍODO NI QUÉ ES UNA COLUMNA (dueño, 17/09/2026): lo dice la
          aclaración, que además queda pegada a la leyenda de colores. */}
      <Seccion titulo="Lo que salió, por mes" aclaracion={`${periodo} · cada columna es todo lo que salió de caja ese mes`}
        leyenda={[{ color: 'bg-accent', rotulo: 'a una obra' }, { color: 'bg-dato-referencia', rotulo: 'estructura' }]}>
        <Columnas meses={c.meses.map((m) => ({
          mes: m.mes, valor: millones(m.aObra + m.estructura),
          partes: [{ alto: (m.estructura / max) * 170, clase: 'bg-dato-referencia' }, { alto: (m.aObra / max) * 170, clase: 'bg-accent' }],
        }))} />
      </Seccion>
      <Seccion titulo="Por área" aclaracion="de todo lo que salió, cuánto se llevó cada área" filo>
        <div className="flex flex-col pb-9">
          {areas.map((a) => (
            <div key={a.area} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 hover:bg-surface-quiet lg:h-12 lg:grid-cols-[150px_minmax(0,1fr)_96px_64px_260px] lg:gap-6 lg:py-0">
              <div className={`text-[13px] font-medium ${a.color}`}>{a.area}</div>
              <div className="col-span-3 row-start-2 h-3 lg:col-span-1 lg:row-auto"><div className={`h-full rounded-[2px] ${a.tono}`} style={{ width: ancho(a.monto, maxArea) }} /></div>
              <div className={`text-right text-[13px] font-semibold ${a.color}`}>{millones(a.monto)}</div>
              <div className="text-right text-[11.5px] text-faint">{c.salio > 0 ? pctEntero(a.monto / c.salio) : '—'}</div>
              <div className="hidden truncate text-[11.5px] text-muted lg:block">{a.nota}</div>
            </div>
          ))}
        </div>
      </Seccion>
    </>
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
          // QUÉ SEIS MESES (dueño, 17/09/2026): jul, ago y sep todavía no están liquidados, así que no son
          // los seis últimos del calendario. La nota los nombra.
          { rotulo: seis && seis.meses < 6 ? `últimos ${seis.meses} meses liquidados` : 'seis meses liquidados', valor: seis ? millones(seis.total) : null,
            nota: seis ? `de ${rotuloMes(seis.desde)} a ${rotuloMes(seis.hasta)}` : undefined },
          // QUÉ COMPARA: el costo del mes, no el plantel ni las horas.
          { rotulo: ultimo ? `costo de ${rotuloMes(ultimo.mes)} contra ${rotuloMes(MES_BASE)}` : `costo contra ${rotuloMes(MES_BASE)}`, valor: pctConSigno(ultimo?.contraBase), falta: '—', tono: (ultimo?.contraBase ?? 0) > 0 ? 'warn' : undefined },
          { rotulo: 'plantel', valor: l ? String(l.plantel) : null, nota: 'por pertenencia, no por fecha de egreso' },
          // QUÉ SIGNIFICA «sin repartir» para el dueño: ninguna obra carga su parte de este costo.
          { rotulo: 'repartido a obra', valor: null, falta: 'sin repartir', nota: 'ninguna obra carga todavía su parte de este costo' },
        ]} />
      {/* LOS MESES SIN BARRA PARECEN UN ERROR DE DIBUJO (dueño, 17/09/2026). No lo son: todavía no hay
          costo cerrado que dibujar, y eso se dice acá —sólo cuando efectivamente hay meses así—. */}
      <Seccion titulo="Costo de la nómina, por mes" arriba="pt-8"
        aclaracion={<>
          {base != null ? `en ámbar, lo que subió sobre ${rotuloMes(MES_BASE)} (${millones(base)})` : `sin ${rotuloMes(MES_BASE)} liquidado no hay base`}
          {incompletos ? `. Los ${incompletos === 1 ? 'último mes' : `últimos ${incompletos} meses`} no ${incompletos === 1 ? 'tiene' : 'tienen'} barra porque todavía no está${incompletos === 1 ? '' : 'n'} liquidado${incompletos === 1 ? '' : 's'}: sin costo cerrado no hay nada que dibujar.` : null}
        </>}>
        <Columnas meses={meses.map((m) => {
          // «incompleto» y «estimación» sonaban a defecto del dato; lo que pasa es que el mes no cerró.
          if (m.estado !== 'real' || m.costo == null) return { mes: m.mes, valor: null, nota: m.estado === 'estimacion' ? 'sin liquidar' : 'a medio liquidar', partes: [] }
          const sube = base != null ? Math.max(0, m.costo - base) : 0
          return {
            mes: m.mes, valor: millones(m.costo), color: (m.contraBase ?? 0) > 0.2 ? 'text-warn' : undefined,
            partes: [{ alto: (sube / max) * 170, clase: 'bg-warn' }, { alto: ((m.costo - sube) / max) * 170, clase: 'bg-accent' }],
          }
        })} />
      </Seccion>
      <div className="mt-8 grid grid-cols-2 gap-6 border-t border-line pb-9 pt-6 lg:grid-cols-[180px_repeat(2,minmax(0,1fr))]">
        <div className="col-span-2 pt-1 text-[11.5px] leading-normal text-muted lg:col-span-1">lo que la nómina no puede decir hoy</div>
        {/* «0 de 17 · legajos sin categoría · sin categoría no hay jornal» se leía al revés (dueño,
            17/09/2026): tres negaciones seguidas. Cuando no falta ninguno se dice con la palabra, no
            con un cero —la regla del OS—, y la explicación queda en positivo. */}
        <Hueco valor={l ? (l.sinCategoria ? `${l.sinCategoria} de ${l.plantel}` : `ninguno de ${l.plantel}`) : null}
          texto="legajos sin la categoría cargada · la categoría es la que fija el jornal" tenue />
        <Hueco valor={incompletos ? String(incompletos) : 'ninguno'}
          texto="meses todavía sin liquidar del todo · no entran ni al total ni a la comparación" />
      </div>
    </>
  )
}

function Hueco({ valor, falta = 'sin registrar', texto, tenue = false }: { valor: string | null; falta?: string; texto: string; tenue?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${valor == null || tenue ? 'text-faint' : 'text-ink'}`}>{valor ?? falta}</div>
      <div className="text-[11.5px] text-muted">{texto}</div>
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

export function VistaCobranza({ cuenta, documentos, hoy, periodo }: {
  cuenta: unknown[] | null
  /** Filas de `public.cobranzas` (deuda): de acá sale la acción del día. `null` = no se pudieron leer. */
  documentos: unknown[] | null
  hoy: string
  periodo: string
}) {
  if (!cuenta) return <SinLectura que="la cuenta corriente" />
  const filas = cobranza(cuenta, documentos ?? [], hoy)
  const c = cifrasCobranza(filas)
  // LAS CINCO ZONAS SIEMPRE, con o sin plata (dueño, 17/09/2026): filtrando las vacías quedaba una
  // «barra verde enorme que no informa nada». Lo que informa es justamente que las otras cuatro estén
  // vacías, y eso sólo se ve si se dibujan y se rotulan.
  const bandas = bandasDeCobranza(cuenta)
  const maxSaldo = Math.max(1, ...filas.map((f) => f.saldo))
  return (
    <>
      <Cabecera titulo="Cobranza" detalle={`${periodo} · emitido y no cobrado`}
        cifras={[
          { rotulo: 'por cobrar', valor: millones(c.porCobrar), nota: `${filas.length} ${filas.length === 1 ? 'cliente' : 'clientes'} con saldo` },
          { rotulo: 'a más de 60 días', valor: c.masDe60 > 0 ? millones(c.masDe60) : null, falta: 'ninguno', tono: 'neg', nota: 'vencido hace más de dos meses' },
          { rotulo: 'al día', valor: c.alDia > 0 ? millones(c.alDia) : null, falta: 'ninguno', tono: 'pos', nota: 'todavía no venció' },
        ]} />
      <Seccion titulo="Antigüedad de lo que se debe" aclaracion="en qué zona cae cada peso que se debe · una zona sin color es una zona sin deuda">
        {c.porCobrar > 0 ? (
          <div className="flex h-9 overflow-hidden rounded-[2px] bg-line">
            {/* LA ZONA CON PLATA OCUPA LO QUE LE TOCA; la vacía, lo justo para que su rótulo se lea. */}
            {bandas.map((b) => (
              <div key={b.clave} title={b.monto > 0 ? `${b.rotulo}: ${millones(b.monto)}` : `${b.rotulo}: nada`}
                style={b.monto > 0 ? { flex: `${b.monto} 1 0%` } : { flex: '0 1 76px' }}
                className={`flex min-w-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap border-r border-surface px-1 text-[11.5px] last:border-r-0 ${b.monto > 0 ? `text-surface ${TONO_BANDA[b.clave].fondo}` : 'text-faint'}`}>
                {b.monto > 0 ? <span className="truncate font-semibold tabular-nums">{millones(b.monto)}</span> : null}
                <span className="truncate opacity-85">{b.rotulo}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-faint">nada por cobrar</p>}
      </Seccion>
      <Seccion titulo="Por cliente" filo>
        <div className="flex flex-col pb-9">
          <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[150px_minmax(0,1fr)_96px_150px_170px] ${ENCABEZADO}`}>
            {/* «HOY» no decía de qué era la columna, y «ANTIGÜEDAD» no decía antigüedad de qué. */}
            <div>Cliente</div><div /><div className="text-right">Saldo</div><div>Lo más viejo</div><div>Qué hacer hoy</div>
          </div>
          {filas.map((f) => <FilaCliente key={f.clienteId} f={f} max={maxSaldo} documentos={documentos} />)}
        </div>
      </Seccion>
    </>
  )
}

function FilaCliente({ f, max, documentos }: { f: FilaCobranza; max: number; documentos: unknown[] | null }) {
  const tono = f.tramo ? TONO_BANDA[f.tramo] : { fondo: 'bg-dato-referencia', texto: 'text-faint' }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-2.5 hover:bg-surface-quiet lg:h-[52px] lg:grid-cols-[150px_minmax(0,1fr)_96px_150px_170px] lg:gap-6 lg:py-0">
      <div className="truncate text-[13px] font-medium text-ink">{f.nombre}</div>
      <div className="col-span-2 row-start-2 h-3 lg:col-span-1 lg:row-auto"><div className={`h-full rounded-[2px] ${tono.fondo}`} style={{ width: ancho(f.saldo, max) }} /></div>
      <div className={`whitespace-nowrap text-right text-[13px] font-semibold ${f.estado === 'vencido' ? 'text-neg' : 'text-ink'}`}>{millones(f.saldo)}</div>
      <div className={`text-xs ${tono.texto}`}>{f.rotuloTramo ?? 'sin fecha de vencimiento'}</div>
      <div className="text-right text-xs text-ink-soft lg:text-left">
        {f.verbo ?? <span className="text-faint">{documentos == null ? 'no se pudo leer Cobranzas' : f.evaluado ? '—' : 'no evaluado'}</span>}
      </div>
    </div>
  )
}
