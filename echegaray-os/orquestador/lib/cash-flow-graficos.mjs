// LOS GRÁFICOS DE LOS DOS CASH FLOW — CUATRO, Y CADA UNO CONTESTA UNA PREGUNTA QUE SE DECIDE.
//
// ═══ POR QUÉ EXISTEN (05/08/2026) ═══
//
// Medido contra el Sheet vivo: las dos pestañas de cash flow tenían CERO gráficos. Un cuadro semanal
// de 53 columnas es la peor forma posible de contestar "¿en qué semana no alcanza la plata?": hay que
// recorrer la fila de cierre columna por columna comparando cifras a ojo. La curva la contesta en un
// segundo, y es exactamente la lectura que el bloque de liquidez pone en números al lado.
//
// ═══ LA REGLA DE ADMISIÓN: SI NO CAMBIA UNA DECISIÓN, NO ENTRA ═══
//
// El dueño pidió "sólo los que hacen decidir". Se descartaron explícitamente, y conviene dejarlo
// escrito para que no vuelvan:
//   · torta de composición de egresos — la composición ya está en el cuerpo del cuadro con subtotales,
//     y una torta de nueve categorías no se lee;
//   · barras apiladas de todas las líneas — satura y no se decide por línea suelta, se decide por
//     categoría (mismo criterio que "el egreso que más la explica" del bloque de decisión);
//   · velocímetros / semáforos de cobertura — el número con su umbral al lado dice lo mismo sin tinta.
//
// Los cuatro que quedan, y qué decide cada uno:
//   1. CURVA DE LIQUIDEZ con la línea del colchón → cuándo hay que salir a buscar plata, y cuánta.
//   2. ENTRADAS CONTRA SALIDAS por período → si el período se paga solo o se paga con saldo viejo.
//   3. WATERFALL DEL AÑO por actividad → de dónde sale y a dónde se va la variación del efectivo.
//   4. LO ESPERADO CONTRA LO COBRADO → qué supuesto de cobranza falló, que es el que hay que corregir.
//
// ═══ LEEN LAS MISMAS CELDAS QUE LA TABLA — NUNCA UNA SEGUNDA FUENTE ═══
//
// Un gráfico con su propio cálculo es la forma más elegante de tener dos verdades. Los cuatro apuntan
// a las filas que el generador ya escribió; si mañana cambia una fórmula del cuerpo, cambian con ella.
//
// ═══ TRAMPAS YA PAGADAS QUE ESTE ARCHIVO RESPETA ═══
//
// · `addChart` SIEMPRE agrega: no existe "crear o actualizar". Sin borrar primero, el agente que
//   rehace el cuadro apila un juego de gráficos por corrida. Se borran por TÍTULO —sólo los que
//   llevan la MARCA— así que un gráfico que dibuje el dueño es suyo y no se toca.
// · `anchorCell` es una celda REAL: si la hoja no llega a esa columna, la API devuelve 400 y se cae
//   el LOTE ENTERO (incluido el formato). Por eso `COL_ANCLA` se exporta y el generador garantiza el
//   ancho de la hoja ANTES de pedir los gráficos, y por eso estos requests van en su propio lote.
// · Un waterfall NO acepta más de un `sourceRange` por eje, ni `color` dentro de `connectorLineStyle`.

/**
 * La columna donde se anclan, contada desde 0. Va HOLGADAMENTE a la derecha del cuadro más ancho
 * (el semanal: 53 períodos + rótulo + total + naturaleza = 56 columnas) para no taparlo nunca.
 */
export const COL_ANCLA = 58

/** El prefijo que marca un gráfico como PROPIO. Lo que no lo lleve, no se toca. */
export const MARCA = '⟡ '
export const TITULO_LIQUIDEZ = `${MARCA}Curva de liquidez — hasta dónde baja la caja`
export const TITULO_FLUJO = `${MARCA}Lo que entra contra lo que sale`
export const TITULO_PUENTE = `${MARCA}De dónde sale y a dónde se va el efectivo`
export const TITULO_DESVIO = `${MARCA}Cobranzas: lo esperado contra lo cobrado`

// La misma paleta que las tablas: tinta, gris apagado y un solo acento. Sin 3D, sin sombras, sin
// relleno de fondo. El color se reserva para lo que decide.
const INK = { red: 0.10, green: 0.13, blue: 0.20 }
const GRIS = { red: 0.62, green: 0.63, blue: 0.65 }
const GRIS_CLARO = { red: 0.82, green: 0.83, blue: 0.85 }
const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
const ALERTA = { red: 0.70, green: 0.20, blue: 0.20 }
const BLANCO = { red: 1, green: 1, blue: 1 }

const rango = (sheetId, f0, f1, c0, c1) => ({ sheetId, startRowIndex: f0 - 1, endRowIndex: f1, startColumnIndex: c0 - 1, endColumnIndex: c1 })
const fuente = (...rangos) => ({ sourceRange: { sources: rangos } })
const texto = (size, color = GRIS) => ({ fontFamily: 'Arial', fontSize: size, foregroundColor: color })

/** El envoltorio común: título, subtítulo que dice qué se decide, y posición flotante. */
const chart = (titulo, subtitulo, spec, sheetId, fila, alto = 280) => ({
  addChart: {
    chart: {
      spec: {
        title: titulo,
        // Un gráfico sin pregunta es decoración. El subtítulo dice qué se hace con lo que muestra.
        subtitle: subtitulo,
        titleTextFormat: { ...texto(12, INK), bold: true },
        subtitleTextFormat: texto(9),
        fontName: 'Arial',
        // Fondo blanco explícito: el default hereda el de la hoja y con la cuadrícula oculta queda gris.
        backgroundColor: BLANCO,
        ...spec,
      },
      position: { overlayPosition: { anchorCell: { sheetId, rowIndex: fila, columnIndex: COL_ANCLA }, widthPixels: 760, heightPixels: alto } },
    },
  },
})

/**
 * 1. LA CURVA DE LIQUIDEZ — el cierre período a período, con la línea del colchón por encima.
 *
 * ES EL GRÁFICO QUE JUSTIFICA LA PESTAÑA. La fila de cierre son 53 números que nadie compara a ojo;
 * la curva muestra el pozo, cuándo empieza y cuánto dura. La línea horizontal del colchón es la que
 * convierte "baja" en "baja DEMASIADO": sin una referencia, una curva descendente no dice nada.
 *
 * El colchón se dibuja como una serie propia porque Sheets no tiene línea de umbral: se apunta a la
 * MISMA celda del bloque de liquidez repetida a lo ancho, así que el umbral del gráfico y el de la
 * tabla no pueden discrepar.
 */
export function graficoLiquidez(sheetId, g) {
  return chart(TITULO_LIQUIDEZ,
    'Donde la curva cruza el colchón hay que decidir financiamiento; donde cruza el cero, ya no es opcional',
    {
      basicChart: {
        chartType: 'LINE',
        legendPosition: 'BOTTOM_LEGEND',
        axis: [
          { position: 'BOTTOM_AXIS', format: texto(9) },
          { position: 'LEFT_AXIS', format: texto(9) },
        ],
        domains: [{ domain: { data: fuente(rango(sheetId, g.filaCab, g.filaCab, 2, g.colN)) } }],
        series: [
          { series: fuente(rango(sheetId, g.filaCierre, g.filaCierre, 2, g.colN)), targetAxis: 'LEFT_AXIS', color: ACENTO, lineStyle: { width: 2, type: 'SOLID' } },
          { series: fuente(rango(sheetId, g.filaColchon, g.filaColchon, 2, g.colN)), targetAxis: 'LEFT_AXIS', color: ALERTA, lineStyle: { width: 1, type: 'MEDIUM_DASHED' } },
        ],
        headerCount: 0,
      },
    }, sheetId, 1, 320)
}

/**
 * 2. ENTRADAS CONTRA SALIDAS, período a período.
 *
 * La curva de arriba muestra el SALDO; ésta muestra el MOVIMIENTO, que es otra pregunta: un período
 * puede cerrar bien y haber consumido saldo viejo. Dos columnas enfrentadas hacen obvio cuáles son
 * los períodos que no se pagan solos — que son los que hay que ir a mirar.
 *
 * COLUMN y no dos líneas: son cantidades de cada período, no una serie continua.
 */
export function graficoEntradasSalidas(sheetId, g) {
  return chart(TITULO_FLUJO,
    'Un período donde la barra de salida supera la de entrada se está pagando con saldo viejo',
    {
      basicChart: {
        chartType: 'COLUMN',
        legendPosition: 'BOTTOM_LEGEND',
        axis: [
          { position: 'BOTTOM_AXIS', format: texto(9) },
          { position: 'LEFT_AXIS', format: texto(9) },
        ],
        domains: [{ domain: { data: fuente(rango(sheetId, g.filaCab, g.filaCab, 2, g.colN)) } }],
        series: [
          { series: fuente(rango(sheetId, g.filaEntradas, g.filaEntradas, 2, g.colN)), targetAxis: 'LEFT_AXIS', color: ACENTO },
          { series: fuente(rango(sheetId, g.filaSalidas, g.filaSalidas, 2, g.colN)), targetAxis: 'LEFT_AXIS', color: GRIS },
        ],
        headerCount: 0,
      },
    }, sheetId, 18)
}

/**
 * 3. EL PUENTE DEL EFECTIVO — waterfall de la variación del horizonte por actividad.
 *
 * Contesta "de dónde sale y a dónde se va la plata" en un solo dibujo: operativas, inversión,
 * financiación y el neto. Como tabla son cuatro números que hay que sumar mentalmente con su signo.
 *
 * UN SOLO `sourceRange` POR EJE. La API rechaza un waterfall con dominio o serie partidos en varios
 * rangos, así que las filas tienen que ser CONTIGUAS. Las tres "FLUJO NETO DE …" del cuerpo no lo
 * son —cada una vive debajo de su actividad—: por eso `bloquePuente` las pone contiguas
 * REFERENCIÁNDOLAS, sin recalcular nada. Ver cash-flow-liquidez.mjs.
 *
 * `firstValueIsTotal: false` porque el primer punto es un DELTA (el flujo de operativas), no un
 * nivel de caja. El subtotal final lo dibuja Sheets solo: es la variación neta del horizonte.
 */
export function graficoPuente(sheetId, g) {
  return chart(TITULO_PUENTE,
    'El recorrido del efectivo del horizonte, actividad por actividad',
    {
      waterfallChart: {
        domain: { data: fuente(rango(sheetId, g.puente0, g.puente1, 1, 1)) },
        series: [{
          data: fuente(rango(sheetId, g.puente0, g.puente1, g.puenteCol, g.puenteCol)),
          // Lo que suma en gris claro, lo que resta en gris medio: la dirección ya la dice la posición
          // de la barra. Dos colores enfrentados convierten un recorrido en un semáforo, y acá pagar
          // no es una mala noticia.
          positiveColumnsStyle: { color: GRIS_CLARO },
          negativeColumnsStyle: { color: GRIS },
          subtotalColumnsStyle: { color: ACENTO },
          hideTrailingSubtotal: false,
        }],
        stackedType: 'STACKED',
        // El primer punto es un DELTA (el flujo de operativas), no un nivel de caja.
        firstValueIsTotal: false,
        hideConnectorLines: false,
        // Sin `color` acá dentro: la API lo rechaza en connectorLineStyle.
        connectorLineStyle: { type: 'MEDIUM_DASHED', width: 1 },
      },
    }, sheetId, 35)
}

/**
 * 4. EL DESVÍO DE COBRANZAS — lo que vencía contra lo que entró, sobre períodos YA CERRADOS.
 *
 * Es el único contraste del cuadro entre dos HECHOS registrados (Cobranzas guarda la fecha
 * comprometida y la de cobro real), y es el que dice qué supuesto del forecast falló. Sin él, un
 * forecast que erra sistemáticamente sigue errando porque nadie mide el error.
 *
 * VENTANA DE TIEMPO PROPIA: son períodos cerrados, no los del cuadro. Por eso lee el encabezado del
 * bloque de contraste y no la fila 3 — mezclar las dos ventanas es la Regla de Oro 3.
 */
export function graficoDesvio(sheetId, g) {
  return chart(TITULO_DESVIO,
    'La brecha entre las dos barras es el supuesto de cobranza que hay que corregir',
    {
      basicChart: {
        chartType: 'COLUMN',
        legendPosition: 'BOTTOM_LEGEND',
        axis: [
          { position: 'BOTTOM_AXIS', format: texto(9) },
          { position: 'LEFT_AXIS', format: texto(9) },
        ],
        domains: [{ domain: { data: fuente(rango(sheetId, g.desvioCab, g.desvioCab, 2, g.desvioColN)) } }],
        series: [
          { series: fuente(rango(sheetId, g.desvioEsperado, g.desvioEsperado, 2, g.desvioColN)), targetAxis: 'LEFT_AXIS', color: GRIS },
          { series: fuente(rango(sheetId, g.desvioReal, g.desvioReal, 2, g.desvioColN)), targetAxis: 'LEFT_AXIS', color: ACENTO },
        ],
        headerCount: 0,
      },
    }, sheetId, 52)
}

/**
 * NÚCLEO PURO: qué gráficos son dibujables con las filas que trae la grilla, y cuáles no y por qué.
 *
 * SEPARADO DE LA LLAMADA A GOOGLE PARA PODER PROBARLO. Devolver "no se puede" es una respuesta
 * legítima —el contraste no existe en enero, porque no hay meses cerrados—; lo que no es legítimo es
 * devolver `[]` en silencio, que ya pasó una vez y dejó una pestaña sin gráficos sin que el log
 * dijera una palabra.
 *
 * @param {object} g las filas y columnas que ubicó el generador
 * @returns {{dibujables:Array<{clave:string,requiere:string[]}>, omitidos:Array<{clave:string,falta:string[]}>}}
 */
export function planDeGraficos(g = {}) {
  const CATALOGO = [
    { clave: 'liquidez', requiere: ['filaCab', 'filaCierre', 'filaColchon', 'colN'] },
    { clave: 'entradasSalidas', requiere: ['filaCab', 'filaEntradas', 'filaSalidas', 'colN'] },
    { clave: 'puente', requiere: ['puente0', 'puente1', 'puenteCol'] },
    { clave: 'desvio', requiere: ['desvioCab', 'desvioEsperado', 'desvioReal', 'desvioColN'] },
  ]
  const dibujables = []
  const omitidos = []
  for (const c of CATALOGO) {
    const falta = c.requiere.filter((k) => !g[k])
    if (falta.length) omitidos.push({ clave: c.clave, falta })
    else dibujables.push(c)
  }
  return { dibujables, omitidos }
}

const CONSTRUCTOR = {
  liquidez: graficoLiquidez,
  entradasSalidas: graficoEntradasSalidas,
  puente: graficoPuente,
  desvio: graficoDesvio,
}

/**
 * Los requests para dejar los gráficos de una pestaña como corresponde: borrar los PROPIOS y dibujar.
 *
 * NO ROMPE LA CORRIDA SI NO SE PUEDEN LEER LOS EXISTENTES. Un gráfico resume la tabla: si no se puede
 * dibujar, la tabla tiene que quedar igual de bien. Por eso el que llama manda estos requests en su
 * PROPIO lote — un `addChart` que falle no puede tirarse abajo el formato de la pestaña entera.
 */
export async function requestsDeGraficos(google, fileId, sheetId, g, pestana = '') {
  const { dibujables, omitidos } = planDeGraficos(g)
  for (const o of omitidos) console.warn(`  ⚠ ${pestana}: no dibujo "${o.clave}" — la grilla no trae ${o.falta.join(', ')}`)
  if (!dibujables.length) return []
  const hojas = await google.getCharts(fileId).catch((e) => { console.warn(`  ⚠ ${pestana}: getCharts falló: ${e.message}`); return null })
  if (!hojas) {
    // NO PODER LEER LOS EXISTENTES NO ES "NO HAY NINGUNO": dibujar igual apilaría un juego más en cada
    // corrida. Sin la lectura no se puede decidir, así que no se dibuja y se dice por qué.
    console.warn(`  ⚠ ${pestana}: NO dibujo — no pude leer los existentes, y dibujar sin borrar los apila`)
    return []
  }
  const mios = (hojas.find((h) => h.sheetId === sheetId)?.charts ?? []).filter((c) => String(c.title ?? '').startsWith(MARCA))
  if (mios.length) console.log(`  🗑 ${pestana}: borro ${mios.length} gráfico(s) míos de la corrida anterior`)
  return [
    ...mios.map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId } })),
    ...dibujables.map((c) => CONSTRUCTOR[c.clave](sheetId, g)),
  ]
}
