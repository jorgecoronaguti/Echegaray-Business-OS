'use client'

// LA ESTRATEGIA FINANCIERA COMO PROTAGONISTA del Calendario Financiero.
//
// El motor (orquestador/lib/estrategia-financiera.mjs) devuelve UN documento estratégico global (la
// estrategia que gobierna el horizonte). Estos componentes lo pintan como protagonista: qué estrategia
// ejecuta el OS y por qué, de un vistazo. El día seleccionado NO cambia la estrategia (el contrato da
// una sola) — cambia su MANIFESTACIÓN: qué acciones de esa estrategia caen ese día (ver AccionesDelDia).
// La Web no recalcula un peso: sólo lee y jerarquiza lo que el motor ya decidió.

import type {
  EstrategiaFinanciera,
  AccionEstrategia,
  Severidad,
  NivelConfianza,
  ImpactoHorizonte,
} from '../types/estrategia'

const money = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
    : '—'

const SEV: Record<Severidad, { chip: string; punto: string }> = {
  alta: { chip: 'bg-red-100 text-red-800', punto: 'bg-red-500' },
  media: { chip: 'bg-amber-100 text-amber-800', punto: 'bg-amber-500' },
  baja: { chip: 'bg-emerald-100 text-emerald-800', punto: 'bg-emerald-500' },
}

const CONF: Record<NivelConfianza, string> = {
  alta: 'bg-emerald-100 text-emerald-800',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-red-100 text-red-800',
}

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
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Estrategia financiera vigente{gob ? ` · gobierna ${gob.titulo}` : ''}
          </div>
          <h2 className="mt-1 text-xl font-semibold leading-snug text-white">
            {rec?.objetivo || e.objetivo_estrategico}
          </h2>
          {e.eleccion?.elegida && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1 text-sm font-medium">
              <span className="text-slate-300">Estrategia elegida:</span>
              <span className="text-white">{e.eleccion.elegida}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {conf && (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase ${CONF[conf.nivel]}`}>
              Confianza {conf.nivel}
            </span>
          )}
          {typeof e.costo_financiero_esperado === 'number' && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Costo financiero esperado</div>
              <div className="tabular-nums text-lg font-semibold text-white">{money(e.costo_financiero_esperado)}</div>
            </div>
          )}
        </div>
      </div>

      {prob && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/5 p-3">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SEV[prob.severidad].punto}`} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-white">Problema que resuelve: {prob.titulo}</div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{prob.detalle}</p>
          </div>
        </div>
      )}

      {e.impacto_caja && <ImpactoCajaFila impacto={e.impacto_caja} colchon={e.diagnostico_liquidez?.colchon_total} />}
    </section>
  )
}

function HeroSinDato({ e }: { e: EstrategiaFinanciera }) {
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
      <div className="text-[11px] uppercase tracking-wide text-amber-700">Estrategia financiera</div>
      <h2 className="mt-1 text-lg font-semibold text-amber-900">Sin estrategia disponible todavía</h2>
      <p className="mt-1 text-sm text-amber-800">{e.motivo || 'El plan de tesorería no está disponible.'}</p>
      <p className="mt-3 text-xs text-amber-700">{e.objetivo_estrategico}</p>
    </section>
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
    <div className="mt-4">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-slate-400">Impacto en la liquidez futura</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cols.map(({ k, h }) => (
          <div key={k} className="rounded-lg bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase text-slate-400">{k}</div>
            <div className="tabular-nums text-sm font-semibold text-white">
              {h?.estado === 'sin dato' ? '—' : money(h?.saldo_proyectado)}
            </div>
            {h?.estado !== 'sin dato' && typeof h?.pico_linea === 'number' && h.pico_linea > 0 && (
              <div className="text-[10px] text-slate-400">línea pico {money(h.pico_linea)}</div>
            )}
          </div>
        ))}
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <div className="text-[10px] uppercase text-slate-400">Colchón total</div>
          <div className={`tabular-nums text-sm font-semibold ${typeof colchon === 'number' && colchon < 0 ? 'text-red-300' : 'text-white'}`}>
            {money(colchon)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE — el razonamiento de la estrategia (global, no cambia por día).
// Cubre jerarquía 4 (por qué elegida), 5 (alternativas), 6 (beneficio), 7 (diagnóstico), 9 (riesgos).
// ─────────────────────────────────────────────────────────────────────────────
export function EstrategiaDetalle({ e }: { e: EstrategiaFinanciera }) {
  if (e.estado === 'sin dato') return null
  const rec = e.estrategia_recomendada

  return (
    <div className="space-y-4">
      {/* Por qué esta estrategia (jerarquía 4) */}
      {(e.eleccion?.por_que || rec?.razonamiento) && (
        <Bloque titulo="Por qué esta estrategia">
          {rec?.razonamiento && <p className="text-sm leading-relaxed text-slate-600">{rec.razonamiento}</p>}
          {e.eleccion?.por_que && e.eleccion.por_que !== rec?.razonamiento && (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{e.eleccion.por_que}</p>
          )}
        </Bloque>
      )}

      {/* Beneficio esperado (jerarquía 6) */}
      {(rec?.beneficios?.length || e.eleccion?.ahorro_vs_segunda) && (
        <Bloque titulo="Beneficio esperado">
          {rec?.beneficios?.length ? (
            <ul className="space-y-1.5">
              {rec.beneficios.map((b, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {e.eleccion?.ahorro_vs_segunda?.nota && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {e.eleccion.ahorro_vs_segunda.nota}
            </p>
          )}
        </Bloque>
      )}

      {/* Alternativas evaluadas (jerarquía 5) */}
      {e.alternativas_evaluadas && e.alternativas_evaluadas.length > 0 && (
        <Bloque titulo="Alternativas evaluadas">
          <ul className="space-y-2">
            {e.alternativas_evaluadas.map((a, i) => (
              <li
                key={i}
                className={`rounded-lg border p-3 ${a.es_elegida ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{a.clave}</span>
                  {a.es_elegida ? (
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium uppercase text-white">Elegida</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500">Descartada</span>
                  )}
                </div>
                {a.objetivo && <p className="mt-1 text-xs text-slate-500">{a.objetivo}</p>}
                {!a.es_elegida && a.por_que_descartada && (
                  <p className="mt-1 text-xs italic text-slate-400">Por qué no: {a.por_que_descartada}</p>
                )}
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {/* Riesgos (jerarquía 9) + supuestos + datos faltantes + confianza degradada */}
      {(e.riesgos?.length || e.datos_faltantes?.length || e.nivel_confianza?.degradada_por?.length) && (
        <Bloque titulo="Riesgos y confianza">
          {e.riesgos && e.riesgos.length > 0 && (
            <ul className="space-y-1.5">
              {e.riesgos.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-600">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-red-400" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
          {e.nivel_confianza && (
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Base de la confianza:</span> {e.nivel_confianza.base}
              {e.nivel_confianza.degradada_por?.length > 0 && (
                <div className="mt-1">Degradada por: {e.nivel_confianza.degradada_por.join(' · ')}</div>
              )}
            </div>
          )}
          {e.datos_faltantes && e.datos_faltantes.length > 0 && (
            <div className="mt-2 text-xs text-amber-700">Datos faltantes: {e.datos_faltantes.join(' · ')}</div>
          )}
        </Bloque>
      )}
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">{titulo}</div>
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
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Qué hace hoy la estrategia</div>
        <p className="text-sm text-slate-400">Ninguna acción de la estrategia cae este día.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-4 ring-1 ring-slate-900/5">
      <div className="mb-3 text-[11px] uppercase tracking-wide text-slate-500">Qué hace hoy la estrategia</div>
      <ul className="space-y-3">
        {acciones.map((a, i) => (
          <li key={i} className="border-l-2 border-slate-900 pl-3">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">{a._grupo}</span>
              {a.requiere_aprobacion && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">Requiere aprobación</span>
              )}
            </div>
            <div className="mt-1 text-sm font-medium text-slate-800">{a.descripcion}</div>
            {a.motivo && <p className="mt-0.5 text-xs text-slate-500">{a.motivo}</p>}
            <div className="mt-1 flex flex-wrap gap-3 text-[11px] tabular-nums text-slate-400">
              {typeof a.impacto_pesos === 'number' && a.impacto_pesos !== 0 && <span>Impacto {money(a.impacto_pesos)}</span>}
              {typeof a.costo_financiero === 'number' && a.costo_financiero !== 0 && <span>Costo {money(a.costo_financiero)}</span>}
              {a.medio && <span>{a.medio}</span>}
              {a.nueva_fecha && <span>→ {a.nueva_fecha}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
