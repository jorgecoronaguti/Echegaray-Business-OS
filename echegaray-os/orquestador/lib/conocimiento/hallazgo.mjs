// EL VOCABULARIO DE UN HALLAZGO — tipos, gravedades, tolerancias y la fábrica.
//
// ═══ POR QUÉ SE SEPARÓ DE LAS REGLAS ═══
//
// Las reglas viven en dos archivos: `hallazgos-cotizacion.mjs` mira la plantilla de ECSAS (oferta,
// presupuesto, GG, análisis) y `hallazgos-celdas.mjs` mira la planilla como planilla (celdas en
// error, fórmulas que apuntan a una celda rota, renglones que no multiplican). Los dos necesitan el
// mismo `TIPO` y la misma fábrica, y el agregador `hallazgos()` los junta. Si el vocabulario viviera
// en cualquiera de los dos, el agregador cerraría un ciclo de imports.
//
// ═══ LAS TOLERANCIAS SON DECISIONES, NO CONSTANTES SUELTAS ═══
//
// Cada una dice hasta dónde algo sigue siendo lo mismo. Están acá, con su motivo, y no repetidas
// adentro de cada regla: una tolerancia distinta en dos reglas produce dos verdades sobre el mismo
// número.
export const GRAVEDAD = Object.freeze({ ALTA: 'ALTA', MEDIA: 'MEDIA', BAJA: 'BAJA' })

export const TIPO = Object.freeze({
  OFERTA_ROTA: 'OFERTA_ROTA',
  IVA_ESCRITO_A_MANO: 'IVA_ESCRITO_A_MANO',
  SUBTOTAL_NO_CIERRA: 'SUBTOTAL_NO_CIERRA',
  TOTAL_NO_CIERRA: 'TOTAL_NO_CIERRA',
  ROTULO_CONTRADICE_COEFICIENTE: 'ROTULO_CONTRADICE_COEFICIENTE',
  COEFICIENTE_INESTABLE: 'COEFICIENTE_INESTABLE',
  UNIDAD_CONTRADICTORIA: 'UNIDAD_CONTRADICTORIA',
  PARTIDA_SIN_DATOS: 'PARTIDA_SIN_DATOS',
  DATOS_DE_OTRO_CLIENTE: 'DATOS_DE_OTRO_CLIENTE',
  INDIRECTO_SIEMPRE_EN_CERO: 'INDIRECTO_SIEMPRE_EN_CERO',
  COEFICIENTE_AJUSTE_SIN_CRITERIO: 'COEFICIENTE_AJUSTE_SIN_CRITERIO',
  COEFICIENTE_AJUSTE_IMPLAUSIBLE: 'COEFICIENTE_AJUSTE_IMPLAUSIBLE',
  REFERENCIA_ROTA: 'REFERENCIA_ROTA',
  CELDA_EN_ERROR: 'CELDA_EN_ERROR',
  FORMULA_SOBRE_CELDA_ROTA: 'FORMULA_SOBRE_CELDA_ROTA',
  RENGLON_INCOHERENTE: 'RENGLON_INCOHERENTE',
})

/** Cuánto puede desviarse una suma y seguir siendo redondeo. Un peso sobre millones es redondeo;
 *  más que eso es otro número. */
export const TOLERANCIA_PESOS = 1

/** Cuánto puede desviarse una alícuota calculada y seguir siendo la misma. */
export const TOLERANCIA_FRACCION = 0.0005

/** La alícuota general de IVA que la plantilla aplica en todas las ofertas medidas. Está acá para
 *  poder decir CUÁNTO se desvía un IVA tipeado, no para afirmar qué alícuota corresponde. */
export const ALICUOTA_IVA = 0.21

/** Hasta dónde un «coeficiente de ajuste» se puede leer como un multiplicador de riesgo o de plazo.
 *  Arriba de 3 o abajo de 0,5 ya no ajusta un precio: lo reemplaza, y lo más probable es que sea una
 *  cantidad tipeada en la columna equivocada. Medido: hay valores de 15 y de 1015. */
export const AJUSTE_PLAUSIBLE = Object.freeze({ min: 0.5, max: 3 })

/**
 * LA TOLERANCIA DE UNA MULTIPLICACIÓN. PURA.
 *
 * Un peso fijo alcanza para una suma de importes, pero no para `cantidad × precio` sobre decenas de
 * millones: ahí el error de coma flotante del propio Excel ya vale más de un peso, y el control
 * denunciaría como incoherente un renglón que está bien. La parte relativa es la que evita ese
 * falso positivo; el piso de un peso es el que evita que sobre números chicos la tolerancia sea 0.
 */
export const toleranciaDe = (esperado) => Math.max(TOLERANCIA_PESOS, Math.abs(Number(esperado) || 0) * 1e-6)

/**
 * UN HALLAZGO. `monto` es EL DINERO EN JUEGO, no el dinero perdido — y la diferencia no es retórica:
 * el monto de una oferta rota es lo que esa oferta vale, y el de un rótulo que contradice su
 * coeficiente es la diferencia entre lo que dice y lo que aplica. Sumarlos daría un número que se
 * lee como una pérdida y no lo es. Por eso el resumen los agrupa POR TIPO y no los suma todos.
 */
export const hallazgo = ({ tipo, gravedad, clave, afirmacion, evidencia = [], monto = null, porQue = null }) =>
  ({ tipo, gravedad, clave, afirmacion, evidencia, monto, porQue })

export const suma = (xs) => xs.reduce((a, x) => a + x, 0)

/** Las claves que NO nombran una cotización: son hallazgos que comparan varias entre sí. */
export const PREFIJOS_CRUZADOS = Object.freeze(['partida.', 'gg.'])

/**
 * EL id DE DRIVE QUE NOMBRA LA CLAVE DE UN HALLAZGO, o `null` si la clave es cruzada. PURA.
 *
 * Vive con el vocabulario y no con el dataset porque la forma de la clave la deciden las reglas:
 * `<driveId>.oferta.iva` cuando el hallazgo es de UNA cotización y `partida.T1147.unidad` cuando
 * compara varias. Quien lea una clave necesita esto, sea el dataset o el aprendizaje.
 */
export const cotizacionDeLaClave = (clave) => {
  const s = String(clave ?? '')
  if (PREFIJOS_CRUZADOS.some((p) => s.startsWith(p))) return null
  return s.split('.')[0] || null
}

/** El orden en que se leen: primero lo grave, y adentro de cada gravedad primero la plata. */
const ORDEN = Object.freeze({ ALTA: 0, MEDIA: 1, BAJA: 2 })

/** Ordena una lista de hallazgos por gravedad, plata y clave. PURA. */
export const ordenar = (lista = []) => [...lista].sort(
  (a, b) => ORDEN[a.gravedad] - ORDEN[b.gravedad] || (b.monto ?? 0) - (a.monto ?? 0) || a.clave.localeCompare(b.clave),
)

/** El resumen por tipo, para el informe. PURA. */
export function resumen(lista = []) {
  const porTipo = {}
  const porGravedad = {}
  const montoPorTipo = {}
  for (const h of lista) {
    porTipo[h.tipo] = (porTipo[h.tipo] ?? 0) + 1
    porGravedad[h.gravedad] = (porGravedad[h.gravedad] ?? 0) + 1
    if (typeof h.monto === 'number') montoPorTipo[h.tipo] = Math.round(((montoPorTipo[h.tipo] ?? 0) + h.monto) * 100) / 100
  }
  return { total: lista.length, porTipo, porGravedad, montoPorTipo }
}
