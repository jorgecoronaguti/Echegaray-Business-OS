// EL CONCEPTO DE UN MOVIMIENTO BANCARIO, COMPARADO COMO CORRESPONDE.
//
// POR QUÉ EXISTE. La pregunta "¿estos dos textos son el mismo movimiento?" la necesitan el importador
// (para no cargar de nuevo lo que ya está) y, cuando se integre, el deduplicador y la conciliación
// contra el extracto. Cada uno tenía su propia respuesta y eran distintas: comparando el concepto
// EXACTO no se veía una familia entera de duplicados, y el mismo par de filas era "duplicado" para uno
// y "movimientos distintos" para el otro. Un concepto crítico se define UNA sola vez.
//
// LOS TRES MODOS EN QUE EL BANCO ESCRIBE EL MISMO CONCEPTO:
//   1. Mayúsculas y espacios distintos entre descargas ("Deposito E-cheq 48hs" / "deposito e-cheq  48hs").
//   2. RECORTADO: la semilla guardó "Pago haberes - 260701507" y el CSV trae el número repetido al
//      final; una captura de pantalla corta el concepto en el ancho de la columna.
//   3. Anotado a mano por el OS: "Cheque debitado - Nº 221" donde el banco escribió "Cheque debitado".

/** El concepto comparable: el banco cambia mayúsculas y espacios entre descargas, no el movimiento. */
export const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * ¿Los conceptos son del mismo movimiento? → 'exacto' | 'prefijo' | null
 *
 * Con la fecha y el importe ya iguales, que uno sea prefijo del otro alcanza para identificarlo. Y NO
 * alcanza el revés: nunca se emparejan dos conceptos que difieren EN EL MEDIO ("Id debin cuit 307…" vs
 * "Id debin z0kv8… cuit 307…"), porque ahí ya no se sabe si es el mismo movimiento o dos parecidos.
 *
 * El piso de 8 caracteres evita que un prefijo pobre empareje cualquier cosa: "Iva" no identifica nada.
 */
export function conceptoCompatible(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (x === y) return 'exacto'
  if (x.length >= 8 && y.length >= 8 && (x.startsWith(y) || y.startsWith(x))) return 'prefijo'
  return null
}
