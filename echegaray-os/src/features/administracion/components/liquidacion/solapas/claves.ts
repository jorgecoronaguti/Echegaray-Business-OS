// LAS CLAVES DE LIQUIDACIÓN, SIN REACT — para que `node --test` pueda ejecutar la resolución de la URL.
//
// ═══ «MÁS» TIENE TRES SECCIONES, NO SEIS (dueño, 14/09/2026) ═══
//
// *«hay datos q se repiten en las secciones de la pestaña "mas"… unificar conceptos en menos
// secciones»*. «Horas por día» y «Pagos» repetían lo que la Quincena ya muestra en la fila y en el pie;
// lo que tenían de propio se mudó: los pendientes a «Cierre y recibos», el cotejo y la proyección a
// «Caja y proyección», el convenio debajo del costo.
//
// ═══ LAS CLAVES VIEJAS NO DAN 404 NI CAEN EN LA QUINCENA ═══
//
// Hay enlaces guardados, E2E y mensajes con `?solapa=pagos`. Cada clave retirada va a la sección que
// se quedó con su contenido; mandar `pagos` a la Quincena escondería el cotejo con el Flujo de Caja.

export type ClaveDeSolapa = 'quincena' | 'caja' | 'costo' | 'cierre'

export const SOLAPA_POR_DEFECTO: ClaveDeSolapa = 'quincena'

/** El orden del desplegable «Más». La barra lo recorre tal cual; no cambia según la sección abierta. */
export const CLAVES_DEL_MENU: readonly ClaveDeSolapa[] = ['caja', 'costo', 'cierre']

const RETIRADAS: Readonly<Record<string, ClaveDeSolapa>> = {
  pagos: 'caja',
  convenios: 'costo',
  horas: 'cierre',
  recibos: 'cierre',
}

const VIGENTES: readonly string[] = [SOLAPA_POR_DEFECTO, ...CLAVES_DEL_MENU]

/** La clave pedida, la sección que absorbió una clave retirada, o la Quincena. */
export function claveDeSolapa(pedida: string | undefined): ClaveDeSolapa {
  if (pedida && VIGENTES.includes(pedida)) return pedida as ClaveDeSolapa
  return (pedida && RETIRADAS[pedida]) || SOLAPA_POR_DEFECTO
}
