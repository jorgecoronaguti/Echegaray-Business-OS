import Link from 'next/link'
import { Estado, Eyebrow, Nulo, Num, Tabla, Td, Th, THead, Tr, Vacio } from '@/shared/components/ds'
import type { Actividad, ObraPanel, ParteEjecucion, PlanVsReal, Restriccion } from '@/features/obras/types'
import { PlanVsRealResumen } from './PlanVsRealResumen'
import { ChecklistPreparacion } from './ChecklistPreparacion'
import { proximasDeLaObra } from '../services/resumenDelPlan'
import { fecha, plataCorta } from './formato'

// EL RESUMEN DE LA OBRA — contesta UNA pregunta: ¿cómo está, y qué necesita atención?
//
// ═══ LA FORMA LA FIJA EL HANDOFF APROBADO (design/screens/obras.md §1b) ═══
//
//   Plan vs real en UNA fila de métricas con barra fina · Impedimentos abiertos · Próximas 2
//   semanas · aside con la ficha de la obra, el último movimiento, editar y archivar.
//
// Antes eran siete recuadros para seis números: cuando cada dato trae su propio borde, ninguno pesa
// más que otro y la pantalla deja de tener un mensaje. Ahora no hay ni un recuadro: la jerarquía la
// hacen el tamaño, el espacio y los hairlines.
//
// El CICLO DE VIDA (Previo › Inicio › … › Cierre) no se dibuja acá: vive en el encabezado de la
// entidad, que es de la página. Sin etapa declarada no se resalta ninguna.
//
// ═══ SE FUE «REQUIERE ATENCIÓN», Y NO SE PERDIÓ NADA ═══
//
// Era una lista de alertas —atrasos, desvío de HH, desvío de costo— dibujada ARRIBA de «Lecturas
// del plan», que publica esas mismas tres cosas con los mismos umbrales, los mismos destinos y
// además el origen del número. La captura del 20/08 lo muestra literal: «39 actividades con fin
// previsto vencido y sin completar» arriba, y «39 actividad(es) pasaron su fecha de fin sin llegar
// al 100%» cuatro renglones más abajo. Dos listas de lo que está mal en la misma pantalla se
// contradicen el día que a una se le agrega un criterio y a la otra no. Queda la que tiene origen
// y prueba: `lineasPlanVsReal`.
//
// ═══ EL VACÍO SE DECLARA, NO SE RELLENA ═══
//
// Una obra sin presupuesto cargado no tiene un desvío de costo del 0%: no tiene desvío. La
// diferencia entre «no hay problema» y «no sé si hay problema» es exactamente lo que este módulo
// existe para no perder.

const TONO_VALOR = { ink: 'text-ink', neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' } as const

/**
 * UNA MÉTRICA DE «PLAN VS REAL»: rótulo · valor · contraste · barra fina · cobertura.
 *
 * La barra es de 4px y su PISTA se dibuja siempre; el relleno, sólo cuando existe una fracción
 * real. Una pista vacía se lee como «no hay con qué llenarla», que es la verdad; un relleno en 0%
 * afirmaría que el avance es cero.
 *
 * No está en el design system porque el handoff la describe sólo acá: `Franja` es el pie de 56px de
 * los workspaces, y una fila de métricas de encabezado no es lo mismo.
 */
function Metrica({ k, v, falta, contra, tonoContra = 'muted', pista, sub, tono = 'ink' }: {
  k: string
  /** El número. `null` = no existe, y entonces manda `falta`. */
  v: string | null
  /** Cómo se llama la ausencia. Va en `faint` y en la letra del sistema, NO en el mono de 24px: un
   *  «sin imputar» del tamaño de una cifra se lee como si fuera la cifra. */
  falta?: string
  contra?: string
  tonoContra?: 'muted' | 'neg' | 'pos'
  /** 0–100. `null` = no hay fracción que dibujar. */
  pista: number | null
  sub: string
  tono?: keyof typeof TONO_VALOR
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5" data-metrica={k}>
      <span className="text-[12px] text-muted">{k}</span>
      <div className="flex items-baseline gap-2">
        {v == null ? (
          <span className="text-[15px] leading-none text-faint" data-nulo="">{falta ?? 'sin cargar'}</span>
        ) : (
          <span className={`font-mono text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums ${TONO_VALOR[tono]}`}>{v}</span>
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
      <span className="text-[11.5px] leading-snug text-faint">{sub}</span>
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

/** La fila de cuatro métricas. Es el titular de la obra y no cambia de forma con los datos. */
function PlanContraReal({ obra, plan, hoy }: { obra: ObraPanel; plan: PlanVsReal | null; hoy: string }) {
  const dias = plan?.desvio_plazo_dias ?? null
  const hhPlan = plan?.hh_plan ?? plan?.hh_estimada ?? null
  const hhReal = plan?.hh_real ?? null
  const n = (x: number) => Math.round(x).toLocaleString('es-AR')

  return (
    <section data-testid="titular-obra">
      <Eyebrow className="mb-3.5">Plan vs real</Eyebrow>
      <div className="flex flex-wrap gap-x-8 gap-y-5 sm:flex-nowrap">
        <Metrica
          k="Avance físico"
          v={obra.avance_pct == null ? null : `${obra.avance_pct}%`}
          falta="sin medir"
          pista={obra.avance_pct}
          sub={obra.avance_pct == null
            ? `${obra.n_actividades} actividades, ninguna con fecha`
            : `promedio de ${obra.n_actividades_medidas} de ${obra.n_actividades} actividades`}
        />
        <Metrica
          k="Plazo"
          v={dias == null ? null : dias === 0 ? 'en fecha' : `${dias > 0 ? '+' : ''}${dias} d`}
          falta="sin medir"
          contra={dias == null ? undefined : dias > 0 ? 'sobre plan' : dias < 0 ? 'antes del plan' : undefined}
          tonoContra={dias != null && dias > 0 ? 'neg' : 'muted'}
          tono={dias != null && dias > 0 ? 'neg' : 'ink'}
          pista={calendarioTranscurrido(plan?.inicio_plan ?? null, plan?.fin_plan ?? null, hoy)}
          sub={dias == null
            ? (plan?.actividades_con_baseline ? 'sin fin previsto' : 'línea base sin sellar')
            : `fin previsto ${fecha(plan?.fin_plan)} · línea base sellada`}
        />
        <Metrica
          k="HH"
          v={hhReal == null ? null : n(hhReal)}
          falta="sin imputar"
          contra={hhPlan == null ? undefined : `de ${n(hhPlan)}`}
          pista={fraccion(hhReal, hhPlan)}
          tono={plan?.desvio_hh_pct != null && plan.desvio_hh_pct > 10 ? 'warn' : 'ink'}
          sub={hhPlan == null
            ? 'HH plan sin cargar'
            : hhReal == null ? 'HH real sin imputar' : `desvío ${n(hhReal - hhPlan)} HH a la fecha`}
        />
        <Metrica
          k="Costo real"
          // `obra_panel.costo_real` llega en 0 —no en null— cuando la obra no tiene ni un
          // comprobante imputado, y «$0» AFIRMA que la obra no costó nada. La cobertura la dice
          // `n_comprobantes`: sin comprobantes no hay costo medido, hay costo sin medir.
          v={(obra.n_comprobantes ?? 0) === 0 || obra.costo_real == null ? null : plataCorta(obra.costo_real)}
          falta="sin imputar"
          contra={plan?.costo_presupuestado == null ? undefined : `de ${plataCorta(plan.costo_presupuestado)}`}
          pista={fraccion(obra.costo_real, plan?.costo_presupuestado)}
          tono={plan?.desvio_costo_pct != null && plan.desvio_costo_pct > 5 ? 'neg' : 'ink'}
          sub={(obra.n_comprobantes ?? 0) === 0
            ? 'ningún comprobante imputado a esta obra'
            : plan?.costo_presupuestado == null
              ? `${obra.n_comprobantes} comprobantes · sin presupuesto contra qué medir`
              : `${obra.n_comprobantes} comprobantes imputados`}
        />
      </div>
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

/**
 * IMPEDIMENTOS ABIERTOS — lo que frena la obra, corto y con el vencimiento en rojo.
 *
 * Es una tabla de LECTURA: anotar y liberar viven en Operación, que es la única puerta de escritura
 * del impedimento. Dos altas del mismo dato en dos pantallas se contestan distinto el día que a una
 * se le agregue un campo.
 */
function Impedimentos({ abiertas, obraId, actividadDe, hoy }: {
  abiertas: Restriccion[]; obraId: string; actividadDe: Map<string, string>; hoy: string
}) {
  const vencidos = abiertas.filter((r) => r.fecha_compromiso != null && r.fecha_compromiso < hoy).length
  const orden = [...abiertas].sort((a, b) =>
    (a.fecha_compromiso ?? '9999').localeCompare(b.fecha_compromiso ?? '9999'))
  const aOperacion = (
    <Link href={`/obras/${obraId}?vista=operacion&sub=impedimentos`} className="text-[12px] text-muted hover:text-ink">
      Anotar impedimento
    </Link>
  )
  return (
    <section data-testid="impedimentos-resumen">
      <Rotulo senal={vencidos > 0 ? `${vencidos} con la fecha vencida` : undefined} accion={aOperacion}>
        Impedimentos abiertos
      </Rotulo>
      {orden.length === 0 ? (
        <Vacio>
          Nada declarado como impedimento. En una obra en ejecución eso rara vez significa que no
          haya: significa que nadie los anotó.
        </Vacio>
      ) : (
        <Tabla testid="tabla-impedimentos-resumen" minWidth={620}>
          <THead>
            <Th>Qué frena</Th><Th>Actividad</Th><Th>Responsable</Th><Th num>Compromiso</Th>
          </THead>
          <tbody>
            {orden.slice(0, 6).map((r) => {
              const vencido = r.fecha_compromiso != null && r.fecha_compromiso < hoy
              return (
                <Tr key={r.id} compacta>
                  <Td fuerte>
                    <Estado tono={vencido ? 'neg' : 'pendiente'} clave={vencido ? 'vencido' : 'abierto'}>
                      {r.descripcion}
                    </Estado>
                  </Td>
                  <Td>{r.actividad_id
                    ? (actividadDe.get(r.actividad_id) ?? <Nulo>actividad archivada</Nulo>)
                    : <Nulo>ninguna en particular</Nulo>}</Td>
                  <Td>{r.responsable ?? <span className="text-[12.5px] text-warn">sin responsable</span>}</Td>
                  <Td num className={vencido ? 'font-medium text-neg' : ''}>
                    {r.fecha_compromiso ? fecha(r.fecha_compromiso) : <Nulo>sin fecha</Nulo>}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Tabla>
      )}
      {orden.length > 6 && (
        <p className="mt-2 text-[11.5px] text-faint">Se muestran 6 de {orden.length}. El resto, en Operación.</p>
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
        <Link href={`/obras/${obraId}?vista=cronograma&sub=proximos`} className="text-[12px] text-muted hover:text-ink">
          Ver cronograma →
        </Link>
      }>Próximas 2 semanas</Rotulo>
      {proximas.length === 0 ? (
        <Vacio>Nada arranca ni vence en las próximas dos semanas según el cronograma cargado.</Vacio>
      ) : (
        <Tabla testid="tabla-proximas" minWidth={560}>
          <THead><Th>Fechas</Th><Th>Actividad</Th><Th>Rubro</Th><Th num /></THead>
          <tbody>
            {proximas.slice(0, 8).map((p) => (
              <Tr key={p.id} compacta>
                <Td num className="whitespace-nowrap text-muted">{rango(p)}</Td>
                <Td fuerte>{p.nombre}</Td>
                <Td>{p.rubro ?? <Nulo>sin rubro</Nulo>}</Td>
                <Td num>{p.hito
                  ? <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">hito</span>
                  : ''}</Td>
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
        <p className="text-[13px] leading-relaxed text-muted">
          Todavía no se cargó ningún parte en esta obra.
        </p>
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
  obra, plan, abiertas, obraId, editar, archivar, veComercial = true,
  actividades, partes, hoy = new Date().toISOString().slice(0, 10),
}: {
  obra: ObraPanel
  plan: PlanVsReal | null
  abiertas: Restriccion[]
  obraId: string
  /** El bloque de edición, que la página arma con su action atada a esta obra. */
  editar: React.ReactNode
  /** Archivar o reactivar. Va al aside y no arriba: es la acción menos frecuente de la ficha. */
  archivar?: React.ReactNode
  /** El nivel Obras no ve margen. Ver `PlanVsRealResumen`: no es ocultar un número, es no explicar
   *  mal una ausencia — el dato ya viene NULL de la base. */
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

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <PlanContraReal obra={obra} plan={plan} hoy={hoy} />

        <Impedimentos abiertas={abiertas} obraId={obraId} actividadDe={actividadDe} hoy={hoy} />

        {actividades && <Proximas actividades={actividades} obraId={obraId} hoy={hoy} />}

        {plan && <PlanVsRealResumen plan={plan} obraId={obraId} veComercial={veComercial} />}

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
