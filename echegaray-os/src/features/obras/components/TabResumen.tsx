import Link from 'next/link'
import { Estado, Eyebrow, Nulo, Num, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import type {
  Actividad, EconomiaObra, ObraPanel, ParteEjecucion, PlanVsReal, Restriccion,
} from '@/features/obras/types'
import { PlanVsRealResumen } from './PlanVsRealResumen'
import { ChecklistPreparacion } from './ChecklistPreparacion'
import { proximasDeLaObra } from '../services/resumenDelPlan'
import { lineasPlanVsReal } from '../services/planVsReal'
import type { PersonasDeHoy } from '../services/personalService'
import { fecha, plataCorta } from './formato'

// EL RESUMEN DE LA OBRA — tres preguntas, en este orden y sin párrafos entre medio:
//
//   ¿CÓMO VAMOS?            → la fila de métricas: avance, plazo, costo, personas.
//   ¿QUÉ NECESITA ATENCIÓN? → «Atención», y SÓLO lo que está mal.
//   ¿QUÉ HAY QUE HACER?     → «Próximas 2 semanas».
//
// ═══ POR EXCEPCIÓN: LO NORMAL ES SILENCIOSO ═══
//
// Antes el Resumen publicaba las seis lecturas del plan a la vista, con su punto verde cuando no
// pasaba nada. Seis renglones que casi siempre dicen «bien» entrenan a saltear el bloque entero, y
// el día que uno se pone rojo se saltea igual. Ahora arriba sólo aparece lo que está mal; las
// lecturas completas —incluidas las que están bien y las que no se pueden medir— quedan plegadas al
// final, sin perderse.
//
// ═══ UNA SOLA REGLA PARA «ESTÁ MAL» ═══
//
// «Atención» NO tiene umbrales propios: lee `lineasPlanVsReal`, la misma función que publica las
// lecturas del plan, y se queda con los tonos de alerta. Dos listas de lo que está mal con criterios
// distintos es exactamente cómo se llega a que la misma pantalla se contradiga: acá hay una sola
// regla y dos niveles de detalle.
//
// ═══ LOS IMPEDIMENTOS SE CUENTAN ACÁ, SE RESUELVEN EN OPERACIÓN ═══
//
// La tabla de impedimentos del Resumen se fue: era una segunda copia de lectura de la tabla que vive
// en Operación —la única puerta de escritura— y ocupaba media pantalla para decir, casi siempre,
// «no hay». Queda lo que decide algo: los vencidos, con nombre, y el conteo del resto.
//
// ═══ EL VACÍO SE DECLARA, NO SE RELLENA ═══
//
// Una obra sin presupuesto cargado no tiene un desvío de costo del 0%: no tiene desvío. Y una
// métrica sin dato dice «sin dato» con el motivo al lado, nunca un cero.

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
}

/**
 * UNA MÉTRICA DEL TITULAR: rótulo · valor · contraste · barra fina · cobertura.
 *
 * La barra es de 4px y su PISTA se dibuja siempre; el relleno, sólo cuando existe una fracción
 * real. Una pista vacía se lee como «no hay con qué llenarla», que es la verdad; un relleno en 0%
 * afirmaría que el avance es cero.
 */
function Metrica({ k, v, falta, contra, tonoContra = 'muted', pista, sub, tono = 'ink', href }: PropsMetrica) {
  const pie = <span className="text-[11.5px] leading-snug text-faint">{sub}</span>
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5" data-metrica={k}>
      <span className="text-[12px] text-muted">{k}</span>
      <div className="flex items-baseline gap-2">
        {v == null ? (
          <span className="text-[15px] leading-none text-faint" data-nulo="">{falta ?? 'sin dato'}</span>
        ) : (
          <span className={`font-mono text-[22px] font-semibold leading-none tracking-[-0.01em] tabular-nums ${TONO_VALOR[tono]}`}>{v}</span>
        )}
        {v != null && contra && (
          <span className={`truncate text-[12px] ${tonoContra === 'neg' ? 'text-neg' : tonoContra === 'pos' ? 'text-pos' : 'text-muted'}`}>
            {contra}
          </span>
        )}
      </div>
      <span className="block h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
        {pista != null && <span className="block h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pista))}%` }} />}
      </span>
      {href ? <Link href={href} className="hover:text-muted">{pie}</Link> : pie}
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

/** El titular: cuatro cifras y, en letra chica, las HH — que no son ninguna de las cuatro. Avance
 *  físico, plazo y HH son dimensiones distintas y ninguna resume a la otra. */
function Titular({ obra, plan, obraId, veComercial, hoy, personasDeHoy }: {
  obra: ObraPanel; plan: PlanVsReal | null; obraId: string; veComercial: boolean; hoy: string
  personasDeHoy: PersonasDeHoy | null
}) {
  const metricas = [mAvance(obra), mPlazo(obra, plan, hoy), mCosto(obra, plan, veComercial), mPersonas(obraId, personasDeHoy)]
  const hhPlan = plan?.hh_plan ?? plan?.hh_estimada ?? null
  const hhReal = plan?.hh_real ?? null
  const n = (x: number) => Math.round(x).toLocaleString('es-AR')
  const alto = plan?.desvio_hh_pct != null && plan.desvio_hh_pct > 10
  return (
    <section data-testid="titular-obra">
      <div className="flex flex-wrap gap-x-8 gap-y-5 sm:flex-nowrap">
        {metricas.map((m) => <Metrica key={m.k} {...m} />)}
      </div>
      <p className="mt-4 flex items-baseline gap-2 border-t border-[#EFEEEA] pt-2.5 text-[11.5px] text-faint">
        <span className="text-muted">HH</span>
        {hhReal == null ? (
          <span>sin imputar{hhPlan == null ? '' : ` · ${n(hhPlan)} planificadas`}</span>
        ) : (
          <span className={alto ? 'text-warn' : undefined}>
            {n(hhReal)} imputadas{hhPlan == null ? ' · sin plan contra qué medir' : ` de ${n(hhPlan)}`}
          </span>
        )}
      </p>
    </section>
  )
}

/** El encabezado de una sección del Resumen: rótulo, señal de riesgo, y su acción a la derecha. */
function Rotulo({ children, senal, accion }: { children: string; senal?: string; accion?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <Eyebrow>{children}</Eyebrow>
      {senal && <span className="text-[11.5px] text-neg">{senal}</span>}
      {accion && <span className="ml-auto">{accion}</span>}
    </div>
  )
}

interface ItemAtencion { clave: string; tono: 'neg' | 'warn'; titulo: string; href: string; origen?: string }

/** LO QUE FRENA LA OBRA. Los vencidos con nombre —son los que hay que ir a destrabar hoy—; el resto,
 *  contado. La descripción entera y el formulario viven en Operación, la única puerta de escritura. */
function itemsDeImpedimentos(abiertas: Restriccion[], obraId: string, hoy: string): ItemAtencion[] {
  const href = `/obras/${obraId}?vista=operacion&sub=impedimentos`
  const vencidos = abiertas
    .filter((r) => r.fecha_compromiso != null && r.fecha_compromiso < hoy)
    .sort((a, b) => (a.fecha_compromiso ?? '').localeCompare(b.fecha_compromiso ?? ''))
  const items: ItemAtencion[] = vencidos.slice(0, 3).map((r) => ({
    clave: `impedimento-${r.id}`,
    tono: 'neg',
    titulo: `${r.descripcion} — vencía el ${fecha(r.fecha_compromiso)}${r.responsable ? `, ${r.responsable}` : ', sin responsable'}`,
    href,
    origen: 'impedimento abierto con la fecha de compromiso ya pasada',
  }))
  const resto = abiertas.length - Math.min(vencidos.length, 3)
  if (resto > 0) {
    items.push({
      clave: 'impedimentos-resto',
      tono: 'warn',
      titulo: `${resto} impedimento(s) abierto(s) más`,
      href,
      origen: 'impedimentos sin liberar de esta obra',
    })
  }
  return items
}

/** Las lecturas del plan que están MAL. Mismos umbrales y mismos destinos que el bloque plegado: es
 *  la misma función, filtrada por tono. */
function itemsDelPlan(
  plan: PlanVsReal | null, economia: EconomiaObra | null, veComercial: boolean, obraId: string,
): ItemAtencion[] {
  if (!plan) return []
  return lineasPlanVsReal(plan, veComercial, economia)
    .filter((l) => l.tono === 'alerta' || l.tono === 'atencion')
    .map((l) => ({
      clave: l.clave,
      tono: l.tono === 'alerta' ? ('neg' as const) : ('warn' as const),
      titulo: l.titulo,
      href: `/obras/${obraId}?vista=${l.vista}`,
      origen: l.origen,
    }))
}

/** ATENCIÓN — sólo lo que está mal, cada cosa con el link a donde se corrige. Sin nada mal: una
 *  línea discreta, no un párrafo. */
function Atencion({ items }: { items: ItemAtencion[] }) {
  const graves = items.filter((i) => i.tono === 'neg').length
  return (
    <section data-testid="atencion-obra">
      <Rotulo senal={graves > 0 ? `${graves} sin resolver` : undefined}>Atención</Rotulo>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-faint" data-testid="sin-atencion">Nada que atienda hoy.</p>
      ) : (
        <ul className="border-t border-line">
          {items.map((i) => (
            <li key={i.clave} className="border-b border-[#EFEEEA]">
              {/* El origen técnico viaja en el `title`, nunca en el renglón: sirve para auditar, no
                  para decidir. Y tocar la línea lleva al dato — una alerta que obliga a buscar el
                  número a mano es una alerta que se deja de mirar. */}
              <Link
                href={i.href}
                title={i.origen}
                className="flex h-fila-compacta items-center gap-2.5 hover:bg-surface-quiet"
              >
                <span className="min-w-0 flex-1 truncate">
                  <Estado tono={i.tono} clave={i.clave}>{i.titulo}</Estado>
                </span>
                <span className="shrink-0 text-[13px] text-faint">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** PRÓXIMAS 2 SEMANAS — el trabajo que arranca o que hay que cerrar en la quincena. */
function Proximas({ actividades, obraId, hoy }: {
  actividades: Actividad[]; obraId: string; hoy: string
}) {
  const proximas = proximasDeLaObra(actividades, hoy)
  const rango = (p: { inicio_plan: string | null; fin_plan: string | null }) =>
    p.inicio_plan && p.fin_plan && p.inicio_plan !== p.fin_plan
      ? `${fecha(p.inicio_plan)}–${fecha(p.fin_plan)}`
      : fecha(p.inicio_plan ?? p.fin_plan)
  return (
    <section data-testid="proximas-resumen">
      <Rotulo accion={
        <Link href={`/obras/${obraId}?vista=tareas&sub=gantt`} className="text-[12px] text-muted hover:text-ink">
          Ver cronograma →
        </Link>
      }>Próximas 2 semanas</Rotulo>
      {proximas.length === 0 ? (
        <Vacio>Nada arranca ni vence en dos semanas.</Vacio>
      ) : (
        <Tabla testid="tabla-proximas" minWidth={520}>
          <THead><Th>Fechas</Th><Th>Actividad</Th><Th>Rubro</Th></THead>
          <tbody>
            {proximas.slice(0, 6).map((p) => (
              <Tr key={p.id} compacta>
                <Td num className="whitespace-nowrap text-muted">{rango(p)}</Td>
                <Td fuerte>
                  {p.nombre}
                  {p.hito && (
                    <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">hito</span>
                  )}
                </Td>
                <Td>{p.rubro ?? <Nulo>sin rubro</Nulo>}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </section>
  )
}

/** La ficha del aside: rótulo a la izquierda, valor a la derecha, sin recuadro. */
function Ficha({ obra, plan }: { obra: ObraPanel; plan: PlanVsReal | null }) {
  const filas: { k: string; v: React.ReactNode }[] = [
    { k: 'Cliente', v: obra.cliente_nombre ?? obra.cliente_texto ?? <Nulo>sin cliente declarado</Nulo> },
    { k: 'Responsable', v: obra.jefe_obra ?? <Nulo>sin jefe de obra</Nulo> },
    { k: 'Actividades', v: obra.n_actividades > 0 ? <Num>{obra.n_actividades}</Num> : <Nulo>sin cronograma</Nulo> },
    {
      k: 'Línea base',
      v: plan?.actividades_con_baseline
        ? <Num>{plan.actividades_con_baseline} selladas</Num>
        : <Nulo>sin sellar</Nulo>,
    },
    { k: 'Inicio real', v: obra.fecha_inicio_real ? <Num>{fecha(obra.fecha_inicio_real)}</Num> : <Nulo>sin arrancar</Nulo> },
    { k: 'Carpeta Drive', v: obra.drive_carpeta_id ? 'vinculada' : <Nulo>sin vincular</Nulo> },
  ]
  return (
    <div className="border-t border-[#EFEEEA] pt-3.5">
      <Eyebrow className="mb-3">La obra</Eyebrow>
      <dl className="flex flex-col gap-2.5">
        {filas.map((f) => (
          <div key={f.k} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[12px] text-muted">{f.k}</dt>
            <dd className="min-w-0 truncate text-right text-[12.5px] text-ink">{f.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** El último parte cargado, en una oración. Es la señal de si la obra se está reportando. */
function UltimoMovimiento({ partes, actividadDe, obraId }: {
  partes: ParteEjecucion[]; actividadDe: Map<string, string>; obraId: string
}) {
  const p = partes[0] ?? null
  return (
    <div className="border-t border-[#EFEEEA] pt-3.5">
      <Eyebrow className="mb-2.5">Último movimiento</Eyebrow>
      {p == null ? (
        <p className="text-[13px] text-muted">Ningún parte cargado todavía.</p>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink">
          Parte del <Num>{fecha(p.fecha)}</Num>
          {': '}
          {p.cantidad != null
            ? `+${p.cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 })} `
            : p.avance_pct != null ? `+${p.avance_pct}% ` : ''}
          en {actividadDe.get(p.actividad_id) ?? 'una actividad archivada'}
          {p.comentario ? `. ${p.comentario}` : '.'}
        </p>
      )}
      <Link href={`/obras/${obraId}?vista=ejecucion`} className="mt-2.5 inline-block text-[12px] text-muted hover:text-ink">
        Ir a Ejecución →
      </Link>
    </div>
  )
}

export function TabResumen({
  obra, plan, economia = null, abiertas, obraId, editar, archivar, veComercial = true,
  actividades, partes, personasDeHoy = null, hoy = new Date().toISOString().slice(0, 10),
}: {
  /** Asignadas vigentes y presentes hoy (§25). `null` = la página no lo pidió o no se pudo leer. */
  personasDeHoy?: PersonasDeHoy | null
  obra: ObraPanel
  plan: PlanVsReal | null
  /** El panel económico. SIN ÉL NO SE ARMA LÍNEA DE MARGEN: la línea vieja era `contratado − costo
   *  real`, que no es margen. Ver `lineasPlanVsReal`. */
  economia?: EconomiaObra | null
  abiertas: Restriccion[]
  obraId: string
  /** El bloque de edición, que la página arma con su action atada a esta obra. */
  editar: React.ReactNode
  /** Archivar o reactivar. Va al final y plegado: es la acción menos frecuente de la ficha. */
  archivar?: React.ReactNode
  /** El nivel Obras no ve margen ni presupuesto. Ver `PlanVsRealResumen`: no es ocultar un número,
   *  es no explicar mal una ausencia — el dato ya viene NULL de la base. */
  veComercial?: boolean
  /** El cronograma vivo. SIN ÉL NO SE DIBUJA «Próximas 2 semanas»: la ausencia de la prop significa
   *  que la página no la pidió, y eso no es lo mismo que una obra sin trabajo por delante. Una tabla
   *  vacía ahí diría «no viene nada» sobre una obra que nadie consultó. */
  actividades?: Actividad[]
  /** Los partes, para el último movimiento. Misma regla que `actividades`. */
  partes?: ParteEjecucion[]
  /** Entra por parámetro para que «vencido» se pueda probar en cualquier fecha. */
  hoy?: string
}) {
  const actividadDe = new Map((actividades ?? []).map((a) => [a.id, a.nombre]))
  const atencion = [
    ...itemsDeImpedimentos(abiertas, obraId, hoy),
    ...itemsDelPlan(plan, economia, veComercial, obraId),
  ]

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <Titular obra={obra} plan={plan} obraId={obraId} veComercial={veComercial} hoy={hoy} personasDeHoy={personasDeHoy} />

        <Atencion items={atencion} />

        {actividades && <Proximas actividades={actividades} obraId={obraId} hoy={hoy} />}

        {/* LAS LECTURAS COMPLETAS, PLEGADAS. Lo que está bien y lo que no se puede medir no se
            perdió: dejó de competir por la primera pantalla con lo que hay que ir a resolver. */}
        {plan && (
          <details className="border-t border-[#EFEEEA] pt-3.5" data-testid="lecturas-del-plan">
            <summary className="cursor-pointer select-none text-[12.5px] text-muted hover:text-ink">
              Lecturas del plan, una por una
            </summary>
            <div className="mt-3.5">
              <PlanVsRealResumen plan={plan} obraId={obraId} veComercial={veComercial} economia={economia} />
            </div>
          </details>
        )}

        {/* LO QUE FALTA PARA QUE LA OBRA PRODUZCA, plegado: explica los «sin medir» de arriba, no
            compite con ellos. Y desaparece solo cuando no falta nada — un checklist entero en ✓
            ocupa lugar sin decir nada. */}
        <ChecklistPreparacion obraId={obraId} plegado ocultarSiCompleto />
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[360px]">
        <Ficha obra={obra} plan={plan} />
        {partes && <UltimoMovimiento partes={partes} actividadDe={actividadDe} obraId={obraId} />}
        <div className="border-t border-[#EFEEEA] pt-3.5">{editar}</div>
        {archivar && <div className="border-t border-[#EFEEEA] pt-3.5">{archivar}</div>}
      </aside>
    </div>
  )
}
