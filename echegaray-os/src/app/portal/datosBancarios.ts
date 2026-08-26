// LA CUENTA DONDE EL CLIENTE TRANSFIERE.
//
// ═══ POR QUÉ ESTO NO SALE DE `banco-santander.mjs` ═══
//
// Ese módulo tiene el saldo, el acuerdo de descubierto, los echeqs — es la cuenta vista desde
// adentro. Lo que el cliente necesita es otra cosa: a nombre de quién, qué CUIT, qué CBU. Importar el
// módulo interno para sacar dos campos pondría el estado financiero de la empresa a un `console.log`
// de distancia de una pantalla pública.
//
// ═══ UN CBU NO SE INVENTA ═══
//
// El banco y el número de cuenta están verificados contra el extracto. El CBU y el alias NO están en
// ningún lado del OS: nunca hicieron falta hasta ahora, porque hasta ahora nadie le pedía a un
// cliente que transfiriera desde una pantalla nuestra. Quedan en `null` y la pantalla dice que
// faltan. Un CBU con un dígito cambiado manda la plata a otra persona.

export const CUENTA_PARA_COBRAR: Record<string, string | null> = {
  'Titular': 'ECHEGARAY CONSTRUCCIONES',
  'CUIT': null,
  'Banco': 'Banco Santander',
  'Cuenta': '179-091383/6',
  'CBU': null,
  'Alias': null,
}

/** Los rótulos sin dato. La pantalla los nombra en vez de dejar huecos mudos. */
export const FALTAN_DATOS_BANCARIOS = Object.entries(CUENTA_PARA_COBRAR)
  .filter(([, v]) => !v)
  .map(([k]) => k)
