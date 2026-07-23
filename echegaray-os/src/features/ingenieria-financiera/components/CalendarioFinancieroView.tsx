'use client'

import { useMemo, useState } from 'react'
import type { CalendarioFinanciero, DiaCalendario, NivelRiesgo } from '../types'

const money = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0)
const money0 = (n: number) => (n ? money(n) : '—')
const parseDia = (iso: string) => new Date(`${iso}T00:00:00`)
const nombreDia = (iso: string) => parseDia(iso).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })
const numDia = (iso: string) => parseDia(iso).getDate()
// `capitalize` de Tailwind capitaliza CADA palabra y dejaba "Jueves, 23 De Julio" y "Julio De
// 2026". En español va sólo la primera letra: se hace acá, una vez, y ninguna clase lo repite.
const may = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// El riesgo se ENCODEA en color y en forma, no sólo en número: un día que cierra en rojo se lee de un
// vistazo. Los tonos son semánticos (no el acento de marca).
const TONO: Record<NivelRiesgo, { pill: string; borde: string; texto: string }> = {
  bajo: { pill: 'bg-emerald-100 text-emerald-800', borde: 'border-slate-200', texto: 'text-slate-900' },
  medio: { pill: 'bg-amber-100 text-amber-800', borde: 'border-amber-300', texto: 'text-amber-800' },
  alto: { pill: 'bg-red-100 text-red-800', borde: 'border-red-400', texto: 'text-red-700' },
}

type Vista = 'mensual' | 'semanal' | 'diaria'

export function CalendarioFinancieroView({ cal }: { cal: CalendarioFinanciero }) {
  const dias = useMemo(() => cal.dias || [], [cal.dias])
  const porFecha = useMemo(() => new Map(dias.map((d) => [d.fecha, d])), [dias])
  const [vista, setVista] = useState<Vista>('mensual')
  const [sel, setSel] = useState<string>(dias[0]?.fecha ?? '')
  const diaSel = porFecha.get(sel) ?? dias[0]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm">
            {(['mensual', 'semanal', 'diaria'] as Vista[]).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`rounded-md px-3 py-1 capitalize transition ${vista === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-400">
            {dias.length} días · caja inicial {money(cal.caja_inicial)}
          </div>
        </div>

        {vista === 'mensual' && <VistaMensual dias={dias} porFecha={porFecha} sel={sel} onSel={setSel} />}
        {vista === 'semanal' && <VistaSemanal dias={dias} sel={sel} onSel={setSel} />}
        {vista === 'diaria' && diaSel && <VistaLista dias={[diaSel]} sel={sel} onSel={setSel} />}

        {cal.sin_fecha && cal.sin_fecha.n > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {cal.sin_fecha.n} factura{cal.sin_fecha.n > 1 ? 's' : ''} pendiente{cal.sin_fecha.n > 1 ? 's' : ''} de pago por {money(cal.sin_fecha.monto)}{' '}
            no aparece{cal.sin_fecha.n > 1 ? 'n' : ''} en ningún día: {cal.sin_fecha.fuente.toLowerCase()}.
          </div>
        )}
      </div>

      <aside className="space-y-4">
        <Recomendaciones cal={cal} />
        {diaSel && <PanelDia dia={diaSel} />}
      </aside>
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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">{may(titulo)}</div>
        <div className="flex items-center gap-1">
          <Paso etiqueta="Mes anterior" onClick={() => setI(i - 1)} disabled={i <= 0}>‹</Paso>
          <Paso etiqueta="Mes siguiente" onClick={() => setI(i + 1)} disabled={i >= meses.length - 1}>›</Paso>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-slate-400">
        {['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => <div key={d} className="pb-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((c, i) => {
          if (!c) return <div key={i} />
          const activo = typeof c.saldo_final === 'number'
          const t = activo ? TONO[c.riesgo] : { pill: '', borde: 'border-slate-100', texto: 'text-slate-300' }
          const seleccionado = c.fecha === sel
          return (
            <button
              key={c.fecha}
              disabled={!activo}
              onClick={() => onSel(c.fecha)}
              className={`min-h-[68px] rounded-lg border p-1.5 text-left transition ${t.borde} ${seleccionado ? 'ring-2 ring-slate-900' : ''} ${activo ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${activo ? 'text-slate-500' : 'text-slate-300'}`}>{numDia(c.fecha)}</span>
                {activo && c.recomendaciones > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
              </div>
              {activo && (
                <div className={`mt-1 text-[12px] font-semibold tabular-nums ${t.texto}`}>{money(c.saldo_final)}</div>
              )}
              {activo && (c.ingresos > 0 || c.egresos > 0) && (
                <div className="mt-0.5 flex gap-1 text-[10px] tabular-nums">
                  {c.ingresos > 0 && <span className="text-emerald-600">+{Math.round(c.ingresos / 1000)}k</span>}
                  {c.egresos > 0 && <span className="text-red-500">−{Math.round(c.egresos / 1000)}k</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
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
        <div className="text-sm font-medium text-slate-700">
          Semana {i + 1} de {semanas}
        </div>
        <div className="flex items-center gap-1">
          <Paso etiqueta="Semana anterior" onClick={() => setS(i - 1)} disabled={i <= 0}>‹</Paso>
          <Paso etiqueta="Semana siguiente" onClick={() => setS(i + 1)} disabled={i >= semanas - 1}>›</Paso>
        </div>
      </div>
      <VistaLista dias={tramo} sel={sel} onSel={onSel} />
    </div>
  )
}

function Paso({ etiqueta, onClick, disabled, children }: { etiqueta: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function VistaLista({ dias, sel, onSel }: { dias: DiaCalendario[]; sel: string; onSel: (f: string) => void }) {
  return (
    <div className="space-y-2">
      {dias.map((d) => {
        const t = TONO[d.riesgo]
        return (
          <button
            key={d.fecha}
            onClick={() => onSel(d.fecha)}
            className={`flex w-full items-center justify-between rounded-xl border bg-white p-4 text-left transition hover:bg-slate-50 ${t.borde} ${d.fecha === sel ? 'ring-2 ring-slate-900' : ''}`}
          >
            <div>
              <div className="text-sm font-medium text-slate-800">{may(nombreDia(d.fecha))}</div>
              <div className="mt-1 flex gap-3 text-xs tabular-nums text-slate-500">
                <span>inicial {money(d.saldo_inicial)}</span>
                <span className="text-emerald-600">+{money0(d.ingresos)}</span>
                <span className="text-red-500">−{money0(d.egresos)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-semibold tabular-nums ${t.texto}`}>{money(d.saldo_final)}</div>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${t.pill}`}>{d.riesgo}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PanelDia({ dia }: { dia: DiaCalendario }) {
  const t = TONO[dia.riesgo]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">{may(nombreDia(dia.fecha))}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${t.pill}`}>{dia.riesgo}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Fila k="Saldo inicial" v={money(dia.saldo_inicial)} />
        <Fila k="Saldo final" v={money(dia.saldo_final)} destacado tono={t.texto} />
        <Fila k="Ingresos" v={money0(dia.ingresos)} tono="text-emerald-600" />
        <Fila k="Egresos" v={money0(dia.egresos)} tono="text-red-500" />
      </dl>

      {(dia.cheques > 0 || dia.impuestos > 0 || dia.cargas_sociales > 0 || dia.obligaciones > 0 || dia.cobranzas > 0) && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Composición del día</div>
          <div className="space-y-1 text-xs">
            {dia.cobranzas > 0 && <Renglon k="Cobranzas" v={money(dia.cobranzas)} tono="text-emerald-600" />}
            {dia.cheques > 0 && <Renglon k="Cheques" v={money(dia.cheques)} />}
            {dia.cargas_sociales > 0 && <Renglon k="Cargas sociales" v={money(dia.cargas_sociales)} />}
            {dia.impuestos > 0 && <Renglon k="Impuestos" v={money(dia.impuestos)} />}
            {dia.obligaciones > 0 && <Renglon k="Otras obligaciones" v={money(dia.obligaciones)} />}
            {dia.descubierto_utilizado > 0 && <Renglon k="Descubierto usado" v={money(dia.descubierto_utilizado)} tono="text-red-600" />}
          </div>
        </div>
      )}

      {dia.movimientos.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Movimientos</div>
          <ul className="space-y-2">
            {dia.movimientos.map((m, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-700">{m.proveedor || m.cliente || m.detalle || m.categoria}</div>
                  <div className="truncate text-slate-400">
                    {[m.obra, m.medio, m.origen].filter(Boolean).join(' · ') || m.categoria}
                  </div>
                  {m.vencida && (
                    <div className="mt-0.5 text-[11px] font-medium text-red-600">
                      vencida el {m.vence_original ? parseDia(m.vence_original).toLocaleDateString('es-AR') : '—'}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 tabular-nums font-medium ${m.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {m.tipo === 'ingreso' ? '+' : '−'}{money(m.monto)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Recomendaciones({ cal }: { cal: CalendarioFinanciero }) {
  const recs = cal.recomendaciones || []
  if (!recs.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-slate-400">Acciones recomendadas</div>
      <ul className="space-y-3">
        {recs.map((r, i) => (
          <li key={i} className="border-l-2 border-slate-900 pl-3">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${r.prioridad === 'alta' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{r.prioridad}</span>
              <span className="text-sm font-medium text-slate-800">{r.titulo}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{r.explicacion}</p>
            <p className="mt-1 text-xs text-slate-400">{r.fundamentos}</p>
            <div className="mt-1 flex gap-3 text-[11px] text-slate-400">
              {r.impacto_pesos > 0 && <span className="tabular-nums">Impacto {money(r.impacto_pesos)}</span>}
              <span>Riesgo {r.riesgo}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Fila({ k, v, destacado, tono }: { k: string; v: string; destacado?: boolean; tono?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
      <dd className={`tabular-nums ${destacado ? `text-lg font-semibold ${tono ?? ''}` : 'text-slate-800'}`}>{v}</dd>
    </div>
  )
}

function Renglon({ k, v, tono }: { k: string; v: string; tono?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{k}</span>
      <span className={`tabular-nums font-medium ${tono ?? 'text-slate-700'}`}>{v}</span>
    </div>
  )
}
