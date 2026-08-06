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
// rotulada 2026. Ahora son las 53 semanas de 2026 (la primera es la del lunes 29/12/2025, que contiene
// el 1° de enero) y el semanal cubre EXACTAMENTE el mismo período que el mensual.
//
// Lo que se paga por eso: hay scroll horizontal. Se compensa con la columna A congelada y el atajo
// "📅 hoy", que salta a la columna de la semana corriente.
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

import {
  COL, FILA, ESTADOS_PENDIENTES,
  conceptosDe, filaDeConcepto, colTotal, columnasDeTiempo, filaGraficos, footprintDe,
  medidasDeLaMatriz, bloquesDeMedida, formulasDeMedida,
  expresionVentana, formulaMayorImporte, formulaMayorContraparte,
  ventanas, celda, rangoFila, serialDeFecha,
} from './cash-flow-matriz.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { bloquesDeCliente, filaTituloPorCliente, formulasPorCliente } from './cash-flow-por-cliente.mjs'
import { expresionInicioCorrido } from './cash-flow-ancla-saldo.mjs'

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
    fila, hero: { rotulo: FILA.heroRotulo, valor: FILA.heroValor, slots: SLOTS_HERO },
    bloques: bloquesDeMedida(TIPO),
    clientes: { titulo: filaTituloPorCliente(TIPO), bloques: bloquesDeCliente(TIPO) },
    grafico: { fila: filaGraficos(TIPO), col: COL.tiempo0 },
    ventanas: semanas,
  }

  // ── 1 y 2. El título, de dónde sale todo, y el atajo a la semana corriente ───────────────────────
  poner(FILA.titulo, 0, `${TITULO} ${ejercicio}`)
  poner(FILA.subtitulo, 0,
    '="Qué se cobra, qué se paga y con cuánto cierra cada semana · del libro de movimientos · al "&TEXT(TODAY();"d/mm/yyyy")')
  const vinculo = vinculoHoy(gid, meta)
  if (vinculo) poner(FILA.subtitulo, cT, vinculo)

  bloqueHero(poner, meta, refs)

  // ── La cabecera: el concepto y los lunes del ejercicio ───────────────────────────────────────────
  poner(FILA.cabecera, 0, 'Concepto')
  semanas.forEach((v, j) => poner(FILA.cabecera, COL.tiempo0 + j, serialDeFecha(v.desde)))
  poner(FILA.cabecera, cT, 'TOTAL')

  // ── Las siete filas de concepto ──────────────────────────────────────────────────────────────────
  for (const c of conceptosDe(TIPO)) poner(fila[c.clave], 0, c.rotulo)
  for (let j = 0; j < n; j++) columnaDeSemana(poner, meta, j, { refSaldo, refFecha })
  for (const c of conceptosDe(TIPO)) {
    if (c.total) poner(fila[c.clave], cT, `=SUM(${rangoFila(fila[c.clave], COL.tiempo0, COL.tiempo0 + n - 1)})`)
  }

  meta.filaFin = filas.length
  return { filas, meta }
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
  const { saldo: refSaldo = null, fecha: refFecha = null } = refs
  const [s1, s2, s3, s4] = meta.hero.slots
  const R = meta.hero.rotulo
  const V = meta.hero.valor
  const rangoFinal = rangoFila(meta.fila.saldoFinal, meta.cab.col0, meta.cab.col0 + meta.cab.n - 1)
  const rangoCab = rangoFila(meta.cab.fila, meta.cab.col0, meta.cab.col0 + meta.cab.n - 1)

  poner(R, s1, 'CAJA HOY')
  poner(V, s1, refSaldo ? `=N(${refSaldo})` : '')
  poner(V, s1 + 1, refFecha ? `="al "&TEXT(${refFecha};"d/mm")` : 'Falta el saldo declarado de CAJA')

  // El piso del horizonte y CUÁNDO ocurre. `INDEX(rango;1;MATCH(…))` con la fila explícita: sobre un
  // rango de una sola fila, `INDEX(rango;n)` significa "la fila n" y no "la columna n" — devolvería
  // #REF! en vez de la fecha, y esa forma ambigua ya rompió un control de este archivo.
  poner(R, s2, 'PISO DEL PERÍODO')
  poner(V, s2, `=MIN(${rangoFinal})`)
  poner(V, s2 + 1, `="la semana del "&TEXT(INDEX(${rangoCab};1;MATCH(MIN(${rangoFinal});${rangoFinal};0));"d/mm")`)

  // Los dos mayores movimientos del período que se decide, CON el filtro de estado de la medida que
  // representan: son los que todavía NO ocurrieron. Un "mayor pago" sin ese filtro traía el pago más
  // grande YA hecho y lo mostraba como si fuera lo que viene.
  const desde = 'TODAY()'
  const hasta = 'TODAY()+7'
  const est = [...ESTADOS_PENDIENTES]
  poner(R, s3, 'MAYOR PAGO · PRÓXIMOS 7 DÍAS')
  poner(V, s3, formulaMayorImporte(desde, hasta, -1, est))
  poner(V, s3 + 1, formulaMayorContraparte(desde, hasta, -1, est, celda(s3, V)))
  poner(R, s4, 'MAYOR COBRO · PRÓXIMOS 7 DÍAS')
  poner(V, s4, formulaMayorImporte(desde, hasta, 1, est))
  poner(V, s4 + 1, formulaMayorContraparte(desde, hasta, 1, est, celda(s4, V)))
  // El piso se compara contra la caja mínima por FORMATO CONDICIONAL (cash-flow-piel-matriz), no con
  // una quinta cifra: el dato ya está, lo que faltaba era verlo.
}

/** Una columna de semana: las cuatro medidas del libro, el resultado y los dos saldos. */
function columnaDeSemana(poner, meta, j, { refSaldo, refFecha }) {
  const col = meta.cab.col0 + j
  const cab = celda(col, meta.cab.fila)
  const { desde, hasta } = expresionVentana(cab, meta.tipo)
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
    yaVivido: terminoLibro({ desde, hasta: `${refFecha}+1`, estados: ['REAL'], medida: 'neto' }),
    puestaAlDia: terminoLibro({ desde: `${refFecha}+1`, hasta: desde, estados: ['REAL'], medida: 'neto' }),
  }).replace(/^=/, '')
  // El vacío de la primera columna se escribe como "" y no como la celda de la izquierda: a la
  // izquierda de la primera columna está el rótulo, y N("Saldo inicial") daría 0 sin avisar.
  const encadena = anterior ? `IF(N(${anterior})=0;"";${anterior})` : '""'
  return `=IF(${hasta}<=${refFecha};"";IF(${desde}<=${refFecha};${ancla};${encadena}))`
}

/**
 * EL ATAJO A LA SEMANA CORRIENTE — el que el dueño extrañaba de la versión vieja.
 *
 * Busca el lunes de hoy en la fila de encabezados y arma la dirección con ADDRESS. Con el cuadro
 * cubriendo el año entero es el atajo que hace tolerable el scroll horizontal: la semana corriente
 * está en algún lugar de 53 columnas y este vínculo salta a ella.
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
  return `=HYPERLINK("#gid=${gid}&range="&${dir};"📅 hoy")`
}
