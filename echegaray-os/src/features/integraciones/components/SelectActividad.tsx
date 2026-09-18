'use client'

import { useEffect, useRef, useState } from 'react'
import { CAMPO } from '@/shared/components/ds'
import { useEstadoDelServidor } from '@/shared/tiempo-real/useEstadoDelServidor'
import { useCeldaViva, useGuardadoDeshacible } from '@/shared/components/deshacer/DeshacerProvider'
import type { ActividadOpcion } from '../services/operacionGlobalService'
import type { ActionState } from '../services/pedidosActions'

// «PARA QUÉ ACTIVIDAD ES ESTE PEDIDO» — un solo campo, así que GUARDA AL ELEGIR.
//
// Un botón «guardar» por fila en una lista de treinta pedidos son treinta clics de más para un dato
// que es un desplegable. El handoff lo pide explícito («select que guarda al elegir») y el DS lo
// permite exactamente para este caso: campo único, sin formulario alrededor.
//
// ES OPCIONAL Y SE VE QUE LO ES: «sin asignar» en `faint`, no un hueco. La obra sigue siendo el eje
// del pedido; esto contesta «¿qué está esperando esta actividad?» cuando alguien lo sabe.
//
// ═══ CMD/CTRL+Z Y CMD/CTRL+SHIFT+Z (dueño, 17/09/2026) ═══
//
// La elección se apila en la MISMA pila de la plataforma (`useGuardadoDeshacible`). Deshacer vuelve a
// llamar a `alElegir` con la actividad anterior: es la misma escritura, no un camino aparte. `clave` es
// obligatoria porque el deshacer necesita distinguir una fila de las otras treinta — con el `testid`
// compartido, Cmd+Z habría restaurado el pedido equivocado.
//
// ═══ LO ELEGIDO SE RESINCRONIZA CON LA BASE (auditoría, 18/09/2026) ═══
//
// Antes era `useState(valor ?? '')`: se tomaba UNA vez al montar. Otra persona asignaba la actividad X,
// el refresco en vivo traía `valor = X`, y el select seguía en «sin asignar». Esta persona elegía Y con
// un anterior falso (`''`) y Cmd+Z escribía NULL sobre la X del otro. `useEstadoDelServidor` adopta lo
// que trae el servidor cada vez que cambia: el anterior que se apila es el real. Y la vuelta viaja con
// `esperado`: si la base ya tiene otra cosa, la acción rechaza en vez de pisar.
//
// ═══ UNA ASIGNACIÓN QUE NO ESTÁ EN LA LISTA NO SE PISA EN SILENCIO ═══
//
// Si el pedido apunta a una actividad archivada —o a una que este usuario no ve—, el `select` con
// `defaultValue` desconocido pinta la PRIMERA opción: la pantalla diría que el pedido es de otra
// actividad sin que nadie lo haya cambiado. Por eso, cuando el valor guardado no está entre las
// opciones, se agrega una opción que lo dice.

export function SelectActividad({
  valor,
  actividades,
  alElegir,
  testid = 'pedido-actividad',
  clave,
  rotulo = 'Actividad del pedido',
}: {
  valor: string | null
  actividades: ActividadOpcion[]
  /** `esperado` llega sólo desde el deshacer: lo que esta pantalla tenía; la acción no escribe si la base difiere. */
  alElegir: (actividadId: string, esperado?: string) => Promise<ActionState>
  testid?: string
  /** Qué fila es, para el deshacer. Sin esto todas las filas comparten paso y se restaura la que no es. */
  clave: string
  /** Cómo se nombra en el aviso: «Actividad del pedido 1042». */
  rotulo?: string
}) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setElegida] = useEstadoDelServidor(valor ?? '')
  const elegidaRef = useRef(elegida)
  useEffect(() => { elegidaRef.current = elegida })
  const huerfana = Boolean(valor) && !actividades.some((a) => a.id === valor)

  const nombre = (id: string) => {
    if (id === '') return 'sin asignar'
    const a = actividades.find((x) => x.id === id)
    return a ? (a.codigo ? `${a.codigo} · ${a.nombre}` : a.nombre) : 'actividad fuera de la lista'
  }

  const guardarDeshacible = useGuardadoDeshacible({
    clave, rotulo, valorAnterior: elegida, formato: nombre, protegido: true,
    guardar: async (v, contexto) => {
      const r = await alElegir(v, contexto?.esperado)
      return r.error ? { ok: false as const, error: r.error } : { ok: true as const }
    },
  })

  useCeldaViva(clave, { actual: () => elegidaRef.current, aplicar: (v) => setElegida(v) })

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <select
        value={elegida}
        disabled={guardando}
        data-testid={testid}
        aria-label="Para la actividad"
        className={`${CAMPO} h-[30px] max-w-[220px] border-line px-1.5 py-0 text-[12.5px] text-muted max-lg:h-control-movil`}
        onChange={async (e) => {
          const anterior = elegida
          const nuevo = e.target.value
          setElegida(nuevo)
          setGuardando(true)
          setError(null)
          const r = await guardarDeshacible(nuevo)
          setGuardando(false)
          if (!r.ok) { setElegida(anterior); setError(r.error) }
        }}
      >
        <option value="">sin asignar</option>
        {huerfana && <option value={valor as string}>actividad asignada (fuera de la lista)</option>}
        {actividades.map((a) => (
          <option key={a.id} value={a.id}>
            {a.codigo ? `${a.codigo} · ${a.nombre}` : a.nombre}
          </option>
        ))}
      </select>
      {error && <span className="text-[11.5px] text-neg">{error}</span>}
    </span>
  )
}
