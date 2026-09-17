'use client'

import { useMemo, useState, useTransition } from 'react'
import { fusionarConElServidor, huellaDe } from '@/shared/tiempo-real/estadoDelServidor'
import { Aviso, Nulo } from '@/shared/components/ds'
import {
  acusePresencia, avisoSinMarcar, casillaTrasToque, casillasDePresencia, loQueViajaPresencia,
  marcaDeLaCasilla, marcarTodosPresentes, personasAMarcar, resumenPresencia, type ToqueDePresencia,
} from '@/features/administracion/services/presenciaDelDia'
import type {
  CasillaPresencia, EstadoPresencia, PresenciaGuardada,
} from '@/features/administracion/services/presenciaDelDia'
import { guardarPresencia, quitarPresencia } from '@/features/administracion/services/presenciaDelDiaActions'
import { motivosDeDiaNoTrabajado } from '@/features/administracion/services/motivoDeAusencia'
import { hayTardanza } from '@/features/administracion/services/tardanza'
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

  // LO QUE CAMBIA SIN RECARGAR LA PANTALLA: «Traer a alguien a esta obra» (una fila más) y, desde el
  // 16/09/2026, lo que OTRO usuario guardó mientras esta pantalla estaba abierta (tiempo real: el
  // teléfono y la compu se ven entre sí). El componente no se vuelve a montar, así que el inicializador
  // de `useState` no corre: se fusiona por fila. Lo que esta persona tocó y no guardó se respeta; lo
  // intacto adopta lo guardado. La regla y su prueba: `fusionarConElServidor`.
  const base = useMemo(() => casillasDePresencia(ids, guardadas), [ids, guardadas])
  const huellaBase = huellaDe(base)
  const [baseVista, setBaseVista] = useState(() => ({ huella: huellaBase, base }))
  if (huellaBase !== baseVista.huella) {
    const anterior = baseVista.base
    setBaseVista({ huella: huellaBase, base })
    setCasillas((prev) => fusionarConElServidor(prev, anterior, base))
  }

  const motivos = useMemo(() => motivosDeDiaNoTrabajado(), [])
  // LA MISMA REGLA QUE ESCRIBE LA ACCIÓN, NO UN NÚMERO COPIADO. Si el aviso dijera «9 h» a mano,
  // el día que cambie la jornada por defecto la pantalla mentiría sin que ningún test se ponga rojo.
  const jornada = jornadaPorDefecto(fecha)
  const marcas = loQueViajaPresencia(casillas)
  const resumen = resumenPresencia(marcas, aMarcar.length)
  const conTardanza = marcas.filter(hayTardanza).length
  const falta = avisoSinMarcar(resumen.sinMarcar)

  // ═══ CADA TOQUE SE GUARDA AL INSTANTE (dueño, 17/09/2026) ═══
  //
  // Antes se marcaba y después había que tocar «Guardar la presencia» al pie de la lista; desde el
  // teléfono no se llegaba y no se grababa nada. Ahora cada toque escribe, la fila dice «guardando…» /
  // «✓ guardado», y si la base rechaza, la casilla vuelve a como estaba y se dice por qué.
  const [estadoFila, setEstadoFila] = useState<Record<string, { tipo: 'guardando' | 'ok' | 'error'; texto?: string }>>({})

  const persistir = (id: string, toque: ToqueDePresencia) => {
    const antes = casillas[id] ?? { estado: null, motivo: null }
    const despues = casillaTrasToque(antes, toque)
    setResultado(null)
    setCasillas((prev) => ({ ...prev, [id]: despues }))
    setEstadoFila((prev) => ({ ...prev, [id]: { tipo: 'guardando' } }))
    const marca = marcaDeLaCasilla(id, despues)
    arrancar(async () => {
      const r = marca
        ? await guardarPresencia({ obra_id: obraId, fecha, marcas: [marca] })
        : antes.estado ? await quitarPresencia({ persona_id: id, fecha }) : { ok: true as const, mensaje: '' }
      if (r.ok) {
        setEstadoFila((prev) => ({ ...prev, [id]: { tipo: 'ok' } }))
        if ('guardadas' in r) onGuardado?.(r.guardadas as PresenciaGuardada[])
        else onGuardado?.(guardadas.filter((g) => g.persona_id !== id))
      } else {
        setCasillas((prev) => ({ ...prev, [id]: antes }))
        setEstadoFila((prev) => ({ ...prev, [id]: { tipo: 'error', texto: r.error } }))
      }
    })
  }

  const tocar = (id: string, boton: EstadoPresencia) => persistir(id, { tipo: 'estado', boton })
  const marcarTardanza = (id: string, marca: 'llego_tarde' | 'salio_antes') => persistir(id, { tipo: 'tardanza', marca })
  const elegirMotivo = (id: string, boton: Exclude<EstadoPresencia, 'presente'>, motivo: string | null) =>
    persistir(id, { tipo: 'motivo', boton, motivo })

  // «MARCAR A TODOS» TAMBIÉN GUARDA EN EL ACTO: sólo a quien estaba sin marcar, en una escritura.
  const marcarTodos = () => {
    const nuevas = marcarTodosPresentes(casillas)
    const aGuardar = loQueViajaPresencia(
      Object.fromEntries(Object.entries(nuevas).filter(([id]) => !casillas[id]?.estado)),
    )
    if (aGuardar.length === 0) { setResultado({ ok: true, texto: 'Ya estaban todos marcados.' }); return }
    const previas = casillas
    setCasillas(nuevas)
    arrancar(async () => {
      const r = await guardarPresencia({ obra_id: obraId, fecha, marcas: aGuardar })
      setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error })
      if (r.ok) onGuardado?.(r.guardadas)
      else setCasillas(previas)
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
          onClick={marcarTodos} disabled={pendiente}
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

              {/* LA TARDANZA, SÓLO SOBRE «ESTÁ» (dueño, 15/09/2026): llegó tarde o se fue antes. Una sola
                  en la quincena pierde el presentismo entero (`presentismo.ts`), y por eso se dice al lado.
                  Está a la vista desde el principio (17/09): marcar «llegó tarde» declara presente. Sobre «no vino» no aparece. */}
              {!noVino && (
                <div className="mt-2 flex gap-2" role="group" aria-label={`Tardanza de ${fila.persona.nombre}`}>
                  <BotonPresencia
                    testid="llego-tarde" rotulo="Llegó tarde" activo={c.llego_tarde === true} tono="warn"
                    onClick={() => marcarTardanza(id, 'llego_tarde')}
                    aria={`${fila.persona.nombre} llegó tarde`}
                  />
                  <BotonPresencia
                    testid="salio-antes" rotulo="Salió antes" activo={c.salio_antes === true} tono="warn"
                    onClick={() => marcarTardanza(id, 'salio_antes')}
                    aria={`${fila.persona.nombre} salió antes`}
                  />
                </div>
              )}

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
              {estadoFila[id] && (
                <p
                  className={`mt-1 text-[12px] ${estadoFila[id].tipo === 'error' ? 'text-neg' : 'text-muted'}`}
                  data-testid="estado-guardado-presencia" data-tipo={estadoFila[id].tipo}
                >
                  {estadoFila[id].tipo === 'guardando' ? 'guardando…' : estadoFila[id].tipo === 'ok' ? '✓ guardado' : `No se guardó: ${estadoFila[id].texto}`}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 space-y-2">
        {/* EL PIE HABLA DE ESTADOS Y NUNCA DE HORAS. Una frase, una unidad. */}
        <p className="text-[13px] text-ink" data-testid="pie-presencia">
          {acusePresencia(resumen)}
          {conTardanza > 0 && (
            <span className="text-warn" data-testid="pie-tardanza">
              {` · ${conTardanza} con tardanza: pierde${conTardanza === 1 ? '' : 'n'} el presentismo de la quincena`}
            </span>
          )}
        </p>
        {falta && <p className="text-[12.5px] text-muted" data-testid="falta-marcar-presencia">{falta}</p>}
        {resultado && (
          <Aviso tono={resultado.ok ? 'info' : 'neg'} testid="acuse-presencia">{resultado.texto}</Aviso>
        )}
        <p className="text-center text-[11px] text-faint">
          <Nulo>Cada toque se guarda en el acto. A quien quede sin marcar no se le toca nada.</Nulo>
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
  // Ámbar para la tardanza: no es una falta (vino), pero es plata que se pierde.
  warn: 'border-warn bg-warn-soft text-warn',
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
