// EL TABLERO DEL MOTOR DE INGENIERÍA FINANCIERA — las salidas del motor, pintadas tal cual.
//
// Cada sección lee una tabla singleton public.finanzas_* que un sync materializó desde el tool del
// motor. La Web NO calcula un peso: sólo jerarquiza y muestra lo que el motor decidió. Si un número
// está mal, se arregla en el motor (orquestador/lib/*), nunca acá. Presentación con el sistema visual
// del OS (src/shared/components/ui): tablas densas con hairlines, sin estética de planilla.

import type {
  ModeloLiquidez, RecomendacionModelo, CondicionesDoc, CompararDoc, PriorizarDoc, PagoPriorizado,
} from '../types/tablero'
import type { EstrategiaFinanciera } from '../types/estrategia'
import { money, pct } from '@/shared/utils/format'
import { Card, SectionHeader, Eyebrow, Badge, StatTile, KeyValue, Callout, type Tono } from '@/shared/components/ui'

const PRIORIDAD: Record<string, Tono> = { alta: 'neg', media: 'warn', baja: 'pos' }

function Seccion({ n, titulo, subtitulo, children }: {
  n: number; titulo: string; subtitulo: string; children: React.ReactNode
}) {
  return (
    <Card as="section" padding="lg">
      <SectionHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-control bg-accent text-[11px] font-semibold text-white">{n}</span>
            {titulo}
          </span>
        }
        subtitle={subtitulo}
        className="mb-4"
      />
      {children}
    </Card>
  )
}

function SinDato({ children }: { children: React.ReactNode }) {
  return <Callout tono="warn">{children}</Callout>
}

// ── Encabezado y celdas de tabla densas, tokenizadas ─────────────────────────
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`py-2 pr-3 text-[11px] font-medium uppercase tracking-wide text-faint ${right ? 'text-right' : 'text-left'}`}>{children}</th>
}
function Tr({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <tr className={`border-b border-line last:border-0 ${className}`}>{children}</tr>
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
          <Eyebrow className="mb-1">Disponible</Eyebrow>
          {d.estado === 'ok' ? (
            <>
              <KeyValue k="Caja hoy" v={money(d.caja_hoy)} tono={(d.caja_hoy ?? 0) < 0 ? 'neg' : 'pos'} />
              <KeyValue k="Por cobrar del mes" v={money(d.cobranzas_por_cobrar_mes)} />
              {(d.cobranzas_vencidas ?? 0) > 0 && <KeyValue k="Cobranzas vencidas" v={money(d.cobranzas_vencidas)} tono="warn" />}
              <KeyValue k="Vencimientos 7 días" v={money(d.vencimientos_7dias)} />
              <KeyValue k="Proyección 7 días" v={money(d.proyeccion_7dias)} />
            </>
          ) : <SinDato>Caja sin dato: {d.motivo}</SinDato>}
        </div>
        <div>
          <Eyebrow className="mb-1">Comprometido</Eyebrow>
          {o.estado === 'ok' ? (
            <>
              <KeyValue k="Obligaciones (saldo)" v={money(o.saldo_total)} />
              {(o.vencido ?? 0) > 0 && <KeyValue k="Vencido fiscal/previsional" v={money(o.vencido)} tono="neg" />}
              <KeyValue k="Entra en 30 días" v={money(o.entra_30_dias)} />
            </>
          ) : <SinDato>Obligaciones sin dato: {o.motivo}</SinDato>}
          {c.estado === 'ok' && (c.vencido ?? 0) > 0 && (
            <KeyValue k={`Vencido a proveedores${c.n ? ` (${c.n})` : ''}`} v={money(c.vencido)} tono="neg" />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Eyebrow className="mb-1">Líneas de crédito</Eyebrow>
          <KeyValue k={`Descubierto${l.descubierto.tna != null ? ` (TNA ${pct(l.descubierto.tna)})` : ''}`} v={money(l.descubierto.limite)} />
          <KeyValue k="Usado ~" v={l.descubierto.usado_aprox == null ? 's/d' : money(l.descubierto.usado_aprox)} />
          <KeyValue k="Disponible ~" v={l.descubierto.disponible_aprox == null ? 's/d' : money(l.descubierto.disponible_aprox)} tono="pos" />
          <p className="mt-1 text-[11px] text-faint">{l.costo_marginal}</p>
        </div>
        <StatTile
          label="Colchón total"
          size="lg"
          tono={(modelo.colchon_total ?? 0) < 0 ? 'neg' : 'ink'}
          value={modelo.colchon_total == null ? 'sin dato' : money(modelo.colchon_total)}
          hint="caja + línea disponible − vencido"
          className="flex flex-col justify-center"
        />
      </div>

      {recomendaciones.length > 0 && (
        <div className="mt-4">
          <Eyebrow className="mb-2">Recomendaciones del motor</Eyebrow>
          <ul className="space-y-2">
            {recomendaciones.map((r, i) => (
              <li key={i} className="rounded-control border border-line p-3">
                <div className="flex items-center gap-2">
                  <Badge tono={PRIORIDAD[r.prioridad] ?? 'neutral'} uppercase>{r.prioridad}</Badge>
                  <span className="text-[13px] font-semibold text-ink">{r.titulo}</span>
                  {r.impacto_pesos > 0 && <span className="ml-auto text-[13px] font-medium tabular-nums text-ink-soft">{money(r.impacto_pesos)}</span>}
                </div>
                <p className="mt-1 text-[13px] text-muted">{r.explicacion}. <span className="text-faint">{r.fundamentos}.</span></p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {modelo.fuentes && <p className="mt-3 text-[11px] text-faint">Fuentes: {modelo.fuentes}</p>}
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
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line-strong">
                <Th>Producto</Th>
                <Th>Tipo</Th>
                <Th right>TNA</Th>
                <Th right>CFT</Th>
                <Th right>Disponible</Th>
                <Th>Confianza</Th>
                <Th>Fuente</Th>
              </tr>
            </thead>
            <tbody>
              {doc.condiciones.map((c, i) => (
                <Tr key={i}>
                  <td className="py-2 pr-3 font-medium text-ink">{c.producto}<div className="text-[11px] text-faint">{c.entidad}</div></td>
                  <td className="py-2 pr-3 text-muted">{c.tipo}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{pct(c.tna)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{pct(c.cft)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{c.limite_disponible == null ? '—' : money(c.limite_disponible)}</td>
                  <td className="py-2 pr-3 text-[12px] text-muted">{c.nivel_confianza ?? '—'}</td>
                  <td className="py-2 text-[11px] text-faint">{c.fuente ?? '—'}</td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {doc.faltan_datos.length > 0 && (
        <Callout tono="warn" className="mt-3">
          <span className="font-semibold">Falta cargar la tasa de:</span>
          <ul className="mt-1 list-disc pl-5">
            {doc.faltan_datos.map((f, i) => (
              <li key={i}>{f.producto} ({f.tipo}){f.para_conseguirlo ? ` — ${f.para_conseguirlo}` : ''}</li>
            ))}
          </ul>
        </Callout>
      )}
      {doc.nota && <p className="mt-2 text-[11px] text-faint">{doc.nota}</p>}
    </Seccion>
  )
}

// ── 3 · Comparar financiamiento ──────────────────────────────────────────────
export function CompararSection({ doc }: { doc: CompararDoc }) {
  if (doc.estado !== 'ok') {
    return (
      <Seccion n={3} titulo="Ingeniería de financiamiento" subtitulo="Ante una necesidad de fondos, compara todas las alternativas y elige la más barata factible.">
        <Callout tono="pos">{doc.nota}</Callout>
      </Seccion>
    )
  }
  return (
    <Seccion n={3} titulo="Ingeniería de financiamiento" subtitulo="Ante una necesidad de fondos, compara todas las alternativas y elige la más barata factible.">
      {doc.escenario && (
        <p className="mb-3 rounded-control bg-surface-quiet px-3 py-2 text-[13px] text-muted">
          Escenario real: cubrir <span className="font-semibold text-ink">{money(doc.escenario.monto)}</span> por <span className="font-semibold text-ink">{doc.escenario.dias} día/s</span>.
          <span className="block text-[11px] text-faint">{doc.escenario.origen}</span>
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line-strong">
              <Th>Alternativa</Th>
              <Th right>Costo económico</Th>
              <Th>Factible</Th>
              <Th>Nota</Th>
            </tr>
          </thead>
          <tbody>
            {(doc.alternativas ?? []).map((a, i) => {
              const esRec = doc.recomendada?.via === a.via
              return (
                <Tr key={i} className={esRec ? 'bg-pos-soft' : ''}>
                  <td className="py-2 pr-3 font-medium text-ink">
                    {esRec && <span className="mr-1 text-pos">★</span>}{a.nombre}
                  </td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${a.costoEconomico == null ? 'text-faint' : a.costoEconomico < 0 ? 'text-pos' : 'text-ink'}`}>
                    {a.costoEconomico == null ? 'falta tasa' : money(a.costoEconomico)}
                  </td>
                  <td className="py-2 pr-3 text-[12px]">{a.factible === false ? <span className="text-neg">no</span> : a.factible === true ? <span className="text-pos">sí</span> : <span className="text-faint">—</span>}</td>
                  <td className="py-2 text-[12px] text-muted">{a.nota}</td>
                </Tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {doc.justificacion && (
        <p className="mt-3 rounded-control border border-line p-3 text-[13px] text-ink-soft"><span className="font-semibold">Recomendación:</span> {doc.justificacion}</p>
      )}
      {(doc.faltan_datos?.length ?? 0) > 0 && (
        <p className="mt-2 text-[11px] text-warn">Sin tasa cargada (excluidas del ranking): {doc.faltan_datos!.map((f) => f.producto).join(', ')}.</p>
      )}
    </Seccion>
  )
}

// ── 4 · Priorizar pagos ──────────────────────────────────────────────────────
const DECISION: Record<PagoPriorizado['decision'], Tono> = { pagar: 'pos', parcial: 'warn', esperar: 'neutral' }

export function PriorizarSection({ doc }: { doc: PriorizarDoc }) {
  return (
    <Seccion n={4} titulo="Ingeniería de pagos" subtitulo="Ordena los pagos por prioridad real (no por fecha) y reparte la caja: lo que no entra, espera.">
      {doc.estado !== 'ok' || doc.pagos.length === 0 ? (
        <SinDato>No hay egresos a priorizar en los próximos {doc.ventana_dias} días.</SinDato>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-4 text-[13px]">
            <span className="text-muted">Caja disponible: <span className="font-semibold text-ink tabular-nums">{doc.caja_disponible == null ? 's/d' : money(doc.caja_disponible)}</span></span>
            <span className="text-muted">A pagar: <span className="font-semibold text-pos tabular-nums">{money(doc.total_a_pagar)}</span></span>
            <span className="text-muted">Total en ventana: <span className="font-semibold text-ink tabular-nums">{money(doc.total)}</span></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-strong">
                  <Th right>#</Th>
                  <Th>Proveedor</Th>
                  <Th right>Monto</Th>
                  <Th>Decisión</Th>
                  <Th>Motivo</Th>
                </tr>
              </thead>
              <tbody>
                {doc.pagos.slice(0, 25).map((p, i) => (
                  <Tr key={i}>
                    <td className="py-2 pr-2 text-right tabular-nums text-faint">{p.orden}</td>
                    <td className="py-2 pr-3 font-medium text-ink">
                      {p.proveedor}
                      {(p.vencido || p.vencida) && <Badge tono="neg" className="ml-1">vencido</Badge>}
                      {p.obra && <div className="text-[11px] text-faint">{p.obra}</div>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-soft">{money(p.monto)}</td>
                    <td className="py-2 pr-3"><Badge tono={DECISION[p.decision]} uppercase>{p.decision}</Badge></td>
                    <td className="py-2 text-[12px] text-muted">{p.motivo}</td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
          {doc.pagos.length > 25 && <p className="mt-2 text-[11px] text-faint">… y {doc.pagos.length - 25} pagos más.</p>}
        </>
      )}
      {doc.nota && <p className="mt-2 text-[11px] text-faint">{doc.nota}</p>}
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
          <Badge tono={PRIORIDAD[e.problema_principal.severidad] ?? 'neutral'} uppercase>problema {e.problema_principal.severidad}</Badge>
          <p className="mt-1 text-[13px] font-semibold text-ink">{e.problema_principal.titulo}</p>
          <p className="text-[13px] text-muted">{e.problema_principal.detalle}</p>
        </div>
      )}
      {rec && (
        <div className="rounded-control border border-line p-3">
          <Eyebrow>Estrategia elegida</Eyebrow>
          <p className="mt-0.5 text-[13px] font-semibold text-ink">{e.eleccion?.elegida ?? rec.clave}</p>
          <p className="mt-1 text-[13px] text-muted">{rec.razonamiento}</p>
          {e.eleccion?.por_que && <p className="mt-1 text-[13px] text-faint"><span className="font-medium">Por qué:</span> {e.eleccion.por_que}</p>}
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {typeof e.costo_financiero_esperado === 'number' && (
          <StatTile label="Costo financiero esperado" value={money(e.costo_financiero_esperado)} />
        )}
        {e.impacto_caja?.dias_30 && e.impacto_caja.dias_30.estado !== 'sin dato' && (
          <StatTile label="Saldo proyectado 30 días" value={money(e.impacto_caja.dias_30.saldo_proyectado)} />
        )}
        {e.nivel_confianza && (
          <StatTile label="Confianza" value={e.nivel_confianza.nivel} />
        )}
      </div>
      {(e.datos_faltantes?.length ?? 0) > 0 && (
        <p className="mt-2 text-[11px] text-warn">Datos faltantes: {e.datos_faltantes!.join(' · ')}.</p>
      )}
      <p className="mt-3 text-[11px] text-faint">Toda acción con efecto externo requiere aprobación humana (Nivel E). Esta pantalla es de lectura: prepara la decisión, no ejecuta pagos.</p>
    </Seccion>
  )
}
