import Link from 'next/link'
import type { ObraPanel, PlanVsReal, Restriccion } from '@/features/obras/types'
import { PlanVsRealResumen } from './PlanVsRealResumen'
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

/**
 * LO QUE FALTA CONFIGURAR PARA QUE LA OBRA SE PUEDA MEDIR — no es una alerta, es una lista de tareas.
 *
 * El dueño: *"Mostrar discretamente configuración faltante: Línea base · Responsable · HH plan ·
 * Presupuesto → Pendiente"*. Y «discretamente» es la palabra que manda: una obra sin línea base no
 * está en problemas, está sin configurar, y mezclar las dos cosas en el mismo bloque rojo enseña a
 * ignorar el bloque rojo.
 *
 * Cada línea es la razón por la que una comparación de PLAN vs REAL no existe: sin línea base no hay
 * desvío de plazo, sin HH plan no hay desvío de HH, sin presupuesto no hay desvío de costo. Por eso
 * está acá y no en una pantalla de configuración: se lee justo al lado del vacío que explica.
 */
export function configuracionPendiente(obra: ObraPanel, plan: PlanVsReal | null): { k: string }[] {
  return [
    { k: 'Línea base', falta: !plan?.actividades_con_baseline },
    { k: 'Responsable', falta: !obra.jefe_obra },
    { k: 'HH plan', falta: plan?.hh_plan == null && plan?.hh_estimada == null },
    { k: 'Presupuesto', falta: plan?.costo_presupuestado == null },
  ].filter((x) => x.falta).map(({ k }) => ({ k }))
}

export function TabResumen({
  obra, plan, abiertas, obraId, editar, archivar, veComercial = true,
}: {
  obra: ObraPanel
  plan: PlanVsReal | null
  abiertas: Restriccion[]
  obraId: string
  /** El bloque de edición, que la página arma con su action atada a esta obra. */
  editar: React.ReactNode
  /** Archivar o reactivar. Va al pie y no arriba: es la acción menos frecuente de la ficha. */
  archivar?: React.ReactNode
  /** El nivel Obras no ve margen. Ver `PlanVsRealResumen`: no es ocultar un número, es no explicar
   *  mal una ausencia — el dato ya viene NULL de la base. */
  veComercial?: boolean
}) {
  const alertas = alertasDeLaObra(obra, plan, abiertas)
  const pendientes = configuracionPendiente(obra, plan)

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

      {plan && <PlanVsRealResumen plan={plan} obraId={obraId} veComercial={veComercial} />}

      {/* La configuración que falta va DEBAJO del plan contra real y en el tono más bajo de la
          pantalla: explica los guiones de arriba, no compite con ellos. */}
      {pendientes.length > 0 && (
        <section data-testid="configuracion-pendiente">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">Falta configurar</h2>
          <dl className="grid gap-x-8 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            {pendientes.map((x: { k: string }) => (
              <div key={x.k} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5">
                <dt className="text-muted">{x.k}</dt>
                <dd className="text-faint">Pendiente</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

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
