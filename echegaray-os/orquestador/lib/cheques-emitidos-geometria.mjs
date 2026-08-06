// DÓNDE EMPIEZA EL REGISTRO DE "Cheques Emitidos" — DECLARADO UNA SOLA VEZ.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO (06/08) ═══
//
// La fila donde arranca el registro estaba escrita a mano en CINCO lugares, con TRES valores
// distintos, y ninguno era el real:
//
//   · cash-flow-lineas.mjs        INSTRUMENTOS.cheques.filaCab = 1   → leía  $F$2:$F$400
//   · cheques-cobertura-sheet.mjs A2:L400 y la marca en M1           → leía  desde la fila 2
//   · libro-extractores.mjs       deChequesEmitidos({ fila0 = 20 })  → leía  desde la fila 20
//   · caja-anexo-controles.mjs    '…'!$K$2:$K$400 armado a mano      → leía  desde la fila 2
//   · conciliacion-por-naturaleza '…'!$F$2:$F$400 armado a mano      → leía  desde la fila 2
//
// El registro real arrancaba en la 21 (encabezado en la 20). Los cuatro rangos que empezaban en la 2
// se comían la banda entera: 19 filas de rótulos y de fórmulas de resumen entraban como si fueran
// cheques. No daban error —los rótulos no son números y las fórmulas de la banda no tienen fecha de
// pago— pero cualquier criterio nuevo que mirara texto o contara filas iba a contar la banda.
//
// El defecto de fondo no es el número: es que había CINCO números. Cada vez que la banda cambia de
// alto hay que acertarle a los cinco, y el que se olvida no grita. Acá vive uno solo y los cinco lo
// importan; el test `cheques-emitidos-geometria.test.mjs` compara lo importado contra esto.
//
// ═══ EL TOPE DE 400 NO ES UN NÚMERO REDONDO: ES UN CONTRATO CON CAJA ═══
//
// CAJA!H15 cablea `$M$2:$M$400` y `$I$2:$I$400`, y CAJA está CONGELADA (nadie la regenera). Un
// registro que pase de la fila 400 desaparece de ese control sin que nada avise. Mientras el alto de
// la banda + los cheques cargados no lleguen ahí, la referencia alcanza; el día que se acerque, hay
// que tocar CAJA a mano ANTES de crecer.

/** Alto exacto de la banda superior (filas 1..BANDA). La escribe `cheques-emitidos-tablero.mjs`. */
export const BANDA = 25

/** Fila del encabezado del registro ("Tipo", "Nro", "Monto"…). */
export const FILA_HDR = BANDA + 1

/**
 * Primera fila de DATOS del registro. Todo rango que lea cheques arranca acá.
 *
 * `cheques-emitidos-sync-banco.mjs` busca "Tipo" en A1:A30 y no usa esta constante a propósito: es el
 * único que se ancla al dato vivo en vez de a la geometría declarada, y es el que avisa si alguien
 * mueve el registro sin pasar por acá. No unificarlo es deliberado.
 */
export const FILA_DATO0 = FILA_HDR + 1

/** Última fila que las fórmulas de otras pestañas alcanzan. Ver la nota de arriba: es contrato. */
export const FILA_FIN = 400

/** Rango ABIERTO de una columna del registro ("$F$27:$F"). Para fórmulas de la propia pestaña. */
export const rangoAbierto = (col) => `$${col}$${FILA_DATO0}:$${col}`

/** Rango CERRADO de una columna del registro ("$F$27:$F$400"). */
export const rangoCerrado = (col) => `$${col}$${FILA_DATO0}:$${col}$${FILA_FIN}`

/**
 * El mismo rango cerrado, calificado con el nombre de la pestaña. El nombre entra por parámetro
 * porque en el archivo real convive con "Cheques Recibidos" y quien lo resuelve es `hallarPestana`:
 * cablear el título acá sería reintroducir el problema que este archivo vino a cerrar.
 */
export const rangoEn = (pestana, col) => `'${pestana}'!${rangoCerrado(col)}`
