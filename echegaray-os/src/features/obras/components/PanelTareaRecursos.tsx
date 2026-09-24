'use client'

// 04 · SOLAPA RECURSOS Y HH — el mismo motor de la 08, sobre UNA actividad.
//
// LENGUAJE ERP OBRAS (24/09/2026): vive plegado en la fila «Dotación» del Resumen y el zip no lo
// dibuja. Se arma con las piezas del 04: eyebrow mono, stepper de 30 con borde `borde` (el mismo alto
// que los botones-ícono del panel), la duración en mono 18/600, el aviso con ícono y la cuenta
// inversa en la caja gris del cuadro PLAN (`tenueFondo` + `bordeTarjeta`, radio 8).
//
// ═══ NO HAY UNA SEGUNDA MATEMÁTICA ACÁ ═══
//
// `duracionDias` y `dotacionNecesaria` son las mismas funciones que usa la 08, y las dos son el
// puerto de `public.duracion_dias` / `public.dotacion_necesaria`. Este archivo elige los INSUMOS
// —cuántas HH faltan, con qué gente, con qué jornada, con cuántos días técnicos— y dibuja. Si acá
// se hiciera la cuenta «a mano», el panel y la pantalla de dotación contestarían distinto sobre la
// misma actividad y ninguna de las dos sería verificable.
//
// ═══ LA DOTACIÓN ES ESTADO DEL CLIENTE, Y NO ES UN PLAN ═══
//
// Mover el stepper simula; aplicarla al plan es la 08, que escribe `dotacion_prevista` sobre el
// frente entero.

import type { CSSProperties } from 'react'
import { hh as fmtHH } from './formato'
import { dotacionNecesaria, duracionDias } from '../services/dotacion'
import { hhRestantes } from '../services/cronogramaMotor'
import { restriccionesDe } from '../services/panelTarea'
import { MAGNITUD, produccionDeCuadrilla } from '@/features/base-maestra/services/vocabulario'
import type { NodoObra } from '../services/wbs'
import type { ContextoTarea } from '../services/panelTareaService'
import { C, MONO } from './canon/tokens'
import { Aviso, Falta } from './items/crear/Piezas'
import { Eyebrow, FilaDato, Nota } from './panel/PanelPiezas'

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
    <section data-testid="panel-recursos" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '4px' }}>
      <div>
        <Eyebrow>Dotación → duración</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Stepper valor={dotacion} alCambiar={alCambiarDotacion} enTope={enTope} nombre={nodo.nombre} />
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: C.tenue }}>Duración</div>
            <div data-testid="duracion-simulada" style={{
              fontFamily: dias == null ? undefined : MONO, fontSize: dias == null ? '12.5px' : '18px', fontWeight: dias == null ? 400 : 600, color: C.tinta,
            }}>
              {dias == null ? <Falta>{hh == null ? 'sin HH' : 'sin gente'}</Falta> : `${n1(dias)} d`}
            </div>
          </div>
        </div>
      </div>

      {/* EL NÚMERO VIENE CON SU BASE. «14 días» calculados sobre el plan y «14 días» calculados
          sobre el rendimiento observado no valen lo mismo, y a simple vista son iguales. */}
      <Nota>
        {hh == null
          ? 'Sin HH cargadas no hay duración que calcular: lo que falta es la carga, no el trabajo.'
          : (
            <>
              Sobre <span style={{ fontFamily: MONO, color: C.tinta }}>{fmtHH(hh)}</span> HH que faltan · base:{' '}
              <span style={{ color: C.tintaMedia }}>{baseHH}</span>
              {diasTecnicos > 0 && <> · {diasTecnicos} d técnicos que no se comprimen</>}
            </>
          )}
      </Nota>
      {enTope && (
        <Aviso tono="warn" tam={12}>Tope del frente: {nodo.tope_frente} personas. Más gente no acorta el plazo.</Aviso>
      )}

      {/* PRODUCCIÓN DE CUADRILLA — la cuarta magnitud, y la única que un jefe de obra puede
          verificar mirando el frente: cuánto tiene que salir hoy. Es la MISMA cuenta que la
          duración, contada al derecho. Se dibuja sólo cuando existen los tres insumos (esfuerzo,
          capacidad ponderada y jornada): con uno estimado sería un objetivo inventado, y un
          objetivo inventado se persigue igual que uno medido. */}
      {produccion !== null && (
        <Nota testid="produccion-cuadrilla">
          {MAGNITUD.produccion.rotulo}:{' '}
          <span style={{ fontFamily: MONO, color: C.tinta }}>
            {produccion.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
          </span>{' '}
          {MAGNITUD.produccion.unidad(nodo.unidad)}
        </Nota>
      )}

      <AlReves nodo={nodo} contexto={contexto} hh={hh} jornada={jornada} />

      <div style={{ borderTop: `1px solid ${C.borde}`, paddingTop: '12px' }}>
        <Eyebrow>Restricciones que respeta el cálculo</Eyebrow>
        {restricciones.length === 0
          ? (
            <Nota>
              Esta actividad no declara ninguna —sin tope de frente, sin tiempo técnico, sin jornada leída—: es un
              plan al que nadie se las cargó, no un plan sin restricciones.
            </Nota>
          )
          : (
            <div data-testid="restricciones-calculo">
              {restricciones.map((r) => <FilaDato key={r.clave} clave={r.clave} fuente={r.fuente} valor={r.valor} />)}
            </div>
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
  const caja = (lado: 'izq' | 'der', activo: boolean): CSSProperties => ({
    font: 'inherit', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${C.borde}`, background: C.superficie, padding: 0, fontSize: '14px',
    color: activo ? C.tintaMedia : C.fantasma, cursor: activo ? 'pointer' : 'default',
    borderRadius: lado === 'izq' ? '6px 0 0 6px' : '0 6px 6px 0',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center' }} data-testid="stepper-dotacion">
      {valor > 0
        ? <button type="button" onClick={() => alCambiar(valor - 1)} aria-label={`Quitar una persona de ${nombre}`} style={caja('izq', true)}>−</button>
        : <span aria-hidden style={caja('izq', false)}>−</span>}
      <span style={{
        width: '38px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderTop: `1px solid ${C.borde}`, borderBottom: `1px solid ${C.borde}`,
        fontFamily: MONO, fontSize: '14px', fontWeight: 600, color: C.tinta,
      }}>{valor}</span>
      {enTope
        ? <span title="Más gente no acorta el plazo" style={caja('der', false)}>+</span>
        : <button type="button" onClick={() => alCambiar(valor + 1)} aria-label={`Sumar una persona a ${nombre}`} style={caja('der', true)}>+</button>}
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
    <div data-testid="cuenta-inversa" style={{
      background: C.tenueFondo, border: `1px solid ${C.bordeTarjeta}`, borderRadius: '8px', padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: '4px',
    }}>
      <div style={{ fontSize: '10px', letterSpacing: '.05em', color: C.tenue }}>AL REVÉS: FIJÁ LA FECHA</div>
      {!nodo.fin_plan && (
        <div style={{ fontSize: '12px' }}><Falta>Sin fin de plan: sin una fecha comprometida no hay cuenta inversa que hacer.</Falta></div>
      )}
      {nodo.fin_plan && dias == null && (
        <Nota tono="warn">
          El fin de plan ({enCriollo(nodo.fin_plan)}) ya pasó, o no pude contar los días hábiles que faltan. Una
          fecha vencida no se contesta con una dotación.
        </Nota>
      )}
      {nodo.fin_plan && dias != null && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 8px' }}>
          <span style={{ fontSize: '12.5px', color: C.tintaMedia }}>Terminar el <span style={{ fontFamily: MONO }}>{enCriollo(nodo.fin_plan)}</span></span>
          <span style={{ fontSize: '11px', color: C.tenue }}>{dias} d hábiles</span>
          <span style={{ fontSize: '12.5px', color: C.tenue }}>→</span>
          {hh == null
            ? <span style={{ fontSize: '12px' }}><Falta>sin HH</Falta></span>
            : (
              <span style={{ fontFamily: MONO, fontSize: '13.5px', fontWeight: 600, color: necesaria == null ? C.neg : C.tinta }}>
                {necesaria == null ? 'no alcanza' : `${necesaria} pers.`}
              </span>
            )}
        </div>
      )}
    </div>
  )
}
