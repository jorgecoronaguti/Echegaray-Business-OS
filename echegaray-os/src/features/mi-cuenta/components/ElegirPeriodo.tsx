'use client'

// EL PERÍODO A MEDIDA — dos fechas y un botón.
//
// Es un formulario `GET`: el navegador arma `?periodo=elegir&desde=…&hasta=…` solo, sin una server
// action ni un `router.push` a mano. La consecuencia importante no es el ahorro de código: la vista
// queda en la URL y se puede compartir, marcar y recargar, que es la regla 10 de UX_PRINCIPLES.
//
// El `hidden` de `periodo` viaja porque sin él el envío perdería el filtro y la pantalla volvería a
// «este mes» justo cuando la persona acaba de elegir otra cosa.

import { CAMPO } from '@/shared/components/ds'
import { Boton } from '@/shared/components/ds'

export function ElegirPeriodo({ desde, hasta }: { desde: string; hasta: string }) {
  return (
    <form
      method="get"
      action="/mi-cuenta/horas"
      className="mt-4 flex flex-wrap items-end gap-3"
      data-testid="form-periodo"
    >
      <input type="hidden" name="periodo" value="elegir" />
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-ink-soft">Desde</span>
        <input type="date" name="desde" defaultValue={desde} className={`${CAMPO} w-[170px]`} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-ink-soft">Hasta</span>
        <input type="date" name="hasta" defaultValue={hasta} className={`${CAMPO} w-[170px]`} />
      </label>
      <Boton type="submit" variante="secundaria" data-testid="aplicar-periodo">Ver</Boton>
    </form>
  )
}
