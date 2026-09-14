// LA CUENTA DEL CLIENTE, SUMADA DE SUS TRABAJOS — los mismos cuatro números que la pestaña OBRAS.
//
// ═══ POR QUÉ ESTA SUMA NO ES UNA SEGUNDA DEFINICIÓN ═══
//
// Hasta el 14/09/2026 `cliente_cuenta_corriente` medía vencido con `fecha_cobro < hoy` (Pendiente y
// Facturado) y la pestaña OBRAS y `obra_cuenta` con la EMISIÓN + 30 días: dos relojes, dos moras
// para el mismo cliente. Desde ese día las tres usan la misma regla —la columna U de Cobranzas,
// `public.estado_de_cobro`: Pendiente y Q < hoy—, por decisión del dueño.
//
// La suma de abajo se queda porque es la aritmética del pie de OBRAS sobre sus trabajos, no una
// segunda definición: el vencido de cada trabajo ya sale de `obra_cuenta`. Esta
// función NO inventa una tercera: hace la MISMA aritmética que el pie de la pestaña OBRAS —sumar
// las filas de sus trabajos— sobre la MISMA fuente (`obra_cuenta`, vía `getCobradoPorObra`).
//
// LÍMITE DECLARADO: suma los trabajos que la página le pase. Si le pasan sólo los que están en
// curso, el total es de los que están en curso — y quien lo dibuje tiene que decirlo en el rótulo.

import type { CobroPorObra } from '@/features/administracion/services/homeCartera'

export interface CuentaDeTrabajos {
  /** Σ de lo contratado. `null` = ninguno tiene precio: NO es cero. */
  contratado: number | null
  /** Σ de lo cobrado, TOTAL con IVA — la columna «Cobrado» de la pestaña OBRAS. */
  cobrado: number | null
  porCobrar: number | null
  vencido: number | null
  /** Cuántos trabajos entraron en la suma. Sin esto, un total no dice de cuántas filas sale. */
  trabajos: number
}

/** Suma que distingue «ninguno lo trae» de «cero»: sin ningún dato, el total es `null`. */
function suma(valores: (number | null | undefined)[]): number | null {
  const con = valores.filter((v): v is number => v != null)
  return con.length === 0 ? null : con.reduce((a, b) => a + b, 0)
}

export function cuentaDeTrabajos(
  trabajos: { obra_id: string; contratado: number | null }[],
  cobrado: CobroPorObra | null,
): CuentaDeTrabajos {
  const filas = trabajos.map((t) => cobrado?.por.get(t.obra_id) ?? null)
  return {
    contratado: suma(trabajos.map((t) => t.contratado)),
    cobrado: suma(filas.map((f) => f?.total)),
    porCobrar: suma(filas.map((f) => f?.porCobrar)),
    vencido: suma(filas.map((f) => f?.vencido)),
    trabajos: trabajos.length,
  }
}
