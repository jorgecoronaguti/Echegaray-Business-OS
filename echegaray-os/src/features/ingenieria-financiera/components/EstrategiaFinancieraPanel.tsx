'use client'

// LA ESTRATEGIA FINANCIERA COMO PROTAGONISTA del Calendario Financiero.
//
// El motor (orquestador/lib/estrategia-financiera.mjs) devuelve UN documento estratégico global (la
// estrategia que gobierna el horizonte). Estos componentes lo pintan como protagonista: qué estrategia
// ejecuta el OS y por qué, de un vistazo. El día seleccionado NO cambia la estrategia (el contrato da
// una sola) — cambia su MANIFESTACIÓN: qué acciones de esa estrategia caen ese día (ver AccionesDelDia).
// La Web no recalcula un peso: sólo lee y jerarquiza lo que el motor ya decidió. Presentación con el
// sistema visual del OS (src/shared/components/ui).

import type {
  EstrategiaFinanciera,
  AccionEstrategia,
  Severidad,
  NivelConfianza,
  ImpactoHorizonte,
} from '../types/estrategia'
import { money } from '@/shared/utils/format'
import { textoPorQue } from '../lib/estrategiaFormat'
import { Card, Eyebrow, Badge, Dot, type Tono } from '@/shared/components/ui'

const SEV_TONO: Record<Severidad, Tono> = { alta: 'neg', media: 'warn', baja: 'pos' }
const CONF_TONO: Record<NivelConfianza, Tono> = { alta: 'pos', media: 'warn', baja: 'neg' }

// ─────────────────────────────────────────────────────────────────────────────
// HERO — el protagonista. Lo primero que se lee: qué estrategia ejecuta el OS y por qué.
// Cubre la jerarquía 1 (objetivo), 2 (problema), 3 (estrategia elegida), 8 (costo), 10 (confianza).
// ─────────────────────────────────────────────────────────────────────────────
export function EstrategiaHero({ e }: { e: EstrategiaFinanciera }) {
  if (e.estado === 'sin dato') return <HeroSinDato e={e} />

  const rec = e.estrategia_recomendada
  const conf = e.nivel_confianza
  const prob = e.problema_principal
  const gob = e.horizonte_gobernante

  return (
    <section className="overflow-hidden rounded-card bg-accent text-white shadow-hero">
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-white/55">
              Estrategia financiera vigente{gob ? ` · gobierna ${gob.titulo}` : ''}
            </div>
            <h2 className="mt-1.5 text-xl font-semibold leading-snug text-white">
              {rec?.objetivo || e.objetivo_estrategico}
            </h2>
            {e.eleccion?.elegida && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-control bg-white/10 px-3 py-1 text-[13px]">
                <span className="text-white/60">Estrategia elegida</span>
                <span className="font-medium text-white">{e.eleccion.elegida}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {conf && <Badge tono={CONF_TONO[conf.nivel]} uppercase>Confianza {conf.nivel}</Badge>}
            {typeof e.costo_financiero_esperado === 'number' && (
              <div className="text-right">
                <div className="text-[10px] font-medium uppercase tracking-wide text-white/50">Costo financiero esperado</div>
                <div className="text-lg font-semibold tabular-nums text-white">{money(e.costo_financiero_esperado)}</div>
              </div>
            )}
          </div>
        </div>

        {prob && (
          <div className="mt-5 flex items-start gap-2.5 rounded-control bg-white/[0.06] p-3.5">
            <Dot tono={SEV_TONO[prob.severidad]} className="mt-1.5" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-white">Problema que resuelve: {prob.titulo}</div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-white/65">{prob.detalle}</p>
            </div>
          </div>
        )}

        {e.impacto_caja && <ImpactoCajaFila impacto={e.impacto_caja} colchon={e.diagnostico_liquidez?.colchon_total} />}
      </div>
    </section>
  )
}

function HeroSinDato({ e }: { e: EstrategiaFinanciera }) {
  return (
    <Card padding="lg" className="border-warn/30 bg-warn-soft">
      <Eyebrow className="text-warn/80">Estrategia financiera</Eyebrow>
      <h2 className="mt-1 text-lg font-semibold text-warn">Sin estrategia disponible todavía</h2>
      <p className="mt-1 text-[13px] text-warn/90">{e.motivo || 'El plan de tesorería no está disponible.'}</p>
      <p className="mt-3 text-[12px] text-warn/80">{e.objetivo_estrategico}</p>
    </Card>
  )
}

function ImpactoCajaFila({
  impacto,
  colchon,
}: {
  impacto: { dias_7: ImpactoHorizonte; dias_30: ImpactoHorizonte; dias_90: ImpactoHorizonte }
  colchon?: number | null
}) {
  const cols: { k: string; h: ImpactoHorizonte }[] = [
    { k: '7 días', h: impacto.dias_7 },
    { k: '30 días', h: impacto.dias_30 },
    { k: '90 días', h: impacto.dias_90 },
  ]
  return (
    <div className="mt-5">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-white/50">Impacto en la liquidez futura</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cols.map(({ k, h }) => (
          <div key={k} className="rounded-control bg-white/[0.06] px-3 py-2">
            <div className="text-[10px] uppercase text-white/50">{k}</div>
            <div className="text-[15px] font-semibold tabular-nums text-white">
              {h?.estado === 'sin dato' ? '—' : money(h?.saldo_proyectado)}
            </div>
            {h?.estado !== 'sin dato' && typeof h?.pico_linea === 'number' && h.pico_linea > 0 && (
              <div className="text-[10px] text-white/45">línea pico {money(h.pico_linea)}</div>
            )}
          </div>
        ))}
        <div className="rounded-control bg-white/[0.06] px-3 py-2">
          <div className="text-[10px] uppercase text-white/50">Colchón total</div>
          <div className={`text-[15px] font-semibold tabular-nums ${typeof colchon === 'number' && colchon < 0 ? 'text-neg-soft' : 'text-white'}`}>
            {money(colchon)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE — el razonamiento de la estrategia (global, no cambia por día). Va bajo una
// disclosure progresiva: por defecto el foco es hero + calendario + día; el razonamiento
// completo se expande cuando se lo pide. Cubre jerarquía 4/5/6/9.
// ─────────────────────────────────────────────────────────────────────────────
export function EstrategiaDetalle({ e }: { e: EstrategiaFinanciera }) {
  if (e.estado === 'sin dato') return null
  const rec = e.estrategia_recomendada
  const porQue = textoPorQue(e.eleccion?.por_que)
  const hayPorQue = Boolean(porQue || rec?.razonamiento)
  const hayBeneficio = Boolean(rec?.beneficios?.length || e.eleccion?.ahorro_vs_segunda)
  const hayAlt = Boolean(e.alternativas_evaluadas && e.alternativas_evaluadas.length > 0)
  const hayRiesgo = Boolean(e.riesgos?.length || e.datos_faltantes?.length || e.nivel_confianza?.degradada_por?.length)
  if (!hayPorQue && !hayBeneficio && !hayAlt && !hayRiesgo) return null

  return (
    <details className="group rounded-card border border-line bg-surface shadow-card [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-5 py-3.5 transition hover:bg-surface-quiet">
        <div>
          <Eyebrow>Razonamiento de la estrategia</Eyebrow>
          <div className="mt-0.5 text-[13px] font-medium text-ink">Por qué esta estrategia, alternativas y riesgos</div>
        </div>
        <span className="text-faint transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-4 border-t border-line p-5">
        {hayPorQue && (
          <Bloque titulo="Por qué esta estrategia">
            {rec?.razonamiento && <p className="text-[13px] leading-relaxed text-muted">{rec.razonamiento}</p>}
            {porQue && porQue !== rec?.razonamiento && (
              <p className="mt-2 text-[12px] leading-relaxed text-faint">{porQue}</p>
            )}
          </Bloque>
        )}

        {hayBeneficio && (
          <Bloque titulo="Beneficio esperado">
            {rec?.beneficios?.length ? (
              <ul className="space-y-1.5">
                {rec.beneficios.map((b, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-muted">
                    <Dot tono="pos" className="mt-1.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {e.eleccion?.ahorro_vs_segunda?.nota && (
              <p className="mt-2 rounded-control bg-pos-soft px-3 py-2 text-[12px] text-pos">{e.eleccion.ahorro_vs_segunda.nota}</p>
            )}
          </Bloque>
        )}

        {hayAlt && (
          <Bloque titulo="Alternativas evaluadas">
            <ul className="space-y-2">
              {e.alternativas_evaluadas!.map((a, i) => (
                <li key={i} className={`rounded-control border p-3 ${a.es_elegida ? 'border-accent/25 bg-surface-quiet' : 'border-line bg-surface'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{a.clave}</span>
                    <Badge tono={a.es_elegida ? 'accent' : 'neutral'} uppercase>{a.es_elegida ? 'Elegida' : 'Descartada'}</Badge>
                  </div>
                  {a.objetivo && <p className="mt-1 text-[12px] text-muted">{a.objetivo}</p>}
                  {!a.es_elegida && a.por_que_descartada && (
                    <p className="mt-1 text-[12px] italic text-faint">Por qué no: {a.por_que_descartada}</p>
                  )}
                </li>
              ))}
            </ul>
          </Bloque>
        )}

        {hayRiesgo && (
          <Bloque titulo="Riesgos y confianza">
            {e.riesgos && e.riesgos.length > 0 && (
              <ul className="space-y-1.5">
                {e.riesgos.map((r, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-muted">
                    <Dot tono="neg" className="mt-1.5" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
            {e.nivel_confianza && (
              <div className="mt-3 rounded-control bg-surface-quiet px-3 py-2 text-[12px] text-muted">
                <span className="font-medium text-ink-soft">Base de la confianza:</span> {e.nivel_confianza.base}
                {e.nivel_confianza.degradada_por?.length > 0 && (
                  <div className="mt-1">Degradada por: {e.nivel_confianza.degradada_por.join(' · ')}</div>
                )}
              </div>
            )}
            {e.datos_faltantes && e.datos_faltantes.length > 0 && (
              <div className="mt-2 text-[12px] text-warn">Datos faltantes: {e.datos_faltantes.join(' · ')}</div>
            )}
          </Bloque>
        )}
      </div>
    </details>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <Eyebrow className="mb-2">{titulo}</Eyebrow>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCIONES DEL DÍA — la MANIFESTACIÓN de la estrategia en el día seleccionado.
// Es la información PRINCIPAL del día: qué hace hoy la estrategia (las acciones cuya fecha == el día).
// Los movimientos del calendario quedan por debajo, como secundario.
// ─────────────────────────────────────────────────────────────────────────────
type AccionEtiquetada = AccionEstrategia & { _grupo: string }

/** Junta todas las acciones de la estrategia con su grupo, para filtrar por día. */
export function accionesDeEstrategia(e: EstrategiaFinanciera): AccionEtiquetada[] {
  const push = (arr: AccionEstrategia[] | undefined, grupo: string): AccionEtiquetada[] =>
    (arr || []).map((a) => ({ ...a, _grupo: grupo }))
  return [
    ...push(e.coordinaciones?.ingresos, 'Coordinar ingreso'),
    ...push(e.coordinaciones?.egresos, 'Coordinar egreso'),
    ...push(e.pagos?.priorizar, 'Priorizar pago'),
    ...push(e.pagos?.dividir, 'Dividir pago'),
    ...push(e.pagos?.postergar, 'Postergar pago'),
    ...push(e.pagos?.mover, 'Mover pago'),
    ...push(e.cobranzas?.gestionar, 'Gestionar cobranza'),
    ...push(e.cobranzas?.adelantar, 'Adelantar cobranza'),
    ...push(e.financiamiento?.usar, 'Financiamiento'),
  ]
}

export function AccionesDelDia({ acciones }: { acciones: AccionEtiquetada[] }) {
  if (!acciones.length) {
    return (
      <Card padding="md">
        <Eyebrow>Qué hace hoy la estrategia</Eyebrow>
        <p className="mt-1.5 text-[13px] text-faint">Ninguna acción de la estrategia cae este día.</p>
      </Card>
    )
  }
  return (
    <Card padding="md" className="ring-1 ring-accent/10">
      <Eyebrow className="text-ink-soft">Qué hace hoy la estrategia</Eyebrow>
      <ul className="mt-3 space-y-3">
        {acciones.map((a, i) => (
          <li key={i} className="border-l-2 border-accent pl-3">
            <div className="flex items-center justify-between gap-2">
              <Badge tono="neutral" uppercase>{a._grupo}</Badge>
              {a.requiere_aprobacion && <Badge tono="warn" uppercase>Requiere aprobación</Badge>}
            </div>
            <div className="mt-1.5 text-[13px] font-medium text-ink">{a.descripcion}</div>
            {a.motivo && <p className="mt-0.5 text-[12px] text-muted">{a.motivo}</p>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-faint">
              {typeof a.impacto_pesos === 'number' && a.impacto_pesos !== 0 && <span>Impacto {money(a.impacto_pesos)}</span>}
              {typeof a.costo_financiero === 'number' && a.costo_financiero !== 0 && <span>Costo {money(a.costo_financiero)}</span>}
              {a.medio && <span>{a.medio}</span>}
              {a.nueva_fecha && <span>→ {a.nueva_fecha}</span>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
