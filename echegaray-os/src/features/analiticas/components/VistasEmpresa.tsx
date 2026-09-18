// NÓMINA Y COBRANZA — dos lecturas de la empresa, al final del módulo. (Caja vive en VistaCaja.tsx:
// desde el 18/09/2026 es la pestaña CAJA leída de su espejo, no un cálculo sobre egresos.)
//
// Diseño v6: columnas mensuales (caja apilada obra/estructura; nómina con la suba sobre marzo en
// ámbar), barras por área, la banda de antigüedad apilada y la tabla de clientes con el verbo del día.
// Lo que el diseño trae escrito a mano (3.053,5 h, 396 h, «27 de 30») sale acá de los datos o no sale.
import { millones, pctConSigno } from '../services/formato'
import { bandasDeCobranza, cifrasCobranza, cobranza, legajos, MES_BASE, nomina, seisMesesReales, type FilaCobranza } from '../services/empresa'
import type { ClaveBanda } from '../../clientes/services/reglasCobranza'
import { ancho, Cabecera, ENCABEZADO, rotuloMes, Seccion, SinLectura } from './Piezas'


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
          { rotulo: 'plantel', valor: l ? String(l.plantel) : null, nota: 'por pertenencia, no por fecha de egreso' },
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
      <div className="mt-8 grid grid-cols-2 gap-6 border-t border-line pb-9 pt-6 lg:grid-cols-[180px_repeat(2,minmax(0,1fr))]">
        <div className="col-span-2 pt-1 text-[11.5px] leading-normal text-muted lg:col-span-1">lo que la nómina no puede decir hoy</div>
        <Hueco valor={l ? `${l.sinCategoria} de ${l.plantel}` : null} texto="legajos sin categoría · sin categoría no hay jornal" tenue />
        <Hueco valor={String(incompletos)} texto="meses sin liquidar del todo · no entran a la suba" />
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
  const bandas = bandasDeCobranza(cuenta).filter((b) => b.monto > 0)
  const maxSaldo = Math.max(1, ...filas.map((f) => f.saldo))
  return (
    <>
      <Cabecera titulo="Cobranza" detalle={`${periodo} · emitido y no cobrado`}
        cifras={[
          { rotulo: 'por cobrar', valor: millones(c.porCobrar) },
          { rotulo: 'a más de 60 días', valor: c.masDe60 > 0 ? millones(c.masDe60) : null, falta: 'ninguno', tono: 'neg' },
          { rotulo: 'al día', valor: c.alDia > 0 ? millones(c.alDia) : null, falta: 'ninguno', tono: 'pos' },
        ]} />
      <Seccion titulo="Antigüedad de lo que se debe">
        {bandas.length ? (
          <div className="flex h-9 overflow-hidden rounded-[2px] bg-line">
            {bandas.map((b) => (
              <div key={b.clave} title={`${b.rotulo}: ${millones(b.monto)}`} style={{ width: ancho(b.monto, c.porCobrar) }}
                className={`flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap border-r border-surface text-[11.5px] text-surface last:border-r-0 ${TONO_BANDA[b.clave].fondo}`}>
                <span className="font-semibold">{millones(b.monto)}</span><span className="opacity-85">{b.rotulo}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-faint">nada por cobrar</p>}
      </Seccion>
      <Seccion titulo="Por cliente" filo>
        <div className="flex flex-col pb-9">
          <div className={`hidden h-9 items-center gap-6 border-b border-line lg:grid lg:grid-cols-[150px_minmax(0,1fr)_96px_150px_170px] ${ENCABEZADO}`}>
            <div>Cliente</div><div /><div className="text-right">Saldo</div><div>Antigüedad</div><div>Hoy</div>
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
      <div className={`text-xs ${tono.texto}`}>{f.rotuloTramo ?? 'sin vencimiento'}</div>
      <div className="text-right text-xs text-ink-soft lg:text-left">
        {f.verbo ?? <span className="text-faint">{documentos == null ? 'no se pudo leer Cobranzas' : f.evaluado ? '—' : 'no evaluado'}</span>}
      </div>
    </div>
  )
}
