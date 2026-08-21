'use client'

// LAS ACCIONES DEL PRESUPUESTO — una primaria por contexto, y las demás en texto.
//
// «Convertir a obra» es la primaria de la pantalla 15. Cuando todavía no corresponde —el
// presupuesto no está adjudicado, o no está congelado— NO se esconde: se dibuja apagada y con el
// motivo al lado. Un botón que desaparece obliga a adivinar qué falta; uno apagado que dice
// «congelá primero» enseña el ciclo.
//
// «Congelar» tiene efecto irreversible: copia la composición y fija el costo. Por eso su leyenda
// dice qué hace ANTES de tocarlo, y no hay `window.confirm` — un diálogo nativo no se lee en el
// teléfono y no queda como evidencia en la pantalla.

import Link from 'next/link'
import { useActionState, startTransition, type FormEvent } from 'react'
import { cambiarEstado, congelar, nuevaVersion, INICIAL, type EstadoAccion } from '../services/actions'
import { transicionesDe, lecturaEstado } from '../services/estado'
import type { EstadoPresupuesto } from '../types'

export function AccionesPresupuesto({
  id,
  estado,
  congelado,
  puedeCongelar,
  motivoCongelar,
  puedeConvertir,
  motivoConvertir,
  hrefConvertir,
}: {
  id: string
  estado: EstadoPresupuesto
  congelado: boolean
  puedeCongelar: boolean
  motivoCongelar: string | null
  puedeConvertir: boolean
  motivoConvertir: string | null
  hrefConvertir: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="acciones-presupuesto">
      <CambiarEstado id={id} estado={estado} />
      {!congelado && <Congelar id={id} puede={puedeCongelar} motivo={motivoCongelar} />}
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
        <span className="inline-flex items-center gap-2" data-testid="convertir-bloqueado">
          <span className="cursor-not-allowed rounded-control bg-white/10 px-3.5 py-[7px] text-[12.5px] font-semibold text-white/40">
            Convertir a obra
          </span>
          <span className="max-w-[240px] text-[11px] leading-tight text-white/50">{motivoConvertir}</span>
        </span>
      )}
    </div>
  )
}

function CambiarEstado({ id, estado }: { id: string; estado: EstadoPresupuesto }) {
  const [res, ejecutar, pendiente] = useActionState<EstadoAccion, FormData>(cambiarEstado, INICIAL)
  const opciones = transicionesDe(estado)
  if (opciones.length === 0) {
    return <span className="text-[11.5px] text-white/45" data-testid="estado-final">El ciclo de este presupuesto terminó</span>
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
        className="rounded-control border border-white/20 bg-transparent px-2 py-1 text-[12px] text-white/80"
      >
        <option value="" disabled className="text-ink">Pasar a…</option>
        {opciones.map((o) => (
          <option key={o} value={o} className="text-ink">{lecturaEstado(o).label}</option>
        ))}
      </select>
      {res.error && <span className="text-[11px] text-neg">{res.error}</span>}
    </form>
  )
}

function Congelar({ id, puede, motivo }: { id: string; puede: boolean; motivo: string | null }) {
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
        disabled={!puede || pendiente}
        data-testid="congelar"
        className="rounded-control border border-white/20 px-2.5 py-1 text-[12px] text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/30 disabled:hover:bg-transparent"
      >
        {pendiente ? 'Congelando…' : 'Congelar'}
      </button>
      <span className="max-w-[280px] text-[11px] leading-tight text-white/45">
        {motivo ?? 'Copia la composición de cada partida y fija el costo. Se hace una sola vez.'}
      </span>
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
      <button type="submit" disabled={pendiente} data-testid="nueva-version"
        className="text-[12.5px] text-white/70 underline-offset-2 hover:text-white hover:underline disabled:text-white/30">
        {pendiente ? 'Creando…' : 'Nueva versión'}
      </button>
      {res.mensaje && <span className="text-[11px] text-pos">{res.mensaje}</span>}
      {res.error && <span className="text-[11px] text-neg" data-testid="version-error">{res.error}</span>}
    </form>
  )
}
