'use client'

// 08 · SIMULACIÓN DEL FRENTE — porte literal de «08 · Obra Dotación y Proyección.dc.html».
//
// ═══ EL MECANISMO QUE HABÍA NO ERA EL DEL CANÓNICO (auditoría del 24/08, hallazgo #6) ═══
//
// La pantalla mostraba una TABLA con todos los frentes a la vez, cada fila con su stepper, y una
// sola pregunta posible: «con esta gente, ¿cuándo termino?». El canónico simula UN frente por vez
// con tres modos —HH es dato de base; Dotación y Duración se fijan y el otro se calcula— y ésa es
// la pregunta que se hace de verdad cuando el cliente pone fecha: «para el 12, ¿cuánta gente?».
// No era un cambio de aspecto: era otra pantalla. Ver `simulacionFrente.ts` para el mecanismo.
//
// ═══ LO QUE SE CONSERVA DEL DISEÑO ANTERIOR, Y POR QUÉ ═══
//
// · La cuenta corre en el NAVEGADOR con la misma función pura que corre el servidor
//   (`simularFrente`, probada contra `frentesDe`). El stepper no navega: mover de 2 a 6 costaba
//   cuatro vueltas al servidor y cuatro esqueletos.
// · La URL sigue siendo la memoria del simulador (`?dot=<frente>~<n>`, sincronizada con
//   `replaceState`): el link que se manda por chat abre la misma simulación del otro lado.
// · Los días hábiles y el índice del fin de plan siguen viniendo resueltos del servidor. El
//   navegador NO tiene el calendario de la obra, y recalcularlo acá sería una segunda definición
//   del mismo calendario que el día del feriado daría otra fecha que el resto del OS.
//
// ═══ EL LADO «PLAN» ESTÁ VACÍO, Y ESO SE DIBUJA VACÍO ═══
//
// Ninguna actividad del OS tiene `dotacion_prevista` cargada (0 filas en toda la base, 25/08/2026):
// `dotacionPlan` vale 0 en las 17 obras y por lo tanto el plan no tiene duración ni fin de frente.
// El canónico siempre compara contra un plan; acá la comparación dice «sin dato» hasta que alguien
// aplique una dotación — que es exactamente lo que el botón de esta pantalla hace.

import { useMemo, useState } from 'react'
import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { resumenSimulacion, simularFrente, TOPE_DOTACION, type Frente } from '../services/dotacion'
import {
  escalaDias, escalaDotacion, frenteInicial, MODOS, notaDeOrigen, simularModo,
  type EstadoSimulado, type ModoSimulacion,
} from '../services/simulacionFrente'
import { celdasDelImpacto, estadoDelImpacto, type InsumosImpacto } from '../services/impactoDotacion'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Hover } from './canon/Piezas'
import {
  DotacionPorSemana, ImpactoSimulacion, LimitesReales, type FilaLimite,
} from './canon/PanelesDotacion'

const n0 = (v: number | null) => (v == null ? null : Math.round(v).toLocaleString('es-AR'))

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
  const [clave, setClave] = useState<string>(() => frenteInicial(frentes) ?? '')
  const [modo, setModo] = useState<ModoSimulacion>('dot')
  const [dot, setDot] = useState<Record<string, number>>(dotIniciales)
  // La duración arranca en la del frente con el que abre la pantalla: `1` haría que el primer clic
  // en «Duración» pidiera terminar mañana un frente de tres semanas.
  const [dias, setDias] = useState<number>(() => diasIniciales(frentes, frenteInicial(frentes)))

  const frente = frentes.find((f) => f.clave === clave) ?? frentes[0] ?? null

  const sincronizarUrl = (siguiente: Record<string, number>) => {
    const p = new URLSearchParams(window.location.search)
    p.delete('dot')
    for (const [k, v] of Object.entries(siguiente)) p.append('dot', `${k}~${v}`)
    const q = p.toString()
    window.history.replaceState(null, '', `/obras/${obraId}/dotacion${q ? `?${q}` : ''}`)
  }
  const guardar = (siguiente: Record<string, number>) => { setDot(siguiente); sincronizarUrl(siguiente) }

  const pedida = frente ? dot[frente.clave] ?? frente.dotacion : 0
  const estado: EstadoSimulado | null = frente
    ? simularModo(frente, modo, pedida, dias, jornada, habiles)
    : null
  const escalaDot = escalaDotacion(frente?.tope ?? null, disponibles)
  const planFrente = frente ? simularFrente(frente, frente.dotacionPlan, jornada, habiles) : null
  const escalaD = escalaDias(planFrente?.dias ?? null, frente?.diasTecnicos ?? 0)

  // MOVER LA DOTACIÓN (modo Dotación). El tope lo recorta `simularFrente`, no este handler: la
  // pantalla y el servidor tienen que recortar en el MISMO lugar o el número que se ve no es el
  // que se guarda.
  const moverDotacion = (v: number) => {
    if (!frente) return
    // El techo del stepper es la escala de la barra —como en el mockup, donde el `+` para en 8—
    // pero NUNCA por debajo de lo que ya hay puesto: un `?dot=X~50` que llega por link tiene que
    // poder bajarse de a uno, no saltar a 8 en el primer clic.
    const techo = Math.max(escalaDot, dot[frente.clave] ?? frente.dotacion)
    guardar({ ...dot, [frente.clave]: Math.max(0, Math.min(techo, v)) })
  }

  // MOVER LA DURACIÓN (modo Duración) escribe la DOTACIÓN calculada, no los días: lo que se aplica
  // al plan es `dotacion_prevista`. Cuando ninguna dotación llega a esa fecha se BORRA la entrada
  // —no queda una dotación vieja lista para guardarse detrás de una fecha imposible—.
  const moverDias = (d: number) => {
    if (!frente) return
    const siguiente = Math.max(1, Math.min(escalaD, d))
    setDias(siguiente)
    const necesaria = simularModo(frente, 'dias', pedida, siguiente, jornada, habiles).dotacion
    const copia = { ...dot }
    // Una dotación que la URL y la escritura no transportan NO se guarda como si se pudiera
    // aplicar: se muestra —es la respuesta correcta— y el botón dice por qué no.
    if (necesaria == null || necesaria > TOPE_DOTACION) delete copia[frente.clave]
    else copia[frente.clave] = necesaria
    guardar(copia)
  }

  const volverAlPlan = () => { setModo('dot'); guardar({}) }

  // Heredar los días del frente anterior mostraría una fecha que no tiene nada que ver con el que
  // se está mirando.
  const elegirFrente = (k: string) => { setClave(k); setDias(diasIniciales(frentes, k)) }

  // ═══ EL IMPACTO EN LA OBRA ENTERA se corre con la MISMA función de los dos lados ═══
  // Si fueran dos cuentas, la columna «plan» y la columna «simulado» del canónico dirían números
  // que no se pueden restar entre sí.
  const obra = useMemo(() => {
    const conSim = frentes.map((f) => simularFrente(f, dot[f.clave] ?? f.dotacion, jornada, habiles))
    const conPlan = frentes.map((f) => simularFrente(f, f.dotacionPlan, jornada, habiles))
    return {
      sim: resumenSimulacion(conSim, idxFinPlan, habiles),
      plan: resumenSimulacion(conPlan, idxFinPlan, habiles),
    }
  }, [frentes, dot, jornada, habiles, idxFinPlan])

  const cambio = Object.keys(dot).length > 0
  const aEscribir = Object.entries(dot).filter(([, n]) => n > 0).length
  const insumos: InsumosImpacto = {
    hhFrente: frente?.hhRestantes ?? null,
    planFrente: { dias: planFrente?.dias ?? null, fin: planFrente?.fin ?? null },
    simFrente: { dias: estado?.dias ?? null, fin: estado?.fin ?? null },
    desvioObraPlan: obra.plan.desvioDias,
    desvioObraSim: obra.sim.desvioDias,
    noEjecutable: estado?.sobreTope ?? false,
    imposible: estado?.imposiblePorTecnicos ?? false,
    cambio,
    genteSimulada: obra.sim.genteTotal,
    disponibles,
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 20px 24px',
      flexWrap: 'wrap',
    }}
    >
      <div
        data-testid="simulador-dotacion"
        style={{
          width: '428px', flexShrink: 0, background: C.superficie, border: `1px solid ${C.borde}`,
          borderRadius: '10px', padding: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
          {/* El zip dibuja acá el signo pesos (`M12 3v18M8 7h6.5…`), que en el juego de íconos se
              llama `dinero`. Esta pantalla NO habla de plata —el jefe de obra la ve— pero el trazo
              es el que el mockup pone y el porte es literal: el ícono no se «corrige». */}
          <span style={{ display: 'flex', color: C.tintaSuave }}><Ico d={P.dinero} s={16} /></span>
          <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>Simulación del frente</div>
          <SelectorDeFrente frentes={frentes} clave={frente?.clave ?? ''} elegir={elegirFrente} />
        </div>

        {!frente || !estado
          ? (
            <p style={{ marginTop: '14px', fontSize: '12.5px', color: C.tintaSuave, lineHeight: 1.5 }}>
              Esta obra no tiene actividades ejecutables cargadas, así que no hay frente que simular.
              Los frentes salen de la sección de cada actividad del plan.
            </p>
            )
          : (
            <>
              <Modos modo={modo} elegir={setModo} />
              <Campos
                frente={frente} estado={estado} modo={modo}
                escalaDot={escalaDot} escalaD={escalaD}
                moverDotacion={moverDotacion} moverDias={moverDias}
              />
              <Acciones
                dot={dot} puedeAplicar={puedeAplicar} aEscribir={aEscribir} aplicar={aplicar}
                bloqueado={insumos.noEjecutable || insumos.imposible}
                motivo={motivoDeBloqueo(estado)}
                volverAlPlan={volverAlPlan}
              />
            </>
            )}
      </div>

      <div style={{ flex: 1, minWidth: '420px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <ImpactoSimulacion estado={estadoDelImpacto(insumos)} celdas={celdasDelImpacto(insumos)} />
        <DotacionPorSemana faltante={disponibles == null ? 'plantel sin dato' : `plantel de obra: ${disponibles}`} />
        <LimitesReales filas={limitesDe(frentes, frente, disponibles)} />
      </div>
    </div>
  )
}

/** El canónico escribe el frente como un rótulo a la derecha de la cabecera («Columna de carga ·
 *  Eje 5–8»). Acá tiene que poder CAMBIARSE —el mockup dibuja una pantalla de un frente, la obra
 *  tiene varios— así que es un `select` con exactamente ese aspecto: mismo tamaño, mismo color,
 *  sin caja. Es la única desviación de forma de esta tarjeta. */
function SelectorDeFrente({ frentes, clave, elegir }: {
  frentes: Frente[]; clave: string; elegir: (k: string) => void
}) {
  if (!frentes.length) return null
  return (
    <select
      value={clave} onChange={(e) => elegir(e.target.value)} data-testid="selector-frente"
      aria-label="Frente que se simula" title="Frente que se simula"
      style={{
        marginLeft: 'auto', fontSize: '11.5px', color: C.tintaSuave, fontFamily: 'inherit',
        background: 'transparent', border: 'none', cursor: 'pointer', maxWidth: '190px',
        textAlign: 'right', padding: 0,
      }}
    >
      {frentes.map((f) => (
        <option key={f.clave} value={f.clave}>
          {f.nombre} · {f.nActividades} {f.nActividades === 1 ? 'actividad' : 'actividades'}
        </option>
      ))}
    </select>
  )
}

/** Los tres botones de modo. `HH` no se puede elegir —`if (k !== 'hh')` en el canónico—: es el dato
 *  de base del que salen los otros dos, no una tercera manera de simular. */
function Modos({ modo, elegir }: { modo: ModoSimulacion; elegir: (m: ModoSimulacion) => void }) {
  return (
    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      {MODOS.map((m) => {
        const activo = modo === m.id
        return (
          <button
            key={m.id} type="button" title={m.tip} data-modo={m.id} data-activo={activo || undefined}
            onClick={() => { if (m.id !== 'hh') elegir(m.id) }}
            disabled={m.id === 'hh'}
            style={{
              flex: 1, minHeight: '44px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '2px',
              border: `1.5px solid ${activo ? C.marca : C.borde}`,
              background: activo ? C.marcaSuave : (m.id === 'hh' ? C.tenueFondo : C.superficie),
              borderRadius: '10px', cursor: m.id === 'hh' ? 'default' : 'pointer', padding: '6px',
              fontFamily: 'inherit',
            }}
          >
            <span style={{
              fontSize: '12px', fontWeight: activo ? 600 : 400,
              color: m.id === 'hh' ? C.tintaSuave : C.tinta,
            }}
            >
              {m.rotulo}
            </span>
            <span style={{ fontSize: '10px', color: activo ? '#8A5A22' : C.tenue }}>{m.detalle}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Una fila de campo: rótulo con su ícono a la izquierda, cifra mono de 19/600 a la derecha, y
 *  debajo el control (cuando se edita) y la nota (cuando la hay). Es el bloque que el canónico
 *  repite tres veces con `sc-for`. */
function Campo({ icono, rotulo, valor, calculado, activo, valorNeg, control, nota }: {
  icono: typeof P.hh
  rotulo: string
  valor: string
  calculado: boolean
  activo: boolean
  valorNeg: boolean
  control?: React.ReactNode
  nota?: { texto: string; alerta: boolean; icono: typeof P.hh }
}) {
  const color = activo ? C.tinta : C.tintaSuave
  return (
    <div style={{ padding: '12px 0', borderBottom: `1px solid ${C.bordeFila}` }} data-campo={rotulo}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
          <span style={{ display: 'flex', color, flexShrink: 0 }}><Ico d={icono} s={15} /></span>
          <span style={{ fontSize: '12.5px', color }}>{rotulo}</span>
          {calculado && (
            <span style={{
              fontSize: '10px', color: C.tintaSuave, background: '#F2F1ED', borderRadius: '9px',
              padding: '1px 7px', flexShrink: 0,
            }}
            >
              calculado
            </span>
          )}
        </div>
        <span style={{
          fontFamily: MONO, fontSize: '19px', fontWeight: 600,
          color: valorNeg ? C.neg : C.tinta, whiteSpace: 'nowrap',
        }} data-valor={rotulo}
        >
          {valor}
        </span>
      </div>
      {control}
      {nota && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '7px', marginTop: '8px',
          fontSize: '11.5px', color: nota.alerta ? C.neg : C.tenue,
        }} data-nota={rotulo}
        >
          <span style={{ display: 'flex' }}><Ico d={nota.icono} s={13} /></span>
          {nota.texto}
        </div>
      )}
    </div>
  )
}

/** El control del canónico: `−` con borde, la barra de 6px con su marca de tope, y `+` en amarillo.
 *  La marca naranja del tope es lo único que dice dónde deja de servir empujar. */
function Control({ valor, escala, tope, menos, mas, rotulo }: {
  valor: number; escala: number; tope: number | null
  menos: () => void; mas: () => void; rotulo: string
}) {
  const caja = {
    width: '34px', height: '34px', borderRadius: '8px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', flexShrink: 0, border: 'none',
    fontFamily: 'inherit', padding: 0,
  } as const
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '9px' }}>
      <Hover
        base={{ ...caja, border: `1px solid ${C.borde}`, color: C.tinta }}
        hover={{ background: C.tenueFondo }}
        role="button" tabIndex={0} aria-label={`Menos ${rotulo}`} title="Menos"
        onClick={menos} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') menos() }}
        data-accion={`menos-${rotulo}`}
      >
        <Ico d={P.menos} s={16} w={2.4} />
      </Hover>
      <div style={{ flex: 1, height: '6px', background: C.barraCanal, borderRadius: '3px', position: 'relative' }}>
        <div style={{
          height: '100%', width: `${Math.min(100, (valor / escala) * 100)}%`,
          background: C.grafito, borderRadius: '3px',
        }}
        />
        {tope != null && tope <= escala && (
          <div style={{
            position: 'absolute', top: '-4px', left: `${(tope / escala) * 100}%`,
            width: '1.5px', height: '14px', background: C.warn,
          }} data-testid="marca-tope"
          />
        )}
      </div>
      <Hover
        base={{ ...caja, background: C.marca, color: C.tinta }}
        hover={{ background: C.marcaHover }}
        role="button" tabIndex={0} aria-label={`Más ${rotulo}`} title="Más"
        onClick={mas} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') mas() }}
        data-accion={`mas-${rotulo}`}
      >
        <Ico d={P.mas} s={16} w={2.4} />
      </Hover>
    </div>
  )
}

function Campos({ frente, estado, modo, escalaDot, escalaD, moverDotacion, moverDias }: {
  frente: Frente
  estado: EstadoSimulado
  modo: ModoSimulacion
  escalaDot: number
  escalaD: number
  moverDotacion: (v: number) => void
  moverDias: (v: number) => void
}) {
  const origen = notaDeOrigen(frente)
  const dotVisible = estado.dotacion
  return (
    <div style={{ marginTop: '16px' }}>
      <Campo
        icono={P.hh} rotulo="HH que faltan" activo={false} calculado={false}
        valorNeg={false}
        valor={frente.hhRestantes == null ? 'sin dato' : `${n0(frente.hhRestantes)} HH`}
        nota={{ ...origen, icono: origen.alerta ? P.alerta : P.material }}
      />
      <Campo
        icono={P.cuadrilla} rotulo="Dotación" activo={modo === 'dot'}
        calculado={estado.dotacionCalculada}
        valorNeg={estado.sobreTope}
        valor={dotVisible == null
          ? (estado.sinTrabajo ? 'no hace falta nadie' : 'no alcanza')
          : `${dotVisible} ${dotVisible === 1 ? 'persona' : 'personas'}`}
        control={modo !== 'dias'
          ? (
            <Control
              rotulo="dotación" valor={estado.dotacion ?? 0} escala={escalaDot} tope={frente.tope}
              menos={() => moverDotacion((estado.dotacion ?? 0) - 1)}
              mas={() => moverDotacion((estado.dotacion ?? 0) + 1)}
            />
            )
          : undefined}
        nota={estado.sobreTope
          ? {
            texto: `El frente tiene tope de ${frente.tope}: más gente no acelera`,
            alerta: true, icono: P.alerta,
          }
          : undefined}
      />
      <Campo
        icono={P.fecha} rotulo="Duración" activo={modo === 'dias'}
        calculado={estado.diasCalculada}
        valorNeg={false}
        valor={estado.sinTrabajo
          ? 'terminado'
          : (estado.dias == null ? 'sin plan' : `${estado.dias} ${estado.dias === 1 ? 'día' : 'días'}`)}
        control={modo === 'dias'
          ? (
            <Control
              rotulo="duración" valor={estado.dias ?? 0} escala={escalaD} tope={null}
              menos={() => moverDias((estado.dias ?? 1) - 1)}
              mas={() => moverDias((estado.dias ?? 1) + 1)}
            />
            )
          : undefined}
        nota={notaDuracion(frente, estado)}
      />
    </div>
  )
}

/** Las dos maneras en que una duración fijada no se puede cumplir: la gente no entra en el frente,
 *  o los días pedidos son todos técnicos y no hay gente que los comprima. */
function notaDuracion(frente: Frente, estado: EstadoSimulado) {
  if (estado.sinTrabajo) return undefined
  if (estado.imposiblePorTecnicos) {
    return {
      texto: `${frente.diasTecnicos} de esos días son técnicos: ninguna dotación baja de ahí`,
      alerta: true, icono: P.alerta,
    }
  }
  if (estado.dotacionCalculada && estado.sobreTope && estado.dotacion != null) {
    return {
      texto: `Para ese plazo hacen falta ${estado.dotacion}: no entran en el frente`,
      alerta: true, icono: P.alerta,
    }
  }
  if (frente.diasTecnicos > 0 && estado.dias != null) {
    return {
      texto: `${frente.diasTecnicos} días técnicos no se comprimen con más gente`,
      alerta: false, icono: P.material,
    }
  }
  return undefined
}

/**
 * APLICAR AL CRONOGRAMA + VOLVER AL PLAN — la fila de abajo del canónico.
 *
 * El botón escribe `dotacion_prevista`, que es la capacidad con la que el motor calcula la duración
 * de cada actividad sin cuadrilla: aplicar cambia el fin de obra. Por eso queda BLOQUEADO cuando la
 * simulación no es ejecutable —el servidor la recortaría al tope y el plan quedaría diciendo otra
 * cosa que la pantalla— y cuando nadie movió nada, que no escribiría nada y contestaría que sí.
 */
function Acciones({ dot, puedeAplicar, aEscribir, aplicar, bloqueado, motivo, volverAlPlan }: {
  dot: Record<string, number>
  puedeAplicar: boolean
  aEscribir: number
  aplicar: AccionFormulario
  bloqueado: boolean
  motivo: string | null
  volverAlPlan: () => void
}) {
  return (
    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {puedeAplicar
          ? (
            <FormAccion
              accion={aplicar} testid="form-aplicar-dotacion"
              enviar={aEscribir === 1 ? 'Aplicar al cronograma (1 frente)' : `Aplicar al cronograma (${aEscribir} frentes)`}
              mensajeOk="Dotación aplicada."
              bloqueado={aEscribir === 0 || bloqueado || motivo != null}
              motivoBloqueo={motivo
                ?? (bloqueado
                  ? 'La simulación no es ejecutable: el frente no tiene lugar para esa gente.'
                  : 'Mové dotación o duración y se habilita.')}
            >
              {Object.entries(dot).map(([k, n]) => (
                <input key={k} type="hidden" name="dot" value={`${k}~${n}`} />
              ))}
            </FormAccion>
            )
          : (
            <p style={{ margin: 0, fontSize: '11.5px', color: C.tenue }}>
              Esto simula. Aplicarlo al plan es de Administración y de la jefatura de obra.
            </p>
            )}
      </div>
      <Hover
        base={{
          width: '44px', height: '44px', borderRadius: '8px', border: `1px solid ${C.borde}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.tintaSuave,
          cursor: 'pointer', flexShrink: 0,
        }}
        hover={{ color: C.tinta }}
        role="button" tabIndex={0} title="Volver al plan" aria-label="Volver al plan"
        data-testid="volver-al-plan"
        onClick={volverAlPlan}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') volverAlPlan() }}
      >
        <Ico d={P.reiniciar} s={17} />
      </Hover>
    </div>
  )
}

/**
 * LOS LÍMITES REALES con los números de esta obra.
 *
 * El canónico lista cuatro; las dos que faltan (hormigonera única, material disponible) no tienen
 * fuente en la base y no se inventan. Un límite fabricado hace decidir sobre una restricción que no
 * existe, que es peor que no verla.
 */
function limitesDe(
  frentes: Frente[], frente: Frente | null, disponibles: number | null,
): FilaLimite[] {
  const sinHH = frentes.filter((f) => f.hhRestantes == null).length
  return [
    {
      clave: 'tope',
      icono: P.espacio,
      tono: frente?.tope == null ? 'faint' : 'warn',
      que: 'Tope físico del frente',
      detalle: frente?.tope == null
        ? `nadie declaró cuánta gente entra en «${frente?.nombre ?? 'este frente'}»`
        : `${frente.tope} personas en «${frente.nombre}»: más se estorban`,
      valor: frente?.tope == null ? 'sin declarar' : String(frente.tope),
    },
    {
      clave: 'plantel',
      icono: P.cuadrilla,
      tono: disponibles == null ? 'faint' : 'warn',
      que: 'Plantel disponible',
      detalle: disponibles == null
        ? 'ninguna persona con asignación vigente en esta obra'
        : 'personas con asignación vigente en esta obra',
      valor: disponibles == null ? 'sin dato' : String(disponibles),
    },
    {
      clave: 'sin-hh',
      icono: P.material,
      tono: sinHH === 0 ? 'pos' : 'warn',
      que: 'Frentes sin HH cargadas',
      detalle: sinHH === 0
        ? 'todos los frentes tienen con qué calcular'
        : 'no producen plazo con ninguna dotación',
      valor: sinHH === 0 ? 'ok' : String(sinHH),
    },
  ]
}

/** Los días con los que abre el modo Duración para un frente: los que ya tiene calculados, y si no
 *  los tiene, uno más que sus días técnicos — el primer plazo que todavía puede existir. */
function diasIniciales(frentes: Frente[], clave: string | null): number {
  const f = frentes.find((x) => x.clave === clave)
  return Math.max(1, f?.dias ?? (f?.diasTecnicos ?? 0) + 1)
}

/**
 * POR QUÉ EL BOTÓN NO PUEDE ESCRIBIR ESTA SIMULACIÓN.
 *
 * EL DEFECTO QUE ATRAPA (medido contra Quattropani, 25/08/2026): la cuenta inversa de un frente de
 * 3.788 HH en un día devuelve **474 personas**. Es la respuesta correcta a una pregunta absurda, y
 * la pantalla la muestra. Pero `?dot=` y `aplicarDotacionAlPlan` sólo transportan hasta
 * `TOPE_DOTACION`: el botón se habilitaba, se apretaba, y el servidor contestaba «no hay ninguna
 * dotación elegida» sobre una pantalla que estaba mostrando un número. Un botón que responde sin
 * hacer nada enseña a desconfiar de la pantalla entera.
 */
function motivoDeBloqueo(estado: EstadoSimulado): string | null {
  if (estado.fueraDeContrato) {
    return `${estado.dotacion} personas es la respuesta, pero el plan no guarda dotaciones de más `
      + `de ${TOPE_DOTACION}. Para ese plazo hay que partir el frente, no cargar gente.`
  }
  if (estado.sinTrabajo) return 'El frente ya está terminado: no hay dotación que planificar.'
  return null
}
