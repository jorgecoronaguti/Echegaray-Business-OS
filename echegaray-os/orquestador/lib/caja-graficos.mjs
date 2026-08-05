// LOS GRÁFICOS DE CAJA — DOS, Y CADA UNO CONTESTA UNA PREGUNTA.
//
// POR QUÉ EXISTEN (05/08/2026). El dueño: *"necesito la máxima claridad, buscá en internet gráficos
// relevantes que le podamos agregar a la pestaña"*. La respuesta profesional para una posición de caja
// no es "poner gráficos": es que el recorrido de la plata deje de ser seis renglones que hay que sumar
// mentalmente. Un waterfall del recorrido —el *cash walkthrough* del dashboard de un CFO— hace obvio
// el pozo de un vistazo; hoy hay que leer la columna "Queda después" tramo por tramo y comparar a ojo.
//
// ═══ EL GRÁFICO NO REEMPLAZA LA TABLA, LA RESUME ═══
//
// Los dos leen EXACTAMENTE las mismas celdas que la tabla que tienen al lado. Nunca una segunda fuente
// de datos: un gráfico alimentado por su propio cálculo es la forma más elegante de tener dos verdades.
//
// ═══ FLOTAN, ASÍ QUE NO GASTAN FILAS ═══
//
// Van con `overlayPosition` a la derecha de la tabla. El objetivo de 45 filas es sobre la GRILLA, y un
// gráfico anclado a celdas se las comería. Flotando, la pestaña sigue entrando en una pantalla.
//
// ═══ Y SE BORRAN LOS PROPIOS ANTES DE DIBUJAR ═══
//
// `addChart` siempre AGREGA: no existe "crear o actualizar". Sin borrar primero, la corrida de cada dos
// horas apila doce gráficos por día sobre la misma celda y sólo se ve el último. Se borran por TÍTULO
// —los que este módulo declara suyos— y no todos los de la pestaña: si el dueño dibuja el suyo, es suyo.
//
// ═══ SIN DECORACIÓN, UN SOLO ACENTO ═══
//
// Sin 3D, sin sombras, sin gridlines de fondo, sin leyenda cuando hay una sola serie. La misma
// disciplina que las tablas. El acento se reserva para lo que decide: el subtotal del recorrido.

/**
 * LA COLUMNA DONDE SE ANCLAN. Los gráficos flotan, pero el ANCLA es una celda REAL: si la pestaña no
 * tiene tantas columnas, `addChart` devuelve 400 y el lote entero se cae. CAJA tiene 8 columnas de
 * datos y nada garantizaba que la hoja tuviera una novena — el generador sólo asegura el alto, nunca
 * el ancho. Por eso el número vive acá, exportado, y `caja-pestana.mjs` garantiza la columna ANTES de
 * pedir el gráfico. Un ancla fuera de la grilla es el modo de falla más probable de este archivo.
 */
export const COL_ANCLA = 8

/** El prefijo que marca un gráfico como PROPIO. Lo que no lo lleve, no se toca. */
export const MARCA = '⟡ '
export const TITULO_RECORRIDO = `${MARCA}En qué semana me quedo corto`
export const TITULO_CONCENTRACION = `${MARCA}De quién depende la cobranza`

// La misma paleta que el resto de la pestaña: tinta, gris apagado y un acento discreto.
const INK = { red: 0.10, green: 0.13, blue: 0.20 }
const GRIS = { red: 0.62, green: 0.63, blue: 0.65 }
const GRIS_CLARO = { red: 0.82, green: 0.83, blue: 0.85 }
const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }

const rango = (sheetId, f0, f1, c0, c1) => ({ sheetId, startRowIndex: f0 - 1, endRowIndex: f1, startColumnIndex: c0 - 1, endColumnIndex: c1 })
/**
 * LA FUENTE DE UNA SERIE. En un `basicChart`, `domain` y `series` reciben ESTO directamente: envolverlo
 * en `{ data: … }` —como sí hace un waterfall o un pie— devuelve un 400 con "Unknown name data" y el
 * lote entero del gráfico se cae. Costó una corrida contra el archivo real descubrirlo, y el test de
 * abajo lo fija: las series se comparan por `sourceRange`, así que un envoltorio de más lo rompe.
 */
const fuente = (...rangos) => ({ sourceRange: { sources: rangos } })
const texto = (size, color = GRIS) => ({ fontFamily: 'Arial', fontSize: size, foregroundColor: color })

/**
 * LA CURVA DE LIQUIDEZ — entra, sale, y con cuánto quedo. Un COMBO, no un waterfall.
 *
 * ═══ POR QUÉ NO ES UN WATERFALL (05/08/2026) ═══
 *
 * Había uno y el dueño lo borró: *"el gráfico que armaste tampoco [sirve], por eso lo borré"*. Tenía
 * razón dos veces. Un waterfall cuenta UNA historia —cómo se descompone una variación— y para eso
 * necesita DELTAS; la columna que leía era el neto del tramo, que se fue de la tabla justamente por ser
 * una resta que el lector hace solo. Sobre la columna que quedó ("Queda después", que es un NIVEL) un
 * waterfall directamente miente: apilaría saldos como si fueran variaciones.
 *
 * La pregunta que esta pestaña contesta es *¿en qué semana me quedo corto?*, y la forma canónica de
 * mostrarla —la que usa cualquier tesorería, y la que devuelve la búsqueda de mejores prácticas de
 * cash positioning— es un combo: barras para el movimiento de cada tramo y una LÍNEA para la posición
 * acumulada. El pozo se ve como lo que es, un pozo en la línea, con las barras que lo explican debajo.
 *
 * ES LA MISMA PLATA QUE LA TABLA, CELDA POR CELDA: columnas C, D y E del calendario. Si mañana el
 * calendario cambia una fórmula, el gráfico cambia con ella porque no tiene datos propios.
 */
export function graficoRecorrido(sheetId, g) {
  // ═══ LAS SERIES SE NOMBRAN SOLAS, DESDE EL ENCABEZADO DE LA TABLA (05/08) ═══
  //
  // La primera versión leía sólo las filas de datos con `headerCount: 0` y la leyenda salió con tres
  // cuadraditos SIN texto: tres series indistinguibles, que es peor que no tener leyenda. Incluyendo la
  // fila del encabezado del calendario y declarando `headerCount: 1`, Sheets toma "Entra", "Sale" y
  // "Queda después" de la misma tabla — así que el día que cambie un rótulo, cambia el del gráfico.
  const filas = (c) => fuente(rango(sheetId, g.cal0 - 1, g.cal1, c, c))
  return {
    addChart: {
      chart: {
        spec: {
          title: TITULO_RECORRIDO,
          // El subtítulo dice QUÉ SE DECIDE mirándolo. Un gráfico sin pregunta es decoración.
          subtitle: 'Las barras son el movimiento del tramo; la línea, con cuánta plata quedás después',
          titleTextFormat: { ...texto(12, INK), bold: true },
          subtitleTextFormat: texto(9),
          fontName: 'Arial',
          // Fondo blanco explícito: el default hereda el de la hoja y con la cuadrícula oculta queda gris.
          backgroundColor: { red: 1, green: 1, blue: 1 },
          basicChart: {
            chartType: 'COMBO',
            // Acá SÍ hay leyenda: son tres series y sin nombres el gráfico no se puede leer.
            legendPosition: 'BOTTOM_LEGEND',
            headerCount: 1,
            axis: [
              { position: 'BOTTOM_AXIS', format: texto(9) },
              { position: 'LEFT_AXIS', format: texto(9) },
            ],
            domains: [{ domain: filas(1) }],
            series: [
              // Lo que entra y lo que sale, en gris claro y gris medio. Dos colores fuertes enfrentados
              // convierten el cuadro en un semáforo, y acá pagar no es una mala noticia.
              { series: filas(3), targetAxis: 'LEFT_AXIS', type: 'COLUMN', color: GRIS_CLARO },
              { series: filas(4), targetAxis: 'LEFT_AXIS', type: 'COLUMN', color: GRIS },
              // EL ÚNICO ACENTO: la posición acumulada. Es la línea donde se ve el pozo.
              { series: filas(5), targetAxis: 'LEFT_AXIS', type: 'LINE', color: ACENTO },
            ],
          },
        },
        position: { overlayPosition: { anchorCell: { sheetId, rowIndex: 1, columnIndex: COL_ANCLA }, widthPixels: 620, heightPixels: 320 } },
      },
    },
  }
}

/**
 * LA CONCENTRACIÓN — barras horizontales del top cinco.
 *
 * "Alta concentración = el riesgo de caja no es financiero, es comercial". Como tabla son cinco filas
 * que hay que comparar leyendo cifras; como barras se ve en un segundo que tres clientes son casi todo.
 *
 * BAR y no COLUMN: los nombres de cliente son largos y en vertical se dibujan rotados e ilegibles.
 */
export function graficoConcentracion(sheetId, g) {
  return {
    addChart: {
      chart: {
        spec: {
          title: TITULO_CONCENTRACION,
          subtitle: 'Cartera pendiente por cliente — si uno solo pesa demasiado, el riesgo es comercial',
          titleTextFormat: { ...texto(12, INK), bold: true },
          subtitleTextFormat: texto(9),
          fontName: 'Arial',
          backgroundColor: { red: 1, green: 1, blue: 1 },
          basicChart: {
            chartType: 'BAR',
            // Una sola serie: la leyenda no agrega nada y roba ancho al gráfico.
            legendPosition: 'NO_LEGEND',
            axis: [
              { position: 'BOTTOM_AXIS', viewWindowOptions: {}, format: texto(9) },
              { position: 'LEFT_AXIS', format: texto(9) },
            ],
            domains: [{ domain: fuente(rango(sheetId, g.fCli0, g.fCli1, 1, 1)) }],
            series: [{ series: fuente(rango(sheetId, g.fCli0, g.fCli1, 3, 3)), targetAxis: 'BOTTOM_AXIS', color: ACENTO }],
            headerCount: 0,
          },
        },
        position: { overlayPosition: { anchorCell: { sheetId, rowIndex: 18, columnIndex: COL_ANCLA }, widthPixels: 620, heightPixels: 260 } },
      },
    },
  }
}

/**
 * Los requests para dejar los gráficos de esta pestaña como corresponde: borrar los PROPIOS y dibujar.
 *
 * NO ROMPE LA CORRIDA SI NO SE PUEDEN LEER LOS EXISTENTES. Un gráfico es un resumen de la tabla: si no
 * se puede dibujar, la tabla tiene que quedar igual de bien. Por eso el que llama manda estos requests
 * en su PROPIO lote — un `addChart` que falle no puede tirarse abajo el formato de la pestaña entera.
 */
export async function requestsDeGraficos(google, fileId, sheetId, g) {
  // ═══ UN CAMINO QUE NO DIBUJA TIENE QUE DECIR POR QUÉ ═══
  //
  // La primera versión devolvía `[]` en silencio en dos de sus tres salidas, y en la corrida real no se
  // dibujó ningún gráfico sin que el log dijera una palabra. "No apareció y no sé por qué" es el peor
  // estado posible: no se puede ni arreglar ni descartar. Cada salida imprime su motivo.
  const faltan = ['cal0', 'cal1'].filter((k) => !g?.[k])
  if (faltan.length) {
    console.warn(`  ⚠ NO dibujo los gráficos: la grilla no trae ${faltan.join(', ')}`)
    return []
  }
  const hojas = await google.getCharts(fileId).catch((e) => { console.warn(`  ⚠ getCharts falló: ${e.message}`); return null })
  if (!hojas) {
    // NO PODER LEER LOS EXISTENTES NO ES "NO HAY NINGUNO": dibujar igual apilaría uno más en cada
    // corrida. Sin la lectura no se puede decidir, así que no se dibuja y se dice por qué.
    console.warn('  ⚠ NO dibujo los gráficos: no pude leer los existentes, y dibujar sin borrar los apila')
    return []
  }
  const mios = (hojas.find((h) => h.sheetId === sheetId)?.charts ?? []).filter((c) => String(c.title ?? '').startsWith(MARCA))
  if (mios.length) console.log(`  🗑 borro ${mios.length} gráfico(s) míos de la corrida anterior antes de redibujar`)
  return [
    ...mios.map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId } })),
    graficoRecorrido(sheetId, g),
  ]
}
