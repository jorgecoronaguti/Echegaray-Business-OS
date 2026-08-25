'use client'

// 08 · EL SIMULADOR DE DOTACIÓN — el what-if que responde mientras se toca.
//
// ═══ POR QUÉ EL STEPPER DEJÓ DE NAVEGAR (Design 23/08 · 08) ═══
//
// Cada clic era un `<Link prefetch={false}>`: una vuelta al servidor, la página remontada y el esqueleto de la tabla
// entre medio. Mover un frente de 2 a 6 personas costaba cuatro navegaciones para ver cuatro veces
// la misma tabla con un número distinto. La cuenta —`HH ÷ (capacidad × jornada)` más los días
// técnicos— es la MISMA función pura que corre el servidor (`simularFrente`, probada contra
// `frentesDe` en `dotacion.test.ts`), así que correrla acá no puede dar otro número.
//
// ═══ Y LA URL SIGUE SIENDO EL LINK COMPARTIBLE ═══
//
// `history.replaceState` la sincroniza sin navegar — el mismo patrón que el filtro del árbol de
// Tareas. El link que se manda por chat abre exactamente esta simulación del otro lado; lo que no
// hace es empujar una entrada al historial por cada clic del stepper.
//
// ═══ LO QUE SIGUE VINIENDO DEL SERVIDOR ═══
//
// Los días hábiles de la obra (con sus feriados y no laborables) y el índice del fin de plan. El
// navegador NO tiene el calendario de la obra, y recalcular uno acá sería una segunda definición
// del mismo calendario que el día que aparezca un feriado nuevo daría otra fecha que el resto del
// OS. Acá se indexa el arreglo que el servidor mandó; nada más.

import { useMemo, useState } from 'react'
import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { resumenSimulacion, simularFrente, sumaCompleta, type Frente } from '../services/dotacion'
import {
  celdasDelImpacto, estadoDelImpacto, type CeldaImpacto, type Direccion,
} from '../services/impactoDotacion'

const n0 = (v: number | null) => (v == null ? null : Math.round(v).toLocaleString('es-AR'))
const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null)

export interface Props {
  obraId: string
  /** Los frentes ya calculados por el servidor. Sus magnitudes invariantes —HH restantes, tope,
   *  días técnicos— no dependen de la dotación: son las que alimentan el what-if. */
  frentes: Frente[]
  /** Las dotaciones que venían en la URL. Sólo ésas se escriben al aplicar: un frente que nadie
   *  tocó no tiene por qué recibir la dotación que la pantalla le mostró por defecto. */
  dotIniciales: Record<string, number>
  jornada: number
  /** Los días hábiles de la obra desde el arranque de la simulación, resueltos por el servidor. */
  habiles: string[]
  /** El índice de día hábil del fin de plan. Negativo si el plan ya venció. `null` sin plan. */
  idxFinPlan: number | null
  /** Cuánta gente hay de verdad en la obra. `null` cuando no se pudo leer — y ahí no se compara. */
  disponibles: number | null
  puedeAplicar: boolean
  aplicar: AccionFormulario
}

export function SimuladorDotacion({
  obraId, frentes, dotIniciales, jornada, habiles, idxFinPlan, disponibles, puedeAplicar, aplicar,
}: Props) {
  const [dot, setDot] = useState<Record<string, number>>(dotIniciales)

  const sincronizarUrl = (siguiente: Record<string, number>) => {
    const p = new URLSearchParams(window.location.search)
    p.delete('dot')
    for (const [k, v] of Object.entries(siguiente)) p.append('dot', `${k}~${v}`)
    const q = p.toString()
    window.history.replaceState(null, '', `/obras/${obraId}/dotacion${q ? `?${q}` : ''}`)
  }

  const mover = (clave: string, valor: number) => {
    const siguiente = { ...dot, [clave]: Math.max(0, Math.min(99, valor)) }
    setDot(siguiente)
    sincronizarUrl(siguiente)
  }
  const volverAlPlan = () => { setDot({}); sincronizarUrl({}) }

  const simulados = useMemo(
    () => frentes.map((f) => {
      const pedida = dot[f.clave] ?? f.dotacion
      return { frente: f, pedida, sim: simularFrente(f, pedida, jornada, habiles) }
    }),
    [frentes, dot, jornada, habiles],
  )
  const resumen = useMemo(
    () => resumenSimulacion(simulados.map((s) => s.sim), idxFinPlan, habiles),
    [simulados, idxFinPlan, habiles],
  )

  // EL LADO «PLAN» DE LA COMPARACIÓN se corre con la MISMA función que el lado simulado: si fueran
  // dos cuentas, la columna de la izquierda y la de la derecha del canónico dirían números que no
  // se pueden restar entre sí.
  const plan = useMemo(
    () => resumenSimulacion(
      frentes.map((f) => simularFrente(f, f.dotacionPlan, jornada, habiles)), idxFinPlan, habiles,
    ),
    [frentes, jornada, habiles, idxFinPlan],
  )

  const tocados = Object.keys(dot).length
  const aEscribir = simulados.filter((s) => s.sim.dotacion > 0 && s.frente.clave in dot).length
  const excede = disponibles != null && resumen.genteTotal > disponibles
  const sinDotacion = simulados.filter((s) => s.sim.dotacion === 0 && s.sim.limite !== 'terminado').length
  const noEjecutables = simulados.filter((s) => s.sim.recortada).length
  // Las HH que faltan NO admiten sumandos ausentes: un total al que le falta una parte no es un
  // total, y ése es el número que fija el plazo de toda la pantalla.
  const hhRestantes = sumaCompleta(frentes.map((f) => f.hhRestantes))

  const insumos = {
    plan, simulado: resumen, hhRestantes, noEjecutables, tocados, disponibles,
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4" data-testid="simulador-dotacion">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">Simulación de dotación</h2>
        {tocados > 0 && (
          <button
            type="button" onClick={volverAlPlan} data-testid="volver-al-plan"
            className="text-[12px] text-muted hover:text-ink"
          >
            Volver al plan
          </button>
        )}
      </div>

      <TablaFrentes filas={simulados} mover={mover} />

      {/* ═══ EL IMPACTO, COMO LO DIBUJA EL CANÓNICO 08 ═══
          Eran tres cifras sueltas —gente, fin, contra el plan— que dicen dónde se llegó y no de
          dónde se salió: mover un stepper cambiaba el número y no había con qué compararlo salvo la
          memoria. Ahora cada celda trae el valor del PLAN y, al lado, el simulado con su flecha. */}
      <div className="mt-4 overflow-hidden rounded-card border border-line" data-testid="impacto-simulacion">
        <div className="flex items-center gap-2.5 border-b border-surface-sunken px-4 py-2.5">
          <h3 className="text-[13px] font-semibold text-ink">Impacto de la simulación</h3>
          <Estado estado={estadoDelImpacto(insumos)} />
        </div>
        <div className="flex flex-wrap">
          {celdasDelImpacto(insumos).map((c) => <Celda key={c.clave} c={c} />)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-end gap-4">
        <AplicarAlPlan dot={dot} puedeAplicar={puedeAplicar} aEscribir={aEscribir} aplicar={aplicar} />
      </div>

      {/* LOS DOS NÚMEROS YA ESTÁN EN EL ESTADO DE ARRIBA («pide 9 y la obra tiene 5»): acá va lo
          único que el estado no puede decir, que es qué hacer con eso. Repetir la cuenta obligaría
          a compararla con la de 40px más arriba antes de creerle a alguna de las dos. */}
      {excede && (
        <p className="mt-3 border-l-[3px] border-neg bg-neg-soft px-3 py-2 text-[12.5px] text-ink-soft">
          Hay que traer gente de otra obra o correr un frente.
        </p>
      )}
      {!excede && sinDotacion > 0 && (
        <p className="mt-3 border-l-[3px] border-warn bg-warn-soft px-3 py-2 text-[12.5px] text-ink-soft">
          {sinDotacion === 1
            ? '1 frente sin dotación: no tiene fecha de fin.'
            : `${sinDotacion} frentes sin dotación: no tienen fecha de fin.`}
        </p>
      )}
    </div>
  )
}

type FilaSimulada = { frente: Frente; pedida: number; sim: ReturnType<typeof simularFrente> }

function TablaFrentes({ filas, mover }: {
  filas: FilaSimulada[]
  mover: (clave: string, valor: number) => void
}) {
  if (!filas.length) return <p className="text-[12px] text-muted">Esta obra no tiene actividades ejecutables cargadas.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse">
        <thead>
          <tr className="border-b border-line-strong text-[10px] uppercase tracking-[0.05em] text-faint">
            <th className="px-2 py-1.5 text-left font-normal">Frente</th>
            <th className="px-2 py-1.5 text-right font-normal">HH rest.</th>
            <th className="px-2 py-1.5 text-center font-normal">Dotación</th>
            <th className="px-2 py-1.5 text-right font-normal">Días</th>
            <th className="px-2 py-1.5 text-right font-normal">Fin</th>
            <th className="px-2 py-1.5 text-left font-normal">Límite</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ frente: f, pedida, sim }) => (
            <tr key={f.clave} className="border-b border-surface-sunken">
              <td className="px-2 py-1.5 text-left">
                <div className="truncate text-[12.5px] text-ink">{f.nombre}</div>
                {f.subtitulo && (
                  <div className={`text-[10.5px] ${f.subtituloTono === 'warn' ? 'text-warn' : 'text-faint'}`}>
                    {f.subtitulo}
                  </div>
                )}
              </td>
              <td className={`px-2 py-1.5 text-right font-mono text-[12px] tabular-nums ${f.hhRestantes == null ? 'text-faint' : 'text-ink-soft'}`}>
                {n0(f.hhRestantes) ?? 'sin dato'}
                {f.sinDato > 0 && (
                  <div className="font-sans text-[9.5px] text-warn">
                    {f.sinDato === 1 ? '1 actividad sin HH' : `${f.sinDato} actividades sin HH`}
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5">
                <Stepper frente={f} valor={sim.dotacion} mover={mover} />
                {/* EL DELTA CONTRA EL PLAN, sólo cuando lo hay: el frente que no se tocó no gasta
                    una línea en decir que no cambió. */}
                {sim.dotacion !== f.dotacionPlan
                  ? (
                    <div className={`mt-0.5 text-center text-[10px] ${sim.dotacion > f.dotacionPlan ? 'text-warn' : 'text-pos'}`}>
                      {sim.dotacion > f.dotacionPlan ? '+' : ''}{sim.dotacion - f.dotacionPlan} vs plan
                    </div>
                    )
                  : <div className="mt-0.5 text-center text-[10px] text-faint">{f.base}</div>}
                {/* EL TOPE, EN PALABRAS (canónico 08). El `+` apagado dice que no se puede; esto
                    dice por qué, que es lo único que cambia una decisión. `recortada` es distinto:
                    ahí la URL pidió más de lo que entra y el motor calculó con menos — un stepper
                    que muestra 8 mientras el motor usó 4 enseña a desconfiar del número. */}
                {sim.recortada && (
                  <div className="mt-0.5 text-center text-[10px] text-neg" data-testid="aviso-recorte">
                    pediste {pedida}: el frente entra {f.tope}
                  </div>
                )}
                {!sim.recortada && sim.limite === 'tope del frente' && (
                  <div className="mt-0.5 text-center text-[10px] text-warn" data-testid="aviso-tope">
                    tope {f.tope}: más gente no acelera
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-[17px] font-semibold text-ink tabular-nums">
                {sim.dias == null
                  ? <span className="font-sans text-[12.5px] font-normal text-faint">—</span>
                  : sim.dias.toLocaleString('es-AR', { maximumFractionDigits: 1 })}
                {/* Un frente que no baja de N días por más gente que se le ponga tiene que decir
                    por qué: el curado son días fijos, no trabajo que se pueda repartir. */}
                {f.diasTecnicos > 0 && sim.dias != null && (
                  <div className="font-sans text-[10px] font-normal text-warn">{f.diasTecnicos} d técnicos</div>
                )}
              </td>
              {/* SIN DÍAS Y SIN FECHA NO SON LO MISMO: «sin plan» es que falta el insumo; con la
                  dotación tan baja que el frente se va del calendario que el servidor mandó, lo que
                  falta es gente, no dato. Decir «sin plan» ahí manda a cargar algo que ya está. */}
              <td className={`px-2 py-1.5 text-right font-mono text-[12px] tabular-nums ${sim.fin ? 'text-ink-soft' : 'text-faint'}`}>
                {fmt(sim.fin) ?? (sim.dias == null ? 'sin plan' : 'fuera de calendario')}
              </td>
              <td className={`px-2 py-1.5 text-left text-[11.5px] ${
                sim.limite === 'tope del frente' ? 'text-warn'
                  : (sim.limite === 'sin gente' ? 'text-faint' : (sim.limite === 'terminado' ? 'text-pos' : 'text-muted'))
              }`}>
                {sim.limite}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * EL STEPPER DEL CANÓNICO 08 — `− valor +`, 34px de lado, el `+` en el amarillo de la marca.
 *
 * La medida es `--os-control-h` (34px), que es la altura de control del sistema: la maqueta dibuja
 * exactamente eso y el token ya existía. El valor va en mono 17/600 porque es el número que se
 * mueve — el único de la fila que cambia mientras se toca, y el que la vista tiene que devolver a
 * la vista periférica sin que haya que buscarlo.
 *
 * El `+` se apaga en el tope del frente: más gente no acorta el plazo, y un botón que responde sin
 * cambiar nada enseña a desconfiar de la pantalla. Desde el canónico eso ADEMÁS se dice con
 * palabras debajo: un botón gris explica que no se puede, no explica por qué.
 */
function Stepper({ frente, valor, mover }: {
  frente: Frente
  valor: number
  mover: (clave: string, valor: number) => void
}) {
  const enTope = frente.tope != null && valor >= frente.tope
  const caja = 'flex h-control w-[34px] shrink-0 items-center justify-center rounded-control text-[15px]'
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        type="button" onClick={() => mover(frente.clave, valor - 1)} disabled={valor <= 0}
        aria-label={`Quitar una persona de ${frente.nombre}`}
        className={`${caja} border border-line ${valor > 0 ? 'text-ink hover:bg-surface-quiet' : 'cursor-not-allowed text-faint'}`}
      >
        −
      </button>
      <span
        className="min-w-[34px] text-center font-mono text-[17px] font-semibold text-ink tabular-nums"
        data-testid="dotacion-valor"
      >
        {valor}
      </span>
      <button
        type="button" onClick={() => mover(frente.clave, valor + 1)} disabled={enTope}
        aria-label={`Sumar una persona a ${frente.nombre}`}
        title={enTope ? `Tope del frente: ${frente.tope} personas. Más gente no acorta el plazo.` : undefined}
        // EL AMARILLO ES LA MARCA, NO UN ESTADO: acá marca cuál de los dos botones es el gesto
        // principal —sumar gente— igual que en la maqueta. Apagado vuelve a ser una caja neutra.
        className={`${caja} ${enTope
          ? 'cursor-not-allowed border border-line text-faint'
          : 'bg-marca text-ink hover:opacity-90'}`}
      >
        +
      </button>
    </div>
  )
}

/**
 * APLICAR LA SIMULACIÓN AL PLAN — el botón que convierte el what-if en `dotacion_prevista`.
 *
 * El rótulo dice a cuántos frentes toca de verdad. «Aplicar al plan» sobre una pantalla donde nadie
 * movió un stepper no escribiría nada y diría que sí; y los frentes en 0 quedan afuera porque cero
 * personas no es un plan, es la ausencia de uno.
 *
 * Las dotaciones viajan como campos ocultos con el MISMO formato que la URL (`frente~n`): la
 * pantalla y la escritura no pueden entender distinto el mismo texto. El servidor las vuelve a
 * recortar por el tope del frente y recalcula qué actividades toca — la lista de actividades no
 * viaja desde el navegador.
 */
function AplicarAlPlan({ dot, puedeAplicar, aEscribir, aplicar }: {
  dot: Record<string, number>
  puedeAplicar: boolean
  aEscribir: number
  aplicar: AccionFormulario
}) {
  if (!puedeAplicar) {
    return (
      <p className="max-w-[280px] text-[11.5px] text-faint">
        Esto simula. Aplicarlo al plan es de Administración y de la jefatura de obra.
      </p>
    )
  }
  return (
    <FormAccion
      accion={aplicar}
      testid="form-aplicar-dotacion"
      enviar={aEscribir === 1 ? 'Aplicar al plan (1 frente)' : `Aplicar al plan (${aEscribir} frentes)`}
      mensajeOk="Dotación aplicada."
      bloqueado={aEscribir === 0}
      motivoBloqueo="Movés un stepper y se habilita: no hay ninguna dotación elegida para guardar."
    >
      {Object.entries(dot).map(([clave, n]) => (
        <input key={clave} type="hidden" name="dot" value={`${clave}~${n}`} />
      ))}
    </FormAccion>
  )
}

/** La pastilla de estado de la cabecera del impacto. Sin caja de color de fondo: es una lectura,
 *  no una alarma — el rojo del texto ya dice que algo no cierra. */
function Estado({ estado }: { estado: { texto: string; tono: 'neg' | 'warn' | 'pos' } }) {
  const clase = estado.tono === 'neg' ? 'text-neg' : (estado.tono === 'warn' ? 'text-warn' : 'text-pos')
  return (
    <span className={`ml-auto text-[11.5px] ${clase}`} data-testid="estado-impacto">{estado.texto}</span>
  )
}

const FLECHA: Record<Direccion, string> = { sube: '↑', baja: '↓', igual: '=' }

/**
 * UNA CELDA DEL IMPACTO — el valor del plan en mono de 18/600 y el simulado al lado, más chico.
 *
 * Las medidas son las del canónico 08: celda `flex:1 minWidth:170px`, padding 12/16, hairline a la
 * derecha y abajo, rótulo de 10,5px, cifra de 18px, detalle de 11px.
 *
 * NULL SE DICE CON SU PALABRA. Una celda sin dato muestra «sin dato» en `faint`, no un guión: el
 * guión se lee como cero cuando la columna de al lado tiene números.
 */
function Celda({ c }: { c: CeldaImpacto }) {
  const clase = c.tono === 'neg' ? 'text-neg' : (c.tono === 'pos' ? 'text-pos' : 'text-muted')
  return (
    <div
      className="min-w-[170px] flex-1 border-b border-r border-surface-sunken px-4 py-3"
      data-celda={c.clave}
    >
      <div className="whitespace-nowrap text-[10.5px] tracking-[0.04em] text-faint">{c.rotulo}</div>
      <div className="mt-[3px] flex flex-wrap items-baseline gap-2">
        <span className={`whitespace-nowrap font-mono text-[18px] font-semibold tabular-nums ${
          c.plan == null ? 'text-faint' : 'text-ink'}`}
        >
          {c.plan ?? 'sin dato'}
        </span>
        {c.simulado != null && (
          <span className={`flex items-center gap-1 whitespace-nowrap font-mono text-[13px] tabular-nums ${clase}`}>
            <span aria-hidden>{FLECHA[c.direccion]}</span>
            {c.simulado}
          </span>
        )}
      </div>
      <div className="mt-px text-[11px] text-faint">{c.detalle}</div>
    </div>
  )
}
