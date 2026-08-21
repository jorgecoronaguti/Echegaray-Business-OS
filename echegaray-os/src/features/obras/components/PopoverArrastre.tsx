// EL POPOVER DEL ARRASTRE — la consecuencia ANTES de confirmar.
//
// Mover una actividad y enterarse después de que corrió la obra tres semanas es exactamente lo que
// el contrato pide evitar. Los tres números que muestra —qué arrastra, cuánto corre el fin de obra
// y qué cuadrilla queda en conflicto— salen del motor de camino crítico, no de una estimación de
// la pantalla.
//
// `Mover igual` y `Mover y resecuenciar` todavía no escriben: la escritura del plan tiene que
// pasar por una Server Action atada a la obra y por la línea base, y eso es trabajo del frente que
// está rehaciendo el workspace. Un botón que dice que movió sin haber movido es peor que un botón
// deshabilitado que dice por qué.

import Link from 'next/link'
import type { Arrastre } from '../services/cronogramaMotor'

const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : 'sin fecha')

export function PopoverArrastre({ nombre, dias, arrastre, conflictos, hrefCancelar }: {
  nombre: string
  dias: number
  arrastre: Arrastre
  conflictos: string[]
  hrefCancelar: string
}) {
  const signo = dias > 0 ? '+' : ''
  return (
    <aside className="rounded-card border border-line bg-surface p-4 shadow-sm" data-testid="popover-arrastre">
      <h2 className="text-[13.5px] font-semibold text-ink">
        Mover {nombre} · <span className="tnum">{signo}{dias}</span> días
      </h2>

      {arrastre.sinPlan && (
        <p className="mt-2 text-[12.5px] text-warn">
          Esta actividad no tiene plan calculable, así que moverla no arrastra nada. Antes hay que
          cargarle días o HH con una cuadrilla.
        </p>
      )}

      {!arrastre.sinPlan && (
        <>
          <p className="mt-2 text-[12.5px] text-ink-soft">
            {arrastre.arrastradas.length === 0
              ? 'No arrastra ninguna otra actividad: nada depende de ésta.'
              : (<>Arrastra{' '}
                  {arrastre.arrastradas.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && (i === arrastre.arrastradas.length - 1 ? ' y ' : ', ')}
                      <strong className="font-semibold">{a.nombre}</strong>
                      {' '}(<span className="tnum">{a.dias > 0 ? '+' : ''}{a.dias} d</span>)
                    </span>
                  ))}.
                </>)}
          </p>
          <p className="mt-1.5 text-[12.5px] text-ink-soft">
            Fin de obra: <span className="tnum">{fmt(arrastre.finObraAntes)}</span> →{' '}
            <span className={`tnum font-semibold ${arrastre.corrimientoFinObra > 0 ? 'text-neg' : 'text-ink'}`}>
              {fmt(arrastre.finObraDespues)}
            </span>
            {arrastre.corrimientoFinObra !== 0 && (
              <span className="text-muted"> ({arrastre.corrimientoFinObra > 0 ? '+' : ''}{arrastre.corrimientoFinObra} d)</span>
            )}
          </p>
          {conflictos.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1">
              {conflictos.map((c) => (
                <li key={c} className="text-[12.5px] text-warn">{c}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button" disabled
          title="Escribir el plan es del frente que rehace el workspace de la obra: acá todavía se simula, no se guarda."
          className="cursor-not-allowed rounded-control bg-surface-sunken px-3 py-1.5 text-[12.5px] font-semibold text-faint"
        >
          Mover igual
        </button>
        <button
          type="button" disabled
          title="Escribir el plan es del frente que rehace el workspace de la obra: acá todavía se simula, no se guarda."
          className="cursor-not-allowed rounded-control border border-line px-3 py-1.5 text-[12.5px] text-faint"
        >
          Mover y resecuenciar
        </button>
        <Link href={hrefCancelar} scroll={false} className="text-[12.5px] text-muted hover:text-ink">Cancelar</Link>
      </div>
      <p className="mt-2 text-[11px] text-faint">
        Esto es una simulación: todavía no escribe el plan.
      </p>
    </aside>
  )
}
