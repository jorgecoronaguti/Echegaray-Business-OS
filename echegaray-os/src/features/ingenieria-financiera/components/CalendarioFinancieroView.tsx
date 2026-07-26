'use client'

import { useMemo, useState } from 'react'
import type { CalendarioFinanciero, DiaCalendario, NivelRiesgo } from '../types'
import type { EstrategiaFinanciera } from '../types/estrategia'
import { EstrategiaHero, EstrategiaDetalle, AccionesDelDia, accionesDeEstrategia } from './EstrategiaFinancieraPanel'
import { money, money0, moneyK } from '@/shared/utils/format'
import { Card, Eyebrow, Badge, SegmentedControl, StepNav, Callout, type Tono } from '@/shared/components/ui'

const parseDia = (iso: string) => new Date(`${iso}T00:00:00`)
const nombreDia = (iso: string) => parseDia(iso).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })
const numDia = (iso: string) => parseDia(iso).getDate()
// `capitalize` de Tailwind capitaliza CADA palabra y dejaba "Jueves, 23 De Julio" y "Julio De
// 2026". En español va sólo la primera letra: se hace acá, una vez, y ninguna clase lo repite.
const may = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// El riesgo se ENCODEA en color y forma, no sólo en número: un día que cierra en rojo se lee de un
// vistazo. Tonos semánticos del sistema visual (no el acento de marca).
const RIESGO: Record<NivelRiesgo, { tono: Tono; borde: string; valor: string }> = {
  bajo: { tono: 'pos', borde: 'border-line', valor: 'text-ink' },
  medio: { tono: 'warn', borde: 'border-warn/40', valor: 'text-warn' },
  alto: { tono: 'neg', borde: 'border-neg/50', valor: 'text-neg' },
}

type Vista = 'mensual' | 'semanal' | 'diaria'
const VISTAS = [
  { value: 'mensual' as const, label: 'Mensual' },
  { value: 'semanal' as const, label: 'Semanal' },
  { value: 'diaria' as const, label: 'Diaria' },
]

export function CalendarioFinancieroView({
  cal,
  estrategia,
}: {
  cal: CalendarioFinanciero
  estrategia?: EstrategiaFinanciera
}) {
  const dias = useMemo(() => cal.dias || [], [cal.dias])
  const porFecha = useMemo(() => new Map(dias.map((d) => [d.fecha, d])), [dias])
  const [vista, setVista] = useState<Vista>('mensual')
  const [sel, setSel] = useState<string>(dias[0]?.fecha ?? '')
  const diaSel = porFecha.get(sel) ?? dias[0]

  // La MANIFESTACIÓN de la estrategia en el día: las acciones cuya fecha == el día seleccionado.
  // El motor da UNA estrategia global; el día sólo filtra qué hace hoy. No inventa nada.
  const todasLasAcciones = useMemo(
    () => (estrategia?.estado === 'ok' ? accionesDeEstrategia(estrategia) : []),
    [estrategia],
  )
  const accionesDelDia = useMemo(() => todasLasAcciones.filter((a) => a.fecha === sel), [todasLasAcciones, sel])
  const hayEstrategia = estrategia && estrategia.estado === 'ok'

  return (
    <div className="space-y-5">
      {/* PROTAGONISTA: la estrategia que el OS está ejecutando, de un vistazo. */}
      {estrategia && <EstrategiaHero e={estrategia} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_384px]">
        {/* EL CALENDARIO sigue siendo la interfaz principal de navegación. */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <SegmentedControl options={VISTAS} value={vista} onChange={setVista} ariaLabel="Vista del calendario" />
            <div className="text-[11px] text-faint">
              {dias.length} días · caja inicial <span className="tabular-nums">{money(cal.caja_inicial)}</span>
            </div>
          </div>

          {vista === 'mensual' && <VistaMensual dias={dias} porFecha={porFecha} sel={sel} onSel={setSel} />}
          {vista === 'semanal' && <VistaSemanal dias={dias} sel={sel} onSel={setSel} />}
          {vista === 'diaria' && diaSel && <VistaLista dias={[diaSel]} sel={sel} onSel={setSel} />}

          {cal.sin_fecha && cal.sin_fecha.n > 0 && (
            <Callout tono="warn" className="mt-3">
              {cal.sin_fecha.n} factura{cal.sin_fecha.n > 1 ? 's' : ''} pendiente{cal.sin_fecha.n > 1 ? 's' : ''} de pago por{' '}
              <span className="tabular-nums">{money(cal.sin_fecha.monto)}</span> no aparece{cal.sin_fecha.n > 1 ? 'n' : ''} en ningún día:{' '}
              {cal.sin_fecha.fuente.toLowerCase()}.
            </Callout>
          )}
        </div>

        <aside className="space-y-4">
          {/* PRINCIPAL del día seleccionado: qué hace hoy la estrategia. */}
          {hayEstrategia && <AccionesDelDia acciones={accionesDelDia} />}
          {/* SECUNDARIO: los movimientos, saldo y composición del día — demotados y colapsados. */}
          {diaSel && <PanelDiaSecundario dia={diaSel} abiertoPorDefecto={!hayEstrategia} />}
          <Recomendaciones cal={cal} />
        </aside>
      </div>

      {/* LA ESTRATEGIA EN DETALLE (progresivo): por qué, alternativas, beneficio, riesgos (global). */}
      {estrategia && <EstrategiaDetalle e={estrategia} />}
    </div>
  )
}

function VistaMensual({
  dias, porFecha, sel, onSel,
}: { dias: DiaCalendario[]; porFecha: Map<string, DiaCalendario>; sel: string; onSel: (f: string) => void }) {
  // Los meses que el calendario realmente cubre. La navegación no inventa meses vacíos: se mueve
  // entre los que tienen días, y se frena en los extremos.
  const meses = useMemo(() => {
    const s = new Set(dias.map((d) => d.fecha.slice(0, 7)))
    return [...s].sort()
  }, [dias])
  const [i, setI] = useState(0)
  if (!dias.length) return null
  const actual = meses[Math.min(i, meses.length - 1)]
  const [anio, mesNum] = actual.split('-').map(Number)
  const mes = mesNum - 1
  const primero = new Date(anio, mes, 1)
  const finMes = new Date(anio, mes + 1, 0).getDate()
  const offset = (new Date(anio, mes, 1).getDay() + 6) % 7 // lun=0
  const celdas: (DiaCalendario | null)[] = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= finMes; d++) {
    const iso = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    celdas.push(porFecha.get(iso) ?? ({ fecha: iso } as DiaCalendario))
  }
  const titulo = primero.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return (
    <Card padding="md">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">{may(titulo)}</div>
        <StepNav
          prevLabel="Mes anterior"
          nextLabel="Mes siguiente"
          onPrev={() => setI(i - 1)}
          onNext={() => setI(i + 1)}
          prevDisabled={i <= 0}
          nextDisabled={i >= meses.length - 1}
        />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-faint">
        {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => <div key={d} className="pb-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((c, idx) => {
          if (!c) return <div key={idx} />
          const activo = typeof c.saldo_final === 'number'
          const r = activo ? RIESGO[c.riesgo] : { tono: 'neutral' as Tono, borde: 'border-line', valor: 'text-faint' }
          const seleccionado = c.fecha === sel
          return (
            <button
              key={c.fecha}
              disabled={!activo}
              onClick={() => onSel(c.fecha)}
              className={`min-h-[66px] rounded-control border p-1.5 text-left transition ${r.borde} ${
                seleccionado ? 'ring-2 ring-accent ring-offset-1' : ''
              } ${activo ? 'bg-surface hover:border-line-strong hover:bg-surface-quiet' : 'bg-surface-quiet/50'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-medium ${activo ? 'text-muted' : 'text-faint/60'}`}>{numDia(c.fecha)}</span>
                {activo && c.recomendaciones > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
              </div>
              {activo && <div className={`mt-1 text-[12px] font-semibold tabular-nums ${r.valor}`}>{money(c.saldo_final)}</div>}
              {activo && (c.ingresos > 0 || c.egresos > 0) && (
                <div className="mt-0.5 flex flex-wrap gap-x-1 text-[10px] tabular-nums">
                  {c.ingresos > 0 && <span className="text-pos">{moneyK(c.ingresos)}</span>}
                  {c.egresos > 0 && <span className="text-neg">{moneyK(-c.egresos)}</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function VistaSemanal({ dias, sel, onSel }: { dias: DiaCalendario[]; sel: string; onSel: (f: string) => void }) {
  const [s, setS] = useState(0)
  const semanas = Math.max(1, Math.ceil(dias.length / 7))
  const i = Math.min(s, semanas - 1)
  const tramo = dias.slice(i * 7, i * 7 + 7)
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink">Semana {i + 1} de {semanas}</div>
        <StepNav
          prevLabel="Semana anterior"
          nextLabel="Semana siguiente"
          onPrev={() => setS(i - 1)}
          onNext={() => setS(i + 1)}
          prevDisabled={i <= 0}
          nextDisabled={i >= semanas - 1}
        />
      </div>
      <VistaLista dias={tramo} sel={sel} onSel={onSel} />
    </div>
  )
}

function VistaLista({ dias, sel, onSel }: { dias: DiaCalendario[]; sel: string; onSel: (f: string) => void }) {
  return (
    <div className="space-y-2">
      {dias.map((d) => {
        const r = RIESGO[d.riesgo]
        return (
          <button
            key={d.fecha}
            onClick={() => onSel(d.fecha)}
            className={`flex w-full items-center justify-between rounded-card border bg-surface p-4 text-left shadow-card transition hover:bg-surface-quiet ${r.borde} ${
              d.fecha === sel ? 'ring-2 ring-accent ring-offset-1' : ''
            }`}
          >
            <div>
              <div className="text-[13px] font-medium text-ink">{may(nombreDia(d.fecha))}</div>
              <div className="mt-1 flex gap-3 text-[12px] tabular-nums text-muted">
                <span>inicial {money(d.saldo_inicial)}</span>
                <span className="text-pos">+{money0(d.ingresos)}</span>
                <span className="text-neg">−{money0(d.egresos)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-semibold tabular-nums ${r.valor}`}>{money(d.saldo_final)}</div>
              <Badge tono={r.tono} uppercase className="mt-1">{d.riesgo}</Badge>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// Los movimientos y saldo del día son SECUNDARIOS frente a la estrategia: van colapsados por defecto
// cuando hay estrategia (el foco es "qué hace hoy la estrategia", no el flujo de fondos crudo). Sin
// estrategia disponible, se abre por defecto para no ocultar la única lectura del día.
function PanelDiaSecundario({ dia, abiertoPorDefecto }: { dia: DiaCalendario; abiertoPorDefecto: boolean }) {
  const r = RIESGO[dia.riesgo]
  return (
    <details open={abiertoPorDefecto} className="group rounded-card border border-line bg-surface shadow-card [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 transition hover:bg-surface-quiet">
        <div className="min-w-0">
          <Eyebrow>Movimientos y saldo del día</Eyebrow>
          <div className="mt-0.5 truncate text-[13px] font-medium text-ink-soft">{may(nombreDia(dia.fecha))}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-[13px] font-semibold tabular-nums ${r.valor}`}>{money(dia.saldo_final)}</span>
          <span className="text-faint transition group-open:rotate-180">⌄</span>
        </div>
      </summary>
      <div className="border-t border-line p-4 pt-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Fila k="Saldo inicial" v={money(dia.saldo_inicial)} />
          <Fila k="Saldo final" v={money(dia.saldo_final)} destacado tono={r.valor} />
          <Fila k="Ingresos" v={money0(dia.ingresos)} tono="text-pos" />
          <Fila k="Egresos" v={money0(dia.egresos)} tono="text-neg" />
        </dl>

        {(dia.cheques > 0 || dia.impuestos > 0 || dia.cargas_sociales > 0 || dia.obligaciones > 0 || dia.cobranzas > 0) && (
          <div className="mt-3 border-t border-line pt-3">
            <Eyebrow className="mb-2">Composición del día</Eyebrow>
            <div className="space-y-1">
              {dia.cobranzas > 0 && <Renglon k="Cobranzas" v={money(dia.cobranzas)} tono="text-pos" />}
              {dia.cheques > 0 && <Renglon k="Cheques" v={money(dia.cheques)} />}
              {dia.cargas_sociales > 0 && <Renglon k="Cargas sociales" v={money(dia.cargas_sociales)} />}
              {dia.impuestos > 0 && <Renglon k="Impuestos" v={money(dia.impuestos)} />}
              {dia.obligaciones > 0 && <Renglon k="Otras obligaciones" v={money(dia.obligaciones)} />}
              {dia.descubierto_utilizado > 0 && <Renglon k="Descubierto usado" v={money(dia.descubierto_utilizado)} tono="text-neg" />}
            </div>
          </div>
        )}

        {dia.movimientos.length > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <Eyebrow className="mb-2">Movimientos</Eyebrow>
            <ul className="space-y-2">
              {dia.movimientos.map((m, i) => (
                <li key={i} className="flex items-start justify-between gap-2 text-[12px]">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-soft">{m.proveedor || m.cliente || m.detalle || m.categoria}</div>
                    <div className="truncate text-faint">{[m.obra, m.medio, m.origen].filter(Boolean).join(' · ') || m.categoria}</div>
                    {m.vencida && (
                      <div className="mt-0.5 text-[11px] font-medium text-neg">
                        vencida el {m.vence_original ? parseDia(m.vence_original).toLocaleDateString('es-AR') : '—'}
                      </div>
                    )}
                  </div>
                  <span className={`shrink-0 font-medium tabular-nums ${m.tipo === 'ingreso' ? 'text-pos' : 'text-neg'}`}>
                    {m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

function Recomendaciones({ cal }: { cal: CalendarioFinanciero }) {
  const recs = cal.recomendaciones || []
  if (!recs.length) return null
  return (
    <Card padding="md">
      <Eyebrow>Acciones recomendadas</Eyebrow>
      <ul className="mt-3 space-y-3">
        {recs.map((r, i) => (
          <li key={i} className="border-l-2 border-accent pl-3">
            <div className="flex items-center gap-2">
              <Badge tono={r.prioridad === 'alta' ? 'neg' : 'neutral'} uppercase>{r.prioridad}</Badge>
              <span className="text-[13px] font-medium text-ink-soft">{r.titulo}</span>
            </div>
            <p className="mt-1 text-[12px] text-muted">{r.explicacion}</p>
            <p className="mt-0.5 text-[12px] text-faint">{r.fundamentos}</p>
            <div className="mt-1 flex gap-3 text-[11px] text-faint">
              {r.impacto_pesos > 0 && <span className="tabular-nums">Impacto {money(r.impacto_pesos)}</span>}
              <span>Riesgo {r.riesgo}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Fila({ k, v, destacado, tono }: { k: string; v: string; destacado?: boolean; tono?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-faint">{k}</dt>
      <dd className={`tabular-nums ${destacado ? `text-lg font-semibold ${tono ?? ''}` : 'text-[13px] text-ink-soft'}`}>{v}</dd>
    </div>
  )
}

function Renglon({ k, v, tono }: { k: string; v: string; tono?: string }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="text-muted">{k}</span>
      <span className={`font-medium tabular-nums ${tono ?? 'text-ink-soft'}`}>{v}</span>
    </div>
  )
}
