// LAS CUATRO TARJETAS EJECUTIVAS DE CAJA — LA PORTADA, EN CUATRO NÚMEROS.
//
// ═══ POR QUÉ EXISTEN (05/08/2026) ═══
//
// El dueño, textual: *"no quiero que parezca una planilla. Quiero que parezca un producto de Treasury
// de nivel JPMorgan/Stripe Treasury/Mercury/Brex/Kyriba… Dirección debe entender la situación en menos
// de cinco segundos"*. Cinco segundos no alcanzan para leer una tabla: alcanzan para leer cuatro
// números grandes. Todo lo demás de la pestaña es el detalle de estos cuatro.
//
// ═══ EL REORDEN DEL 06/08 — DISPONIBLE OPERATIVO vs INVERTIDO ═══
//
// El dueño, textual: *"el concepto de 'caja disponible' tiene que ser lo que se refleja únicamente en
// el saldo bancario (ars y usd) como caja en efectivo (ars y usd), discriminar lo que se encuentra en
// Balanz invertido, reflejarlo en las tarjetas de manera ordenada como se vería y usaría en el
// JPMorgan"*.
//
// Es el ordenamiento de J.P. Morgan Access Liquidity Solutions
// (jpmorgan.com/payments/solutions/access): el tesorero ve su OPERATING CASH —lo que puede pagar
// HOY, bancos y efectivo— separado de los INVESTED BALANCES, que se muestran aparte con su
// naturaleza (dónde están, con qué liquidez); la liquidez total es la suma de los dos, no un solo
// número que los mezcla. Por eso la segunda tarjeta es INVERTIDO y no otra proyección: primero qué
// tengo líquido, después qué tengo colocado, y recién entonces qué debo y cómo termino el mes.
//
// Las tarjetas RIESGO DE LIQUIDEZ y PRÓXIMO CUELLO DE BOTELLA las borró el dueño de la pestaña (sus
// borrados están sellados en `public.sheet_huella_celda`) y acá dejaron de emitirse: el piso y su
// tramo siguen viviendo en la fila de cierre de la escalera, que es su detalle. La quinta columna de
// tarjetas queda vacía.
//
// LA FORMA DE UNA TARJETA ES SIEMPRE LA MISMA, y ésa es la mitad del diseño: rótulo chico en gris
// arriba, el número grande abajo, y UNA línea de contexto en gris que dice a qué fecha vale o qué
// habilita. Tres renglones, ni uno más. Un cuadro donde cada celda tiene una forma distinta obliga a
// decodificar antes de leer, y eso ya cuesta más de cinco segundos.
//
// ═══ NINGÚN NÚMERO NACE ACÁ ═══
//
// Cada cifra es una FÓRMULA sobre el libro canónico (`_MOVIMIENTOS`) construida con `terminoLibro`, o
// una REFERENCIA a la celda de la pestaña que ya calcula ese número (el total del panel de cuentas,
// las filas de Balanz). Ninguna tarjeta hace una cuenta propia: si el detalle cambia, la tarjeta
// cambia con él, y no puede existir la situación en la que el titular dice una cosa y la tabla de
// abajo otra.
//
// EL LIBRO SE CONSULTA POR `terminoLibro` Y NO A MANO. Escribir el SUMPRODUCT acá sería la segunda
// definición de "lo que sale en los próximos 30 días" — exactamente la enfermedad que el libro vino a
// curar (ver lib/libro-sumas.mjs). Si mañana el libro suma una columna, cambia un archivo.

import { terminoLibro } from './libro-sumas.mjs'
import { ALERTA } from './glifos.mjs'
import { DIAS_AVISO } from './fecha-de-frescura.mjs'

/**
 * LOS ESTADOS QUE TODAVÍA NO PASARON POR EL BANCO.
 *
 * `REAL` queda AFUERA a propósito en toda proyección: un movimiento real ya está adentro del saldo
 * que publica el bloque de cuentas (por el extracto, o por la línea de movimientos posteriores al
 * corte). Sumarlo otra vez al proyectar sería contar la misma plata dos veces, que es el defecto más
 * caro y más silencioso de este archivo.
 */
export const NO_REAL = Object.freeze(['COMPROMETIDO', 'PROYECTADO', 'VENCIDO'])

/**
 * ═══ EL CORTE QUE FALTABA: LO QUE SE DEBE vs LO QUE SE PLANEA GASTAR (16/08/2026) ═══
 *
 * `NO_REAL` son los tres estados que todavía no pasaron por el banco, y durante semanas la tarjeta
 * los sumó en un solo titular rotulado "FALTA PAGAR". El dueño lo reclamó tres veces. Medido contra
 * el Sheet vivo: de los $122.325.841 publicados, **$37.977.572 eran PROYECTADO** — materiales de obra
 * estimados, "Estructura esperada", "Recurrente esperado · Movistar", nafta y gasoil por cuota.
 * Nadie debe eso. Es presupuesto.
 *
 * `libro-movimientos.mjs` cita la regla absoluta de la skill de tesorería en su propia cabecera:
 * *"Nunca se suman dos categorías distintas en la misma columna sin distinguirlas"*. El libro la
 * cumple (el estado es un campo del movimiento, no una propiedad de la vista); la tarjeta que lo
 * publicaba la rompía. El defecto no era la frase — las dos correcciones anteriores tocaron la frase
 * y el dueño volvió a rechazarlas — era qué entra adentro del número.
 *
 * · **DEUDA** = COMPROMETIDO + VENCIDO. Plata que hay que poner sí o sí. COMPROMETIDO es la
 *   obligación con respaldo (la factura del proveedor todavía impaga, el cheque librado y no
 *   debitado). VENCIDO estaba previsto para una fecha que ya pasó y nadie lo concilió: **no está
 *   probado, pero tampoco es evitable** — o la plata ya salió y falta marcarla, o se debe. En las dos
 *   lecturas dejó de ser una decisión futura, que es lo único que puede vivir en el plan. Va acá por
 *   prudencia y se DECLARA aparte en el contexto, porque no es lo mismo que una factura firmada.
 * · **PLAN** = PROYECTADO. Una estimación con fecha, no un hecho (`libro-movimientos.mjs`). Depende
 *   de que la actividad siga: si no entra plata, no se compra.
 *
 * SON DISJUNTOS Y SU UNIÓN ES `NO_REAL`, y hay un test que lo fija. Partir un número en dos conceptos
 * sólo es honesto si no se pierde ni se duplica plata en la costura.
 */
export const DEUDA = Object.freeze(['COMPROMETIDO', 'VENCIDO'])
/** La otra mitad de `NO_REAL`: gasto planeado que todavía no es obligación de nadie. */
export const PLAN = Object.freeze(['PROYECTADO'])

/** El horizonte histórico de la proyección, en días. Lo siguen usando consumidores fuera de acá. */
export const HORIZONTE = 30
/** La frontera del idioma único: fin del mes corriente, EXCLUIDA (mismo criterio `hasta` del repo). */
export const FIN_DE_MES = 'EOMONTH(TODAY();0)+1'

// `plata` (pesos enteros dentro de una frase) se fue el 15/08: hacía dos corridas que no la llamaba
// nadie —las cinco líneas de contexto hablan en millones— y el lint la marcaba en cada corrida.
/** Una fecha dentro de una frase. dd/mm y no dd/mm/yyyy: el año se sobreentiende y ocupa lugar. */
const dia = (e) => `TEXT(${e};"dd/mm")`
/**
 * Plata en millones con un decimal — la unidad de las líneas de contexto de esta fila.
 *
 * EL PATRÓN DE `TEXT` VA EN US (`#,##0.0`) AUNQUE LOS ARGUMENTOS VAYAN EN es-AR (`;`): son dos
 * gramáticas distintas dentro de la misma fórmula y mezclarlas rompe en silencio. La "M" la pone
 * quien arma la frase, no esto: adentro de un `TEXT` sería otro literal que revisar.
 */
const millones = (e) => `TEXT((${e})/1000000;"$#,##0.0")`

/**
 * NÚCLEO PURO: la frase de la tarjeta DISPONIBLE cuando una parte del total está congelada.
 *
 * ═══ EL DEFECTO QUE CIERRA (14/08/2026) ═══
 *
 * La fila del total publica `MAX` de las fechas de todas las cuentas, y la tarjeta CAJA DISPONIBLE
 * copia esa celda: decía *"al 14/08 · bancos y efectivo"* mientras $1.463.926 de la cuenta en dólares
 * venían de un corte del 05/08 cargado a mano — nueve días antes. Es exactamente lo que
 * `rotuloPorFuente` tiene escrito en su cabecera y prohíbe: **una fuente viva no le presta su frescura
 * a una congelada**. La columna D marca cada fila vieja en ámbar y eso sigue estando bien, pero la
 * tarjeta es lo que se lee en cinco segundos y ahí el promedio tapaba el atraso.
 *
 * NO SE ARREGLA CAMBIANDO EL `MAX` POR UN `MIN`: esa celda es también el "Efectivo al inicio" de los
 * dos cash flow y el ancla de `ubicarCaja`; moverla arrastraría todo el archivo a la fecha de la
 * cuenta más atrasada, que es el error simétrico. La fecha del total se queda; lo que se agrega es la
 * confesión al lado.
 *
 * ═══ Y UN TRIÁNGULO CON UNA FECHA NO ES LA CONFESIÓN (15/08/2026) ═══
 *
 * La primera versión decía *" · ▲ parte al 05/08"*. El dueño lo rechazó tres veces, y tenía razón:
 * "parte" no se puede decidir. De los $18.270.071 de la tarjeta, ¿son $500.000 los viejos o son
 * $15.000.000? La respuesta cambia si se paga o no se paga. Ahora la frase publica **CUÁNTA PLATA**
 * del titular viene de esa fecha, que es el único dato con el que el lector puede decidir si eso le
 * importa hoy.
 *
 * EL MONTO SE SUMA CON LA MISMA CONDICIÓN CON LA QUE SE AVISA, celda por celda: no es "el total menos
 * lo vivo" (que sería una segunda definición del total) sino la suma de las filas que SUMAN y cuya
 * fecha pasó el umbral. Si el dueño pega hoy el saldo en dólares, el término da 0 y la frase vuelve
 * sola a la de siempre — un aviso que aparece todos los días deja de leerse.
 *
 * DICE "congelado" Y NO "a mano" A PROPÓSITO: la condición que se mide es la ANTIGÜEDAD, y una fuente
 * viva también se congela (el importador del banco parado deja `_BANCO_RAW` quieto con su fórmula
 * intacta). Rotularlo "a mano" sería afirmar una causa que la celda no conoce.
 *
 * ═══ Y EL MONTO SIN LA PALABRA "DE" ES OTRO IMPORTE, NO UNA PARTE (16/08/2026) ═══
 *
 * La frase decía *"al 15/08 · ▲ $1,4M congelado al 05/08"* y el dueño la leyó como lo que parece: un
 * segundo importe, de otro origen, al lado del titular. Textual: *"confunde ese importe de origen q has
 * diferenciado"*. Era correcta y era ilegible — dos cifras pegadas sin una preposición entre ellas no
 * dicen si una está adentro de la otra o al lado.
 *
 * "$1,4M DE ESTE TOTAL son del 05/08" declara la relación en tres palabras: el $18,3M de arriba es el
 * todo, el $1,4M es su parte vieja, y por diferencia se lee lo que queda vivo. Se descartó publicar las
 * dos patas ("$16,9M vivos · $1,4M al 05/08") porque agrega un tercer número que NO está en ninguna
 * celda de la pestaña: el lector no puede verificarlo contra nada, y el primero se leería como el total.
 *
 * @param {string} fecha la celda o expresión con la fecha más vieja de las filas que suman
 * @param {string} monto la expresión que suma el importe de esas mismas filas cuando están viejas
 * @param {number} [avisoDias] el mismo umbral que la columna D de esta pestaña y que el resto del OS
 * @returns {string} expresión sin `=`, con la rama vacía cuando no hay nada que avisar
 */
export function avisoDeAtraso(fecha, monto, avisoDias = DIAS_AVISO) {
  // ISNUMBER primero: una celda vacía o con "" haría `TODAY()-""` = un número enorme y el aviso
  // quedaría prendido para siempre sobre un dato que ni siquiera existe.
  //
  // Y `>0` DESPUÉS, QUE NO ES REDUNDANTE: `MIN` sobre celdas TODAS vacías devuelve 0, y 0 ES un
  // número — el ISNUMBER no lo atrapa. Un panel al que todavía no se le cargó ninguna fecha
  // publicaría "▲ $0,0M congelado al 30/12", que es el serial 0 dibujado como fecha. Es el mismo
  // defecto que la fila del total ya evita con su IFERROR, escrito en el otro extremo de la cuenta.
  return `IF(AND(ISNUMBER(${fecha});${fecha}>0;TODAY()-${fecha}>${avisoDias});" · ${ALERTA} "&${millones(monto)}&"M de este total son del "&${dia(fecha)};" · bancos y efectivo")`
}

/**
 * LAS CINCO TARJETAS, EN ORDEN. Puras: devuelven fórmulas, no tocan nada.
 *
 * El orden es el del tesorero de JPM y no se negocia, porque leído de izquierda a derecha cuenta una
 * historia y en cualquier otro orden son cinco números sueltos: cuánto puedo pagar HOY (operativo) →
 * cuánto FALTA PAGAR del mes → con cuánto termino SI NO COBRO NADA MÁS → cuánto tengo colocado, con
 * su naturaleza → con cuánto termino COBRANDO TODO. Las tarjetas 3 y 5 son la misma cuenta en sus dos
 * extremos, y por eso van rotuladas por su supuesto y no por un nombre de saldo.
 *
 * @param {object} ref las celdas ya resueltas de la propia pestaña (referencias A1 absolutas)
 * @param {string} ref.total celda del total de disponibilidades (operativo: bancos y efectivo)
 * @param {string} ref.fecha celda de la fecha de ese total
 * @param {string} ref.invArs celda del saldo en pesos de la fila Balanz ARS del panel de cuentas
 * @param {string} ref.invUsd celda del saldo en pesos de la fila Balanz USD del panel de cuentas
 * @param {string} ref.invFecha celda de la fecha de la posición Balanz
 * @returns {Array<{clave:string,rotulo:string,valor:string,contexto:string,especie:'plata'|'texto'}>}
 */
export function tarjetas(ref) {
  const faltan = ['total', 'fecha', 'invArs', 'invUsd', 'invFecha', 'pisoSimple', 'pisoFecha'].filter((k) => !ref?.[k])
  // FALLA CERRADO. Una referencia vacía produciría `=` o `=N()+N()` — una celda en error en la primera
  // pantalla de la pestaña más mirada del archivo. Es barato romper acá y carísimo descubrirlo allá.
  if (faltan.length) throw new Error(`caja-tarjetas: faltan las referencias ${faltan.join(', ')}`)

  // ═══ EL IDIOMA ÚNICO ES EL MES (6ª directiva del dueño, 06/08 — la definitiva) ═══
  //
  // Textual: "el fix q quiero es q todas las tarjetas de caja hablen el mismo idioma de base, y q
  // las tarjetas sean una consecuencia perfecta de esto. la caja disponible es lo q tenemos en banco
  // y caja, lo comprometido es todo lo q hay q pagar en el mes − lo q ya se pagó, y las otras es lo
  // invertido y demás".
  //
  // Antes de esto la tarjeta LIBRE cambió CUATRO veces en un día (bancos−mes / +Balanz / −Balanz /
  // piso) y el dueño rechazó las cuatro — y el auditor de cierre rechazó la quinta por publicar el
  // peor caso sin decirlo. La lección no era la fórmula: era que cada tarjeta hablaba una ventana
  // distinta (hoy, 7 días, 30 días, el mes) y ninguna historia podía cerrar. Ahora las cinco hablan
  // AGOSTO, y la última es literalmente la suma de las otras: tengo + cobro − pago = termino.
  //
  // La que se fue es LIBRE: el dueño no la nombró en su definición final y en su lugar está lo que
  // faltaba ver — A COBRAR, la pata de ingresos que todas las versiones anteriores escondían. El
  // piso del recorrido (el mínimo día a día) sigue vivo en la escalera de al lado, que es su casa.
  // ═══ Y EL IDIOMA ÚNICO NO ALCANZABA: FALTABA SEPARAR LOS CONCEPTOS (16/08/2026) ═══
  //
  // Las cinco hablaban el mes, sí, pero la segunda metía DEUDA y PRESUPUESTO en un solo número.
  // `mesPago` (los tres estados de `NO_REAL` juntos) se parte en dos términos que NO se solapan y
  // cuya unión sigue siendo exactamente el viejo total: nada se perdió en la costura, y hay un test
  // que lo fija sobre las constantes, no sobre las fórmulas.
  const mesDeuda = terminoLibro({ signo: -1, estados: DEUDA, hasta: FIN_DE_MES, medida: 'magnitud' })
  const mesPlan = terminoLibro({ signo: -1, estados: PLAN, hasta: FIN_DE_MES, medida: 'magnitud' })
  // La parte de la DEUDA que nadie probó. Es un subconjunto del titular, con el mismo `hasta`: si se
  // definiera con una ventana propia podría dejar de ser una parte de lo que rotula.
  const sinProbar = terminoLibro({ signo: -1, estados: ['VENCIDO'], hasta: FIN_DE_MES, medida: 'magnitud' })
  const mesCobro = terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })
  // ═══ LA MISMA FRESCURA EN LAS DOS PUNTAS (orden del dueño, 07/08) ═══
  //
  // DISPONIBLE lee Compras EN VIVO (los pagos posteriores al corte se restan por fórmula), pero el
  // libro es una FOTO: una compra cargada después de la última regeneración no existe para
  // COMPROMETIDA. El dueño pagaba, la disponible bajaba, la comprometida ni se enteraba — y la
  // diferencia se la comía LIBRE ("no puede irse bajando la libre dispo", textual). Este término
  // suma en vivo las compras PENDIENTES que quedaron detrás de la frontera del libro: pendiente
  // nueva → entra acá hasta que la próxima regeneración la incorpore; pagada nueva → nunca pasa por
  // acá (ya salió del saldo, contarla sería el doble conteo de siempre).
  //
  // La frontera la trae el generador (la última fila de Compras que el libro incorporó). Sin ella
  // —una corrida vieja, una lectura caída— el término se OMITE y la tarjeta queda como era: falla
  // hacia el comportamiento anterior, no hacia un número inventado.
  const f0 = Number.isFinite(ref.fronteraCompras) ? ref.fronteraCompras + 1 : null
  let nuevas = null
  if (f0) {
    const colC = (c) => `Compras!$${c}$${f0}:$${c}$${f0 + 500}`
    // La fecha de caja (AD) puede venir como texto dd/mm/yyyy o como serial: el mismo doble camino
    // que ya usa el anexo de caja (DATEVALUE para el texto, N() para el serial).
    const fechaCaja = `IFERROR(DATEVALUE(${colC('AD')}&"");N(${colC('AD')}))`
    nuevas = `SUMPRODUCT((${colC('X')}="Pendiente")*(${fechaCaja}<${FIN_DE_MES})*(N(${colC('O')})-N(${colC('T')})))`
  }
  // Lo ya pagado del mes: para que el contexto muestre que los pagos salen de ESTA tarjeta.
  //
  // ═══ Y COMPARARLO CONTRA EL TITULAR ERA LA COMPARACIÓN QUE EL DUEÑO SEÑALÓ (16/08) ═══
  //
  // La frase decía *"de $191M pagaste $65M"*: a la izquierda, deuda + presupuesto; a la derecha,
  // pagos reales. Son dos cosas distintas y por eso el cuadro daba la sensación de que *"de repente
  // debemos mas en lo q falta del mes q lo q ya se ha pagado"* (textual). Lo pagado sigue publicado
  // —es el dato que muestra que los compromisos salen de esta tarjeta— pero ya no se lo presenta
  // como la resta de un total inventado: se publica solo, contra el titular que ahora sí es deuda.
  const pagadoMes = terminoLibro({ signo: -1, estados: ['REAL'], desde: 'EOMONTH(TODAY();-1)+1', hasta: FIN_DE_MES, medida: 'magnitud' })
  // ═══ EL ATRASO ARRASTRADO SE MUDÓ AL RÓTULO, Y SU CAUSA AL CONTEXTO (16/08/2026) ═══
  //
  // El 15/08 el dueño vio la tarjeta saltar de $55,6M a $125,9M y el contexto pasó a publicar el
  // término `atrasado` (lo impago con fecha anterior al 1° del mes) para explicarlo. Ese término se
  // fue de acá por dos razones, no por falta de lugar:
  //
  // 1. EL RÓTULO LO DICE MEJOR. Decía "FALTA PAGAR ESTE MES" sobre una suma sin `desde`, o sea que
  //    incluía todo lo atrasado: el rótulo mentía y el contexto salía a desmentirlo. "DEUDA ATRASADA
  //    Y DEL MES" describe la ventana real, y entonces no hay nada que aclarar abajo.
  // 2. EL "CUÁNDO" NO ERA LA PREGUNTA. Aquellos $54,6M eran seis quincenas de mayo, junio y julio que
  //    el libro veía impagas; publicar que eran viejas no decía lo importante, que es que **nadie
  //    probó que estén impagas**. Desde `estadoSinProbar` esas quincenas salen VENCIDO, y el contexto
  //    publica ese monto: la misma explicación del salto, dando la causa en vez de la fecha.
  //
  // El lugar que ocupaba lo toma el gasto planeado, que es lo que el dueño reclamó tres veces.
  // LA SUMA VA CON N(): la celda de una fila sin dato dice "" y "" no se suma — sin el N() la tarjeta
  // entera daría #VALUE! el día que falte una de las dos patas, y con él suma la que esté.
  const invertido = `N(${ref.invArs})+N(${ref.invUsd})`

  // ═══ LAS FILAS QUE SUMAN, CON SU MONTO AL LADO DE SU FECHA ═══
  //
  // La fecha más vieja y la plata que viene de esa fecha son LA MISMA lectura del panel: si vinieran
  // por dos parámetros distintos podrían contradecirse (avisar por una fila y sumar otra). Entra la
  // lista de celdas y de acá salen las dos expresiones, con la misma condición y el mismo umbral.
  const suman = (Array.isArray(ref.celdasQueSuman) ? ref.celdasQueSuman : []).filter((c) => c?.monto && c?.fecha)
  const fechaVieja = suman.length ? `MIN(${suman.map((c) => c.fecha).join(';')})` : ''
  // N() en el monto y no ISNUMBER: una fila sin saldo cargado aporta 0, no rompe la suma entera.
  const montoViejo = suman
    .map((c) => `IF(AND(ISNUMBER(${c.fecha});TODAY()-${c.fecha}>${DIAS_AVISO});N(${c.monto});0)`)
    .join('+')

  return [
    {
      clave: 'disponible',
      rotulo: 'CAJA DISPONIBLE',
      // NO SE RECALCULA: es la celda del total del bloque de cuentas, que ya vive unas filas abajo con
      // su detalle a la vista. Una segunda suma acá sería un número que puede diferir del de abajo.
      // Excluye Balanz: es la liquidez OPERATIVA — "lo q tenemos en banco y caja".
      valor: `=${ref.total}`,
      // LA FECHA QUE SE PUBLICA ES LA DEL TOTAL (un MAX) Y LA QUE AVISA ES LA MÁS VIEJA DE LAS FILAS
      // QUE SUMAN. Sin `celdasQueSuman` —una corrida vieja, una fila que desapareció— el aviso se
      // OMITE y la tarjeta queda como era: falla hacia el comportamiento anterior, nunca hacia una
      // fecha inventada. Es el mismo criterio que `fronteraCompras` en la tarjeta de al lado.
      //
      // EL DÍA DEL AVISO, "bancos y efectivo" LE CEDE EL LUGAR AL MONTO CONGELADO: la tarjeta mide
      // 342px (A+B) y las dos frases juntas se cortan. Qué entra en el número está escrito en la fila
      // del total tres renglones abajo ("Total disponibilidades ‖ percibido") y en la tarjeta
      // INVERTIDA; cuánta de esa plata es vieja no está escrito en ningún otro lado.
      contexto: `=IF(ISNUMBER(${ref.fecha});"al "&${dia(ref.fecha)}&`
        + `${fechaVieja ? avisoDeAtraso(fechaVieja, montoViejo) : '" · bancos y efectivo"'}`
        + `;"${ALERTA} el bloque de cuentas todavía no publicó su fecha")`,
      especie: 'plata',
    },
    {
      clave: 'comprometida',
      // ═══ EL RÓTULO CONTESTA LA PREGUNTA, NO NOMBRA EL CONCEPTO (13/08, textual) ═══
      //
      // El dueño: *"la tarjeta 'caja comprometida' no sé si es algo q tengo q cubrir o ya está
      // cubierto"*. El número era correcto y el rótulo lo desmentía: "CAJA …" nombra plata que se
      // TIENE, y "comprometida" se lee igual de bien como "reservada" que como "pendiente". Las dos
      // palabras juntas dicen "una parte de tu caja ya está apartada" — lo contrario de lo que la
      // celda mide, que es plata que TODAVÍA TIENE QUE SALIR y que hoy no está en ningún lado.
      //
      // Y "COMPROMETIDO" a secas tampoco servía: es el nombre de UNO de los tres estados del libro
      // ($15,2M de los $62,4M). Un rótulo que nombra un estado sobre un número que suma tres estados
      // es peor que uno vago: es falso, y verificable como falso.
      //
      // "FALTA PAGAR ESTE MES" fue la respuesta del 13/08 y duró hasta el 16/08.
      //
      // ═══ Y "FALTA PAGAR" SOBRE UN NÚMERO CON PRESUPUESTO ADENTRO ES FALSO (16/08, la tercera) ═══
      //
      // El dueño, textual: *"no estas tomando bien los conceptos q surgen de compras proveedores
      // cobranzas, y por ende las tarjetas estan todas mal, revisar y rehacer"*. Tenía razón por
      // tercera vez, y las dos correcciones anteriores habían tocado la frase. El rótulo prometía
      // deuda y el número traía $37.977.572 de PROYECTADO: materiales de obra estimados, "Estructura
      // esperada", "Recurrente esperado · Movistar", nafta y gasoil por cuota. **Nadie debe eso.**
      //
      // "DEUDA ATRASADA Y DEL MES" dice las dos cosas que el rótulo anterior fallaba:
      //   · DEUDA — el titular ya no tiene presupuesto adentro (`DEUDA`, no `NO_REAL`).
      //   · ATRASADA Y DEL MES — la ventana REAL de la suma, que es un `hasta` sin `desde`. El rótulo
      //     viejo decía "ESTE MES" sobre una suma que arrastraba meses anteriores, y por eso hacía
      //     falta una línea de contexto para desmentirlo.
      rotulo: 'DEUDA ATRASADA Y DEL MES',
      // LO QUE SE DEBE: egresos COMPROMETIDO + VENCIDO hasta fin de mes. Lo REAL queda afuera porque
      // ya salió del saldo del banco —restarlo otra vez lo contaría dos veces— y lo PROYECTADO queda
      // afuera porque todavía no es de nadie. MAGNITUD y no neto: "cuánto debo" es positivo.
      valor: nuevas ? `=${mesDeuda}+${nuevas}` : `=${mesDeuda}`,
      // ═══ EL TOTAL DEL MES VA EN LA FRASE, O LA TARJETA NO SE PUEDE LEER (07/08, textual) ═══
      //
      // "es comprometida y cuando se pagan los compromisos deben salir de ahí". Salen — pero sin el
      // total a la vista, el lector ve $60M pagados y $44M todavía comprometidos y concluye que nada
      // salió de ningún lado. La frase completa cierra sola: de $105M del mes, pagaste $61M, faltan
      // los $44M del titular. El total crece cuando entra un compromiso nuevo y el pagado crece al
      // pagar: el titular es la diferencia, siempre derivable a ojo. Corto a propósito: la versión
      // larga se TRUNCABA en la celda ("próx. 7 dí") y una frase cortada es peor que ninguna.
      //
      // ═══ Y SEGUÍA SIN ENTRAR (13/08) ═══
      //
      // La frase medía 45 caracteres y la tarjeta son 216px (C+D) ≈ 37: se cortaba igual. No se veía
      // porque el dueño ensanchó la C a mano hasta 252px para poder leerla — y la próxima corrida del
      // generador se la devuelve a 130. "Del mes" salió de la frase porque ahora vive en el RÓTULO, y
      // "7 días" quedó abreviado: el mismo dato, con su fecha y su saldo después, está tres columnas
      // a la derecha en el tramo "Esta semana" de la escalera.
      //
      // ═══ LA FRASE PUBLICA LO QUE EL TITULAR DEJÓ AFUERA (16/08) ═══
      //
      // Separar los conceptos sólo es honesto si el que sale del titular queda a la vista: si el plan
      // desapareciera de la tarjeta, esto no sería arreglar el número sino esconder $38,0M. Por eso
      // la PRIMERA cláusula, la que está todos los días, es el gasto planeado — nombrado "plan" para
      // que no pueda volver a leerse como deuda, y en la misma fila que la deuda para que la suma de
      // los dos siga siendo derivable a ojo.
      //
      // LA SEGUNDA CLÁUSULA ES LA DUDA, Y GANA CUANDO EXISTE. `VENCIDO` es la parte del titular que
      // nadie probó: estaba prevista para una fecha que ya pasó y nadie la concilió. Desde
      // `estadoSinProbar` ahí caen también las quincenas de jornales sin "Pagado el" que el extracto
      // no respalda — los $47.415.800 que el dueño no puede probar si están pagos. Publicarlas como
      // deuda cierta sin decir que son dudosas es exactamente lo que el Principio de Cierre prohíbe:
      // una limitación declarada bloquea el criterio que toca, y no declararla lo anula.
      //
      // NO SE RESTAN DEL TITULAR. O la plata ya salió y falta marcarla, o se debe: en las dos lecturas
      // hay que tenerla. Sacarla haría que la tarjeta dijera que hay plata que no hay — el error que
      // ya se publicó una vez ($51,9M de deuda que el dueño había cobrado hace meses).
      //
      // CUANDO NO HAY DUDA, EL LUGAR LO OCUPA LO PAGADO, que es la frase que pidió el dueño el 07/08
      // ("cuando se pagan los compromisos deben salir de ahí"). El umbral es $0,1M porque es el mínimo
      // que la frase sabe dibujar: por debajo diría "$0,0M sin probar", ruido con forma de alarma.
      //
      // MEDIDO CONTRA LOS 216px (C+D) ≈ 37 caracteres: la rama con duda dibuja 35, la otra 30. La
      // versión con las tres cláusulas medía 48 y se cortaba — y una frase cortada es peor que ninguna.
      contexto: `=IF(${sinProbar}>=100000;"+ "&${millones(mesPlan)}&"M plan · ${ALERTA} "&${millones(sinProbar)}&"M sin probar";`
        + `"+ "&${millones(mesPlan)}&"M plan · pagaste "&TEXT(${pagadoMes}/1000000;"$#,##0")&"M")`,
      especie: 'plata',
    },
    {
      clave: 'libre',
      // ═══ EL NÚMERO ESTABA BIEN; EL RÓTULO NO DECÍA QUÉ PREGUNTA CONTESTA (13/08) ═══
      //
      // El dueño: *"la 'libre disponibilidad' es negativo lo cual me confunde"*. Y con razón: la
      // celda compara UNA FOTO DE HOY (la caja que hay) contra EL ACUMULADO DE LO QUE FALTA DEL MES,
      // sin netear lo que se cobra en esos mismos días. Eso es un test de estrés —legítimo, y lo
      // definió él el 06/08: *"disponible es toda la plata q hay, comprometida es lo q hay q pagar
      // el resto de compromisos del mes, POR ENDE surge libre disponibilidad"*— pero "LIBRE
      // DISPONIBILIDAD" promete un saldo utilizable, y un saldo utilizable negativo se lee como
      // quiebra. El panel de al lado, que SÍ netea los cobros tramo por tramo, no perfora cero en
      // ningún día del mes.
      //
      // Y ADEMÁS EL NOMBRE YA ESTABA OCUPADO: "saldo de libre disponibilidad" es el término de ARCA
      // para el saldo de IVA a favor, y este mismo sistema lo usa con ese significado
      // (lib/iva-libre-disponibilidad.mjs, lib/iva-ddjj.mjs). Dos cosas distintas con el mismo
      // nombre adentro del mismo OS es exactamente lo que la realidad única prohíbe.
      //
      // EL RÓTULO NUEVO ES LA HIPÓTESIS QUE EL NÚMERO MIDE, y por eso el negativo deja de asustar:
      // "si no cobrás más este mes" ya avisa que es un supuesto y no un pronóstico. Se descartó
      // "BRECHA DEL MES SIN COBRAR": "sin cobrar" se puede leer pegado a "mes" o a "brecha", y una
      // brecha sigue sonando a agujero real. Éste nombra la condición, no el agujero — y su
      // contexto la desmiente con el monto.
      //
      // ES LA MISMA CIFRA QUE SALDO AL CIERRE EN EL ESCENARIO DE CERO COBRANZAS: las dos tarjetas
      // son el fin de mes bajo dos supuestos, y la de al lado publica el otro. Entre las dos, el
      // contexto de ésta es el puente exacto: −$40,7M + $160,8M = $120,1M.
      rotulo: 'SI NO COBRÁS MÁS ESTE MES',
      valor: '=N($A$3)-N($C$3)',
      // ═══ EL DATO QUE TRANQUILIZA, AL LADO DEL NÚMERO QUE ASUSTA — Y CON SU MONTO ═══
      //
      // Decía "se cubre con lo cobrado en el mes": cierto, genérico e inverificable. ¿Con cuánto?
      // El monto es el MISMO `mesCobro` que usa SALDO AL CIERRE —una sola definición de "lo que se
      // cobra en el mes" en toda la pestaña— así que no puede existir el día en que una tarjeta diga
      // que alcanza y la otra que no. Es fórmula viva sobre el libro: se mueve sola con cada
      // cobranza cargada, y no hay ningún número tipeado que se pueda quedar viejo.
      //
      // ═══ Y LA OTRA MITAD DEL SUPUESTO, QUE NO ESTABA ESCRITA (15/08) ═══
      //
      // El rótulo declara una sola pata de la hipótesis (no cobrás más) y la resta usa las dos: es
      // `disponible − TODO lo que falta pagar`, incluido el atraso de meses anteriores que la tarjeta
      // de al lado ahora publica. Con "al 31/08" en su lugar, el lector leía el número como el saldo
      // de fin de mes y no como el test de estrés que es. La fecha se va —la ventana ya la dice el
      // rótulo, y en 198px no entran las dos cosas— y entra la condición que faltaba.
      // ═══ Y EL ESCENARIO SE CONTRADECÍA A SÍ MISMO (16/08) ═══
      //
      // La resta apagaba los ingresos y dejaba el gasto PROYECTADO prendido: asumía cero cobranzas y
      // compraba igual los $15,6M de "materiales de obra proyectados" y la "Estructura esperada". Si
      // no entra plata, esos materiales no se compran. Un escenario tiene que ser internamente
      // consistente o no sirve para decidir, y éste medía un mundo que no puede existir.
      //
      // LA FÓRMULA NO CAMBIÓ Y ESO ES LO BUENO DEL ARREGLO: sigue siendo la resta de las dos tarjetas
      // vecinas, verificable con los ojos contra la fila. Lo que cambió es qué hay adentro de C3 — al
      // sacarle el plan a la deuda, el escenario se volvió coherente solo. Un arreglo que hubiera
      // metido un tercer término acá habría tapado el defecto en vez de sacarlo.
      //
      // "sin el plan" ES LA MITAD DEL SUPUESTO QUE FALTABA ESCRITA. El rótulo declara una pata (no
      // cobrás) y la resta usa las dos. Reemplaza a "pagás todo", que era cierto y ya no alcanza:
      // ahora importa MENOS qué se paga que qué NO se gasta.
      contexto: `="hay "&${millones(mesCobro)}&"M a cobrar · sin el plan"`,
      especie: 'plata',
    },
    {
      clave: 'invertido',
      rotulo: 'CAJA INVERTIDA',
      // REFERENCIA A LAS FILAS BALANZ DEL PANEL, no una segunda fuente: si mañana la posición se
      // reemplaza por el extracto de Balanz, la tarjeta cambia con la grilla sin tocar este archivo.
      valor: `=${invertido}`,
      // "liquidez T+1": la naturaleza de lo invertido, como en el panel de invested balances de JPM —
      // está colocado en una comitente y rescatarlo tarda un día hábil, no es plata de HOY.
      //
      // ═══ Y CUÁNDO ESTÁ VIEJA, LA ANTIGÜEDAD LE GANA EL LUGAR A LA NATURALEZA (14/08/2026) ═══
      //
      // Estos $44.905.290 son el aporte del 05/08 probado por extracto del Santander: la posición real
      // de la comitente nunca llegó (gap declarado en banco-santander.mjs). Nueve días después el
      // cuadro los sigue publicando como si fueran de hoy. "liquidez T+1" es cierto todos los días y
      // por eso no informa nada un día como éste; los días que llevan encima cambian la decisión —con
      // el dólar movido, un aporte en USD valuado a nueve días no es el número con el que se decide.
      //
      // REEMPLAZA, NO SE SUMA: la tarjeta mide 202px (G+H) y la frase completa ya rozaba el corte. Un
      // texto truncado es peor que ninguno, y esto ya se pagó dos veces en esta misma fila de tarjetas.
      // Medido con el modelo del test: con "hace" son ≈213px y se corta; sin él, ≈184px.
      //
      // Y SIN "hace" NO ES SÓLO POR EL ANCHO: `formulaAntiguedad` —la columna "Antigüedad" que el
      // dueño ya reconoce, y que él mismo señaló como el patrón bueno— escribe exactamente
      // `▲ N días`. Dos formas de decir la misma antigüedad en el mismo archivo se leen como dos cosas.
      //
      // ═══ "a mano" ES AHORA UNA CONDICIÓN PERMANENTE, NO UN ATRASO (15/08/2026) ═══
      //
      // El dueño ordenó apagar el navegador de Balanz de la VM y quedó apagado (`echegaray-balanz-*`,
      // stopped + disabled). No hay ninguna corrida futura que vaya a refrescar estas dos filas: la
      // posición entra cuando él la pega, y sólo cuando él la pega. Una tarjeta que sólo dice la
      // antigüedad promete, por omisión, que alguien la va a actualizar; ésta dice de dónde viene el
      // dato, todos los días, y por eso "a mano" está en las TRES ramas y no sólo en la de alarma.
      //
      // "▲ 10d" Y NO "▲ 10 días" ES POR LOS 202px (G+H): la fila de tarjetas ya abrevia igual en
      // "7d $97,8M" de la tarjeta COMPROMETIDA, así que la abreviatura no es nueva en este renglón.
      contexto: `=IF(NOT(ISNUMBER(${ref.invFecha}));"Balanz · a mano · sin fecha";"Balanz · a mano al "&${dia(ref.invFecha)}`
        + `&IF(TODAY()-${ref.invFecha}>${DIAS_AVISO};" ${ALERTA} "&TEXT(TODAY()-${ref.invFecha};"0")&"d";" · T+1"))`,
      especie: 'plata',
    },
    {
      clave: 'cierre',
      rotulo: 'SALDO AL CIERRE',
      // LA CONSECUENCIA PERFECTA, por construcción: referencia a las TRES tarjetas hermanas (fila 3,
      // columnas A, E y C — disponible, a cobrar, comprometida), no una cuarta suma sobre el libro.
      // Si cualquiera de las tres cambia, ésta cambia con ellas y la identidad no puede romperse.
      // Lo invertido NO entra: una comitente no paga un cheque, y el dueño lo quiso aparte.
      // LA CONSECUENCIA: disponible (A3) − comprometida (C3) + lo que se cobra en el mes. Los dos
      // primeros por referencia a sus tarjetas; los cobros con la misma suma del libro que usa todo
      // el archivo — y el contexto los publica, para que la identidad se lea entera.
      // ═══ EL CIERRE Y LA TARJETA DEL MEDIO SON EL MISMO NÚMERO EN DOS ESCENARIOS ═══
      //
      // Decía "la libre al 31/08 cobrando lo proyectado", y dos cosas quedaron mal el 13/08: "la
      // libre" pasó a nombrar una tarjeta que ya no se llama así, y la frase medía 40 caracteres
      // contra los 162px de la tarjeta más angosta (I+J) ≈ 28 — se cortaba en "cobrando lo pro".
      //
      // Ahora las dos se leen como el par que son: la del medio dice con cuánto termina el mes SI NO
      // COBRA NADA MÁS, y ésta con cuánto termina COBRANDO TODO. Misma cuenta, los dos extremos. La
      // cláusula condicional se conserva porque sin ella el número se lee como plata garantizada, y
      // no lo es: la fecha sigue siendo calculada, así que la frase no envejece.
      // ═══ Y EL CIERRE TENÍA EL ERROR SIMÉTRICO (16/08) ═══
      //
      // Si la tarjeta del medio apaga los ingresos y por lo tanto NO gasta el plan, ésta —que cobra
      // todo— tiene que gastarlo: con $151,8M entrando, los materiales se compran. Cobrar los $151,8M
      // y no descontar los $38,0M que se van a gastar publica $38,0M de plata que no va a estar. Es el
      // mismo descuido del otro lado, y salía gratis mientras el plan viajaba escondido en C3.
      //
      // LA IDENTIDAD, ENTERA: disponible − deuda + cobros − plan. Los dos primeros por referencia a
      // sus tarjetas (A3 y C3), los otros dos con los términos únicos del libro. Las cuatro cifras
      // están publicadas en la fila —el plan en el contexto de la deuda, los cobros en el de al
      // lado— así que el lector puede rehacer la cuenta sin abrir nada.
      valor: `=N($A$3)-N($C$3)+${mesCobro}-${mesPlan}`,
      // "cobrando y gastando" declara los DOS supuestos, que es lo que la vuelve el par exacto de la
      // tarjeta del medio: aquélla no cobra y no gasta, ésta cobra y gasta. Sin la cláusula el número
      // se leería como plata garantizada, y no lo es. La fecha va sin el "al " que llevaba antes: los
      // 162px (I+J) ≈ 28 caracteres no dan para las dos cosas y la preposición es lo prescindible —
      // "31/08 cobrando y gastando" dibuja 25.
      contexto: `=${dia('EOMONTH(TODAY();0)')}&" cobrando y gastando"`,
      especie: 'plata',
    },
  ]
}
