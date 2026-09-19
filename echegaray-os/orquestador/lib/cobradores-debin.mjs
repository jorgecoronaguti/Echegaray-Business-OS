// LOS CUIT QUE COBRAN POR DEBIN SIN SER EL ACREEDOR — UNA SOLA DEFINICIÓN (19/09/2026).
//
// Un DEBIN lo inicia el COBRADOR y el pagador lo acepta. El extracto escribe el CUIT de la
// plataforma, no el del acreedor: 30-70774398-7 es ADMINISTRADORA SAN JUAN S.A. (PlusPagos), registro
// de entidades especializadas en cobranza. Por ella viajaron el IIBB de DGR San Juan (DEBIN del
// 17/09/2026, $432.764,90 = «a pagar» de la DDJJ de 08/2026 al centavo, confirmado por el dueño:
// «pagué rentas») y la boleta de UOCRA de julio (19/08).
//
// POR ESO EL CUIT NO IMPUTA NADA POR SÍ SOLO: dice por qué canal salió la plata. QUÉ pagó lo prueba
// el importe contra un declarado. Vive acá, y no en el lector del banco ni en el de impuestos, porque
// los dos lo necesitan y dos listas se desincronizan el día que aparece la segunda plataforma.
export const COBRADORES_DEBIN = Object.freeze([
  Object.freeze({ cuit: '30707743987', nombre: 'Administradora San Juan S.A. (PlusPagos)', cobraPara: ['DGR San Juan', 'UOCRA'] }),
])

/** ¿Este concepto del extracto es un DEBIN a una plataforma declarada? Devuelve el cobrador o null. */
export function cobradorDelDebin(concepto = '') {
  const c = String(concepto)
  if (!/debin/i.test(c)) return null
  const cuit = /cuit\s*(\d{11})/i.exec(c)?.[1] ?? null
  return cuit ? (COBRADORES_DEBIN.find((x) => x.cuit === cuit) ?? null) : null
}
