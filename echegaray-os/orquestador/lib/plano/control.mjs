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

/**
 * DE 55 PREGUNTAS A UN PUÑADO DE DECISIONES.
 *
 * ═══ POR QUÉ AGRUPAR POR TEXTO NO ALCANZA ═══
 *
 * Colapsar preguntas idénticas bajó de 143 a 55 y 55 sigue sin ser una experiencia de producto.
 * Y el problema no es la cantidad: es que las preguntas están planteadas al nivel equivocado.
 * «¿Cuánto pesa por metro el perfil de la cercha?», «¿qué equipo de izaje?», «¿cuánta superficie
 * hay que pintar con antióxido?» y «¿cómo se transporta?» NO son cuatro preguntas: son UNA
 * —«¿cómo se contrata la estructura metálica?»— y la respuesta las cierra a las cuatro, porque si
 * va llave en mano el taller, el transporte, el izaje y la protección son del proveedor.
 *
 * Cada decisión de acá dice QUÉ RESUELVE. Si una decisión no cierra las preguntas que agrupa, no es
 * una decisión: es un rótulo, y agrupar por rótulo esconde el trabajo en vez de reducirlo.
 */
export const DECISIONES = Object.freeze([
  {
    clave: 'contratacion_estructura_metalica',
    cuando: (p) => p.origen === 'proceso derivado' && /taller|izaje|montaje|transporte|anticorrosivo/i.test(p.pregunta),
    pregunta: '¿Cómo se contrata la estructura metálica: provisión y montaje llave en mano, o sólo el montaje con material del cliente?',
    porQueCierra: 'si va llave en mano, el peso del perfil, el transporte, el izaje y la protección anticorrosiva son del proveedor y no se computan por separado; si es sólo montaje, hay que pedirle al proyectista el peso por metro y definir el equipo de izaje',
    quienLoDecide: 'dirección / comercial, con el proyectista',
  },
  {
    clave: 'armadura_cuantia_o_planilla',
    cuando: (p) => /armadura|cuantía|cuantia|planilla de doblado/i.test(p.pregunta),
    pregunta: '¿Existe planilla de doblado, o se adopta una cuantía (kg/m³) por tipo de elemento?',
    porQueCierra: 'es la única entrada que falta para pasar de metros cúbicos de hormigón a kilos de acero en TODOS los elementos de hormigón armado a la vez',
    quienLoDecide: 'proyectista / calculista',
  },
  {
    clave: 'movimiento_de_suelo',
    cuando: (p) => /excavaci|sobreancho|talud|relleno|compactaci/i.test(p.pregunta),
    pregunta: '¿Qué sobreancho de excavación y qué talud se adoptan, y el suelo excavado se retira o se reutiliza en relleno?',
    porQueCierra: 'con eso quedan determinados los m³ de excavación, los de relleno y los de retiro, que hoy salen abiertos en cada fundación',
    quienLoDecide: 'dirección técnica',
  },
  {
    clave: 'alcance_terminaciones',
    cuando: (p) => p.origen === 'checklist constructivo',
    pregunta: '¿Qué alcance tiene la oferta: obra gruesa sola, o incluye terminaciones e instalaciones?',
    porQueCierra: 'cierra de una vez todas las líneas del checklist tipológico que hoy quedan en FALTA_DATO por no saber si el galpón lleva núcleo sanitario, tanque y gas',
    quienLoDecide: 'comercial / cliente',
  },
  {
    clave: 'dimensiones_de_elementos',
    cuando: (p) => p.origen === 'proceso derivado' && /faltan dimensiones del elemento/i.test(p.pregunta),
    pregunta: '¿Se piden las planillas de vigas, columnas y bases al proyectista, o se adoptan dimensiones típicas por tipo de elemento?',
    porQueCierra: 'el encofrado, el hormigonado, el curado y el desencofrado de CADA elemento de hormigón se derivan de su geometría; sin las tres dimensiones no hay superficie de contacto ni volumen que calcular, y con la planilla salen todos juntos',
    quienLoDecide: 'proyectista / dirección técnica',
  },
  {
    clave: 'alcance_cubierta',
    cuando: (p) => p.origen === 'proceso derivado' && /canaleta|cenefa|bajada pluvial|aislaci[oó]n t[eé]rmica|desag[üu]e/i.test(p.pregunta),
    pregunta: '¿La oferta incluye el sistema de desagüe pluvial y la aislación térmica de la cubierta, o sólo la cubierta?',
    porQueCierra: 'canaletas, bajadas, cenefas y aislación son partidas propias que ningún plano de arquitectura dibuja: o entran las cuatro o quedan explícitamente excluidas',
    quienLoDecide: 'comercial / cliente',
  },
  {
    clave: 'espesores_no_declarados',
    cuando: (p) => p.origen === 'atributo sin respaldo' && /espesor/i.test(p.pregunta),
    pregunta: '¿Qué espesores se adoptan donde el plano dice «s/cálculo» (platea, contrapisos, muros)?',
    porQueCierra: 'cada espesor sin definir bloquea la partida más cara de su rubro — la platea de Quattropani fueron $ 29,6 M en la corrida del piloto',
    quienLoDecide: 'proyectista / calculista',
  },
])

/**
 * LAS DECISIONES QUE DESTRABAN LAS PREGUNTAS. PURA.
 *
 * Lo que no encaja en ninguna decisión NO se fuerza adentro: sale como pregunta suelta. Meter a la
 * fuerza una pregunta en un grupo que no la resuelve es la forma de que la respuesta llegue y el
 * hueco siga abierto.
 */
export function decisiones(preguntas = []) {
  const grupos = new Map()
  const sueltas = []
  for (const p of preguntas) {
    const d = DECISIONES.find((x) => x.cuando(p))
    if (!d) { sueltas.push(p); continue }
    const g = grupos.get(d.clave) ?? { ...d, cuando: undefined, preguntas: [], destraba: [] }
    g.preguntas.push(p.pregunta)
    g.destraba.push(...p.destraba)
    grupos.set(d.clave, g)
  }
  const lista = [...grupos.values()].map((g) => ({ ...g, destraba: [...new Set(g.destraba)], preguntasQueCierra: g.preguntas.length }))
  lista.sort((a, b) => b.destraba.length - a.destraba.length || a.clave.localeCompare(b.clave))
  return { decisiones: lista, sueltas, total: lista.length + sueltas.length }
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
  const dec = decisiones(abiertas)
  // UN CONFLICTO DOCUMENTAL SIN RESOLVER TAMBIÉN DEJA LA COTIZACIÓN INCOMPLETA. Si el plano dice
  // H-21 y la memoria dice H-25, el precio de esa partida no está determinado por más cobertura que
  // haya: cotizarlo es elegir en silencio el resultado de una discusión que no ocurrió.
  const estado = cob.alcanza && !ocultos.length && !conflictos.length ? ESTADO_COTIZACION.COMPLETA : ESTADO_COTIZACION.INCOMPLETA
  return {
    estado,
    cobertura: cob,
    supuestosOcultos: ocultos,
    preguntas: abiertas,
    decisiones: dec.decisiones,
    preguntasSueltas: dec.sueltas,
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
    resumen: `${estado} · cómputo ${Math.round(cob.coberturaComputo * 100)}% (${cob.conCantidad}/${cob.detectados}) · cotización ${Math.round(cob.cobertura * 100)}% (${cob.resueltos}/${cob.detectados}) · supuestos ocultos ${ocultos.length} · conflictos ${conflictos.length} · ${dec.decisiones.length} decisiones + ${dec.sueltas.length} preguntas sueltas (de ${abiertas.length} huecos)${omisionesCircot.length ? ` · omisiones CIRCOT a confirmar ${omisionesCircot.length}` : ''}`,
  }
}
