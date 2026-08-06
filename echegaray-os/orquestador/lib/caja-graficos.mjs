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

import { COL, DIAS_PROYECCION, DIAS_TOP, TOP_N } from './caja-anexo-series.mjs'

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
const ALTO_PX = 300

/** El prefijo que marca un gráfico como PROPIO. Se conserva para poder reconocerlos en el archivo. */
export const MARCA = '⟡ '
export const TITULO_EQUILIBRIO = `${MARCA}Ingresos vs egresos por mes — punto de equilibrio`
export const TITULO_PROYECCION = `${MARCA}Proyección de la caja`
export const TITULO_PAGOS = `${MARCA}Concentración de pagos`
export const TITULO_COBRANZAS = `${MARCA}Concentración de cobranzas`

// La misma paleta que la pestaña: tinta, gris apagado y UN acento.
const INK = { red: 0.10, green: 0.13, blue: 0.20 }
const GRIS = { red: 0.62, green: 0.63, blue: 0.65 }
const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
// EL ROJO ENTRA, Y SÓLO PARA UNA COSA. La regla anterior era no usarlo —en un gráfico de saldo todo
// negativo se pintaría de rojo y el rojo dejaría de avisar—. Acá el rojo no marca un negativo: marca
// LA SALIDA de plata, una serie entera y una sola. Es apagado a propósito: un rojo saturado grita en
// los doce meses, y lo que tiene que gritar es el mes donde le pasa por arriba al azul.
const ROJO = { red: 0.60, green: 0.24, blue: 0.22 }

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
            anchorCell: { sheetId, rowIndex: FILA_ANCLA, columnIndex: COL_ANCLA },
            offsetXPixels: posicion.x, offsetYPixels: posicion.y,
            widthPixels: ANCHO_PX, heightPixels: ALTO_PX,
          },
        },
      },
    },
  }
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
    ['pagos', (r, posicion) => ranking({
      titulo: TITULO_PAGOS,
      subtitulo: `Top ${TOP_N} contrapartes a ${DIAS_TOP} días — con quién se negocia el plazo`,
      sheetId, anexo, rango: r, posicion, color: GRIS,
    })],
    ['cobranzas', (r, posicion) => ranking({
      titulo: TITULO_COBRANZAS,
      subtitulo: `Top ${TOP_N} contrapartes a ${DIAS_TOP} días — si uno solo pesa demasiado, el riesgo es comercial`,
      sheetId, anexo, rango: r, posicion, color: ACENTO,
    })],
  ]
  const requests = []
  const faltan = []
  cuadros.forEach(([clave, hacer], i) => {
    const r = series?.[clave]
    if (!r) return faltan.push(clave)
    // Dos por fila: el orden de lectura es evolución → proyección arriba, concentraciones abajo.
    requests.push(hacer(r, { x: (i % 2) * (ANCHO_PX + 16), y: Math.floor(i / 2) * (ALTO_PX + 16) }))
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
