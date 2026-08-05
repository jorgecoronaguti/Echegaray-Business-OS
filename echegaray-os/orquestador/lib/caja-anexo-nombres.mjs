// EL CONTRATO ENTRE CAJA Y SU ANEXO — UN NOMBRE POR CADA CIFRA QUE CRUZA LA FRONTERA.
//
// POR QUÉ EXISTE (05/08/2026). CAJA llegó a 143 filas porque el detalle del analista —setenta
// renglones de conciliaciones— vivía en la misma pestaña que la posición que decide el dueño. Sacarlo
// se había intentado y abandonado por una razón buena: los bloques de arriba lo referenciaban POR
// CELDA (`=C90`, `=E99`, `=E103`), y mudarlo convertía cada una de esas referencias en una referencia
// entre pestañas que se rompe la primera vez que el anexo cambia de forma.
//
// LA SALIDA NO ES NO MUDARLO: es dejar de referenciar por celda. Cada cifra que CAJA necesita del
// anexo —y cada cifra que el anexo necesita de CAJA— tiene UN nombre, y el nombre es el contrato. El
// anexo puede reordenarse entero sin que CAJA se entere, que es exactamente lo que hoy no se puede.
//
// Y EL NOMBRE SE VERIFICA, NO SE SUPONE: `rangos-nombrados.mjs` relee cada celda después de publicar
// y compara contra la ESPECIE que el nombre promete (un importe donde va un importe). Un nombre
// publicado sobre una celda vacía o sobre un texto es el defecto que dejó `ARCA_COMPRAS_TOTAL`
// devolviendo un número de comprobante; acá se paga por adelantado declarando la especie de cada uno.

/**
 * Lo que el ANEXO le publica a CAJA. Cada uno es el veredicto de un control o una cifra de un bloque
 * que se mudó: CAJA muestra el número en una línea y el detalle vive en `_CAJA_ANEXO`.
 */
export const ANEXO = {
  // El neto de efectivo posterior al arqueo. "Caja en pesos" de CAJA lo suma: es la mitad viva de la
  // identidad `efectivo = arqueo + movimientos posteriores`. El desglose (seis renglones) queda abajo.
  efectivoNeto: 'ANEXO_EFECTIVO_NETO',
  // Los tres del bloque de crédito. CAJA los muestra en una línea; el cupo, los consumos, las cuotas
  // y lo que cuesta el descubierto viven en el anexo.
  tarjetaDisponible: 'ANEXO_TARJETA_DISPONIBLE',
  acuerdo: 'ANEXO_ACUERDO',
  aire: 'ANEXO_AIRE',
  // Los cinco controles que CAJA resume en tres líneas de veredicto.
  difEcheq: 'ANEXO_DIF_ECHEQ',
  difConciliacion: 'ANEXO_DIF_CONCILIACION',
  efectivoSinExplicar: 'ANEXO_EFECTIVO_SIN_EXPLICAR',
  vencidoSinConciliar: 'ANEXO_VENCIDO_SIN_CONCILIAR',
  oficinaSinCanal: 'ANEXO_OFICINA_SIN_CANAL',
  chequesSinMarca: 'ANEXO_CHEQUES_SIN_MARCA',
  chequesSinFecha: 'ANEXO_CHEQUES_SIN_FECHA',
  // Días de liquidez: el ritmo de egreso contra la disponibilidad. Va al veredicto de CAJA.
  diasDeCaja: 'ANEXO_DIAS_CAJA',
}

/**
 * Lo que CAJA le publica al ANEXO. Los dos primeros ya existían (los consumen los dos cash flow); los
 * tres de abajo nacen con esta mudanza porque el anexo dejó de poder citar la fila.
 */
export const DESDE_CAJA = {
  total: 'CAJA_TOTAL_DISPONIBLE',
  fecha: 'CAJA_FECHA_SALDO',
  // El saldo del banco en pesos y la fecha de corte del extracto: el ancla de todas las ventanas
  // "posterior al corte". Antes el anexo las citaba como `$E$10` y `$F$10`.
  bancoSaldo: 'CAJA_BANCO_SALDO',
  bancoCorte: 'CAJA_BANCO_CORTE',
  // El total de valores en cartera. El control del detalle lo resta para saber si el cash flow espera
  // un echeq que ya se entregó.
  cartera: 'CAJA_CARTERA',
  // La caja mínima deseada. NO vive ni en CAJA ni en el anexo: el nombre apunta a `01_Valores
  // Iniciales`, que es su fuente. Así los dos la leen sin que ninguno la copie.
  minima: 'CAJA_MINIMA',
  // EL ARQUEO — la única celda de CAPTURA de todo el archivo. Vivían como constantes sueltas dentro
  // del generador de CAJA; el anexo las necesita para acotar sus ventanas, así que se declaran acá
  // una sola vez. Citarlas por nombre es lo que permitió mover el bloque del arqueo del final de la
  // pestaña al segundo lugar sin tocar una sola de las seis fórmulas del efectivo.
  arqueoArs: 'CAJA_ARQUEO_ARS',
  arqueoArsFecha: 'CAJA_ARQUEO_ARS_FECHA',
  arqueoUsd: 'CAJA_ARQUEO_USD',
  arqueoUsdFecha: 'CAJA_ARQUEO_USD_FECHA',
}

/** La celda de la que sale la caja mínima. Un parámetro tiene una sola dirección en todo el archivo. */
export const CELDA_CAJA_MINIMA = { pestana: '01_Valores Iniciales', fila: 3, col: 2 }

/**
 * Qué especie promete cada nombre nuevo, para que `desalineados()` lo verifique después de publicar.
 * Los contadores de días son ENTEROS; todo lo demás es plata. `CAJA_BANCO_CORTE` es una fecha y no se
 * declara: la API la devuelve como serial y "entero" no distingue una fecha de un contador — declarar
 * una especie que no discrimina es peor que no declararla.
 */
export const ESPECIE_ANEXO = {
  [ANEXO.efectivoNeto]: 'importe',
  [ANEXO.tarjetaDisponible]: 'importe',
  [ANEXO.acuerdo]: 'importe',
  [ANEXO.aire]: 'importe',
  [ANEXO.difEcheq]: 'importe',
  [ANEXO.difConciliacion]: 'importe',
  [ANEXO.efectivoSinExplicar]: 'importe',
  [ANEXO.vencidoSinConciliar]: 'importe',
  [ANEXO.oficinaSinCanal]: 'importe',
  [ANEXO.chequesSinMarca]: 'importe',
  [ANEXO.chequesSinFecha]: 'importe',
  [DESDE_CAJA.bancoSaldo]: 'importe',
  [DESDE_CAJA.cartera]: 'importe',
  [DESDE_CAJA.minima]: 'importe',
  // El tipo de cambio no es plata, pero la especie que hace falta verificar es la misma: que haya un
  // NÚMERO ahí y no un texto ni una celda vacía. `importe` es el predicado que acepta entero o decimal.
  TIPO_CAMBIO_USD: 'importe',
}

/** El nombre de la pestaña auxiliar. Prefijo `_` como `_BANCO_RAW` y `_PROVEEDORES_OS`: no se lee. */
export const PESTANA_ANEXO = '_CAJA_ANEXO'
