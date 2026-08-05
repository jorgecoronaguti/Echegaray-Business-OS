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

/** El prefijo que marca un gráfico como PROPIO. Lo que no lo lleve, no se toca. */
export const MARCA = '⟡ '
export const TITULO_RECORRIDO = `${MARCA}El recorrido de la caja, tramo por tramo`
export const TITULO_CONCENTRACION = `${MARCA}De quién depende la cobranza`

// La misma paleta que el resto de la pestaña: tinta, gris apagado y un acento discreto.
const INK = { red: 0.10, green: 0.13, blue: 0.20 }
const GRIS = { red: 0.62, green: 0.63, blue: 0.65 }
const GRIS_CLARO = { red: 0.82, green: 0.83, blue: 0.85 }
const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }

const rango = (sheetId, f0, f1, c0, c1) => ({ sheetId, startRowIndex: f0 - 1, endRowIndex: f1, startColumnIndex: c0 - 1, endColumnIndex: c1 })
const fuente = (...rangos) => ({ sourceRange: { sources: rangos } })
const texto = (size, color = GRIS) => ({ fontFamily: 'Arial', fontSize: size, foregroundColor: color })

/**
 * EL WATERFALL DEL RECORRIDO — de la caja de hoy a la del final del horizonte.
 *
 * LA PRIMERA BARRA ES UN NIVEL, LAS SEIS SIGUIENTES SON DELTAS. Por eso el dominio y la serie se arman
 * con DOS rangos no contiguos: la fila del total de disponibilidades y las seis del calendario.
 * `firstValueIsTotal` es lo que le dice a Sheets que el primer punto es el piso desde el que se apila —
 * sin eso, el recorrido arrancaría en cero y el gráfico mostraría un pozo que no existe.
 *
 * ES LA MISMA PLATA QUE LA TABLA, CELDA POR CELDA: columna E ("Neto del tramo") y la del total. Si
 * mañana el calendario cambia una fórmula, el gráfico cambia con ella porque no tiene datos propios.
 */
export function graficoRecorrido(sheetId, g) {
  const domain = fuente(rango(sheetId, g.fTotal, g.fTotal, 1, 1), rango(sheetId, g.cal0, g.cal1, 1, 1))
  const serie = fuente(rango(sheetId, g.fTotal, g.fTotal, 5, 5), rango(sheetId, g.cal0, g.cal1, 5, 5))
  return {
    addChart: {
      chart: {
        spec: {
          title: TITULO_RECORRIDO,
          // El subtítulo dice QUÉ SE DECIDE mirándolo. Un gráfico sin pregunta es decoración.
          subtitle: 'El punto más bajo es el techo de lo que se puede inmovilizar',
          titleTextFormat: { ...texto(12, INK), bold: true },
          subtitleTextFormat: texto(9),
          fontName: 'Arial',
          // Fondo blanco explícito: el default hereda el de la hoja y con la cuadrícula oculta queda gris.
          backgroundColor: { red: 1, green: 1, blue: 1 },
          waterfallChart: {
            domain: { data: domain },
            series: [{
              data: serie,
              // Lo que suma en gris claro, lo que resta en gris medio: la dirección ya la dice la
              // posición de la barra. Dos colores fuertes enfrentados convierten un recorrido en un
              // semáforo, y acá pagar no es una mala noticia.
              positiveColumnsStyle: { color: GRIS_CLARO },
              negativeColumnsStyle: { color: GRIS },
              // EL ÚNICO ACENTO: el nivel de caja. Es el número que decide.
              subtotalColumnsStyle: { color: ACENTO },
              hideTrailingSubtotal: false,
            }],
            stackedType: 'STACKED',
            firstValueIsTotal: true,
            hideConnectorLines: false,
            connectorLineStyle: { color: GRIS_CLARO, type: 'MEDIUM_DASHED', width: 1 },
          },
        },
        position: { overlayPosition: { anchorCell: { sheetId, rowIndex: 1, columnIndex: 8 }, widthPixels: 620, heightPixels: 300 } },
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
            domains: [{ domain: { data: fuente(rango(sheetId, g.fCli0, g.fCli1, 1, 1)) } }],
            series: [{ series: fuente(rango(sheetId, g.fCli0, g.fCli1, 3, 3)), targetAxis: 'BOTTOM_AXIS', color: ACENTO }],
            headerCount: 0,
          },
        },
        position: { overlayPosition: { anchorCell: { sheetId, rowIndex: 18, columnIndex: 8 }, widthPixels: 620, heightPixels: 260 } },
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
  if (!g?.fTotal || !g?.cal0 || !g?.cal1 || !g?.fCli0 || !g?.fCli1) return []
  const hojas = await google.getCharts(fileId).catch(() => null)
  if (!hojas) {
    // NO PODER LEER LOS EXISTENTES NO ES "NO HAY NINGUNO": dibujar igual apilaría uno más en cada
    // corrida. Sin la lectura no se puede decidir, así que no se dibuja y se dice por qué.
    console.warn('  ⚠ no pude leer los gráficos existentes: NO dibujo (dibujar sin borrar los apila)')
    return []
  }
  const mios = (hojas.find((h) => h.sheetId === sheetId)?.charts ?? []).filter((c) => String(c.title ?? '').startsWith(MARCA))
  return [
    ...mios.map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId } })),
    graficoRecorrido(sheetId, g),
    graficoConcentracion(sheetId, g),
  ]
}
