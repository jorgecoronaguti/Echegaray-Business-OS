// CUÁNDO ESTÁ ABIERTO EL DETALLE DE UNA COLUMNA — la regla, aparte del componente para poder probarla.
//
// ═══ POR QUÉ UN TOQUE NO ALTERNA (QA producción, 02/10/2026: «el tap NO abre el detalle») ═══
//
// En un teléfono un toque dispara, en este orden, `mouseenter` (el navegador emula el hover) y después
// `click`. Con `click = alternar`, `mouseenter` abría el detalle y el `click` del MISMO gesto lo cerraba:
// el usuario no veía nada. El toque, entonces, sólo ABRE. Se cierra al tocar fuera, con Esc o al sacar el
// mouse; tocar la misma barra otra vez no lo cierra (no hay forma de distinguirlo de un hover emulado).
//
// Enter y Espacio sobre la barra enfocada abren aunque antes se haya cerrado con Esc: el foco sigue ahí y
// no vuelve a disparar `focus`, así que sin esta rama el teclado quedaba sin forma de reabrirlo.

export type EventoDeColumna = 'entra' | 'sale' | 'toque' | 'foco' | 'desenfoco' | 'tecla_abrir' | 'esc' | 'fuera'

export function siguienteApertura(abierto: boolean, e: EventoDeColumna): boolean {
  switch (e) {
    case 'entra': case 'toque': case 'foco': case 'tecla_abrir': return true
    case 'sale': case 'desenfoco': case 'esc': case 'fuera': return false
    default: return abierto
  }
}

/** La tecla que reabre: Enter o Espacio. */
export const abreConTecla = (key: string): boolean => key === 'Enter' || key === ' '
