/**
 * LO CERTIFICADO CONTRA EL CONTRATO NO ES LO FACTURADO AL CLIENTE.
 *
 * ═══ EL DEFECTO QUE ESTE MÓDULO VIENE A ARREGLAR (14/08/2026) ═══
 *
 * La pestaña OBRAS publicaba, para Quattropani · SALÓN COMERCIAL, `% cert. 136,4%` y
 * `Falta certificar ($35.519.320)` en negativo. El dueño: *"esta mal eso de quattropani, revisa
 * bien"*. Tenía razón, y el defecto era de raíz: la columna `Certificado (neto)` del cuadro 3 era
 * LA MISMA FÓRMULA que `Venta (neto)` del cuadro 2 — un `SUMIFS` de todo lo facturado al cliente.
 *
 * Eso no es una certificación. Certificar es reconocer avance CONTRA UN CONTRATO; facturar es
 * cualquier cosa que se le cobre al cliente. Mientras las dos coincidan el error no se ve, y en seis
 * de las siete obras coinciden. En cuanto una factura mezcla trabajo del contrato con algo que el
 * contrato no incluye, el `%` se pasa de 100 y el saldo se va a negativo — sin un solo error a la
 * vista, que es la clase de dato falso que la regla de oro 2 prohíbe.
 *
 * ═══ LO QUE DICE EL CONTRATO FIRMADO, QUE ES LA FUENTE PRIMARIA ═══
 *
 * "CONTRATO DE LOCACIÓN DE OBRA — Salones Comerciales — QUATTROPANI FRANCO" (Drive):
 *
 *   · Precio total: **U$S 63.000 + IVA**, por ajuste alzado. El contrato está en DÓLARES.
 *   · Primer pago: U$S 20.000 + IVA en efectivo, última semana de julio 2026.
 *   · Segundo pago: U$S 11.500 + IVA por transferencia, al TC del momento.
 *   · Saldo: U$S 31.500 + IVA, por certificaciones quincenales de avance.
 *   · Alcance: SOLO MANO DE OBRA — "el cliente es quien se compromete a la compra y entrega de
 *     materiales".
 *
 * Contra las filas de Cobranzas, a la unidad y sin redondear:
 *
 *   f61 (F219, transferencia) `=36454685,38+(11500*1550)` → U$S 11.500  ← segundo pago
 *   f62 (F220, efectivo)      U$S 15.400                                ┐ U$S 20.000
 *   f63 (F220, efectivo)      $7.130.000 = U$S 4.600 @ 1.550            ┘ ← primer pago
 *                                                     ────────────────
 *                                        anticipo      U$S 31.500 = 50%
 *   f84..f92  9 × $5.425.000 = $48.825.000 = U$S 31.500 @ 1.550         ← el saldo, 50%
 *
 * El anticipo cobrado es EXACTAMENTE el 50% del contrato y las 9 certificaciones son el otro 50%.
 * **El % correcto es 100,0% y no falta certificar nada.** Y el contrato de $97.650.000 que la
 * pestaña lee de Cobranzas tampoco estaba mal: es U$S 63.000 × 1.550, el TC de la firma.
 *
 * Lo que sobraba eran DOS cosas metidas adentro del número, ninguna de ellas certificación:
 *
 *   1. **$36.454.685,38 de MATERIALES** facturados en la misma F219. El contrato es de sólo mano de
 *      obra: por definición están FUERA. Es venta real y pertenece a la cartera; no certifica.
 *   2. **La deriva del dólar.** Los U$S 15.400 de la f62 se valuaban al TC VIVO de GOOGLEFINANCE.
 *      El "Falta certificar" de un contrato cerrado se movía todos los días con el dólar
 *      (−$35.576.885 un día, −$35.519.320 al siguiente). Un saldo de contrato que oscila con el tipo
 *      de cambio es, por construcción, un saldo mal medido.
 *
 * NO ERA UN MARKUP DEL 30%. El análisis anterior "probó" que el exceso era materiales con 30% de
 * margen porque $35.576.885 ÷ $27.358.960 = 1,3004. Ese 1,30 casi exacto era un ARTEFACTO del
 * defecto 2: el numerador venía contaminado por el TC vivo. Con el número real —$36.454.685,38— la
 * razón es 1,3325. Una coincidencia PROBABLE no es evidencia, y ésta encima era falsa.
 *
 * ═══ LA REGLA, Y POR QUÉ ES GENERAL Y NO UN PARCHE PARA QUATTROPANI ═══
 *
 * Cada fila de Cobranzas declara, en la columna ORDEN DE COMPRA, QUÉ HITO DEL CONTRATO cumple:
 *
 *   "Anticipo inicio obra 50% $ 47.590.272 Cotización n°"
 *   "Resto 50% s/ contrato 97.650.000 — certificación quincenal 3/9"
 *   "Venta propia s/ total 8.758.810 — cobro íntegro al cierre de obra"
 *
 * El hito dice una FRACCIÓN del contrato. Esa fracción es lo que certifica — no el importe de la
 * fila, que es lo que se factura y puede traer adentro materiales, adicionales o dólares. Las filas
 * que no declaran hito (un número de factura suelto, el IVA de una factura anterior) no certifican
 * nada: son facturación fuera del contrato, y se informan aparte en vez de sumarse en silencio.
 *
 * Verificado contra las SIETE obras del archivo vivo al 14/08/2026: las seis que hoy publican 100,0%
 * siguen publicando el MISMO importe al peso, y sólo cambia Quattropani. `obras-certificado.test.mjs`
 * corre los textos reales de las siete y lo prueba.
 *
 * VARIAS FILAS CON EL MISMO TEXTO DE HITO SON UN SOLO HITO. Las f61/f62/f63 dicen las tres
 * "Anticipo 50% inicio obra": es UN anticipo cobrado en tres tramos (el Concepto los distingue:
 * "(paga el 33% del 50%)", "(paga el 66% del 50%)"). Sumar 50% tres veces daría 150%. Se agrupa por
 * el texto del hito, que es lo que lo nombra.
 */

import { contratoDeclarado, filasDeObra } from './cobranzas-contrato.mjs'

/**
 * "Resto 50% s/ total 47.590.272 — certificación quincenal 1/4" → la 1ª de 4 cuotas del 50%.
 *
 * El `k` NO entra en la cuenta: cada fila aporta 1/n del porcentaje, y las n filas juntas lo
 * completan. Leer el `k` sería contar 1+2+3+4 en vez de 4 cuartos.
 */
const RESTO = /resto\s+(\d{1,3})\s*%[\s\S]*?certificaci[óo]n[\s\S]*?\d+\s*\/\s*(\d+)/i

/** "cobro íntegro al cierre de obra": la obra entera en una fila, sin anticipo ni cuotas. */
const INTEGRO = /cobro\s+[íi]ntegro/i

/** "Anticipo 50% inicio obra" · "Anticipo inicio de obra 50% Blanco $65.000.000". El `%` puede ir
 *  antes o después de las palabras del medio; lo que no cambia es que el número pegado al `%` es la
 *  fracción del contrato que ese anticipo cubre. */
const ANTICIPO = /anticipo[\s\S]*?(\d{1,3})\s*%/i

/** Dos textos que sólo difieren en espacios son el mismo hito. La f61 escribe "Anticipo 50% inicio
 *  obra " con un espacio final que la f62 no tiene: sin normalizar serían dos hitos del 50%. */
const claveDeHito = (texto) => String(texto ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * QUÉ FRACCIÓN DEL CONTRATO CERTIFICA ESTA FILA, LEÍDA DE SU PROPIA ORDEN DE COMPRA.
 *
 * Se devuelve como RACIONAL (`num`/`den`) y no como decimal a propósito: el `Certificado` termina
 * siendo una fórmula del Sheet, y un decimal ahí obliga a escribir `0,5` con la coma del locale
 * es-AR — el defecto que ya rompió fórmulas en este archivo. Con enteros no hay separador que
 * equivocar. Y 50%/9 es 1/18 exacto en racionales y periódico en decimal: el redondeo tampoco
 * existe.
 *
 * @param {string} textoOC el texto de la columna ORDEN DE COMPRA
 * @returns {{clave:string, num:number, den:number, base:number|null}|null} `null` si la fila no
 *   declara ningún hito: no certifica, y el llamador la informa como facturación fuera del contrato.
 */
export function hitoDeclarado(textoOC) {
  const texto = String(textoOC ?? '')
  const base = contratoDeclarado(texto)
  const clave = claveDeHito(texto)
  if (!clave) return null

  const resto = texto.match(RESTO)
  if (resto) {
    const pct = Number(resto[1])
    const cuotas = Number(resto[2])
    if (!pct || !cuotas) return null
    return { clave, num: pct, den: 100 * cuotas, base }
  }
  if (INTEGRO.test(texto)) return { clave, num: 100, den: 100, base }

  const ant = texto.match(ANTICIPO)
  if (ant) {
    const pct = Number(ant[1])
    if (!pct) return null
    return { clave, num: pct, den: 100, base }
  }
  return null
}

/**
 * LOS HITOS DEL CONTRATO QUE ESTA OBRA YA TIENE CARGADOS EN COBRANZAS.
 *
 * @param {Array<Array>} filas filas de datos de Cobranzas (sin encabezado)
 * @param {{cliente:number, concepto:number, oc:number}} cols índices 0-based
 * @param {{variantes:string[], needle:string, unica:boolean}} obra el mismo selector que usa
 *   `contratoDeObra`: si los dos no miran el MISMO universo de filas, el contrato y lo certificado
 *   se medirían sobre poblaciones distintas y el saldo saldría mal sin dar error.
 * @param {number} desde fila 1-based donde empiezan los datos
 * @returns {{hitos:Array<{clave:string,num:number,den:number,base:number|null,filas:number[]}>,
 *   sinHito:Array<{fila:number, texto:string}>}}
 */
export function hitosDeObra(filas = [], cols = {}, obra = {}, desde = 1) {
  const porClave = new Map()
  const sinHito = []
  for (const i of filasDeObra(filas, cols, obra)) {
    const texto = String(filas[i]?.[cols.oc] ?? '')
    const h = hitoDeclarado(texto)
    if (!h) { sinHito.push({ fila: desde + i, texto }); continue }
    const ya = porClave.get(h.clave)
    // MISMO HITO, OTRO TRAMO DE COBRO: se suma la fila a la lista y NO se vuelve a contar la
    // fracción. Ver la nota de arriba sobre las f61/f62/f63.
    if (ya) { ya.filas.push(desde + i); continue }
    porClave.set(h.clave, { ...h, filas: [desde + i] })
  }
  return { hitos: [...porClave.values()], sinHito }
}

/** La base contra la que se aplica la fracción de un hito: la que el hito declara, y si no declara
 *  ninguna, el contrato de la obra. Playón de Azufre tiene DOS bases declaradas (Blanco $65.000.000
 *  y Negro $37.500.000) sobre un contrato de $102.500.000: aplicar el 50% del anticipo Blanco al
 *  contrato entero daría $51.250.000 en vez de $32.500.000. */
const baseDe = (hito, contrato) => (Number.isFinite(hito.base) && hito.base > 0 ? hito.base : contrato)

/**
 * EL CERTIFICADO DE UNA OBRA: LA SUMA DE SUS HITOS, EN PESOS Y COMO FÓRMULA.
 *
 * Devuelve el importe y los TÉRMINOS con los que `formulaCertificado` redacta la celda. `certificado`
 * es `null` —no cero— cuando la obra no declara contrato o ninguna fila declara hito: un cero se
 * leería como "no certificó nada", y lo que pasa es que no se sabe.
 *
 * @param {number|null} contrato el contrato de la obra, o null si no declara ninguno
 * @returns {{certificado:number|null, fraccion:number, terminos:Array,
 *   hitos:Array, sinHito:Array, cubreElContrato:boolean}}
 */
export function certificadoDeObra(filas = [], cols = {}, obra = {}, contrato = null, desde = 1) {
  const { hitos, sinHito } = hitosDeObra(filas, cols, obra, desde)
  if (!hitos.length || !contrato) {
    return { certificado: null, fraccion: 0, terminos: [], hitos, sinHito, cubreElContrato: false }
  }

  // Se agrupan los términos que comparten base y denominador para que la fórmula sea legible: nueve
  // certificaciones de 1/18 se escriben `G27*450/900`, no nueve veces `G27*50/900`.
  const porTermino = new Map()
  let certificado = 0
  for (const h of hitos) {
    const base = baseDe(h, contrato)
    const literal = Number.isFinite(h.base) && h.base > 0
    const clave = `${literal ? h.base : 'REF'}|${h.den}`
    const t = porTermino.get(clave) ?? { base, literal, num: 0, den: h.den }
    t.num += h.num
    porTermino.set(clave, t)
    certificado += (base * h.num) / h.den
  }

  return {
    certificado,
    fraccion: certificado / contrato,
    terminos: [...porTermino.values()],
    hitos,
    sinHito,
    // Al peso. Es la pregunta que la columna `Falta certificar` contesta: si los hitos cargados
    // cubren el contrato, no falta nada; si no, falta —y ahí el número informa de verdad.
    cubreElContrato: Math.round(certificado) === Math.round(contrato),
  }
}

/**
 * LA FÓRMULA QUE VA EN LA CELDA `Certificado (neto)`.
 *
 * SE COMPONE APARTE PORQUE LA CELDA DEL CONTRATO NO SE SABE HASTA ARMAR LA GRILLA. El escritor lee
 * Cobranzas y calcula los hitos mucho antes de saber en qué fila va a caer la obra; separar el
 * cálculo de su redacción es lo que evita que el número tenga que recalcularse con la fila a mano.
 *
 * CADA TÉRMINO ES `base*num/den`, y ningún número de la fórmula lo inventa el código: la base sale
 * de la prosa de la propia fila de Cobranzas ("s/ total 47.590.272") o es la referencia VIVA a la
 * celda del contrato, y `num/den` es el porcentaje y las cuotas que el hito declara. La celda se
 * puede auditar sin abrir el generador, y el día que el dueño corrija el contrato la `C` lo sigue.
 *
 * FALLA CERRADA. Si una base no es entera, o si hay un hito sin base y no se pasó la celda del
 * contrato, devuelve `null`: antes que publicar una fórmula con un decimal que el locale es-AR puede
 * leer al revés, no se publica ninguna y el llamador decide.
 *
 * @param {{terminos:Array<{base:number, literal:boolean, num:number, den:number}>}} cert
 * @param {string|null} refContrato la celda del contrato (p.ej. `G27`)
 * @returns {string|null}
 */
export function formulaCertificado(cert, refContrato = null) {
  const t = cert?.terminos ?? []
  if (!t.length) return null
  if (!t.every((x) => Number.isInteger(x.base))) return null
  if (!refContrato && !t.every((x) => x.literal)) return null
  return `=${t.map((x) => `${x.literal ? x.base : refContrato}*${x.num}/${x.den}`).join('+')}`
}
