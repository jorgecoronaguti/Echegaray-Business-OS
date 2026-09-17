'use client'

// LA MARCA «PAGADA» DE UNA FILA — dueño, 16/09/2026, textual: *«necesito marcar como "pagado" ya a la gente y que
// marque un poco el color distinto en liq hs»*.
//
// Un clic y la persona queda pagada: la acción del servidor (`marcarLineaPagada`) completa Pagado banco y Pagado
// efectivo con lo que faltaba de cada lado, así los saldos quedan en 0 por el mismo camino que un pago tecleado, y
// sella fecha y autor. El segundo clic deshace: vuelven las cifras de antes. La fila entera se pinta con `posSuave`
// (verde = estado positivo, nunca decorativo) y lo decide `colorDeFila`, que es la única definición del color.
//
// Sin `router.refresh()`: la acción hace `revalidatePath` y el árbol de servidor vuelve solo con `pagadaEn` puesto.
// Mientras tanto el botón se apaga (pendiente) y no acepta otro clic.

import { useState, useTransition } from 'react'
import { marcarLineaPagada } from '../../../services/liquidacionActions'
import { diaDelSello } from './marcaDePago'
import type { GrupoLiquidacion } from '../../../services/liquidacionQuincena'

export function MarcaDePago({ personaId, grupo, quincena, pagadaEn, cerrada }: {
  personaId: string
  grupo: GrupoLiquidacion
  quincena: { desde: string; hasta: string }
  pagadaEn: string | null | undefined
  /** La quincena cerrada es una foto: la marca se ve, no se toca. */
  cerrada: boolean
}) {
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // LO QUE PASÓ CON LA QUINCENA al marcar al último: «cerrada» o «NO cerré: …». Un «Marcada como pagada» a secas no se
  // repite, ya lo dice la fila verde.
  const [aviso, setAviso] = useState<string | null>(null)
  const pagada = pagadaEn != null
  const testid = `marca-pagada-${personaId}`

  if (cerrada) {
    return pagada
      ? <span data-testid={testid} data-pagada="1" className="whitespace-nowrap text-[11px] font-semibold leading-4 text-pos">{`✓ Pagada ${diaDelSello(pagadaEn)}`}</span>
      : null
  }

  const alternar = () => empezar(async () => {
    setError(null)
    const r = await marcarLineaPagada({ ...quincena, grupo, persona_id: personaId, pagada: !pagada })
    if (!r.ok) { setError(r.error); return }
    setAviso(/Todos pagados|todos pagados/.test(r.mensaje) ? r.mensaje : null)
  })

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      {/* CLASES, NO `style`, PARA TODO LO QUE CAMBIA CON EL PUNTERO (QA, 16/09/2026: sin hover; 20 px de alto en el
          teléfono). Alto de control del OS (34 px; 44 en el teléfono), hover claro, foco visible. Los colores son los
          tokens del sistema: `pos` / `pos-soft` para la marca, `line-strong` / `muted` para el botón en reposo. */}
      <button
        type="button"
        onClick={alternar}
        disabled={pendiente}
        data-testid={testid}
        data-pagada={pagada ? '1' : undefined}
        data-pendiente={pendiente ? '1' : undefined}
        aria-pressed={pagada}
        title={pagada
          ? `Pagada el ${diaDelSello(pagadaEn)} · clic para deshacer (vuelven los pagados de antes)`
          : 'Marcar como pagada: lo que falta de cada lado pasa a Pagado y los saldos quedan en 0'}
        className={[
          'h-control max-[767px]:h-11 rounded-full border px-2.5 text-[11px] font-semibold leading-none whitespace-nowrap',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
          'disabled:cursor-progress disabled:opacity-60',
          pagada
            ? 'border-pos bg-pos-soft text-pos hover:border-ink'
            // «PAGAR» EN REPOSO ES TEXTO (limpieza 17/09/2026): quince cápsulas con borde, una por fila, eran la columna
            // más ruidosa del cuadro. Sigue a un clic, con el mismo alto de toque; el borde aparece al pasar el puntero.
            : 'border-transparent bg-transparent text-muted hover:bg-surface-quiet hover:border-line-strong hover:text-ink',
        ].join(' ')}
      >
        {pagada ? `✓ Pagada ${diaDelSello(pagadaEn)}` : 'Pagar'}
      </button>
      {error && <span role="alert" data-testid={`${testid}-error`} className="max-w-40 text-right text-[10.5px] text-neg">{error}</span>}
      {aviso && (
        <span role="status" data-testid={`${testid}-aviso`}
          className={`max-w-56 whitespace-normal text-right text-[10.5px] ${/NO cerré|falló/.test(aviso) ? 'text-warn' : 'text-pos'}`}>
          {aviso}
        </span>
      )}
    </span>
  )
}

