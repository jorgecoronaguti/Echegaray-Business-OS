// LOS CONTROLES QUE CUALQUIER COTIZACIÓN TIENE QUE PASAR — histórica o nueva, la misma lista.
//
// ═══ QUÉ CAMBIA RESPECTO DE LAS REGLAS SUELTAS ═══
//
// `hallazgos-cotizacion.mjs` y `hallazgos-celdas.mjs` tienen las reglas. Una regla contesta «¿qué
// encontré?» y devuelve una lista, y una lista vacía es ambigua: puede querer decir «está limpio» o
// «no supe mirar». Un control contesta las DOS preguntas, y por eso su resultado tiene tres estados
// y no dos.
//
//   HALLAZGO           — miró y encontró.
//   LIMPIO             — miró y no encontró. Vale como evidencia.
//   NO_SE_PUDO_MIRAR   — no miró. NO vale como evidencia de nada.
//
// ═══ POR QUÉ EL TERCER ESTADO NO ES UN LUJO ═══
//
// `supuestosOcultos()` era estructuralmente incapaz de devolver algo distinto de 0 y dejó pasar
// $ 4.149.546 adentro de un precio. Su salida era «0 hallazgos» y se leyó como «limpio». Con estos
// tres estados esa función habría dicho NO_SE_PUDO_MIRAR sobre las 237 cotizaciones, que es lo que
// pasaba de verdad.
//
// El caso más caro es el cruzado: `coeficientesInestables` necesita el MISMO concepto en 3
// cotizaciones para poder decir algo. Corrido sobre UNA devuelve una lista vacía —y siempre la va a
// devolver, con cualquier dato—. Eso no es un control verde: es un control que no corrió.
//
// ═══ LAS CINCO REGLAS QUE NO SE NEGOCIAN ═══
//
//   · un valor 0 NO implica error automáticamente     → `indirectosSiempreEnCero` exige que sean
//     TODAS las cotizaciones y un mínimo de casos; un 0 suelto nunca es un hallazgo.
//   · NULL NO es cero                                 → `renglonesIncoherentes` sólo compara cuando
//     los operandos son números finitos; el resto sale en `sinMirar`, no en verde.
//   · una celda vacía NO significa que el control se realizó → eso es exactamente NO_SE_PUDO_MIRAR.
//   · un cálculo NO es un hecho                       → todo hallazgo viaja con su cita y su celda.
//   · una práctica histórica NO es una norma          → eso lo defiende `practica-historica.mjs`.
import {
  coeficienteDeAjusteSinCriterio, coeficientesInestables, datosDeOtroCliente, indirectosSiempreEnCero,
  ivaEscritoAMano, ofertasRotas, aritmeticaQueNoCierra, partidasSinDatos, referenciasRotas,
  rotuloContradiceCoeficiente, unidadesContradictorias,
} from './hallazgos-cotizacion.mjs'
import { celdasEnError, coberturaDeRenglones, formulasSobreCeldaRota, renglonesIncoherentes, tieneInventarioDeCeldas } from './hallazgos-celdas.mjs'
import { TIPO, ordenar, resumen } from './hallazgo.mjs'

export const RESULTADO = Object.freeze({
  HALLAZGO: 'HALLAZGO',
  LIMPIO: 'LIMPIO',
  NO_SE_PUDO_MIRAR: 'NO_SE_PUDO_MIRAR',
})

/** Cuántas cotizaciones necesita un control CRUZADO para poder decir algo. Debajo de eso no está
 *  limpio: no corrió. `coeficientesInestables` compara un mismo concepto entre planillas y su propio
 *  piso interno son 3 casos; `unidadesContradictorias` necesita el mismo código en 2. */
export const MINIMO_CRUZADO = Object.freeze({ coeficiente: 3, unidad: 2, indirecto: 5 })

const sinMirar = (c, porQue) => ({ cotizacion: c.id, obra: c.obra ?? null, archivo: c.nombre ?? null, porQue })

/** La cobertura de un control que mira UNA cotización por vez: cuántas pudo abrir y por qué no las
 *  demás. `puede` recibe la cotización y devuelve `null` si la pudo mirar, o el motivo si no. */
const porCotizacion = (puede) => (cotizaciones) => {
  const faltan = []
  let mirados = 0
  for (const c of cotizaciones) {
    const porQue = puede(c)
    if (porQue) faltan.push(sinMirar(c, porQue))
    else mirados += 1
  }
  return { mirados, sinMirar: faltan }
}

const necesitaOferta = porCotizacion((c) => (c.oferta?.ok ? null : c.oferta?.porQue ?? 'la hoja OFERTA no se pudo leer'))
const necesitaPresupuesto = porCotizacion((c) => (c.presupuesto?.ok ? null : c.presupuesto?.porQue ?? 'la hoja Presupuesto no se pudo leer'))
const necesitaAnalisis = porCotizacion((c) => (c.analisis?.ok ? null : c.analisis?.porQue ?? 'la hoja Análisis no se pudo leer'))
const necesitaGG = porCotizacion((c) => ((c.gg?.conceptos ?? []).length ? null : 'la hoja GG no dejó ningún concepto legible'))
const necesitaCeldas = porCotizacion((c) => (tieneInventarioDeCeldas(c) ? null : 'la cotización no trae el inventario de celdas en error: se estudió con una versión anterior del lector'))

/**
 * EL CONTROL DEL IVA TIPEADO NECESITA VER LAS FÓRMULAS, NO SÓLO LOS NÚMEROS.
 *
 * Cuando el lector corría sin `cellFormula: true` ninguna celda tenía fórmula y el control daba rojo
 * en 12 de 13 ofertas — no porque el IVA estuviera tipeado, sino porque no podía ver una sola
 * fórmula. Una hoja sin ninguna fórmula no es una hoja donde todo está tipeado: es una hoja que este
 * control no puede juzgar, y así se declara.
 */
const necesitaFormulasDeOferta = porCotizacion((c) => {
  if (!c.oferta?.ok) return c.oferta?.porQue ?? 'la hoja OFERTA no se pudo leer'
  const f = c.formulas?.OFERTA
  if (!f) return 'no se leyeron las fórmulas de la hoja OFERTA: sin ellas todo número parece escrito a mano'
  if (!Object.keys(f).length) return 'la hoja OFERTA no tiene NINGUNA fórmula: no se puede distinguir un número calculado de uno tipeado'
  return null
})

/**
 * EL CONTROL DE LA FÓRMULA ROTA TAMPOCO PUEDE MIRAR SIN FÓRMULAS.
 *
 * `formulasSobreCeldaRota` recorre `c.formulas`: sin fórmulas no tiene qué recorrer y devuelve una
 * lista vacía SIEMPRE, con cualquier planilla. Declaraba `necesitaCeldas` —que sólo mira el
 * inventario de celdas rotas—, así que una cotización con el inventario y sin fórmulas salía LIMPIA
 * con `sinMirar` vacío. Es el mismo defecto que ya se había arreglado en el IVA con
 * `necesitaFormulasDeOferta`, un control más allá.
 */
const necesitaFormulasDelLibro = porCotizacion((c) => {
  if (!c.formulas) return 'no se leyeron las fórmulas del libro: sin ellas no se puede ver qué fórmula se apoya en una celda rota'
  const cuantas = Object.values(c.formulas).reduce((a, f) => a + Object.keys(f ?? {}).length, 0)
  return cuantas ? null : 'el libro no dejó NINGUNA fórmula legible: no hay dónde buscar la que se apoya en una celda rota'
})

/**
 * EL CONTROL DEL RENGLÓN NECESITA RENGLONES CON LOS TRES NÚMEROS.
 *
 * `renglonesIncoherentes` sólo compara cuando cantidad, precio y subtotal son números finitos —un
 * NULL no es un 0—, así que sobre una hoja donde ningún renglón trae los tres devuelve 0 hallazgos
 * pase lo que pase. `coberturaDeRenglones()` existe exactamente para contestar eso y no estaba
 * cableada a nada: la llamaban dos tests y nadie más.
 *
 * El corte es POR HOJA y no por cotización: 40 renglones comparados en Presupuesto no son evidencia
 * de nada sobre la OFERTA, que es la hoja que ve el cliente. Lo que NO corta es el renglón suelto —
 * una hoja con 39 renglones comparables y 1 sin cantidad sigue mirándose, y ese 1 se cuenta en
 * `coberturaDeRenglones()`; declararlo NO_SE_PUDO_MIRAR dejaría al control mudo sobre el corpus real.
 */
const necesitaRenglonesComparables = porCotizacion((c) => {
  const { porHoja } = coberturaDeRenglones([c])
  const ciegas = Object.entries(porHoja).filter(([, x]) => x.mirados === 0 && x.salteados > 0).map(([h]) => h)
  return ciegas.length
    ? `en ${ciegas.join(' y ')} ningún renglón trae los tres números: no hay nada que multiplicar y «0 incoherentes» no significa nada`
    : null
})

/** La cobertura de un control CRUZADO: mira el conjunto, no cada cotización. Debajo del mínimo no
 *  puede encontrar nada aunque el defecto exista, así que no mira. */
const necesitaConjunto = (minimo, que) => (cotizaciones) => {
  const aptas = cotizaciones.filter((c) => c.oferta?.ok || c.presupuesto?.ok || (c.gg?.conceptos ?? []).length)
  if (aptas.length >= minimo) return { mirados: aptas.length, sinMirar: [] }
  return {
    mirados: 0,
    sinMirar: [{ cotizacion: null, obra: null, archivo: null, porQue: `compara ${que} entre cotizaciones y hacen falta al menos ${minimo}; llegaron ${aptas.length}` }],
  }
}

const y = (...coberturas) => (cotizaciones) => {
  const partes = coberturas.map((f) => f(cotizaciones))
  return { mirados: Math.min(...partes.map((p) => p.mirados)), sinMirar: partes.flatMap((p) => p.sinMirar) }
}

/**
 * LA LISTA. Cada entrada dice qué mira, con qué regla, y cómo sabe si pudo mirar.
 *
 * `tipos` es el puente con el dataset: dice qué tipo de hallazgo emite cada control, y es lo que
 * permite contestar «¿qué control detectó esto?» sin adivinarlo por el nombre.
 */
export const CONTROLES = Object.freeze([
  { id: 'oferta-con-el-cierre-roto', que: 'el SUB TOTAL, el IVA y el TOTAL de la oferta que ve el cliente', regla: ofertasRotas, cobertura: necesitaOferta, tipos: [TIPO.OFERTA_ROTA] },
  // `deduceDeLaAusencia`: el único control cuyo hallazgo sale de lo que NO está («no hay fórmula,
  // entonces el IVA se tipeó»). Sin cobertura no puede afirmar ni siquiera el defecto.
  { id: 'iva-escrito-a-mano', que: 'si el IVA de la oferta se calcula o se tipea', regla: ivaEscritoAMano, cobertura: necesitaFormulasDeOferta, deduceDeLaAusencia: true, tipos: [TIPO.IVA_ESCRITO_A_MANO] },
  { id: 'aritmetica-de-la-oferta', que: 'que la suma de los ítems dé el subtotal y que subtotal + IVA dé el total', regla: aritmeticaQueNoCierra, cobertura: necesitaOferta, tipos: [TIPO.SUBTOTAL_NO_CIERRA, TIPO.TOTAL_NO_CIERRA] },
  { id: 'rotulo-contra-coeficiente', que: 'que el porcentaje que promete el rótulo de GG sea el que aplica la fórmula', regla: rotuloContradiceCoeficiente, cobertura: necesitaGG, tipos: [TIPO.ROTULO_CONTRADICE_COEFICIENTE] },
  { id: 'coeficiente-inestable', que: 'el mismo concepto de GG con coeficientes muy distintos entre cotizaciones', regla: coeficientesInestables, cobertura: y(necesitaGG, necesitaConjunto(MINIMO_CRUZADO.coeficiente, 'el coeficiente de un mismo concepto')), tipos: [TIPO.COEFICIENTE_INESTABLE] },
  { id: 'unidad-contradictoria', que: 'la misma partida medida en unidades distintas según la cotización', regla: unidadesContradictorias, cobertura: y(necesitaAnalisis, necesitaPresupuesto, necesitaConjunto(MINIMO_CRUZADO.unidad, 'la unidad de un mismo código')), tipos: [TIPO.UNIDAD_CONTRADICTORIA] },
  { id: 'partida-sin-datos', que: 'los renglones «sin datos» que viajan dentro del presupuesto interno', regla: partidasSinDatos, cobertura: necesitaPresupuesto, tipos: [TIPO.PARTIDA_SIN_DATOS] },
  { id: 'datos-comerciales-de-otro-cliente', que: 'las ofertas a OTROS clientes guardadas fuera del área principal de la hoja OFERTA', regla: datosDeOtroCliente, cobertura: necesitaOferta, tipos: [TIPO.DATOS_DE_OTRO_CLIENTE] },
  { id: 'indirecto-siempre-en-cero', que: 'los conceptos de gastos generales que se listan siempre y se cotizan siempre en $ 0', regla: indirectosSiempreEnCero, cobertura: y(necesitaGG, necesitaConjunto(MINIMO_CRUZADO.indirecto, 'el importe de un mismo concepto')), tipos: [TIPO.INDIRECTO_SIEMPRE_EN_CERO] },
  { id: 'coeficiente-de-ajuste-sin-criterio', que: 'la columna COEF. AJUSTE distinta de 1 sin nada que explique por qué', regla: coeficienteDeAjusteSinCriterio, cobertura: necesitaPresupuesto, tipos: [TIPO.COEFICIENTE_AJUSTE_SIN_CRITERIO, TIPO.COEFICIENTE_AJUSTE_IMPLAUSIBLE] },
  { id: 'referencia-rota-en-el-presupuesto', que: 'las filas del presupuesto interno cuyo nombre de tarea es un error de fórmula', regla: referenciasRotas, cobertura: necesitaPresupuesto, tipos: [TIPO.REFERENCIA_ROTA] },
  { id: 'celdas-en-error', que: '#REF!, #N/A, #NAME?, #DIV/0!, #VALUE! y #NUM! en CUALQUIER hoja del libro', regla: celdasEnError, cobertura: necesitaCeldas, tipos: [TIPO.CELDA_EN_ERROR] },
  { id: 'formula-sobre-celda-rota', que: 'las fórmulas sanas que se apoyan en una celda que está en error', regla: formulasSobreCeldaRota, cobertura: y(necesitaCeldas, necesitaFormulasDelLibro), tipos: [TIPO.FORMULA_SOBRE_CELDA_ROTA] },
  { id: 'renglon-que-no-multiplica', que: 'precio × cantidad × coeficiente contra el subtotal que declara el renglón', regla: renglonesIncoherentes, cobertura: y(necesitaOferta, necesitaPresupuesto, necesitaRenglonesComparables), tipos: [TIPO.RENGLON_INCOHERENTE] },
])

/** Qué control emite cada tipo de hallazgo. Es lo que llena `control_que_lo_detecto` del dataset. */
export const CONTROL_POR_TIPO = Object.freeze(Object.fromEntries(
  CONTROLES.flatMap((c) => c.tipos.map((t) => [t, c.id])),
))

/** El control que detectó un hallazgo de este tipo, o `null` si el tipo no lo emite ninguno. PURA. */
export const controlDe = (tipo) => CONTROL_POR_TIPO[tipo] ?? null

/**
 * CORRE UN CONTROL. PURA.
 *
 * ═══ LIMPIO EXIGE HABER MIRADO TODO, NO HABER MIRADO ALGO ═══
 *
 * La versión anterior decidía `LIMPIO` con `cobertura.mirados > 0`: bastaba UNA cotización legible
 * para que el control se declarara limpio sobre la tanda entera. Medido con 5 cotizaciones y 4 con
 * la hoja OFERTA ilegible, `paso()` devolvía `true` con 20 entradas en `sinMirar`; sobre las 237
 * reales alcanzaba con que una sola se pudiera abrir. Es el mismo defecto que este archivo existe
 * para matar —«0 hallazgos» leído como «limpio»— reaparecido un nivel más arriba.
 *
 * Se arregla acá, en el ESTADO, y no en `paso()`: `paso()` es un agregado, y un consumidor que
 * mire un control suelto —la corrida por cotización, un tablero, el dataset— tiene que recibir la
 * misma verdad que el agregado. Arreglar sólo `paso()` dejaba `LIMPIO` mintiendo para todos los
 * demás. Como corolario, `paso()` no necesita tocarse: si ningún control quedó en
 * NO_SE_PUDO_MIRAR, entonces ninguno dejó nada sin mirar.
 *
 * Un control que miró 3 de 5 y encontró algo SIGUE siendo HALLAZGO: lo que no se puede afirmar es
 * la ausencia de defecto, nunca su presencia. Y el detalle no se pierde: `cobertura.mirados` dice
 * cuántas pudo abrir y `cobertura.sinMirar` cuáles no y por qué.
 */
export function correrControl(control, cotizaciones = [], opciones = {}) {
  const cobertura = control.cobertura(cotizaciones)
  // La regla corre aunque la cobertura sea cero: encontrar nunca miente, lo que necesita cobertura
  // es afirmar la AUSENCIA de defecto, jamás su presencia. Con el atajo anterior —correrla sólo si
  // `mirados > 0`— una tanda donde todas las ofertas quedaran ciegas escondía las incoherencias que
  // la MISMA regla veía en el presupuesto.
  //
  // La excepción es la regla que DEDUCE el defecto de un dato que falta: sin cobertura, su hallazgo
  // positivo ES el hueco. `ivaEscritoAMano` concluye «lo tipearon» de «no veo la fórmula», y así
  // daba rojo en 12 de 13 ofertas por un lector mal configurado.
  const hallazgos = control.deduceDeLaAusencia && cobertura.mirados === 0 ? [] : control.regla(cotizaciones, opciones)
  const miroTodo = cobertura.mirados > 0 && cobertura.sinMirar.length === 0
  const estado = hallazgos.length ? RESULTADO.HALLAZGO
    : miroTodo ? RESULTADO.LIMPIO
      : RESULTADO.NO_SE_PUDO_MIRAR
  return { id: control.id, que: control.que, estado, hallazgos, cobertura }
}

/**
 * CORRE TODOS LOS CONTROLES SOBRE UNA TANDA. PURA.
 *
 * El `resumen` cuenta los tres estados por separado a propósito: «12 controles pasados» sin decir
 * cuántos de esos doce ni siquiera pudieron mirar es la misma frase que dejó pasar los 4,1 M.
 */
export function pasarControles(cotizaciones = [], opciones = {}) {
  const corridas = CONTROLES.map((c) => correrControl(c, cotizaciones, opciones))
  const hallazgos = ordenar(corridas.flatMap((c) => c.hallazgos))
  return {
    corridas,
    hallazgos,
    resumen: {
      ...resumen(hallazgos),
      controles: corridas.length,
      conHallazgo: corridas.filter((c) => c.estado === RESULTADO.HALLAZGO).length,
      limpios: corridas.filter((c) => c.estado === RESULTADO.LIMPIO).length,
      noSePudoMirar: corridas.filter((c) => c.estado === RESULTADO.NO_SE_PUDO_MIRAR).length,
    },
    sinMirar: corridas.flatMap((c) => c.cobertura.sinMirar.map((s) => ({ control: c.id, ...s }))),
  }
}

/**
 * ¿ESTA TANDA PASÓ LIMPIA? PURA.
 *
 * Devuelve `true` SÓLO si todos los controles miraron TODO y ninguno encontró nada. Un control que
 * no pudo mirar rompe el limpio, y esa es la diferencia entera entre este circuito y el anterior.
 *
 * No hace falta mirar `sinMirar` acá: ningún control puede quedar en LIMPIO con algo sin mirar
 * —lo garantiza `correrControl`—, así que `noSePudoMirar === 0` ya implica `sinMirar` vacío. La
 * comprobación vive en el test, para que si alguien afloja el estado esto se ponga rojo.
 */
export const paso = (r) => r.resumen.conHallazgo === 0 && r.resumen.noSePudoMirar === 0
