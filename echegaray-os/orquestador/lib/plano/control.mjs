// ¿ESTA COTIZACIÓN ESTÁ LISTA? Puro. La pregunta que un total no contesta.
//
// ═══ POR QUÉ UN TOTAL NO ALCANZA ═══
//
// El pipeline siempre llega a un número. Ese número existe tanto cuando se computaron 46 elementos
// de 46 como cuando se computaron 24 y los otros 22 se cayeron por el camino, y en los dos casos se
// ve igual de terminado. Un presupuesto al que le falta la mitad del cómputo no es un presupuesto
// optimista: es una oferta que se firma y se pierde.
//
// Por eso acá la salida no es un total: es un ESTADO —COMPLETA o INCOMPLETA— y, cuando está
// incompleta, exactamente qué falta y quién lo tiene.
//
// ═══ LAS TRES PREGUNTAS QUE CIERRAN ═══
//
//   1. ¿Cuánto del cómputo quedó resuelto?         → cobertura, sobre los elementos CRÍTICOS
//   2. ¿Hay algún número que no se pueda defender? → supuestos ocultos, que tienen que ser CERO
//   3. ¿Qué falta que sólo puede decidir una persona? → las preguntas, AGRUPADAS
//
// ═══ POR QUÉ LAS PREGUNTAS VAN AGRUPADAS ═══
//
// Devolver veintidós preguntas sueltas es devolverle el problema entero al que preguntó. Una sola
// —«¿el galpón lleva núcleo sanitario?»— destraba seis partidas del checklist; una definición de
// espesor de platea destraba la partida más cara de la obra. El orden correcto no es el del
// listado: es el de cuántas partidas destraba cada respuesta.

import { FUENTE, esConfirmada } from './fuente.mjs'
import { ESTADO } from './seleccion.mjs'

/** El piso de cobertura para poder decir que una cotización está lista. Por debajo de esto el
 *  resultado se llama INCOMPLETA y muestra el hueco: no hay un modo intermedio. */
export const UMBRAL_COBERTURA = 0.9

/**
 * LA COBERTURA DEL CÓMPUTO. PURA.
 *
 * Crítico es TODO elemento detectado en la documentación, no sólo los que salieron bien: contar la
 * cobertura sobre los que se lograron computar da siempre 100% y no mide nada. El denominador es
 * lo que el plano tiene, y el numerador lo que quedó con cantidad Y con partida.
 */
export function medirCobertura({ items = [], mapeos = [], detectados = null } = {}) {
  const total = detectados ?? items.length
  const conCantidad = items.filter((i) => i.cantidad !== null && i.cantidad?.valor !== null)
  const mapeadas = new Set(mapeos.filter((m) => m.estado === ESTADO.MAPEADA).map((m) => m.elemento))
  const resueltos = conCantidad.filter((i) => mapeadas.has(i.id))
  const pct = total ? Math.round((resueltos.length / total) * 1000) / 1000 : 0
  return {
    detectados: total,
    conCantidad: conCantidad.length,
    conPartida: mapeadas.size,
    resueltos: resueltos.length,
    // DOS COBERTURAS, PORQUE SON DOS PREGUNTAS DISTINTAS Y SE CONFUNDEN TODO EL TIEMPO.
    // La del CÓMPUTO dice cuánto del proyecto está MEDIDO —que es el trabajo de ingeniería— y la de
    // la COTIZACIÓN dice cuánto está medido Y con partida —que es lo que se puede poner en un
    // precio—. Un proyecto puede estar bien computado y mal cotizado si a la Base Maestra le
    // faltan partidas, y reportar un solo número esconde cuál de las dos cosas está fallando.
    coberturaComputo: total ? Math.round((conCantidad.length / total) * 1000) / 1000 : 0,
    cobertura: pct,
    umbral: UMBRAL_COBERTURA,
    alcanza: pct >= UMBRAL_COBERTURA,
  }
}

/**
 * LOS SUPUESTOS OCULTOS. PURA — y el resultado tiene que ser CERO.
 *
 * Un supuesto no es un pecado: es un dato que puso alguien porque hacía falta. Lo que no puede
 * existir es un supuesto que NO ESTÉ MARCADO, porque entonces viaja dentro del precio con aspecto
 * de medición. Esta función recorre el cómputo y saca todo lo que tiene una fuente no confirmable
 * SIN estar declarado como tal.
 */
export function supuestosOcultos(items = []) {
  const ocultos = []
  for (const i of items) {
    const c = i.cantidad
    if (!c || c.valor === null) continue
    if (esConfirmada(c.fuente)) continue
    if (c.fuente === FUENTE.FALTA_DATO || c.fuente === FUENTE.SUPUESTO) continue // declarados: se ven
    ocultos.push({ elemento: i.id, nombre: i.nombre, valor: c.valor, unidad: i.unidad, fuente: c.fuente, porQue: 'tiene cantidad con una fuente que no se puede confirmar y no está declarada como supuesto' })
  }
  return ocultos
}

/** Cuánto pesa destrabar cada cosa: primero lo que libera más partidas, y a igualdad, lo que libera
 *  la partida más cara. La plata no se conoce acá, así que el segundo criterio es el orden del
 *  elemento — estable y por lo tanto repetible. PURA. */
const porImpacto = (a, b) => b.destraba.length - a.destraba.length || String(a.pregunta).localeCompare(String(b.pregunta))

/**
 * LAS PREGUNTAS QUE HAY QUE HACER, AGRUPADAS POR LO QUE DESTRABAN. PURA.
 *
 * Junta las tres fuentes de hueco del circuito —el atributo que una partida exige y el plano no
 * demuestra, el empate entre dos partidas, y el proceso derivado sin cantidad— y las colapsa por
 * TEXTO DE PREGUNTA: «¿de qué espesor es la platea?» es una sola pregunta aunque aparezca en tres
 * elementos.
 */
export function preguntas({ mapeos = [], procesos = [], checklist = [] } = {}) {
  const mapa = new Map()
  const sumar = (pregunta, destraba, quienLoTiene, origen) => {
    const g = mapa.get(pregunta) ?? { pregunta, destraba: [], quienLoTiene, origen }
    g.destraba.push(destraba)
    mapa.set(pregunta, g)
  }
  for (const m of mapeos) {
    if (m.estado === ESTADO.MAPEADA) continue
    if (m.faltan?.length) {
      for (const f of m.faltan) sumar(`¿Cuál es ${f.atributo === 'espesor_m' ? 'el espesor' : f.atributo} de este elemento? La partida candidata exige «${f.literal}» y el plano no lo dice`, m.elemento, 'proyecto / dirección técnica', 'atributo sin respaldo')
    } else if (m.estado === ESTADO.AMBIGUO) {
      const [a, b] = m.candidatos
      sumar(`¿«${a?.codigo}» o «${b?.codigo}»? Las dos encajan técnicamente y tienen precios distintos`, m.elemento, 'dirección técnica', 'empate entre partidas')
    } else {
      sumar(`¿Con qué partida se cotiza «${m.computo?.nombre ?? m.elemento}»? No hay ninguna compatible en la Base Maestra`, m.elemento, 'dirección técnica / Base Maestra', 'sin partida')
    }
  }
  for (const p of procesos) {
    if (p.cantidad !== null) continue
    sumar(`${p.tarea} (${p.unidad}): ${p.porQueFalta}`, p.elemento, p.quienLoTiene ?? 'dirección técnica', 'proceso derivado')
  }
  for (const c of checklist) {
    if (!c.pregunta) continue
    sumar(c.pregunta, `checklist ${c.n}`, 'proyecto', 'checklist constructivo')
  }
  return [...mapa.values()].sort(porImpacto)
}

/** El estado con el que se entrega una cotización. No hay un tercero. */
export const ESTADO_COTIZACION = Object.freeze({ COMPLETA: 'COMPLETA', INCOMPLETA: 'INCOMPLETA' })

/**
 * EL CONTROL COMPLETO. PURA.
 *
 * Es lo que se muestra arriba de todo, antes que el total, porque leer el total primero cambia lo
 * que uno cree del resto. Y declara `porQue` incluso cuando está completa: «alcanzó el 94% sin
 * supuestos ocultos» es una afirmación verificable; «lista» no lo es.
 */
export function controlar({ computo = {}, mapeo = {}, procesos = {}, checklist = [], omisionesCircot = [], conflictos = [] } = {}) {
  const cob = medirCobertura({ items: computo.items ?? [], mapeos: mapeo.mapeos ?? [], detectados: computo.detectados })
  const ocultos = supuestosOcultos(computo.items ?? [])
  const abiertas = preguntas({ mapeos: mapeo.mapeos ?? [], procesos: procesos.procesos ?? [], checklist })
  // UN CONFLICTO DOCUMENTAL SIN RESOLVER TAMBIÉN DEJA LA COTIZACIÓN INCOMPLETA. Si el plano dice
  // H-21 y la memoria dice H-25, el precio de esa partida no está determinado por más cobertura que
  // haya: cotizarlo es elegir en silencio el resultado de una discusión que no ocurrió.
  const estado = cob.alcanza && !ocultos.length && !conflictos.length ? ESTADO_COTIZACION.COMPLETA : ESTADO_COTIZACION.INCOMPLETA
  return {
    estado,
    cobertura: cob,
    supuestosOcultos: ocultos,
    preguntas: abiertas,
    omisionesCircot,
    conflictos,
    porQue: estado === ESTADO_COTIZACION.COMPLETA
      ? `${Math.round(cob.cobertura * 100)}% de los elementos detectados quedaron con cantidad y con partida, sin conflictos documentales y sin ningún número con fuente no declarada`
      : conflictos.length
        ? `hay ${conflictos.length} conflicto(s) entre documentos del proyecto sin resolver: ${conflictos.slice(0, 2).map((c) => c.que).join(', ')}`
        : ocultos.length
        ? `hay ${ocultos.length} cantidad(es) con una fuente que no se puede confirmar y que no está declarada como supuesto`
        : `sólo ${Math.round(cob.cobertura * 100)}% de los ${cob.detectados} elementos detectados quedó con cantidad Y con partida (mínimo ${Math.round(UMBRAL_COBERTURA * 100)}%)`,
    // El resumen en una línea, para que quepa en un mensaje de chat sin perder lo que importa.
    resumen: `${estado} · cómputo ${Math.round(cob.coberturaComputo * 100)}% (${cob.conCantidad}/${cob.detectados}) · cotización ${Math.round(cob.cobertura * 100)}% (${cob.resueltos}/${cob.detectados}) · supuestos ocultos ${ocultos.length} · conflictos ${conflictos.length} · preguntas abiertas ${abiertas.length}${omisionesCircot.length ? ` · omisiones CIRCOT a confirmar ${omisionesCircot.length}` : ''}`,
  }
}
