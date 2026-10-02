'use client'

// LA FECHA DEL PAGO EN EFECTIVO — dueño, 02/10/2026: lo que se paga en efectivo en Liquidación baja la caja en efectivo.
// La caja baja el día en que SALIÓ la plata, que no siempre es hoy («le pagué el 16»): un solo campo de fecha para la
// pantalla, no uno por celda. Vale para la celda «Pagado efectivo» y para el botón «Pagar» (la marca da por pagado el
// efectivo que falta). Por defecto es hoy y entonces no viaja nada: lo pone la base.
//
// UN CAMPO, NO UN FORMULARIO: una línea chica con el rótulo y el día, sin párrafo. Sin sombra ni color propio: tokens.

import { createContext, useContext, useState, type ReactNode } from 'react'

type Valor = { fecha: string | undefined }
const Contexto = createContext<Valor>({ fecha: undefined })
const Cambio = createContext<(f: string) => void>(() => {})
const Hoy = createContext<string>('')

/** La fecha elegida SOLO si no es la de hoy (hoy lo resuelve la base). `undefined` = no se mandó nada. */
export function useFechaDelPagoEnEfectivo(): string | undefined {
  return useContext(Contexto).fecha
}

export function ProveedorDeFechaDelPago({ hoy, children }: { hoy: string; children: ReactNode }) {
  const [fecha, setFecha] = useState(hoy)
  return (
    <Hoy.Provider value={hoy}>
      <Cambio.Provider value={setFecha}>
        <Contexto.Provider value={{ fecha: fecha && fecha !== hoy ? fecha : undefined }}>{children}</Contexto.Provider>
      </Cambio.Provider>
    </Hoy.Provider>
  )
}

export function FechaDelPagoEnEfectivo() {
  const hoy = useContext(Hoy)
  const cambiar = useContext(Cambio)
  const { fecha } = useContext(Contexto)
  return (
    <label className="inline-flex items-center gap-2 text-[11.5px] leading-4 text-muted" data-testid="fecha-pago-efectivo">
      <span>Efectivo pagado el</span>
      <input
        type="date"
        value={fecha ?? hoy}
        max={hoy}
        onChange={(e) => cambiar(e.target.value || hoy)}
        aria-label="Fecha del pago en efectivo"
        data-testid="fecha-pago-efectivo-input"
        className="h-control rounded border border-line bg-transparent px-2 text-[12px] text-ink tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
    </label>
  )
}
