'use client'

// 13 · PREPARAR LA OBRA — el workspace entero: tabla, columna derecha y la barra que crea el plan.
//
// ═══ QUÉ DEFECTO CIERRA ═══
//
// Hasta hoy esta pantalla era una lista de partidas y un configurador de a una: convertir un
// presupuesto de veinte partidas eran veinte elecciones, veinte formularios y veinte envíos, y no
// había en ninguna parte el número que se está por crear. El canónico 13 lo resuelve como lo que
// es: una lista de trabajo con casillas, un resumen de lo elegido y UN gesto al final.
//
// El configurador NO se retira: partir una partida en tres frentes por eje sigue siendo suyo, y
// cada fila lo enlaza. Lo que cambia es el caso normal —«esta obra se organiza como está
// cotizada»—, que pasa de veinte gestos a uno.
//
// ═══ TODO EL ESTADO ES DEL NAVEGADOR, Y NINGUNO ES UN DATO ═══
//
// Marcar, elegir método y elegir plantilla no escriben nada hasta que alguien aprieta «Crear el
// plan». No se sincroniza con la URL a propósito: media selección compartida por chat se leería
// como una decisión tomada, y no lo es. Lo que sí es compartible —qué partida se está configurando
// en detalle— sigue viviendo en `?partida=`.

import { useActionState, useMemo, useState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'
import type { MetodoMedicion, PartidaValorizada, Plantilla } from '../types'
import type { ConversionHecha, DatosDePreparacion } from '../services/preparacionObra'
import {
  avisoDeLaSeleccion, bloqueosDeCreacion, checklistDeCreacion, filasDePreparacion, metodoEsElegible,
  resumenDelPlan, seleccionables,
} from '../services/preparacionObra'
import { hh as fHH } from '../services/formato'
import { TablaPreparacionObra } from './TablaPreparacionObra'
import { PanelPreparacionObra, type ObraDelPlan } from './PanelPreparacionObra'

export interface Props {
  partidas: PartidaValorizada[]
  conversiones: Record<string, ConversionHecha>
  plantillas: Plantilla[]
  obra: ObraDelPlan
  datos: DatosDePreparacion
  /**
   * La URL de esta pantalla, sin parámetros. El link «partir en frentes» se arma ACÁ ADENTRO y no
   * llega como función: una arrow creada en un Server Component NO cruza la frontera —React la
   * rechaza en tiempo de ejecución y la pantalla queda en blanco—, y ni el typecheck ni el build lo
   * ven. Es el mismo defecto que documenta `LienzoCronogramaObra` con el constructor de links.
   */
  hrefBase: string
  /** Ya atada al presupuesto con `.bind`: el id no viaja en un campo editable del formulario. */
  crear: (form: FormData) => Promise<ResultadoAccion>
}

export function PreparacionObra({
  partidas, conversiones, plantillas, obra, datos, hrefBase, crear,
}: Props) {
  const hrefDetalle = (partidaId: string) => `${hrefBase}?partida=${partidaId}`
  const filasBase = useMemo(
    () => filasDePreparacion(partidas, conversiones), [partidas, conversiones],
  )
  // ARRANCA CON TODO LO CONVERTIBLE MARCADO, como el canónico. Es el caso normal —se convierte el
  // presupuesto entero— y arrancar en cero obligaría a veinte clics para el camino de siempre.
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(
    () => new Set(seleccionables(filasBase).map((f) => f.partidaId)),
  )
  const [metodos, setMetodos] = useState<Record<string, MetodoMedicion>>({})
  const [plantillaPorFila, setPlantillaPorFila] = useState<Record<string, string | null>>({})
  // NUNCA HOY POR DEFECTO. La fecha de arranque es la de la obra cuando existe; si no existe, queda
  // vacía y la primaria se bloquea diciendo por qué. Un default cómodo acá se vuelve un desvío
  // calculado contra una ficción tres meses después.
  const [inicio, setInicio] = useState(obra.inicio ?? '')

  const filas = useMemo(
    () => filasDePreparacion(partidas, conversiones, metodos), [partidas, conversiones, metodos],
  )
  const resumen = useMemo(() => resumenDelPlan(filas, seleccion), [filas, seleccion])
  const checklist = useMemo(
    () => checklistDeCreacion({ ...datos, inicioPlan: inicio || null }), [datos, inicio],
  )
  const bloqueos = bloqueosDeCreacion(checklist)

  const metodoDe = (id: string) => filas.find((f) => f.partidaId === id)?.metodo ?? null
  const plantillaDe = (id: string) => plantillaPorFila[id] ?? null

  const marcar = (id: string) => setSeleccion((p) => {
    const s = new Set(p)
    if (s.has(id)) s.delete(id); else s.add(id)
    return s
  })
  const marcarTodo = () => setSeleccion((p) => (
    p.size > 0 ? new Set<string>() : new Set(seleccionables(filasBase).map((f) => f.partidaId))
  ))
  const elegirMetodo = (id: string, m: MetodoMedicion) => {
    const p = partidas.find((x) => x.partida_id === id)
    if (p && !metodoEsElegible(p)) return
    setMetodos((prev) => ({ ...prev, [id]: m }))
    // Marcar el método de una fila es decir que se convierte: elegirlo sin marcarla dejaba la
    // elección lista y la partida afuera.
    setSeleccion((prev) => (prev.has(id) ? prev : new Set([...prev, id])))
  }
  const elegirPlantilla = (id: string, plantillaId: string | null) =>
    setPlantillaPorFila((prev) => ({ ...prev, [id]: plantillaId }))

  // MEDIR POR PASOS SIN PLANTILLA ES UNA ACTIVIDAD QUE NO SE PUEDE MEDIR: la base la crea marcada
  // «por pasos» y sin un solo paso adentro. El servidor lo rechaza igual; acá se dice antes.
  const sinPlantilla = filas.filter(
    (f) => seleccion.has(f.partidaId) && f.metodo === 'pasos' && !plantillaDe(f.partidaId),
  )

  const motivo = resumen.elegidas === 0
    ? 'Elegí al menos una partida'
    : bloqueos.length > 0
      ? bloqueos[0].titulo.toLowerCase()
      : sinPlantilla.length > 0
        ? `${sinPlantilla.length} por pasos sin plantilla de secuencia`
        : null

  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_previo, form) => crear(form), null,
  )

  const aviso = avisoDeLaSeleccion(resumen)

  return (
    // 96px al pie: es el alto de la barra fija del canónico. Sin ese colchón, la última fila de la
    // tabla queda debajo de la barra y no se puede marcar.
    <form action={ejecutar} data-testid="form-preparacion">
      <div className="flex flex-wrap items-start gap-3 px-4 pb-[96px] pt-3.5 lg:px-5">
        <TablaPreparacionObra
          filas={filas}
          seleccion={seleccion}
          alMarcar={marcar}
          alMarcarTodo={marcarTodo}
          metodoDe={metodoDe}
          alElegirMetodo={elegirMetodo}
          plantillas={plantillas}
          plantillaDe={plantillaDe}
          alElegirPlantilla={elegirPlantilla}
          hrefDetalle={hrefDetalle}
        />
        <PanelPreparacionObra
          obra={{ ...obra, inicio: inicio || null }} checklist={checklist} resumen={resumen}
        />
      </div>

      {/* LOS CAMPOS VIAJAN COMO UNO SOLO REPETIDO. Tres listas paralelas —partida, método,
          plantilla— que llegan de largos distintos aparean el método de una partida con la
          plantilla de otra, y el error no se ve: se ve una obra con los pasos cambiados. */}
      {filas
        .filter((f) => seleccion.has(f.partidaId) && f.estado === 'convertible')
        .map((f) => (
          <input
            key={f.partidaId} type="hidden" name="partida"
            value={`${f.partidaId}~${f.metodo ?? '-'}~${plantillaDe(f.partidaId) ?? '-'}`}
          />
        ))}
      <input type="hidden" name="inicio" value={inicio} />

      <BarraCrear
        elegidas={resumen.elegidas}
        subtitulo={`${resumen.frentes} ${resumen.frentes === 1 ? 'frente' : 'frentes'} · ${
          resumen.hh == null ? 'sin HH cargadas' : `${fHH(resumen.hh)} HH de plan`}`}
        aviso={aviso}
        inicio={inicio}
        alCambiarInicio={setInicio}
        motivo={motivo}
        pendiente={pendiente}
        resultado={estado}
      />
    </form>
  )
}

/**
 * LA BARRA FIJA DEL CANÓNICO — cuántas, qué queda, qué se pierde, y el gesto.
 *
 * «Guardar borrador» del dibujo NO está: no existe el borrador de una conversión, y un botón que no
 * guarda nada es peor que ningún botón. En su lugar va el campo que la base SÍ exige y el dibujo no
 * muestra: la fecha de arranque del plan, sin la cual las actividades nacerían sin dimensión
 * temporal (ver la desviación declarada en el informe).
 */
function BarraCrear({
  elegidas, subtitulo, aviso, inicio, alCambiarInicio, motivo, pendiente, resultado,
}: {
  elegidas: number
  subtitulo: string
  aviso: string | null
  inicio: string
  alCambiarInicio: (v: string) => void
  motivo: string | null
  pendiente: boolean
  resultado: ResultadoAccion | null
}) {
  return (
    <div
      data-testid="barra-crear-plan"
      className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line-strong bg-surface px-5 py-3 shadow-[0_-2px_12px_rgba(31,31,30,.06)]"
    >
      <span className="text-[13px] font-semibold text-ink" data-testid="conteo-elegidas">
        {elegidas} {elegidas === 1 ? 'partida' : 'partidas'}
      </span>
      <span className="text-[12.5px] text-muted">{subtitulo}</span>
      {aviso && (
        <span
          data-testid="aviso-seleccion"
          className="flex items-center gap-1.5 rounded-control border border-warn/30 bg-warn-soft px-2.5 py-1 text-[12px] text-warn"
        >
          {aviso}
        </span>
      )}
      {resultado?.ok === false && (
        <span data-testid="error-crear" className="text-[12px] text-neg">{resultado.error}</span>
      )}
      {resultado?.ok === true && (
        <span data-testid="ok-crear" className="text-[12px] text-pos">{resultado.mensaje ?? 'Plan creado.'}</span>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          Arranque del plan
          <input
            type="date" name="inicio_visible" value={inicio} data-testid="inicio-plan"
            onChange={(e) => alCambiarInicio(e.target.value)}
            className="h-control rounded-control border border-line bg-surface px-2 text-[12.5px] text-ink"
          />
        </label>
        {motivo && <span className="text-[12px] text-warn" data-testid="motivo-bloqueo">{motivo}</span>}
        <button
          type="submit" disabled={pendiente || motivo != null} data-testid="crear-plan"
          className="flex items-center gap-[7px] rounded-control bg-marca px-[15px] py-[9px] text-[13px] font-semibold text-[color:var(--os-on-marca)] transition-colors hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint disabled:hover:brightness-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          {pendiente ? 'Creando…' : `Crear el plan (${elegidas})`}
        </button>
      </div>
    </div>
  )
}
