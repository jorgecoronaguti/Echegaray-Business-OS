#!/usr/bin/env node
// LA PESTAÑA RECURRENTES — LOS SERVICIOS QUE SE PAGAN TODOS LOS MESES.
//
// POR QUÉ EXISTE (20/07). Era una pestaña HUÉRFANA: ningún script versionado la regeneraba, así que
// el agente que rehace el archivo cada 2 horas no la tocaba. Y sin embargo el Cash Flow Mensual leía
// de ella su proyección de "Servicios recurrentes". Un número del que depende el cuadro, mantenido
// a mano y por nadie.
//
// Y ADEMÁS PROYECTABA HACIA ATRÁS. La versión hecha a mano rellenaba con proyección los meses YA
// CERRADOS: a Movistar le ponía $374.260 en junio cuando el real es $0. Eso no es una estimación, es
// tapar un problema — a Movistar no se le carga una factura desde mayo, y el cuadro lo escondía
// poniendo un número donde no había ninguno. Un mes cerrado muestra lo que pasó, aunque sea cero, y
// si el cero es raro se avisa.
//
// QUÉ CAMBIÓ EN LA DEFINICIÓN. Un servicio es recurrente cuando lo paga la ESTRUCTURA. Los mismos
// proveedores facturando a una obra (el baño químico de La Estrella, el agua de San Francisco) son
// costo de esa obra: $4.186.497 que estaban acá y volvieron a Materiales. Un baño de obra no es un
// gasto fijo mensual — se termina cuando termina la obra, y proyectarlo como fijo inventa caja.
//
// ═══ LOS DOS DEFECTOS DEL 04/08, Y CÓMO SE VEÍAN ═══
//
// 1. UN ENCABEZADO FANTASMA EN LA FILA 2. Cada fila se armaba con `Array(ANCHO).fill('')`, y la
//    fusión lee la cadena vacía como "no es mi celda, preservala". Cuando el layout creció (se
//    agregaron el subtítulo y el título de sección), el encabezado de la versión anterior quedó
//    clavado en la fila 2 — los doce primeros-de-mes en crudo, pintados como moneda: "$46.023",
//    "$46.054"… — y una fila de ceros en la 3. Sin un solo #ERROR: se veía como datos. La cura es
//    declarar el vacío con el centinela (`estructural`), no un clearValues.
// 2. UN CONTADOR VESTIDO DE PLATA. El formato de moneda se pintaba de la columna B al final de la
//    grilla, así que "Meses con gasto" mostraba "$5" y "$7". Cada columna declara su formato.
//
// Y LA PIEL: esta pestaña nunca pasó por `estilo-statement` — tenía la barra azul rellena, el ámbar
// del proyectado y una columna de PROSA al lado de cada control, que el dueño borra a mano y volvía
// en cada corrida. Un número que necesita un párrafo al lado está mal elegido: ahora el rótulo dice
// lo que el párrafo decía.
//
//   node orquestador/scripts/recurrentes-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { MIN_MESES, MES_EN_CURSO, COL_RUBRO, COL_FECHA, COL_TOTAL } from '../lib/cash-flow-lineas.mjs'
import { escribirPreservando, limpiarCentinela, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL, MONEDA_CONTROL, CONTADOR, PORCENTAJE } from '../lib/formato-statement.mjs'
import { bloqueControlArca } from '../lib/control-arca-bloque.mjs'
import { RECURRENTES, norm } from '../lib/rubro-caja.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Recurrentes'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const RUBRO = 'Servicios recurrentes'
export const RANGO_COMPRAS = 'Compras!A4:AC'

// ═══ EL PRIMER DÍA DEL MES EN CURSO, ESCRITO UNA SOLA VEZ ═══
//
// Lo usan la celda de cada mes, el promedio que alimenta la proyección y el control de "meses
// cerrados en $0". Estaban escritos por separado y decían cosas distintas del MISMO mes: la celda
// mostraba agosto como proyección y el control lo contaba entre los meses cerrados sin gasto — la
// pestaña discutiendo consigo misma.
//
// Y AHORA VIENE DE cash-flow-lineas.mjs (13/08/2026). Era la MISMA constante tipeada acá y allá: la
// ventana de tres meses del cash flow corta en el mismo instante que el promedio de esta pestaña.
// Dos copias del mismo corte es la forma en que dos cuadros terminan diciendo cosas distintas de la
// misma plata el día que alguien mueve una sola.
//
// El encabezado de cada columna ES el primero de su mes, así que la comparación es exacta y no
// necesita EOMONTH; dentro del SUMPRODUCT del control eso ahorra además envolver en ARRAYFORMULA.

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// A + 12 meses + Total real + Meses cerrados + Promedio. Después, ocultas, las 12 del real puro.
const C_MES0 = 1, C_TOTREAL = 13, C_NMESES = 14, C_PROM = 15, ANCHO_VIS = 16
const C_AUX0 = 17
const ANCHO = C_AUX0 + 12
// La fila del encabezado con los doce primeros-de-mes. NO SE MUEVE: las fórmulas de cada mes la
// referencian en absoluto, y el Cash Flow Mensual la recibe para leer esta tabla.
const FILA_CAB = 4
// LA VENTANA DE MESES CERRADOS, COMO MÁSCARA DE DOCE CELDAS. Vale 1 en cada mes que ya terminó y 0
// en el que corre y en los que faltan; multiplicada por la fila de importes reales, deja adentro
// del promedio sólo las observaciones completas. Se escribe una vez y la usan el contador de meses,
// el promedio y el control de "meses cerrados en $0": si alguna vez discreparan, la pestaña volvería
// a decir dos cosas distintas del mismo mes.
const CERRADOS = `(${letra(C_MES0)}$${FILA_CAB}:${letra(C_MES0 + 11)}$${FILA_CAB}<${MES_EN_CURSO})`

export function grilla(proveedores) {
  const filas = []
  // Cada celda nace MÍA Y VACÍA. Es lo que borra el fantasma del layout anterior sin un clearValues.
  const vacia = () => Array(ANCHO).fill(VACIO)
  const push = (f) => { filas.push(f); return filas.length }

  const t = vacia(); t[0] = `Servicios recurrentes ${AÑO}`
  push(t)
  // EL SUBTÍTULO ES UNA LÍNEA. La versión anterior tenía acá un párrafo de 600 caracteres que se
  // envolvía en diez renglones y se cortaba contra la columna de enero: el "muro de texto" que el
  // dueño viene señalando. Lo que el párrafo explicaba (por qué un cero se muestra, qué es una
  // proyección) lo dicen ahora el propio cuadro —la itálica marca lo proyectado— y los controles.
  const n = vacia()
  // DICE POR QUÉ FECHA ENTRA CADA GASTO, Y NO ES UN DETALLE (13/08/2026). Decía "lo que se pagó" y
  // "desde agosto" —un mes tipeado a mano, que en septiembre miente sola—. El cuadro imputa por
  // FECHA DE CAJA (columna AD de Compras, la que sale de la fecha prevista de pago), no por la
  // fecha de la factura: el dueño leyó agosto vacío porque pagó Movistar el 07/08 con facturas
  // fechadas en julio. Mezclar las dos ventanas es la regla de oro 3, y el rótulo es el único lugar
  // donde se puede declarar cuál se está usando.
  n[0] = `Rubro "${RUBRO}" por FECHA DE CAJA, no de factura. Cerrados: lo real. En curso y futuros: lo esperado (itálica).`
  push(n)
  // EL TÍTULO DE SECCIÓN VA JUSTO ARRIBA DE SU ENCABEZADO, y ocupa la fila en blanco que ya había:
  // así no corre ninguna fila. Las fórmulas de abajo referencian filas absolutas y un desplazamiento
  // las dejaría apuntando a otra cosa, en silencio.
  const s1 = vacia(); s1[0] = '1 · EL GASTO RECURRENTE, MES A MES'; push(s1)

  const cab = vacia()
  cab[0] = 'Proveedor'
  for (let m = 0; m < 12; m++) cab[C_MES0 + m] = new Date(Date.UTC(AÑO, m, 1))
  cab[C_TOTREAL] = 'Total real'
  // LOS RÓTULOS DICEN "CERRADO" PORQUE LOS NÚMEROS MIDEN MESES CERRADOS. Decían "Meses con gasto" y
  // "Promedio mensual" contando también el mes en curso; si el número cambia de significado y el
  // rótulo no, el cuadro miente sin un solo error. "Total real" sí es el año entero —incluido lo que
  // ya se cargó del mes en curso— porque es el hecho que el control de abajo compara contra Compras.
  cab[C_NMESES] = 'Meses cerrados con gasto'
  cab[C_PROM] = 'Promedio de meses cerrados'
  cab[C_AUX0] = 'AUXILIAR — el real de cada mes. De acá sale la proyección: sin separarlo, la fórmula de un mes se leería a sí misma (#REF!). No borrar.'
  push(cab)

  const f0 = filas.length + 1
  for (const prov of proveedores) {
    const f = filas.length + 1
    const fila = vacia()
    fila[0] = prov
    for (let m = 0; m < 12; m++) {
      const ca = letra(C_AUX0 + m)
      const cm = letra(C_MES0 + m)
      // El REAL, en la columna auxiliar.
      fila[C_AUX0 + m] = `=SUMIFS(${COL_TOTAL};${COL_RUBRO};"${RUBRO}";Compras!$E$4:$E;$A${f};${COL_FECHA};">="&${cm}$${FILA_CAB};${COL_FECHA};"<"&EOMONTH(${cm}$${FILA_CAB};0)+1)`
      // Lo que se ve: en un mes CERRADO, el real y nada más. En un mes futuro, la proyección. En el
      // MES EN CURSO, MAX(real; proyección) — el mismo criterio que el cuadro de IVA: Movistar
      // factura el 25, y hasta ese día la celda decía "—" como si agosto no fuera a pagar nada. El
      // dueño lo leyó como "no se actualizó", y tenía razón: un mes que va a salir ~$360k no puede
      // mostrarse vacío 25 días por mes.
      const proy = `IF($${letra(C_NMESES)}${f}<${MIN_MESES};0;$${letra(C_PROM)}${f}*IFERROR(INDEX(Parámetros!$C$74:$C$90;MATCH(EOMONTH(${cm}$${FILA_CAB};0);ARRAYFORMULA(EOMONTH(Parámetros!$A$74:$A$90;0));0));1))`
      const cMes = `${cm}$${FILA_CAB}`
      fila[C_MES0 + m] = `=IF(${cMes}<${MES_EN_CURSO};${ca}${f};IF(${cMes}=${MES_EN_CURSO};MAX(${ca}${f};${proy});${proy}))`
    }
    const a0 = letra(C_AUX0), a1 = letra(C_AUX0 + 11)
    const real = `${a0}${f}:${a1}${f}`
    fila[C_TOTREAL] = `=SUM(${real})`
    // ═══ EL PROMEDIO SE SACA SOBRE MESES CERRADOS, NO SOBRE EL AÑO (13/08/2026) ═══
    //
    // Antes era Total real / Meses con gasto, y los dos contaban el mes EN CURSO — un mes a medio
    // transcurrir. Medido sobre Movistar: con agosto todavía vacío el esperado es 2.162.055/6 =
    // $360.342,50, y en cuanto entra la primera factura parcial de agosto pasa a 2.212.055/7 =
    // $316.007,86. El cuadro EMPEORABA su pronóstico justo cuando llegaba más información, que es
    // exactamente al revés de lo que tiene que hacer. Es el mismo defecto que cash-flow-lineas.mjs
    // ya había corregido para su ventana de tres meses, y ahora las dos cortan en MES_EN_CURSO.
    //
    // SUMPRODUCT Y NO COUNTIF/SUMIFS: la condición cruza el importe de cada mes con la FECHA de su
    // encabezado, que vive en otra fila. Es la misma excepción declarada que usa el control de abajo.
    fila[C_NMESES] = `=SUMPRODUCT((${real}>0)*${CERRADOS})`
    // El divisor es la cantidad de meses cerrados QUE FACTURARON: un mes cerrado en $0 ya pasó (por
    // eso entra a la ventana y el control lo grita), pero repartir el total entre él bajaría el
    // ritmo de un proveedor por una factura que nunca existió.
    fila[C_PROM] = `=IFERROR(SUMPRODUCT(${real}*${CERRADOS})/$${letra(C_NMESES)}${f};0)`
    push(fila)
  }
  const f1 = filas.length

  const tot = vacia()
  tot[0] = 'TOTAL'
  for (let m = 0; m < 12; m++) tot[C_MES0 + m] = `=SUM(${letra(C_MES0 + m)}${f0}:${letra(C_MES0 + m)}${f1})`
  tot[C_TOTREAL] = `=SUM(${letra(C_TOTREAL)}${f0}:${letra(C_TOTREAL)}${f1})`
  const fTot = push(tot)

  push(vacia())
  const ctrl = filas.length + 1
  const c1 = vacia()
  c1[0] = '2 · CONTROL — EL REAL DE ESTA PESTAÑA CONTRA COMPRAS'
  push(c1)
  const c2 = vacia()
  // Se compara contra lo que TIENE FECHA DE CAJA: un gasto sin fecha no cae en ningún mes y por lo
  // tanto no puede estar en este cuadro. Compararlo contra el total entero hacía fallar el control
  // por un motivo que no es un error — y un control que falla por algo que está bien se deja de mirar.
  c2[0] = 'Compras del rubro, con fecha de caja'
  // ">0" y no "<>": la columna de fecha de caja la llena un ARRAYFORMULA que devuelve "" en las
  // filas que no son gasto, y para SUMIFS ese "" no es "distinto de vacío" — el criterio "<>" las
  // contaba a todas y el control comparaba contra sí mismo. Una fecha real es un número mayor que 0.
  c2[1] = `=SUMIFS(${COL_TOTAL};${COL_RUBRO};"${RUBRO}";${COL_FECHA};">0")`
  push(c2)
  const c3 = vacia()
  c3[0] = 'Suma del real de este cuadro'
  c3[1] = `=SUM(${letra(C_TOTREAL)}${f0}:${letra(C_TOTREAL)}${f1})`
  push(c3)
  const c4 = vacia()
  // EL RÓTULO DICE LO QUE DECÍA LA PROSA DE AL LADO. La columna C llevaba "Distinto de cero = hay un
  // proveedor recurrente que este cuadro no está listando." — una oración por fila, en cada corrida,
  // que el dueño borraba a mano y volvía. Cabe en el rótulo.
  c4[0] = '⇒ Diferencia — un proveedor del rubro que el cuadro no lista (tiene que ser $0)'
  // ROUND A PESO. El SUMIFS de Compras y la suma del cuadro difieren en fracciones de centavo, y el
  // formato dibujaba "-$0" EN ROJO con los datos perfectos. Un control que grita por medio centavo se
  // deja de mirar, que es peor que no tenerlo. El rojo queda sólo para una diferencia de un peso o más.
  c4[1] = `=ROUND(B${ctrl + 1}-B${ctrl + 2};0)`
  const fDif = push(c4)
  const cSF = vacia()
  cSF[0] = '⚠ Del rubro, sin fecha de caja — clasificado pero sin saber cuándo sale'
  cSF[1] = `=ROUND(SUMIF(${COL_RUBRO};"${RUBRO}";${COL_TOTAL})-B${ctrl + 1};0)`
  push(cSF)
  const c6 = vacia()
  c6[0] = '⚠ Meses cerrados en $0 — o dejó de facturar, o falta cargar la factura'
  // SUMPRODUCT y no COUNTIFS: la condición cruza DOS dimensiones (la celda del mes vale cero Y ese
  // mes ya cerró), y el rango de meses es una fila mientras el de importes es un rectángulo. COUNTIFS
  // no sabe hacer eso. Es la excepción declarada a "SUMIFS antes que SUMPRODUCT".
  // EL MES EN CURSO NO ES UN MES CERRADO. Con "<=" el mes corriente entraba en la cuenta desde el
  // día 1: el 13/08 el control gritaba por agosto —que todavía no facturó nadie— junto a mayo, que
  // sí es una anomalía real. Un control que mezcla lo que falta con lo que todavía no pasó se deja
  // de mirar.
  c6[1] = `=SUMPRODUCT((${letra(C_AUX0)}${f0}:${letra(C_AUX0 + 11)}${f1}=0)*${CERRADOS})`
  push(c6)

  // ── 3 · EL CONTROL QUE NO SE VALIDA CONTRA SÍ MISMO ─────────────────────────────────────────────
  // El bloque 2 de arriba compara este cuadro contra Compras: las dos cifras salen de Compras. Prueba
  // que el cuadro no se está olvidando un proveedor del rubro, y nada más — no puede detectar un
  // error EN Compras. Éste compara contra el libro de IVA de ARCA, que el OS no escribe.
  push(vacia())
  const arca0 = filas.length + 1
  for (const f of bloqueControlArca({ titulo: '3 · RESPALDO FISCAL — contra el libro de IVA de ARCA', rubros: [RUBRO], fila0: arca0 })) {
    const fila = vacia()
    f.forEach((c, i) => { fila[i] = c })
    push(fila)
  }

  return { filas, f0, f1, fTot, ctrl, fDif, arca0 }
}

/**
 * NÚCLEO PURO: los proveedores DECLARADOS recurrentes que el cuadro no lista.
 *
 * POR QUÉ NO SE INVENTA LA FILA (13/08/2026). El cuadro sale de la columna AC de Compras: si un
 * proveedor no tiene ninguna fila clasificada en el rubro, no tiene fila acá — y es indistinguible
 * de uno que no facturó. Emitirle una fila de ceros tampoco alcanza: el control de "meses cerrados
 * en $0" contaría siete ceros por proveedor y taparía las anomalías de verdad.
 *
 * Tampoco puede ser un control del Sheet: para varios de los declarados —los baños químicos que se
 * facturan a una obra— NO tener fila es lo correcto, y un control que grita por algo que está bien
 * se deja de mirar. Así que se informa al correr, que es cuando alguien puede hacer algo: si falta
 * uno que sí factura a la estructura, lo que hay que revisar es la columna AC, no este cuadro.
 *
 * @param {string[]} proveedores los que el cuadro sí lista
 * @returns {string[]} los declarados en rubro-caja.mjs que no aparecen
 */
export function declaradosSinFila(proveedores = []) {
  const hay = new Set(proveedores.map(norm))
  return RECURRENTES.filter((r) => !hay.has(r))
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hallarPestana(hojas, PESTAÑA)

  // Los proveedores salen de la PLANILLA, no de una lista tipeada acá: si mañana entra un servicio
  // recurrente nuevo, aparece solo. La lista de rubro-caja decide QUIÉN es recurrente; ésta decide
  // quién efectivamente facturó.
  // SIN TECHO. Decía 'Compras!A4:AC940' y la planilla ya va por la fila 818: el día que pase de 940,
  // un proveedor recurrente nuevo deja de aparecer en el cuadro y nada lo dice — el rango fosilizado
  // que este repositorio ya pagó. Los SUMIFS de la grilla son abiertos; la lectura tenía que serlo.
  const compras = await google.readSheetValues(ID, RANGO_COMPRAS)
  const provs = [...new Set(compras.filter((f) => String(f?.[28] ?? '').trim() === RUBRO)
    .map((f) => String(f?.[4] ?? '').trim()).filter(Boolean))].sort()
  if (!provs.length) throw new Error(`no encontré ninguna fila con rubro "${RUBRO}" en Compras`)

  const g = grilla(provs)
  console.log(`${hoja.title}: ${g.filas.length} filas · ${provs.length} proveedores · TOTAL en la fila ${g.fTot}`)
  console.log(`  ${provs.join(' · ')}`)
  const sinFila = declaradosSinFila(provs)
  if (sinFila.length) {
    console.log(`  ℹ declarados recurrentes SIN fila (nada clasificado en el rubro): ${sinFila.join(' · ')}`)
    console.log('    si alguno factura a la estructura, el problema está en la columna AC de Compras, no acá.')
  }
  if (DRY) return console.log('--dry: no escribí nada.')

  // EL FORMATO SE LIMPIA ANTES DE ESCRIBIR, no después. Con USER_ENTERED, Google interpreta el valor
  // SEGÚN EL FORMATO QUE LA CELDA YA TIENE: si quedó en TEXTO de un layout anterior, "1/2/2026" se
  // guarda como texto y ninguna pintada posterior lo convierte en fecha. Por eso febrero salía
  // "1/2/2026" al lado de enero mostrando "ene". Primero se limpia, después se escribe, y al final
  // se pinta.
  await google.spreadsheetBatchUpdate(ID, [{
    repeatCell: {
      range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.min(hoja.rows ?? 200, 200), startColumnIndex: 0, endColumnIndex: hoja.cols ?? ANCHO },
      cell: {}, fields: 'userEnteredFormat',
    },
  }])
  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Ver lib/preservar-anotaciones.mjs.
  const gridRec = g.filas.map((f) => f.map((c) => (c instanceof Date ? `${c.getUTCDate()}/${c.getUTCMonth() + 1}/${c.getUTCFullYear()}` : c)))
  // LA COLA DE UNA CORRIDA ANTERIOR (13/08). La lista de proveedores SALE DE LA PLANILLA, así que la
  // grilla se acorta sola: el día que un servicio deja de facturar, su fila deja de emitirse y la
  // vieja queda publicada —con los doce meses del año pasado— debajo del cuadro nuevo, sumando en
  // ningún total y engañando a la vista. `conPrueba` porque ésta NO es una pestaña espejo: sólo se
  // limpia la fila donde todo lo que hay es forma de dato generado o un rótulo que ya escribí antes.
  const cola = await conColaMedidaLeida(google, ID, hoja.title, gridRec, { ancho: ANCHO, conPrueba: true, pestana: hoja.title })
  if (avisoDeCola(cola, hoja.title)) console.log(avisoDeCola(cola, hoja.title))
  const escritura = await escribirPreservando(google, ID, hoja.title, cola.filas, { anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  // ═══ SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA (31/07) ═══
  //
  // El defecto que arruinó CAJA, buscado en todos los generadores y encontrado en seis. La guarda hace
  // bien su trabajo —con la pestaña candada o con la firma editada, `escribirPreservando` NO escribe—
  // pero el resultado se descartaba y la corrida seguía: el formateador pintaba la geometría de la
  // grilla NUEVA sobre los valores VIEJOS, y donde había rangos con nombre los reapuntaba a filas que
  // en la pestaña no tienen ese dato. En CAJA eso dejó CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO sobre
  // dos celdas vacías: con el total y la fecha de corte en cero, todo cheque y toda quincena pasaban el
  // filtro y el calendario inflaba sus tramos. Sin un solo #ERROR y sin un aviso.
  //
  // Una pestaña que no se escribió no cambió de forma: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato ni sus rangos con nombre. Queda exactamente como la dejaste.')
  const { conservadas } = salteada ? { conservadas: [] } : escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  if (!salteada) await formatear(google, hoja, g)

  const v = await google.readSheetValues(ID, `${hoja.title}!A1:C${g.filas.length}`)
  console.log(`\nCONTROL  Compras ${v[g.ctrl]?.[1]} · cuadro ${v[g.ctrl + 1]?.[1]} · diferencia ${v[g.ctrl + 2]?.[1]}`)
  console.log(`  sin fecha de caja: ${v[g.ctrl + 3]?.[1]} · meses cerrados en $0: ${v[g.ctrl + 4]?.[1]}`)
  // La diferencia ya viene redondeada a peso por la fórmula: acá alcanza con leerla.
  const dif = Number(String(v[g.ctrl + 2]?.[1] ?? '0').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  if (Math.abs(dif) >= 1) { console.log(`  ⚠ la diferencia no es $0: ${dif}`); process.exitCode = 1 }
}

/**
 * NÚCLEO PURO: los formatos propios de esta pestaña, los que la piel de statement no puede deducir.
 *
 * CADA COLUMNA DECLARA SU FORMATO EN CADA CORRIDA — ninguna hereda. La versión anterior pintaba
 * moneda de la columna B hasta el final de la grilla y "Meses con gasto" mostraba "$5".
 *
 * @param {{sheetId:number}} hoja
 * @param {ReturnType<typeof grilla>} g
 * @returns {object[]} requests para spreadsheetBatchUpdate, para aplicar DESPUÉS de la piel
 */
export function formatosPropios(hoja, g) {
  const { sheetId } = hoja
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  // EL CUERPO VA SIN "$". El símbolo es del total: repetido ochenta veces deja de informar y sólo
  // ensucia la columna. Y el cero se dibuja "—", que es lo que separa "no hubo" de "hubo cero".
  fmt(r(0, n, 1, ANCHO), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  // El encabezado: los doce meses como mes corto, y los tres rótulos de la derecha como texto.
  fmt({ ...r(FILA_CAB - 1, FILA_CAB), startColumnIndex: C_MES0, endColumnIndex: C_MES0 + 12 },
    'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'mmm' }, horizontalAlignment: 'RIGHT' })
  fmt({ ...r(FILA_CAB - 1, FILA_CAB), startColumnIndex: C_TOTREAL, endColumnIndex: ANCHO_VIS },
    'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
  // "Meses con gasto" ES UN CONTADOR, NO PLATA.
  fmt({ ...r(g.f0 - 1, g.f1), startColumnIndex: C_NMESES, endColumnIndex: C_NMESES + 1 },
    'userEnteredFormat.numberFormat', { numberFormat: CONTADOR })
  // LO PROYECTADO EN ITÁLICA, NO EN ÁMBAR. Un estimado no se puede confundir con un hecho, y la
  // convención de un estado financiero para eso es la itálica — no un rectángulo pintado, que es
  // justo lo que hace que la pestaña se lea como planilla.
  // ARRANCA EN EL MES EN CURSO, NO EN EL SIGUIENTE (13/08/2026). Desde que la celda del mes
  // corriente muestra MAX(real; esperado), ese número PUEDE ser una estimación — y con la itálica
  // empezando en septiembre se dibujaba en redonda, o sea presentado como un hecho. Es la regla de
  // oro 2, y la convención de la pestaña ya estaba escrita: un estimado no se puede confundir con
  // un hecho.
  const primeraProy = new Date().getUTCMonth() // 0-based: el mes en curso es la primera columna estimable
  fmt({ ...r(g.f0 - 1, g.f1), startColumnIndex: C_MES0 + primeraProy, endColumnIndex: C_MES0 + 12 },
    'userEnteredFormat.textFormat', { textFormat: { italic: true } })
  // LA FILA DEL TOTAL ES LA ÚNICA QUE LLEVA "$".
  fmt(r(g.fTot - 1, g.fTot, 1, ANCHO_VIS), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  // El bloque de control: importes con "$" (son cifras de cierre, no cuerpo de tabla), el contador
  // de meses en cero como contador, y las dos celdas que TIENEN que dar cero en formato de control —
  // el único rojo de la pestaña.
  fmt(r(g.ctrl, g.ctrl + 2, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  fmt(r(g.fDif - 1, g.fDif + 1, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_CONTROL })
  fmt(r(g.ctrl + 4, g.ctrl + 5, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: CONTADOR })
  // El bloque de ARCA: importes con "$", la cobertura como porcentaje, y en formato de control SÓLO
  // la línea que tiene que dar cero de verdad — lo que ARCA facturó y Compras no cargó. Lo que está
  // sin comprobante en el libro NO va en rojo: se sabe inflado por los proveedores que no facturan.
  fmt(r(g.arca0 + 2, g.arca0 + 7, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  fmt(r(g.arca0 + 5, g.arca0 + 6, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: PORCENTAJE })
  fmt(r(g.arca0 + 6, g.arca0 + 7, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_CONTROL })
  // Las columnas auxiliares, ocultas: son andamio, no información.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_AUX0, endIndex: ANCHO }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 340 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ANCHO_VIS }, properties: { pixelSize: 96 }, fields: 'pixelSize' } })
  return req
}

async function formatear(google, hoja, g) {
  // La piel PRIMERO (reset de fondos, tipografía, hairlines, sin reja) y los formatos propios
  // DESPUÉS, en el mismo lote: los requests se aplican en orden, así que lo propio manda donde se
  // superpone. La piel lee la grilla SIN el centinela — el `\0` no es espacio y le rompería la
  // detección de "esta fila tiene contenido".
  const req = [
    ...skinRequests({
      sheetId: hoja.sheetId,
      filas: limpiarCentinela(g.filas).map((f) => f.slice(0, ANCHO_VIS)),
      cols: ANCHO_VIS,
      congeladas: FILA_CAB,
      filasHoja: hoja.rows ?? g.filas.length,
    }),
    ...formatosPropios(hoja, g),
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenColumnCount: 1 } }, fields: 'gridProperties.frozenColumnCount' } },
  ]
  await google.spreadsheetBatchUpdate(ID, req)
}

// SÓLO CORRE SI SE LO INVOCA, NO SI SE LO IMPORTA. Sin esta guarda, un test que importa `grilla()`
// arranca el generador contra el Sheet real.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
