'use client'

// LAS ACCIONES DEL PRESUPUESTO — una primaria por contexto, y las demás en icono o texto.
//
// «Convertir a obra» es la primaria de la pantalla 15. Cuando todavía no corresponde —el
// presupuesto no está adjudicado, o no está congelado— NO se esconde: se dibuja apagada y el motivo
// va en su `title`. Un botón que desaparece obliga a adivinar qué falta; uno apagado que al pasar
// por encima dice «congelá primero» enseña el ciclo sin ocupar 240px de la línea del encabezado.
//
// «Congelar» tiene efecto irreversible: copia la composición y fija el costo. Por eso su leyenda
// dice qué hace ANTES de tocarlo —bajo demanda, en el `title`— y no hay `window.confirm`: un diálogo
// nativo no se lee en el teléfono y no queda como evidencia en la pantalla.
//
// ═══ Y POR ESO CONGELAR SALIÓ DE ACÁ (contrato v5) ═══
//
// El botón vivía en esta fila, DESHABILITADO, con el motivo escondido en el `title`. El contrato lo
// prohíbe: «con bloqueos no se muestra botón deshabilitado, se muestra la lista con enlace a cada
// problema». Ahora `BotonCongelar` se exporta suelto y lo dibuja el encabezado del presupuesto vivo
// SÓLO cuando el gate pasa; cuando no pasa, ese mismo lugar muestra los bloqueos, cada uno enlazado
// a su partida. El botón deshabilitado desapareció porque no era una explicación, era un acertijo.
//
// ═══ TOKENS CLAROS, NO BLANCOS TRANSLÚCIDOS (Design 23/08) ═══
//
// Estos controles vivían sobre el slab grafito y estaban escritos en `text-white/40`, `bg-white/10`
// y `border-white/20` — nueve valores que no existen en `globals.css`. Con el encabezado claro de la
// 15 pasan a los tokens del sistema, que es lo que hace que un botón deshabilitado se vea igual acá
// que en Compras.

import Link from 'next/link'
import { useActionState, startTransition, type FormEvent } from 'react'
import { IconoHistorial } from '@/shared/components/iconos'
import { cambiarEstado, congelar, nuevaVersion } from '../services/actions'
import { INICIAL, type EstadoAccion } from '../services/accion'
import { transicionesDe, lecturaEstado } from '../services/estado'
import type { EstadoPresupuesto } from '../types'

const SECUNDARIO =
  'inline-flex items-center gap-1.5 rounded-control border border-line px-2.5 py-[6px] text-[12.5px] text-ink transition-colors hover:bg-surface-quiet disabled:cursor-not-allowed disabled:border-line disabled:text-faint disabled:hover:bg-transparent'

export function AccionesPresupuesto({
  id,
  estado,
  puedeConvertir,
  motivoConvertir,
  hrefConvertir,
}: {
  id: string
  estado: EstadoPresupuesto
  puedeConvertir: boolean
  motivoConvertir: string | null
  hrefConvertir: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="acciones-presupuesto">
      <CambiarEstado id={id} estado={estado} />
      {/* Congelar NO se dibuja acá: cuando se puede, lo dibuja el encabezado del presupuesto vivo;
          cuando no, ese lugar muestra los bloqueos. Ver el encabezado de este archivo. */}
      <NuevaVersion id={id} />
      {puedeConvertir ? (
        <Link
          href={hrefConvertir}
          data-testid="convertir-a-obra"
          className="rounded-control bg-marca px-3.5 py-[7px] text-[12.5px] font-semibold text-[color:var(--os-on-marca)] transition-colors hover:brightness-[0.97]"
        >
          Convertir a obra
        </Link>
      ) : (
        // El motivo va en el `title`, no en 240px de texto permanente al lado del botón: es la
        // respuesta a «por qué está apagado», y esa pregunta se hace una vez.
        <span
          data-testid="convertir-bloqueado"
          title={motivoConvertir ?? undefined}
          className="cursor-not-allowed rounded-control bg-surface-sunken px-3.5 py-[7px] text-[12.5px] font-semibold text-faint"
        >
          Convertir a obra
        </span>
      )}
    </div>
  )
}

function CambiarEstado({ id, estado }: { id: string; estado: EstadoPresupuesto }) {
  const [res, ejecutar, pendiente] = useActionState<EstadoAccion, FormData>(cambiarEstado, INICIAL)
  const opciones = transicionesDe(estado)
  if (opciones.length === 0) {
    return <span className="text-[11.5px] text-faint" data-testid="estado-final">Ciclo terminado</span>
  }
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const d = new FormData(e.currentTarget)
        startTransition(() => ejecutar(d))
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <select
        name="estado"
        defaultValue=""
        disabled={pendiente}
        aria-label="Pasar el presupuesto a otro estado"
        data-testid="cambiar-estado"
        onChange={(e) => { if (e.target.value) e.currentTarget.form?.requestSubmit() }}
        className="h-[32px] rounded-control border border-line-strong bg-surface px-2 text-[12.5px] text-ink"
      >
        <option value="" disabled>Pasar a…</option>
        {opciones.map((o) => (
          <option key={o} value={o}>{lecturaEstado(o).label}</option>
        ))}
      </select>
      {res.error && <span className="text-[11px] text-neg">{res.error}</span>}
    </form>
  )
}

/**
 * EL BOTÓN DE CONGELAR, SUELTO — lo monta quien ya sabe que el gate pasa.
 *
 * No recibe `puede`: si hubiera que decidirlo acá, volvería a existir el estado deshabilitado que el
 * contrato prohíbe. La cerradura de verdad sigue en la base (`cot_congelar_con_gate` levanta
 * excepción si el gate no pasa), así que un POST que se saltee la pantalla rebota igual.
 */
export function BotonCongelar({ id }: { id: string }) {
  const [res, ejecutar, pendiente] = useActionState<EstadoAccion, FormData>(congelar, INICIAL)
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const d = new FormData(e.currentTarget)
        startTransition(() => ejecutar(d))
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendiente}
        data-testid="congelar"
        title="Copia la composición de cada partida y fija el costo. Se hace una sola vez."
        className="inline-flex items-center gap-1.5 rounded-control bg-marca px-3.5 py-[7px] text-[12.5px] font-semibold text-[color:var(--os-on-marca)] transition-colors hover:brightness-[0.97] disabled:cursor-wait"
      >
        {pendiente ? 'Congelando…' : 'Congelar y preparar oferta'}
      </button>
      {res.mensaje && <span className="text-[11px] text-pos">{res.mensaje}</span>}
      {res.error && <span className="text-[11px] text-neg" data-testid="congelar-error">{res.error}</span>}
    </form>
  )
}

function NuevaVersion({ id }: { id: string }) {
  const [res, ejecutar, pendiente] = useActionState<EstadoAccion, FormData>(nuevaVersion, INICIAL)
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const d = new FormData(e.currentTarget)
        startTransition(() => ejecutar(d))
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendiente}
        data-testid="nueva-version"
        title="Crea una versión nueva desde ésta. La anterior queda como reemplazada."
        className={SECUNDARIO}
      >
        <IconoHistorial className="h-[14px] w-[14px]" />
        {pendiente ? 'Creando…' : 'Nueva versión'}
      </button>
      {res.mensaje && <span className="text-[11px] text-pos">{res.mensaje}</span>}
      {res.error && <span className="text-[11px] text-neg" data-testid="version-error">{res.error}</span>}
    </form>
  )
}
