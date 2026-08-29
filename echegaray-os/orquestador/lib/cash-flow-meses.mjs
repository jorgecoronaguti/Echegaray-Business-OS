// CASH FLOW MENSUAL — LOS DOCE MESES DEL EJERCICIO EN UNA MATRIZ.
//
// ═══ QUÉ REEMPLAZA (06/08/2026) ═══
//
// A los doce bloques verticales de ocho líneas. Contestaban "¿cómo cierra agosto?" y no contestaban
// nunca la que importa —*"¿cómo cierra el año y qué mes se sale de lo previsto?"*— porque para
// comparar dos meses había que recorrer 96 filas de arriba abajo. El dueño lo rechazó y pidió la
// forma de siempre: una fila por concepto, los doce meses a la derecha, el total al final.
//
// ═══ LO QUE SE CONSERVA ENTERO ═══
//
// · Todo número de plata sale de `_MOVIMIENTOS` por `terminoLibro` — ningún número pegado.
// · El ancla del saldo es `expresionInicio` (cash-flow-ancla-saldo.mjs), con la MISMA semántica: el
//   mes que contiene el corte arranca en `total − REAL del mes hasta el corte`. El control A5 del
//   anexo de CAJA verifica exactamente esa identidad; cambiarla lo dejaría midiendo otra cosa.
// · El presupuesto no se inventa: sale de `_PRESUPUESTO_MENSUAL`, y un mes sin cargar muestra "—".
//   Un cero no es un presupuesto de cero: es que nadie lo cargó.
// · Los tres rangos con nombre (CF_MESES, CF_SALDO_INICIO, CF_SALDO_CIERRE) se siguen publicando, ahora
//   sobre las filas 7, 8 y 14 y las columnas B..M. Los consume el anexo de CAJA y la proyección de
//   comisiones bancarias: son el contrato de esta vista con el resto del archivo.
//
// ═══ LO QUE SE FUE, Y ADÓNDE ═══
//
// El costo financiero estimado del año (interés del descubierto, comisiones, impuesto al cheque) vive
// en "Impuestos y Financieros". No son movimientos cargados sino modelo del OS. Después de la última
// fila del cuadro no va nada más: el dueño pidió "no agregar información, no agregar métricas".

import {
  COL, FILA,
  conceptosDe, filaDeConcepto, colTotal, columnasDeTiempo, filaGraficos, footprintDe,
  medidasDeLaMatriz, bloquesDeMedida, formulasDeMedida,
  expresionVentana, ventanas, celda, rangoFila, serialDeFecha, rotuloMes, URL_ARCHIVO, ROTULO_HOY, ROTULO_CONCEPTO,
} from './cash-flow-matriz.mjs'
import { MEDIDAS, formulaMedida } from './cash-flow-medidas.mjs'
import { terminoLibro } from './libro-sumas.mjs'
import { bloquesDeCliente, filaTituloPorCliente, formulasPorCliente } from './cash-flow-por-cliente.mjs'
import { expresionInicio } from './cash-flow-ancla-saldo.mjs'
import { NOMBRE_MESES } from './cash-flow-lineas.mjs'
import { NOMBRES as PRESUPUESTO } from './cash-flow-presupuesto.mjs'
import { columnasDelPasado, expresionRotulo } from './cash-flow-hoy.mjs'
import { acotarAlEjercicio, bordeDelEjercicio } from './cash-flow-borde-anio.mjs'
import {
  expresionInvertido, glosaDeCierre, glosaConInvertido, muestraSemanal, IMPORTE_MUESTRA, GLOSA_SIN_ANCLA,
} from './cash-flow-invertido.mjs'

/** El nombre de la pestaña. Único lugar donde se escribe. */
export const PESTANA_MENSUAL = 'Cash Flow Mensual'
const TIPO = 'mes'

/** Los doce primeros-de-mes del ejercicio. La fecha ES el contrato de la ventana de cada columna. */
export const mesesDelAnio = (anio) => ventanas(TIPO, { anio }).map((v) => v.desde)

/** Dónde arranca cada una de las cuatro cifras del hero. */
const SLOTS_HERO = Object.freeze([0, 3, 7, 11])

/**
 * LOS TEXTOS DEL TITULAR, EXPORTADOS PARA QUE EL TEST LOS FIJE DESDE ACÁ Y NO LOS TIPEE.
 *
 * Un test que repite la cadena literal prueba que alguien escribió la misma cadena dos veces. Lo que
 * hay que fijar es el LÍMITE (37 caracteres) y lo que el rótulo NO puede volver a decir.
 *
 * Ninguno pasa de 37 caracteres — ver `bloqueHero` para por qué ese número manda.
 */
export const ROTULOS_HERO = Object.freeze({
  hoy: 'CAJA HOY',
  hoySinAncla: GLOSA_SIN_ANCLA,
  pasado: 'YA PASÓ EN EL AÑO',
  pasadoEntro: 'entró',
  pasadoSalio: 'salió',
  viene: 'LO QUE VIENE (YA VENDIDO)',
  vieneCobrar: 'a cobrar',
  vienePagar: 'a pagar',
  // LA PALABRA QUE SE HABÍA PERDIDO. El titular viejo decía "sin ventas nuevas · es un piso" y el
  // rediseño se quedó con la mitad: `(YA VENDIDO)` dice de dónde salen los ingresos, no qué significa
  // que el neto dé negativo. Los ingresos proyectados salen SÓLO de Cobranzas —un libro de cuentas por
  // cobrar, no un pipeline comercial— y los egresos se proyectan por calendario y están completos: el
  // número es, por construcción, el peor caso. 343 px medidos contra los 374 del slot.
  vieneCola: 'piso',
  cierre: 'CIERRE PROYECTADO AL 31/12',
})

/** El tope medido de la columna del hero. Lo verifica el test, no la buena voluntad. */
export const ANCHO_HERO = 37

/**
 * La celda del presupuesto de un mes, buscada POR FECHA y no por posición.
 *
 * PRESUPUESTO_MESES es un rango VERTICAL de doce filas, así que `INDEX(rango;n)` es inequívoco.
 * Si el rango con nombre todavía no existe —primera corrida, antes de que se cree la pestaña— la
 * fórmula devuelve #NAME? y el IFERROR de quien la usa lo convierte en "—". Nunca en un cero.
 */
const refPresupuesto = (rango, mes) => `INDEX(${rango};MATCH(${mes};${PRESUPUESTO.meses};0))`

/**
 * NÚCLEO PURO: la grilla entera de la pestaña. No toca la red.
 *
 * @param {object} p
 * @param {number} p.anio
 * @param {{saldo:string|null, fecha:string|null, minima:string|null}} p.refs rangos con nombre de CAJA
 * @param {Date} [p.hoy] sólo decide qué meses ya cerraron (el pliegue). Las columnas son las del ejercicio.
 * @returns {{filas:any[][], meta:object}}
 */
export function grillaMeses({ anio = 2026, refs = {}, gid = null, hoy = new Date() } = {}) {
  const { saldo: refSaldo = null, fecha: refFecha = null } = refs
  const filas = []
  const poner = (f, col, valor) => {
    const row = filas[f - 1] || (filas[f - 1] = [])
    row[col] = valor
  }
  const n = columnasDeTiempo(TIPO)
  const cT = colTotal(TIPO)
  const meses = ventanas(TIPO, { anio })
  const footprint = footprintDe(TIPO, anio)
  const fila = Object.fromEntries(conceptosDe(TIPO).map((c) => [c.clave, filaDeConcepto(TIPO, c.clave)]))
  const meta = {
    pestana: PESTANA_MENSUAL, tipo: TIPO, anio, ancho: footprint.cols, footprint,
    cab: { fila: FILA.cabecera, col0: COL.tiempo0, n, colTotal: cT },
    fila, hero: { rotulo: FILA.heroRotulo, valor: FILA.heroValor, nota: FILA.heroNota, slots: SLOTS_HERO },
    bloques: bloquesDeMedida(TIPO),
    clientes: { titulo: filaTituloPorCliente(TIPO), bloques: bloquesDeCliente(TIPO) },
    grafico: { fila: filaGraficos(TIPO), col: COL.tiempo0 },
    ventanas: meses, rotulos: meses.map((v) => rotuloMes(v.desde)),
    // LOS DOCE MESES YA CUBREN EL EJERCICIO EXACTO: `efectivas` es idéntico a `ventanas` y ningún mes
    // se recorta. Se publica igual porque el control de cuadre compara la COBERTURA de las dos vistas
    // antes de escribir una celda, y una vista que no declara qué cubre no se puede comparar con nada.
    efectivas: acotarAlEjercicio(meses, anio), cubre: bordeDelEjercicio(anio),
    // Los meses YA CERRADOS se pliegan igual que las semanas terminadas: doce columnas se recorren de
    // un vistazo, pero la pestaña sigue abriendo en enero y lo que se decide está de agosto en adelante.
    plegar: columnasDelPasado(meses, hoy, { col0: COL.tiempo0 }),
  }

  poner(FILA.titulo, 0, `Cash Flow Mensual ${anio}`)
  poner(FILA.subtitulo, 0, formulaSubtitulo(refFecha, celda(COL.tiempo0, FILA.cabecera)))
  // EL MENSUAL TAMBIÉN MARCA DÓNDE ESTAMOS (13/08/2026). Tenía el atajo el semanal y no éste, y el
  // control del pipeline lo reclamaba igual en las dos pestañas — reclamaba un atajo que en el Mensual
  // no existía. Doce columnas se recorren de un vistazo, pero saber cuál es el mes en curso no es un
  // atajo de navegación: es la línea entre lo que ya ocurrió y lo que todavía es proyección.
  const vinculo = vinculoHoy(gid, meta)
  if (vinculo) { poner(FILA.botonHoy, 0, vinculo); meta.botonHoy = { fila: FILA.botonHoy, col: 0 } }

  bloqueHero(poner, meta, refs)

  poner(FILA.cabecera, 0, ROTULO_CONCEPTO)
  meses.forEach((v, j) => poner(FILA.cabecera, COL.tiempo0 + j, serialDeFecha(v.desde)))
  poner(FILA.cabecera, cT, 'TOTAL')

  for (const c of conceptosDe(TIPO)) poner(fila[c.clave], 0, c.rotulo)
  for (let j = 0; j < n; j++) columnaDeMes(poner, meta, j, { refSaldo, refFecha })
  for (const c of conceptosDe(TIPO)) {
    if (c.total) poner(fila[c.clave], cT, `=SUM(${rangoFila(fila[c.clave], COL.tiempo0, COL.tiempo0 + n - 1)})`)
  }

  meta.filaFin = filas.length
  return { filas, meta }
}

/**
 * EL SUBTÍTULO — la línea donde el cuadro declara con qué criterio está armado.
 *
 * ═══ POR QUÉ EL SALDO RECONSTRUIDO SE DECLARA ACÁ Y NO EN OTRO LADO (28/08/2026) ═══
 *
 * Desde hoy los meses anteriores al corte de CAJA publican un saldo inicial DESPEJADO hacia atrás
 * (ver `expresionInicio`). Es aritmética sobre las propias cifras del cuadro, no un dato traído de
 * ninguna parte — y por eso mismo NO es un hecho: es un CÁLCULO, y si al libro de movimientos le
 * falta algo, el faltante se absorbe entero en esos saldos. Un número que se dedujo tiene que
 * decirlo donde se lo lee, o el lector supone que alguien lo registró.
 *
 * Va en el subtítulo y no en el rótulo de la fila porque el rótulo de la columna A se corta contra
 * la celda de enero; y no en una fila nueva porque el contrato del cuadro es que después de la última
 * fila no va nada. El subtítulo es texto que desborda sobre una fila vacía: entra entero.
 *
 * Y APARECE SÓLO CUANDO HAY ALGO QUE DECLARAR. Si el corte de CAJA cae en el primer mes del cuadro
 * no hay ningún saldo reconstruido, y una advertencia permanente sobre algo que no está pasando
 * enseña a saltearla. La condición se evalúa en la hoja porque `CAJA_FECHA_SALDO` es un rango con
 * nombre: el generador no sabe —ni tiene que saber— dónde está el corte al momento de escribir.
 *
 * @param {string|null} refFecha rango con nombre de la fecha del saldo declarado, o null
 * @param {string} primerMes celda del encabezado del primer mes del cuadro
 */
export function formulaSubtitulo(refFecha, primerMes) {
  const base = '"Cuánto entra, cuánto sale y cómo cierra cada mes · criterio percibido · del libro de movimientos · al "&TEXT(TODAY();"d/mm/yyyy")'
  if (!refFecha) return `=${base}`
  const aviso = `" · los meses anteriores al "&TEXT(${refFecha};"d/mm")&" muestran un saldo CALCULADO hacia atrás, no registrado"`
  return `=${base}&IF(${primerMes}<${refFecha};${aviso};"")`
}

/**
 * DÓNDE ESTÁ EL MES EN CURSO. Mismo contrato que el del semanal (`cash-flow-semanas.vinculoHoy`), y el
 * mismo criterio del 13/08: el rótulo DICE ("Mes actual: I  ·  ago 26") en vez de prometer un botón que
 * `HYPERLINK` no puede ser. El vínculo queda porque a tres gestos funciona y no cuesta nada.
 *
 * `EOMONTH(TODAY();-1)+1` ES el primero del mes corriente — la misma expresión con la que se generaron
 * los encabezados, así que el MATCH es exacto y no aproximado. Si el cuadro quedó viejo (otro año) la
 * celda muestra #N/A, y está bien: taparlo con IFERROR cambiaría un aviso por un vínculo a cualquier lado.
 */
export function vinculoHoy(gid, meta) {
  if (gid === null || gid === undefined) return null
  const rangoCab = rangoFila(meta.cab.fila, meta.cab.col0, meta.cab.col0 + meta.cab.n - 1)
  const primero = 'EOMONTH(TODAY();-1)+1'
  const dir = `ADDRESS(${meta.cab.fila};MATCH(${primero};${rangoCab};0)+${meta.cab.col0};4)`
  // `mmm yy` va en US como todo patrón de formato del repo, aunque los argumentos vayan en es-AR (`;`).
  const rotulo = expresionRotulo(ROTULO_HOY.mes, dir, primero, 'mmm yy')
  return `=HYPERLINK("${URL_ARCHIVO()}#gid=${gid}&range="&${dir};${rotulo})`
}

/**
 * EL TITULAR DEL AÑO — CUATRO TARJETAS, UNA VENTANA DE TIEMPO CADA UNA.
 *
 * Ninguna recalcula nada: cada cifra sale del propio cuadro o del ancla de CAJA. Un titular con su
 * propia aritmética es la forma más elegante de tener dos verdades en una pestaña.
 *
 * ═══ EL RECHAZO, Y LA CAUSA DE FONDO (29/08/2026) ═══
 *
 * El dueño vio las cuatro anteriores y las rechazó: *"todo eso rehacer no me convence nada"*. La causa
 * no era la redacción: las cuatro FUNDÍAN lo real con lo proyectado adentro de una misma cifra.
 * `ENTRA EN EL AÑO $816.416.110` era $496.729.892 ya cobrado MÁS $319.686.218 por cobrar, y ningún
 * lector puede separar el hecho de la promesa de un número que ya los sumó. La glosa lo abría, pero la
 * cifra —lo que se lee primero y lo que se recuerda— seguía siendo un híbrido. Regla de oro 3 (nunca
 * mezclar ventanas de tiempo) y regla 17 (distinguir actividad de progreso).
 *
 * Desde acá la regla es estructural y MEDIBLE: ninguna tarjeta cita filas de dos ventanas. Lo verifica
 * `ventanasDe` (cash-flow-ventanas) sobre cada valor y cada glosa del titular, no un comentario.
 *
 *   1 · CAJA HOY          la única foto del presente, y lo dice con la fecha del saldo declarado
 *   2 · YA PASÓ EN EL AÑO reales contra reales: lo que la caja hizo, sin una sola proyección adentro
 *   3 · LO QUE VIENE      proyectado contra proyectado, y el rótulo declara el supuesto (ya vendido)
 *   4 · CIERRE AL 31/12   el saldo de diciembre que el cuadro ya calcula
 *
 * ═══ POR QUÉ LA LIQUIDEZ TOTAL BAJÓ A UNA GLOSA ═══
 *
 * Porque era la única cifra que no podía cumplir la regla: saldo proyectado a diciembre más una
 * posición que vale hoy. No se borró —son $45.015.210 de la empresa— pero dejó de ser un titular y
 * pasó a la nota del cierre, que es donde una mezcla se puede declarar en vez de disimular. Ver
 * `glosaDeCierre` en cash-flow-invertido.
 *
 * EL LÍMITE DE LOS 37 CARACTERES no es una preferencia: el auditor de pantalla midió que la columna
 * del hero corta ahí. Las glosas que son fórmula se miden por su `muestra` —el peor caso ya
 * renderizado, con un importe de diez dígitos— porque una fórmula no se puede medir.
 */
function bloqueHero(poner, meta, refs = {}) {
  const { saldo: refSaldo = null, fecha: refFecha = null, caja: refCaja = null } = refs
  const R = meta.hero.rotulo
  const V = meta.hero.valor
  // LA GLOSA VA UNA FILA ABAJO, EN LA MISMA COLUMNA. Estaba en la celda de al lado y le dejaba al
  // importe una sola columna de 95 px: ver `FILA.heroNota` en cash-flow-matriz para el número cortado
  // que eso produjo en la pestaña real.
  const G = meta.hero.nota
  const T = (clave) => celda(meta.cab.colTotal, meta.fila[clave])
  const invertido = expresionInvertido(refCaja)
  // El cierre del año es el saldo final de DICIEMBRE, no la suma de los saldos: sumar doce stocks no
  // da un stock. Los meses anteriores al corte van vacíos, así que sumarlos daría cualquier cosa.
  const diciembre = celda(meta.cab.col0 + meta.cab.n - 1, meta.fila.saldoFinal)
  const cierre = glosaDeCierre({ refCierre: diciembre, exprInvertido: invertido })

  const tarjetas = [
    {
      // LA MISMA GLOSA QUE EL SEMANAL, DE LA MISMA FUNCIÓN. Las dos vistas no pueden decir dos cosas
      // distintas de la misma plata, y el Semanal ya publicaba esta foto con su fecha.
      rotulo: ROTULOS_HERO.hoy,
      valor: refSaldo ? `=N(${refSaldo})` : '',
      glosa: refFecha ? glosaConInvertido(`"al "&TEXT(${refFecha};"d/mm")`, invertido) : ROTULOS_HERO.hoySinAncla,
      muestra: refFecha ? muestraSemanal() : ROTULOS_HERO.hoySinAncla,
    },
    {
      rotulo: ROTULOS_HERO.pasado,
      valor: `=N(${T('ingresoReal')})-N(${T('egresoReal')})`,
      ...glosaPartida(ROTULOS_HERO.pasadoEntro, T('ingresoReal'), ROTULOS_HERO.pasadoSalio, T('egresoReal')),
    },
    {
      rotulo: ROTULOS_HERO.viene,
      valor: `=N(${T('ingresoProyectado')})-N(${T('egresoProyectado')})`,
      ...glosaPartida(ROTULOS_HERO.vieneCobrar, T('ingresoProyectado'), ROTULOS_HERO.vienePagar, T('egresoProyectado'), ROTULOS_HERO.vieneCola),
    },
    { rotulo: ROTULOS_HERO.cierre, valor: `=N(${diciembre})`, glosa: cierre.glosa, muestra: cierre.muestra },
  ]

  meta.hero.slots.forEach((s, i) => {
    poner(R, s, tarjetas[i].rotulo)
    poner(V, s, tarjetas[i].valor)
    poner(G, s, tarjetas[i].glosa)
  })
  // EL TITULAR DECLARA LO QUE VA A MOSTRAR, para que el auditor de ancho lo mida sin adivinarlo. Antes
  // el test raspaba la grilla y SALTEABA toda glosa que fuera fórmula: las que llevan un importe
  // adentro no se estaban midiendo, que es justo donde se cortó el número que vio el dueño.
  meta.hero.piezas = tarjetas.flatMap((t, i) => [
    { slot: i, pieza: 'rotulo', texto: t.rotulo },
    { slot: i, pieza: 'nota', texto: t.muestra },
  ])
}

/**
 * LA GLOSA QUE ABRE UNA VARIACIÓN EN SUS DOS TÉRMINOS — los dos de la MISMA ventana.
 *
 * El dicho va ADELANTE del número ("entró $ 496.729.892") y no atrás: la tarjeta publica una resta, y
 * lo primero que hay que saber de cada término es qué es, no cuánto.
 *
 * Devuelve la fórmula Y su `muestra`: el mismo texto con el importe más largo que el titular tiene que
 * poder mostrar. Sin la muestra, el auditor de ancho no puede medir una glosa que es fórmula — y no
 * medirla es exactamente cómo llegó a producción `$839.552.44(`.
 */
export function glosaPartida(dichoA, refA, dichoB, refB, cola = '') {
  const plata = (c) => `TEXT(${c};"$ #,##0")`
  const fin = cola ? ` · ${cola}` : ''
  // Sin cola NO se concatena una cadena vacía: `&""` al final es ruido que después alguien copia.
  return {
    glosa: `="${dichoA} "&${plata(refA)}&" · ${dichoB} "&${plata(refB)}${fin ? `&"${fin}"` : ''}`,
    muestra: `${dichoA} ${IMPORTE_MUESTRA} · ${dichoB} ${IMPORTE_MUESTRA}${fin}`,
  }
}

/** Una columna de mes: el ancla o el eslabón, las cuatro medidas, el resultado, el saldo y las variaciones. */
function columnaDeMes(poner, meta, j, { refSaldo, refFecha }) {
  const col = meta.cab.col0 + j
  const cab = celda(col, meta.cab.fila)
  const { desde, hasta } = expresionVentana(cab, meta.tipo)
  const f = meta.fila

  // El rol de cada mes frente al saldo declarado lo decide cash-flow-ancla-saldo, que es donde está
  // probado. Acá sólo se le dice qué parte del mes ancla YA está adentro del saldo.
  poner(f.saldoInicial, col, refSaldo && refFecha
    ? expresionInicio({
      desde, hasta, refSaldo, refFecha,
      // LOS MESES ANTERIORES AL CORTE YA NO VAN VACÍOS (28/08): se despejan de la propia cadena,
      // `inicio(mes) = inicio(mes+1) − resultado(mes)`. Se engancha al INICIO del mes siguiente y no
      // al cierre del propio mes para no cerrar un ciclo de referencias — el por qué está en
      // `expresionInicio`, junto a la aritmética. El último mes no tiene siguiente: va vacío, y el
      // vacío se propaga solo hacia la izquierda cuando el corte cae fuera del ejercicio.
      siguiente: j === meta.cab.n - 1 ? null : celda(col + 1, f.saldoInicial),
      resultadoDelPeriodo: celda(col, f.resultado),
      // SIN TECHO EN EL CORTE (06/08): la línea de "posteriores al corte" del total NO tiene techo,
      // así que un REAL fechado DESPUÉS del corte ya está adentro del saldo declarado. Restarlo sólo
      // hasta el corte lo dejaba en el inicio Y en la columna de su fecha: $11,1M contados dos veces
      // (medidos por el verificador de conectividad). Se resta TODO el REAL desde el arranque del
      // período ancla en adelante; la cadena lo re-suma exactamente una vez en la columna que le toca.
      yaVividoEnElAncla: terminoLibro({ desde, estados: ['REAL'], medida: 'neto' }),
      anterior: j === 0 ? null : celda(col - 1, f.saldoFinal),
    })
    : '')
  // Subtotal + apertura por rubro, de la misma función que usa el semanal: las dos vistas no pueden
  // definir distinto qué es "Materiales Civil" porque no hay dos definiciones.
  for (const c of medidasDeLaMatriz()) {
    for (const linea of formulasDeMedida(meta.tipo, c.clave, { col, desde, hasta })) poner(linea.fila, col, linea.formula)
  }
  poner(f.resultado, col,
    `=N(${celda(col, f.ingresoReal)})+N(${celda(col, f.ingresoProyectado)})`
    + `-N(${celda(col, f.egresoReal)})-N(${celda(col, f.egresoProyectado)})`)
  // Un mes sin cadena (anterior al corte) no tiene cierre: queda vacío, nunca en cero. Un cero se
  // leería como "la empresa cerró el mes sin plata", que es una afirmación que nadie hizo.
  poner(f.saldoFinal, col,
    `=IF(N(${celda(col, f.saldoInicial)})=0;"";N(${celda(col, f.saldoInicial)})+N(${celda(col, f.resultado)}))`)

  // La sección POR CLIENTE cuelga de los subtotales de arriba (su residuo los resta), así que se
  // escribe después: el orden de escritura es el orden en que se audita la dependencia.
  for (const linea of formulasPorCliente(meta.tipo, { col, desde, hasta })) poner(linea.fila, col, linea.formula)

  poner(f.variacionPresupuesto, col, formulaVariacionPresupuesto(cab, celda(col, f.resultado)))
  poner(f.variacionMesAnterior, col, j === 0
    ? ''
    : `=N(${celda(col, f.resultado)})-N(${celda(col - 1, f.resultado)})`)
}

/**
 * LA VARIACIÓN CONTRA EL PRESUPUESTO — y el "—" que no es un cero.
 *
 * El IFERROR es de los legítimos: cubre el caso ESPERADO de que `_PRESUPUESTO_MENSUAL` todavía no
 * exista (primera corrida del archivo) y sus rangos con nombre devuelvan #NAME?. No tapa una búsqueda
 * que falla — tapa una pestaña que todavía no nació, y lo dice con el mismo guion que el mes sin cargar.
 */
export function formulaVariacionPresupuesto(celdaMes, celdaResultado) {
  const pI = refPresupuesto(PRESUPUESTO.ingresos, celdaMes)
  const pE = refPresupuesto(PRESUPUESTO.egresos, celdaMes)
  const hay = `(N(${pI})<>0)+(N(${pE})<>0)`
  return `=IFERROR(IF(${hay}=0;"—";N(${celdaResultado})-(N(${pI})-N(${pE})));"—")`
}

/**
 * LOS NOMBRES QUE ESTA VISTA LE OFRECE AL RESTO DEL ARCHIVO.
 *
 * Existen porque un rediseño ya le rompió el piso a un consumidor real: el anexo de CAJA ubicaba las
 * filas de esta pestaña por sus rótulos y leía sus doce meses en las columnas B..M. Con estos tres
 * nombres, ese control apunta a algo estable sin conocer la geometría de la vista.
 */
export const NOMBRES_VISTA = Object.freeze({
  meses: NOMBRE_MESES,
  // CF_SALDO_INICIO/CF_SALDO_CIERRE quedaron QUEMADOS el 06/08: el achique de columnas del rediseño
  // los dejó colgando del lado de Google (el GET no los proyecta pero el nombre sigue reservado y el
  // add da 400). Nombres nuevos, y el generador ahora publica ANTES de achicar para no repetirlo.
  inicio: 'CF_INICIO',
  cierre: 'CF_CIERRE',
})

/**
 * LOS RANGOS CON NOMBRE QUE PUBLICA ESTA VISTA — AHORA HORIZONTALES.
 *
 * Eran tres columnas de doce filas en la zona auxiliar oculta; son tres FILAS de doce columnas, que es
 * la geometría de la matriz. Sus consumidores (`caja-anexo-controles.mjs`) los usan con
 * `INDEX(rango;1;MATCH(…))`: `MATCH` da lo mismo sobre una fila o una columna, y la fila explícita en
 * `INDEX` es lo que lo hace inequívoco — `INDEX(rango;n)` sobre una sola fila significa "la fila n".
 *
 * SE PUBLICAN EN LA MISMA CORRIDA QUE SE ESCRIBE LA GRILLA. Un nombre apuntando a la geometría
 * anterior no da error: devuelve otra celda, y el control que lo lee miente sin un solo #REF!.
 */
export function destinosNombrados(meta) {
  const col = meta.cab.col0 + 1 // los destinos se declaran 1-indexados
  const cols = meta.cab.n
  return [
    { name: NOMBRES_VISTA.meses, fila: meta.cab.fila, col, filas: 1, cols },
    { name: NOMBRES_VISTA.inicio, fila: meta.fila.saldoInicial, col, filas: 1, cols },
    { name: NOMBRES_VISTA.cierre, fila: meta.fila.saldoFinal, col, filas: 1, cols },
  ]
}

/**
 * La expresión que las dos vistas comparten para un período. Existe para el TEST de identidad: si
 * alguien cambia la definición de una medida en una vista y no en la otra, el test lo ve sin red.
 */
export function medidasDelMes(desdeRef, hastaRef) {
  return MEDIDAS.map((m) => ({ clave: m.clave, formula: formulaMedida(m, desdeRef, hastaRef).replace(/^=/, '') }))
}
