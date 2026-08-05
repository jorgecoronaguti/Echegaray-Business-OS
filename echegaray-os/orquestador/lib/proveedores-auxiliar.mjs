// LA PESTAÑA AUXILIAR `_PROVEEDORES_OS`: QUÉ TIENE, Y QUIÉN LA ESCRIBE.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (05/08) ═══
//
// Tenía DOS escritores, cada uno con su forma: `proveedores-cuenta-corriente.mjs` la rehacía con dos
// columnas (proveedor · CUIT) y `proveedores-notas-visibles.mjs` con tres (…· qué hacer). Los dos
// borran y reescriben el rango entero, así que lo único que evitaba el desastre era el ORDEN de
// `PASOS`: el que corre último gana, y el que corre último es el del superset.
//
// Eso no es un diseño, es una coincidencia que se sostiene sola hasta que alguien reordena un paso.
// Y ya costaba algo medible sin reordenar nada: entre el paso 1 y el paso 5 la auxiliar existe con
// DOS columnas, así que el `VLOOKUP(...;$A:$C;3)` de la columna "Qué hacer" no encuentra la tercera y
// devuelve vacío. La pestaña muestra la deuda sin las instrucciones del dueño durante toda la corrida.
//
// UN DUEÑO DECLARADO: la escribe `proveedores-cuenta-corriente.mjs`, que es el paso que la creó, el
// que corre primero y el que ya está declarado como su dueño en `PASOS`. Escribe las TRES columnas
// desde el arranque. `proveedores-notas-visibles.mjs` la LEE —su fórmula apunta ahí— y no la toca.
//
// ═══ QUÉ FILAS ENTRAN ═══
//
// Todos los proveedores de `public.proveedores` con nombre, MÁS los que tienen nota en
// `public.proveedor_notas` aunque no estén en la tabla de proveedores: una nota que existe en la base
// y no llega a la auxiliar es una nota que el dueño escribió y no ve en ningún lado, que es
// exactamente el problema que esta capacidad vino a resolver.
//
// El CUIT puede faltar y la nota puede faltar: se escriben vacíos, nunca "(falta)". Una etiqueta
// repetida en la mayoría de las filas deja de informar y corre el ojo hacia la columna que menos
// decide.

/** El contrato de la auxiliar: qué dice cada columna. Las fórmulas que la leen dependen del ORDEN. */
export const ENCABEZADOS_AUX = Object.freeze(['Proveedor', 'CUIT', 'Qué hacer'])

/** La columna del CUIT y la de la nota, base 1 — el tercer argumento de los dos VLOOKUP que la leen. */
export const COL_CUIT_AUX = 2
export const COL_NOTA_AUX = 3

/** Filas mínimas que se escriben, para que borrar un proveedor limpie su fila vieja. */
export const ALTO_MINIMO_AUX = 200

/** El CUIT como se escribe en el archivo. Estaba tipeado igual en los dos scripts. */
export function conGuiones(c) {
  const d = String(c ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(c ?? '')
}

/**
 * LAS FILAS DE LA AUXILIAR, encabezado incluido. Núcleo puro: no lee ni escribe nada.
 *
 * @param {{proveedores?:Array<{nombre:string, cuit?:any}>, notas?:Array<{proveedor:string, nota:string}>}} o
 * @returns {string[][]} la primera fila es el encabezado
 */
export function filasDeLaAuxiliar({ proveedores = [], notas = [] } = {}) {
  const porNombre = new Map(notas
    .map((n) => [String(n?.proveedor ?? '').trim(), String(n?.nota ?? '').trim()])
    .filter(([nombre, nota]) => nombre && nota))
  const cuits = new Map(proveedores
    .map((p) => [String(p?.nombre ?? '').trim(), p?.cuit])
    .filter(([nombre]) => nombre))
  const nombres = [...new Set([...cuits.keys(), ...porNombre.keys()])].sort((a, b) => a.localeCompare(b, 'es'))
  return [[...ENCABEZADOS_AUX], ...nombres.map((n) => [n, conGuiones(cuits.get(n)), porNombre.get(n) ?? ''])]
}
