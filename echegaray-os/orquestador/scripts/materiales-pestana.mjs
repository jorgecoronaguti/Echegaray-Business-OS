#!/usr/bin/env node
// LA PESTAÑA «Materiales» — SU DUEÑO, DESPUÉS DE VEINTISÉIS DÍAS SIN NINGUNO.
//
// ═══ POR QUÉ NACE ESTE ARCHIVO (09/09/2026) ═══
//
// Materiales la escribía `proveedores-materiales-pestana.mjs`: 2.852 líneas que además escribían la
// mitad de abajo de «Proveedores». Está en PASOS_RETIRADOS desde el 14/08 porque apilaba una capa
// nueva en cada corrida sin borrar la anterior. El resultado NO fue una pestaña rota: fue una
// pestaña CONGELADA. Sus fórmulas siguen vivas y dando el número correcto; lo que se quedó quieto es
// el layout — con «$» en todo el cuerpo, dos líneas de prosa en A53/A54 y una fila fósil que cita
// `ARCA_FALTAN_MONTO`, un rango con nombre que en el archivo vivo NO EXISTE (medido el 09/09: los
// únicos ARCA_* publicados son ARCA_SIN_CARGAR_N/MONTO, sobre Proveedores!B184/C184).
//
// Un generador nuevo y chico, con la misma aritmética, es más barato que desapilar el viejo. Este
// archivo no inventa un solo criterio: los toma todos de las libs que ya los definen.
//
//   · QUÉ ES UN MATERIAL y CUÁNTO VALE → `lib/costo-materiales.mjs` (el NETO: «Importe»; si está
//     vacío, «Total» − «IVA»). La misma función que emite OBRAS. No hay una segunda copia acá.
//   · LAS FAMILIAS                     → `lib/familia-material.mjs`
//   · EL CUADRO FAMILIA × OBRA         → `lib/materiales-por-obra.mjs`, que ya publica la fila
//     «TOTAL POR OBRA» que la pestaña OBRAS exige por rótulo.
//   · QUÉ OBRAS TIENEN COLUMNA         → `lib/obras-con-materiales.mjs` (de los datos, nunca tipeadas)
//   · EL RESPALDO CONTRA ARCA          → `lib/control-arca-bloque.mjs`, compartido con Estructura.
//
// ═══ EL REDISEÑO NO MUEVE UN PESO, Y ESO ES LA PRUEBA ═══
//
// Verificado sobre una copia: TOTAL MATERIALES = $257.135.462 y TOTAL POR OBRA · LA ESTRELLA =
// $132.998.521, los mismos dos números que publica el archivo real. Lo que cambia es la FORMA: el
// contrato de `lib/diseno-unificado.mjs` (encabezado de tres filas, titular, bloques numerados,
// «$» sólo en los totales, cero prosa).
//
// ═══ LA COLUMNA QUE ANTES NO ESTABA: «Fuera de los 12 meses» ═══
//
// El cuadro viejo titulaba su última columna «Total neto 2026» y NO era la suma de sus doce meses:
// medido el 09/09, tres filas de material por $374.194,86 no tienen «Fecha de caja», así que no caen
// en ningún mes y el renglón cerraba $374.195 corto sin decirlo. La columna es el RESIDUO —total
// menos los doce meses— y por construcción hace que cada fila cierre: si mañana una compra queda
// fechada fuera del año, cae acá en vez de desaparecer.
//
//   node orquestador/scripts/materiales-pestana.mjs [--dry]
//
// SIN `--dry` ESCRIBE EL SHEET que diga ORQ_CASHFLOW_ID, y sin la variable ése es el REAL.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { escribirPreservando, limpiarCentinela, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL, MONEDA_CONTROL, CONTADOR, PORCENTAJE } from '../lib/formato-statement.mjs'
import { ANCHO as ANCHO_COL } from '../lib/estilo-pestana.mjs'
import { bloqueControlArca, bloqueIndivisible, FILA_BLOQUE, MONTOS_BLOQUE } from '../lib/control-arca-bloque.mjs'
import { FAMILIAS, SIN_FAMILIA, RUBROS_CON_FAMILIA } from '../lib/familia-material.mjs'
import { bloqueMaterialesPorObra, FILA_TOTAL as ROTULO_TOTAL_OBRA } from '../lib/materiales-por-obra.mjs'
import { sumaNetaSheet } from '../lib/costo-materiales.mjs'
import { obrasConMateriales } from '../lib/obras-con-materiales.mjs'
import { letra, resolverColumnas, rango as rangoDeCompras } from '../lib/compras-columnas.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'
import { elLayoutCambio, invalidarHuellasDeFormato } from '../lib/huella-formato-layout.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Materiales'
const DRY = process.argv.includes('--dry')
const AÑO = 2026

/** El rótulo de la fila de totales del bloque 1. Su gemelo del bloque 2 vive en `materiales-por-obra`. */
export const ROTULO_TOTAL = 'TOTAL MATERIALES'
/** El rótulo del bloque 2. La pestaña OBRAS lo exige LITERAL en la columna A (ver REFS_OBRAS.mat). */
export const TITULO_POR_OBRA = 'POR OBRA'

// ── LAS COLUMNAS DEL BLOQUE 1, EN UN SOLO LUGAR ────────────────────────────────────────────────────
// Orden del contrato: concepto → la dimensión (los meses) → los importes → el porcentaje.
// «Civil» y «Mantenimiento» son los dos rubros de caja que tienen familia: la otra partición del
// mismo total, la que el titular cita en sus dos sub-líneas.
const C_MES0 = 1          // B..M
const C_FUERA = 13        // N — el residuo que hace cerrar la fila (ver el encabezado)
const C_CIVIL = 14        // O
const C_MANT = 15         // P
const C_TOTAL = 16        // Q
const C_PCT = 17          // R
const ANCHO_1 = 18

/** Las filas fijas del encabezado y del titular. Ninguna fórmula las tipea: las cita por nombre. */
const FILA = Object.freeze({ titulo: 1, procedencia: 2, titular: 4, civil: 5, mantenimiento: 6 })

/** Las familias que el cuadro lista, en el orden de la definición única y con la sin clasificar al pie. */
export const FAMILIAS_DEL_CUADRO = Object.freeze([...FAMILIAS.map(([n]) => n), SIN_FAMILIA])

/**
 * NÚCLEO PURO: la grilla entera de la pestaña.
 *
 * @param {object} a
 * @param {string[]} a.obras nombres EXACTOS como están en Compras, ya ordenados por monto
 * @param {{neto:string, iva:string, total:string, familia:string, fechaCaja:string, rubro:string,
 *          obra:string, fechaFactura:string}} a.rangos rangos abiertos de Compras YA resueltos por
 *          rótulo — nunca por letra fija: el dueño edita Compras y las posiciones se mueven
 * @returns {{filas:any[][], ancho:number, f0:number, f1:number, fTot:number, fCabObra:number,
 *            f0Obra:number, f1Obra:number, fTotObra:number, arca0:number, obras:string[],
 *            indivisibles:{desde:number,hasta:number}[]}}
 */
export function grilla({ obras = [], rangos }) {
  for (const k of ['neto', 'iva', 'total', 'familia', 'fechaCaja', 'rubro', 'obra', 'fechaFactura']) {
    // Un rango `undefined` produce `$undefined$4:$undefined`, que PARSEA distinto y Sheets lo rechaza
    // al EVALUAR: cuarenta celdas con #ERROR! en la cara del dueño ya se publicaron así una vez.
    if (typeof rangos?.[k] !== 'string' || !rangos[k]) {
      throw new Error(`materiales-pestana: el rango "${k}" de Compras no está resuelto (vino ${JSON.stringify(rangos?.[k])}).`
        + ' Se resuelve por RÓTULO desde el encabezado real; no se emite una fórmula con una referencia rota.')
    }
  }
  const ancho = Math.max(ANCHO_1, 3 + obras.length)
  const filas = []
  // ═══ CADA CELDA NACE MÍA Y VACÍA ═══
  // `''` significa «no es mi celda, preservala»; el centinela significa «es mía y va vacía». Con la
  // cadena vacía, el encabezado de la versión ANTERIOR sobrevive debajo del nuevo y nadie lo ve.
  const vacia = () => Array(ancho).fill(VACIO)
  const push = (c) => { filas.push(c); return filas.length }

  // ── 1. EL ENCABEZADO DE TRES FILAS (contrato, regla 1) ──────────────────────────────────────────
  const t = vacia(); t[0] = PESTAÑA; push(t)
  // LA FECHA DE CORTE ES UNA FÓRMULA, no un literal: escrita a mano envejece igual que un importe
  // pegado, y una procedencia que miente sobre su corte es peor que no tenerla. El auditor mide el
  // literal visible (`textoVisible`), que son 56 caracteres contra un tope de 120.
  const s = vacia()
  s[0] = `="En qué se va la plata de materiales · Compras, en neto · al "&TEXT(MAX(${rangos.fechaFactura});"dd/mm/yyyy")`
  push(s)
  push(vacia())

  // ── 2. EL TITULAR: LA CIFRA QUE LA PESTAÑA CONTESTA (contrato, regla 2) ─────────────────────────
  // Va antes que el cuadro y REFERENCIA su fila de totales — no la recalcula. Dos formas de la misma
  // cifra en la misma pestaña es exactamente como nacen los dos números que no cierran.
  const tit = vacia(); tit[0] = `COMPRADO EN MATERIALES ${AÑO}`; tit[1] = `=$${letra(C_TOTAL)}$~TOT~`; push(tit)
  // La sangría es lo que muestra que cuelgan del titular. No suman una tercera cifra: son la
  // partición del mismo total por rubro de caja.
  const civ = vacia(); civ[0] = '   · Civil'; civ[1] = `=$${letra(C_CIVIL)}$~TOT~`; push(civ)
  const man = vacia(); man[0] = '   · Mantenimiento'; man[1] = `=$${letra(C_MANT)}$~TOT~`; push(man)
  push(vacia())

  // ── 3. BLOQUE 1 · POR FAMILIA Y POR MES ─────────────────────────────────────────────────────────
  let nBloque = 0
  const s1 = vacia(); s1[0] = `${++nBloque} · POR FAMILIA Y POR MES`; push(s1)

  const cab = vacia()
  cab[0] = 'Familia'
  // LOS MESES SON FECHAS, NO TEXTO: se escriben como el primero de cada mes y se DIBUJAN «mmm». Así
  // el criterio del SUMIFS compara fecha contra fecha y no hay que parsear un rótulo.
  for (let m = 0; m < 12; m++) cab[C_MES0 + m] = `1/${m + 1}/${AÑO}`
  cab[C_FUERA] = 'Fuera de los 12 meses'
  cab[C_CIVIL] = 'Civil'
  cab[C_MANT] = 'Mantenimiento'
  cab[C_TOTAL] = 'Total'
  cab[C_PCT] = '% del total'
  const fCab = push(cab)

  const f0 = filas.length + 1
  for (const nombre of FAMILIAS_DEL_CUADRO) {
    const f = filas.length + 1
    const fila = vacia()
    fila[0] = nombre
    const deLaFamilia = `${rangos.familia};$A${f}`
    const neto = (criterios) => `=${sumaNetaSheet({ ...rangos, criterios })}`
    for (let m = 0; m < 12; m++) {
      const cm = `${letra(C_MES0 + m)}$${fCab}`
      // La ventana del mes es [primero del mes; primero del siguiente): con `<=EOMONTH` una compra
      // fechada el último día a las 00:00 entra dos veces cuando la celda lleva hora.
      fila[C_MES0 + m] = neto(`${deLaFamilia};${rangos.fechaCaja};">="&${cm};${rangos.fechaCaja};"<"&EOMONTH(${cm};0)+1`)
    }
    // Los dos rubros de caja que tienen familia. Salen de RUBROS_CON_FAMILIA, no de dos literales.
    fila[C_CIVIL] = neto(`${deLaFamilia};${rangos.rubro};"${RUBROS_CON_FAMILIA[0]}"`)
    fila[C_MANT] = neto(`${deLaFamilia};${rangos.rubro};"${RUBROS_CON_FAMILIA[1]}"`)
    // EL TOTAL NO LLEVA FILTRO DE FECHA, y es a propósito: es el mismo universo que suma el bloque 2,
    // así que los dos cuadros cierran en el mismo peso. Recortarlo al año los partiría en dos.
    fila[C_TOTAL] = neto(deLaFamilia)
    // ROUND A PESO: sin él, una diferencia de fracciones de centavo se dibuja «-$0» y enciende el
    // rojo del control con los datos perfectos. Un control que grita por nada se deja de mirar.
    fila[C_FUERA] = `=ROUND($${letra(C_TOTAL)}${f}-SUM($${letra(C_MES0)}${f}:$${letra(C_MES0 + 11)}${f});0)`
    fila[C_PCT] = `=IFERROR($${letra(C_TOTAL)}${f}/$${letra(C_TOTAL)}$~TOT~;0)`
    push(fila)
  }
  const f1 = filas.length
  const tot = vacia()
  tot[0] = ROTULO_TOTAL
  for (let c = C_MES0; c <= C_TOTAL; c++) tot[c] = `=SUM(${letra(c)}${f0}:${letra(c)}${f1})`
  // El «% del total» de la fila del total sería 100% siempre: una celda que no puede decir otra cosa
  // no es información. Queda vacía.
  const fTot = push(tot)
  push(vacia())

  // ── 4. BLOQUE 2 · POR OBRA — el que la pestaña OBRAS lee por rótulo ─────────────────────────────
  const s2 = vacia(); s2[0] = `${++nBloque} · ${TITULO_POR_OBRA}`; push(s2)
  const fCabObra = filas.length + 1
  const porObra = bloqueMaterialesPorObra({
    obras,
    familias: [...FAMILIAS_DEL_CUADRO],
    // EL RÓTULO NOMBRA LA FAMILIA Y NADA MÁS. `sinFamilia` es el interruptor del rótulo largo
    // «SIN CLASIFICAR — falta describir qué se compró»: eso es una instrucción al lector, o sea
    // prosa, y el dueño la prohibió el 05/09 («sin aclaraciones ni explicaciones de nada»). No se
    // pide, así que la celda dice el nombre de la familia — que es además lo que el LEFT() compara.
    sinFamilia: undefined,
    rangos: { neto: rangos.neto, iva: rangos.iva, total: rangos.total, familia: rangos.familia, obra: rangos.obra },
    filaCabecera: fCabObra,
  })
  const meter = (celdas) => { const f = vacia(); celdas.forEach((c, i) => { f[i] = c }); return push(f) }
  meter(porObra.cabecera)
  const f0Obra = filas.length + 1
  for (const d of porObra.detalle) meter(d)
  const f1Obra = filas.length
  const fTotObra = meter(porObra.total)
  push(vacia())

  // ── 5. BLOQUE 3 · EL CONTROL QUE NO SE VALIDA CONTRA SÍ MISMO ──────────────────────────────────
  // Los bloques 1 y 2 salen los dos de Compras: prueban que el cuadro no se pierde una familia, no
  // que Compras esté bien. Éste compara contra el libro de IVA de ARCA, que el OS no escribe.
  const arca0 = filas.length + 1
  for (const b of bloqueControlArca({ titulo: `${++nBloque} · RESPALDO FISCAL — contra el libro de IVA de ARCA`, rubros: [...RUBROS_CON_FAMILIA], fila0: arca0 })) meter(b)

  // EL MARCADOR LLEVA DELIMITADORES A LOS DOS LADOS. Con `$TOT` a secas, `$Q$TOT` se resolvía a
  // `$Q27` —el `$` de la fila se lo comía el marcador— y la referencia dejaba de ser absoluta: al
  // primer arrastre de celda el titular apuntaba a otra fila.
  const resuelto = filas.map((f) => f.map((c) => (typeof c === 'string' ? c.replaceAll('~TOT~', String(fTot)) : c)))
  // EL BLOQUE DE ARCA ES UNA SOLA IDEA, y el generador es el único que lo sabe. Sin declararlo, la
  // huella por celda lee el hueco que deja un movimiento de filas como «el dueño vació esto» y lo
  // marca borrado para siempre: eso dejó tres controles mudos durante tres semanas en agosto.
  return {
    filas: resuelto, ancho, f0, f1, fTot, fCab, fCabObra, f0Obra, f1Obra, fTotObra, arca0, obras,
    indivisibles: [bloqueIndivisible(arca0)],
  }
}

/**
 * NÚCLEO PURO: los formatos propios — los que la piel no puede deducir del contenido.
 * Cada columna declara el suyo en CADA corrida; ninguna hereda de la corrida anterior.
 *
 * @param {number} sheetId
 * @param {ReturnType<typeof grilla>} g
 * @returns {object[]} requests, para aplicar DESPUÉS de la piel
 */
export function formatosPropios(sheetId, g) {
  const alto = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = g.ancho) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, alto) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })
  const num = (rg, numberFormat) => fmt(rg, 'userEnteredFormat.numberFormat', { numberFormat })

  // EL CUERPO NO LLEVA «$» (contrato, regla 6): la unidad se declara una vez y no ochenta veces.
  fmt(r(0, alto, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })

  // El titular y sus dos sub-líneas: son totales, así que llevan «$».
  num(r(FILA.titular - 1, FILA.mantenimiento, 1, 2), MONEDA_TOTAL)

  // Los doce encabezados de mes se DIBUJAN «mmm»; el resto del encabezado es texto y no un importe.
  fmt({ ...r(g.fCab - 1, g.fCab), startColumnIndex: 1, endColumnIndex: 13 },
    'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'mmm' }, horizontalAlignment: 'RIGHT' })
  for (const fc of [g.fCab, g.fCabObra]) {
    fmt({ ...r(fc - 1, fc), startColumnIndex: fc === g.fCab ? 13 : 1, endColumnIndex: g.ancho },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
  }

  // BLOQUE 1: el residuo es un control (rojo apenas deja de dar cero), el % un porcentaje y la fila
  // del total la única del cuadro con «$».
  num({ ...r(g.f0 - 1, g.fTot), startColumnIndex: 13, endColumnIndex: 14 }, MONEDA_CONTROL)
  num({ ...r(g.f0 - 1, g.fTot), startColumnIndex: 17, endColumnIndex: 18 }, PORCENTAJE)
  num(r(g.fTot - 1, g.fTot, 1, 18), MONEDA_TOTAL)
  num({ ...r(g.fTot - 1, g.fTot), startColumnIndex: 13, endColumnIndex: 14 }, MONEDA_CONTROL)

  // BLOQUE 2: la última columna es «Sin obra» — el mismo control, y su ancho depende de cuántas obras
  // haya, así que se calcula y no se tipea.
  const cSinObra = g.obras.length + 2
  num(r(g.f0Obra - 1, g.fTotObra, 1, cSinObra), MONEDA_CUERPO)
  num(r(g.fTotObra - 1, g.fTotObra, 1, cSinObra), MONEDA_TOTAL)
  num(r(g.f0Obra - 1, g.fTotObra, cSinObra, cSinObra + 1), MONEDA_CONTROL)

  // BLOQUE 3: los desplazamientos salen del bloque, no se tipean — `control-arca-bloque.mjs` es quien
  // decide el orden de sus filas y su test lo ata a los rótulos.
  const fArca = (i) => g.arca0 - 1 + i
  num(r(fArca(MONTOS_BLOQUE.desde), fArca(MONTOS_BLOQUE.hasta), 1, 2), MONEDA_TOTAL)
  num(r(fArca(FILA_BLOQUE.cobertura), fArca(FILA_BLOQUE.cobertura + 1), 1, 2), PORCENTAJE)
  num(r(fArca(FILA_BLOQUE.global), fArca(FILA_BLOQUE.global + 1), 1, 2), MONEDA_CONTROL)
  // LA ÚLTIMA FILA DEL BLOQUE CUENTA FILAS, NO PESOS (09/09/2026). Desde que dejó de ser un veredicto
  // en prosa —«ⓘ $X en N fila(s) · detalle en _CRUCE_ARCA»— es «⇒ Filas sin comprobante | número».
  // Con el formato de moneda heredado de la pasada de arriba, un 3 se dibujaría «$3».
  num(r(fArca(FILA_BLOQUE.veredicto), fArca(FILA_BLOQUE.veredicto + 1), 1, 2), CONTADOR)

  // ═══ EL NOMBRE DE UNA OBRA NO ENTRA EN UNA COLUMNA DE NÚMEROS ═══
  //
  // «Quattropani - Melisa García SAS» son 33 caracteres y en 112 px entran 21: `auditar-pantalla` lo
  // reporta como `texto_cortado`, y con la celda de al lado ocupada Sheets lo corta de verdad. Las
  // columnas NO se pueden ensanchar —son las mismas doce que llevan los meses del bloque 1— así que
  // el encabezado de obras envuelve y su fila crece a dos renglones. Es la única fila alta de la
  // pestaña, y es la que lo necesita.
  fmt({ ...r(g.fCabObra - 1, g.fCabObra), startColumnIndex: 1, endColumnIndex: g.ancho },
    'userEnteredFormat.wrapStrategy', { wrapStrategy: 'WRAP' })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: g.fCabObra - 1, endIndex: g.fCabObra }, properties: { pixelSize: 34 }, fields: 'pixelSize' } })

  const anchoCol = (c0, c1, px) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: c0, endIndex: c1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  // LA COLUMNA A SE MIDE POR SU RÓTULO MÁS LARGO, no por el default. `ANCHO.concepto` (270 px) deja
  // cortado «▲ ARCA facturó y Compras no lo tiene · Compras entera» —53 caracteres, entran 47— y con
  // la celda de al lado ocupada Sheets lo corta de verdad: lo reporta `auditar-pantalla`.
  anchoCol(0, 1, ANCHO_COL.nota)
  anchoCol(1, g.ancho, ANCHO_COL.numero)
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenColumnCount: 1 } }, fields: 'gridProperties.frozenColumnCount' } })
  return req
}

/** Los rangos abiertos de Compras que esta pestaña cita, resueltos por RÓTULO contra el encabezado real. */
export const ROTULOS_COMPRAS = Object.freeze({
  neto: 'Importe', iva: 'IVA', total: 'Total', familia: 'Familia de material',
  fechaCaja: 'Fecha de caja', fechaFactura: 'Fecha factura', obra: 'Cliente / Asignación',
  // ⚠ COMPRAS TIENE DOS COLUMNAS ROTULADAS «Rubro de caja» (AB y AC, con fórmulas que ya divergieron:
  // AC conoce «mass consultora» y AB no). `resolverColumnas` se queda con la PRIMERA, o sea AB — que
  // es de la que cuelga la propia columna «Familia de material», así que el cuerpo de esta pestaña
  // mide contra el mismo criterio que define su universo. El bloque de ARCA cita AC fija desde su lib.
  rubro: 'Rubro de caja',
})

async function refsDeCompras(google) {
  const cab = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))?.[0] ?? []
  const { col, idx, faltan } = resolverColumnas(cab, ROTULOS_COMPRAS)
  if (faltan.length) {
    // FALLA CERRADO: leer por posición produce movimientos plausibles y equivocados, que es peor que
    // no correr. El rótulo que falta va adentro del mensaje para que se arregle en un minuto.
    throw new Error(`Compras no tiene estas columnas: ${faltan.join(' · ')}. NO escribo la pestaña.`)
  }
  const rangos = Object.fromEntries(Object.keys(ROTULOS_COMPRAS).map((k) => [k, rangoDeCompras(col[k])]))
  return { idx, rangos }
}

async function main() {
  // `--dry` LEE pero no escribe: la forma del cuadro 2 depende de cuántas obras trajo Compras, así que
  // un ensayo offline mostraría una pestaña que no existe.
  const google = DRY ? makeGoogleClient({ config: loadConfig() }) : makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const { idx, rangos } = await refsDeCompras(google)
  const crudas = await google.readSheetValues(ID, 'Compras!A4:BZ', { render: 'UNFORMATTED_VALUE' })
  // LA LISTA DE OBRAS SALE DE LOS DATOS. Tipeada, un cliente nuevo no aparece nunca: pasó con
  // Quattropani ($32.937.000 en tres comprobantes) y lo tuvo que pedir el dueño.
  const obras = obrasConMateriales(crudas, {
    rubros: [...RUBROS_CON_FAMILIA], monto: parseMonto,
    colObra: idx.obra, colRubro: idx.rubro, colNeto: idx.neto, colIva: idx.iva, colTotal: idx.total,
  })
  const g = grilla({ obras, rangos })
  console.log(`${PESTAÑA}: ${g.filas.length} filas x ${g.ancho} columnas · familias ${g.f0}-${g.f1} (total ${g.fTot})`
    + ` · ${obras.length} obras (total ${g.fTotObra}) · ARCA ${g.arca0}`)
  console.log(`  obras, de los datos y por monto: ${obras.join(' · ') || '(ninguna)'}`)
  if (DRY) return console.log(`\nEjemplo (enero, primera familia):\n  ${g.filas[g.f0 - 1][C_MES0]}`)

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTAÑA)
  if (!hoja) throw new Error(`no existe la pestaña «${PESTAÑA}» en ${ID}`)
  // ═══ SI LAS FILAS SE CORREN, LAS HUELLAS DE FORMATO DESCRIBEN OTRA COSA ═══
  //
  // La guarda de formato compara cada rango contra lo último que el OS selló ahí; cuando el layout se
  // mueve, las huellas viejas hablan de filas que ya no contienen lo que contenían y la guarda las lee
  // como diseño del dueño. Medido en la copia: el alto de la fila del encabezado de obras se publicó
  // «respetada: ROWS:29-30» y quedó en 21 px con dos renglones de texto adentro. Va ANTES de la
  // primera escritura de la corrida, no antes de formatear.
  // SE LEE LA FÓRMULA, NO EL VALOR: la A2 lleva su fecha de corte adentro de un `=…&TEXT(…)`, y leída
  // resuelta nunca coincide con la que se va a escribir. Comparando valores este control disparaba en
  // TODAS las corridas — y un control que siempre da positivo apaga la guarda que vino a cuidar.
  // Y SHEETS DEVUELVE LA FÓRMULA NORMALIZADA: lo que se escribe como `'_ARCA_RAW'!$B$4` vuelve como
  // `_ARCA_RAW!$B$4`. Sin sacar esas comillas de los dos lados, la fila del bloque de ARCA daba
  // «cambió» en cada corrida y la guarda quedaba invalidada siempre, que es no tener guarda.
  const sinComillas = (g) => (g || []).map((f) => [String(f?.[0] ?? '').replace(/'([^']+)'!/g, '$1!')])
  const previo = await google.readSheetValues(ID, `${PESTAÑA}!A1:A400`, { render: 'FORMULA' })
  const layout = elLayoutCambio(sinComillas(previo), sinComillas(g.filas))
  if (layout.cambio) {
    const n = await invalidarHuellasDeFormato(query, ID, PESTAÑA).catch((e) => { console.warn(`  ⚠ no pude invalidar las huellas de formato: ${e.message}`); return 0 })
    console.log(`  🎨 cambió el layout (${layout.motivo}): invalido ${n} huella(s) de formato y las vuelvo a sellar`)
  }
  const { sheetId } = hoja
  if (hoja.cols < g.ancho) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: g.ancho - hoja.cols } }])
  }

  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. `conPrueba` limpia
  // sólo la cola que ESTE generador probó haber escrito antes — el resto de la hoja no es suyo.
  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, g.filas, { ancho: g.ancho, conPrueba: true, pestana: PESTAÑA })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  const escritura = await escribirPreservando(google, ID, PESTAÑA, cola.filas, { anchoHoja: Math.max(g.ancho, hoja.cols ?? g.ancho), indivisibles: g.indivisibles })
  // SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA. Con la pestaña candada `escribirPreservando`
  // no escribe —correcto—, y seguir formateando pintaría la forma NUEVA sobre los valores VIEJOS.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) return console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato. Queda como la dejaste.')
  if (escritura?.conservadas?.length) console.log(`  ✋ ${escritura.conservadas.length} celda(s) de una persona — CONSERVADAS`)
  await google.spreadsheetBatchUpdate(ID, [
    // La piel PRIMERO y lo propio DESPUÉS, en el mismo lote: los requests se aplican en orden, así que
    // lo propio manda donde se superpone. La piel recibe la grilla SIN centinela: `\0` no es espacio
    // para `trim()` y le rompería la detección de «esta fila tiene contenido».
    ...skinRequests({ sheetId, filas: limpiarCentinela(g.filas), cols: g.ancho, congeladas: 3, titular: FILA.titular, filasHoja: g.filas.length }),
    ...formatosPropios(sheetId, g),
  ])

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(g.ancho - 1)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `\n⚠ ${err.length} celdas en error: ${err.slice(0, 8).join(' ')}` : '\n✓ sin errores')
  const fo = v[g.fTotObra - 1] || []
  console.log(`  ${ROTULO_TOTAL}  ${v[g.fTot - 1]?.[C_TOTAL]}`)
  console.log(`  ${ROTULO_TOTAL_OBRA}  ${fo[g.obras.length + 1]}${g.obras.length ? ` · ${g.obras[0]} ${fo[1]}` : ''}`)
}

// SÓLO CORRE SI SE LO INVOCA, NO SI SE LO IMPORTA. Sin esta guarda, un test que importa `grilla()`
// ARRANCA EL GENERADOR CONTRA EL SHEET REAL.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
