'use client'

// EL CUERPO DEL CUADRO DE «PAGADO EN EFECTIVO» (dueño, 02/10/2026: «tiene que ser más preciso de qué se anotó, qué día
// y quién lo hizo y si hay alguna nota»). Sólo dibuja: qué se dice y qué no se afirma lo decide
// `detalleDePagoEnEfectivo.ts`; el cuadro, su apertura y su ubicación son los de `HistorialDeManuales.tsx`.
//
// UN RENGLÓN POR PAGO, TRES LÍNEAS: el importe (lo que se lee primero), quién y cuándo lo anotó, y —en tenue— el día en
// que salió la plata si se sabe y la nota. Sin tarjeta por renglón: un hilo fino entre uno y otro.

import { SIN_DATO_PREVIO, type DetalleDePago, type RenglonDePago } from '../../services/detalleDePagoEnEfectivo'

const capital = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

/** «Anotado el 01/10/2026, 14:32 por Ana», o lo que no se sabe dicho tal cual. */
const quienYCuando = (r: RenglonDePago): string =>
  r.quien === SIN_DATO_PREVIO ? `${r.cuando}: ${r.quien}` : `Anotado el ${r.cuando} por ${r.quien}`

function Renglon({ r, primero }: { r: RenglonDePago; primero: boolean }) {
  const detalle = [r.fechaDelPago ? `Pagado el ${r.fechaDelPago}` : null, r.nota, r.como ? capital(r.como) : null, r.deEntrega ? 'Salió de una entrega a rendir' : null]
    .filter(Boolean).join(' · ')
  return (
    <li data-testid="pago-efectivo-renglon" className={primero ? 'flex flex-col gap-0.5' : 'flex flex-col gap-0.5 border-t border-line pt-2'}>
      <div className="text-[13px] font-medium">{r.correccion ? capital(r.correccion) : r.importe}</div>
      <div className="break-words text-[11px] text-muted">{quienYCuando(r)}</div>
      <div className={`break-words text-[11px] ${r.nota === 'Sin nota' ? 'text-faint' : 'text-muted'}`}>{detalle}</div>
    </li>
  )
}

export function DetalleDePagoEnEfectivo({ detalle }: { detalle: DetalleDePago }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <div className="break-words text-[11px] text-muted">{detalle.titulo}</div>
        <div className="text-[16px] font-semibold leading-6" data-testid="pago-efectivo-total">{detalle.total}</div>
        {detalle.cuenta && <div className="break-all text-[11px] text-faint">{detalle.cuenta}</div>}
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 border-t border-line p-0 pt-2">
        {detalle.renglones.map((r, i) => <Renglon key={r.id} r={r} primero={i === 0} />)}
      </ol>
      <div className="flex items-start gap-2 border-t border-line pt-2 text-[11px] leading-4 text-faint">
        <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-marca" />
        <span>{detalle.leyendaDelPunto}</span>
      </div>
    </div>
  )
}
