// EL TITULAR DE LA OBRA — las cinco cifras del mismo rango, enmarcadas juntas.
//
// Sale de `TabResumen` por tamaño (el archivo pasaba las 500 líneas del repo al enmarcar los
// bloques del canónico 02) y porque es una pieza cerrada: entra la obra, sale la franja. Avance
// físico, plazo, HH, costo y gente son cinco preguntas distintas y ninguna resume a otra — por eso
// son cinco celdas iguales y no una jerarquía.

import Link from 'next/link'
import type { ObraPanel, PlanVsReal } from '@/features/obras/types'
import type { PersonasDeHoy } from '../services/personalService'
import { BarraFina } from './TarjetaResumen'
import { fecha, plataCorta } from './formato'

function Glifo({ d }: { d: string }) {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
  )
}

const G = {
  avance: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"></path>',
  fecha: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
  hh: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 8v4.5l3 2"></path>',
  dinero: '<path d="M12 3v18M8 7h6.5a2.5 2.5 0 010 5H9.5a2.5 2.5 0 000 5H16"></path>',
  persona: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"></path><circle cx="12" cy="7" r="3.6"></circle>',
} as const

const TONO_VALOR = { ink: 'text-ink', neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' } as const

interface PropsMetrica {
  k: string
  /** El número. `null` = no existe, y entonces manda `falta`. */
  v: string | null
  /** Cómo se llama la ausencia. Va en `faint` y en la letra del sistema, NO en el mono de 22px: un
   *  «sin dato» del tamaño de una cifra se lee como si fuera la cifra. */
  falta?: string
  contra?: string
  tonoContra?: 'muted' | 'neg' | 'pos'
  /** 0–100. `null` = no hay fracción que dibujar. */
  pista: number | null
  sub: string
  tono?: keyof typeof TONO_VALOR
  /** Adónde se va a cargar o a mirar el dato. El pie de la métrica se vuelve enlace. */
  href?: string
  /** El glifo del canónico 02, al lado del rótulo. Es reconocimiento de la dimensión, no adorno:
   *  con cinco celdas iguales el ojo necesita algo antes de leer el texto para saber cuál mira. */
  icono?: React.ReactNode
}

/**
 * UNA MÉTRICA DEL TITULAR: rótulo · valor · contraste · barra fina · cobertura.
 *
 * La barra sólo existe cuando hay una fracción real que dibujar. Antes la PISTA vacía se pintaba
 * siempre; en la celda enmarcada del canónico esa pista huérfana se lee como una barra en 0%, o
 * sea como «no avanzó nada», que es justo lo contrario de «no hay con qué medirlo». Sin fracción,
 * no hay barra: el motivo ya lo dice el pie.
 */
function Metrica({ k, v, falta, contra, tonoContra = 'muted', pista, sub, tono = 'ink', href, icono }: PropsMetrica) {
  const pie = <span className="block truncate text-[11px] leading-snug text-faint">{sub}</span>
  return (
    <div className="min-w-[186px] flex-1 border-b border-r border-surface-sunken px-4 py-3 last:border-r-0" data-metrica={k}>
      <div className="flex items-center gap-1.5">
        {icono && <span className="flex shrink-0 text-faint">{icono}</span>}
        {/* Rótulo en versalitas de 10,5px `faint`: el peso lo tiene que llevar la cifra. */}
        <span className="whitespace-nowrap text-[10.5px] uppercase tracking-[0.04em] text-faint">{k}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {v == null ? (
          <span className="text-[15px] leading-none text-faint" data-nulo="">{falta ?? 'sin dato'}</span>
        ) : (
          <span className={`whitespace-nowrap font-mono text-[22px] font-semibold leading-[1.1] tracking-[-0.01em] tabular-nums ${TONO_VALOR[tono]}`}>{v}</span>
        )}
        {v != null && contra && (
          <span className={`whitespace-nowrap text-[11px] ${tonoContra === 'neg' ? 'text-neg' : tonoContra === 'pos' ? 'text-pos' : 'text-muted'}`}>
            {contra}
          </span>
        )}
      </div>
      {pista != null && <BarraFina pct={pista} className="mt-2 w-full" />}
      <div className="mt-1.5">{href ? <Link href={href} className="hover:text-muted">{pie}</Link> : pie}</div>
    </div>
  )
}

/** Cuánto del calendario del plan ya pasó. Es aritmética de fechas, no una estimación de avance. */
function calendarioTranscurrido(inicio: string | null, fin: string | null, hoy: string): number | null {
  if (!inicio || !fin || fin <= inicio) return null
  const dia = 86_400_000
  const t = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`)
  return Math.round(((t(hoy) - t(inicio)) / dia) / ((t(fin) - t(inicio)) / dia) * 100)
}

function fraccion(real: number | null | undefined, plan: number | null | undefined): number | null {
  if (real == null || plan == null || plan <= 0) return null
  return Math.round((real / plan) * 100)
}

/** AVANCE FÍSICO, con su COBERTURA: un porcentaje sin decir sobre cuántas actividades se tomó es la
 *  mitad de un dato — fue el defecto que hizo convivir un 85% con un 44%. */
function mAvance(obra: ObraPanel): PropsMetrica {
  return {
    k: 'Avance físico',
    icono: <Glifo d={G.avance} />,
    v: obra.avance_pct == null ? null : `${obra.avance_pct}%`,
    falta: 'sin medir',
    pista: obra.avance_pct,
    sub: obra.avance_pct == null
      ? `${obra.n_actividades} actividades, ninguna con fecha`
      : `promedio de ${obra.n_actividades_medidas} de ${obra.n_actividades} actividades`,
  }
}

/**
 * PLAZO — el fin previsto contra el fin AL RITMO MEDIDO (`forecast_fin`), que es la pregunta real:
 * ¿llegamos? El desvío contra la línea base sellada mide otra cosa —cuánto se corrió el plan, no
 * cuándo termina la obra— y sigue publicándose entre las lecturas del plan.
 */
function mPlazo(obra: ObraPanel, plan: PlanVsReal | null, hoy: string): PropsMetrica {
  const d = plan?.desvio_forecast_dias ?? null
  const finPlan = plan?.fin_plan ?? obra.fecha_fin_plan
  const forecast = plan?.forecast_fin ?? obra.forecast_fin
  return {
    k: 'Plazo',
    icono: <Glifo d={G.fecha} />,
    v: d == null ? null : d === 0 ? 'en fecha' : `${d > 0 ? '+' : ''}${d} d`,
    falta: 'sin medir',
    contra: d == null ? undefined : d > 0 ? 'más tarde que el plan' : d < 0 ? 'antes del plan' : undefined,
    tonoContra: d != null && d > 0 ? 'neg' : 'muted',
    tono: d != null && d > 0 ? 'neg' : 'ink',
    pista: calendarioTranscurrido(plan?.inicio_plan ?? obra.fecha_inicio_plan, finPlan, hoy),
    sub: d == null
      ? (finPlan == null ? 'sin fin previsto cargado' : 'sin ritmo medido con qué proyectar el fin')
      : `fin previsto ${fecha(finPlan)} · al ritmo medido ${fecha(forecast)}`,
  }
}

/**
 * COSTO REAL. `obra_panel.costo_real` llega en 0 —no en null— cuando la obra no tiene ni un
 * comprobante imputado, y «$0» AFIRMA que la obra no costó nada: la cobertura la da `n_comprobantes`.
 * El presupuesto contra el que se compara aparece SÓLO con `veComercial`; el nivel Obras ve lo
 * gastado, no contra cuánto.
 */
function mCosto(obra: ObraPanel, plan: PlanVsReal | null, veComercial: boolean): PropsMetrica {
  const sinImputar = (obra.n_comprobantes ?? 0) === 0 || obra.costo_real == null
  const presupuesto = veComercial ? plan?.costo_presupuestado ?? null : null
  return {
    k: 'Costo real',
    icono: <Glifo d={G.dinero} />,
    v: sinImputar ? null : plataCorta(obra.costo_real),
    falta: 'sin imputar',
    contra: presupuesto == null ? undefined : `de ${plataCorta(presupuesto)}`,
    pista: fraccion(obra.costo_real, presupuesto),
    tono: veComercial && plan?.desvio_costo_pct != null && plan.desvio_costo_pct > 5 ? 'neg' : 'ink',
    sub: sinImputar
      ? 'ningún comprobante imputado a esta obra'
      : presupuesto == null
        ? `${obra.n_comprobantes} comprobantes imputados`
        : `${obra.n_comprobantes} comprobantes contra el presupuesto`,
  }
}

/**
 * PERSONAS — ASIGNADOS ≠ PRESENTES (§25 · 23/08).
 *
 * Presentes sale de las marcas de asistencia de HOY (`presencia_del_dia`); cero marcas se dice
 * «sin fichar», nunca «0 presentes»: la ausencia de registro no afirma ausencia de gente. Las
 * asignadas vigentes salen de `obra_asignacion`. El error de lectura queda en «sin dato».
 */
function mPersonas(obraId: string, hoy: PersonasDeHoy | null): PropsMetrica {
  const base = {
    k: 'Personas',
    icono: <Glifo d={G.persona} />,
    pista: null,
    href: `/obras/${obraId}?vista=personal`,
  }
  if (!hoy || hoy.asignadas == null) {
    return { ...base, v: null, falta: 'sin dato', sub: 'no se pudo leer la asignación · ver Personal →' }
  }
  if (hoy.presentes != null && hoy.presentes > 0) {
    return {
      ...base,
      v: String(hoy.presentes),
      contra: `de ${hoy.asignadas} asignadas`,
      sub: 'presentes hoy, por marca de asistencia',
    }
  }
  if (hoy.asignadas === 0) {
    return { ...base, v: null, falta: 'sin asignar', sub: 'nadie tiene asignación vigente · asignar en Personal →' }
  }
  return { ...base, v: String(hoy.asignadas), sub: 'asignadas · sin fichar hoy' }
}

/**
 * HH — LA QUINTA CIFRA, NO UN PIE DE PÁGINA.
 *
 * Estaba abajo del titular en 11,5px: la dimensión que decide si la obra se está comiendo la mano
 * de obra se leía como una nota al pie. El canónico la dibuja al lado de las otras cuatro porque es
 * del mismo rango — avance físico, plazo, HH, costo y gente son cinco preguntas distintas y ninguna
 * resume a otra.
 *
 * `hh_real` en null es «nadie imputó», no cero: un «0» acá afirmaría que la obra no consumió horas.
 */
function mHH(plan: PlanVsReal | null): PropsMetrica {
  const hhPlan = plan?.hh_plan ?? plan?.hh_estimada ?? null
  const hhReal = plan?.hh_real ?? null
  const n = (x: number) => Math.round(x).toLocaleString('es-AR')
  const desvio = hhReal != null && hhPlan != null ? Math.round(hhReal - hhPlan) : null
  const alto = plan?.desvio_hh_pct != null && plan.desvio_hh_pct > 10
  return {
    k: 'HH',
    icono: <Glifo d={G.hh} />,
    v: hhReal == null ? null : n(hhReal),
    falta: 'sin imputar',
    // El contraste es el DESVÍO contra el plan, que es lo que se mira; el plan entero va al pie.
    contra: desvio == null ? undefined : `${desvio > 0 ? '+' : ''}${n(desvio)} vs plan`,
    tonoContra: alto ? 'neg' : 'muted',
    tono: alto ? 'warn' : 'ink',
    pista: fraccion(hhReal, hhPlan),
    sub: hhPlan == null
      ? (hhReal == null ? 'sin HH imputadas ni plan de HH cargado' : 'sin plan de HH contra qué medir')
      : `plan ${n(hhPlan)}`,
  }
}

/** El titular: cinco cifras del mismo rango. Avance físico, plazo, HH, costo y gente son dimensiones
 *  distintas y ninguna resume a la otra. */
function Titular({ obra, plan, obraId, veComercial, hoy, personasDeHoy }: {
  obra: ObraPanel; plan: PlanVsReal | null; obraId: string; veComercial: boolean; hoy: string
  personasDeHoy: PersonasDeHoy | null
}) {
  const metricas = [
    mAvance(obra), mPlazo(obra, plan, hoy), mHH(plan),
    mCosto(obra, plan, veComercial), mPersonas(obraId, personasDeHoy),
  ]
  // Las celdas se enmarcan juntas y se dividen con hairlines, no con aire. Con cinco cifras del
  // mismo rango el aire no alcanza para decir dónde termina una y empieza la otra: «612 +38 vs
  // plan» y «$18,4 M» separados sólo por un hueco se leen como una sola frase.
  return (
    <section data-testid="titular-obra" className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="-mb-px flex flex-wrap">
        {metricas.map((m) => <Metrica key={m.k} {...m} />)}
      </div>
    </section>
  )
}

export { Titular }
