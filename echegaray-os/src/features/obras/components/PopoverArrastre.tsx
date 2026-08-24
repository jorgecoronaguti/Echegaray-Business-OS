'use client'

// EL POPOVER DEL ARRASTRE — la consecuencia ANTES de confirmar, y ahora la escritura.
//
// Mover una actividad y enterarse después de que corrió la obra tres semanas es exactamente lo que
// el contrato pide evitar. Los tres números que muestra —qué arrastra, cuánto corre el fin de obra
// y qué cuadrilla queda en conflicto— salen del motor de camino crítico, no de una estimación de
// la pantalla.
//
// ═══ LOS DOS BOTONES SON DOS DECISIONES DISTINTAS, NO UNA CON UNA OPCIÓN ═══
//
// «Mover igual» corre SÓLO esta actividad y deja el resto donde está: es lo que se hace cuando la
// dependencia existe en el papel pero el jefe ya sabe cómo la acomoda. «Mover y resecuenciar» corre
// también todo lo que depende de ella, con las fechas que calculó el motor — las mismas que el
// popover acaba de mostrar arriba. Por eso el texto de cada botón dice a cuántas toca.
//
// ═══ SE MUESTRA EL EFECTO, NO UN «LISTO» ═══
//
// La respuesta dice cuántas filas se movieron y cuánto se movió la primera. Un «guardado» genérico
// sobre una escritura de N filas es exactamente el caso donde se escriben tres de siete y nadie se
// entera.

import Link from 'next/link'
import { useActionState } from 'react'
import type { Arrastre } from '../services/cronogramaMotor'
import type { ResultadoPlan } from '../services/actionsPlan'

const fmt = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : 'sin fecha')

type Estado = ResultadoPlan | null

export function PopoverArrastre({
  nombre, dias, arrastre, conflictos, hrefCancelar, puedeEditar, mover,
}: {
  nombre: string
  dias: number
  arrastre: Arrastre
  conflictos: string[]
  hrefCancelar: string
  /** Sin permiso los botones no se dibujan habilitados y la pantalla DICE por qué. Un botón que
   *  falla al tocarlo enseña lo mismo que uno apagado, pero después de hacer perder el gesto. */
  puedeEditar: boolean
  /** Ya atada a la obra, la actividad y el delta con `.bind`: una arrow creada en el Server
   *  Component NO cruza a un componente cliente. */
  mover: (form: FormData) => Promise<ResultadoPlan>
}) {
  // El formulario manda cuál de los dos botones se apretó: dos <button name="resecuenciar"> con
  // valores distintos dentro del mismo form. Es la forma de tener dos decisiones y un solo estado.
  const [estado, enviar, enviando] = useActionState<Estado, FormData>(
    async (_prev, form) => mover(form), null,
  )
  const signo = dias > 0 ? '+' : ''
  const nArrastradas = arrastre.arrastradas.length
  const bloqueado = !puedeEditar || arrastre.sinPlan || enviando || estado?.ok === true

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
            {nArrastradas === 0
              ? 'No arrastra ninguna otra actividad: nada depende de ésta.'
              : (<>Arrastra{' '}
                  {arrastre.arrastradas.map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && (i === nArrastradas - 1 ? ' y ' : ', ')}
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

      {estado && (
        <p
          className={`mt-3 border-l-[3px] px-3 py-2 text-[12.5px] ${
            estado.ok ? 'border-pos bg-pos-soft text-ink-soft' : 'border-neg bg-neg-soft text-ink-soft'
          }`}
          data-testid="resultado-arrastre"
        >
          {estado.ok ? estado.mensaje : estado.error}
        </p>
      )}

      <form action={enviar} className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit" name="resecuenciar" value="0" disabled={bloqueado}
          className={bloqueado
            ? 'cursor-not-allowed rounded-control bg-surface-sunken px-3 py-1.5 text-[12.5px] font-semibold text-faint'
            : 'rounded-control bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-surface hover:opacity-90'}
        >
          {enviando ? 'Guardando…' : 'Mover igual'}
        </button>
        <button
          type="submit" name="resecuenciar" value="1" disabled={bloqueado || nArrastradas === 0}
          title={nArrastradas === 0 ? 'No hay nada que resecuenciar: ninguna actividad depende de ésta.' : undefined}
          className={bloqueado || nArrastradas === 0
            ? 'cursor-not-allowed rounded-control border border-line px-3 py-1.5 text-[12.5px] text-faint'
            : 'rounded-control border border-line px-3 py-1.5 text-[12.5px] text-ink hover:bg-surface-quiet'}
        >
          Mover y resecuenciar{nArrastradas > 0 ? ` (${nArrastradas + 1})` : ''}
        </button>
        <Link href={hrefCancelar} prefetch={false} scroll={false} className="text-[12.5px] text-muted hover:text-ink">
          {estado?.ok ? 'Cerrar' : 'Cancelar'}
        </Link>
      </form>

      <p className="mt-2 text-[11px] text-faint">
        {!puedeEditar
          ? 'Sólo se simula: reprogramar el plan es de Administración y de la jefatura de obra.'
          : 'Escribe el plan (inicio y fin). La línea base no se toca: el desvío se sigue midiendo contra el plan aprobado.'}
      </p>
    </aside>
  )
}
