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

import { terminoLibro, formulaLibro } from './libro-sumas.mjs'

/**
 * LOS ESTADOS QUE TODAVÍA NO PASARON POR EL BANCO.
 *
 * `REAL` queda AFUERA a propósito en toda proyección: un movimiento real ya está adentro del saldo
 * que publica el bloque de cuentas (por el extracto, o por la línea de movimientos posteriores al
 * corte). Sumarlo otra vez al proyectar sería contar la misma plata dos veces, que es el defecto más
 * caro y más silencioso de este archivo.
 */
export const NO_REAL = Object.freeze(['COMPROMETIDO', 'PROYECTADO', 'VENCIDO'])

/** El horizonte de la tarjeta de proyección, en días. Un mes es el ciclo con el que se decide acá. */
export const HORIZONTE = 30

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
  const faltan = ['total', 'fecha', 'invArs', 'invUsd', 'invFecha'].filter((k) => !ref?.[k])
  // FALLA CERRADO. Una referencia vacía produciría `=` o `=N()+N()` — una celda en error en la primera
  // pantalla de la pestaña más mirada del archivo. Es barato romper acá y carísimo descubrirlo allá.
  if (faltan.length) throw new Error(`caja-tarjetas: faltan las referencias ${faltan.join(', ')}`)

  const ventana = { desde: 'TODAY()', hasta: `TODAY()+${HORIZONTE}`, estados: NO_REAL }
  const entra30 = terminoLibro({ ...ventana, signo: 1, medida: 'magnitud' })
  const sale30 = terminoLibro({ ...ventana, signo: -1, medida: 'magnitud' })
  // ═══ COMPROMETIDA = LAS OBLIGACIONES DEL MES, NO SÓLO LOS CHEQUES (06/08, corrección del dueño) ═══
  //
  // Con estados ['COMPROMETIDO'] la tarjeta decía $7,7M a principio de mes — sólo los instrumentos
  // firmados. La quincena, las cargas sociales y los impuestos viven como PROYECTADO en el libro y
  // quedaban afuera, siendo obligaciones que igual hay que cubrir. El dueño: "no puede ser que siendo
  // principio de mes, ya estemos con tan poco gasto proyectado". La definición vigente: TODO egreso
  // no-REAL con vencimiento hasta fin de MES — quincena, cargas, impuestos, cheques y compras del mes,
  // más lo vencido que sigue impago (sin `desde`: un vencido de julio sigue siendo plata a cubrir).
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
      // Desde el 06/08 ese total EXCLUYE Balanz: es la liquidez OPERATIVA — bancos y efectivo, lo que
      // puede pagar un cheque mañana.
      valor: `=${ref.total}`,
      contexto: `=IF(ISNUMBER(${ref.fecha});"al "&${dia(ref.fecha)}&" · bancos y efectivo";"⚠ el bloque de cuentas todavía no publicó su fecha")`,
      especie: 'plata',
    },
    {
      clave: 'invertido',
      rotulo: 'INVERTIDO',
      // REFERENCIA A LAS FILAS BALANZ DEL PANEL, no una segunda fuente: si mañana la posición se
      // reemplaza por el extracto de Balanz, la tarjeta cambia con la grilla sin tocar este archivo.
      valor: `=${invertido}`,
      // "liquidez T+1": la naturaleza de lo invertido, como en el panel de invested balances de JPM —
      // está colocado en una comitente y rescatarlo tarda un día hábil, no es plata de HOY.
      contexto: `=IF(ISNUMBER(${ref.invFecha});"Balanz · al "&${dia(ref.invFecha)}&" · liquidez T+1";"Balanz · liquidez T+1")`,
      especie: 'plata',
    },
    {
      clave: 'comprometida',
      rotulo: 'CAJA COMPROMETIDA',
      // MAGNITUD Y NO NETO: lo comprometido se lee como "cuánto debo", un número positivo. Con `neto`
      // saldría en negativo por el signo del egreso y la tarjeta diría "-$43.380.472 comprometidos",
      // que se lee como si la deuda fuera a favor.
      valor: formulaLibro({ signo: -1, estados: NO_REAL, hasta: 'EOMONTH(TODAY();0)+1', medida: 'magnitud' }),
      contexto: `="de eso "&${plata(venceEn7)}&" vence antes del "&${dia('TODAY()+7')}`,
      especie: 'plata',
    },
    {
      clave: 'proyectada',
      rotulo: `CAJA PROYECTADA · ${HORIZONTE} DÍAS`,
      // PARTE DEL TOTAL OPERATIVO: proyecta con qué liquidez de pago se termina el mes. Lo invertido
      // no entra — no cubre un vencimiento hasta que se rescata, y ese rescate sería un movimiento.
      valor: `=${ref.total}+${terminoLibro(ventana)}`,
      // EN MILLONES, NO EN PESOS: el auditor de pantalla midió 48 caracteres en una columna de 38.
      // Un contexto que se corta no informa; el detalle exacto vive en la escalera de al lado.
      contexto: `="al "&${dia(`TODAY()+${HORIZONTE}`)}&" · +"&TEXT(${entra30}/1000000;"$#,##0.0")&"M · -"&TEXT(${sale30}/1000000;"$#,##0.0")&"M"`,
      especie: 'plata',
    },
  ]
}
