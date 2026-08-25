// LA PESTAÑA «COMPRAS» ENTERA, FILA POR FILA — el contrato de lectura, puro y probado.
//
// ═══ POR QUÉ EXISTE (25/08/2026) ═══
//
// Pedido del dueño, textual: *«la sección compras en app.ecsas tiene que replicar toda la
// información que actualmente se concentra en pestaña Compras de Sheet Flujo de Fondos»*.
//
// Hasta hoy `scripts/sync-compras.mjs` leía `Compras!A4:Y5000` y direccionaba las columnas POR SU
// POSICIÓN (`r[24]`, `r[16]`, `r[9]`…). Eso es exactamente lo que `compras-columnas.mjs` existe para
// impedir, y ya había cobrado su primera víctima silenciosa: el código creía que el índice 24 era
// «Fecha contable del pago» y hoy el índice 24 es **«Tipo de Costo»**, una columna de texto que dice
// «Directo» / «Indirecto». `parseFecha('Indirecto')` devuelve `null`, así que la lectura caía al
// respaldo (la fecha prevista) y NADIE se enteraba: el fósil no produjo un número malo, produjo un
// número que resultó ser el bueno por accidente. Medido sobre las 882 filas del 25/08, la fecha de
// caja (AD) y la prevista (Q) coinciden en las 882 — por eso el defecto nunca se vio.
//
// Un error que sólo se salva por accidente sigue siendo un error: el día que alguien escriba una
// fecha en «Tipo de Costo», el calendario de caja mueve plata. Acá las columnas se resuelven por su
// RÓTULO y la corrida ABORTA con el nombre adentro del mensaje si un rótulo no aparece.
//
// ═══ POR QUÉ SE LEE CON `UNFORMATTED_VALUE` ═══
//
// Dos clases enteras de defecto desaparecen y las dos ya costaron plata en este repo:
//
//  · **El punto que no es de miles.** El tique de Trielec imprime `95277.07` y entró a Compras como
//    $9.527.707 — todos los importes ×100, coherentes entre sí, invisibles. Leyendo sin formato el
//    importe llega como el número 95277.07 y no hay nada que interpretar.
//  · **`dd/mm/yy` que vacía el parser.** Una fecha con año de dos dígitos se lee mal o no se lee.
//    El serial de Sheets (46202) es un entero y no tiene ambigüedad de locale.
//
// El precio es que las fechas llegan como serial y hay que decodificarlas (`fechaDeSerial`), no como
// texto. `parseFecha` NO entiende un serial: devuelve `null` para 46202. Ese `null` silencioso es la
// razón por la que este módulo nunca lo usa.
//
// ═══ QUÉ NO SE REPLICA, Y POR QUÉ ═══
//
// La pestaña tiene DOS PARES DE RÓTULOS REPETIDOS —«Rubro de caja» en AB y AC, «Orden de pago (OS)»
// en AG y AH—, herencia de un generador retirado que dejó su capa fósil al lado de la viva. Ninguna
// de las cuatro se replica: resolver un nombre ambiguo es elegir a cara o cruz entre dos columnas
// que HOY traen lo mismo y mañana pueden no traerlo. Se declara como límite conocido en vez de
// adivinarse. Ninguna de las cuatro aparece en la pantalla 24.

import { parseMonto } from './cash-briefing.mjs'
import { fechaDeSerial } from './caja-ancla-por-instante.mjs'
import { columnasObligatorias, normalizarRotulo } from './compras-columnas.mjs'
import { claveComprobante } from './comprobantes/lectura.mjs'

/** La primera fila de datos. Las tres de arriba son título, agrupador y encabezado. */
export const PRIMERA_FILA = 4

/**
 * CLAVE INTERNA → RÓTULO EXACTO de la fila 3 de «Compras», medido sobre el archivo vivo el
 * 25/08/2026. Cambiar un rótulo en el Sheet rompe la corrida acá y con el nombre adentro del
 * mensaje, que es el comportamiento buscado: un rótulo que no matchea se arregla en un minuto; un
 * match equivocado netea contra la columna de al lado y no dice nada nunca.
 */
export const ROTULOS = Object.freeze({
  sheet_id: 'ID',
  categoria: 'Categoría',
  fecha: 'Fecha factura',
  mes: 'Fecha factura (mes)',
  proveedor: 'Proveedor',
  modalidad: 'Modalidad',
  tipo: 'Tipo',
  comprobante: 'N° Comprobante',
  unidad_negocio: 'Unidad de Negocio',
  obra_texto: 'Cliente / Asignación',
  detalle_obra: 'Detalles / Obra',
  concepto: 'Concepto',
  importe: 'Importe',
  iva: 'IVA',
  total: 'Total',
  tipo_pago: 'Tipo pago',
  fecha_prevista: 'Fecha prevista de pago (día)',
  pago_total_o_parcial: 'Total o Parcial',
  monto_pagado: 'Monto Pagado',
  monto_parcial_1: 'Monto Parcial 1',
  fecha_prevista_2: 'Fecha prevista de pago 2',
  monto_parcial_2: 'Monto Parcial 2',
  estado: 'Estado',
  tipo_costo: 'Tipo de Costo',
  estado_pago: 'Estado pago',
  estado_carga: 'Estado Carga',
  fecha_caja: 'Fecha de caja',
  familia_material: 'Familia de material',
  sub_rubro: 'Sub-rubro de estructura',
  repetido: '¿Comprobante repetido? (OS)',
  saldo_pendiente: 'Saldo pendiente (OS)',
  cuit: 'CUIT (OS)',
  tramo_vencimiento: 'Tramo de vencimiento (OS)',
})

/**
 * REDONDEO A DOS DECIMALES, Y NO ES COSMÉTICA.
 *
 * «Total» es una fórmula (`=Importe+IVA`) y sin formato la API devuelve el flotante crudo:
 * `406911.29000000004`. Medido el 25/08 sobre la pestaña viva, 130 de 882 filas traen esa cola
 * binaria. Escribirla en `numeric` de Postgres deja un libro donde ningún total cierra exacto contra
 * el Sheet y donde cualquier control por igualdad da falso negativo — el peor tipo de desvío, el que
 * aparece en todos lados y en ninguno.
 *
 * El peso tiene dos decimales por ley; más precisión que ésa no es más exactitud, es ruido.
 */
export const pesos = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Las que son plata. */
const MONTOS = Object.freeze([
  'importe', 'iva', 'total', 'monto_pagado', 'monto_parcial_1', 'monto_parcial_2', 'saldo_pendiente',
])
/** Las que son día. Llegan como serial porque se lee sin formato. */
const FECHAS = Object.freeze(['fecha', 'fecha_prevista', 'fecha_prevista_2', 'fecha_caja'])

/** El estado que el dueño usa para anular una fila sin borrarla. No es un gasto. */
export const ANULADA = 'ELIMINADO'

/**
 * Resuelve el contrato de columnas contra el encabezado REAL, fallando cerrado.
 *
 * El chequeo de ambigüedad es propio y no está en `columnasObligatorias`: la pestaña tiene rótulos
 * repetidos legítimos (los fósiles de AB/AC y AG/AH) que NO se replican, así que un chequeo global
 * abortaría siempre. Lo que no puede pasar es que se repita un rótulo que sí se replica — ahí
 * `findIndex` elegiría el primero en silencio y nadie sabría cuál se llevó el dato.
 *
 * @param {any[]} encabezado la fila 3 tal como se leyó
 * @returns {Record<string, number>} clave interna → índice 0
 */
export function contratoDeColumnas(encabezado = []) {
  const idx = columnasObligatorias(encabezado, ROTULOS, 'Compras')
  const ambiguos = Object.entries(ROTULOS)
    .filter(([, r]) => encabezado.filter((c) => normalizarRotulo(c) === normalizarRotulo(r)).length > 1)
    .map(([, r]) => r)
  if (ambiguos.length) {
    throw new Error(`Compras: el rótulo aparece más de una vez y no puedo elegir: ${ambiguos.join(' · ')}. `
      + 'Elegir el primero se llevaría el dato de una columna que nadie decidió — no replico.')
  }
  return idx
}

/** El día de un serial de Sheets como ISO, o null. Nunca inventa una fecha a partir de un texto. */
export function diaDe(valor) {
  if (valor === '' || valor === null || valor === undefined) return null
  const d = fechaDeSerial(Number(valor))
  if (!d) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Texto de celda, o null. El string vacío y el string de espacios son lo mismo: no hay dato. */
const texto = (v) => (String(v ?? '').trim() || null)

/**
 * UNA FILA DE LA PESTAÑA → UN REGISTRO. `null` si la fila no es una compra.
 *
 * EL ÚNICO CRITERIO DE «ES UNA FILA» ES QUE TENGA ID, y ese cambio es el pedido del dueño. La regla
 * vieja descartaba además las filas sin obra y las de importe cero: sobre el archivo del 25/08 eso
 * dejaba 9 filas afuera —3 de Google por $0 que el dueño SÍ ve en su pestaña, y 6 anuladas—, y la
 * pantalla decía «875» sobre un libro de 882. Un control que muestra menos filas que la fuente no
 * puede afirmar nada sobre lo que no mostró.
 *
 * Las anuladas se replican con su estado y NO se filtran acá: quién las cuenta es decisión de quien
 * lee, no de quien copia. Todas tienen importe y total en cero, así que no mueven ningún total.
 *
 * @param {any[]} fila
 * @param {Record<string, number>} idx contrato de `contratoDeColumnas`
 * @param {number} numeroDeFila la fila REAL del Sheet (4 es la primera de datos)
 */
export function filaACompra(fila, idx, numeroDeFila) {
  const crudo = (clave) => fila?.[idx[clave]]
  const sheetId = texto(crudo('sheet_id'))
  if (sheetId === null) return null

  // EL ID DE LA PESTAÑA ES UNA POSICIÓN (`=ROW()-4`), NO UNA IDENTIDAD: insertar una fila arriba
  // recorre todos los de abajo. Se guarda porque es lo que el dueño ve, pero nada se ata a él —
  // menos que nada los adjuntos, que se atan a `claveDeCompra`. Y se acepta que no sea un número:
  // leído CON formato, el ID 0 se dibuja como «—» y así entró a Postgres una compra real de
  // $54.043,44 con un guión por clave.
  const n = Number(sheetId)
  const r = { fila: numeroDeFila, sheet_id: Number.isFinite(n) ? n : null }
  for (const clave of Object.keys(ROTULOS)) {
    if (clave === 'sheet_id') continue
    if (MONTOS.includes(clave)) { r[clave] = pesos(parseMonto(crudo(clave))); continue }
    if (FECHAS.includes(clave)) { r[clave] = diaDe(crudo(clave)); continue }
    r[clave] = texto(crudo(clave))
  }
  r.anulada = r.estado === ANULADA
  return r
}

/**
 * LA CLAVE ESTABLE DE UNA FILA DE COMPRAS — la MISMA que ya usa el registro de idempotencia del bot.
 *
 * NO SE REIMPLEMENTA: se delega en `claveComprobante` de `lib/comprobantes/lectura.mjs`, que es la
 * que escribió las 53 claves que hoy hay en `comunicacion.comprobantes_cargados`. Una segunda
 * definición de «qué comprobante es éste» sería una segunda verdad, y las dos ya pagadas en este
 * repo son caras: el punto de venta con ceros de relleno daba DOS claves para un solo ticket, y una
 * nota de crédito sin su marca colisionaba con la factura del mismo número — $41,9M de error.
 *
 * La columna «Tipo» de la pestaña trae `F A`, `F C`, `NC`, `N C`, `N/A`, `Boleta`… y
 * `claseDeComprobante` ya sabe que `N C` y `NC` son la misma cosa: saca todo lo que no es letra.
 *
 * Devuelve `null` cuando la fila no tiene número de comprobante — y son muchas: 212 de 882 al
 * 25/08. Una clave armada sin número haría que dos facturas distintas del mismo corralón fueran «la
 * misma», que es peor que no tener clave.
 *
 * @param {{cuit?:string|null, tipo?:string|null, proveedor?:string|null, comprobante?:string|null}} c
 * @returns {string|null}
 */
export function claveDeCompra(c = {}) {
  return claveComprobante({
    cuit: c.cuit, tipo: c.tipo, numero: c.comprobante, proveedor: c.proveedor,
  })?.clave ?? null
}
