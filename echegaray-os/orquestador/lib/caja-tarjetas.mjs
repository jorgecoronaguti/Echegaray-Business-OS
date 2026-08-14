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

/**
 * LOS ESTADOS QUE TODAVÍA NO PASARON POR EL BANCO.
 *
 * `REAL` queda AFUERA a propósito en toda proyección: un movimiento real ya está adentro del saldo
 * que publica el bloque de cuentas (por el extracto, o por la línea de movimientos posteriores al
 * corte). Sumarlo otra vez al proyectar sería contar la misma plata dos veces, que es el defecto más
 * caro y más silencioso de este archivo.
 */
export const NO_REAL = Object.freeze(['COMPROMETIDO', 'PROYECTADO', 'VENCIDO'])

/** El horizonte histórico de la proyección, en días. Lo siguen usando consumidores fuera de acá. */
export const HORIZONTE = 30
/** La frontera del idioma único: fin del mes corriente, EXCLUIDA (mismo criterio `hasta` del repo). */
export const FIN_DE_MES = 'EOMONTH(TODAY();0)+1'

/** Plata dibujada dentro de una frase. Sin decimales: en una línea de contexto los centavos son ruido. */
const plata = (e) => `TEXT(${e};"$#,##0")`
/** Una fecha dentro de una frase. dd/mm y no dd/mm/yyyy: el año se sobreentiende y ocupa lugar. */
const dia = (e) => `TEXT(${e};"dd/mm")`

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
  const mesPago = terminoLibro({ signo: -1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })
  const mesCobro = terminoLibro({ signo: 1, estados: NO_REAL, hasta: FIN_DE_MES, medida: 'magnitud' })
  const venceEn7 = terminoLibro({ signo: -1, estados: NO_REAL, hasta: 'TODAY()+7', medida: 'magnitud' })
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
  const pagadoMes = terminoLibro({ signo: -1, estados: ['REAL'], desde: 'EOMONTH(TODAY();-1)+1', hasta: FIN_DE_MES, medida: 'magnitud' })
  // LA SUMA VA CON N(): la celda de una fila sin dato dice "" y "" no se suma — sin el N() la tarjeta
  // entera daría #VALUE! el día que falte una de las dos patas, y con él suma la que esté.
  const invertido = `N(${ref.invArs})+N(${ref.invUsd})`

  return [
    {
      clave: 'disponible',
      rotulo: 'CAJA DISPONIBLE',
      // NO SE RECALCULA: es la celda del total del bloque de cuentas, que ya vive unas filas abajo con
      // su detalle a la vista. Una segunda suma acá sería un número que puede diferir del de abajo.
      // Excluye Balanz: es la liquidez OPERATIVA — "lo q tenemos en banco y caja".
      valor: `=${ref.total}`,
      contexto: `=IF(ISNUMBER(${ref.fecha});"al "&${dia(ref.fecha)}&" · bancos y efectivo";"${ALERTA} el bloque de cuentas todavía no publicó su fecha")`,
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
      // "FALTA PAGAR ESTE MES" es la definición del propio dueño (06/08: *"lo comprometido es todo
      // lo q hay q pagar en el mes − lo q ya se pagó"*) escrita como respuesta. La palabra
      // "comprometido" sigue viva donde es un dato y no un rótulo: el estado del libro, el anexo.
      rotulo: 'FALTA PAGAR ESTE MES',
      // "TODO LO QUE HAY QUE PAGAR EN EL MES − LO QUE YA SE PAGÓ": egresos no-REAL hasta fin de mes
      // (lo REAL ya salió del saldo del banco — restarlo otra vez lo contaría dos veces), más lo
      // vencido impago (sin `desde`). MAGNITUD y no neto: "cuánto debo" es positivo. La urgencia no
      // se pierde: lo que vence esta semana queda en el contexto.
      valor: nuevas ? `=${mesPago}+${nuevas}` : `=${mesPago}`,
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
      contexto: `="de "&TEXT((${pagadoMes}+N($C$3))/1000000;"$#,##0")&"M pagaste "&TEXT(${pagadoMes}/1000000;"$#,##0")&"M · 7d "&TEXT(${venceEn7}/1000000;"$#,##0.0")&"M"`,
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
      contexto: `="hay "&TEXT(${mesCobro}/1000000;"$#,##0.0")&"M a cobrar al "&${dia('EOMONTH(TODAY();0)')}`,
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
      contexto: `=IF(ISNUMBER(${ref.invFecha});"Balanz · al "&${dia(ref.invFecha)}&" · liquidez T+1";"Balanz · liquidez T+1")`,
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
      valor: `=N($A$3)-N($C$3)+${mesCobro}`,
      contexto: `="al "&${dia('EOMONTH(TODAY();0)')}&" cobrando todo"`,
      especie: 'plata',
    },
  ]
}
