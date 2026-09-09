#!/usr/bin/env node
// Rehace la pestaña Estructura: un cuadro, sin detalle, con la proyección ADENTRO.
//
// "La proyección de gastos de estructura la quiero en el mismo cuadro, no así como en la captura" —
// la versión anterior tenía la proyección apilada en una columna al final, separada de los meses.
// Ahora cada mes de agosto a diciembre muestra su proyección en la misma fila y la misma columna
// donde estaría el real, con fondo distinto para que no se confunda jamás un estimado con un hecho.
//
// TAMBIÉN SACA UNA DUPLICACIÓN. La pestaña tenía su PROPIO clasificador: repetía a mano toda la
// lógica de "esto no es nómina, no es gremial, no es recurrente, es unidad de negocio Estructura".
// Esa regla ya vive en la columna "Rubro de caja" de Compras. Acá ahora sólo se sub-clasifica lo
// que Compras ya marcó como Estructura — una definición, no dos que se pueden desincronizar.
//
// LA REGLA DE PROYECCIÓN, y por qué es ésa. Sólo se proyecta un rubro que apareció en 4 meses
// CERRADOS o más. Sin ese filtro, la compra de una moto ($4.352.000, una vez en enero) se proyectaba
// todos los meses y la estructura del año daba $120,8M contra $33M reales. Un gasto que pasó una vez
// no es una tendencia. El monto proyectado es el promedio de los meses CERRADOS en que SÍ hubo
// gasto, ajustado por la inflación de Parámetros (REM del BCRA, que el OS actualiza solo).
//
//   node orquestador/scripts/estructura-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { MIN_MESES, MES_EN_CURSO, COL_FECHA } from '../lib/cash-flow-lineas.mjs'
import { rotuloPorFuente, formulaUltimaFecha } from '../lib/fecha-de-frescura.mjs'
// El ancho de la columna de concepto es del estándar, no de esta pestaña: ver `ANCHO` en el lib.
import { ANCHO as ANCHO_COLUMNA } from '../lib/estilo-pestana.mjs'
// LA DEFINICION COMPARTIDA de una fila de gasto propio. Ver el encabezado de ese archivo.
import { CRITERIO, celdasDelAnio, seccionRecurrentes, RUBRO_RECURRENTE } from '../lib/estructura-filas.mjs'
import { SUBRUBROS, OTROS } from '../lib/sub-rubro-estructura.mjs'
import { escribirPreservando, limpiarCentinela, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { fila as filaConNombre, aRangoApi, verificarRangos, explicarProblemas } from '../lib/rangos-con-nombre.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL, MONEDA_CONTROL, CONTADOR, PORCENTAJE } from '../lib/formato-statement.mjs'
import { ANCLA_AUXILIAR } from '../lib/libro-extractores-estructura.mjs'
import { bloqueControlArca, bloqueIndivisible, FILA_BLOQUE, MONTOS_BLOQUE } from '../lib/control-arca-bloque.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Estructura'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
// MIN_MESES viene de cash-flow-lineas.mjs (13/08/2026). Estaba tipeado acá también, con el mismo
// valor y el mismo significado —"menos que esto no es una tendencia, es un gasto suelto"—, y allá el
// comentario dice literalmente "misma regla que Estructura". Dos copias del mismo umbral es la forma
// en que dos cuadros terminan proyectando cosas distintas de la misma plata el día que alguien mueve
// una sola.

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// Los sub-rubros viven en la lib: el auditor de reglas de oro necesita la lista para verificar que
// ninguna fórmula use un sub-rubro que la definición única no conoce, y no puede importar un script.


// Columnas. Visible: A + 12 meses + 4 de totales. Auxiliar (oculta): el real de cada mes, que es de
// donde sale la proyección — sin separarlo, la fórmula de un mes se leería a sí misma (#REF!).
const C_MES0 = 1, C_TOTREAL = 13, C_PROY = 14, C_TOTAL = 15, C_PCT = 16
const C_AUX0 = 18            // S..AD: el real de los 12 meses
const C_NMESES = 30          // AE: en cuántos meses CERRADOS hubo gasto
const C_REALCERRADO = 31     // AF: lo real de esos meses cerrados — el numerador del promedio
const ANCHO = 32

// ═══ EL ENCABEZADO Y EL TITULAR OCUPAN OCHO FILAS, Y POR ESO EL CUADRO EMPIEZA EN LA 9 (09/09/2026) ═══
//
// 1 el nombre · 2 la procedencia · 3 el respiro · 4-6 el titular con sus dos sub-líneas · 7 el respiro
// · 8 el título del bloque 1 · 9 el encabezado de la tabla. `FILA_CAB` NO se tipea dos veces: la
// máscara de meses cerrados y el constructor compartido de celdas leen esta misma constante, así que
// mover el titular no puede dejar la ventana de meses apuntando a otra fila.
const FILA_TITULAR = 4
const FILA_CAB = 9
// ═══ LA VENTANA DE MESES CERRADOS, COMO MÁSCARA DE DOCE CELDAS (13/08/2026) ═══
//
// Vale 1 en cada mes que YA TERMINÓ y 0 en el que corre y en los que faltan. La usan el contador de
// meses y el total que alimenta el promedio: una sola definición de "hasta dónde se puede observar",
// para que las dos no puedan discrepar sobre el mismo mes.
//
// El encabezado de cada columna ES el primero de su mes, así que la comparación con MES_EN_CURSO es
// exacta y no necesita EOMONTH.
const CERRADOS = `(${letra(C_MES0)}$${FILA_CAB}:${letra(C_MES0 + 11)}$${FILA_CAB}<${MES_EN_CURSO})`

/** EL LAYOUT, EN UN SOLO OBJETO: es lo que el constructor compartido necesita para escribir las
 *  celdas de un año. Una segunda copia de estos índices es la forma exacta en que las dos pestañas
 *  se desincronizaron. */
const COL_LAYOUT = Object.freeze({
  mes0: C_MES0, aux0: C_AUX0, nmeses: C_NMESES, prom: C_REALCERRADO, filaCab: FILA_CAB,
  total: C_TOTREAL, proy: C_PROY, totalAnio: C_TOTAL, cerrados: CERRADOS,
})
// LOS RANGOS DE COMPRAS VIVEN EN `lib/estructura-filas.mjs` desde el 07/09/2026, con el resto de la
// definición compartida: el sub-rubro está en COMPRAS (columna AF) y no acá, porque SUMIFS devuelve
// #VALUE! cuando el rango a sumar está en una pestaña y los criterios en otra.
const COL_SUB_COMPRAS = 31   // AF

export function grilla(recurrentes = []) {
  const rubros = [...SUBRUBROS.map(([n]) => n), OTROS]
  const filas = []
  const push = (c) => { filas.push(c); return filas.length }
  // ═══ CADA CELDA NACE MÍA Y VACÍA (04/08) ═══
  //
  // Antes era `Array(ANCHO).fill('')`, y la fusión lee la cadena vacía como "no es mi celda,
  // preservala". Cuando este layout creció —se agregaron el subtítulo, dos filas en blanco y el
  // título de sección— el encabezado y las tres primeras filas de datos de la versión ANTERIOR se
  // quedaron clavados en las filas 2 a 5: los doce primeros-de-mes en crudo pintados como moneda
  // ("$46.023"), y fórmulas de "% del total" dividiendo por $P$11, que en el layout de hoy es
  // "Honorarios y servicios". Dos encabezados, un cuadro duplicado, y ni un solo #ERROR que lo
  // delatara. El centinela declara el vacío; el clearValues, que sería la otra salida, ya borró el
  // trabajo del dueño seis veces.
  const vacia = () => Array(ANCHO).fill(VACIO)

  // A1 ES EL NOMBRE DE LA PESTAÑA, SIN SINÓNIMO. Decía "Gastos de estructura" sobre una pestaña
  // llamada "Estructura": dos nombres para lo mismo, y el lector no sabe si son dos cosas. El
  // contrato de `lib/diseno-unificado.mjs` lo mide como `titulo-distinto`.
  const t = vacia(); t[0] = PESTAÑA; push(t)
  const s = vacia()
  // ═══ LA FILA 2 DECLARA PROCEDENCIA Y NO EXPLICA NADA (09/09/2026) ═══
  //
  // Decía «Rubro "Estructura" de Compras. Desde agosto, proyección (itálica): sólo lo que apareció en
  // 4 meses cerrados o más»: eso es la REGLA de proyección, o sea una explicación, y bajo el
  // minimalismo extremo no va en la pestaña — vive en el encabezado de `lib/estructura-filas.mjs`,
  // que es donde alguien la va a buscar. Lo que la itálica y la columna «Proyectado» ya dicen no hace
  // falta decirlo con palabras.
  //
  // Y LA FECHA DE CORTE SE MIDE, NO SE TIPEA: `rotuloPorFuente` la saca de la última compra cargada y
  // avisa sola cuando la fuente se congela. Una fecha escrita a mano envejece sin que nadie se entere.
  s[0] = rotuloPorFuente('Gasto propio del año', [
    // `mixto`: la columna de fecha de Compras convive como serial y como texto tipeado — un MAX crudo
    // pierde las tipeadas EN SILENCIO y declararía como corte la última que entró como número.
    { nombre: 'Compras', expr: formulaUltimaFecha(COL_FECHA, { mixto: true }) },
  ])
  push(s)
  push(vacia())

  // ═══ EL TITULAR: LA CIFRA QUE LA PESTAÑA CONTESTA, ARRIBA Y SIN BUSCARLA ═══
  //
  // Las tres celdas apuntan a la MISMA fila de totales del cuadro (`$TOT` se resuelve abajo, cuando
  // se sabe en qué fila quedó): el titular no puede discrepar del cuadro porque no vuelve a calcular
  // nada. Y las dos sub-líneas suman exactamente el titular por construcción — «Proyectado» está
  // definido en el cuadro como total menos real.
  //
  // ES EL TOTAL DE ESTRUCTURA, NO LA SUMA CON SERVICIOS RECURRENTES. Los dos cuadros son universos
  // disjuntos de Compras (ver `lib/estructura-filas.mjs`) y sólo el primero tiene control contra
  // Compras y contra el libro de ARCA: un titular que sumara los dos publicaría una cifra que ningún
  // control de esta pestaña verifica.
  const tit = vacia()
  tit[0] = `GASTO DE ESTRUCTURA ${AÑO}`
  tit[1] = `=$${letra(C_TOTAL)}$TOT`
  push(tit)
  const subReal = vacia(); subReal[0] = '   · Real a la fecha'; subReal[1] = `=$${letra(C_TOTREAL)}$TOT`; push(subReal)
  const subProy = vacia(); subProy[0] = '   · Proyectado'; subProy[1] = `=$${letra(C_PROY)}$TOT`; push(subProy)
  push(vacia())
  // EL TÍTULO DE SECCIÓN VA JUSTO ARRIBA DE SU ENCABEZADO. Aprovecha una de las filas en blanco que
  // ya había, así que no corre ninguna fila: las fórmulas de abajo referencian filas absolutas y un
  // desplazamiento las dejaría apuntando a otra cosa, en silencio.
  // LA NUMERACIÓN DE LOS BLOQUES SE CUENTA, NO SE TIPEA: la sección de recurrentes existe sólo si
  // Compras trae proveedores en ese rubro, y con los números clavados el ensayo en seco publicaba
  // «1, 3, 4». El contrato de diseño lo mide como `numeracion-con-hueco`.
  let nBloque = 0
  const s1 = vacia(); s1[0] = `${++nBloque} · EL GASTO DE ESTRUCTURA, MES A MES`; push(s1)

  const cab = vacia()
  cab[0] = 'Rubro'
  for (let m = 0; m < 12; m++) cab[C_MES0 + m] = `1/${m + 1}/${AÑO}`
  cab[C_TOTREAL] = 'Total real'
  cab[C_PROY] = 'Proyectado'
  cab[C_TOTAL] = `Total ${AÑO}`
  cab[C_PCT] = '% del total'
  // EL RÓTULO ES EXACTAMENTE `ANCLA_AUXILIAR`: el extractor del libro ubica esta columna con
  // `startsWith`, así que el rótulo es contrato y no adorno. Lo que decía después ("de acá sale la
  // proyección, no borrar ni mostrar") es una instrucción al lector, o sea prosa: vive en el
  // comentario de arriba, donde está el porqué de la columna auxiliar.
  cab[C_AUX0] = ANCLA_AUXILIAR
  // Las dos auxiliares que forman el promedio llevan nombre aunque estén ocultas: un divisor sin
  // rótulo es exactamente cómo alguien vuelve a leerlo como "meses del año" dentro de seis meses.
  // El rótulo dice QUÉ contiene la columna; cuál de las dos es el divisor y cuál el numerador se lee
  // en la fórmula de `C_MES0`, tres líneas más abajo, y no en un paréntesis de la fila 6.
  cab[C_NMESES] = 'AUXILIAR — meses CERRADOS con gasto'
  cab[C_REALCERRADO] = 'AUXILIAR — promedio de los meses cerrados'
  push(cab)

  const f0 = filas.length + 1
  for (const r of rubros) {
    const f = filas.length + 1
    const fila = vacia()
    fila[0] = r
    // ═══ LAS CELDAS DEL AÑO SALEN DEL CONSTRUCTOR COMPARTIDO (07/09/2026) ═══
    //
    // Acá vivía la segunda definición de la misma proyección. La regla del MES EN CURSO había
    // DIVERGIDO: Recurrentes lo trataba como «MAX(real; proyección)» desde el 13/08 y esta pestaña
    // seguía mostrando el real aunque fuera cero — el combustible se carga tarde, así que el mes en
    // curso arrancaba en «—» como si no fuera a gastarse nada. Gana la regla nueva, para las dos.
    const { aux, visible } = celdasDelAnio({ fila: f, criterio: CRITERIO.subrubro, col: COL_LAYOUT, letra })
    for (let m = 0; m < 12; m++) {
      fila[C_AUX0 + m] = aux[m]
      fila[C_MES0 + m] = visible[m]
    }
    const real = `$${letra(C_AUX0)}${f}:$${letra(C_AUX0 + 11)}${f}`
    // EL PROMEDIO SE SACA SOBRE MESES CERRADOS, NO SOBRE EL AÑO (13/08/2026): contando el mes en
    // curso, cargar una factura de este mes BAJABA la proyección de los futuros — el cuadro empeoraba
    // su pronóstico justo cuando llegaba más información. SUMPRODUCT y no COUNTIF/SUMIFS porque la
    // condición cruza el importe de cada mes con la FECHA de su encabezado, que vive en otra fila.
    fila[C_NMESES] = `=SUMPRODUCT((${real}<>0)*${CERRADOS})`
    // LA AUXILIAR PASÓ DE NUMERADOR A PROMEDIO (07/09/2026): el constructor compartido cita UN
    // promedio ya declarado en vez de recalcular la división adentro de cada uno de los doce meses.
    // El numerador sigue siendo lo real DE LOS MESES CERRADOS — si sumara el año entero incluiría lo
    // poco que va del mes en curso repartido entre meses que no lo contienen.
    fila[C_REALCERRADO] = `=IF($${letra(C_NMESES)}${f}=0;0;SUMPRODUCT(${real}*${CERRADOS})/$${letra(C_NMESES)}${f})`
    // "Total real" NO cambia: es el año entero, incluido lo que ya se cargó del mes en curso, porque
    // es el hecho que el bloque de control de abajo compara contra Compras. Recortarlo haría fallar
    // ese control por algo que no es un error de carga.
    fila[C_TOTREAL] = `=SUM(${real})`
    fila[C_TOTAL] = `=SUM($${letra(C_MES0)}${f}:$${letra(C_MES0 + 11)}${f})`
    fila[C_PROY] = `=$${letra(C_TOTAL)}${f}-$${letra(C_TOTREAL)}${f}`
    fila[C_PCT] = `=IFERROR($${letra(C_TOTAL)}${f}/$${letra(C_TOTAL)}$TOT;0)`
    push(fila)
  }
  const f1 = filas.length
  const tot = vacia()
  tot[0] = ROTULO_TOTAL
  for (const c of [...Array(12).keys()].map((m) => C_MES0 + m).concat([C_TOTREAL, C_PROY, C_TOTAL])) {
    tot[c] = `=SUM(${letra(c)}${f0}:${letra(c)}${f1})`
  }
  const fTot = push(tot)

  // ═══ LOS SERVICIOS RECURRENTES, QUE HASTA HOY TENÍAN PESTAÑA PROPIA (07/09/2026) ═══
  //
  // Pedido del dueño: «unificá las pestañas Recurrentes y Estructura». Contestaban la misma pregunta
  // con dos generadores y DOS reglas de proyección. El porqué, qué gana y por qué el Cash Flow no se
  // entera: el encabezado y `filasRecurrentes` de lib/estructura-filas.mjs.
  const rec = seccionRecurrentes({
    proveedores: recurrentes, fila0: filas.length + 1, col: COL_LAYOUT, letra, vacia, anio: AÑO,
    numerar: () => ++nBloque,
  })
  for (const fila of rec.filas) push(fila)
  const fTotRec = rec.fTot ? rec.fTot : null

  push(vacia())
  const c1 = vacia()
  // EL TÍTULO NOMBRA SU BLOQUE Y NO ARGUMENTA SOBRE ÉL. La glosa anterior —"QUE ESTE CUADRO SEA
  // EXACTAMENTE EL RUBRO ESTRUCTURA DE COMPRAS"— decía qué tiene que pasar, que es justo lo que las
  // dos filas de abajo miden. Ver `partesDeTitulo` en lib/diseno-unificado.mjs.
  c1[0] = `${++nBloque} · CONTROL CONTRA COMPRAS`
  push(c1)
  // ═══ NI UNA COLUMNA DE PROSA (04/08) ═══
  //
  // La columna D llevaba una oración por fila de control ("Es la misma línea del Cash Flow Mensual.",
  // "Distinto de cero = hay gastos…", "Un gasto que pasó una o dos veces no es una tendencia…"). El
  // dueño las borra a mano y volvían en cada corrida — con el worker cada 2 horas, todos los días.
  // Si un número necesita un párrafo al lado, el número está mal elegido: lo que decía la oración
  // pasa al RÓTULO, que es una celda que ya existía y que nadie borra.
  // "(la misma línea del Cash Flow Mensual)" era una referencia cruzada, no un rótulo: la línea del
  // Cash Flow Mensual sale de esta misma columna de Compras (lib/cash-flow-mapa.mjs, fila 29), y eso
  // se verifica en el código, no leyendo un paréntesis.
  const c2 = vacia(); c2[0] = 'Estructura según Compras'
  c2[1] = '=SUMIF(Compras!$AC$4:$AC;"Estructura";Compras!$O$4:$O)'
  const fc = push(c2)
  const c3 = vacia(); c3[0] = '⇒ Diferencia contra Compras'
  // ROUND A PESO: sin esto, una diferencia de fracciones de centavo se dibuja "-$0" y enciende el
  // rojo del control con los datos perfectos. Un control que grita por nada se deja de mirar.
  c3[1] = `=ROUND($B${fc}-$${letra(C_TOTREAL)}${fTot};0)`
  push(c3)
  // EL RÓTULO SIGUE DICIENDO "CERRADOS" —es lo que el número mide y sin eso el cuadro miente— pero
  // deja de argumentar: "no son tendencia" era la conclusión, y la conclusión es del que lee.
  const c4 = vacia(); c4[0] = `Rubros no proyectados — menos de ${MIN_MESES} meses cerrados`
  c4[1] = `=COUNTIFS($${letra(C_NMESES)}${f0}:$${letra(C_NMESES)}${f1};"<${MIN_MESES}";$${letra(C_TOTREAL)}${f0}:$${letra(C_TOTREAL)}${f1};">0")`
  push(c4)

  // ── 3 · EL CONTROL QUE NO SE VALIDA CONTRA SÍ MISMO ─────────────────────────────────────────────
  // El bloque 2 compara este cuadro contra Compras, y las dos cifras salen de Compras: prueba que el
  // cuadro no se olvida un sub-rubro, no que Compras esté bien. Éste compara contra el libro de IVA
  // de ARCA, que el OS no escribe.
  push(vacia())
  const arca0 = filas.length + 1
  for (const b of bloqueControlArca({ titulo: `${++nBloque} · RESPALDO FISCAL — contra el libro de IVA de ARCA`, rubros: ['Estructura'], fila0: arca0 })) {
    const fila = vacia()
    b.forEach((c, i) => { fila[i] = c })
    push(fila)
  }

  const resuelto = filas.map((f) => f.map((c) => (typeof c === 'string' ? c.replaceAll('$TOT', String(fTot)) : c)))
  // LOS DOS CUADROS DE CONTROL SON INDIVISIBLES, y el generador es el único que lo sabe. Sin esta
  // declaración la huella los da por borrados de a pedazos cuando este layout se mueve: pasó el
  // 13/08 y dejó `B28` («⇒ Cobertura fiscal») publicando `""` con B25/B26 vacías, y `B19` («⇒
  // Diferencia … debe ser $0») restando contra una `B18` vacía, o sea gritando en rojo el total
  // entero del cuadro. Ver lib/celda-de-estructura.mjs.
  const indivisibles = [{ desde: fc - 1, hasta: fc + 2 }, bloqueIndivisible(arca0)]
  return { filas: resuelto, f0, f1, fTot, fTotRec, fCabRec: rec.fCab, fCtrl: fc, rubros, arca0, indivisibles }
}

/** El rótulo de la fila de totales. Es el ancla del rango con nombre: si cambia, cambian los dos. */
export const ROTULO_TOTAL = 'TOTAL ESTRUCTURA'

/**
 * NÚCLEO PURO: los rangos con nombre de esta pestaña, anclados a la fila de totales.
 *
 * ═══ POR QUÉ APARECE ACÁ RECIÉN AHORA (03/08) ═══
 *
 * `ESTRUCTURA_TOTAL_MESES` existía en el archivo real apuntando a la FILA 3 de esta pestaña, que hoy
 * es una de las dos filas en blanco entre el subtítulo y el primer título de sección: cero celdas con
 * dato. Y este generador no publicaba NINGÚN rango con nombre — o sea que el nombre venía de un
 * layout anterior (cuando el cuadro arrancaba arriba de todo, sin subtítulo ni títulos de sección) y
 * nadie lo volvió a mover nunca. Anclado a la posición, otra vez.
 *
 * SE REAPUNTA, NO SE BORRA — al revés que `OFICINA_EFECTIVO`. La diferencia es que acá el bloque que
 * el nombre describe EXISTE: los doce totales por mes de la fila TOTAL ESTRUCTURA, que es la línea
 * "Gastos de estructura" del cash flow mes a mes. Un nombre con destino se arregla apuntándolo; uno
 * sin destino se retira.
 *
 * INFERENCIA declarada: que `ESTRUCTURA_TOTAL_MESES` quería decir "los totales por mes" sale del
 * nombre y de su forma (una fila, no una columna). Ninguna fórmula del OS lo usa hoy, así que no hay
 * un consumidor que lo confirme. Si el dueño lo tenía apuntando a otra cosa, esto lo cambia.
 *
 * @param {ReturnType<typeof grilla>} g
 */
export function rangosDeEstructura(g) {
  return [
    filaConNombre('ESTRUCTURA_TOTAL_MESES', { fila: g.fTot, c0: C_MES0, c1: C_MES0 + 11, rotulo: ROTULO_TOTAL }),
  ]
}

async function publicarRangos(google, sheetId, g) {
  const quiero = rangosDeEstructura(g)
  // No se publica un rango ciego: se verifica contra la grilla recién armada, sin red.
  const problemas = verificarRangos(g.filas, quiero)
  if (problemas.length) {
    console.error('✗ NO publico los rangos con nombre: hay rangos ciegos\n' + explicarProblemas(problemas))
    process.exitCode = 1
    return
  }
  const existentes = new Map((await google.getNamedRanges(ID)).map((r) => [r.name, r.namedRangeId]))
  const reqs = quiero.map((d) => {
    const range = aRangoApi(sheetId, d)
    return existentes.has(d.nombre)
      ? { updateNamedRange: { namedRange: { namedRangeId: existentes.get(d.nombre), name: d.nombre, range }, fields: 'range' } }
      : { addNamedRange: { namedRange: { name: d.nombre, range } } }
  })
  await google.spreadsheetBatchUpdate(ID, reqs)
  console.log(`rangos con nombre publicados: ${quiero.map((d) => d.nombre).join(', ')} — sobre la fila ${g.fTot} (${ROTULO_TOTAL})`)
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  // LOS PROVEEDORES RECURRENTES SALEN DE LA PLANILLA, no de una lista tipeada acá: si mañana entra un
  // servicio nuevo, aparece solo. Rango ABIERTO — con techo, el día que Compras pase esa fila un
  // proveedor deja de aparecer y nada lo dice. El `--dry` no los lee: es un ensayo sin red.
  const recurrentes = DRY ? [] : await google.readSheetValues(ID, 'Compras!A4:AC')
    .then((c) => [...new Set(c.filter((f) => String(f?.[28] ?? '').trim() === RUBRO_RECURRENTE)
      .map((f) => String(f?.[4] ?? '').trim()).filter(Boolean))].sort())
    .catch((e) => {
      // FALLA CERRADO Y GRITA: sin la lectura no se inventa la lista. Publicar la pestaña SIN la
      // sección borraría los recurrentes del archivo del dueño en silencio, que es peor que no correr.
      throw new Error(`no pude leer Compras para armar la sección de recurrentes (${e.message}). NO escribo: `
        + 'publicar sin esa sección le borraría el cuadro entero.')
    })
  const g = grilla(recurrentes)
  console.log(`${PESTAÑA}: ${g.filas.length} filas x ${ANCHO} columnas · rubros ${g.f0}-${g.f1} · total ${g.fTot}`
    + `${g.fTotRec ? ` · ${recurrentes.length} recurrentes, total ${g.fTotRec}` : ''}`)
  if (DRY) {
    console.log('Ejemplo de celda visible (enero, primer rubro):')
    console.log('  ', g.filas[g.f0 - 1][C_MES0])
    return
  }

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTAÑA)
  const compras = meta.find((s) => s.title === 'Compras')
  const { sheetId } = hoja
  if (hoja.cols < ANCHO) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: ANCHO - hoja.cols } }])
  }

  // El sub-rubro, en Compras, colgado del rubro que Compras ya definió.
  const texto = 'LOWER(Compras!$K$4:$K&" "&Compras!$L$4:$L&" "&Compras!$E$4:$E)'
  let sub = `"${OTROS}"`
  for (const [n, p] of [...SUBRUBROS].reverse()) sub = `IF(REGEXMATCH(${texto};"${p}");"${n}";${sub})`
  const fSub = `=ARRAYFORMULA(IF(Compras!$AC$4:$AC<>"Estructura";"";${sub}))`
  const reqC = []
  if (compras.cols < COL_SUB_COMPRAS + 1) {
    reqC.push({ appendDimension: { sheetId: compras.sheetId, dimension: 'COLUMNS', length: COL_SUB_COMPRAS + 1 - compras.cols } })
  }
  reqC.push({
    updateCells: {
      range: { sheetId: compras.sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: COL_SUB_COMPRAS, endColumnIndex: COL_SUB_COMPRAS + 1 },
      rows: [
        { values: [{ userEnteredValue: { stringValue: 'Sub-rubro de estructura' }, userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }] },
        { values: [{ userEnteredValue: { formulaValue: fSub } }] },
      ],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  })
  reqC.push({ updateDimensionProperties: { range: { sheetId: compras.sheetId, dimension: 'COLUMNS', startIndex: COL_SUB_COMPRAS, endIndex: COL_SUB_COMPRAS + 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, reqC)

  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Ver lib/preservar-anotaciones.mjs.
  // LA COLA (06/09/2026) — LA EXCUSA ERA FALSA Y EL ARCHIVO LA DESMINTIÓ. La lista de
  // `cola-en-todos-los-generadores.test.mjs` declaraba a esta pestaña de alto fijo, «nunca cambió de
  // tamaño». La A30 del archivo real dice otra cosa: el aviso largo del bloque de ARCA —el de 190
  // caracteres que se acortó cuando el bloque cambió de forma— sobrevive ahí abajo, fuera de la
  // grilla, contando «$1 en 85 filas (-35.721.950.023%)». Ninguna corrida lo escribe hoy y ninguna lo
  // borraba: el generador no era dueño de su cola. Con `conPrueba` sólo se limpia lo que este
  // generador probó haber escrito antes.
  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, g.filas, { ancho: ANCHO, conPrueba: true, pestana: PESTAÑA })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  const escritura = await escribirPreservando(google, ID, PESTAÑA, cola.filas, { anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO), indivisibles: g.indivisibles })
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
  if (!salteada) await formatear(google, sheetId, g)
  if (!salteada) await publicarRangos(google, sheetId, g)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(C_PCT)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `\n⚠ ${err.length} celdas en error: ${err.slice(0, 8).join(' ')}` : '\n✓ sin errores')
  console.log('\nRUBRO                                REAL     PROYECTADO      TOTAL AÑO')
  for (let i = g.f0; i <= g.fTot; i++) {
    const f = v[i - 1] || []
    console.log(`${String(f[0] ?? '').slice(0, 32).padEnd(34)}${String(f[C_TOTREAL] ?? '').padStart(12)}${String(f[C_PROY] ?? '').padStart(15)}${String(f[C_TOTAL] ?? '').padStart(15)}`)
  }
  console.log('\nCONTROL:')
  console.log(`  Estructura según Compras   ${v[g.fCtrl - 1]?.[1]}`)
  console.log(`  ⇒ Diferencia               ${v[g.fCtrl]?.[1]}`)
  console.log(`  Rubros sin proyectar       ${v[g.fCtrl + 1]?.[1]}`)
}

/**
 * NÚCLEO PURO: los formatos propios de esta pestaña — los que la piel de statement no puede deducir
 * del contenido. Cada columna declara el suyo en cada corrida; ninguna hereda.
 *
 * ═══ LO QUE SE FUE, Y POR QUÉ (04/08) ═══
 *
 * La barra AZUL rellena del encabezado, el fondo ÁMBAR de lo proyectado y el gris de la fila del
 * total: los tres son rectángulos pintados, que es el rasgo que hace que una pestaña se lea como
 * planilla y no como un estado financiero. La jerarquía la da la tipografía y una línea fina —lo que
 * ya sabía hacer `estilo-statement`, y esta pestaña nunca usó—. Lo proyectado se distingue en
 * ITÁLICA, que es la convención para un estimado y cumple igual la regla de negocio de que un
 * estimado nunca se confunda con un hecho.
 *
 * Y el "$" se fue del cuerpo: queda sólo en la fila del total y en el bloque de control.
 *
 * @param {number} sheetId
 * @param {ReturnType<typeof grilla>} g
 * @returns {object[]} requests, para aplicar DESPUÉS de la piel
 */
export function formatosPropios(sheetId, g) {
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, g.filas.length) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, g.filas.length, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  // EL TITULAR LLEVA EL "$" Y SUS DOS SUB-LÍNEAS NO. Es la misma jerarquía que dentro del cuadro: la
  // cifra que la pestaña contesta se marca con la unidad, y lo que la descompone se lee debajo sin
  // repetirla. Va DESPUÉS del barrido de cuerpo, que cubre la columna entera desde la fila 1.
  fmt(r(FILA_TITULAR - 1, FILA_TITULAR, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  // La sub-línea de lo proyectado, en itálica: la MISMA convención que las columnas de agosto a
  // diciembre del cuadro. Un estimado nunca se dibuja como un hecho, tampoco arriba de todo.
  fmt(r(FILA_TITULAR + 1, FILA_TITULAR + 2, 1, 2), 'userEnteredFormat.textFormat', { textFormat: { italic: true } })
  // LOS DOS ENCABEZADOS DE MES LLEVAN EL MISMO FORMATO, y el segundo se resuelve por la fila que la
  // grilla declara — no por una constante. Sin esto la fila 18 publicaba «1/1/2026» crudo al lado de
  // un «ene»: dos formas del mismo encabezado en la misma pestaña, que es justo lo que la
  // unificación vino a terminar.
  for (const fc of [FILA_CAB, ...(g.fTotRec ? [g.fCabRec] : [])].filter(Boolean)) {
    fmt({ ...r(fc - 1, fc), startColumnIndex: C_MES0, endColumnIndex: C_MES0 + 12 },
      'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'mmm' }, horizontalAlignment: 'RIGHT' })
  }
  fmt({ ...r(FILA_CAB - 1, FILA_CAB), startColumnIndex: C_TOTREAL, endColumnIndex: C_PCT + 1 },
    'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'RIGHT' })
  // Lo proyectado, en itálica. Agosto es el primer mes proyectado (índice 7 de los 12).
  fmt({ ...r(g.f0 - 1, g.fTot), startColumnIndex: C_MES0 + 7, endColumnIndex: C_MES0 + 12 },
    'userEnteredFormat.textFormat', { textFormat: { italic: true } })
  fmt({ ...r(g.f0 - 1, g.fTot + 1), startColumnIndex: C_PROY, endColumnIndex: C_PROY + 1 },
    'userEnteredFormat.textFormat', { textFormat: { italic: true } })
  // LAS DOS FILAS DE TOTAL LLEVAN "$", y la del segundo cuadro se resuelve por la fila que la grilla
  // declara — no por una constante. Sin esto el cierre de «Servicios recurrentes» se dibujaba igual
  // que el cuerpo: dos totales con dos jerarquías distintas en la misma pestaña.
  for (const ft of [g.fTot, ...(g.fTotRec ? [g.fTotRec] : [])]) {
    fmt(r(ft - 1, ft, 1, C_PCT + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  }
  fmt({ ...r(g.f0 - 1, g.fTot), startColumnIndex: C_PCT, endColumnIndex: C_PCT + 1 },
    'userEnteredFormat.numberFormat', { numberFormat: PORCENTAJE })
  // El bloque de control: dos importes de cierre, la diferencia en formato de control (el único rojo
  // de la pestaña) y un contador. La columna C en adelante ya no lleva nada — la prosa se fue al rótulo.
  fmt(r(g.fCtrl - 1, g.fCtrl, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  fmt(r(g.fCtrl, g.fCtrl + 1, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_CONTROL })
  fmt(r(g.fCtrl + 1, g.fCtrl + 2, 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: CONTADOR })
  // El bloque de ARCA: importes con "$", la cobertura como porcentaje, y en formato de control SÓLO
  // la línea que tiene que dar cero de verdad — lo que ARCA facturó y Compras no cargó. Lo que está
  // sin comprobante en el libro NO va en rojo: se sabe inflado por los proveedores que no facturan.
  // LOS DESPLAZAMIENTOS SALEN DEL BLOQUE, NO SE TIPEAN (14/08/2026). Estaban escritos a mano acá y en
  // las otras dos pestañas que comparten el bloque: tres copias del mismo orden de filas. Ahora las
  // declara `control-arca-bloque.mjs`, que es quien decide ese orden, y su test las ata a los rótulos.
  const fArca = (i) => g.arca0 - 1 + i
  fmt(r(fArca(MONTOS_BLOQUE.desde), fArca(MONTOS_BLOQUE.hasta), 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  fmt(r(fArca(FILA_BLOQUE.cobertura), fArca(FILA_BLOQUE.cobertura + 1), 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: PORCENTAJE })
  fmt(r(fArca(FILA_BLOQUE.global), fArca(FILA_BLOQUE.global + 1), 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_CONTROL })
  // LA ÚLTIMA FILA DEL BLOQUE YA NO ES UN VEREDICTO EN PROSA SINO UN CONTROL «rótulo | número»
  // (09/09/2026, `control-arca-bloque.mjs`): cuenta FILAS, no pesos. Sin este formato la columna B
  // hereda el barrido de moneda y una cuenta de 3 filas se dibuja "$3" — el mismo defecto que ya se
  // midió con la cobertura fiscal en `Materiales!B52`.
  fmt(r(fArca(FILA_BLOQUE.veredicto), fArca(FILA_BLOQUE.veredicto + 1), 1, 2), 'userEnteredFormat.numberFormat', { numberFormat: CONTADOR })

  // EL ANCHO DE LA COLUMNA DE CONCEPTO ES DEL ESTÁNDAR, NO DE ESTA PESTAÑA (09/09/2026). Estaban
  // tipeados 400 px acá y otro número en cada una de las otras pestañas: tres anchos distintos para
  // la misma columna es lo que hace que el archivo se lea como tres archivos. Ver `ANCHO` en
  // lib/estilo-pestana.mjs, que es donde el estándar vive una sola vez.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: ANCHO_COLUMNA.concepto }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: C_PCT + 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } })
  // Las auxiliares se ocultan: el dueño pidió "no quiero el detalle de nada".
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_PCT + 1, endIndex: ANCHO }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } })
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenColumnCount: 1 } }, fields: 'gridProperties.frozenColumnCount' } })
  return req
}

async function formatear(google, sheetId, g) {
  // La piel PRIMERO y los formatos propios DESPUÉS, en el mismo lote: los requests se aplican en
  // orden, así que lo propio manda donde se superpone. La piel recibe la grilla SIN el centinela: el
  // `\0` no es espacio para `trim()` y le rompería la detección de "esta fila tiene contenido".
  await google.spreadsheetBatchUpdate(ID, [
    ...skinRequests({
      sheetId,
      filas: limpiarCentinela(g.filas).map((f) => f.slice(0, C_PCT + 1)),
      cols: C_PCT + 1,
      congeladas: FILA_CAB,
      // EL TITULAR, EN ACENTO Y A MAYOR CUERPO: lo aplica la piel, que es la única que sabe dibujarlo
      // igual en todas las pestañas del archivo. Ver `skinRequests` en lib/estilo-statement.mjs.
      titular: FILA_TITULAR,
      filasHoja: g.filas.length,
    }),
    ...formatosPropios(sheetId, g),
  ])
}

// SÓLO CORRE SI SE LO INVOCA, NO SI SE LO IMPORTA. Sin esta guarda, un test que importa `grilla()`
// para verificar sus rangos con nombre ARRANCA EL GENERADOR CONTRA EL SHEET REAL.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
