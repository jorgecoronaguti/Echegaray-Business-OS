// CASH FLOW SEMANAL — EL AÑO ENTERO EN UNA MATRIZ: FILAS DE CONCEPTO, COLUMNAS DE TIEMPO.
//
// ═══ QUÉ REEMPLAZA (06/08/2026) ═══
//
// A la agenda de catorce bloques diarios (`cash-flow-agenda.mjs`). Contestaba bien "¿qué pasa el
// jueves?" y muy mal la pregunta que se le hace todos los días a un cash flow: *"¿cómo viene el
// trimestre y en qué semana no alcanza?"*. Eran 98 filas para catorce días, y comparar dos días
// exigía recordar el bloque de arriba mientras se leía el de abajo. El dueño lo rechazó y pidió
// volver a la claridad de siempre: **una fila por concepto, todo el tiempo a la derecha**.
//
// ═══ POR QUÉ EL AÑO ENTERO Y NO TRECE SEMANAS (06/08/2026, segunda corrección) ═══
//
// La primera versión mostraba el rodante de trece semanas que pide la skill de tesorería. El dueño lo
// rechazó por la misma razón por la que ya había rechazado el rodante en la vista de líneas: un cuadro
// que arranca en la semana corriente **esconde la historia del ejercicio** —las semanas ya cerradas,
// que son contra las que se compara lo que viene— y mete columnas del año siguiente en una pestaña
// rotulada 2026. Ahora son las 53 semanas de 2026: la primera es la del lunes 29/12/2025, que contiene
// el 1° de enero.
//
// ═══ LAS DOS VISTAS SÍ CUBREN EL MISMO PERÍODO — DESDE EL 13/08/2026, Y ANTES NO ═══
//
// El 06/08 acá se midió que no: el semanal iba de [29/12/2025, 4/1/2027) y el mensual de [1/1/2026,
// 1/1/2027), tres días de más de cada lado, y se anotó que "no es un defecto arreglable" porque una
// semana ISO que cruza el 1° de enero tiene que caer en algún lado. **La semana cae en algún lado; lo
// que se suma, no tiene por qué.** El 13/08 el archivo vivo mostraba $13.073.317 de egresos de enero
// de 2027 dentro del resultado del año 2026 y, peor, hundiendo el PISO DEL PERÍODO.
//
// Ahora la COLUMNA sigue siendo la semana del 28/12 —su encabezado no se mueve— y su VENTANA corta en
// el 1/1/2027. El recorte vive en `cash-flow-borde-anio.mjs`, con el porqué de haber descartado la
// alternativa (que el TOTAL filtrara el libro directo). Las dos columnas TOTAL ahora tienen que
// coincidir, y `cash-flow-cuadre.mjs` las compara fila por fila en cada corrida.
//
// Lo que `bordesEntreVistas` mide sigue siendo real y ya no es una excusa: son los movimientos del año
// vecino que las semanas ISO del cuadro TOCAN y que ninguna columna suma. Pertenecen al otro ejercicio.
//
// Lo que se paga por el año entero: hay scroll horizontal. Se compensa con la columna A congelada y
// el atajo "📅 hoy", que salta a la columna de la semana corriente.
//
// LAS SEMANAS ANTERIORES AL CORTE DE CAJA MUESTRAN SUS FLUJOS Y NO SU SALDO. Los flujos son historia
// del libro y se ven; el saldo NO se puede reconstruir hacia atrás desde un saldo declarado hoy, así
// que va en blanco hasta la semana que contiene el corte (rol ANTES de `cash-flow-ancla-saldo`). Un
// cero ahí se leería como "la empresa cerró esa semana sin plata", que es una afirmación que nadie hizo.
//
// ═══ LO QUE NO ESTÁ ACÁ, Y DÓNDE ESTÁ ═══
//
// · El costo financiero estimado (interés del descubierto, comisiones, impuesto al cheque) vive en
//   "Impuestos y Financieros". No son movimientos cargados sino modelo del OS, y mezclarlos con el
//   libro hacía que un saldo semanal dependiera de una estimación sin que se viera.
// · El vencido sin conciliar vive en el bloque A6 del anexo de CAJA, que es donde se resuelve.
// · El detalle movimiento por movimiento vive en el Libro (`_MOVIMIENTOS`).
//
// El dueño fue explícito: "no agregar información, no agregar métricas". Después de la fila del saldo
// final no va NADA.

import { ESTADOS_PENDIENTES } from './cash-flow-medidas.mjs'
import {
  COL, FILA,
  conceptosDe, filaDeConcepto, colTotal, columnasDeTiempo, filaGraficos, footprintDe,
  medidasDeLaMatriz, bloquesDeMedida, formulasDeMedida,
  expresionVentana, formulaMayorImporte, formulaMayorContraparte,
  ventanas, celda, rangoFila, serialDeFecha, URL_ARCHIVO, ROTULO_HOY, ROTULO_CONCEPTO,
} from './cash-flow-matriz.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { bloquesDeCliente, filaTituloPorCliente, formulasPorCliente } from './cash-flow-por-cliente.mjs'
import { expresionInicioCorrido } from './cash-flow-ancla-saldo.mjs'
import { columnasDelPasado, expresionRotulo } from './cash-flow-hoy.mjs'
import { acotarAlEjercicio, bordeDelEjercicio, expresionAcotada } from './cash-flow-borde-anio.mjs'
import { expresionInvertido, glosaConInvertido, muestraSemanal } from './cash-flow-invertido.mjs'

/** El nombre de la pestaña. Único lugar donde se escribe. */
export const PESTANA_SEMANAL = 'Cash Flow Semanal'
const TIPO = 'semana'

/**
 * EL TÍTULO VA EN ORACIÓN, NO EN VERSALITA, y no es una licencia: `patron-pestana.mjs` mide esa regla
 * en toda pestaña del archivo ("El título va en oración, no en versalita"). Son las mismas palabras
 * que pidió el dueño; lo único que cambia es que no grita.
 */
const TITULO = 'Cash Flow Semanal'

/** Dónde arranca cada una de las cuatro cifras del hero. Ver `bloqueHero`. */
const SLOTS_HERO = Object.freeze([0, 3, 7, 11])

/**
 * LOS CUATRO RÓTULOS DEL TITULAR, en una sola lista para que el auditor de ancho los mida sin raspar
 * la grilla. NO son las cuatro del Mensual y no tienen por qué serlo: el Semanal contesta "¿con qué
 * arranco, cuál es el punto más bajo del recorrido y qué dos movimientos lo mueven?".
 */
export const ROTULOS_HERO = Object.freeze([
  'CAJA HOY', 'PISO DEL PERÍODO', 'MAYOR PAGO · PRÓXIMOS 7 DÍAS', 'MAYOR COBRO · PRÓXIMOS 7 DÍAS',
])

/**
 * NÚCLEO PURO: la grilla entera de la pestaña. No toca la red: se prueba fórmula por fórmula.
 *
 * @param {object} p
 * @param {Date} p.hoy sólo decide el año por defecto: las columnas son las del ejercicio, no las que vienen
 * @param {number} p.anio el ejercicio que cubre la pestaña
 * @param {{saldo:string|null, fecha:string|null, minima:string|null}} p.refs rangos con nombre de CAJA
 * @param {number|null} p.gid  sheetId de la propia pestaña, para el vínculo "hoy". Sin él, no hay vínculo.
 * @returns {{filas:any[][], meta:object}}
 */
export function grillaSemanal({ hoy = new Date(), anio = null, refs = {}, gid = null } = {}) {
  const { saldo: refSaldo = null, fecha: refFecha = null } = refs
  const ejercicio = anio ?? hoy.getUTCFullYear()
  const filas = []
  const poner = (fila, col, valor) => {
    const f = filas[fila - 1] || (filas[fila - 1] = [])
    f[col] = valor
  }
  const n = columnasDeTiempo(TIPO, ejercicio)
  const cT = colTotal(TIPO, ejercicio)
  const semanas = ventanas(TIPO, { anio: ejercicio })
  const footprint = footprintDe(TIPO, ejercicio)
  const fila = Object.fromEntries(conceptosDe(TIPO).map((c) => [c.clave, filaDeConcepto(TIPO, c.clave)]))
  const meta = {
    pestana: PESTANA_SEMANAL, tipo: TIPO, anio: ejercicio, ancho: footprint.cols, footprint,
    cab: { fila: FILA.cabecera, col0: COL.tiempo0, n, colTotal: cT },
    fila, hero: { rotulo: FILA.heroRotulo, valor: FILA.heroValor, nota: FILA.heroNota, slots: SLOTS_HERO },
    bloques: bloquesDeMedida(TIPO),
    clientes: { titulo: filaTituloPorCliente(TIPO), bloques: bloquesDeCliente(TIPO) },
    grafico: { fila: filaGraficos(TIPO), col: COL.tiempo0 },
    // LAS SEMANAS ISO (el encabezado y el pliegue) Y LO QUE DE ELLAS PERTENECE AL EJERCICIO.
    //
    // Son dos cosas distintas y confundirlas costó $13,07M de egresos de enero de 2027 metidos en el
    // año 2026. `ventanas` son los lunes —de ahí sale el rótulo de la columna—; `efectivas` es lo que
    // cada columna SUMA, recortado en el borde del año. Ver cash-flow-borde-anio.mjs.
    ventanas: semanas,
    efectivas: acotarAlEjercicio(semanas, ejercicio),
    cubre: bordeDelEjercicio(ejercicio),
    // QUÉ SE PLIEGA AL ABRIR. Sale de `hoy`, que el llamador inyecta: el pliegue tiene que poder
    // probarse moviendo la fecha, no esperando al lunes. Ver cash-flow-hoy.mjs.
    plegar: columnasDelPasado(semanas, hoy, { col0: COL.tiempo0 }),
  }

  // ── 1 y 2. El título, de dónde sale todo, y el atajo a la semana corriente ───────────────────────
  poner(FILA.titulo, 0, `${TITULO} ${ejercicio}`)
  poner(FILA.subtitulo, 0,
    '="Qué se cobra, qué se paga y con cuánto cierra cada semana · del libro de movimientos · al "&TEXT(TODAY();"d/mm/yyyy")')
  // EL BOTÓN VA EN A3, NO EN LA COLUMNA TOTAL (06/08, pedido del dueño): en la columna 55 el atajo
  // existía y nadie lo veía — un vínculo que hay que scrollear para encontrar no ahorra el scroll.
  const vinculo = vinculoHoy(gid, meta)
  if (vinculo) { poner(FILA.botonHoy, 0, vinculo); meta.botonHoy = { fila: FILA.botonHoy, col: 0 } }

  bloqueHero(poner, meta, refs)

  // ── La cabecera: el concepto y los lunes del ejercicio ───────────────────────────────────────────
  poner(FILA.cabecera, 0, ROTULO_CONCEPTO)
  semanas.forEach((v, j) => poner(FILA.cabecera, COL.tiempo0 + j, serialDeFecha(v.desde)))
  poner(FILA.cabecera, cT, 'TOTAL')

  // ── Las siete filas de concepto ──────────────────────────────────────────────────────────────────
  for (const c of conceptosDe(TIPO)) poner(fila[c.clave], 0, c.rotulo)
  for (let j = 0; j < n; j++) columnaDeSemana(poner, meta, j, { refSaldo, refFecha, n })
  for (const c of conceptosDe(TIPO)) {
    if (c.total) poner(fila[c.clave], cT, `=SUM(${rangoFila(fila[c.clave], COL.tiempo0, COL.tiempo0 + n - 1)})`)
  }

  meta.filaFin = filas.length
  return { filas, meta }
}

/**
 * LA GLOSA DE CAJA HOY — la tarjeta decía la MITAD de la caja (28/08/2026).
 *
 * Publicaba $28.319.557: la caja OPERATIVA de `CAJA_TOTAL_DISPONIBLE`, que excluye lo invertido por la
 * decisión del 06/08. El número es el correcto para decidir un pago —una cuenta comitente no cubre un
 * cheque mañana— y el problema no era el número: la pestaña no declaraba en ningún lado que hay
 * $45.015.210 más en Balanz. Discriminar no es esconder.
 *
 * Sale de la MISMA fuente que la del Mensual (`cash-flow-invertido`), así que las dos vistas no pueden
 * decir dos cosas distintas sobre la misma plata.
 */
function glosaCajaHoy(refFecha, refCaja) {
  if (!refFecha) return 'Falta el saldo declarado de CAJA'
  return glosaConInvertido(`"al "&TEXT(${refFecha};"d/mm")`, expresionInvertido(refCaja))
}

/**
 * LAS CUATRO CIFRAS DEL TITULAR, en horizontal: rótulo en la fila 4, número en la 5.
 *
 * Cada una ocupa un "slot" que arranca en su columna y se extiende sobre las vacías de la derecha —el
 * rótulo y la glosa son texto y desbordan; el número ocupa su celda sola. Por eso el número va en
 * cuerpo 11 y no en 18 como en la versión de bloques: a 95px de ancho de columna, un importe en 18
 * no entra y Sheets lo tapa con "###" sin avisar. La jerarquía la hace la negrita y el color, no el
 * tamaño.
 *
 * TODAS SALEN DEL PROPIO CUADRO O DEL LIBRO. Ninguna repite un cálculo que ya está abajo.
 */
function bloqueHero(poner, meta, refs) {
  const { saldo: refSaldo = null, fecha: refFecha = null, caja: refCaja = null } = refs
  const [s1, s2, s3, s4] = meta.hero.slots
  const R = meta.hero.rotulo
  const V = meta.hero.valor
  // LA GLOSA BAJÓ A SU PROPIA FILA (28/08/2026). El cambio nace del Mensual —donde un importe de nueve
  // cifras salía cortado por tener una sola columna de 95 px— y se aplica igual acá porque las dos
  // vistas comparten la geometría a propósito: quien abre una y después la otra no tiene que volver a
  // buscar dónde está cada cosa. Y el Semanal tiene el mismo riesgo: CAJA HOY y el PISO DEL PERÍODO son
  // los dos importes del mismo tamaño.
  const G = meta.hero.nota
  const rangoFinal = rangoFila(meta.fila.saldoFinal, meta.cab.col0, meta.cab.col0 + meta.cab.n - 1)
  const rangoCab = rangoFila(meta.cab.fila, meta.cab.col0, meta.cab.col0 + meta.cab.n - 1)

  poner(R, s1, ROTULOS_HERO[0])
  poner(V, s1, refSaldo ? `=N(${refSaldo})` : '')
  poner(G, s1, glosaCajaHoy(refFecha, refCaja))

  // El piso del horizonte y CUÁNDO ocurre. `INDEX(rango;1;MATCH(…))` con la fila explícita: sobre un
  // rango de una sola fila, `INDEX(rango;n)` significa "la fila n" y no "la columna n" — devolvería
  // #REF! en vez de la fecha, y esa forma ambigua ya rompió un control de este archivo.
  poner(R, s2, ROTULOS_HERO[1])
  poner(V, s2, `=MIN(${rangoFinal})`)
  poner(G, s2, `="la semana del "&TEXT(INDEX(${rangoCab};1;MATCH(MIN(${rangoFinal});${rangoFinal};0));"d/mm")`)

  // Los dos mayores movimientos del período que se decide, CON el filtro de estado de la medida que
  // representan: son los que todavía NO ocurrieron. Un "mayor pago" sin ese filtro traía el pago más
  // grande YA hecho y lo mostraba como si fuera lo que viene.
  const desde = 'TODAY()'
  const hasta = 'TODAY()+7'
  const est = [...ESTADOS_PENDIENTES]
  poner(R, s3, ROTULOS_HERO[2])
  poner(V, s3, formulaMayorImporte(desde, hasta, -1, est))
  poner(G, s3, formulaMayorContraparte(desde, hasta, -1, est, celda(s3, V)))
  poner(R, s4, ROTULOS_HERO[3])
  poner(V, s4, formulaMayorImporte(desde, hasta, 1, est))
  poner(G, s4, formulaMayorContraparte(desde, hasta, 1, est, celda(s4, V)))
  // El piso se compara contra la caja mínima por FORMATO CONDICIONAL (cash-flow-piel-matriz), no con
  // una quinta cifra: el dato ya está, lo que faltaba era verlo.

  // LO QUE EL AUDITOR DE ANCHO PUEDE MEDIR, declarado por el generador. Los rótulos y la glosa de CAJA
  // HOY tienen texto acotado; las otras tres glosas terminan en un nombre de proveedor o de cliente que
  // sale del libro y no tiene tope conocido, así que declararlas con una muestra inventada mediría una
  // ficción. Se miden las que se pueden afirmar: un auditor que promete de más no es un auditor.
  meta.hero.piezas = [
    ...ROTULOS_HERO.map((texto, i) => ({ slot: i, pieza: 'rotulo', texto })),
    { slot: 0, pieza: 'nota', texto: muestraSemanal() },
  ]
}

/** Una columna de semana: las cuatro medidas del libro, el resultado y los dos saldos. */
function columnaDeSemana(poner, meta, j, { refSaldo, refFecha, n }) {
  const col = meta.cab.col0 + j
  const cab = celda(col, meta.cab.fila)
  // LA VENTANA SE RECORTA EN EL BORDE DEL AÑO, y sólo en las dos columnas que lo tocan. La primera
  // semana del ejercicio arranca en diciembre del anterior y la última se derrama sobre enero del
  // siguiente: sin el recorte, la columna del 28/12 se llevaba al año los movimientos del 01/01/2027 —
  // y con ellos el TOTAL y, peor, el PISO DEL PERÍODO. Ver cash-flow-borde-anio.mjs.
  const { desde, hasta } = expresionAcotada(expresionVentana(cab, meta.tipo),
    { anio: meta.anio, primera: j === 0, ultima: j === n - 1 })
  const f = meta.fila

  poner(f.saldoInicial, col, inicioDeLaSemana({
    desde, hasta, refSaldo, refFecha, anterior: j === 0 ? null : celda(col - 1, f.saldoFinal),
  }))
  // Cada medida trae su subtotal Y su apertura por rubro, de la misma función que usa el mensual.
  for (const c of medidasDeLaMatriz()) {
    for (const linea of formulasDeMedida(meta.tipo, c.clave, { col, desde, hasta })) poner(linea.fila, col, linea.formula)
  }
  poner(f.resultado, col,
    `=N(${celda(col, f.ingresoReal)})+N(${celda(col, f.ingresoProyectado)})`
    + `-N(${celda(col, f.egresoReal)})-N(${celda(col, f.egresoProyectado)})`)
  // Una semana sin cadena (anterior al corte) no tiene cierre: queda VACÍA, nunca en cero. Es la misma
  // regla que el mensual, y el motivo es el mismo: un cero se leería como "la empresa cerró esa semana
  // sin plata", que es una afirmación que nadie hizo. Los flujos de esa semana sí se ven — son historia.
  poner(f.saldoFinal, col,
    `=IF(N(${celda(col, f.saldoInicial)})=0;"";N(${celda(col, f.saldoInicial)})+N(${celda(col, f.resultado)}))`)
  // La sección POR CLIENTE va DESPUÉS del saldo: cuelga de los subtotales de arriba y su residuo los
  // resta. Escribirla antes no rompería nada —Sheets resuelve el orden solo— pero acá el orden de
  // escritura es el orden de lectura, y así el que audita sigue la dependencia de arriba hacia abajo.
  for (const linea of formulasPorCliente(meta.tipo, { col, desde, hasta })) poner(linea.fila, col, linea.formula)
}

/**
 * EL SALDO AL INICIO DE UNA SEMANA — los tres papeles de `cash-flow-ancla-saldo`, en una fórmula.
 *
 * Con el cuadro cubriendo el año entero hay semanas ANTERIORES al corte de CAJA, que antes no existían
 * (el rodante arrancaba en la semana corriente). Los tres casos son los que ya estaban probados:
 *
 *   ANTES     la semana termina antes o justo en el corte → no hay con qué reconstruir el saldo: VACÍO.
 *   ANCLA     el corte cae adentro → `expresionInicioCorrido` sobre el saldo declarado.
 *   ENCADENA  posterior → arranca donde cerró la anterior, y propaga el vacío si la anterior no cerró.
 *
 * Cuál es cuál lo decide la FÓRMULA y no este código: `refFecha` es un rango con nombre que se lee
 * cuando la hoja calcula, no cuando el generador escribe. El día que el dueño mueva el corte de CAJA,
 * el ancla se muda de columna sola.
 *
 * EL TÉRMINO `puestaAlDia` VALE CERO ACÁ, y se deja igual: es el contrato de `expresionInicioCorrido`
 * —lo que el control A5 del anexo de CAJA verifica— y su ventana [corte+1, lunes) es vacía por
 * construcción dentro de la rama ANCLA (ahí el lunes es anterior o igual al corte). Recortarlo sería
 * escribir a mano una variante de una función de ancla que está probada donde vive.
 *
 * Sin los dos rangos con nombre la celda va VACÍA y la pestaña lo dice en el hero: un ancla mal
 * apuntada es un cuadro entero mintiendo con cara de correcto.
 */
function inicioDeLaSemana({ desde, hasta, refSaldo, refFecha, anterior = null }) {
  if (!refSaldo || !refFecha) return ''
  const ancla = expresionInicioCorrido({
    refSaldo,
    // Sin techo en el corte: el total ya contiene todo lo REAL (ver cash-flow-meses). El término
    // puestaAlDia se conserva por contrato pero su ventana sigue vacía en la rama ancla.
    yaVivido: terminoLibro({ desde, estados: ['REAL'], medida: 'neto' }),
    puestaAlDia: terminoLibro({ desde: `${refFecha}+1`, hasta: desde, estados: ['REAL'], medida: 'neto' }),
  }).replace(/^=/, '')
  // El vacío de la primera columna se escribe como "" y no como la celda de la izquierda: a la
  // izquierda de la primera columna está el rótulo, y N("Saldo inicial") daría 0 sin avisar.
  const encadena = anterior ? `IF(N(${anterior})=0;"";${anterior})` : '""'
  return `=IF(${hasta}<=${refFecha};"";IF(${desde}<=${refFecha};${ancla};${encadena}))`
}

/**
 * DÓNDE ESTÁ LA SEMANA ACTUAL — y, de paso, un vínculo que lleva a ella.
 *
 * ═══ DEJÓ DE SER UN BOTÓN (13/08/2026) ═══
 *
 * El dueño lo reportó roto. No lo estaba el destino —calculaba AH7, la semana del 10/08— sino el
 * gesto: `HYPERLINK` necesita tres clics para navegar y el doble clic abre el modo edición. Un rótulo
 * en mayúsculas con un "⏵" adelante promete un botón que Sheets no puede dar.
 *
 * Ahora el rótulo INFORMA: "Semana actual: AH  ·  10/08", calculado por fórmula. Sirve sin hacer clic
 * —dice a qué columna scrollear y de qué lunes se está hablando— y se mueve solo cada lunes. El
 * vínculo sigue debajo, porque a tres gestos funciona y no cuesta nada.
 *
 * Y LO QUE DE VERDAD RESUELVE EL PROBLEMA NO ESTÁ ACÁ: es el pliegue del pasado (`meta.plegar`), que
 * hace que la pestaña abra directamente en la semana actual sin que nadie tenga que ir a ninguna parte.
 *
 * SI EL CUADRO QUEDÓ VIEJO, LA CELDA MUESTRA #N/A, Y ESTÁ BIEN: significa que hoy ya no cae en el
 * ejercicio que muestra la pestaña —cambió el año y nadie la regeneró—. Taparlo con un IFERROR
 * cambiaría un aviso por un vínculo que lleva a cualquier lado.
 */
export function vinculoHoy(gid, meta) {
  if (gid === null || gid === undefined) return null
  const rangoCab = rangoFila(meta.cab.fila, meta.cab.col0, meta.cab.col0 + meta.cab.n - 1)
  // WEEKDAY(fecha;3) devuelve 0 para el lunes: TODAY() menos eso ES el lunes de la semana corriente,
  // la misma definición con la que se generaron los encabezados.
  const lunes = 'TODAY()-WEEKDAY(TODAY();3)'
  const dir = `ADDRESS(${meta.cab.fila};MATCH(${lunes};${rangoCab};0)+${meta.cab.col0};4)`
  const rotulo = expresionRotulo(ROTULO_HOY.semana, dir, lunes, 'd/mm')
  // LA URL ENTERA, NO EL FRAGMENTO "#gid=…": con el fragmento suelto el clic no navega. Ver URL_ARCHIVO.
  return `=HYPERLINK("${URL_ARCHIVO()}#gid=${gid}&range="&${dir};${rotulo})`
}
