'use client'

// LA BARRA DE ACCIONES MASIVAS DEL CRONOGRAMA — poner una obra en marcha sin abrir 344 paneles.
//
// ═══ POR QUÉ APARECE Y DESAPARECE ═══
//
// Sin nada seleccionado no se dibuja: una barra siempre presente con tres botones apagados le suma
// ruido permanente a la vista más usada del módulo para servir a una tarea que se hace una vez por
// obra. Aparece cuando hay selección, dice CUÁNTAS, y se va cuando se limpia.
//
// ═══ LA PANTALLA MUESTRA EL EFECTO, NO UN «LISTO» ═══
//
// Cada acción devuelve `{ tocadas, salteadas, motivo }` y eso es lo que se lee acá: «sellé 9 · 3
// quedaron afuera: sin inicio y fin de plan». Un «listo» genérico sobre una selección de 344 no
// prueba nada — es exactamente el caso en el que una escritura puede tocar la mitad y nadie
// enterarse. El resultado queda a la vista hasta la acción siguiente.
//
// ═══ LA SELECCIÓN NO SE LIMPIA SOLA AL TERMINAR ═══
//
// Poner en marcha una obra es asignar responsable Y cargar HH Y sellar sobre EL MISMO grupo. Si la
// selección se borrara con cada acción, habría que volver a tildar cincuenta casillas tres veces.
// Se limpia cuando la persona lo dice.

import { useState, type ReactNode } from 'react'
import type { Persona } from '../types'
import { CTRL, type ResultadoAccion } from '@/shared/components/ui'
import type { EntradaHH, ResultadoMasivo } from '../services/actionsMasivas'

export type AccionesEnLote = {
  responsable: (ids: string[], personaId: string) => Promise<ResultadoMasivo>
  hhPlan: (ids: string[], entrada: EntradaHH) => Promise<ResultadoMasivo>
  baseline: (ids: string[], resellar: boolean) => Promise<ResultadoMasivo>
}

const BOTON = 'rounded-control border border-line px-2.5 py-1 text-[12px] text-ink hover:bg-surface-sunken'

/**
 * LA CASILLA DE SELECCIÓN EN LOTE.
 *
 * Va como HERMANA del botón de la fila, nunca adentro: un `input` dentro de un `button` es marcado
 * inválido y el clic termina en cualquiera de los dos según el navegador —tildar una casilla abriría
 * el panel de la actividad—. El rótulo accesible lleva el nombre de la fila porque es lo único que
 * distingue una casilla de las otras trescientas.
 */
export function Casilla({ puesta, alCambiar, etiqueta, testid }: {
  puesta: boolean
  alCambiar: (v: boolean) => void
  etiqueta: string
  testid: string
}) {
  return (
    <input
      type="checkbox"
      checked={puesta}
      onChange={(e) => alCambiar(e.target.checked)}
      aria-label={etiqueta}
      data-testid={testid}
      className="h-3.5 w-3.5 shrink-0 accent-slate-900"
    />
  )
}

/** Un desplegable con el formulario adentro. `<details>` y no un modal: el cronograma tiene que
 *  seguir a la vista, que es contra lo que se decide a quién asignarle qué. */
function Menu({ titulo, testid, children }: { titulo: string; testid: string; children: ReactNode }) {
  return (
    <details className="relative">
      <summary data-testid={testid} className={`cursor-pointer list-none ${BOTON}`}>{titulo}</summary>
      <div className="absolute left-0 z-30 mt-1 w-[286px] rounded-control border border-line bg-surface p-3 shadow-pop">
        {children}
      </div>
    </details>
  )
}

/** El botón que dispara la acción y deja el resultado escrito. Uno solo para las tres. */
function Disparar({ label, testid, correr }: { label: string; testid: string; correr: () => Promise<void> }) {
  const [pendiente, setPendiente] = useState(false)
  return (
    <button
      type="button"
      disabled={pendiente}
      data-testid={testid}
      onClick={async () => { setPendiente(true); try { await correr() } finally { setPendiente(false) } }}
      className="rounded-control bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    >{pendiente ? 'Guardando…' : label}</button>
  )
}

function Responsable({ personas, correr }: { personas: Persona[]; correr: (p: string) => Promise<void> }) {
  const [personaId, setPersonaId] = useState('')
  return (
    <Menu titulo="Responsable" testid="masiva-responsable">
      <label className="block text-[11px] text-faint">
        Quién responde por estas actividades
        <select
          value={personaId}
          onChange={(e) => setPersonaId(e.target.value)}
          data-testid="masiva-responsable-select"
          className={CTRL}
        >
          <option value="">— quitar el responsable —</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
        </select>
      </label>
      {personas.length === 0 && (
        <p className="mt-1.5 text-[11px] text-neg">No hay nadie en el legajo: cargá el personal antes de asignar.</p>
      )}
      <div className="mt-2.5">
        <Disparar label="Asignar" testid="masiva-responsable-aplicar" correr={() => correr(personaId)} />
      </div>
    </Menu>
  )
}

/**
 * HH PLAN — el mismo número para cada una, o un total repartido.
 *
 * El reparto ofrece SU CRITERIO a la vista y no lo elige solo: repartir 800 HH entre diez
 * actividades por duración o por cabeza da dos planes distintos, y cuál corresponde lo sabe quien
 * conoce el trabajo. Elegir por él y no decirlo sería fabricar un criterio.
 */
function HHPlan({ correr }: { correr: (e: EntradaHH) => Promise<void> }) {
  const [modo, setModo] = useState<'fijo' | 'total'>('fijo')
  const [valor, setValor] = useState('')
  const [criterio, setCriterio] = useState<'proporcional' | 'iguales'>('proporcional')

  return (
    <Menu titulo="HH plan" testid="masiva-hh">
      <div className="flex overflow-hidden rounded-control border border-line text-[12px]">
        {([['fijo', 'Fijo c/u'], ['total', 'Repartir total']] as const).map(([m, l]) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            data-testid={`masiva-hh-modo-${m}`}
            className={`flex-1 px-2 py-1 ${modo === m ? 'bg-accent text-white' : 'bg-surface text-muted hover:bg-surface-sunken'}`}
          >{l}</button>
        ))}
      </div>
      <label className="mt-2 block text-[11px] text-faint">
        {modo === 'fijo' ? 'HH para CADA actividad seleccionada' : 'Total de HH a repartir entre las seleccionadas'}
        <input
          type="number" min={0} step="0.5" value={valor}
          onChange={(e) => setValor(e.target.value)}
          data-testid="masiva-hh-valor"
          className={CTRL}
        />
      </label>
      {modo === 'total' && (
        <label className="mt-2 block text-[11px] text-faint">
          Cómo se reparte
          <select
            value={criterio}
            onChange={(e) => setCriterio(e.target.value === 'iguales' ? 'iguales' : 'proporcional')}
            data-testid="masiva-hh-criterio"
            className={CTRL}
          >
            <option value="proporcional">proporcional a los días de plan</option>
            <option value="iguales">en partes iguales</option>
          </select>
          {criterio === 'proporcional' && (
            <span className="mt-1 block text-[10px] text-faint">
              Las que no tengan inicio y fin de plan quedan afuera: sin duración no hay contra qué repartir.
            </span>
          )}
        </label>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        No se escribe 0: cero horas dice que la actividad no lleva mano de obra, y eso no es lo mismo
        que todavía no saberlo.
      </p>
      <div className="mt-2.5">
        <Disparar
          label="Cargar HH"
          testid="masiva-hh-aplicar"
          correr={() => correr(modo === 'fijo'
            ? { modo: 'fijo', valor: Number(valor) }
            : { modo: 'total', valor: Number(valor), criterio })}
        />
      </div>
    </Menu>
  )
}

/**
 * SELLAR LA LÍNEA BASE DE LA SELECCIÓN.
 *
 * La casilla de re-sellar arranca SIEMPRE apagada y su advertencia está escrita al lado, no en un
 * `confirm()` del navegador: un diálogo nativo se cierra con el pulgar sin leerlo y no queda a la
 * vista mientras se decide. Re-sellar una actividad atrasada la devuelve a «en fecha» sin un solo
 * error: es la única acción del módulo que borra una medición.
 */
function LineaBase({ correr }: { correr: (resellar: boolean) => Promise<void> }) {
  const [resellar, setResellar] = useState(false)
  return (
    <Menu titulo="Línea base" testid="masiva-baseline">
      <p className="text-[12px] leading-relaxed text-muted">
        Congela el <strong className="text-ink">inicio y fin de plan</strong> de las seleccionadas como
        el plan aprobado. Las que no tengan las dos fechas quedan afuera y se informan.
      </p>
      <label className="mt-2.5 flex items-start gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={resellar}
          onChange={(e) => setResellar(e.target.checked)}
          data-testid="masiva-baseline-resellar"
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
        />
        <span>
          Re-sellar las que YA tienen línea base.
          <span className="block text-neg">Reemplaza el plan aprobado: el desvío que hoy miden vuelve a cero.</span>
        </span>
      </label>
      <div className="mt-2.5">
        <Disparar label="Sellar" testid="masiva-baseline-aplicar" correr={() => correr(resellar)} />
      </div>
    </Menu>
  )
}

/** El resultado, con las dos puntas: lo que entró y lo que quedó afuera con su motivo. */
function Resultado({ r }: { r: ResultadoMasivo }) {
  if (!r.ok) return <span data-testid="masiva-resultado" className="text-[12px] text-neg">{r.error}</span>
  return (
    <span data-testid="masiva-resultado" className="text-[12px] text-pos">
      {r.tocadas} actualizada{r.tocadas === 1 ? '' : 's'}
      {r.salteadas > 0 && (
        <span className="text-muted">
          {' · '}{r.salteadas} afuera{r.motivo ? `: ${r.motivo}` : ''}
        </span>
      )}
    </span>
  )
}

export function BarraMasiva({
  ids, personas, acciones, alLimpiar,
}: {
  /** Los ids seleccionados, en el orden del cronograma. La barra no decide qué está seleccionado. */
  ids: string[]
  personas: Persona[]
  acciones: AccionesEnLote
  alLimpiar: () => void
}) {
  const [resultado, setResultado] = useState<ResultadoMasivo | null>(null)
  if (ids.length === 0) return null

  const correr = async (f: () => Promise<ResultadoMasivo>) => { setResultado(await f()) }

  return (
    <div
      data-testid="barra-masiva"
      className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-quiet px-4 py-2"
    >
      <span data-testid="masiva-conteo" className="text-[12px] font-medium tabular-nums text-ink">
        {ids.length} actividad{ids.length === 1 ? '' : 'es'} seleccionada{ids.length === 1 ? '' : 's'}
      </span>
      <Responsable personas={personas} correr={(p) => correr(() => acciones.responsable(ids, p))} />
      <HHPlan correr={(e) => correr(() => acciones.hhPlan(ids, e))} />
      <LineaBase correr={(r) => correr(() => acciones.baseline(ids, r))} />
      <button
        type="button"
        onClick={() => { setResultado(null); alLimpiar() }}
        data-testid="masiva-limpiar"
        className="text-[12px] text-muted hover:text-ink"
      >limpiar selección</button>
      {resultado && <Resultado r={resultado} />}
    </div>
  )
}

/**
 * SELLAR LA LÍNEA BASE DE TODA LA OBRA — la acción con más consecuencias del módulo, y la única que
 * no se deshace. Vivía en `Gantt.tsx`; se mudó acá para que todo el sellado —el de la obra entera y
 * el de una selección— se lea en un solo archivo y no se diseñe dos veces con dos criterios.
 *
 * La advertencia va ESCRITA Y VISIBLE, no en un `confirm()` del navegador: un diálogo nativo se
 * cierra con el pulgar sin leerlo, no queda a la vista mientras se decide, y encima obliga a los
 * tests a atrapar el evento. Una vez sellada, el botón desaparece en lugar de fallar contra el
 * servidor — y a partir de ahí lo que queda por sellar se sella por selección, con la barra de
 * arriba.
 */
export function SellarLineaBase({ sellar, yaSellada }: { sellar: () => Promise<ResultadoAccion>; yaSellada: boolean }) {
  const [estado, setEstado] = useState<ResultadoAccion | null>(null)
  if (yaSellada) {
    return <span className="text-[11px] text-faint" data-testid="baseline-sellada">línea base sellada</span>
  }
  return (
    <details className="relative">
      <summary data-testid="sellar-baseline" className={`cursor-pointer list-none ${BOTON}`}>Sellar línea base</summary>
      <div className="absolute right-0 z-30 mt-1 w-[280px] rounded-control border border-line bg-surface p-3 shadow-pop">
        <p className="text-[12px] leading-relaxed text-muted">
          Congela las fechas de HOY como el plan aprobado. <strong className="text-ink">Se hace una sola vez</strong>:
          desde entonces, mover una fecha produce un desvío medible. Si se pudiera volver a sellar, cada
          reprogramación dejaría el desvío en cero y el tablero diría que siempre vamos en fecha.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Disparar
            label="Sellar el plan de hoy"
            testid="sellar-baseline-confirmar"
            correr={async () => { setEstado(await sellar()) }}
          />
          {estado?.ok === false && (
            <span data-testid="sellar-baseline-confirmar-error" className="text-[11px] text-neg">{estado.error}</span>
          )}
        </div>
      </div>
    </details>
  )
}
