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
 * LAS CUATRO TARJETAS, EN ORDEN. Puras: devuelven fórmulas, no tocan nada.
 *
 * El orden es el del tesorero de JPM, y no se negocia: cuánto puedo pagar HOY (operativo) → cuánto
 * tengo colocado (invertido, con su naturaleza) → cuánto ya está comprometido → con cuánto termino el
 * mes. Leído de izquierda a derecha cuenta una historia; en cualquier otro orden son cuatro números
 * sueltos.
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
      contexto: `=IF(ISNUMBER(${ref.fecha});"al "&${dia(ref.fecha)}&" · bancos y efectivo";"⚠ el bloque de cuentas todavía no publicó su fecha")`,
      especie: 'plata',
    },
    {
      clave: 'comprometida',
      rotulo: 'CAJA COMPROMETIDA',
      // "TODO LO QUE HAY QUE PAGAR EN EL MES − LO QUE YA SE PAGÓ": egresos no-REAL hasta fin de mes
      // (lo REAL ya salió del saldo del banco — restarlo otra vez lo contaría dos veces), más lo
      // vencido impago (sin `desde`). MAGNITUD y no neto: "cuánto debo" es positivo. La urgencia no
      // se pierde: lo que vence esta semana queda en el contexto.
      valor: `=${mesPago}`,
      contexto: `="del mes · próx. 7 días: "&TEXT(${venceEn7}/1000000;"$#,##0.0")&"M"`,
      especie: 'plata',
    },
    {
      clave: 'libre',
      rotulo: 'LIBRE DISPONIBILIDAD',
      // ═══ LA DEFINICIÓN ES DEL DUEÑO, TEXTUAL (06/08, la que cerró todas las iteraciones) ═══
      //
      // "disponible es toda la plata q hay, comprometida es lo q hay q pagar el resto de
      // compromisos del mes, POR ENDE surge libre disponibilidad". La resta de las dos tarjetas de
      // al lado, por referencia — el lector la verifica con los ojos, que fue la regla que ninguna
      // versión anterior cumplía del todo.
      //
      // PUEDE DAR NEGATIVO y no es un defecto: significa que el resto del mes no se cubre con la
      // caja de hoy sino con las cobranzas que entran en el mes — y el contexto lo dice en ese
      // caso, para que el paréntesis rojo no se lea como quiebra. La historia la termina SALDO AL
      // CIERRE, que suma esas cobranzas. El mínimo día-a-día del recorrido (el piso) sigue vivo en
      // la fila de cierre de la escalera y su alerta.
      valor: '=N($A$3)-N($C$3)',
      contexto: '=IF(N($A$3)-N($C$3)>=0;"disponible − comprometida del mes";"se cubre con lo cobrado en el mes")',
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
      valor: `=N($A$3)-N($C$3)+${mesCobro}`,
      contexto: `="cobrando "&TEXT(${mesCobro}/1000000;"$#,##0.0")&"M proyectados del mes"`,
      especie: 'plata',
    },
  ]
}
