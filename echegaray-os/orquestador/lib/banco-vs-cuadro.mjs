// LO QUE SALIÓ DEL BANCO CONTRA LO QUE EL CUADRO CUENTA, CONCEPTO POR CONCEPTO.
//
// ═══ POR QUÉ EXISTE (01/08) ═══
//
// El dueño: *"los $14.134.932 de salidas bancarias sin pestaña: esos conceptos sí están en el Sheet,
// buscalos y consolidalos donde corresponden"*. Al medirlo, de esos $14,1M **hay tres millones que
// el cuadro ya cuenta bien y once que no**:
//
//   naturaleza (lo que dice el banco)        salió        el cuadro cuenta
//   ─────────────────────────────────────────────────────────────────────────
//   Préstamo prendario                  $1.282.811        $1.282.811   ✓ al peso
//   Comisiones y gastos bancarios          $381.650          $381.650   ✓ al peso
//   Costo financiero del descubierto       $282.621          $282.621   ✓ al peso
//   AFIP                                 $6.368.462                $0   ✖
//   Compras con tarjeta de débito        $4.077.785         sin línea   ✖
//   Débitos automáticos (seguros)          $675.494         sin línea   ✖
//
// Los tres que faltan tienen la MISMA causa: son débitos que salieron de la cuenta y **no tienen
// comprobante cargado en Compras**. El cuadro suma Compras, así que no los ve. No es que estén mal
// clasificados: no están.
//
// ═══ POR QUÉ ESTE BLOQUE NO SUMA ═══
//
// La tentación es agregarlos como líneas de egreso y que el total cierre. Sería un error: el día que
// alguien cargue la factura del seguro en Compras, ese gasto pasaría a estar contado DOS veces —una
// por el banco y otra por Compras— y el control del pie seguiría cerrando, porque las dos salen del
// mismo lado. Es exactamente el defecto que este archivo lleva un mes sacándose de encima.
//
// Entonces se hace lo que el archivo ya hace con las cobranzas esperadas y con la nómina de
// administración: se muestra al lado, con signo 0, y la DIFERENCIA es el trabajo pendiente. La plata
// deja de ser invisible sin arriesgar contarla dos veces, y cuando la factura se cargue la
// diferencia se cierra sola y el bloque queda en cero.
//
// LA FUENTE ES EL BANCO, QUE NO SE PUEDE DISCUTIR. `_BANCO_RAW` ya trae la naturaleza de cada
// movimiento clasificada (banco-santander.mjs) y es la réplica del extracto: lo que dice que salió,
// salió.

import { RAW } from './conciliacion-por-naturaleza.mjs'

/**
 * Las naturalezas que se controlan, con la línea del cuadro que debería tenerlas.
 *
 * `lineaDelCuadro: null` significa "hoy no hay ninguna línea que la contenga" — y eso, dicho en la
 * pestaña, es más útil que un número: es lo que hay que decidir dónde ubicar.
 */
export const CONTROLADAS = [
  { nat: 'AFIP', lineaDelCuadro: 'Impuestos nacionales y provinciales', donde: 'Compras, rubro "Impuestos"' },
  { nat: 'Compras con tarjeta de débito', lineaDelCuadro: null, donde: 'Compras — cada consumo con su rubro' },
  { nat: 'Débitos automáticos (seguros)', lineaDelCuadro: null, donde: 'Compras o Recurrentes, según sea póliza fija o eventual' },
  { nat: 'Préstamo prendario', lineaDelCuadro: 'Cuotas de crédito prendario y gastos bancarios', donde: 'Compras, rubro Financiero' },
  { nat: 'Comisiones y gastos bancarios', lineaDelCuadro: 'Comisiones y gastos bancarios (Santander)', donde: 'se calcula del propio extracto' },
  { nat: 'Costo financiero del descubierto', lineaDelCuadro: 'Intereses del acuerdo en descubierto', donde: 'se calcula con la tasa del acuerdo' },
]

/** NÚCLEO PURO: la columna del rango de `_BANCO_RAW`, abierta hacia abajo. */
const col = (letra) => `'${RAW.hoja}'!$${letra}$${RAW.desde}:$${letra}`

/**
 * NÚCLEO PURO: lo que el banco muestra que salió por una naturaleza, en una ventana.
 *
 * Rango ABIERTO y ventana por fecha, como el resto del archivo. El importe se toma en valor absoluto
 * porque en la réplica los egresos van negativos y acá se muestran como salida positiva, igual que
 * todas las líneas de egreso del cuadro.
 *
 * @param {string} nat la naturaleza exacta que escribe banco-raw-pestana
 * @param {string} desde expresión de inicio · @param {string} hasta límite EXCLUYENTE
 */
export function formulaBancoPorNaturaleza(nat, desde, hasta) {
  const f = col(RAW.fecha)
  const enVentana = `ISNUMBER(${f})*(${f}>=${desde})*(${f}<${hasta})`
  return `=SUMPRODUCT(${enVentana}*(${col(RAW.signo)}="sale")*(${col(RAW.naturaleza)}="${nat}")`
    + `*ABS(IF(ISNUMBER(${col(RAW.importe)});${col(RAW.importe)};0)))`
}

/**
 * NÚCLEO PURO: la diferencia entre lo que salió del banco y lo que el cuadro cuenta.
 * Vacía —no cero— cuando la línea del cuadro no existe todavía: no es que la diferencia sea cero,
 * es que no hay contra qué comparar, y un cero ahí se leería como "está todo bien".
 */
export function formulaDiferencia(celdaBanco, celdaCuadro) {
  return celdaCuadro
    ? `=IF(N(${celdaBanco})=0;"";N(${celdaBanco})-N(${celdaCuadro}))`
    : `=IF(N(${celdaBanco})=0;"";N(${celdaBanco}))`
}

/**
 * NÚCLEO PURO: la lectura de una diferencia, en palabras. Un número solo no dice qué hacer.
 * @param {number} banco · @param {number} cuadro · @param {boolean} hayLinea
 */
export function lectura(banco, cuadro, hayLinea) {
  if (!banco) return 'sin movimientos del banco en el período'
  if (!hayLinea) return 'el cuadro NO tiene ninguna línea que lo contenga: falta cargarlo en Compras'
  const d = Math.round(banco - cuadro)
  if (d === 0) return '✓ el cuadro lo cuenta al peso'
  if (d > 0) return `faltan $${d.toLocaleString('es-AR')} sin comprobante cargado`
  return `el cuadro cuenta $${Math.abs(d).toLocaleString('es-AR')} de MÁS que el banco (proyección o duplicado)`
}
