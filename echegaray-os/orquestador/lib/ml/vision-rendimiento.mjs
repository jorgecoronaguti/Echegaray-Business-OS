// EL RENDIMIENTO DE LA LLAMADA DE VISIÓN, NO SU PRECIO.
//
// ═══ POR QUÉ ESTE ARCHIVO REEMPLAZA LA PREGUNTA DE `vision-subcapacidad.mjs` ═══
//
// Esa descomposición contestó «en qué se va la plata» y descartó cuatro caminos de ahorro con
// número. Lo que dejó a la vista al pasar es más grande que lo que buscaba: de los 840 elementos
// que costaron $17,69, el pipeline de producción computa 152. Buscar un modelo más barato para
// producir los mismos 688 elementos incomputables no ahorra nada — reproduce el mismo desperdicio
// a menor precio.
//
// ═══ ACÁ NO SE DEFINE QUÉ ES COMPUTABLE. SE PREGUNTA ═══
//
// La tentación era escribir un `esCotizable(elemento)` local. Se probó y dio 23,3% — contra el
// 18,1% del pipeline real. Un módulo de medición con su propia definición de «sirve» mide su
// definición, no el sistema: es la segunda versión del mismo concepto que la REALIDAD ÚNICA
// prohíbe, y encima la más optimista de las dos. Todo lo de acá pasa por `validarLamina` y
// `computarElementos`, que son literalmente las funciones que corrieron cuando se pagó.
//
// La versión anterior de esta medición —`elementoAporta`, «tiene alguna dimensión O alguna
// cantidad»— daba 630 de 840 (75,0%). El pipeline computa 152 (18,1%). Cuatro veces. Un elemento
// `lineal` con su sección leída y sin largo pasaba como útil, y no se puede multiplicar por un
// precio: un caño de 100×100 sin metros no es un renglón de cotización, es una pregunta.

import { validarLamina } from '../plano/interpretar.mjs'
import { computarElementos } from '../plano/computo.mjs'
import { clasificarPorTitulo, TIPO_REGION } from '../ingesta/segmentar.mjs'

/** La subcapacidad de una lectura cacheada, por el MISMO clasificador que corrió en producción.
 *  Una lectura sin título queda `indeterminado`: inventarle un tipo por su contenido sería
 *  clasificar la pregunta con la respuesta. PURA. */
export function tipoDeLectura(lectura) {
  const t = lectura?.region ?? null
  return t == null ? TIPO_REGION.INDETERMINADO : clasificarPorTitulo(t).tipo
}

/** Un acumulador vacío. Existe como función para que `sumar` no tenga que conocer las claves. */
const vacio = (clave, valor) => ({ [clave]: valor, elementos: 0, computados: 0, llamadas: 0 })

/**
 * EL CÓMPUTO REAL DE UNA LECTURA CACHEADA, por el camino de producción.
 *
 * `archivo` es obligatorio y no tiene default: `origenCitable` exige archivo + lámina + texto
 * literal para admitir una cantidad, así que pasar `null` haría que TODA cantidad salga inadmisible
 * y la medición diría «ninguna se puede citar» cuando lo que falta es el parámetro. Ese es el
 * control que se valida contra su propio hueco.
 */
export function computarLectura(lectura, archivo) {
  const lam = validarLamina(lectura?.crudo, { archivo, archivoId: null })
  return computarElementos(lam.elementos)
}

/**
 * EL RENDIMIENTO DE UN CONJUNTO DE LECTURAS YA PAGADAS.
 *
 * @param lecturas `[{ region, crudo, archivo }]` — `archivo` es de dónde salió el recorte.
 * @returns totales, y el corte por FORMA geométrica y por SUBCAPACIDAD, más el motivo del hueco.
 */
export function rendimiento(lecturas = []) {
  const porForma = new Map()
  const porTipo = new Map()
  const motivos = new Map()
  let elementos = 0; let computados = 0; let admitidos = 0

  for (const l of lecturas) {
    const c = computarLectura(l, l?.archivo ?? 'desconocido')
    const tipo = tipoDeLectura(l)
    elementos += c.detectados; computados += c.computados; admitidos += c.admitidas
    const t = porTipo.get(tipo) ?? vacio('tipo', tipo)
    t.llamadas += 1; t.elementos += c.detectados; t.computados += c.computados
    porTipo.set(tipo, t)
    for (const i of c.items) {
      const f = porForma.get(i.forma) ?? vacio('forma', i.forma)
      f.elementos += 1; if (i.cantidad !== null) f.computados += 1
      porForma.set(i.forma, f)
      // El motivo se recorta antes de los dos puntos porque `computarElemento` le pega la frase
      // entera del plano detrás («cantidad de elementos: el plano no declara cuántos hay»): sin
      // recortar, 438 huecos del mismo motivo salen como 438 motivos distintos y no se ve nada.
      if (i.cantidad === null) {
        for (const m of i.faltan ?? []) {
          const k = String(m).replace(/:.*$/, '').replace(/\(.*\)/, '').trim()
          motivos.set(k, (motivos.get(k) ?? 0) + 1)
        }
      }
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
  const cerrar = (m, clave) => [...m.values()]
    .map((x) => ({ ...x, pct: pct(x.computados, x.elementos) }))
    .sort((a, b) => b.elementos - a.elementos || String(a[clave]).localeCompare(String(b[clave])))
  return {
    lecturas: lecturas.length,
    elementos,
    computados,
    admitidos,
    pct: pct(computados, elementos),
    porForma: cerrar(porForma, 'forma'),
    porTipo: cerrar(porTipo, 'tipo'),
    motivos: [...motivos.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ¿EL DEFECTO ES LA SEGMENTACIÓN? — LA HIPÓTESIS QUE HABÍA QUE PROBAR Y PERDIÓ
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El prompt de `interpretarRegion` le prohíbe al modelo cruzar vistas: «Computá SÓLO lo que se ve
// acá». Si la sección de un perfil está en el detalle y su largo en la planta, esa prohibición
// garantizaría que ninguna de las dos llamadas lo compute — y el defecto sería QUÉ se manda, no con
// qué se lee. Es la hipótesis cara: cambiaría el pipeline entero.
//
// Se mide sin pagar nada: se juntan todas las lecturas del MISMO plano, se unen las dimensiones que
// cada vista aportó del mismo elemento, y se pregunta cuántos elementos pasan a computar. Medido
// sobre los 12 planos del caché —132 elementos vistos en dos o más vistas— la fusión recuperó UNO.
//
// ═══ Y POR QUÉ ESTA FUNCIÓN NO PUEDE DAR UN CERO FALSO ═══
//
// Un cero se explicaría igual de bien porque no hubiera nada que fusionar. Por eso devuelve
// `multivista`: cuántos elementos aparecieron en más de una vista. Si ese número es 0, el `ganados`
// no significa nada y quien lea el resultado tiene que verlo al lado, no en una nota al pie.

/** La identidad de un elemento dentro de un plano: su marca, o su nombre si no tiene marca. PURA. */
export function claveDeElemento(el) {
  const crudo = el?.id ?? el?.nombre ?? ''
  const norm = String(crudo).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '')
  return norm ? `${norm}|${el?.forma ?? ''}` : null
}

/**
 * LAS DIMENSIONES QUE ESTE ELEMENTO SÍ TRAE. PURA.
 *
 * ═══ LA VERSIÓN ANTERIOR NO FUSIONABA NADA Y NO SE NOTABA ═══
 *
 * Filtraba `typeof v === 'number'`. Pero `validarLamina` no deja números sueltos: convierte cada
 * dimensión en `{ valor, unidad, fuente, evidencia }` —es lo que hace que una cantidad se pueda
 * citar—. Así que el filtro no encontraba NINGUNA dimensión, la fusión copiaba cero campos, y el
 * resultado —GANANCIA −1— parecía un hallazgo sobre la segmentación cuando era un `typeof` mal
 * puesto. Un número que sale de un merge vacío no dice nada sobre el mundo.
 */
function aportadas(el) {
  const d = el?.dimensiones ?? {}
  return Object.entries(d)
    .filter(([, v]) => typeof v?.valor === 'number' && Number.isFinite(v.valor))
    .map(([k]) => k)
}

/**
 * UN SOLO ELEMENTO A PARTIR DE TODAS SUS LECTURAS. PURA.
 *
 * ═══ EL FUSIONADO ARRANCA DE LA VISTA QUE SÍ TENÍA RESPALDO, NO DE LA PRIMERA ═══
 *
 * `validarElemento` marca `computable: false` cuando la lectura vino sin texto literal, y ese flag
 * corta el cómputo antes de mirar una sola dimensión. Arrancando por `g[0]` la fusión daba GANANCIA
 * −1: heredaba el «no computable» de una vista sin cita y perdía un elemento que otra vista sí
 * sostenía. Una fusión que pierde no está midiendo la fusión, está midiendo el orden de los
 * archivos en el caché.
 *
 * Se arranca del primero computable —el que tiene la cita que hace defendible el número— y recién
 * ahí se completan los huecos con las otras vistas.
 */
export function fusionar(grupo = []) {
  const base = grupo.find((e) => e?.computable) ?? grupo[0]
  const resto = grupo.filter((e) => e !== base)
  const fus = { ...base, dimensiones: { ...(base?.dimensiones ?? {}) }, repeticion: { ...(base?.repeticion ?? {}) } }
  const yaTiene = new Set(aportadas(fus))
  for (const e of resto) {
    for (const k of aportadas(e)) if (!yaTiene.has(k)) { fus.dimensiones[k] = e.dimensiones[k]; yaTiene.add(k) }
    if (fus.repeticion?.cantidad == null && e.repeticion?.cantidad != null) fus.repeticion = { ...e.repeticion }
  }
  return fus
}

/**
 * CUÁNTO SE GANA FUSIONANDO LAS VISTAS DE UN MISMO PLANO.
 *
 * @param porPlano `Map|objeto` de `plano -> [{ region, crudo, archivo }]`
 */
export function gananciaDeFusionar(porPlano = {}) {
  const entradas = porPlano instanceof Map ? [...porPlano.entries()] : Object.entries(porPlano)
  let grupos = 0; let multivista = 0; let sueltos = 0; let fusionados = 0
  for (const [plano, lecturas] of entradas) {
    const porClave = new Map()
    for (const l of lecturas) {
      for (const e of validarLamina(l?.crudo, { archivo: plano, archivoId: null }).elementos) {
        const k = claveDeElemento(e)
        if (!k) continue
        const g = porClave.get(k) ?? []
        g.push(e); porClave.set(k, g)
      }
    }
    for (const g of porClave.values()) {
      grupos += 1
      if (g.length > 1) multivista += 1
      const fus = fusionar(g)
      const antes = computarElementos(g).computados > 0
      const despues = computarElementos([fus]).computados > 0
      if (antes) sueltos += 1
      if (despues) fusionados += 1
    }
  }
  return {
    grupos,
    multivista,
    computablesSueltos: sueltos,
    computablesFusionados: fusionados,
    ganados: fusionados - sueltos,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// QUÉ SE PIERDE DE VERDAD AL DEJAR DE MIRAR UNA SUBCAPACIDAD
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// «Se pierde el 18% del cómputo» es la cuenta de arriba: 28 elementos computados de los 152 salen
// de las 53 llamadas a `detalle` e `indeterminado`. Pero esa cuenta es por LECTURA, y un elemento
// que aparece en el detalle y también en la planta está contado dos veces: si la planta lo computa
// igual, dejar de mirar el detalle no pierde nada — se deja de pagar dos veces por el mismo dato.
//
// Acá se separan las dos cosas: lo que sólo existía en lo que se dejó de mirar (PÉRDIDA REAL) y lo
// que sigue estando en las vistas que se siguen mirando (DUPLICADO QUE SE DEJA DE PAGAR).
//
// ═══ POR QUÉ ESTE NÚMERO PODRÍA SER MENTIRA, Y CÓMO SE CONTROLA ═══
//
// La recuperación se decide por `claveDeElemento`, que es la marca del elemento o su nombre. Un
// elemento sin ninguna de las dos no se puede rastrear entre vistas, y contarlo como «recuperado»
// sería regalarse el resultado. Salen aparte, en `sinIdentidad`, y cuentan como pérdida.

/**
 * LA PÉRDIDA REAL DE DEJAR DE MIRAR CIERTAS SUBCAPACIDADES. PURA.
 *
 * @param porPlano `Map|objeto` de `plano -> [{ region, crudo, archivo }]`
 * @param tipos    las subcapacidades que se dejan de mirar.
 */
export function perdidaPorNoMirar(porPlano = {}, tipos = ['detalle', 'indeterminado']) {
  const entradas = porPlano instanceof Map ? [...porPlano.entries()] : Object.entries(porPlano)
  const fuera = new Set(tipos)
  let computadosAntes = 0; let computadosDespues = 0; let llamadasAntes = 0; let llamadasDespues = 0
  let recuperados = 0; let perdidos = 0; let sinIdentidad = 0
  for (const [plano, lecturas] of entradas) {
    const elementosDe = (ls) => ls.flatMap((l) => validarLamina(l?.crudo, { archivo: plano, archivoId: null }).elementos)
    const salen = lecturas.filter((l) => fuera.has(tipoDeLectura(l)))
    const quedan = lecturas.filter((l) => !fuera.has(tipoDeLectura(l)))
    llamadasAntes += lecturas.length; llamadasDespues += quedan.length
    for (const l of lecturas) computadosAntes += computarLectura(l, plano).computados
    for (const l of quedan) computadosDespues += computarLectura(l, plano).computados

    // Lo que sigue disponible después del recorte, fusionado como lo fusiona el pipeline.
    const porClave = new Map()
    for (const e of elementosDe(quedan)) {
      const k = claveDeElemento(e)
      if (k) porClave.set(k, [...(porClave.get(k) ?? []), e])
    }
    const sigueComputando = new Set()
    for (const [k, g] of porClave) if (computarElementos([fusionar(g)]).computados > 0) sigueComputando.add(k)

    for (const e of elementosDe(salen)) {
      if (computarElementos([e]).computados === 0) continue
      const k = claveDeElemento(e)
      if (!k) { sinIdentidad += 1; perdidos += 1; continue }
      if (sigueComputando.has(k)) recuperados += 1
      else perdidos += 1
    }
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
  return {
    llamadasAntes,
    llamadasDespues,
    llamadasAhorradas: llamadasAntes - llamadasDespues,
    computadosAntes,
    computadosDespues,
    // La resta cruda: cuántos cómputos por lectura dejan de producirse.
    computadosQueSeDejanDeVer: computadosAntes - computadosDespues,
    // De ésos, los que OTRA vista del mismo plano sigue computando: no se pierden, se dejan de
    // pagar dos veces.
    recuperadosEnOtraVista: recuperados,
    perdidaReal: perdidos,
    sinIdentidad,
    pctPerdidaSobreElTotal: pct(perdidos, computadosAntes),
  }
}
