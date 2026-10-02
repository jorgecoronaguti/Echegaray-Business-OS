'use client'

// EL CUERPO DEL CUADRO DE «PAGADO EN EFECTIVO» (dueño, 02/10/2026: «tiene que ser más preciso de qué se anotó, qué día
// y quién lo hizo y si hay alguna nota»). Sólo dibuja: qué se dice y qué no se afirma lo decide
// `detalleDePagoEnEfectivo.ts`; el cuadro, su apertura y su ubicación son los de `HistorialDeManuales.tsx`.
//
// SIRVE A TODA CELDA CON PUNTO AMARILLO (no sólo al efectivo): el título dice qué celda es, y una celda que no es una suma
// de pagos muestra una sola anotación. Sin tarjeta por renglón: un hilo fino entre uno y otro.

import { SIN_DATO_PREVIO, type DetalleDePago, type RenglonDePago } from '../../services/detalleDePagoEnEfectivo'

const capital = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

/** «Anotado el 01/10/2026, 14:32 por Ana», o lo que no se sabe dicho tal cual. */
const quienYCuando = (r: RenglonDePago): string =>
  r.quien === SIN_DATO_PREVIO ? `${r.cuando}: ${r.quien}` : `Anotado el ${r.cuando} por ${r.quien}`

/**
 * DOS LÍNEAS POR ANOTACIÓN: el importe (con «Sin nota» a la derecha, en tenue) y la procedencia. Una tercera línea sólo
 * existe cuando hay algo más que decir (día del pago, una nota escrita). Así cuatro pagos y el pie entran en un teléfono.
 */
function Renglon({ r, primero }: { r: RenglonDePago; primero: boolean }) {
  const sinNota = r.nota === 'Sin nota'
  const extra = [r.fechaDelPago ? `Pagado el ${r.fechaDelPago}` : null, sinNota ? null : r.nota, r.como ? capital(r.como) : null, r.deEntrega ? 'Salió de una entrega a rendir' : null]
    .filter(Boolean).join(' · ')
  return (
    <li data-testid="pago-efectivo-renglon" className={primero ? 'flex flex-col' : 'flex flex-col border-t border-line pt-1.5'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium leading-5">{r.correccion ? capital(r.correccion) : r.importe}</span>
        {sinNota && <span className="flex-none text-[11px] text-faint">Sin nota</span>}
      </div>
      <div className="break-words text-[11px] leading-4 text-muted">{quienYCuando(r)}</div>
      {extra && <div className="break-words text-[11px] leading-4 text-muted">{extra}</div>}
    </li>
  )
}

export function DetalleDePagoEnEfectivo({ detalle }: { detalle: DetalleDePago }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col">
        <div className="break-words text-[11px] text-muted">{detalle.titulo}</div>
        <div className="text-[16px] font-semibold leading-6" data-testid="pago-efectivo-total">{detalle.total}</div>
        {detalle.cuenta && <div className="break-all text-[11px] text-faint">{detalle.cuenta}</div>}
      </div>
      <ol className="m-0 flex list-none flex-col gap-1.5 border-t border-line p-0 pt-2">
        {detalle.renglones.map((r, i) => <Renglon key={r.id} r={r} primero={i === 0} />)}
      </ol>
      <div className="flex items-start gap-2 border-t border-line pt-2 text-[11px] leading-4 text-faint">
        <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-marca" />
        <span>{detalle.leyendaDelPunto}</span>
      </div>
    </div>
  )
}
