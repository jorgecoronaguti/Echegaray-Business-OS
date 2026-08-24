import Link from 'next/link'
import { Vacio } from '@/shared/components/ds'
import type {
  Actividad, EconomiaObra, ObraPanel, ParteEjecucion, PlanVsReal, Restriccion,
} from '@/features/obras/types'
import { PlanVsRealResumen } from './PlanVsRealResumen'
import { ChecklistPreparacion } from './ChecklistPreparacion'
import { CurvaAvance } from './CurvaAvance'
import { Ficha, UltimoMovimiento } from './FichaObra'
import { Tarjeta, CabeceraTarjeta } from './TarjetaResumen'
import { Titular } from './TitularObra'
import { AtencionObra, type ItemAtencion } from './AtencionObra'
import { proximasDeLaObra } from '../services/resumenDelPlan'
import { lineasPlanVsReal } from '../services/planVsReal'
import type { PersonasDeHoy } from '../services/personalService'
import { fecha } from './formato'

// EL RESUMEN DE LA OBRA — tres preguntas, en este orden y sin párrafos entre medio:
//
//   ¿CÓMO VAMOS?            → la fila de métricas: avance, plazo, costo, personas.
//   ¿QUÉ NECESITA ATENCIÓN? → «Atención», y SÓLO lo que está mal.
//   ¿VAMOS AL RITMO?        → «Avance real vs esperado»: el avance medido contra el calendario.
//   ¿QUÉ HAY QUE HACER?     → «Próximas 2 semanas».
//
// Y en la columna de contexto, qué obra es (la ficha), qué le falta para producir (preparación) y
// si se está reportando (último movimiento).
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

/** LO QUE FRENA LA OBRA. Los vencidos con nombre —son los que hay que ir a destrabar hoy—; el resto,
 *  contado. La descripción entera y el formulario viven en Operación, la única puerta de escritura. */
function itemsDeImpedimentos(abiertas: Restriccion[], obraId: string, hoy: string): ItemAtencion[] {
  const href = `/obras/${obraId}?vista=operacion&sub=impedimentos`
  const vencidos = abiertas
    .filter((r) => r.fecha_compromiso != null && r.fecha_compromiso < hoy)
    .sort((a, b) => (a.fecha_compromiso ?? '').localeCompare(b.fecha_compromiso ?? ''))
  // El QUÉ va en tinta y el DÓNDE en faint. Antes iban pegados en una sola oración roja: la
  // descripción del impedimento y su fecha vencida competían con el mismo peso, y lo que decide
  // cuál se destraba primero —el nombre de lo que falta— quedaba enterrado entre comas.
  const items: ItemAtencion[] = vencidos.slice(0, 3).map((r) => ({
    clave: `impedimento-${r.id}`,
    tono: 'neg',
    clase: 'bloqueo',
    titulo: r.descripcion,
    contexto: `vencía el ${fecha(r.fecha_compromiso)} · ${r.responsable ?? 'sin responsable'}`,
    accion: 'Resolver',
    href,
    origen: 'impedimento abierto con la fecha de compromiso ya pasada',
  }))
  const resto = abiertas.length - Math.min(vencidos.length, 3)
  if (resto > 0) {
    items.push({
      clave: 'impedimentos-resto',
      tono: 'warn',
      clase: 'bloqueo',
      titulo: `${resto} impedimento(s) abierto(s) más`,
      accion: 'Ver',
      href,
      origen: 'impedimentos sin liberar de esta obra',
    })
  }
  return items
}

/**
 * LAS LECTURAS DEL PLAN QUE PIDEN TRABAJO. Mismos umbrales y mismos destinos que el bloque plegado:
 * es la misma función, leída por tono. Y ahora entra también el tono `falta`.
 *
 * ¿POR QUÉ ENTRA `falta`? Porque el canónico 02 pone «Faltan datos» como un corte de Atención, y
 * tiene razón de negocio: «la línea base no está sellada» no es una lectura tranquila que se guarda
 * en un plegable, es trabajo pendiente de alguien —sólo que de otra persona y con otra urgencia que
 * un bloqueo de obra—. Por eso llega clasificado, no mezclado. Las lecturas en `ok` siguen fuera:
 * ésas sí no piden nada.
 */
function itemsDelPlan(
  plan: PlanVsReal | null, economia: EconomiaObra | null, veComercial: boolean, obraId: string,
): ItemAtencion[] {
  if (!plan) return []
  return lineasPlanVsReal(plan, veComercial, economia)
    .filter((l) => l.tono !== 'ok')
    .map((l) => ({
      clave: l.clave,
      tono: l.tono === 'alerta' ? ('neg' as const) : ('warn' as const),
      clase: l.tono === 'falta' ? ('dato' as const) : ('bloqueo' as const),
      titulo: l.titulo,
      // El verbo declara qué tipo de trabajo espera del otro lado: un dato que falta se CARGA,
      // un desvío medido se VA A VER — nadie «resuelve» un número mirándolo.
      accion: l.tono === 'falta' ? 'Cargar' : 'Ver',
      href: `/obras/${obraId}?vista=${l.vista}`,
      origen: l.origen,
    }))
}

/**
 * PRÓXIMAS 2 SEMANAS — el trabajo que arranca o que hay que cerrar en la quincena.
 *
 * Era una tabla de tres columnas (FECHAS · ACTIVIDAD · RUBRO). El canónico 02 la vuelve una lista
 * de renglones —nombre a la izquierda, fecha a la derecha— y el cambio no es estético: la tabla
 * daba a la fecha una columna de ancho fijo a la izquierda, y la fecha es lo que decide el ORDEN de
 * lectura, no la identidad de la fila. El rubro se fue porque no cambia ninguna decisión de esta
 * pantalla; sigue entero en el cronograma.
 *
 * LA FECHA SE PINTA POR URGENCIA: lo que vence hoy o ya venció en `neg`, lo de esta semana en
 * `warn`, el resto en faint. Es el único color de la lista.
 */
function Proximas({ actividades, obraId, hoy }: {
  actividades: Actividad[]; obraId: string; hoy: string
}) {
  const proximas = proximasDeLaObra(actividades, hoy)
  const dia = 86_400_000
  const enDias = (f: string | null) =>
    f == null ? null : Math.round((Date.parse(`${f.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / dia)
  return (
    <Tarjeta testid="proximas-resumen" className="min-w-0 flex-1">
      <CabeceraTarjeta
        icono={
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        }
        titulo="Próximas 2 semanas"
        cifra={proximas.length > 0 ? `${proximas.length} actividades` : undefined}
        accion={
          <Link
            href={`/obras/${obraId}?vista=tareas&sub=gantt`}
            className="flex items-center gap-1.5 text-[11.5px] text-ink-soft hover:text-ink"
          >
            Cronograma
            <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        }
      />
      {proximas.length === 0 ? (
        <div className="px-4 py-5"><Vacio>Nada arranca ni vence en dos semanas.</Vacio></div>
      ) : (
        <ul data-testid="tabla-proximas">
          {proximas.slice(0, 6).map((p) => {
            const ref = p.fin_plan ?? p.inicio_plan
            const d = enDias(ref)
            const tono = d == null ? 'text-faint' : d <= 0 ? 'text-neg' : d <= 7 ? 'text-warn' : 'text-faint'
            return (
              <li key={p.id} className="border-b border-surface-sunken last:border-b-0">
                <Link
                  href={`/obras/${obraId}?vista=tareas&sub=gantt`}
                  className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-surface-quiet"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                    {p.nombre}
                    {p.hito && (
                      <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink">hito</span>
                    )}
                  </span>
                  <span className={`shrink-0 whitespace-nowrap font-mono text-[11.5px] tabular-nums ${tono}`}>
                    {d != null && d <= 0 ? 'vence hoy' : fecha(ref)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Tarjeta>
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
    // LAS DOS COLUMNAS DEL CANÓNICO 02 y su respiración de 12px. El gap era de 32/40px, que es
    // aire de página sin marcos; con cada bloque enmarcado ese hueco separa tarjetas que ya se
    // separan solas y empuja «Próximas 2 semanas» fuera de la primera pantalla.
    <div className="flex flex-col gap-3 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Titular obra={obra} plan={plan} obraId={obraId} veComercial={veComercial} hoy={hoy} personasDeHoy={personasDeHoy} />

        <AtencionObra items={atencion} />

        {/* ¿CÓMO VIENE CONTRA EL CALENDARIO? y ¿QUÉ VIENE? van uno al lado del otro (Design 02): son
            las dos mitades de la misma pregunta —cómo vamos y qué sigue— y apiladas empujaban la
            segunda fuera de la primera pantalla. En angosto se apilan solas. */}
        <div className="flex flex-col gap-3 xl:flex-row">
          <CurvaAvance
            inicio={plan?.inicio_plan ?? obra.fecha_inicio_plan}
            fin={plan?.fin_plan ?? obra.fecha_fin_plan}
            avancePct={obra.avance_pct}
            hoy={hoy}
          />
          {actividades && <Proximas actividades={actividades} obraId={obraId} hoy={hoy} />}
        </div>

        {/* LAS LECTURAS COMPLETAS, PLEGADAS. Lo que está bien y lo que no se puede medir no se
            perdió: dejó de competir por la primera pantalla con lo que hay que ir a resolver. */}
        {plan && (
          <details className="rounded-card border border-line bg-surface px-4 py-3" data-testid="lecturas-del-plan">
            <summary className="cursor-pointer select-none text-[12.5px] text-muted hover:text-ink">
              Lecturas del plan, una por una
            </summary>
            <div className="mt-3.5">
              <PlanVsRealResumen plan={plan} obraId={obraId} veComercial={veComercial} economia={economia} />
            </div>
          </details>
        )}

      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[352px]">
        <Ficha obra={obra} plan={plan} />
        {/* LO QUE FALTA PARA QUE LA OBRA PRODUZCA. Va en la columna de contexto y ABIERTO (Design
            canónico 02): estaba plegado al final del cuerpo, donde explicaba los «sin medir» de las
            métricas a dos pantallas de distancia y sólo si alguien lo abría. Sigue desapareciendo
            solo cuando no falta nada — un checklist entero en ✓ ocupa lugar sin decir nada. */}
        <ChecklistPreparacion obraId={obraId} ocultarSiCompleto enTarjeta />
        {partes && <UltimoMovimiento partes={partes} actividadDe={actividadDe} obraId={obraId} />}
        <div className="rounded-card border border-line bg-surface px-4 py-3">{editar}</div>
        {archivar && <div className="rounded-card border border-line bg-surface px-4 py-3">{archivar}</div>}
      </aside>
    </div>
  )
}
