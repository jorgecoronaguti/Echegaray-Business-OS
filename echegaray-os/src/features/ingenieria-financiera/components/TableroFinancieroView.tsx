// EL TABLERO DEL MOTOR DE INGENIERÍA FINANCIERA — las salidas del motor, pintadas tal cual.
//
// Cada sección lee una tabla singleton public.finanzas_* que un sync materializó desde el tool del
// motor. La Web NO calcula un peso: sólo jerarquiza y muestra lo que el motor decidió. Si un número
// está mal, se arregla en el motor (orquestador/lib/*), nunca acá.

import type {
  ModeloLiquidez, RecomendacionModelo, CondicionesDoc, CompararDoc, PriorizarDoc, PagoPriorizado,
} from '../types/tablero'
import type { EstrategiaFinanciera } from '../types/estrategia'

const money = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
    : '—'

const pct = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—'

const PRIORIDAD: Record<string, string> = {
  alta: 'bg-red-100 text-red-800',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-emerald-100 text-emerald-800',
}

function Seccion({ n, titulo, subtitulo, children }: {
  n: number; titulo: string; subtitulo: string; children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-baseline gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{n}</span>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <p className="text-xs text-slate-500">{subtitulo}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function SinDato({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{children}</p>
}

function Dato({ k, v, tono }: { k: string; v: string; tono?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-sm text-slate-500">{k}</span>
      <span className={`text-sm font-medium tabular-nums ${tono ?? 'text-slate-900'}`}>{v}</span>
    </div>
  )
}

// ── 1 · Modelo único de liquidez ─────────────────────────────────────────────
export function ModeloLiquidezSection({ modelo, recomendaciones }: {
  modelo: ModeloLiquidez; recomendaciones: RecomendacionModelo[]
}) {
  const d = modelo.disponible
  const o = modelo.comprometido
  const c = modelo.deuda_comercial
  const l = modelo.lineas
  return (
    <Seccion n={1} titulo="Modelo único de liquidez" subtitulo="Disponible, comprometido, líneas y colchón — ensamblado de las fuentes únicas del OS.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Disponible</h3>
          {d.estado === 'ok' ? (
            <>
              <Dato k="Caja hoy" v={money(d.caja_hoy)} tono={(d.caja_hoy ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'} />
              <Dato k="Por cobrar del mes" v={money(d.cobranzas_por_cobrar_mes)} />
              {(d.cobranzas_vencidas ?? 0) > 0 && <Dato k="Cobranzas vencidas" v={money(d.cobranzas_vencidas)} tono="text-amber-700" />}
              <Dato k="Vencimientos 7 días" v={money(d.vencimientos_7dias)} />
              <Dato k="Proyección 7 días" v={money(d.proyeccion_7dias)} />
            </>
          ) : <SinDato>Caja sin dato: {d.motivo}</SinDato>}
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Comprometido</h3>
          {o.estado === 'ok' ? (
            <>
              <Dato k="Obligaciones (saldo)" v={money(o.saldo_total)} />
              {(o.vencido ?? 0) > 0 && <Dato k="Vencido fiscal/previsional" v={money(o.vencido)} tono="text-red-600" />}
              <Dato k="Entra en 30 días" v={money(o.entra_30_dias)} />
            </>
          ) : <SinDato>Obligaciones sin dato: {o.motivo}</SinDato>}
          {c.estado === 'ok' && (c.vencido ?? 0) > 0 && (
            <Dato k={`Vencido a proveedores${c.n ? ` (${c.n})` : ''}`} v={money(c.vencido)} tono="text-red-600" />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Líneas de crédito</h3>
          <Dato k={`Descubierto${l.descubierto.tna != null ? ` (TNA ${pct(l.descubierto.tna)})` : ''}`} v={money(l.descubierto.limite)} />
          <Dato k="Usado ~" v={l.descubierto.usado_aprox == null ? 's/d' : money(l.descubierto.usado_aprox)} />
          <Dato k="Disponible ~" v={l.descubierto.disponible_aprox == null ? 's/d' : money(l.descubierto.disponible_aprox)} tono="text-emerald-700" />
          <p className="mt-1 text-xs text-slate-400">{l.costo_marginal}</p>
        </div>
        <div className="flex flex-col justify-center rounded-lg bg-slate-50 p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Colchón total</span>
          <span className={`text-2xl font-bold tabular-nums ${(modelo.colchon_total ?? 0) < 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {modelo.colchon_total == null ? 'sin dato' : money(modelo.colchon_total)}
          </span>
          <span className="text-xs text-slate-500">caja + línea disponible − vencido</span>
        </div>
      </div>

      {recomendaciones.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recomendaciones del motor</h3>
          <ul className="space-y-2">
            {recomendaciones.map((r, i) => (
              <li key={i} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORIDAD[r.prioridad] ?? 'bg-slate-100 text-slate-700'}`}>{r.prioridad}</span>
                  <span className="text-sm font-semibold text-slate-900">{r.titulo}</span>
                  {r.impacto_pesos > 0 && <span className="ml-auto text-sm font-medium tabular-nums text-slate-700">{money(r.impacto_pesos)}</span>}
                </div>
                <p className="mt-1 text-sm text-slate-600">{r.explicacion}. <span className="text-slate-500">{r.fundamentos}.</span></p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {modelo.fuentes && <p className="mt-3 text-[11px] text-slate-400">Fuentes: {modelo.fuentes}</p>}
    </Seccion>
  )
}

// ── 2 · Condiciones de financiamiento ────────────────────────────────────────
export function CondicionesSection({ doc }: { doc: CondicionesDoc }) {
  return (
    <Seccion n={2} titulo="Condiciones de financiamiento" subtitulo="La fuente única de tasas, costos y límites vigentes — cada una con su fuente y confianza.">
      {doc.condiciones.length === 0 ? (
        <SinDato>No hay condiciones vigentes cargadas.</SinDato>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3">Tipo</th>
                <th className="py-2 pr-3 text-right">TNA</th>
                <th className="py-2 pr-3 text-right">CFT</th>
                <th className="py-2 pr-3 text-right">Disponible</th>
                <th className="py-2 pr-3">Confianza</th>
                <th className="py-2">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {doc.condiciones.map((c, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-900">{c.producto}<div className="text-xs text-slate-400">{c.entidad}</div></td>
                  <td className="py-2 pr-3 text-slate-600">{c.tipo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(c.tna)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(c.cft)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c.limite_disponible == null ? '—' : money(c.limite_disponible)}</td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{c.nivel_confianza ?? '—'}</td>
                  <td className="py-2 text-xs text-slate-400">{c.fuente ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {doc.faltan_datos.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="font-semibold">Falta cargar la tasa de:</span>
          <ul className="mt-1 list-disc pl-5">
            {doc.faltan_datos.map((f, i) => (
              <li key={i}>{f.producto} ({f.tipo}){f.para_conseguirlo ? ` — ${f.para_conseguirlo}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
      {doc.nota && <p className="mt-2 text-[11px] text-slate-400">{doc.nota}</p>}
    </Seccion>
  )
}

// ── 3 · Comparar financiamiento ──────────────────────────────────────────────
export function CompararSection({ doc }: { doc: CompararDoc }) {
  if (doc.estado !== 'ok') {
    return (
      <Seccion n={3} titulo="Ingeniería de financiamiento" subtitulo="Ante una necesidad de fondos, compara todas las alternativas y elige la más barata factible.">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{doc.nota}</p>
      </Seccion>
    )
  }
  return (
    <Seccion n={3} titulo="Ingeniería de financiamiento" subtitulo="Ante una necesidad de fondos, compara todas las alternativas y elige la más barata factible.">
      {doc.escenario && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Escenario real: cubrir <span className="font-semibold text-slate-900">{money(doc.escenario.monto)}</span> por <span className="font-semibold text-slate-900">{doc.escenario.dias} día/s</span>.
          <span className="block text-xs text-slate-400">{doc.escenario.origen}</span>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Alternativa</th>
              <th className="py-2 pr-3 text-right">Costo económico</th>
              <th className="py-2 pr-3">Factible</th>
              <th className="py-2">Nota</th>
            </tr>
          </thead>
          <tbody>
            {(doc.alternativas ?? []).map((a, i) => {
              const esRec = doc.recomendada?.via === a.via
              return (
                <tr key={i} className={`border-b border-slate-100 last:border-0 ${esRec ? 'bg-emerald-50' : ''}`}>
                  <td className="py-2 pr-3 font-medium text-slate-900">
                    {esRec && <span className="mr-1 text-emerald-600">★</span>}{a.nombre}
                  </td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${a.costoEconomico == null ? 'text-slate-400' : a.costoEconomico < 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {a.costoEconomico == null ? 'falta tasa' : money(a.costoEconomico)}
                  </td>
                  <td className="py-2 pr-3 text-xs">{a.factible === false ? <span className="text-red-600">no</span> : a.factible === true ? <span className="text-emerald-700">sí</span> : <span className="text-slate-400">—</span>}</td>
                  <td className="py-2 text-xs text-slate-500">{a.nota}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {doc.justificacion && (
        <p className="mt-3 rounded-lg border border-slate-100 p-3 text-sm text-slate-700"><span className="font-semibold">Recomendación:</span> {doc.justificacion}</p>
      )}
      {(doc.faltan_datos?.length ?? 0) > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">Sin tasa cargada (excluidas del ranking): {doc.faltan_datos!.map((f) => f.producto).join(', ')}.</p>
      )}
    </Seccion>
  )
}

// ── 4 · Priorizar pagos ──────────────────────────────────────────────────────
const DECISION: Record<PagoPriorizado['decision'], string> = {
  pagar: 'bg-emerald-100 text-emerald-800',
  parcial: 'bg-amber-100 text-amber-800',
  esperar: 'bg-slate-100 text-slate-600',
}

export function PriorizarSection({ doc }: { doc: PriorizarDoc }) {
  return (
    <Seccion n={4} titulo="Ingeniería de pagos" subtitulo="Ordena los pagos por prioridad real (no por fecha) y reparte la caja: lo que no entra, espera.">
      {doc.estado !== 'ok' || doc.pagos.length === 0 ? (
        <SinDato>No hay egresos a priorizar en los próximos {doc.ventana_dias} días.</SinDato>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <span className="text-slate-500">Caja disponible: <span className="font-semibold text-slate-900">{doc.caja_disponible == null ? 's/d' : money(doc.caja_disponible)}</span></span>
            <span className="text-slate-500">A pagar: <span className="font-semibold text-emerald-700">{money(doc.total_a_pagar)}</span></span>
            <span className="text-slate-500">Total en ventana: <span className="font-semibold text-slate-900">{money(doc.total)}</span></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-2 text-right">#</th>
                  <th className="py-2 pr-3">Proveedor</th>
                  <th className="py-2 pr-3 text-right">Monto</th>
                  <th className="py-2 pr-3">Decisión</th>
                  <th className="py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {doc.pagos.slice(0, 25).map((p, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-2 text-right tabular-nums text-slate-400">{p.orden}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">
                      {p.proveedor}
                      {(p.vencido || p.vencida) && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">vencido</span>}
                      {p.obra && <div className="text-xs text-slate-400">{p.obra}</div>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(p.monto)}</td>
                    <td className="py-2 pr-3"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${DECISION[p.decision]}`}>{p.decision}</span></td>
                    <td className="py-2 text-xs text-slate-500">{p.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {doc.pagos.length > 25 && <p className="mt-2 text-xs text-slate-400">… y {doc.pagos.length - 25} pagos más.</p>}
        </>
      )}
      {doc.nota && <p className="mt-2 text-[11px] text-slate-400">{doc.nota}</p>}
    </Seccion>
  )
}

// ── 7 · Estrategia financiera (resumen ejecutivo) ────────────────────────────
export function EstrategiaResumenSection({ e }: { e: EstrategiaFinanciera }) {
  if (e.estado !== 'ok') {
    return (
      <Seccion n={7} titulo="Estrategia financiera (CFO)" subtitulo="La estrategia completa que el OS está ejecutando y por qué.">
        <SinDato>Estrategia sin dato: {e.motivo ?? 'el plan de tesorería no está disponible'}.</SinDato>
      </Seccion>
    )
  }
  const rec = e.estrategia_recomendada
  return (
    <Seccion n={7} titulo="Estrategia financiera (CFO)" subtitulo="La estrategia completa que el OS está ejecutando y por qué — no una lista de pagos.">
      {e.problema_principal && (
        <div className="mb-3">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORIDAD[e.problema_principal.severidad] ?? 'bg-slate-100'}`}>problema {e.problema_principal.severidad}</span>
          <p className="mt-1 text-sm font-semibold text-slate-900">{e.problema_principal.titulo}</p>
          <p className="text-sm text-slate-600">{e.problema_principal.detalle}</p>
        </div>
      )}
      {rec && (
        <div className="rounded-lg border border-slate-100 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estrategia elegida</p>
          <p className="text-sm font-semibold text-slate-900">{e.eleccion?.elegida ?? rec.clave}</p>
          <p className="mt-1 text-sm text-slate-600">{rec.razonamiento}</p>
          {e.eleccion?.por_que && <p className="mt-1 text-sm text-slate-500"><span className="font-medium">Por qué:</span> {e.eleccion.por_que}</p>}
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
        {typeof e.costo_financiero_esperado === 'number' && (
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Costo financiero esperado</div><div className="font-semibold text-slate-900 tabular-nums">{money(e.costo_financiero_esperado)}</div></div>
        )}
        {e.impacto_caja?.dias_30 && e.impacto_caja.dias_30.estado !== 'sin dato' && (
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Saldo proyectado 30 días</div><div className="font-semibold text-slate-900 tabular-nums">{money(e.impacto_caja.dias_30.saldo_proyectado)}</div></div>
        )}
        {e.nivel_confianza && (
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">Confianza</div><div className="font-semibold text-slate-900">{e.nivel_confianza.nivel}</div></div>
        )}
      </div>
      {(e.datos_faltantes?.length ?? 0) > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">Datos faltantes: {e.datos_faltantes!.join(' · ')}.</p>
      )}
      <p className="mt-3 text-[11px] text-slate-400">Toda acción con efecto externo requiere aprobación humana (Nivel E). Esta pantalla es de lectura: prepara la decisión, no ejecuta pagos.</p>
    </Seccion>
  )
}
