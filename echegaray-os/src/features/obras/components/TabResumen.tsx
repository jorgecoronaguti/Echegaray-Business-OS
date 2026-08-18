import Link from 'next/link'
import type { ObraPanel, PlanVsReal, Restriccion } from '@/features/obras/types'
import { PlanVsRealResumen } from './PlanVsRealResumen'
import { ChecklistPreparacion } from './ChecklistPreparacion'
import { fecha, plataCorta } from './formato'

// EL RESUMEN DE LA OBRA — contesta UNA pregunta: ¿cómo está, y qué necesita atención?
//
// ═══ QUÉ REEMPLAZA, Y POR QUÉ (18/08/2026) ═══
//
// Tenía cuatro tarjetas de titular, dos tarjetas más abajo (Plazo e Impedimentos) y el bloque de
// desvíos en el medio: siete recuadros para seis números. El dueño lo prohibió textualmente —*"sin
// cards para cada dato"*, *"máximo 4 indicadores principales en una fila"*, *"aplicación de trabajo,
// no dashboard"*— y tenía razón por una razón que se ve al usarlo: cuando cada dato trae su propio
// borde, ninguno pesa más que otro y la pantalla deja de tener un mensaje.
//
// Ahora hay UNA franja con las cuatro cifras que se deciden, separadas por hairlines. Un solo
// recuadro, cuatro números, sin jerarquía inventada entre ellos.
//
// ═══ EL VACÍO SE DECLARA, NO SE RELLENA ═══
//
// *"Mostrar únicamente valores existentes y confiables… Si falta una punta: `Sin presupuesto` / `HH
// plan sin cargar`. No inventar desvíos."* Una obra sin presupuesto cargado no tiene un desvío de
// costo del 0%: no tiene desvío. La diferencia entre "no hay problema" y "no sé si hay problema" es
// exactamente lo que este módulo existe para no perder.

/** Una cifra del titular. `falta` es lo que hay que cargar para que exista — nunca un cero fingido. */
function Cifra({ k, v, sub, tono = 'ink' }: {
  k: string; v: string; sub?: string; tono?: 'ink' | 'neg' | 'warn' | 'pos'
}) {
  const color = { ink: 'text-ink', neg: 'text-neg', warn: 'text-warn', pos: 'text-pos' }[tono]
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0 sm:px-5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-faint">{k}</p>
      <p className={`mt-1 truncate text-[19px] font-semibold leading-none tabular-nums ${color}`}>{v}</p>
      {sub && <p className="mt-1.5 truncate text-[11px] leading-none text-faint">{sub}</p>}
    </div>
  )
}

/** Una línea de «requiere atención». Existe SÓLO si hay evidencia; nunca se dibuja en verde vacío. */
type Alerta = { clave: string; texto: string; tono: 'neg' | 'warn'; vista?: string }

export function alertasDeLaObra(
  obra: ObraPanel, plan: PlanVsReal | null, abiertas: Restriccion[],
): Alerta[] {
  const a: Alerta[] = []
  const atrasadas = plan?.actividades_atrasadas ?? 0
  if (atrasadas > 0) {
    a.push({
      clave: 'atrasadas', tono: 'neg', vista: 'cronograma',
      texto: `${atrasadas} actividad${atrasadas === 1 ? '' : 'es'} con fin previsto vencido y sin completar`,
    })
  }
  if (abiertas.length > 0) {
    const vencidos = obra.restricciones_vencidas ?? 0
    a.push({
      clave: 'impedimentos', tono: vencidos > 0 ? 'neg' : 'warn', vista: 'cronograma',
      texto: `${abiertas.length} impedimento${abiertas.length === 1 ? '' : 's'} sin resolver` +
        (vencidos > 0 ? ` · ${vencidos} con la fecha vencida` : ''),
    })
  }
  // LOS DOS DESVÍOS SÓLO EXISTEN SI LA VISTA LOS CALCULÓ. `desvio_hh_pct` viene null cuando falta
  // el plan o falta el real; `desvio_costo_pct`, cuando el presupuesto es 0 o no hay un comprobante
  // imputado. En los dos casos el null significa "no sé", y "no sé" no es una alerta.
  if (plan?.desvio_hh_pct != null && plan.desvio_hh_pct > 10) {
    a.push({
      clave: 'hh', tono: plan.desvio_hh_pct > 25 ? 'neg' : 'warn', vista: 'personal',
      texto: `HH real ${plan.desvio_hh_pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}% por encima del plan`,
    })
  }
  if (plan?.desvio_costo_pct != null && plan.desvio_costo_pct > 5) {
    a.push({
      clave: 'costo', tono: plan.desvio_costo_pct > 15 ? 'neg' : 'warn', vista: 'economia',
      texto: `Costo real ${plan.desvio_costo_pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}% por encima del presupuesto`,
    })
  }
  return a
}

/*
 * ═══ ACÁ VIVÍA `configuracionPendiente()`, Y LA REEMPLAZA EL CHECKLIST DE PREPARACIÓN ═══
 *
 * Miraba cuatro cosas —línea base, responsable, HH plan, presupuesto— y las publicaba como cuatro
 * rótulos con la palabra «Pendiente» al lado. El defecto no era el criterio: era que «Pendiente» no
 * es trabajo. No decía cuánto faltaba (0 de 344 o 343 de 344 se veían igual), no decía dónde
 * resolverlo, y no miraba ni el cronograma, ni el personal asignado, ni la carpeta de Drive, ni el
 * contrato — cuatro de las siete cosas que hay que tener listas para que una obra arranque.
 *
 * Se reemplaza, NO se suma: dos listas de «lo que falta» en la misma pantalla se contradicen el día
 * que a una se le agrega un criterio y a la otra no. La única lista vive en
 * `services/preparacion.ts` (pura, con prueba) y la dibuja `<ChecklistPreparacion>`.
 */

export function TabResumen({
  obra, plan, abiertas, obraId, editar, archivar,
}: {
  obra: ObraPanel
  plan: PlanVsReal | null
  abiertas: Restriccion[]
  obraId: string
  /** El bloque de edición, que la página arma con su action atada a esta obra. */
  editar: React.ReactNode
  /** Archivar o reactivar. Va al pie y no arriba: es la acción menos frecuente de la ficha. */
  archivar?: React.ReactNode
}) {
  const alertas = alertasDeLaObra(obra, plan, abiertas)

  // PLAZO: el desvío contra la LÍNEA BASE, que es lo único contra lo que un desvío significa algo.
  // Sin baseline sellada no hay desvío de plazo — hay un plan, y un plan no se desvía de sí mismo.
  const dias = plan?.desvio_plazo_dias ?? null
  const plazo = dias == null ? '—' : dias === 0 ? 'en fecha' : `${dias > 0 ? '+' : ''}${dias} días`
  const plazoSub = dias == null
    ? (plan?.actividades_con_baseline ? 'sin fin previsto' : 'línea base sin sellar')
    : `fin previsto ${fecha(plan?.fin_plan)}`

  // HH: «real / plan». El plan sale de las actividades y, si no hay, del presupuesto.
  const hhPlan = plan?.hh_plan ?? plan?.hh_estimada ?? null
  const hhReal = plan?.hh_real ?? null
  const hh = hhPlan == null && hhReal == null
    ? '—'
    : `${hhReal == null ? '—' : Math.round(hhReal)} / ${hhPlan == null ? '—' : Math.round(hhPlan)}`
  const hhSub = hhPlan == null ? 'HH plan sin cargar' : hhReal == null ? 'HH real sin imputar' : undefined

  return (
    <div className="space-y-6">
      {/* ═══ EL TITULAR: CUATRO CIFRAS, UN SOLO RECUADRO ═══ */}
      <div
        className="grid grid-cols-2 divide-line rounded-lg border border-line bg-surface sm:grid-cols-4 sm:divide-x"
        data-testid="titular-obra"
      >
        <Cifra
          k="Avance"
          v={obra.avance_pct == null ? '—' : `${obra.avance_pct}%`}
          sub={obra.avance_pct == null
            ? `${obra.n_actividades} actividades, ninguna con fecha`
            : `${obra.n_actividades_medidas} de ${obra.n_actividades} actividades`}
        />
        <Cifra k="Plazo" v={plazo} sub={plazoSub} tono={dias != null && dias > 0 ? 'neg' : 'ink'} />
        <Cifra k="HH" v={hh} sub={hhSub} tono={plan?.desvio_hh_pct != null && plan.desvio_hh_pct > 10 ? 'warn' : 'ink'} />
        <Cifra
          k="Costo"
          v={plataCorta(obra.costo_real)}
          sub={plan?.costo_presupuestado == null ? 'sin presupuesto' : `de ${plataCorta(plan.costo_presupuestado)} presupuestados`}
          tono={plan?.desvio_costo_pct != null && plan.desvio_costo_pct > 5 ? 'neg' : 'ink'}
        />
      </div>

      {/* ═══ REQUIERE ATENCIÓN ═══
          Va ARRIBA del plan contra real: es lo accionable, y lo accionable se lee primero. Cuando
          no hay nada, no se dibuja un recuadro verde diciendo que todo está bien — se dice en una
          línea y se sigue. Un "todo en orden" del tamaño de una alerta enseña a ignorar alertas. */}
      <section data-testid="requiere-atencion">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Requiere atención</h2>
        {alertas.length === 0 ? (
          <p className="text-[13px] text-muted">Nada pendiente con evidencia cargada.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {alertas.map((al) => (
              <li key={al.clave}>
                <Link
                  href={`/obras/${obraId}?vista=${al.vista ?? 'resumen'}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-surface-quiet"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${al.tono === 'neg' ? 'bg-neg' : 'bg-warn'}`} />
                  <span className="min-w-0 flex-1 text-ink">{al.texto}</span>
                  <span className="shrink-0 text-faint">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {plan && <PlanVsRealResumen plan={plan} obraId={obraId} />}

      {/* LO QUE FALTA PARA QUE LA OBRA PRODUZCA va DEBAJO del plan contra real y PLEGADO: explica
          los guiones de arriba, no compite con ellos. Y desaparece solo cuando no falta nada — un
          checklist entero en ✓ ocupa lugar sin decir nada. */}
      <ChecklistPreparacion obraId={obraId} plegado ocultarSiCompleto />

      {/* El plazo y el jefe de obra son ficha, no titular: se consultan, no se deciden todos los
          días. Por eso van al pie y en dos columnas de definición, sin recuadro propio. */}
      <section>
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Plazo y responsable</h2>
        <dl className="grid gap-x-8 gap-y-1.5 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          {([
            ['Inicio previsto', fecha(obra.fecha_inicio_plan)],
            ['Fin previsto', fecha(obra.fecha_fin_plan)],
            ['Inicio real', fecha(obra.fecha_inicio_real)],
            ['Jefe de obra', obra.jefe_obra ?? '—'],
          ] as const).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {editar}

      {archivar}
    </div>
  )
}
