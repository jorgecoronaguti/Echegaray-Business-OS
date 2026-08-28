// LOS GRÁFICOS DE LOS DOS CASH FLOW — DOS, Y CADA UNO CONTESTA UNA PREGUNTA QUE SE DECIDE.
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
//   · WATERFALL del año por actividad — lo borró el dueño, y con razón: resume el pasado en tres
//     cifras que ya están en el cuerpo del cuadro con sus rótulos.
//
// Los dos que quedan, y qué decide cada uno:
//   1. COMBO DE LIQUIDEZ — barras de lo que entra y lo que sale, línea de la posición acumulada y
//      línea del colchón → en qué período no alcanza la plata, por qué, y cuánta hay que conseguir.
//   2. LO ESPERADO CONTRA LO COBRADO → qué supuesto de cobranza falló, que es el que hay que corregir.
//
// ═══ LEEN LAS MISMAS CELDAS QUE LA TABLA — NUNCA UNA SEGUNDA FUENTE ═══
//
// Un gráfico con su propio cálculo es la forma más elegante de tener dos verdades. Los dos apuntan
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
// · `BasicChartDomain.domain` ES un `ChartData` DIRECTO — `{ domain: { data: … } }` mete un campo
//   `data` que la referencia de la API no declara para un basicChart (sí para un waterfall, que es de
//   donde salió la confusión). Un dominio que la API descarta no da error: el gráfico se dibuja con
//   las categorías numeradas 1, 2, 3… en vez de las fechas, y nadie lo nota hasta mirarlo.
//   NO ESTÁ VERIFICADO CONTRA LA API VIVA: desde un worktree no se escribe al Sheet. Se corrige a la
//   forma documentada y la primera corrida real desde el árbol principal lo confirma o lo desmiente.
// · Un waterfall NO acepta más de un `sourceRange` por eje, ni `color` dentro de `connectorLineStyle`.

import { GRAFICO } from './cash-flow-matriz.mjs'
import { ANCHOS, ALTO_FILA } from './cash-flow-piel-matriz.mjs'

/**
 * La columna donde se anclan los gráficos de las vistas de LÍNEAS (`cash-flow-rehacer`), contada desde
 * 0. Va HOLGADAMENTE a la derecha de ese cuadro para no taparlo nunca.
 *
 * Las MATRICES no la usan: se anclan debajo del cuadro, en la columna B. Ver `colAncla`.
 */
export const COL_ANCLA = 58

/** El prefijo que marca un gráfico como PROPIO. Lo que no lo lleve, no se toca. */
export const MARCA = '⟡ '
export const TITULO_LIQUIDEZ = `${MARCA}Liquidez — lo que entra, lo que sale y hasta dónde baja la caja`
export const TITULO_DESVIO = `${MARCA}Cobranzas: lo esperado contra lo cobrado`
// RETIRAR UN GRÁFICO NO DEJA HUÉRFANOS, y por eso el borrado es por MARCA y no por la lista de los
// que se van a dibujar: los que ya estén en el Sheet con el prefijo se borran igual, se sigan
// dibujando o no. Un catálogo que borrara "los míos de esta corrida" dejaría el juego viejo abajo.

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

/**
 * El envoltorio común: título, subtítulo que dice qué se decide, y posición flotante.
 *
 * `hiddenDimensionStrategy: SHOW_ALL` NO ES OPCIONAL para las vistas de bloques. Su serie vive en la
 * zona auxiliar, que está OCULTA a propósito (es maquinaria), y el default de Sheets
 * —SKIP_HIDDEN_ROWS_AND_COLUMNS— la descarta: el gráfico sale vacío sin dar ningún error.
 */
const chart = (titulo, subtitulo, spec, sheetId, fila, alto = 280, col = COL_ANCLA, ancho = 760) => ({
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
        hiddenDimensionStrategy: 'SHOW_ALL',
        ...spec,
      },
      position: { overlayPosition: { anchorCell: { sheetId, rowIndex: fila, columnIndex: col }, widthPixels: ancho, heightPixels: alto } },
    },
  },
})

/**
 * 1. LA CURVA DE LIQUIDEZ — UN SOLO COMBO, PORQUE LA PREGUNTA ES UNA SOLA.
 *
 * ═══ POR QUÉ UN COMBO Y NO DOS GRÁFICOS (05/08/2026) ═══
 *
 * Acá había dos: una LÍNEA con el cierre y un COLUMN con entradas contra salidas. Contestan media
 * pregunta cada uno. La pregunta que se le hace a un cash flow es *"¿en qué semana me quedo corto, y
 * por qué?"* — el saldo dice CUÁNDO y el movimiento dice POR QUÉ, y separados hay que alternar la
 * vista entre dos dibujos con el mismo eje horizontal para cruzarlos a ojo. Superpuestos, el período
 * donde la barra de salida se despega de la de entrada es visiblemente el mismo donde la línea cae:
 * la causa y el efecto quedan en la misma columna de píxeles.
 *
 * El dueño lo pidió con ese nombre: barras de entra/sale más LÍNEA de posición acumulada.
 *
 * ═══ Y POR QUÉ NO UN WATERFALL ═══
 *
 * El waterfall que se dibujó antes en este cuadro lo borró el dueño. Muestra el recorrido del AÑO
 * ENTERO abierto por actividad: es un resumen del pasado, no una alarma sobre el futuro, y las tres
 * cifras que resume ya están en el cuerpo del cuadro con sus rótulos. Con él se fue `bloquePuente`,
 * que existía SÓLO para ponerle las tres filas contiguas (la API rechaza un waterfall con el eje
 * partido en varios rangos): tres celdas que no hacían más que referenciar a otras tres.
 *
 * ═══ LA LÍNEA DEL COLCHÓN ES LA QUE CONVIERTE "BAJA" EN "BAJA DEMASIADO" ═══
 *
 * Sheets no tiene línea de umbral, así que el colchón va como una cuarta serie que apunta a la MISMA
 * fila del cuadro que lee el bloque de liquidez. El umbral del gráfico y el de la tabla no pueden
 * discrepar porque son la misma celda.
 *
 * `type` POR SERIE es lo que hace COMBO a un basicChart: sin él, las cuatro salen del mismo tipo y
 * la posición acumulada aparece como una barra más, que es exactamente lo que no se quiere ver.
 */
export function graficoLiquidez(sheetId, g) {
  const fila = (f) => fuente(rango(sheetId, f, f, 2, g.colN))
  return chart(TITULO_LIQUIDEZ,
    'Donde la línea cruza el colchón hay que decidir financiamiento; donde cruza el cero, ya no es opcional. Las barras dicen por qué',
    {
      basicChart: {
        chartType: 'COMBO',
        legendPosition: 'BOTTOM_LEGEND',
        axis: [
          { position: 'BOTTOM_AXIS', format: texto(9) },
          { position: 'LEFT_AXIS', title: 'Movimiento del período', format: texto(9) },
          { position: 'RIGHT_AXIS', title: 'Posición de caja', format: texto(9) },
        ],
        domains: [{ domain: fila(g.filaCab) }],
        series: [
          // LAS BARRAS VAN AL EJE IZQUIERDO Y LA POSICIÓN AL DERECHO, Y NO ES estética: el movimiento
          // de una semana y el saldo acumulado están en órdenes de magnitud distintos. En un solo eje,
          // la curva de posición aplasta las barras contra el piso y deja de leerse cuál es la semana
          // que no se paga sola — que es la mitad de lo que este gráfico existe para mostrar.
          { series: fila(g.filaEntradas), targetAxis: 'LEFT_AXIS', type: 'COLUMN', color: ACENTO },
          { series: fila(g.filaSalidas), targetAxis: 'LEFT_AXIS', type: 'COLUMN', color: GRIS_CLARO },
          { series: fila(g.filaCierre), targetAxis: 'RIGHT_AXIS', type: 'LINE', color: INK, lineStyle: { width: 2, type: 'SOLID' } },
          { series: fila(g.filaColchon), targetAxis: 'RIGHT_AXIS', type: 'LINE', color: ALERTA, lineStyle: { width: 1, type: 'MEDIUM_DASHED' } },
        ],
        headerCount: 0,
      },
    }, sheetId, 1, 340)
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
        domains: [{ domain: fuente(rango(sheetId, g.desvioCab, g.desvioCab, 2, g.desvioColN)) }],
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
    // El combo necesita las CUATRO series. Si falta una fila, se omite ENTERO en vez de dibujarse a
    // medias: un gráfico de liquidez sin la línea del colchón muestra una curva que baja y no dice si
    // eso está mal — es peor que no tenerlo, porque parece que la pregunta ya está contestada.
    { clave: 'liquidez', requiere: ['filaCab', 'filaCierre', 'filaColchon', 'filaEntradas', 'filaSalidas', 'colN'] },
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


// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS GRÁFICOS DE LAS DOS MATRICES (06/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// TRES, NO CUATRO, y anclados DEBAJO de su cuadro. Los de la versión de bloques leían la zona auxiliar
// oculta y se anclaban en la columna 59 —la razón por la que la hoja tenía que medir 62 columnas para
// mostrar 3—. Ahora leen las FILAS de la propia matriz: la misma celda que muestra la tabla, así que
// no existe forma de que un gráfico diga algo distinto.
//
// Se descartó el cuarto (real contra proyectado apilado): las dos filas ya están una debajo de la otra
// en el cuadro, con su total al final. Un gráfico que repite una lectura que la tabla ya da no entra.

export const TITULO_ENTRA_SALE = `${MARCA}Lo que entra y lo que sale, mes a mes`
export const TITULO_TENDENCIA = `${MARCA}Tendencia del resultado neto`
export const TITULO_LIQUIDEZ_SEM = `${MARCA}Liquidez proyectada, semana a semana`

/** Una FILA de la matriz (de la primera columna de tiempo hasta la última) como fuente de serie. */
const filaMatriz = (sheetId, meta, fila) =>
  fuente(rango(sheetId, fila, fila, meta.cab.col0 + 1, meta.cab.col0 + meta.cab.n))

// ═══ DÓNDE SE ANCLAN, Y POR QUÉ SE MIDEN EN COLUMNAS ═══
//
// Debajo del cuadro, con dos renglones de aire (`meta.grafico.fila` ya es filaFin+2) y desde la
// COLUMNA B: contra el rótulo de la columna A el gráfico no respira. El tamaño se declara en columnas
// y filas del propio cuadro (`GRAFICO`) y se convierte a píxeles con el ancho y el alto reales de la
// pestaña — así el gráfico ocupa un número entero de columnas y el footprint que lo aloja sale de la
// MISMA declaración. Un alto en píxeles inventado acá y un footprint calculado allá se separan en la
// primera fila que se agregue, y `deleteDimension` amputa el gráfico sin decir nada.
const ANCHO_PX = (tipo) => GRAFICO.cols[tipo] * ANCHOS.tiempo
const ALTO_PX = GRAFICO.filas * ALTO_FILA
/** La columna del gráfico `i` de una vista: lado a lado, con una columna de aire entre ellos. */
const colAncla = (tipo, i = 0) => GRAFICO.col0 + i * (GRAFICO.cols[tipo] + GRAFICO.aire)

const ejes = (tituloIzq) => [
  { position: 'BOTTOM_AXIS', format: texto(9) },
  { position: 'LEFT_AXIS', title: tituloIzq, format: texto(9) },
]

/** SEMANAL · dónde cruza el cero la caja proyectada. Lee la fila de saldo final. */
export function graficoLiquidezSemanal(sheetId, meta) {
  return chart(TITULO_LIQUIDEZ_SEM,
    'Donde la línea cruza el cero ya no es una decisión de tesorería: es financiamiento',
    {
      basicChart: {
        chartType: 'LINE', legendPosition: 'NO_LEGEND',
        axis: ejes('Saldo proyectado'),
        domains: [{ domain: filaMatriz(sheetId, meta, meta.cab.fila) }],
        series: [{ series: filaMatriz(sheetId, meta, meta.fila.saldoFinal), targetAxis: 'LEFT_AXIS', color: ACENTO, lineStyle: { width: 2, type: 'SOLID' } }],
        headerCount: 0,
      },
    }, sheetId, meta.grafico.fila - 1, ALTO_PX, colAncla('semana'), ANCHO_PX('semana'))
}

/**
 * MENSUAL · el mes donde las barras de salida superan a las de entrada consume caja.
 *
 * Cuatro series agrupadas y NO apiladas: `STACKED` en un basicChart apila TODAS las series en una
 * sola barra, o sea que sumaría los ingresos con los egresos. Lo que el dueño llama "combinadas
 * real+proy" se lee por color: los dos tonos oscuros son lo que entra, los dos claros lo que sale.
 */
export function graficoEntradasSalidas(sheetId, meta) {
  const serie = (clave, color) => ({ series: filaMatriz(sheetId, meta, meta.fila[clave]), targetAxis: 'LEFT_AXIS', color })
  return chart(TITULO_ENTRA_SALE,
    'Donde la barra de salidas supera a la de entradas, el mes se paga con caja acumulada',
    {
      basicChart: {
        chartType: 'COLUMN', legendPosition: 'BOTTOM_LEGEND',
        axis: ejes('Movimiento del mes'),
        domains: [{ domain: filaMatriz(sheetId, meta, meta.cab.fila) }],
        series: [
          serie('ingresoReal', ACENTO), serie('ingresoProyectado', GRIS),
          serie('egresoReal', INK), serie('egresoProyectado', GRIS_CLARO),
        ],
        headerCount: 0,
      },
    }, sheetId, meta.grafico.fila - 1, ALTO_PX, colAncla('mes', 0), ANCHO_PX('mes'))
}

/** MENSUAL · una sola línea: si baja tres meses seguidos, no es un mes malo. */
export function graficoTendencia(sheetId, meta) {
  return chart(TITULO_TENDENCIA,
    'Tres meses seguidos en baja no son un mes malo: son una tendencia, y se corrige antes',
    {
      basicChart: {
        chartType: 'LINE', legendPosition: 'NO_LEGEND',
        // El eje nombra lo que la fila mide: caja percibida, no resultado devengado (ver el TRONCO).
        axis: ejes('Variación de caja del mes'),
        domains: [{ domain: filaMatriz(sheetId, meta, meta.cab.fila) }],
        series: [{ series: filaMatriz(sheetId, meta, meta.fila.resultado), targetAxis: 'LEFT_AXIS', color: INK, lineStyle: { width: 2, type: 'SOLID' } }],
        headerCount: 0,
      },
    // LADO A LADO con el de entradas y salidas, no debajo: son la misma pregunta mirada de dos formas
    // ("¿qué mes consume caja?" y "¿es un mes o una tendencia?") y comparadas de un vistazo se
    // responden juntas. Apilados, la segunda exigía scroll y nadie la miraba.
    }, sheetId, meta.grafico.fila - 1, ALTO_PX, colAncla('mes', 1), ANCHO_PX('mes'))
}

const CONSTRUCTOR_MATRIZ = {
  liquidezSemanal: graficoLiquidezSemanal,
  entradasSalidas: graficoEntradasSalidas,
  tendencia: graficoTendencia,
}

/**
 * NÚCLEO PURO: qué gráficos lleva cada vista, y por qué no los otros.
 *
 * Devolver "no se puede" es una respuesta legítima —el semanal no tiene serie mensual—; lo que no es
 * legítimo es devolver `[]` en silencio, que ya dejó una pestaña sin gráficos sin que el log dijera
 * una palabra.
 */
export function planDeGraficosMatriz(meta = {}) {
  const CATALOGO = [
    { clave: 'liquidezSemanal', tipo: 'semana', filas: ['saldoFinal'] },
    { clave: 'entradasSalidas', tipo: 'mes', filas: ['ingresoReal', 'ingresoProyectado', 'egresoReal', 'egresoProyectado'] },
    { clave: 'tendencia', tipo: 'mes', filas: ['resultado'] },
  ]
  const dibujables = []
  const omitidos = []
  for (const c of CATALOGO) {
    const falta = []
    if (meta.tipo !== c.tipo) falta.push(`es una vista de ${c.tipo}`)
    else {
      if (!meta.cab?.n || !meta.grafico?.fila) falta.push('la geometría del cuadro')
      for (const f of c.filas) if (!meta.fila?.[f]) falta.push(f)
    }
    if (falta.length) omitidos.push({ clave: c.clave, falta })
    else dibujables.push(c)
  }
  return { dibujables, omitidos }
}

/**
 * Los gráficos de una matriz, en dos listas SEPARADAS: los que hay que borrar y los que hay que dibujar.
 *
 * Separadas porque el generador tiene que borrar ANTES de achicar la hoja: un gráfico anclado en la
 * columna 59 del diseño anterior vive en un territorio que este rediseño elimina, y borrar la columna
 * con el objeto adentro es pedirle a la API que decida por uno.
 *
 * BORRA TODOS, NO SÓLO LOS MARCADOS. Es la excepción del repo y es del rediseño: estas dos pestañas se
 * rehicieron enteras por pedido del dueño, y los gráficos que había apuntan a celdas que hoy significan
 * otra cosa. Fuera de estas dos pestañas sigue mandando la MARCA.
 */
export async function requestsDeGraficosMatriz(google, fileId, sheetId, meta, pestana = '') {
  const { dibujables, omitidos } = planDeGraficosMatriz(meta)
  for (const o of omitidos) console.log(`  · ${pestana}: no dibujo "${o.clave}" — ${o.falta.join(', ')}`)
  const hojas = await google.getCharts(fileId).catch((e) => { console.warn(`  ⚠ ${pestana}: getCharts falló: ${e.message}`); return null })
  if (!hojas) {
    // NO PODER LEER LOS EXISTENTES NO ES "NO HAY NINGUNO": dibujar igual apilaría un juego más en cada
    // corrida. Sin la lectura no se puede decidir, así que no se dibuja y se dice por qué.
    console.warn(`  ⚠ ${pestana}: NO dibujo — no pude leer los existentes, y dibujar sin borrar los apila`)
    return { borrar: [], dibujar: [] }
  }
  const viejos = hojas.find((h) => h.sheetId === sheetId)?.charts ?? []
  if (viejos.length) console.log(`  🗑 ${pestana}: borro ${viejos.length} gráfico(s) de la estructura anterior`)
  return {
    borrar: viejos.map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId } })),
    dibujar: dibujables.map((c) => CONSTRUCTOR_MATRIZ[c.clave](sheetId, meta)),
  }
}
