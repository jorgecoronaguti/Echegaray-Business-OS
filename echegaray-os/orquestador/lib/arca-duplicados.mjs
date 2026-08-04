// EL MISMO COMPROBANTE DE ARCA, UNA SOLA VEZ — Y SE DEDUPLICA EN EL ORIGEN.
//
// ═══ EL DEFECTO (04/08) ═══
//
// El dueño lo vio dos veces en la pestaña Proveedores, en dos secciones distintas:
//
//   sección 4 · "MADERAS LLITERAS S.R.L. · 0006-00003449 · 8/6/2026 · $60.000"   ×4
//   sección 3 · "Trielec · 0038-00000003 · 25/03/2026 · -$509.980"               ×4
//
// La sección 4 dice qué hay que cargar en Compras: si alguien le hace caso, mete tres compras que no
// existen, y su TOTAL SIN CARGAR queda inflado. La sección 3 dice cuánto se acreditó: su TOTAL
// ACREDITADO quedó inflado en tres veces esa nota.
//
// ═══ POR QUÉ EL PRIMER ARREGLO NO ALCANZÓ, Y ES LA LECCIÓN ═══
//
// La primera versión filtraba `cruce.faltan` — la lista YA DERIVADA que alimenta la sección 4. Arregló
// la sección 4, reportó "4 repetidos" en el log, y dejó intacta la sección 3: las notas de crédito
// salen de OTRA derivación (`analizar`) del MISMO origen duplicado. Y encima `analizar` empareja cada
// nota contra las facturas del mismo CUIT, así que con facturas duplicadas en la entrada también se
// duplican los emparejamientos de "anula" y "reemplaza".
//
// Filtrar una derivación arregla UNA vista. Filtrar el ORIGEN arregla todas las que existen hoy y las
// que se escriban mañana. Es la misma regla que el resto del archivo: una capacidad, una fuente.
//
// El duplicado entra en `comprobantes_arca` —la réplica recibe el mismo comprobante en más de una
// descarga del libro y no tiene clave única que lo impida—. El arreglo de fondo es del importador;
// hasta que llegue, acá se deja de mostrar el defecto de una fuente como si fuera dato.
//
// ═══ LA CLAVE: TIPO + EMISOR + PUNTO DE VENTA + NÚMERO + IMPORTE ═══
//
// Para ARCA, tipo de comprobante + punto de venta + número no se repite dentro de un mismo emisor: es
// la identidad fiscal del comprobante. Va el TIPO porque una factura A 0001-00000203 y una nota de
// crédito A 0001-00000203 son dos comprobantes distintos, no uno repetido.
//
// Y va el IMPORTE, por la misma razón por la que un cheque no se identifica por su número: si el
// mismo comprobante aparece con dos valores distintos, eso NO es un duplicado — es un problema real
// que tiene que verse, no fusionarse en silencio.

/** Sólo los dígitos: "30-70839055-7" y "30708390557" son el mismo CUIT. */
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

/**
 * La clave de identidad fiscal de un comprobante del libro, o `null` si no alcanza para decidir.
 *
 * @param {{tipo_comprobante?:any, emisor_cuit?:any, punto_venta?:any, numero?:any, imp_total?:any}} c
 * @param {{emisorUnico?:boolean}} [opts] `emisorUnico` es el libro de VENTAS: ahí el emisor es
 *   siempre la empresa y la identidad no necesita el CUIT. En el de COMPRAS es al revés, y por eso
 *   SIN CUIT NO SE DEDUPLICA: dos emisores sin CUIT con el mismo número de comprobante son dos
 *   facturas distintas de dos empresas distintas, y fusionarlas borraría una compra real.
 * @returns {string|null}
 */
export function claveComprobante(c, { emisorUnico = false } = {}) {
  const cuit = soloDigitos(c?.emisor_cuit)
  if (!cuit && !emisorUnico) return null
  const pv = String(c?.punto_venta ?? '').trim()
  const nro = String(c?.numero ?? '').trim()
  if (!pv && !nro) return null
  // En centavos y redondeado: dos lecturas del mismo importe pueden diferir en el último bit del
  // punto flotante, y eso convertiría un duplicado en dos filas.
  const importe = Math.round(Number(c?.imp_total ?? 0) * 100)
  return `${String(c?.tipo_comprobante ?? '').trim()}|${cuit}|${pv}-${nro}|${importe}`
}

/**
 * El libro sin los comprobantes repetidos. Conserva el ORDEN y se queda con la primera aparición.
 *
 * Se aplica UNA vez, sobre la lista cruda que sale de `comprobantes_arca`, ANTES de cualquier
 * derivación: el cruce contra Compras, el análisis de notas de crédito y las facturas anuladas
 * cargadas salen todas de acá. Un segundo filtro sobre una derivación sería un mecanismo de más
 * tapando el mismo agujero — y ya se probó que tapa sólo la vista que mira.
 *
 * @template {object} T
 * @param {T[]} libro
 * @param {{emisorUnico?:boolean}} [opts]
 * @returns {T[]}
 */
export function sinComprobantesRepetidos(libro = [], opts = {}) {
  const vistos = new Set()
  return (libro || []).filter((c) => {
    const k = claveComprobante(c, opts)
    if (k === null) return true
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}
