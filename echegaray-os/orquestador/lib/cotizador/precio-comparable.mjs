// PASO 3 DE LA CASCADA — el precio de un recurso a partir de OTRO que sí tiene precio fresco.
//
// ═══ QUÉ PROBLEMA RESUELVE Y CUÁL NO ═══
//
// «HIERRO LISO ø 16» tiene precio del 23/03/2025 y venció. «HIERRO TORSIONADO ø 8, ø 10, ø 12, ø 16
// y ø 20» tienen precio del 01/04/2026 y están vigentes. La tentación es obvia y está mal: son dos
// productos, el liso y el conformado se compran a proveedores distintos y no valen lo mismo por kilo.
//
// Lo que sí se puede afirmar mirando esos mismos datos es otra cosa, y es la que este módulo usa:
// **los cinco diámetros de HIERRO TORSIONADO valen EXACTAMENTE $1.615/kg**. O sea que, en este
// catálogo, el diámetro NO mueve el precio por kilo del hierro conformado. Eso no es un supuesto:
// es una regularidad medible en la propia base, y es lo único que hace defendible transferirle el
// precio a un sexto diámetro que no lo tenga.
//
// ═══ LAS CINCO CONDICIONES, Y NINGUNA ES NEGOCIABLE ═══
//
//   1. MISMA BASE DESCRIPTIVA. Los tokens no dimensionales del nombre tienen que ser los MISMOS, no
//      parecidos. «hierro·liso» ≠ «hierro·torsionado». «cemento·blanco» ≠ «cemento·portland·loma·
//      negra» — y ése es el caso que más plata salva: el cemento blanco cuesta el triple que el
//      portland, y un puntaje de similitud textual los junta feliz.
//   2. UNIDAD INTENSIVA. En kg, m², m³, m o litros el precio es del MATERIAL y no depende del tamaño
//      de la pieza. En `un` el precio ES el objeto: «una placa de yeso» y «una placa FAILROOF» no
//      comparten precio por el hecho de contarse de a una. En `hs` tampoco: una hora de Bobcat y una
//      hora de oficial son la misma unidad y no tienen nada que ver.
//   3. SIN CONFLICTO DE ATRIBUTOS. El mismo veto que ya rige el mapeo de partidas (`plano/
//      atributos.mjs`): si los dos declaran un atributo y no coinciden, no son el mismo mercado.
//   4. LA COHORTE TIENE QUE PROBAR LA INDEPENDENCIA. Hacen falta AL MENOS DOS observaciones frescas
//      de la misma base, y sus precios tienen que coincidir. Con una sola no hay nada probado: que
//      un ø12 valga $1.615 no dice nada sobre si el diámetro mueve el precio. Con dos que difieren
//      20%, lo que quedó probado es lo contrario — que SÍ lo mueve— y entonces no se transfiere.
//   5. NO SE PROMEDIA. Es la regla de `precio-resolucion.mjs` y acá vale igual: se elige UN miembro
//      de la cohorte —el más reciente, desempate por el menor— y se lo cita con su nombre y su
//      fecha. Un promedio es un número que nadie observó.
//
// ═══ LO QUE ESTE MÓDULO NO PUEDE DEVOLVER ═══
//
// Un `ORIGEN.COMPARABLE` sale con `FUENTE.INFERIDO` por la tabla congelada de
// `precio-resolucion.mjs`, y su vigencia sale a la MITAD por `FACTOR_ORIGEN.COMPARABLE = 0.5`. Las
// dos cosas ya existían; acá no se toca ninguna. Un precio inferido no es un precio propio, y el
// sistema lo tiene que seguir diciendo cuando el número ya está en la planilla.
//
// PURO: sin red, sin base, sin reloj propio.

import { DIMENSION, normalizarUnidad, convertir } from './unidades.mjs'
import { normalizar } from './compras-precio.mjs'
import { atributosDe, comparar } from '../plano/atributos.mjs'
import { ESTADO } from './contrato.mjs'
import { ORIGEN, candidatoDePrecio } from './precio-resolucion.mjs'

/**
 * LAS DIMENSIONES EN LAS QUE EL PRECIO ES DEL MATERIAL Y NO DEL OBJETO.
 *
 * `CONTEO` está afuera y es la exclusión que más casos voltea —45 de los 58 recursos vencidos de
 * Quattropani se miden en `un`—. Está afuera igual, porque un precio «por unidad» es el precio de
 * esa unidad concreta: transferirlo entre dos objetos distintos es inventar un número.
 *
 * `TIEMPO_TRABAJO` está afuera por lo mismo: la hora es de quien la trabaja. `MONEDA` está afuera
 * porque no es una unidad de medida de nada.
 */
export const DIMENSIONES_INTENSIVAS = Object.freeze([
  DIMENSION.LONGITUD, DIMENSION.SUPERFICIE, DIMENSION.VOLUMEN, DIMENSION.CAPACIDAD, DIMENSION.MASA,
])

/** Cuántas observaciones frescas hacen falta para que la cohorte PRUEBE algo. Una no prueba nada. */
export const MINIMO_COHORTE = 2

/**
 * CUÁNTO PUEDEN DIFERIR ENTRE SÍ LOS PRECIOS DE LA COHORTE. 5% sobre el cociente máximo/mínimo.
 *
 * No es una tolerancia de redondeo: es el umbral a partir del cual hay que aceptar que el atributo
 * que varía SÍ mueve el precio. Con 5% los cinco diámetros del hierro torsionado (dispersión 0%)
 * pasan y una familia con dos precios que difieren 20% se cae — que es lo que tiene que pasar.
 */
export const DISPERSION_MAXIMA = 0.05

/** Las palabras que no identifican un producto. Es el mismo ruido que filtra el cruce de compras,
 *  declarado acá porque allá es privado: se reusa la NORMALIZACIÓN, que sí está exportada, y no se
 *  reimplementa el acentuado ni la puntuación. */
const RUIDO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'por', 'una',
  'un', 'comun', 'tipo', 'obra', 'segun', 'lista', 'proveedor', 'historial', 'mano', 'nota'])

/**
 * LA BASE DESCRIPTIVA DE UN NOMBRE: lo que queda cuando se le sacan las medidas. PURA.
 *
 * «HIERRO TORSIONADO ø 12» y «HIERRO TORSIONADO ø 16» tienen la misma base —`hierro·torsionado`— y
 * se diferencian sólo en un número. «HIERRO LISO ø 16» tiene otra base y por eso no entra.
 *
 * Se descarta todo token que contenga un dígito (es una medida, un calibre o un modelo) y todo
 * token de menos de 4 letras (que es el mismo listón del cruce de compras: más corto que eso no
 * identifica un producto). Lo que queda se devuelve ORDENADO, para que la comparación sea de
 * conjuntos y no dependa de cómo se escribió el nombre.
 */
export function baseDescriptiva(nombre) {
  const crudo = normalizar(nombre).split(/[\s,+·-]+/).filter(Boolean)
  const tokens = crudo.filter((w) => w.length >= 4 && !RUIDO.has(w) && !/\d/.test(w))
  const dimensionales = crudo.filter((w) => /\d/.test(w))
  return Object.freeze({
    tokens: Object.freeze([...tokens].sort()),
    dimensionales: Object.freeze(dimensionales),
    clave: [...tokens].sort().join('·'),
  })
}

/** La unidad canónica de un recurso, o `null` si el catálogo escribió algo que no está en el
 *  diccionario de unidades. `null` no es «sin unidad»: es «no sé qué mide», y bloquea. PURA. */
export const unidadDe = (recurso) => normalizarUnidad(recurso?.unidad)

/**
 * ¿DOS RECURSOS SON EL MISMO MERCADO? PURA.
 *
 * Devuelve SIEMPRE el motivo, tanto cuando dice que sí como cuando dice que no: un «no» sin motivo
 * es indistinguible de un recurso que nadie miró, y esa diferencia es la que después decide si hay
 * que cargar un precio a mano o si el sistema ya lo tiene.
 */
export function sonComparables(a, b) {
  const no = (porQue) => ({ comparable: false, porQue, factor: null })
  const ua = unidadDe(a)
  const ub = unidadDe(b)
  if (!ua) return no(`«${a?.nombre ?? a?.codigo}» se mide en «${a?.unidad}», que no está en el diccionario de unidades`)
  if (!ub) return no(`«${b?.nombre ?? b?.codigo}» se mide en «${b?.unidad}», que no está en el diccionario de unidades`)
  if (!DIMENSIONES_INTENSIVAS.includes(ua.dimension)) {
    return no(`«${ua.canonica}» mide ${ua.dimension}: el precio es del objeto, no del material — no se transfiere entre dos objetos distintos`)
  }
  if (ua.dimension !== ub.dimension) {
    return no(`uno se mide en ${ua.canonica} (${ua.dimension}) y el otro en ${ub.canonica} (${ub.dimension}): no son el mismo precio`)
  }
  const ba = baseDescriptiva(a?.nombre)
  const bb = baseDescriptiva(b?.nombre)
  if (!ba.tokens.length) return no(`«${a?.nombre}» no deja ningún token con el que identificar el producto`)
  if (ba.clave !== bb.clave) {
    return no(`la base descriptiva no coincide: «${ba.clave}» contra «${bb.clave}» — son dos productos, no dos medidas del mismo`)
  }
  const choque = comparar(atributosDe(a?.nombre), atributosDe(b?.nombre))
  if (choque.conflictos.length) {
    const c = choque.conflictos[0]
    return no(`los atributos se contradicen en ${c.atributo}: «${c.literalElemento}» contra «${c.literalPartida}»`)
  }
  const conv = convertir(1, ub.canonica, ua.canonica)
  if (conv.estado !== ESTADO.CALCULADO) return no(conv.porQue)
  return {
    comparable: true,
    factor: conv.valor,
    porQue: `misma base «${ba.clave}», los dos en ${ua.dimension} (${ua.canonica}/${ub.canonica}) y sin atributos en conflicto; difieren sólo en ${bb.dimensionales.join(' ') || 'nada declarado'}`,
  }
}

/**
 * LA COHORTE QUE PRUEBA —O NO— QUE LA MEDIDA NO MUEVE EL PRECIO. PURA.
 *
 * `frescos` son observaciones `{recurso:{codigo,nombre,unidad}, valor, moneda, observadoEn}` que YA
 * se sabe que están vigentes: este módulo no decide vigencia, la decide `evaluarCandidato`.
 *
 * Devuelve `{sirve, miembros, dispersion, elegido, porQue}`. `sirve:false` con el motivo escrito es
 * un resultado tan bueno como el otro.
 */
export function cohorteDe(recurso, frescos = []) {
  const miembros = []
  const descartados = []
  for (const f of frescos) {
    if (f?.recurso?.codigo === recurso?.codigo) continue
    const c = sonComparables(recurso, f.recurso)
    if (!c.comparable) { descartados.push({ codigo: f?.recurso?.codigo, porQue: c.porQue }); continue }
    miembros.push({ ...f, valorEnLaUnidad: Number(f.valor) * c.factor, porQue: c.porQue })
  }
  const no = (porQue) => Object.freeze({ sirve: false, miembros: Object.freeze(miembros), descartados: Object.freeze(descartados), dispersion: null, elegido: null, porQue })
  if (miembros.length < MINIMO_COHORTE) {
    return no(`hay ${miembros.length} comparable(s) fresco(s) y hacen falta ${MINIMO_COHORTE}: con menos no hay nada que pruebe que la medida no mueve el precio`)
  }
  const monedas = new Set(miembros.map((m) => m.moneda ?? 'ARS'))
  if (monedas.size > 1) return no(`la cohorte mezcla ${[...monedas].join(' y ')}: sin tipo de cambio declarado no se comparan`)
  const valores = miembros.map((m) => m.valorEnLaUnidad)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  if (!(min > 0)) return no('algún comparable tiene precio cero o negativo: la cohorte no se puede evaluar')
  const dispersion = max / min - 1
  if (dispersion > DISPERSION_MAXIMA) {
    return no(`los ${miembros.length} comparables van de $${min.toLocaleString('es-AR')} a $${max.toLocaleString('es-AR')} (${(dispersion * 100).toFixed(1)}% de dispersión, máximo ${(DISPERSION_MAXIMA * 100).toFixed(0)}%): la medida SÍ mueve el precio, así que no se transfiere`)
  }
  // No se promedia (regla del §8): se elige UNO y se lo cita. El más reciente; a igual fecha, el
  // menor, para que dos corridas con los mismos datos elijan el mismo (§39).
  const elegido = [...miembros].sort((a, b) => String(b.observadoEn).localeCompare(String(a.observadoEn))
    || a.valorEnLaUnidad - b.valorEnLaUnidad || String(a.recurso.codigo).localeCompare(String(b.recurso.codigo)))[0]
  return Object.freeze({
    sirve: true,
    miembros: Object.freeze(miembros),
    descartados: Object.freeze(descartados),
    dispersion,
    elegido: Object.freeze(elegido),
    porQue: `${miembros.length} comparables frescos con la misma base descriptiva y ${(dispersion * 100).toFixed(1)}% de dispersión (${miembros.map((m) => m.recurso.codigo).join(', ')}): la medida no mueve el precio en esta familia`,
  })
}

/**
 * EL CANDIDATO A PRECIO POR COMPARABLE, O `null` CON MOTIVO. PURA.
 *
 * Devuelve `{candidato, porQue, cohorte}`. El candidato lo construye `candidatoDePrecio`, que es
 * quien valida —y quien impide que esto declare una fuente que no le corresponde—.
 */
export function candidatoComparable({ recurso, frescos = [] } = {}) {
  const cohorte = cohorteDe(recurso, frescos)
  if (!cohorte.sirve) return { candidato: null, porQue: cohorte.porQue, cohorte }
  const e = cohorte.elegido
  const detalle = `comparable «${e.recurso.nombre}» (${e.recurso.codigo}) del ${e.observadoEn} · ${cohorte.porQue}`
  try {
    return {
      candidato: candidatoDePrecio({
        recursoCodigo: recurso.codigo,
        valor: e.valorEnLaUnidad,
        moneda: e.moneda ?? 'ARS',
        origen: ORIGEN.COMPARABLE,
        observadoEn: e.observadoEn,
        detalleFuente: detalle,
        // La confianza es cuánto respalda la cohorte: cae con la dispersión y sube con la cantidad
        // de miembros, topeada en 5. No es un puntaje para ordenar precios: es para que quien lea
        // el provenance sepa si atrás había dos observaciones o diez.
        confianza: (1 - cohorte.dispersion / DISPERSION_MAXIMA) * Math.min(1, cohorte.miembros.length / 5),
        evidencia: Object.freeze({
          tabla: 'public.recurso_precio',
          comparableDe: e.recurso.codigo,
          cohorte: Object.freeze(cohorte.miembros.map((m) => ({ codigo: m.recurso.codigo, nombre: m.recurso.nombre, valor: m.valorEnLaUnidad, observadoEn: m.observadoEn }))),
          dispersion: cohorte.dispersion,
        }),
      }),
      porQue: detalle,
      cohorte,
    }
  } catch (err) {
    return { candidato: null, porQue: `el comparable no se pudo construir: ${err.message}`, cohorte }
  }
}
