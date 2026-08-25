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
  // Cuánto falta para que el cajón cierre en cero. Vale 0 cuando el efectivo es posible; cuando no,
  // mide el error MÍNIMO que hay en los datos del efectivo — y mientras no sea 0, el neto de arriba
  // está degradado al conteo del dueño a propósito. Nació del 14/08: CAJA DISPONIBLE en −$194.181.
  efectivoImposible: 'ANEXO_EFECTIVO_IMPOSIBLE',
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
  // LA FECHA DE LOS DOS CONTEOS DE EFECTIVO — la columna D de CAJA para las filas que NO tienen banco.
  //
  // El dueño borró la celda donde él la tipeaba y lo dijo: *"te borré la fecha de los saldos en caja
  // para q no te guíes en eso sino en lo q marca los timestamps del código"*. Desde entonces las dos
  // filas de efectivo —el 40% del disponible— no decían de cuándo eran, y el aviso de "congelado" de
  // la tarjeta no podía dispararse nunca sobre ellas porque su condición empieza por `ISNUMBER($D$n)`.
  //
  // No se le vuelve a pedir: sale del CENTINELA (`caja_conteo_observado`), que registra el instante en
  // que el OS vio por primera vez cada valor del conteo. Es un número pegado por la corrida, de la
  // misma especie que el SELLO y por el mismo motivo: ninguna fórmula de Sheets puede saber CUÁNDO
  // cambió una celda. CAJA lo cita por nombre y no lo recalcula.
  conteoArsDia: 'ANEXO_CONTEO_ARS_DIA',
  conteoUsdDia: 'ANEXO_CONTEO_USD_DIA',
  // LA FECHA DEL ÚLTIMO MOVIMIENTO DE EFECTIVO — la que CAJA publica de verdad en D7 (24/08/2026).
  //
  // El dueño: *"la fila 7 q marca el efectivo disponible me confunde con la fecha del saldo porque se
  // realizaron cobranzas en efectivo y pagos pero no me indica la fecha del ultimo movimiento de
  // efectivo"*. `CAJA!C7` = conteo + los movimientos posteriores de SEIS fuentes; su fecha decía el día
  // del conteo. El número llegaba a hoy y la fecha se quedaba en el conteo.
  //
  // SE CALCULA EN EL ANEXO Y NO EN CAJA por el mismo motivo que el neto: su ancla es el INSTANTE
  // sellado (`$F$` del SELLO), que vive en el anexo y no tiene nombre propio; y porque la fórmula mira
  // las seis fuentes enteras — una expresión así en la portada es exactamente lo que el anexo existe
  // para sacar de ahí. CAJA la cita por nombre, como todo lo demás que cruza la frontera.
  ultimoEfectivoDia: 'ANEXO_EFECTIVO_ULTIMO_DIA',
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
  // OJO CON ESTE NOMBRE (24/08/2026): apunta a `CAJA!D7`, y desde que esa celda publica la fecha del
  // ÚLTIMO MOVIMIENTO de efectivo —y no la del conteo— el nombre dice más de lo que la celda tiene.
  // NO SE RENOMBRA DESDE ACÁ: un nombre publicado puede estar citado por una fórmula escrita a mano en
  // el libro, y renombrarlo a ciegas la dejaría en #NAME?. Ninguna fórmula del REPO lo lee (verificado
  // por grep el 24/08: sólo lo escriben `caja-pestana.mjs` al republicarlo y `caja-disponibilidades`
  // para marcar cuál es la fila del arqueo). El ancla del cálculo NO es esta celda desde el 15/08: es
  // el instante sellado en F del SELLO del anexo. Quien necesite el DÍA del conteo tiene
  // `ANEXO_CONTEO_ARS_DIA`, que sigue siendo exactamente eso.
  arqueoArsFecha: 'CAJA_ARQUEO_ARS_FECHA',
  arqueoUsd: 'CAJA_ARQUEO_USD',
  arqueoUsdFecha: 'CAJA_ARQUEO_USD_FECHA',
}

/** La celda de la que sale la caja mínima. Un parámetro tiene una sola dirección en todo el archivo. */
export const CELDA_CAJA_MINIMA = { pestana: '01_Valores Iniciales', fila: 3, col: 2 }

/**
 * Qué especie promete cada nombre nuevo, para que `desalineados()` lo verifique después de publicar.
 * Los contadores de días son ENTEROS; todo lo demás es plata. `CAJA_BANCO_CORTE` y los dos
 * `ANEXO_CONTEO_*_DIA` son fechas y no se declaran: la API las devuelve como serial y "entero" no
 * distingue una fecha de un contador — declarar una especie que no discrimina es peor que no
 * declararla. Y la de dólares está VACÍA mientras no haya conteo cargado, que es un estado legítimo:
 * exigirle especie la haría fallar por no tener un dato que no existe.
 */
export const ESPECIE_ANEXO = {
  [ANEXO.efectivoNeto]: 'importe',
  [ANEXO.efectivoImposible]: 'importe',
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

/**
 * LOS ÚNICOS NOMBRES QUE PUEDEN APUNTAR A UNA CELDA VACÍA — nominales, y con el motivo al lado.
 *
 * La regla del archivo es que todo nombre publicado declara su especie y se verifica después de
 * publicar. Estos dos no pueden: su celda está legítimamente vacía cuando no hay conteo cargado, y
 * `publicar` con especie declarada DESCARTA el destino vacío — el nombre no se crearía y la fórmula que
 * lo cita en CAJA daría `#NAME?` en la primera pantalla de la pestaña más mirada del archivo.
 *
 * La excepción es NOMINAL a propósito: una excepción sin nombre propio es un agujero por el que entra
 * el próximo nombre sin verificar. Si alguien agrega un tercero, tiene que venir acá y escribir por qué.
 */
export const PUEDE_ESTAR_VACIO = {
  [ANEXO.conteoArsDia]: 'sin conteo en pesos cargado no hay fecha que publicar, y una fecha inventada sobre un arqueo que no ocurrió es peor que la celda vacía',
  [ANEXO.conteoUsdDia]: 'hoy está SIEMPRE vacía: `CAJA_ARQUEO_USD` vale 0 y no hay conteo en dólares. El nombre existe igual para que `CAJA!D8` no quede en #NAME? y se complete sola el día que se cargue uno',
  [ANEXO.ultimoEfectivoDia]: 'su celda tiene SIEMPRE una fórmula, pero el valor es texto vacío mientras la corrida no haya sellado el instante del conteo: sin ancla no hay ventana, y una fecha de "último movimiento" sin ventana sería el histórico entero. CAJA cae a la fecha del conteo en ese caso, y el nombre tiene que existir igual o D7 quedaría en #NAME?',
}

/** El nombre de la pestaña auxiliar. Prefijo `_` como `_BANCO_RAW` y `_PROVEEDORES_OS`: no se lee. */
export const PESTANA_ANEXO = '_CAJA_ANEXO'
