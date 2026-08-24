// 04 · SOLAPA RECURSOS Y HH — el mismo motor de la 08, sobre UNA actividad.
//
// ═══ NO HAY UNA SEGUNDA MATEMÁTICA ACÁ ═══
//
// `duracionDias` y `dotacionNecesaria` son las mismas funciones que usa la 08, y las dos son el
// puerto de `public.duracion_dias` / `public.dotacion_necesaria`. Este archivo elige los INSUMOS
// —cuántas HH faltan, con qué gente, con qué jornada, con cuántos días técnicos— y dibuja. Si acá
// se hiciera la cuenta «a mano», el panel y la pantalla de dotación contestarían distinto sobre la
// misma actividad y ninguna de las dos sería verificable.
//
// ═══ LA DOTACIÓN VIAJA EN LA URL, Y ESO ES A PROPÓSITO ═══
//
// `?dot=` igual que en la 08: sin estado en el navegador, el mismo link abre la misma simulación
// del otro lado del chat. Y mientras está en la URL NO es un plan: aplicarla al plan es la 08, que
// escribe `dotacion_prevista` sobre el frente entero.

import { hh as fmtHH } from './formato'
import { dotacionNecesaria, duracionDias } from '../services/dotacion'
import { hhRestantes } from '../services/cronogramaMotor'
import { restriccionesDe } from '../services/panelTarea'
import { MAGNITUD, produccionDeCuadrilla } from '@/features/base-maestra/services/vocabulario'
import type { NodoObra } from '../services/wbs'
import type { ContextoTarea } from '../services/panelTareaService'

/** La jornada por defecto es la misma que la de la base (`obra_canonica.jornada_horas`, default 8).
 *  Se usa sólo para poder mostrar una duración cuando la obra no se pudo leer, y en ese caso la
 *  restricción «Jornada» NO se dibuja: el número está, pero nadie lo declaró. */
const JORNADA_DEFECTO = 8

const n1 = (v: number | null) =>
  (v == null ? null : v.toLocaleString('es-AR', { maximumFractionDigits: 1 }))

const enCriollo = (iso: string) => iso.split('-').reverse().join('/')

export function PanelTareaRecursos({ nodo, contexto, dotacion, alCambiarDotacion }: {
  nodo: NodoObra
  contexto: ContextoTarea
  dotacion: number
  /** El stepper es estado del CLIENTE desde el 23/08 (Design §16): antes cada ± era un viaje
   *  entero al servidor por la URL. La simulación sigue sin ser el plan. */
  alCambiarDotacion: (n: number) => void
}) {
  const jornada = contexto.jornadaHoras ?? JORNADA_DEFECTO
  // Los días técnicos son de la ACTIVIDAD y salen de su marca, no de tener días de plan: `manual`
  // es el default de las 344 filas traídas del tracker, y con esa regla toda la obra sería técnica.
  const diasTecnicos = nodo.tiempo_tecnico ? (nodo.dias_plan ?? 0) : 0
  const { hh, base: baseHH } = hhRestantes({
    hh_plan: nodo.hh_plan, hh_real: nodo.hh_real, avance_pct: nodo.avance_pct,
  })
  const dias = duracionDias(hh, dotacion, jornada, diasTecnicos)
  const enTope = nodo.tope_frente != null && dotacion >= nodo.tope_frente
  const restricciones = restriccionesDe({
    topeFrente: nodo.tope_frente,
    tiempoTecnico: nodo.tiempo_tecnico,
    diasPlan: nodo.dias_plan,
    jornadaHoras: contexto.jornadaHoras,
    diasHabiles: contexto.diasHabiles,
    capacidadCuadrilla: contexto.capacidadCuadrilla,
    cuadrilla: nodo.cuadrilla,
  })
  // El esfuerzo de ESTA actividad: HH del plan sobre la cantidad objetivo. No se toma el del
  // análisis de la tarea tipo — la producción que se le pide al frente sale de lo que se planificó
  // acá, que es contra lo que el jefe de obra puede compararse.
  const esfuerzo = nodo.hh_plan != null && nodo.cantidad_objetivo != null && nodo.cantidad_objetivo > 0
    ? nodo.hh_plan / nodo.cantidad_objetivo
    : null
  const produccion = produccionDeCuadrilla(esfuerzo, contexto.capacidadCuadrilla, contexto.jornadaHoras)

  return (
    <section data-testid="panel-recursos">
      <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink">Dotación → duración</h3>
      <div className="flex flex-wrap items-center gap-3">
        <Stepper valor={dotacion} alCambiar={alCambiarDotacion} enTope={enTope} nombre={nodo.nombre} />
        <div className="ml-auto text-right">
          <div className="text-[10px] uppercase tracking-[0.05em] text-faint">Duración</div>
          <div className="font-mono text-[18px] font-semibold tabular-nums text-ink" data-testid="duracion-simulada">
            {dias == null
              ? <span className="font-sans text-[12.5px] font-normal text-faint">{hh == null ? 'sin HH' : 'sin gente'}</span>
              : `${n1(dias)} d`}
          </div>
        </div>
      </div>
      {/* EL NÚMERO VIENE CON SU BASE. «14 días» calculados sobre el plan y «14 días» calculados
          sobre el rendimiento observado no valen lo mismo, y a simple vista son iguales. */}
      <p className="mt-1.5 text-[11.5px] text-muted">
        {hh == null
          ? 'Sin HH cargadas no hay duración que calcular: lo que falta es la carga, no el trabajo.'
          : (
            <>
              Sobre {fmtHH(hh)} HH que faltan · base: <strong className="font-normal text-ink-soft">{baseHH}</strong>
              {diasTecnicos > 0 && <> · {diasTecnicos} d técnicos que no se comprimen</>}
            </>
          )}
      </p>
      {enTope && (
        <p className="mt-2 border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn">
          Tope del frente: {nodo.tope_frente} personas. Más gente no acorta el plazo.
        </p>
      )}

      {/* PRODUCCIÓN DE CUADRILLA — la cuarta magnitud, y la única que un jefe de obra puede
          verificar mirando el frente: cuánto tiene que salir hoy. Es la MISMA cuenta que la
          duración, contada al derecho. Se dibuja sólo cuando existen los tres insumos (esfuerzo,
          capacidad ponderada y jornada): con uno estimado sería un objetivo inventado, y un
          objetivo inventado se persigue igual que uno medido. */}
      {produccion !== null && (
        <p className="mt-2 text-[11.5px] text-muted" data-testid="produccion-cuadrilla">
          {MAGNITUD.produccion.rotulo}:{' '}
          <strong className="font-mono font-normal tabular-nums text-ink-soft">
            {produccion.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
          </strong>{' '}
          {MAGNITUD.produccion.unidad(nodo.unidad)}
        </p>
      )}

      <AlReves nodo={nodo} contexto={contexto} hh={hh} jornada={jornada} />

      <div className="mt-4 border-t border-line pt-3">
        <h3 className="mb-1.5 text-[12.5px] font-semibold text-ink">Restricciones que respeta el cálculo</h3>
        {restricciones.length === 0
          ? (
            <p className="text-[12px] leading-relaxed text-muted">
              Esta actividad no declara ninguna: sin tope de frente, sin tiempo técnico y sin jornada
              leída, la duración sale de dividir las HH por la gente y nada la limita. Eso no es un
              plan sin restricciones — es un plan al que nadie se las cargó.
            </p>
          )
          : (
            <ul data-testid="restricciones-calculo">
              {restricciones.map((r) => (
                <li key={r.clave} className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
                  <span className="min-w-0">
                    <span className="block text-[12px] text-ink-soft">{r.clave}</span>
                    <span className="block text-[10.5px] text-faint">{r.fuente}</span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted">{r.valor}</span>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  )
}

/** El `+` se apaga en el tope del frente: un botón que responde sin cambiar nada enseña a
 *  desconfiar de la pantalla. Es el mismo comportamiento que el stepper de la 08. */
function Stepper({ valor, alCambiar, enTope, nombre }: {
  valor: number; alCambiar: (n: number) => void; enTope: boolean; nombre: string
}) {
  const caja = 'flex h-[30px] w-[30px] items-center justify-center border border-line text-[14px]'
  return (
    <div className="flex items-center" data-testid="stepper-dotacion">
      {valor > 0
        ? (
          <button type="button" onClick={() => alCambiar(valor - 1)} aria-label={`Quitar una persona de ${nombre}`}
            className={`${caja} rounded-l-control text-ink-soft hover:bg-surface-quiet`}>−</button>
        )
        : <span className={`${caja} rounded-l-control text-faint`} aria-hidden>−</span>}
      <span className="flex h-[30px] w-[38px] items-center justify-center border-y border-line font-mono text-[14px] font-semibold tabular-nums text-ink">
        {valor}
      </span>
      {enTope
        ? <span className={`${caja} rounded-r-control text-faint`} title="Más gente no acorta el plazo">+</span>
        : (
          <button type="button" onClick={() => alCambiar(valor + 1)} aria-label={`Sumar una persona a ${nombre}`}
            className={`${caja} rounded-r-control text-ink-soft hover:bg-surface-quiet`}>+</button>
        )}
    </div>
  )
}

/**
 * AL REVÉS: fijá la fecha y el sistema dice la dotación.
 *
 * ═══ LA FECHA ES LA DEL PLAN, Y NO UNA CUALQUIERA ═══
 *
 * El contrato visual dibuja un campo de fecha libre. Acá se contesta sobre `fin_plan`, que es la
 * fecha que la actividad YA prometió: es la única que alguien se comprometió a cumplir, y contestar
 * sobre una fecha inventada en el momento sería simular contra nada. Cuando no hay fin de plan se
 * dice, en vez de ofrecer una fecha por defecto que después se lee como un compromiso.
 *
 * `null` de `dotacionNecesaria` es «no alcanza» y NO «0 personas»: el tope del frente impide llegar,
 * y prometer una fecha que el tope impide se descubre el día de la entrega.
 */
function AlReves({ nodo, contexto, hh, jornada }: {
  nodo: NodoObra; contexto: ContextoTarea; hh: number | null; jornada: number
}) {
  const dias = contexto.diasHastaFinPlan
  const necesaria = dotacionNecesaria(hh, dias, jornada, nodo.tope_frente)
  return (
    <div className="mt-3 rounded-card border border-line bg-surface-quiet px-3 py-2.5" data-testid="cuenta-inversa">
      <p className="mb-1 text-[11.5px] text-muted">Al revés: fijá la fecha</p>
      {!nodo.fin_plan && (
        <p className="text-[12px] text-muted">
          Esta actividad no tiene fin de plan: sin una fecha comprometida no hay cuenta inversa que
          hacer.
        </p>
      )}
      {nodo.fin_plan && dias == null && (
        <p className="text-[12px] text-warn">
          El fin de plan ({enCriollo(nodo.fin_plan)}) ya pasó, o no pude contar los días hábiles que
          faltan. Una fecha vencida no se contesta con una dotación.
        </p>
      )}
      {nodo.fin_plan && dias != null && (
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[12.5px] text-ink-soft">Terminar el {enCriollo(nodo.fin_plan)}</span>
          <span className="text-[10.5px] text-faint">{dias} d hábiles</span>
          <span className="text-[12.5px] text-ink-soft">→</span>
          <span className={`font-mono text-[13.5px] font-semibold tabular-nums ${necesaria == null ? 'text-neg' : 'text-ink'}`}>
            {hh == null
              ? <span className="font-sans text-[12px] font-normal text-faint">sin HH</span>
              : (necesaria == null ? 'no alcanza' : `${necesaria} pers.`)}
          </span>
        </p>
      )}
    </div>
  )
}
