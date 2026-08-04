// EL MISMO COMPROBANTE DE ARCA, LISTADO UNA SOLA VEZ.
//
// ═══ EL DEFECTO (04/08) ═══
//
// El dueño lo vio en la pestaña Proveedores: "MADERAS LLITERAS S.R.L. · 0006-00003449 · 8/6/2026 ·
// $60.000" cuatro veces seguidas, y "Trielec · 0038-00000888 · 13/5/2026 · $1.784.747" dos veces. La
// sección se llama "lo que ARCA facturó y Compras no tiene" y su única razón de ser es decir qué hay
// que cargar. Un cuadro que pide cargar cuatro veces la misma factura no sólo se lee mal: si alguien
// le hace caso, mete tres compras que no existen. Y el TOTAL SIN CARGAR estaba inflado en la
// diferencia, así que el número que se reporta también estaba mal.
//
// ═══ LA CAUSA, Y DÓNDE NO SE ARREGLA ═══
//
// El duplicado no lo inventa el cruce: viene de la réplica `_ARCA_RAW`, que recibe el mismo
// comprobante en más de una descarga del libro de IVA y no tiene clave única que lo impida. El
// arreglo de fondo es del importador. Acá se hace lo otro que corresponde: no mostrar el defecto de
// una fuente como si fuera dato.
//
// ═══ LA CLAVE: (CUIT DEL EMISOR, COMPROBANTE, IMPORTE) ═══
//
// Para ARCA, punto de venta + número no se repite dentro de un mismo emisor: es la identidad fiscal
// del comprobante. Y va el IMPORTE además, por la misma razón por la que un cheque no se identifica
// por su número: si el mismo comprobante aparece con dos valores distintos, eso NO es un duplicado —
// es un problema real que tiene que verse, no fusionarse en silencio.
//
// SIN CUIT NO SE DEDUPLICA. Dos emisores sin CUIT con el mismo número de comprobante son dos
// facturas distintas de dos empresas distintas; fusionarlas borraría una compra real.

/** Sólo los dígitos: "30-70839055-7" y "30708390557" son el mismo CUIT. */
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

/**
 * La clave de identidad fiscal de un comprobante, o `null` si no alcanza para decidir.
 * @param {{cuit?:string|number, comprobante?:string, importe?:number}} r
 * @returns {string|null}
 */
export function claveComprobante(r) {
  const cuit = soloDigitos(r?.cuit)
  if (!cuit) return null
  const comp = String(r?.comprobante ?? '').trim()
  if (!comp) return null
  // En centavos y redondeado: dos lecturas del mismo importe pueden diferir en el último bit del
  // punto flotante y eso convertiría un duplicado en dos filas.
  return `${cuit}|${comp}|${Math.round(Number(r?.importe ?? 0) * 100)}`
}

/**
 * La lista sin los comprobantes repetidos. Conserva el ORDEN y se queda con la primera aparición.
 * @template {{cuit?:string|number, comprobante?:string, importe?:number}} T
 * @param {T[]} lista
 * @returns {T[]}
 */
export function sinRepetidos(lista = []) {
  const vistos = new Set()
  return (lista || []).filter((r) => {
    const k = claveComprobante(r)
    if (k === null) return true
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}
