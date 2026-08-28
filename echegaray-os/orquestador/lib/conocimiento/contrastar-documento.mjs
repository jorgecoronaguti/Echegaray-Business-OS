// EL CONTRATO CONTRA LO QUE EL MOTOR CREYÓ LEER DEL PLANO. PURO — sin red, sin modelo.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO ═══
//
// UN DOCUMENTO NO VALIDA HACIA ATRÁS UNA INFERENCIA DEL MOTOR.
//
// Si el motor MIDIÓ una cota en el CAD y la memoria dice el mismo número, eso es una CONFIRMACIÓN:
// dos fuentes independientes coinciden y el dato se vuelve más firme. Si el motor DEDUJO el número
// —lo sacó de una frase suelta, de un supuesto, de una lámina que miró un modelo— y la memoria
// coincide, eso NO convierte la deducción en medición: el valor pasa a valer por el DOCUMENTO, y la
// deducción sigue siendo una deducción. La diferencia parece de vocabulario y no lo es: la primera
// habilita cotizar, la segunda obliga a citar el documento y no el plano.
//
// Por eso las coincidencias salen partidas en dos resultados distintos y con nombre distinto, y hay
// un test que se pone rojo si alguien las unifica en «coincide».
//
// ═══ LA EXCLUSIÓN ES EL HALLAZGO MÁS CARO ═══
//
// Un plano dibuja el entrepiso porque el proyecto lo prevé. El contrato dice que el entrepiso NO se
// ejecuta en esta etapa. Si el motor computó el entrepiso, la cotización tiene adentro una partida
// que el contrato excluye — y eso no es un desvío de precisión, es plata cotizada de más o de menos
// según de qué lado se mire. Se declara CONFLICTO_DE_ALCANCE con las dos citas.
import { mismoValor } from '../plano/proyecto.mjs'
import { CATEGORIA } from './documento-proyecto.mjs'

/** Cómo terminó el cruce de un dato. Los cinco son resultados, no grados de un mismo eje. */
export const CRUCE = Object.freeze({
  CONFIRMA_MEDIDO: 'CONFIRMA_MEDIDO',
  COINCIDE_CON_INFERENCIA: 'COINCIDE_CON_INFERENCIA',
  CONFLICTO: 'CONFLICTO',
  APORTA: 'APORTA',
  CONFLICTO_DE_ALCANCE: 'CONFLICTO_DE_ALCANCE',
  SOLO_MENCIONES: 'SOLO_MENCIONES',
})

/** El orden de la confianza, de la que más pesa a la que menos. PURA. */
const RANGO = Object.freeze({ alta: 0, media: 1, baja: 2 })

/** Las clases de fuente que MIDEN. El resto afirma, que es otra cosa. */
export const MIDEN = Object.freeze(['CAD', 'PLANO'])

/** La clase que NO está en condiciones de contradecir a un documento del proyecto: un apunte propio
 *  o un borrador. Aporta cuando nadie más dice nada; no le gana a nadie. */
export const NO_CONTRADICE = 'NOTA_INTERNA'

/** ¿Este hecho del motor está MEDIDO o DEDUCIDO? PURA.
 *
 *  Medido = salió de una fuente que mide (el CAD con sus coordenadas, la lámina acotada) Y con
 *  confianza alta. Un hecho de confianza baja es una frase suelta que ni nombró la pieza: coincidir
 *  con él no confirma nada. */
export const estaMedido = (h) => MIDEN.includes(String(h?.clase)) && h?.confianza === 'alta'

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Agrupa por `elemento:atributo` y ordena cada grupo por peso de la fuente y confianza: el primero
 *  es el que representa al grupo. Mismo desempate que `consolidar()` para que las dos partes del OS
 *  llamen «principal» al mismo hecho. PURA. */
export function porClave(hechos = []) {
  const m = new Map()
  for (const h of hechos) if (h?.que) m.set(h.que, [...(m.get(h.que) ?? []), h])
  for (const [k, v] of m) {
    m.set(k, [...v].sort((a, b) => a.peso - b.peso
      || (RANGO[a.confianza] ?? 9) - (RANGO[b.confianza] ?? 9)
      || String(a.documento).localeCompare(String(b.documento))
      || String(a.textoLiteral).localeCompare(String(b.textoLiteral))))
  }
  return m
}

/**
 * CRUZAR LOS HECHOS TÉCNICOS DEL DOCUMENTO CONTRA LOS DEL MOTOR. PURA.
 *
 * ═══ UN RESULTADO POR CLAVE, NO UNO POR PAR ═══
 *
 * Cruzar cada hecho del documento contra cada hecho del motor con la misma clave produce el producto
 * cartesiano: medido sobre QUATTROPANI, 166 hechos del documento contra 158 del motor daban 220
 * «conflictos» que en realidad eran seis, repetidos. Un conflicto que se lee como una pared de
 * repeticiones no se resuelve: se ignora. Se compara el hecho PRINCIPAL de cada lado —el mismo
 * criterio de desempate que usa `consolidar()`— y se sale un resultado por clave.
 *
 * ═══ UNA FRASE SUELTA NO CONTRADICE A NADIE ═══
 *
 * La misma regla que ya está adentro de `consolidar()`, y por el mismo motivo medido en esta obra:
 * un hecho de confianza BAJA es una frase que no nombró pieza ni declaró alcance. Dos frases sueltas
 * que dicen cosas distintas no son un conflicto: son `SOLO_MENCIONES`, y se reportan como tales en
 * vez de bloquear una cotización.
 */
export function cruzarHechos({ delMotor = [], delDocumento = [] } = {}) {
  const motor = porClave(delMotor)
  const doc = porClave(delDocumento)
  const salida = []
  for (const [que, suyos] of [...doc.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const d = suyos[0]
    const delOtro = motor.get(que)
    if (!delOtro?.length) { salida.push({ cruce: CRUCE.APORTA, que, documento: d, cuantos: suyos.length, porQue: `el motor no tiene ningún valor para «${que}»: el documento lo aporta` }); continue }
    const m = delOtro[0]
    if (mismoValor(m.valor, d.valor)) {
      salida.push(estaMedido(m)
        ? { cruce: CRUCE.CONFIRMA_MEDIDO, que, motor: m, documento: d, porQue: `${m.clase} lo MIDIÓ y el documento dice lo mismo: dos fuentes independientes` }
        : { cruce: CRUCE.COINCIDE_CON_INFERENCIA, que, motor: m, documento: d, porQue: `el motor no lo midió (${m.clase}, confianza ${m.confianza}) y el documento coincide: el valor vale POR EL DOCUMENTO — la lectura del motor sigue sin estar medida y no se convierte en medición por coincidir` })
      continue
    }
    if (m.clase === NO_CONTRADICE) {
      salida.push({ cruce: CRUCE.SOLO_MENCIONES, que, motor: m, documento: d, porQue: `la única lectura del motor para «${que}» sale de «${m.documento}», que es una nota de trabajo propia y no documentación del proyecto: dice «${m.valor}» donde el documento dice «${d.valor}», y un borrador propio no contradice a un contrato` })
      continue
    }
    const conPeso = [m, d].filter((h) => h.confianza !== 'baja')
    if (!conPeso.length) {
      salida.push({ cruce: CRUCE.SOLO_MENCIONES, que, motor: m, documento: d, porQue: `las dos lecturas son frases sueltas que no nombraron la pieza (confianza baja de los dos lados): «${m.valor}» y «${d.valor}» no alcanzan para contradecirse` })
      continue
    }
    salida.push({
      cruce: CRUCE.CONFLICTO, que, motor: m, documento: d,
      versiones: [...new Set([...delOtro, ...suyos].filter((h) => h.confianza !== 'baja').map((h) => `${h.clase} («${h.documento}») dice «${h.valor}»`))],
      porQue: `el motor leyó «${m.valor}» en ${m.documento} (${m.clase}, confianza ${m.confianza}) y el documento dice «${d.valor}» (${d.clase}, confianza ${d.confianza}): dos fuentes legítimas se contradicen y elegir una sería arbitrario`,
    })
  }
  return salida
}

/** Las palabras que no distinguen nada: están en cualquier frase de cualquier contrato. */
export const VACIAS = new Set('de la el los las del que se por para con una como sus este esta estas estos su al en obra trabajos empresa presente etapa forma parte ejecutar ejecutados ejecutadas seran sera quedan queda completamente expresamente totalmente contempla incluye correspondientes asociada constructora'.split(' '))

/**
 * LOS TÉRMINOS QUE HACEN RECONOCIBLE UNA EXCLUSIÓN. PURA.
 *
 * De «las estructuras correspondientes al entrepiso como su escalera metálica asociada quedan
 * completamente excluidas» sale `entrepiso`, `escalera`, `metalica`, `estructuras`. Son los que
 * después se buscan en el cómputo. El largo mínimo NO es cosmético: con cuatro letras entra `piso`,
 * que aparece en «contrapiso», «piso de hormigón» y en media obra.
 */
export const LARGO_MINIMO_TERMINO = 6

/** La raíz de una palabra, quitándole el plural castellano: `-es` después de consonante («paredes»
 *  → «pared») y `-s` después de vocal («revoques» → «revoque»). «revoques» en la exclusión y
 *  «revoque» en el cómputo son la misma cosa, y una `s` no puede ser la diferencia entre ver el
 *  choque y no verlo. PURA. */
export const raiz = (p) => String(p).replace(/([^aeiou])es$/, '$1').replace(/s$/, '')

export function terminosDeExclusion(frase) {
  return [...new Set(norm(frase).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((p) => p.length >= LARGO_MINIMO_TERMINO && !VACIAS.has(p)))]
}

/**
 * QUÉ TÉRMINO DE UNA EXCLUSIÓN DISTINGUE ALGO, MEDIDO SOBRE EL CÓMPUTO MISMO.
 *
 * ═══ POR QUÉ NO ALCANZA UNA LISTA DE PALABRAS VACÍAS ═══
 *
 * «las estructuras correspondientes al entrepiso como su escalera metálica asociada quedan
 * excluidas» deja los términos `entrepiso`, `escalera`, `metalica` y `estructuras`. Los dos primeros
 * señalan una partida; los dos últimos están en media cotización de un galpón, y con ellos TODA la
 * obra metálica quedaría marcada como excluida. No hay lista de palabras vacías que sepa eso: es
 * propio de ESTA obra.
 *
 * Lo que sí se puede medir es cuántas partidas del cómputo nombra cada término. Uno que aparece en
 * la mitad de las partidas no señala nada. El corte se aplica sólo cuando hay partidas suficientes
 * para que «la mitad» signifique algo: sobre tres ítems, una frecuencia no es una frecuencia.
 */
export const MAX_FRECUENCIA_TERMINO = 0.25
export const MINIMO_PARA_MEDIR_FRECUENCIA = 12

export function terminosDiscriminantes(terminos = [], items = []) {
  const textos = items.map((it) => norm(it?.descripcion ?? it?.elemento ?? ''))
  const frecuencia = (t) => textos.filter((x) => x.includes(raiz(t))).length / (textos.length || 1)
  if (textos.length < MINIMO_PARA_MEDIR_FRECUENCIA) return { discriminantes: terminos, genericos: [] }
  const genericos = terminos.filter((t) => frecuencia(t) > MAX_FRECUENCIA_TERMINO)
    .map((t) => ({ termino: t, frecuencia: Math.round(frecuencia(t) * 100) / 100, porQue: `nombra el ${Math.round(frecuencia(t) * 100)}% de las partidas del cómputo: no señala ninguna` }))
  const fuera = new Set(genericos.map((g) => g.termino))
  return { discriminantes: terminos.filter((t) => !fuera.has(t)), genericos }
}

/**
 * LO QUE EL CONTRATO EXCLUYE Y EL MOTOR COMPUTÓ IGUAL. PURA.
 *
 * `items` son los elementos del cómputo, cada uno con su descripción. Un choque NO se resuelve acá:
 * se declara con las dos citas para que alguien lo mire. Un falso positivo cuesta una revisión; un
 * falso negativo cuesta una partida cotizada que el contrato no paga.
 */
export function exclusionesContraComputo(hallazgos = [], items = []) {
  const exclusiones = hallazgos.filter((h) => h.categoria === CATEGORIA.EXCLUSION)
  const salida = []
  const descartados = []
  for (const ex of exclusiones) {
    const { discriminantes, genericos } = terminosDiscriminantes(terminosDeExclusion(ex.textoLiteral), items)
    for (const g of genericos) descartados.push({ ...g, exclusion: ex.textoLiteral.slice(0, 120) })
    if (!discriminantes.length) continue
    for (const it of items) {
      const texto = norm(it?.descripcion ?? it?.elemento ?? '')
      const chocan = discriminantes.filter((t) => texto.includes(raiz(t)))
      if (!chocan.length) continue
      salida.push({
        cruce: CRUCE.CONFLICTO_DE_ALCANCE,
        termino: chocan,
        item: it,
        exclusion: ex,
        porQue: `el cómputo trae «${it.descripcion ?? it.elemento}» y el documento «${ex.documento}»${ex.seccion ? ` (${ex.seccion})` : ''} excluye lo que nombra ${chocan.map((t) => `«${t}»`).join(', ')}: o sobra la partida o sobra la exclusión, y las dos están escritas`,
      })
    }
  }
  salida.descartados = descartados
  return salida
}

/**
 * EL CONTRASTE COMPLETO DE UN PROYECTO. PURA.
 *
 * Devuelve las cinco listas por separado y un resumen contable. No devuelve un veredicto: decidir
 * qué gana entre un contrato y un plano es una decisión del dueño, no de un cruce de expresiones
 * regulares.
 */
export function contrastar({ hechosDelMotor = [], lecturas = [], itemsDelComputo = [] } = {}) {
  const delDocumento = lecturas.flatMap((l) => l.tecnicos ?? [])
  const hallazgos = lecturas.flatMap((l) => l.hallazgos ?? [])
  const cruces = cruzarHechos({ delMotor: hechosDelMotor, delDocumento })
  const alcance = exclusionesContraComputo(hallazgos, itemsDelComputo)
  const genericos = alcance.descartados ?? []
  const todos = [...cruces, ...alcance]
  const cuenta = Object.fromEntries(Object.values(CRUCE).map((c) => [c, todos.filter((x) => x.cruce === c).length]))
  return {
    cruces, alcance, cuenta, terminosGenericos: genericos,
    conflictos: todos.filter((x) => x.cruce === CRUCE.CONFLICTO || x.cruce === CRUCE.CONFLICTO_DE_ALCANCE),
    resumen: `${delDocumento.length} hecho(s) técnicos del documento contra ${hechosDelMotor.length} del motor · ${cuenta[CRUCE.CONFIRMA_MEDIDO]} confirmación(es) sobre algo MEDIDO · ${cuenta[CRUCE.COINCIDE_CON_INFERENCIA]} coincidencia(s) con algo que el motor NO midió · ${cuenta[CRUCE.CONFLICTO]} conflicto(s) de valor · ${cuenta[CRUCE.SOLO_MENCIONES]} par(es) de menciones sueltas que no alcanzan para contradecirse · ${cuenta[CRUCE.APORTA]} dato(s) que sólo dice el documento · ${cuenta[CRUCE.CONFLICTO_DE_ALCANCE]} choque(s) entre el cómputo y una exclusión`,
  }
}
