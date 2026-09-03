// LOS CUATRO GRÁFICOS DE LA PORTADA DE CAJA — UNO POR PREGUNTA, NINGUNO DECORATIVO.
//
// ═══ CUÁLES, Y POR QUÉ ESOS CUATRO (05/08/2026) ═══
//
// El dueño los eligió: *"evolución de caja · proyección futura de caja · concentración de pagos y de
// cobranzas"*. Los cuatro contestan una pregunta distinta y ninguno repite lo que ya dice una tabla:
//
//   · EVOLUCIÓN (60 días para atrás) → ¿la caja viene subiendo o bajando? Es la única lectura de la
//     pestaña que mira el pasado, y sin ella no se puede saber si el saldo de hoy es bueno o malo.
//   · PROYECCIÓN (60 días para adelante) → ¿dónde está el pozo? La escalera lo dice por tramos; la
//     curva lo dice por día, que es la precisión con la que se decide un plazo fijo.
//   · CONCENTRACIÓN DE PAGOS → si tres proveedores son el 80% de lo que sale, la negociación de
//     plazos tiene tres llamados y no treinta.
//   · CONCENTRACIÓN DE COBRANZAS → si un cliente es la mitad de lo que entra, el riesgo de caja no es
//     financiero: es comercial.
//
// ═══ Y LA EVOLUCIÓN SE REEMPLAZÓ POR EL PUNTO DE EQUILIBRIO (06/08/2026) ═══
//
// Orden del dueño: *"mostrar en todo el año ingresos vs egresos, para determinar el punto de
// equilibrio"*. Ocupa el mismo lugar —arriba a la izquierda, el primero que se lee— y contesta una
// pregunta que la curva de saldo no podía: la evolución mostraba CUÁNTO HAY, y ésta muestra si lo que
// entra alcanza para lo que sale. Un saldo que baja despacio y un mes que se financia con la caja
// vieja se ven igual en una curva de saldo; acá se ven distinto, porque el rojo pasa al azul.
//
// La serie del pasado sigue existiendo en el anexo (`ROTULOS.historia`): se dejó de DIBUJAR, no se
// borró. El dato es del dueño y él no pidió borrarlo.
//
//   · EQUILIBRIO (los doce meses del año) → ¿el año se paga solo? Dos curvas, lo que entra y lo que
//     sale, y el mes donde se cruzan.
//
// ═══ NINGUNO TIENE DATOS PROPIOS ═══
//
// Los cuatro leen rangos de `_CAJA_ANEXO` que son fórmulas sobre `_MOVIMIENTOS` (ver
// lib/caja-anexo-series.mjs). Un gráfico alimentado por su propio cálculo es la forma más elegante de
// tener dos verdades, y esta pestaña ya pagó $41,7M por tener dos definiciones de lo mismo.
//
// ═══ Y SE BORRAN TODOS LOS DE LA PESTAÑA ANTES DE DIBUJAR ═══
//
// `addChart` SIEMPRE agrega: no existe "crear o actualizar". Sin borrar primero, la corrida de cada
// dos horas apila doce gráficos por día sobre la misma celda.
//
// LA REGLA CAMBIÓ Y SE DECLARA: antes se borraban sólo los PROPIOS (los que llevaban la marca ⟡) para
// no tocar el que dibujara el dueño. Ahora se borran TODOS los de CAJA, por orden explícita del dueño
// —*"eliminá TODOS los actuales de la pestaña"*— y porque el rediseño lo obliga: cualquier gráfico
// anterior apunta a filas de un layout que ya no existe, así que dibujaría una curva perfecta de datos
// equivocados. Un gráfico huérfano que sigue pintando algo que ya no significa nada es peor que uno
// que falta. Esto vale para CAJA, que es íntegramente generada, y no es un permiso general.

import {
  COL, DIAS_NECESIDAD, DIAS_PROYECCION, DIAS_TOP, TOP_N,
} from './caja-anexo-series.mjs'
import { COL_NECESIDAD, SALIDAS } from './caja-necesidad-baldes.mjs'

/**
 * DÓNDE SE ANCLAN. Los gráficos flotan, pero el ANCLA es una celda REAL: si la hoja no llega a esa
 * fila o a esa columna, `addChart` devuelve 400 y el lote entero se cae.
 *
 * VAN DEBAJO DE LA GRILLA Y NO A SU DERECHA. La portada mide veinte filas y tiene que entrar entera
 * en una pantalla: un gráfico a la derecha obliga a scrollear en horizontal, que es el peor eje para
 * leer. Debajo se leen en el orden natural —primero los cinco números, después el detalle, después
 * las curvas— y no le roban ni una fila a la portada.
 */
export const FILA_ANCLA = 22
export const COL_ANCLA = 0
/** El alto y el ancho de cada uno. Dos por fila: los cuatro entran en 1.120px, el ancho de la grilla. */
const ANCHO_PX = 552
// 284 y no 300: las filas de CAJA miden 20px, así que un bloque de 15 filas mide 300px justos y un
// gráfico de 300 quedaba PEGADO borde con borde al de abajo (reclamo del dueño, 02/09). Con 284
// quedan 16px de aire entre bloques sin mover ninguna ancla.
const ALTO_PX = 284
/**
 * FILAS DE GRILLA QUE OCUPA UN BLOQUE VERTICAL. Cada bloque cuelga de su PROPIA celda ancla (no se
 * apila por offset — ver `base`). Una fila vacía de la grilla mide ~21px; un gráfico de 300px entra en
 * ~15 filas. Con tres bloques (necesidad, efectivo/banco, y la fila de los dos de media anchura) las
 * anclas caen en rowIndex 22, 37 y 52 — y la pestaña CAJA tiene 53 filas, así que la última EXISTE sin
 * tener que agrandar la grilla. Los gráficos flotan y se extienden más abajo del borde, que está bien.
 */
const FILAS_POR_BLOQUE = 15
/**
 * LA ÚLTIMA FILA-ANCLA que puede usar el layout: tres bloques verticales (necesidad, efectivo/banco,
 * y la fila de los dos de media anchura). El generador tiene que garantizar que la hoja LLEGUE a esta
 * fila, o `addChart` sobre una celda inexistente devuelve 400 y se cae el lote entero.
 */
export const FILA_ANCLA_MAX = FILA_ANCLA + 2 * FILAS_POR_BLOQUE

/**
 * HASTA QUÉ FILA TIENE QUE LLEGAR LA HOJA PARA QUE EL EDITOR NO ENCOJA EL ÚLTIMO BLOQUE.
 *
 * Medido el 02/09/2026 con el dueño mirando: el PDF deja que un gráfico flote más abajo del borde
 * de la hoja, pero el EDITOR VIVO lo sube hasta que entre — el bloque 3 anclado en la fila 52 de
 * una hoja de 53 filas se dibujaba en la fila 39, tapando al bloque 2. La hoja tiene que llegar
 * hasta el final del último bloque, no hasta su ancla.
 */
export const FILA_FINAL_DE_GRAFICOS = FILA_ANCLA_MAX + FILAS_POR_BLOQUE

/** El prefijo que marca un gráfico como PROPIO. Se conserva para poder reconocerlos en el archivo. */
export const MARCA = '⟡ '
export const TITULO_EQUILIBRIO = `${MARCA}Ingresos vs egresos por mes — punto de equilibrio`
export const TITULO_PROYECCION = `${MARCA}Proyección de la caja`
export const TITULO_PAGOS = `${MARCA}Concentración de pagos`
export const TITULO_COBRANZAS = `${MARCA}Concentración de cobranzas`
export const TITULO_NECESIDAD = `${MARCA}¿Alcanza la caja? — qué sale cada día y qué saldo queda`
export const TITULO_EFECTIVO_BANCO = `${MARCA}Dónde va a estar la plata — efectivo vs banco`

// La misma paleta que la pestaña: tinta, gris apagado y UN acento.
const INK = { red: 0.10, green: 0.13, blue: 0.20 }
const GRIS = { red: 0.62, green: 0.63, blue: 0.65 }
const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
// EL ROJO ENTRA, Y SÓLO PARA UNA COSA. La regla anterior era no usarlo —en un gráfico de saldo todo
// negativo se pintaría de rojo y el rojo dejaría de avisar—. Acá el rojo no marca un negativo: marca
// LA SALIDA de plata, una serie entera y una sola. Es apagado a propósito: un rojo saturado grita en
// los doce meses, y lo que tiene que gritar es el mes donde le pasa por arriba al azul.
const ROJO = { red: 0.60, green: 0.24, blue: 0.22 }
// EL OCRE ERA UN LITERAL ADENTRO DE LA LISTA DE COLORES; se nombra porque ahora la lista es un mapa.
const OCRE = { red: 0.45, green: 0.40, blue: 0.30 }
// Y EL GRIS CLARO ES EL DE LO QUE YA PASÓ. Un color apagado no es decoración: en esta pila significa
// "esto no se decide", y por eso es el único que no está en la escala de la paleta viva.
const GRIS_CLARO = { red: 0.85, green: 0.85, blue: 0.85 }
// LAS DOS MITADES DEL SALDO DEL PLAN: verde el efectivo, celeste el banco. Distintos del azul del plan
// (ACENTO) y del rojo del piso, para que las cuatro curvas se lean sin confundirse.
const VERDE = { red: 0.18, green: 0.49, blue: 0.34 }
const CELESTE = { red: 0.25, green: 0.52, blue: 0.66 }

const rango = (sheetId, f0, f1, c0, c1) => ({ sheetId, startRowIndex: f0 - 1, endRowIndex: f1, startColumnIndex: c0 - 1, endColumnIndex: c1 })
/**
 * LA FUENTE DE UNA SERIE. En un `basicChart`, `domain` y `series` reciben ESTO directamente:
 * envolverlo en `{ data: … }` —como sí hace un waterfall o un pie— devuelve un 400 con "Unknown name
 * data" y el lote entero se cae. Costó una corrida contra el archivo real descubrirlo.
 */
const fuente = (...rangos) => ({ sourceRange: { sources: rangos } })
const texto = (size, color = GRIS) => ({ fontFamily: 'Arial', fontSize: size, foregroundColor: color })

/** El esqueleto común. Cuatro gráficos con cuatro estilos serían cuatro productos distintos. */
function base(titulo, subtitulo, basicChart, sheetId, posicion) {
  return {
    addChart: {
      chart: {
        spec: {
          title: titulo,
          // El subtítulo dice QUÉ SE DECIDE mirándolo. Un gráfico sin pregunta es decoración.
          subtitle: subtitulo,
          titleTextFormat: { ...texto(12, INK), bold: true },
          subtitleTextFormat: texto(9),
          fontName: 'Arial',
          // Fondo blanco explícito: el default hereda el de la hoja y con la cuadrícula oculta queda gris.
          backgroundColor: { red: 1, green: 1, blue: 1 },
          basicChart,
        },
        position: {
          overlayPosition: {
            // CADA GRÁFICO A SU PROPIA FILA-ANCLA, NO APILADOS POR OFFSET (01/09/2026). Cuatro gráficos
            // colgados de la MISMA celda y separados sólo por `offsetYPixels` rasterizan bien en el PDF
            // de export, pero el editor VIVO de Google COLAPSA los que quedan uno debajo del otro a la
            // misma columna: mostraba tres de los cuatro y el de «efectivo vs banco» no aparecía nunca.
            // Los de media anchura sí se veían porque comparten fila pero difieren en X (van al lado).
            // Por eso ahora el ancla es una fila REAL distinta por bloque y `offsetY` queda en 0.
            anchorCell: { sheetId, rowIndex: posicion.filaAncla ?? FILA_ANCLA, columnIndex: COL_ANCLA },
            offsetXPixels: posicion.x, offsetYPixels: posicion.y ?? 0,
            widthPixels: posicion.ancho ?? ANCHO_PX, heightPixels: ALTO_PX,
          },
        },
      },
    },
  }
}

/**
 * ═══ LA NECESIDAD DIARIA (20/08/2026) ═══
 *
 * El dueño lo pidió así: *"que el gráfico me indique los rubros que me van a ir haciendo descargos de
 * dinero —cheques, proveedores, sueldos, cargas sociales, impuestos— con montos y fechas, y poner las
 * cobranzas totales en el mismo gráfico para ver si cubrimos día a día esa necesidad"*.
 *
 * Columnas APILADAS —lo que sale, abierto por rubro— y el saldo como LÍNEA. El día en que la línea
 * cruza el cero es el día que hay que ir a resolver, y se ve sin leer un número. Un total del mes no
 * contesta esto: la plata no falta en el mes, falta el martes.
 *
 * Es COMBO y no COLUMN porque `type` por serie —las líneas de saldo sobre las barras— sólo lo
 * respeta ese tipo de gráfico; con COLUMN la API acepta el request y dibuja todo como barras.
 *
 * ═══ LA PRIMERA BARRA NO ES NECESIDAD: ES LO QUE YA SALIÓ (28/08/2026) ═══
 *
 * *"Necesito que el gráfico muestre la información tal cual es, en tiempo y forma"*. La pila arranca
 * con lo EJECUTADO del día —`REAL`, plata que ya pasó por el banco— en GRIS CLARO, y sigue con los
 * cinco rubros de lo que FALTA PAGAR, en la paleta de siempre. El gris claro es deliberado: lo que
 * ya salió no admite decisión, así que tiene que leerse como piso y no competir por la atención con
 * lo que sí hay que ir a conseguir.
 *
 * Y LO QUE SE COMPARA CONTRA EL SALDO SON LAS OTRAS CINCO, no la pila entera: las dos curvas parten
 * de `CAJA_TOTAL_DISPONIBLE`, que YA tiene descontada la barra gris. Sumarla otra vez sería pedir dos
 * veces la misma plata. Por eso la barra gris no mueve ninguna de las dos líneas — y no es un olvido,
 * es la aritmética de la pregunta. Ver `saldoSinCobrar` en caja-anexo-series.mjs.
 */
function necesidadDiaria({ titulo, subtitulo, sheetId, anexo, rango: r, posicion }) {
  const col = (c) => rango(anexo, r.f0 - 1, r.f1, c, c)
  // UN COLOR POR BALDE, EN EL ORDEN DE `SALIDAS`. El gris claro es el de lo ejecutado: ver arriba.
  const COLORES = { ejecutado: GRIS_CLARO, cheques: GRIS, proveedores: INK, sueldos: ACENTO, cargas: OCRE, impuestos: ROJO }
  return base(titulo, subtitulo, {
    chartType: 'COMBO',
    stackedType: 'STACKED',
    legendPosition: 'BOTTOM_LEGEND',
    headerCount: 1,
    domains: [{ domain: fuente(col(COL_NECESIDAD.dia)) }],
    series: [
      // Las salidas del día, apiladas. Eje IZQUIERDO, en la escala del día. Las columnas las cuenta
      // `COL_NECESIDAD` sobre la misma lista que las escribió: acá no se tipea un número de columna.
      ...COL_NECESIDAD.salidas.map((c, i) => ({
        series: fuente(col(c)), targetAxis: 'LEFT_AXIS', type: 'COLUMN', color: COLORES[SALIDAS[i].clave] ?? GRIS,
      })),
      // ═══ Y LAS DOS CURVAS DE SALDO, EN EL EJE DERECHO ═══
      //
      // Van en el OTRO eje porque son otra magnitud: el saldo se mide en decenas de millones y lo que
      // sale un día, en unidades. En el mismo eje las barras quedaban aplastadas contra el piso y el
      // gráfico dejaba de mostrar lo que sale, que es la mitad de la pregunta.
      { series: fuente(col(COL_NECESIDAD.saldoCobrando)), targetAxis: 'RIGHT_AXIS', type: 'LINE', color: ACENTO, lineStyle: { width: 3 } },
      { series: fuente(col(COL_NECESIDAD.saldoSinCobrar)), targetAxis: 'RIGHT_AXIS', type: 'LINE', color: ROJO, lineStyle: { width: 2, type: 'MEDIUM_DASHED' } },
    ],
    axis: [
      { position: 'BOTTOM_AXIS', format: texto(9) },
      // EL TÍTULO DEL EJE NOMBRA LAS DOS COSAS QUE HAY EN LA PILA. Si la leyenda se corta —pasa con
      // seis series en un gráfico de este ancho—, el eje sigue diciendo qué se está midiendo.
      { position: 'LEFT_AXIS', title: 'Sale ese día: lo ya pagado + lo que falta pagar', format: texto(9) },
      { position: 'RIGHT_AXIS', title: 'Saldo acumulado', format: texto(9) },
    ],
  }, sheetId, posicion)
}

/**
 * DÓNDE VA A ESTAR LA PLATA + QUÉ SALE CADA DÍA. COMBO: los egresos del día apilados por rubro
 * (barras, eje izquierdo) y el saldo proyectado partido en efectivo (verde) y banco (celeste)
 * (líneas, eje derecho).
 *
 * Sale del MISMO bloque de la necesidad diaria. La versión anterior mostraba SÓLO las dos curvas de
 * saldo y el dueño lo rechazó: *"no me sirve si no veo los egresos también"*. Los egresos van acá con
 * la misma apertura por rubro que en «¿alcanza la caja?» —para poder cruzar «qué sale» con «dónde
 * queda»— pero SIN las curvas de saldo cobrando/sin cobrar de aquel: son sólo dos líneas sobre las
 * barras, no cuatro, así que se lee sin la maraña que el dueño ya había frenado.
 *
 * DOS EJES A PROPÓSITO: lo que sale un día se mide en millones sueltos; el saldo, en decenas de
 * millones. En el mismo eje las barras quedaban aplastadas contra el piso.
 */
function efectivoVsBanco({ titulo, subtitulo, sheetId, anexo, rango: r, posicion }) {
  const col = (c) => rango(anexo, r.f0 - 1, r.f1, c, c)
  // El mismo color por rubro que la necesidad diaria: un rubro es del mismo color en los dos gráficos.
  const COLORES = { ejecutado: GRIS_CLARO, cheques: GRIS, proveedores: INK, sueldos: ACENTO, cargas: OCRE, impuestos: ROJO }
  return base(titulo, subtitulo, {
    chartType: 'COMBO',
    stackedType: 'STACKED',
    legendPosition: 'BOTTOM_LEGEND',
    // El encabezado adentro del rango es lo que hace que la leyenda diga «Saldo efectivo»/«Saldo banco».
    headerCount: 1,
    domains: [{ domain: fuente(col(COL_NECESIDAD.dia)) }],
    series: [
      // Los egresos del día, apilados por rubro (eje izquierdo): lo que va SALIENDO y mueve los saldos.
      ...COL_NECESIDAD.salidas.map((c, i) => ({
        series: fuente(col(c)), targetAxis: 'LEFT_AXIS', type: 'COLUMN', color: COLORES[SALIDAS[i].clave] ?? GRIS,
      })),
      // Dónde va a quedar la plata (eje derecho): efectivo verde, banco celeste. Su suma es el saldo del plan.
      { series: fuente(col(COL_NECESIDAD.saldoEfectivo)), targetAxis: 'RIGHT_AXIS', type: 'LINE', color: VERDE, lineStyle: { width: 3 } },
      { series: fuente(col(COL_NECESIDAD.saldoBanco)), targetAxis: 'RIGHT_AXIS', type: 'LINE', color: CELESTE, lineStyle: { width: 3 } },
    ],
    axis: [
      { position: 'BOTTOM_AXIS', format: texto(9) },
      { position: 'LEFT_AXIS', title: 'Sale ese día, por rubro', format: texto(9) },
      { position: 'RIGHT_AXIS', title: 'Saldo proyectado — efectivo / banco', format: texto(9) },
    ],
  }, sheetId, posicion)
}

/** Una curva de saldo: fecha en el eje de abajo, plata en el de la izquierda, UNA sola serie. */
function curva({ titulo, subtitulo, sheetId, anexo, rango: r, posicion, color }) {
  return base(titulo, subtitulo, {
    chartType: 'LINE',
    // Una sola serie: la leyenda no agrega nada y le roba ancho al gráfico.
    legendPosition: 'NO_LEGEND',
    headerCount: 0,
    axis: [{ position: 'BOTTOM_AXIS', format: texto(9) }, { position: 'LEFT_AXIS', format: texto(9) }],
    domains: [{ domain: fuente(rango(anexo, r.f0, r.f1, COL.fecha, COL.fecha)) }],
    series: [{ series: fuente(rango(anexo, r.f0, r.f1, COL.importe, COL.importe)), targetAxis: 'LEFT_AXIS', color }],
  }, sheetId, posicion)
}

/**
 * EL CRUCE: dos curvas sobre los doce meses —lo que entra y lo que sale— y el punto donde se tocan.
 *
 * ═══ POR QUÉ LÍNEAS Y NO COLUMNAS ═══
 *
 * La pregunta del dueño es DÓNDE SE CRUZAN, y un cruce es un hecho de la línea: dos series de columnas
 * agrupadas se comparan de a pares, mes por mes, y el mes en que una pasa a la otra hay que buscarlo a
 * ojo comparando alturas. Con líneas el cruce es un punto que se ve sin buscarlo. Se suavizan
 * (`lineSmoothing`) porque doce puntos con quiebres duros parecen ruido y acá lo que importa es la
 * tendencia, no el valor exacto de un mes — ése está en la tabla del anexo.
 *
 * ═══ Y POR QUÉ EL RANGO ARRANCA UNA FILA ANTES ═══
 *
 * `headerCount: 1` con la fila del rótulo adentro es lo único que hace que la leyenda diga "Ingresos"
 * y "Egresos". Sin eso Sheets rotula "Series 1" y "Series 2" y las dos curvas quedan sin nombre. Esa
 * fila existe siempre: `ubicarSeries` devuelve `f0` como la SIGUIENTE a la del rótulo que encontró.
 *
 * Igual el subtítulo nombra los colores en la frase que se lee: si algún día la leyenda se rompe, el
 * gráfico sigue diciendo qué es cada curva.
 */
function cruce({ titulo, subtitulo, sheetId, anexo, rango: r, posicion }) {
  const cab = r.f0 - 1
  return base(titulo, subtitulo, {
    chartType: 'LINE',
    lineSmoothing: true,
    legendPosition: 'BOTTOM_LEGEND',
    headerCount: 1,
    axis: [{ position: 'BOTTOM_AXIS', format: texto(9) }, { position: 'LEFT_AXIS', format: texto(9) }],
    domains: [{ domain: fuente(rango(anexo, cab, r.f1, COL.fecha, COL.fecha)) }],
    series: [
      { series: fuente(rango(anexo, cab, r.f1, COL.importe, COL.importe)), targetAxis: 'LEFT_AXIS', color: ACENTO },
      { series: fuente(rango(anexo, cab, r.f1, COL.egreso, COL.egreso)), targetAxis: 'LEFT_AXIS', color: ROJO },
    ],
  }, sheetId, posicion)
}

/** Un ranking: barras HORIZONTALES, porque los nombres de contraparte son largos y rotados no se leen. */
function ranking({ titulo, subtitulo, sheetId, anexo, rango: r, posicion, color }) {
  return base(titulo, subtitulo, {
    chartType: 'BAR',
    legendPosition: 'NO_LEGEND',
    headerCount: 0,
    axis: [{ position: 'BOTTOM_AXIS', format: texto(9) }, { position: 'LEFT_AXIS', format: texto(9) }],
    domains: [{ domain: fuente(rango(anexo, r.f0, r.f1, COL.rotulo, COL.rotulo)) }],
    series: [{ series: fuente(rango(anexo, r.f0, r.f1, COL.importe, COL.importe)), targetAxis: 'BOTTOM_AXIS', color }],
  }, sheetId, posicion)
}

/**
 * NÚCLEO PURO: los cuatro gráficos, para las series que existan.
 *
 * @param {number} sheetId la pestaña CAJA, donde flotan
 * @param {number} anexo el sheetId de `_CAJA_ANEXO`, de donde salen los datos
 * @param {object} series lo que devolvió `ubicarSeries` — cada clave puede venir en null
 * @returns {{requests:Array, faltan:string[]}}
 */
export function graficos(sheetId, anexo, series = {}) {
  const cuadros = [
    ['necesidad', (r, posicion) => necesidadDiaria({
      titulo: TITULO_NECESIDAD,
      // EL SUBTÍTULO LO DICE CON PALABRAS, y no es redundante con la leyenda: la leyenda nombra las
      // series, el subtítulo dice cuál de las dos mitades es la que hay que conseguir. Sin esa frase,
      // «Ya salió» se lee como una necesidad más y el gráfico vuelve a pedir dos veces la misma plata.
      subtitulo: 'Barras: lo que sale ese día. La gris clara es lo que YA SALIÓ (ya está descontado del saldo, no hay que conseguirlo); las otras cinco son lo que FALTA PAGAR, abierto por rubro. Curvas (eje derecho): el saldo que queda descontando sólo lo que falta pagar — la llena cobrando lo previsto, la punteada sin cobrar un peso. El día que cruzan el cero, no alcanza.',
      sheetId, anexo, rango: r, posicion,
    })],
    // Su propio gráfico, a todo el ancho, justo debajo del de «¿alcanza?». Lee las mismas filas de la
    // necesidad diaria (por eso su serie es la de `necesidad`), pero sólo las dos columnas del reparto.
    ['efectivoBanco', (r, posicion) => efectivoVsBanco({
      titulo: TITULO_EFECTIVO_BANCO,
      subtitulo: 'Barras (eje izq.): lo que SALE cada día, abierto por rubro. Líneas (eje der.): dónde va a quedar el saldo del plan — verde en la mano, celeste en el banco; sumadas dan la curva llena del gráfico de arriba. El día que el verde cruza el cero, hay plata pero está en el banco, no en efectivo.',
      sheetId, anexo, rango: r, posicion,
    })],
    ['equilibrio', (r, posicion) => cruce({
      titulo: TITULO_EQUILIBRIO,
      subtitulo: 'Donde el rojo supera al azul, el mes se financia con caja acumulada',
      sheetId, anexo, rango: r, posicion,
    })],
    ['proyeccion', (r, posicion) => curva({
      titulo: TITULO_PROYECCION,
      subtitulo: `Saldo día por día de los próximos ${DIAS_PROYECCION} — el pozo se ve como lo que es`,
      // EL ACENTO ES DE LA PROYECCIÓN: es la única curva con la que se decide algo hoy.
      sheetId, anexo, rango: r, posicion, color: ACENTO,
    })],
    // ═══ LOS DOS RANKINGS DE CONCENTRACIÓN YA NO SE DIBUJAN (20/08/2026) ═══
    //
    // El dueño: *"tenés que quitar los gráficos que ya no voy a usar, como el de concentración de
    // pagos y cobranzas"*. Las SERIES siguen en el anexo —el dato es suyo y no pidió borrarlo, igual
    // que con la historia de sesenta días—: se dejó de DIBUJAR, no se borró.
  ]
  // El reparto efectivo/banco vive en las MISMAS filas que la necesidad diaria (columnas Q/R de ese
  // bloque), así que su serie ES la de la necesidad. Si esa está, este también.
  series = { ...series, efectivoBanco: series?.necesidad ?? null }
  const esFull = (c) => c === 'necesidad' || c === 'efectivoBanco'
  const requests = []
  const faltan = []
  // ═══ LA GRILLA ES DE DOS COLUMNAS Y EL PRIMERO OCUPA LAS DOS ═══
  //
  // El dueño pidió que estén ALINEADOS. Antes el lugar de cada uno salía de su índice en la lista, así
  // que cuando uno no se dibujaba —porque su serie estaba vacía— los de atrás se corrían y la grilla
  // se desarmaba. Ahora el lugar se calcula sobre los que SE VAN A DIBUJAR, y el primero —la
  // necesidad diaria, que son treinta días en el eje— toma el ancho entero: apretado a la mitad, las
  // barras de un día miden cuatro píxeles.
  const vivos = cuadros.filter(([clave]) => { if (series?.[clave]) return true; faltan.push(clave); return false })
  let fila = 0
  vivos.forEach(([clave, hacer], i) => {
    const r = series[clave]
    // La FILA-ANCLA es una celda real distinta por bloque vertical (ver `base`): el editor vivo de
    // Google no apila full-width por offsetY, así que cada bloque cuelga de su propia fila.
    if (esFull(clave)) {
      requests.push(hacer(r, { x: 0, filaAncla: FILA_ANCLA + fila * FILAS_POR_BLOQUE, ancho: ANCHO_PX * 2 + 16 }))
      fila++
      return
    }
    const k = vivos.slice(0, i).filter(([c]) => !esFull(c)).length
    requests.push(hacer(r, { x: (k % 2) * (ANCHO_PX + 16), filaAncla: FILA_ANCLA + (fila + Math.floor(k / 2)) * FILAS_POR_BLOQUE }))
  })
  return { requests, faltan }
}

/**
 * Los requests para dejar los gráficos de esta pestaña como corresponde: borrar TODOS y dibujar.
 *
 * NO ROMPE LA CORRIDA SI NO SE PUEDEN LEER LOS EXISTENTES. Un gráfico es un resumen de la tabla: si no
 * se puede dibujar, la tabla tiene que quedar igual de bien. Por eso el que llama manda estos requests
 * en su PROPIO lote — un `addChart` que falle no puede tirarse abajo el formato de la pestaña entera.
 *
 * ═══ CADA SALIDA IMPRIME SU MOTIVO ═══
 *
 * Una versión anterior devolvía `[]` en silencio en dos de sus tres salidas, y en la corrida real no
 * se dibujó nada sin que el log dijera una palabra. "No apareció y no sé por qué" no se puede ni
 * arreglar ni descartar.
 */
export async function requestsDeGraficos(google, fileId, sheetId, anexoSheetId, series) {
  if (!Number.isFinite(anexoSheetId)) {
    console.warn('  ⚠ NO dibujo los gráficos: no encontré el sheetId de _CAJA_ANEXO, que es donde viven las series')
    return []
  }
  const hojas = await google.getCharts(fileId).catch((e) => { console.warn(`  ⚠ getCharts falló: ${e.message}`); return null })
  if (!hojas) {
    // NO PODER LEER LOS EXISTENTES NO ES "NO HAY NINGUNO": dibujar igual apilaría uno más por corrida.
    console.warn('  ⚠ NO dibujo los gráficos: no pude leer los existentes, y dibujar sin borrar los apila')
    return []
  }
  const viejos = hojas.find((h) => h.sheetId === sheetId)?.charts ?? []
  const { requests, faltan } = graficos(sheetId, anexoSheetId, series)
  if (faltan.length) {
    console.warn(`  ⚠ ${faltan.length} gráfico(s) sin datos en _CAJA_ANEXO (${faltan.join(', ')}): corré primero caja-anexo-pestana.mjs`)
  }
  if (!requests.length) {
    console.warn('  ⚠ NO dibujo ningún gráfico: ninguna serie del anexo se pudo ubicar por su rótulo')
    return []
  }
  if (viejos.length) console.log(`  🗑 borro los ${viejos.length} gráfico(s) que había en la pestaña: el rediseño cambió las filas que leían`)
  return [
    ...viejos.map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId } })),
    ...requests,
  ]
}

// ═══ EL EFECTO, NO EL INTENTO (03/09/2026) ═══
//
// El arreglo del 02/09 se cerró con la evidencia del REQUEST: el generador PEDÍA la hoja larga. El
// 03/09 el dueño la vio rota otra vez —55 filas, el bloque 3 encima del 2— y nadie se enteró, porque
// nadie volvió a LEER la hoja después de escribirla. Un layout que depende del alto de la grilla sólo
// se puede AFIRMAR mirando la grilla; lo demás es la pantalla que respondió que sí.

// Series de muestra: `graficos()` sólo mira que la clave EXISTA para decidir el lugar de cada cuadro.
const M = { f0: 2, f1: 3 }
const SERIES_COMPLETAS = { necesidad: M, equilibrio: M, proyeccion: M }

/** Título y ancla de cada `addChart` de un lote. Puro — y la misma forma que se lee de la API. */
export function anclasDeRequests(requests = []) {
  return (requests || []).flatMap((r) => {
    const p = r?.addChart?.chart?.position?.overlayPosition
    if (!p) return []
    // La API OMITE los ceros (`rowIndex: 0`, `offsetXPixels: 0`): sin el `?? 0`, el ancla de la
    // primera columna se leería como "no vino" y el control daría rojo por un artefacto del transporte.
    return [{ titulo: r.addChart.chart.spec?.title ?? '', fila: p.anchorCell?.rowIndex ?? 0, x: p.offsetXPixels ?? 0 }]
  })
}

/** Lo mismo, sobre lo que devuelve `charts(chartId,position(overlayPosition),spec(title))`. */
export function anclasDeCharts(charts = []) {
  return (charts || []).map((c) => {
    const p = c?.position?.overlayPosition ?? c?.overlayPosition ?? {}
    return { titulo: c?.spec?.title ?? '', fila: p.anchorCell?.rowIndex ?? 0, x: p.offsetXPixels ?? 0 }
  })
}

/**
 * EL LAYOUT QUE CORRESPONDE, SACADO DEL MISMO CÓDIGO QUE DIBUJA. Una tabla de filas y títulos escrita
 * a mano al lado se desincroniza el día que cambia `FILAS_POR_BLOQUE`, y el control pasa a certificar
 * el layout viejo: dos definiciones de lo mismo, que es lo que esta pestaña ya pagó una vez.
 */
export function layoutEsperado(series = SERIES_COMPLETAS) {
  return anclasDeRequests(graficos(0, 1, series).requests)
}

/**
 * ¿QUEDÓ COMO TIENE QUE QUEDAR? PURA: recibe lo LEÍDO de la API y devuelve el veredicto.
 * @param {{rows:number, charts:Array, esperados?:Array}} leido `rows` = gridProperties.rowCount de CAJA.
 * @returns {{ok:boolean, problemas:string[]}}
 */
export function verificarLayoutGraficos({ rows, charts, esperados = layoutEsperado() } = {}) {
  const problemas = []
  const minimo = FILA_FINAL_DE_GRAFICOS + 1
  if (!Number.isFinite(rows) || rows < minimo) {
    problemas.push(`la hoja tiene ${Number.isFinite(rows) ? rows : '—'} filas y necesita ${minimo}: con menos, el editor vivo sube el último bloque hasta que entre y lo dibuja encima del anterior`)
  }
  const leidos = anclasDeCharts(charts)
  for (const e of esperados) {
    const iguales = leidos.filter((l) => l.titulo === e.titulo)
    if (!iguales.length) { problemas.push(`falta el gráfico «${e.titulo}»`); continue }
    // Dos veces el mismo título es un apilado: sólo se ve el de arriba, y el de abajo sigue ahí.
    if (iguales.length > 1) problemas.push(`«${e.titulo}» está ${iguales.length} veces: los apilados no se ven, pero están`)
    const c = iguales[0]
    if (c.fila !== e.fila) problemas.push(`«${e.titulo}» ancla en la fila ${c.fila + 1} y le corresponde la ${e.fila + 1}`)
    else if (c.x !== e.x) problemas.push(`«${e.titulo}» arranca en x=${c.x}px y le corresponde x=${e.x}px`)
  }
  return { ok: problemas.length === 0, problemas }
}

/**
 * EL REQUEST QUE GARANTIZA EL ALTO, PARA MANDARLO EN EL MISMO LOTE QUE LOS `addChart`.
 *
 * NUNCA ACHICA: toma el máximo contra el alto actual, porque un `rowCount` MENOR al de la hoja es un
 * `deleteDimension` con otro nombre y la guarda lo trataría —con razón— como destructivo.
 */
export function requestDeAltoMinimo(sheetId, filasActuales = 0) {
  const rowCount = Math.max(FILA_FINAL_DE_GRAFICOS + 1, Number.isFinite(filasActuales) ? filasActuales : 0)
  return { updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount } }, fields: 'gridProperties.rowCount' } }
}

/**
 * LO QUE LA HOJA DEVUELVE DESPUÉS DE DIBUJAR: el alto de la grilla y el ancla de cada gráfico. Es la
 * única lectura con la que se puede AFIRMAR que el layout quedó bien — `getCharts` trae el título pero
 * no la posición, y la posición es justo lo que el editor vivo cambia por su cuenta.
 */
export async function leerLayoutDeGraficos(google, fileId, titulo) {
  const campos = 'sheets(properties(title,gridProperties(rowCount)),charts(chartId,position(overlayPosition),spec(title)))'
  const j = await google.getGridData(fileId, `'${titulo}'`, campos)
  const hojas = j?.sheets ?? []
  const hoja = hojas.find((s) => s.properties?.title === titulo) ?? hojas[0]
  return { rows: hoja?.properties?.gridProperties?.rowCount, charts: hoja?.charts ?? [] }
}
