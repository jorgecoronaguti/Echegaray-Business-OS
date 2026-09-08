'use client'

import { useMemo, useState, useTransition } from 'react'
import { Aviso, Boton, Nulo } from '@/shared/components/ds'
import {
  acusePresencia, avisoSinMarcar, casillasDePresencia, estadoSegunMotivo, loQueViajaPresencia,
  marcarTodosPresentes, personasAMarcar, resumenPresencia, sumarPersonasNuevasPresencia,
} from '@/features/administracion/services/presenciaDelDia'
import type {
  CasillaPresencia, EstadoPresencia, PresenciaGuardada,
} from '@/features/administracion/services/presenciaDelDia'
import { guardarPresencia } from '@/features/administracion/services/presenciaDelDiaActions'
import { motivosDeDiaNoTrabajado } from '@/features/administracion/services/motivoDeAusencia'
import { jornadaPorDefecto } from '@/features/administracion/services/jornadaPorDefecto'
import type { FilaConOtraObra } from './FormAsistencia'

// PRESENCIA — «¿está o no está?». Acá NO hay una sola casilla de horas, y no es un olvido.
//
// El dueño, 08/09/2026, textual: *«la versión mobile de carga de asistencia no tiene que referenciar
// horas de trabajo sino si está o no la persona»*. La pantalla que había pedía un NÚMERO por
// persona para poder decir algo tan simple como «Juan vino»: el jefe, parado en la obra a las 7:30
// con una mano ocupada, tenía que resolver una cuenta antes de poder registrar un hecho que ya
// sabía. Y peor: quien no sabía todavía cuántas horas iba a hacer alguien no podía decir nada.
//
// ═══ TRES TOQUES POSIBLES, TODOS DEL MISMO TAMAÑO ═══
//
// Está · No vino · Licencia. Son los tres estados que existen (`asistencia_dia.estado`), y ninguno
// está escondido detrás de otro: marcar una licencia no puede costar más que marcar una presencia,
// porque quien liquida necesita las tres separadas. El motivo aparece SÓLO después del segundo o el
// tercer toque, y no es obligatorio — exigir la causa para poder guardar hace que se elija
// cualquiera (misma regla que ya rige la carga de horas).
//
// ═══ NINGUNA CASILLA NACE MARCADA ═══
//
// Ver `presenciaDelDia.ts`: es la misma lección que costó 77,4 HH escritas en una obra viva. El día
// normal cuesta UN toque —«Marcar a todos como presentes»— y ese toque no pisa a nadie ya marcado.
//
// ═══ LA PANTALLA NO PREGUNTA HORAS, PERO MARCAR «Está» LAS CARGA ═══
//
// Dueño, 08/09/2026 a la tarde: *«que por defecto cuando se ponga la asistencia se le cargue 9 hs
// los L, M, M, J y 8 hs los V»*. La pregunta sigue siendo una sola —¿está o no está?— y sigue sin
// haber un campo de número; lo que cambió es que la respuesta escribe la jornada del día en
// `registros_hh`, que es costo imputado a esta obra. Por eso el pie lo DICE ANTES de guardar: quien
// toca el botón tiene que saber qué firma. La corrección se hace en Asistencia, donde están todas
// las horas juntas. Al revés sigue prohibido: escribir un 8 no declara a nadie presente.
//
// Diseño: tokens únicamente, grid de 8, objetivos ≥ 44 px, grafito para la acción, `neg` sólo para
// el problema (la falta declarada) y `pos` sólo para el estado positivo.

export function FormPresencia({ obraId, obraNombre, fecha, filas, guardadas, onGuardado, alCargarHoras }: {
  obraId: string
  obraNombre: string
  fecha: string
  filas: FilaConOtraObra[]
  /** Lo que ya está declarado en `asistencia_dia` para ese día. */
  guardadas: PresenciaGuardada[]
  /** Avisa hacia arriba lo que quedó guardado: la carga de horas lo necesita para saber a quién
   *  ofrecerle la jornada y a quién no pedirle nada. */
  onGuardado?: (g: PresenciaGuardada[]) => void
  /** El paso siguiente, opcional y secundario. Sin esto la pantalla de presencia se basta sola. */
  alCargarHoras?: () => void
}) {
  // LA CUADRILLA, SIN LOS JEFES. La regla y su porqué están en `personasAMarcar`; acá sólo se
  // aplica. `filas` sigue entero hacia las horas: lo que cambia es a quién se le pregunta si vino.
  const aMarcar = useMemo(() => personasAMarcar(filas), [filas])
  const ids = useMemo(() => aMarcar.map((f) => f.persona.persona_id), [aMarcar])
  const [casillas, setCasillas] = useState<Record<string, CasillaPresencia>>(
    () => casillasDePresencia(ids, guardadas),
  )
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendiente, arrancar] = useTransition()

  // LA CUADRILLA CAMBIA SIN RECARGAR LA PANTALLA: «Traer a alguien a esta obra» hace
  // `router.refresh()` y este componente no se vuelve a montar, así que el inicializador de
  // `useState` NO corre y el recién llegado se quedaba sin casilla. Misma forma y mismo motivo que
  // en `FormAsistencia`; la regla y su prueba están en `sumarPersonasNuevasPresencia`.
  const clave = ids.join('|')
  const [claveVista, setClaveVista] = useState(clave)
  if (clave !== claveVista) {
    setClaveVista(clave)
    setCasillas((prev) => sumarPersonasNuevasPresencia(prev, ids))
  }

  const motivos = useMemo(() => motivosDeDiaNoTrabajado(), [])
  // LA MISMA REGLA QUE ESCRIBE LA ACCIÓN, NO UN NÚMERO COPIADO. Si el aviso dijera «9 h» a mano,
  // el día que cambie la jornada por defecto la pantalla mentiría sin que ningún test se ponga rojo.
  const jornada = jornadaPorDefecto(fecha)
  const marcas = loQueViajaPresencia(casillas)
  const resumen = resumenPresencia(marcas, aMarcar.length)
  const falta = avisoSinMarcar(resumen.sinMarcar)

  const tocar = (id: string, boton: EstadoPresencia) => {
    setResultado(null)
    setCasillas((prev) => {
      const antes = prev[id] ?? { estado: null, motivo: null }
      // TOCAR DE NUEVO EL MISMO BOTÓN DESMARCA. Es lo que permite deshacer un toque equivocado sin
      // que exista un cuarto botón «borrar»: en el teléfono, el error más común es el dedo.
      if (antes.estado === boton) return { ...prev, [id]: { estado: null, motivo: null } }
      // Una presencia no lleva motivo: el motivo viejo se descarta al pasar a «está».
      return { ...prev, [id]: { estado: boton, motivo: boton === 'presente' ? null : antes.motivo } }
    })
  }

  const elegirMotivo = (id: string, boton: Exclude<EstadoPresencia, 'presente'>, motivo: string | null) => {
    setResultado(null)
    // EL MOTIVO DECIDE SI ES AUSENCIA O LICENCIA, no el botón que se tocó: «no vino → enfermedad»
    // es una licencia. La clasificación es la del catálogo, la misma que usa el bot desde julio.
    setCasillas((prev) => ({ ...prev, [id]: { estado: estadoSegunMotivo(boton, motivo), motivo } }))
  }

  const guardar = () => {
    if (marcas.length === 0) {
      setResultado({ ok: false, texto: 'No marcaste a nadie todavía. Tocá «Está» o «Marcar a todos».' })
      return
    }
    arrancar(async () => {
      const r = await guardarPresencia({ obra_id: obraId, fecha, marcas })
      setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error })
      if (r.ok) onGuardado?.(r.guardadas)
    })
  }

  // EL ENLACE A LAS HORAS EXISTE EN LOS DOS CAMINOS. Incluso cuando no hay a quién marcar —el jefe
  // solo en su obra—, la carga de horas sigue siendo su paso siguiente y las horas SÍ lo incluyen.
  const enlaceHoras = alCargarHoras && (
    <p className="mt-5 border-t border-line pt-3 text-center">
      <button
        type="button" onClick={alCargarHoras} data-testid="ir-a-horas"
        className="inline-flex min-h-[44px] items-center px-2 text-[12.5px] text-muted underline hover:text-ink"
      >
        Cargar horas del día →
      </button>
    </p>
  )

  if (filas.length === 0) {
    return (
      <Aviso tono="warn" titulo={`Nadie está asignado a ${obraNombre}.`}>
        La presencia se marca sobre el personal asignado a la obra. Las asignaciones las hace
        Administración, desde Personal de la obra.
      </Aviso>
    )
  }

  // HAY GENTE ASIGNADA Y NADIE A QUIEN MARCAR: los únicos asignados son jefes de obra —el caso
  // normal es que sea quien está mirando la pantalla—. Una lista vacía sin explicación se lee como
  // un error de la pantalla o como «no hay nadie en la obra», y las dos lecturas son falsas.
  if (aMarcar.length === 0) {
    return (
      <div data-testid="form-presencia">
        <p className="border-y border-line py-4 text-[13px] text-muted" data-testid="sin-cuadrilla-que-marcar">
          Vos no te marcás: marcás a tu cuadrilla.
        </p>
        {enlaceHoras}
      </div>
    )
  }

  return (
    <div data-testid="form-presencia">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => { setResultado(null); setCasillas((c) => marcarTodosPresentes(c)) }}
          data-testid="marcar-todos-presentes"
          className="min-h-[44px] rounded-control border border-line px-3 text-[13px] text-ink hover:border-line-strong"
        >
          Marcar a todos como presentes
        </button>
        <span className="shrink-0 text-[11px] uppercase tracking-[0.06em] text-faint">
          {aMarcar.length} {aMarcar.length === 1 ? 'persona' : 'personas'}
        </span>
      </div>

      <ul className="border-t border-line" data-testid="lista-presencia">
        {aMarcar.map((fila) => {
          const id = fila.persona.persona_id
          const c = casillas[id] ?? { estado: null, motivo: null }
          const noVino = c.estado === 'ausente' || c.estado === 'licencia'
          return (
            <li key={id} className="border-b border-line py-2" data-testid="fila-presencia" data-estado={c.estado ?? 'sin_marcar'}>
              <p className="truncate text-[15px] text-ink">{fila.persona.nombre}</p>
              {(fila.persona.nota ?? fila.observacion) && (
                <p className="truncate text-[12px] text-muted">
                  {[fila.persona.nota, fila.observacion].filter(Boolean).join(' · ')}
                </p>
              )}

              {/* TRES OBJETIVOS DEL MISMO TAMAÑO, EN UNA FILA PROPIA. En 390 px, poner los tres al
                  lado del nombre deja botones de 60 px con el nombre truncado a la mitad: se toca
                  mal y no se lee a quién se está marcando. */}
              <div className="mt-2 flex gap-2" role="group" aria-label={`Presencia de ${fila.persona.nombre}`}>
                <BotonPresencia
                  testid="esta" rotulo="Está" activo={c.estado === 'presente'} tono="pos"
                  onClick={() => tocar(id, 'presente')}
                  aria={`${fila.persona.nombre} está`}
                />
                <BotonPresencia
                  testid="no-vino" rotulo="No vino" activo={c.estado === 'ausente'} tono="neg"
                  onClick={() => tocar(id, 'ausente')}
                  aria={`${fila.persona.nombre} no vino`}
                />
                <BotonPresencia
                  testid="licencia" rotulo="Licencia" activo={c.estado === 'licencia'} tono="neutro"
                  onClick={() => tocar(id, 'licencia')}
                  aria={`${fila.persona.nombre} está de licencia`}
                />
              </div>

              {/* EL SEGUNDO TOQUE: por qué. No es obligatorio —marcar que alguien faltó sin saber
                  todavía la causa es honesto; exigirla hace que se elija cualquiera—. */}
              {noVino && (
                <select
                  aria-label={`Por qué no vino ${fila.persona.nombre}`}
                  data-testid="motivo-presencia"
                  value={c.motivo ?? ''}
                  onChange={(e) => elegirMotivo(id, c.estado as 'ausente' | 'licencia', e.target.value || null)}
                  className="mt-2 h-11 w-full rounded-control border border-line bg-surface px-2 text-[13px] text-ink"
                >
                  <option value="">¿Por qué? (se puede cargar después)</option>
                  {motivos.map((m) => (
                    <option key={m.clave} value={m.clave}>
                      {m.etiqueta}{m.tipo === 'licencia' ? ' · licencia' : ''}
                    </option>
                  ))}
                </select>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 space-y-2">
        {/* EL PIE HABLA DE ESTADOS Y NUNCA DE HORAS. Una frase, una unidad. */}
        <p className="text-[13px] text-ink" data-testid="pie-presencia">{acusePresencia(resumen)}</p>
        {falta && <p className="text-[12.5px] text-muted" data-testid="falta-marcar-presencia">{falta}</p>}
        {resultado && (
          <Aviso tono={resultado.ok ? 'info' : 'neg'} testid="acuse-presencia">{resultado.texto}</Aviso>
        )}
        <Boton
          type="button" variante="primaria" tamano="bloque"
          disabled={pendiente} onClick={guardar} data-testid="guardar-presencia"
        >
          {pendiente ? 'Guardando…' : 'Guardar la presencia'}
        </Boton>
        <p className="text-center text-[11px] text-faint">
          <Nulo>Se guarda sólo lo marcado. A quien quede sin marcar no se le toca nada.</Nulo>
        </p>
        {/* LO QUE SE ESCRIBE, DICHO ANTES DE ESCRIBIRLO. El fin de semana no tiene jornada por
            defecto y entonces esta línea no aparece: un aviso que promete horas que no se van a
            cargar es peor que ninguno. */}
        {jornada !== null && (
          <p className="text-center text-[11px] text-faint" data-testid="aviso-horas-por-defecto">
            <Nulo>
              A quien marques «Está» se le cargan {jornada} h del día. Se editan en Asistencia.
            </Nulo>
          </p>
        )}
      </div>

      {/* EL PASO SIGUIENTE, DISCRETO. Las horas son otra pregunta y otra pantalla; el enlace existe
          porque el jefe suele hacer las dos cosas seguidas, no porque una dependa de la otra. Y
          las horas SÍ incluyen al jefe: las carga Administración, y eso no cambió. */}
      {enlaceHoras}
    </div>
  )
}

// El grafito es el acento del OS; `pos` sólo para el estado positivo y `neg` sólo para el problema
// (regla del dueño). El botón sin marcar es neutro: no hay un estado por defecto que insinuar.
const TONOS = {
  pos: 'border-pos bg-pos-soft text-pos',
  neg: 'border-neg bg-neg-soft text-neg',
  neutro: 'border-line-strong bg-surface-sunken text-ink',
} as const

function BotonPresencia({ rotulo, activo, tono, onClick, testid, aria }: {
  rotulo: string
  activo: boolean
  tono: keyof typeof TONOS
  onClick: () => void
  testid: string
  aria: string
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      aria-pressed={activo}
      data-testid={testid}
      onClick={onClick}
      className={`min-h-[44px] flex-1 rounded-control border text-[13px] font-medium transition-colors ${
        activo ? TONOS[tono] : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      {rotulo}
    </button>
  )
}
