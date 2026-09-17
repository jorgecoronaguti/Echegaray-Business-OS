// CAJA, NÓMINA Y COBRANZA — las tres lecturas de la empresa.
import type { ReactNode } from 'react'
import { millones, pctConSigno, pctEntero } from '../services/formato'
import { caja, cifrasCobranza, cobranza, legajos, MES_BASE, nomina, leerEgresos, POSICION_TRAMO, seisMesesReales } from '../services/empresa'
import { Ausente, Cifras, SinLectura, Subtitulo, Titulo } from './Piezas'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`

/** Una polilínea en un viewBox 0–100 con los rótulos de mes debajo, en HTML. */
function Lineas({ meses, series, arriba }: {
  meses: string[]
  series: { valores: (number | null)[]; clase: string; punteada?: boolean }[]
  arriba?: ReactNode
}) {
  const tope = Math.max(1, ...series.flatMap((s) => s.valores.map((v) => v ?? 0))) * 1.1
  const x = (i: number) => (meses.length === 1 ? 50 : (i / (meses.length - 1)) * 100)
  const y = (v: number) => 100 - (v / tope) * 100
  return (
    <div className="mb-8">
      {arriba}
      <div className="relative h-48 border-b border-line">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden>
          {series.map((s, k) => {
            const puntos = s.valores.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ')
            return <polyline key={k} points={puntos} fill="none" className={s.clase} strokeWidth="2"
              vectorEffect="non-scaling-stroke" strokeDasharray={s.punteada ? '4 4' : undefined} />
          })}
        </svg>
      </div>
      <div className="relative mt-1 h-4 text-xs text-faint">
        {meses.map((m, i) => (
          // Los extremos se alinean hacia adentro: centrados, el primero y el último salían del ancho de la página.
          <span key={m} className={`absolute whitespace-nowrap ${i === 0 && meses.length > 1 ? '' : i === meses.length - 1 && meses.length > 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${x(i)}%` }}>{rotuloMes(m)}</span>
        ))}
      </div>
    </div>
  )
}

export function VistaCaja({ egresos, periodo }: { egresos: unknown[] | null; periodo: string }) {
  if (!egresos) return <><Titulo titulo="Caja" linea={periodo} /><SinLectura que="los egresos" /></>
  const c = caja(leerEgresos(egresos))
  const parte = (v: number) => (c.salio > 0 ? pctEntero(v / c.salio) : null)
  return (
    <>
      <Titulo titulo="Caja" linea={`${egresos.length} egresos · ${periodo} · por fecha del egreso`} />
      <Cifras cifras={[
        { rotulo: 'Salió', valor: millones(c.salio) },
        { rotulo: 'A una obra', valor: millones(c.aObra) },
        { rotulo: 'Estructura', valor: millones(c.estructura) },
        { rotulo: 'Sin destino', valor: c.nSinDestino ? millones(c.sinDestino) : null, falta: 'ninguno', tono: c.nSinDestino ? 'warn' : undefined },
        { rotulo: 'Estructura por peso de obra', valor: c.estructuraPorPesoDeObra == null ? null : `$ ${c.estructuraPorPesoDeObra.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`, falta: '—' },
      ]} />
      <Lineas meses={c.meses.map((m) => m.mes)}
        arriba={<p className="mb-2 flex gap-4 text-xs text-muted"><span><span className="mr-1 inline-block h-0.5 w-4 bg-accent align-middle" />A una obra</span><span><span className="mr-1 inline-block h-0.5 w-4 bg-dato-materiales align-middle" />Estructura</span></p>}
        series={[
          { valores: c.meses.map((m) => m.aObra), clase: 'stroke-accent' },
          { valores: c.meses.map((m) => m.estructura), clase: 'stroke-dato-materiales' },
        ]} />
      <Subtitulo derecha="% de lo que salió">De dónde salió</Subtitulo>
      <ul className="text-sm tabular-nums">
        <Rama rotulo="Salió" v={millones(c.salio)} p="100 %" nivel={0} />
        <Rama rotulo="A una obra" v={millones(c.aObra)} p={parte(c.aObra)} nivel={1} />
        <Rama rotulo="Estructura" v={millones(c.estructura)} p={parte(c.estructura)} nivel={1} />
        {c.ramas.map((r) => <Rama key={r.rotulo} rotulo={r.rotulo} v={millones(r.total)} p={parte(r.total)} nivel={2} />)}
        <Rama rotulo="Sin destino" v={c.nSinDestino ? millones(c.sinDestino) : null} p={c.nSinDestino ? parte(c.sinDestino) : null} nivel={1} />
      </ul>
      <div className="mt-6">
        <button type="button" disabled title="La imputación de un egreso sin área todavía no tiene pantalla: se corrige en Compras."
          className="h-11 rounded-control bg-marca px-4 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50">
          Imputar las {c.nSinDestino} filas sin destino
        </button>
      </div>
    </>
  )
}

function Rama({ rotulo, v, p, nivel }: { rotulo: string; v: string | null; p: string | null; nivel: 0 | 1 | 2 }) {
  const sangria = ['', 'pl-6', 'pl-12'][nivel]
  return (
    <li className={`flex h-10 items-center gap-3 border-b border-line-hairline ${sangria}`}>
      <span className={`min-w-0 flex-1 truncate ${nivel === 0 ? 'font-semibold text-ink' : nivel === 1 ? 'text-ink' : 'text-muted'}`}>{rotulo}</span>
      <span className="text-ink">{v ?? <Ausente>ninguno</Ausente>}</span>
      <span className="w-14 text-right text-faint">{p ?? '—'}</span>
    </li>
  )
}

export function VistaNomina({ filas, quincenas, personas, rango, periodo }: {
  filas: unknown[] | null
  quincenas: unknown[] | null
  personas: unknown[] | null
  rango: { desde: string | null; hasta: string | null }
  periodo: string
}) {
  if (!filas) return <><Titulo titulo="Nómina" linea={periodo} /><SinLectura que="la nómina" /></>
  const { base, meses } = nomina(filas, rango, quincenas ?? [])
  const reales = meses.filter((m) => m.estado === 'real')
  const ultimo = reales.at(-1)
  const seis = seisMesesReales(meses)
  const incompletos = meses.filter((m) => m.estado === 'incompleto').length
  const l = personas ? legajos(personas) : null
  return (
    <>
      <Titulo titulo="Nómina" linea={`${reales.length} meses liquidados${incompletos ? ` · ${incompletos} incompleto${incompletos === 1 ? '' : 's'}` : ''} · ${periodo} · base ${rotuloMes(MES_BASE)} · jornales más cargas sociales`} />
      <Cifras cifras={[
        { rotulo: seis && seis.meses < 6 ? `Últimos ${seis.meses} meses reales` : 'Últimos seis meses', valor: seis ? millones(seis.total) : null },
        { rotulo: ultimo ? `${rotuloMes(ultimo.mes)} contra ${rotuloMes(MES_BASE)}` : 'Último contra base', valor: pctConSigno(ultimo?.contraBase), falta: '—' },
        { rotulo: 'Plantel', valor: l ? String(l.plantel) : null },
        { rotulo: 'Sin repartir', valor: null, falta: 'sin registrar' },
      ]} />
      <Lineas meses={reales.map((m) => m.mes)}
        arriba={<p className="mb-2 text-xs text-muted">Costo mensual · la punteada es {rotuloMes(MES_BASE)} ({millones(base) ?? 'sin registrar'})</p>}
        series={[
          { valores: reales.map(() => base), clase: 'stroke-dato-referencia', punteada: true },
          { valores: reales.map((m) => m.costo), clase: 'stroke-accent' },
        ]} />
      <ul className="mb-8 grid grid-cols-3 gap-x-6 text-sm tabular-nums sm:grid-cols-6">
        {meses.map((m) => (
          <li key={m.mes} className="border-b border-line-hairline py-2">
            <span className="block text-xs text-faint">{rotuloMes(m.mes)}</span>
            {m.estado === 'estimacion' ? <Ausente>estimación</Ausente> : m.estado === 'incompleto' ? <Ausente>incompleto · {millones(m.costo) ?? '—'}</Ausente> : <span className={(m.contraBase ?? 0) > 0.12 ? 'text-warn' : 'text-ink'}>{pctConSigno(m.contraBase) ?? '—'}</span>}
          </li>
        ))}
      </ul>
      <Subtitulo derecha={l ? `${l.conCategoria} con categoría · ${l.sinCategoria} sin categoría` : undefined}>Legajos</Subtitulo>
      {l ? (
        <div className="flex max-w-md flex-wrap gap-1" aria-label={`${l.plantel} legajos`}>
          {Array.from({ length: l.plantel }, (_, i) => (
            <span key={i} className={`size-4 rounded-sm ${i < l.conCategoria ? 'bg-accent' : 'border border-warn'}`} />
          ))}
        </div>
      ) : <SinLectura que="los legajos" />}
    </>
  )
}

const ZONAS = ['0–30 días', '31–60', '61–90', '+90']

export function VistaCobranza({ cuenta, periodo, gastado }: {
  cuenta: unknown[] | null
  periodo: string
  gastado: number | null
}) {
  if (!cuenta) return <><Titulo titulo="Cobranza" linea={periodo} /><SinLectura que="la cuenta corriente" /></>
  const filas = cobranza(cuenta)
  const c = cifrasCobranza(filas)
  const maxSaldo = Math.max(1, ...filas.map((f) => f.saldo))
  return (
    <>
      <Titulo titulo="Cobranza" linea={`${filas.length} clientes con saldo · ${periodo} por emisión · antigüedad por el vencimiento de Cobranzas`} />
      <Cifras cifras={[
        { rotulo: 'Por cobrar', valor: millones(c.porCobrar) },
        { rotulo: 'A más de 60 días', valor: c.masDe60 > 0 ? millones(c.masDe60) : null, falta: 'ninguno', tono: c.masDe60 > 0 ? 'neg' : undefined },
        { rotulo: 'Al día', valor: millones(c.alDia), tono: c.alDia > 0 ? 'pos' : undefined },
        { rotulo: 'Contra lo gastado', valor: gastado ? pctEntero(c.porCobrar / gastado) : null, falta: '—' },
      ]} />
      <div className="relative mb-8 h-40">
        <div className="absolute inset-0 grid grid-cols-4 border-y border-line">
          {ZONAS.map((z, i) => <div key={z} className={`border-line pt-1 text-xs text-faint ${i ? 'border-l' : ''} pl-2`}>{z}</div>)}
        </div>
        {filas.filter((f) => f.tramo != null).map((f) => {
          const size = 12 + 36 * Math.sqrt(f.saldo / maxSaldo)
          return (
            <span key={f.clienteId} title={`${f.nombre}: ${millones(f.saldo)} · ${f.rotuloTramo}`}
              className={`absolute top-1/2 -translate-y-1/2 rounded-full border-2 ${f.tramo === 'por_vencer' ? '' : '-translate-x-1/2'} ${f.estado === 'vencido' ? 'border-neg bg-neg-soft' : 'border-pos bg-pos-soft'}`}
              style={{ left: `${POSICION_TRAMO[f.tramo ?? 'por_vencer'] * 100}%`, width: size, height: size }} />
          )
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead className="text-xs text-faint">
            <tr className="border-b border-line-strong text-right">
              <th className="py-2 text-left font-normal">Cliente</th><th className="font-normal">Saldo</th>
              <th className="font-normal">Antigüedad</th><th className="pl-6 text-left font-normal">Hoy</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clienteId} className="h-fila border-b border-line-hairline text-right">
                <td className="text-left text-ink">{f.nombre}</td>
                <td className={f.estado === 'vencido' ? 'text-neg' : 'text-ink'}>{millones(f.saldo)}</td>
                <td>{f.rotuloTramo ?? <Ausente>sin vencimiento</Ausente>}</td>
                <td className="pl-6 text-left">{f.verbo ?? <Ausente>nada pendiente hoy</Ausente>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
