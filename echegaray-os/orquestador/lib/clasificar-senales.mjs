// LA EVIDENCIA QUE NO ESTÁ EN EL NOMBRE — señales, vetos y corroboraciones.
//
// ═══ POR QUÉ EXISTE ═══
//
// El clasificador nació mirando UNA sola cosa: cuánto se parecen dos textos. Con eso, de 248
// actividades históricas sin tipo no se pudo asignar casi ninguna, y las pocas que la similitud
// proponía eran justamente las peligrosas: «Hormigonado» → «HORMIGONADO A MANO» (0,63),
// «Compactación» → «RELLENO Y COMPACTACIÓN» (0,57). Dos nombres parecidos con dos productividades
// distintas.
//
// La obra tiene MÁS evidencia que el nombre: la unidad, el rubro o sección del cronograma, la
// partida cotizada de la que cuelga, el análisis de precios, las actividades vecinas del mismo
// frente y hasta el nombre de la obra. Este módulo la convierte en dos cosas distintas y las
// mantiene separadas a propósito:
//
//   VETO           una razón para NO asignar. Manda sobre cualquier parecido.
//   CORROBORACIÓN  una razón independiente para creerle al parecido. Baja el umbral, nunca lo anula.
//
// ═══ LA REGLA QUE GOBIERNA TODO LO DE ACÁ ═══
//
// **Una corroboración jamás desempata.** Si después de aplicar los vetos quedan dos candidatas
// razonables, el resultado es AMBIGUO aunque las dos estén corroboradas. Sumar señales para elegir
// entre dos tareas parecidas es exactamente cómo se contamina un rendimiento: sube la cobertura y
// baja la verdad, y la cobertura no se cotiza.

/** Normalización para comparar nombres: mayúsculas, sin acentos, espacios colapsados.
 *  Vive acá —y no en el módulo del veredicto— porque es la base de todo lo demás de este archivo y
 *  porque importarla al revés cerraría un ciclo entre los dos módulos. */
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * PALABRAS QUE NO APORTAN IDENTIDAD A UNA TAREA. Se sacan antes de comparar conjuntos.
 *
 * ═══ LAS QUE NO ESTÁN, Y POR QUÉ ═══
 *
 * **CON · SIN · SOBRE** cambian el trabajo, no la redacción: «MURO SIN REVOQUE» y «MURO CON
 * REVOQUE» salían IGUAL con estas tres adentro, y eso es un match inventado con dos precios
 * distintos detrás. «PISO SOBRE LOSA» tampoco es «PISO DE LOSA».
 *
 * **A · O · U · TIPO** porque en un catálogo de obra son designaciones, no conectores: «MURO TIPO A»
 * y «MURO TIPO B» quedaban con las mismas palabras. Sacar una letra suelta cuesta más de lo que
 * ahorra — y no hace falta: «HORMIGONADO A MANO» sigue conteniendo a «Hormigonado» con la A adentro.
 */
export const CONECTORES = Object.freeze(new Set([
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'E', 'PARA', 'POR', 'AL', 'EN', 'UN', 'UNA', 'SEGUN',
]))

/**
 * SINGULAR APROXIMADO EN CASTELLANO. No es un lematizador: es la regla mínima que hace que
 * «EXCAVACION» y «EXCAVACIONES» sean la misma palabra sin que «BASES» se convierta en «BAS».
 *
 * Termina en -ES y lo que queda cierra en consonante fuerte (N, R, L, D, Z, J, C, X) → se cae el -ES:
 * EXCAVACIONES→EXCAVACION, PORTONES→PORTON. En cualquier otro caso termina en -S → se cae la S:
 * BASES→BASE, ZANJAS→ZANJA, ESCOMBROS→ESCOMBRO.
 */
export function singular(palabra) {
  const p = String(palabra ?? '')
  if (p.length > 4 && p.endsWith('ES') && /[NRLDZJCX]$/.test(p.slice(0, -2))) return p.slice(0, -2)
  if (p.length > 3 && p.endsWith('S')) return p.slice(0, -1)
  return p
}

/**
 * EL CONJUNTO DE PALABRAS QUE IDENTIFICAN UNA TAREA. Mayúsculas, sin acentos, sin puntuación, sin
 * conectores, sin plurales y sin repetidos. Es lo que permite decir que «EXCAVACION» y
 * «EXCAVACIONES DE ...» comparten una palabra y que «REPLANTEO» y «REPLANTEOS» son la misma.
 *
 * Los números y medidas SE CONSERVAN: «PISO DE HORMIGÓN - 20CM» y «PISO DE HORMIGÓN - 15CM» son dos
 * tareas distintas y el espesor es lo único que las separa.
 */
export function tokens(texto) {
  const limpio = normalizar(texto).replace(/[^\wÑ ]+/g, ' ')
  const out = new Set()
  for (const t of limpio.split(/\s+/)) {
    if (!t || CONECTORES.has(t)) continue
    out.add(singular(t))
  }
  return out
}

const contiene = (grande, chico) => [...chico].every((t) => grande.has(t))

/**
 * ¿QUÉ RELACIÓN HAY ENTRE DOS NOMBRES DE TAREA?
 *
 *   IGUAL                     mismas palabras: es la misma tarea escrita distinto.
 *   CANDIDATA_MAS_ESPECIFICA  la del catálogo agrega palabras: «HORMIGONADO A MANO» ⊃ «Hormigonado».
 *   ACTIVIDAD_MAS_ESPECIFICA  la de la obra agrega palabras: «Solicitud de Programa de Seguridad».
 *   DISTINTAS                 se cruzan en algo pero ninguna contiene a la otra.
 *
 * Los dos casos del medio son la trampa que este archivo existe para frenar: hormigonar a mano y
 * hormigonar con bomba comparten la palabra y no la productividad; «Compactación» es media
 * «RELLENO Y COMPACTACIÓN». Aprender una como la otra deja esa tarea contaminada para siempre.
 */
export function relacionDeNombres(nombreActividad, nombreCandidata) {
  const a = tokens(nombreActividad), b = tokens(nombreCandidata)
  if (!a.size || !b.size) return 'DISTINTAS'
  const aEnB = contiene(b, a), bEnA = contiene(a, b)
  if (aEnB && bEnA) return 'IGUAL'
  if (aEnB) return 'CANDIDATA_MAS_ESPECIFICA'
  if (bEnA) return 'ACTIVIDAD_MAS_ESPECIFICA'
  return 'DISTINTAS'
}

/**
 * LOS VETOS DE UNA CANDIDATA. Lista vacía = ninguna razón para descartarla.
 *
 * `contexto`: { unidad, seccion, obra, hermanas: [{ nombre, tareaTipoId }] }
 *
 * El veto por hermana es el que aporta la obra y ninguna otra fuente: si en el MISMO frente hay una
 * actividad separada llamada «Relleno», entonces «RELLENO Y COMPACTACIÓN» describe más trabajo del
 * que hace esta actividad, y da igual cuánto se parezcan los nombres. Es la secuencia constructiva
 * hablando: esta obra parte esa tarea en dos, así que la tarea entera no es ninguna de las dos.
 */
export function vetosDe(candidata, contexto = {}) {
  const vetos = []
  const rel = relacionDeNombres(contexto.nombre, candidata.nombre)
  if (rel === 'CANDIDATA_MAS_ESPECIFICA') {
    vetos.push(`«${candidata.nombre}» agrega condiciones que la actividad no dice: es más específica, no la misma tarea`)
  }
  if (rel === 'ACTIVIDAD_MAS_ESPECIFICA') {
    vetos.push(`la actividad agrega condiciones que «${candidata.nombre}» no tiene: es una parte o una variante, no la tarea`)
  }
  const ct = tokens(candidata.nombre)
  for (const h of contexto.hermanas ?? []) {
    const ht = tokens(h.nombre)
    if (!ht.size || normalizar(h.nombre) === normalizar(contexto.nombre)) continue
    if (contiene(ct, ht) && ht.size < ct.size) {
      vetos.push(`en el mismo frente hay otra actividad llamada «${h.nombre}»: «${candidata.nombre}» abarca las dos, así que no es ésta`)
    }
  }
  return vetos
}

/**
 * LAS CORROBORACIONES DE UNA CANDIDATA — razones INDEPENDIENTES del parecido de los nombres.
 *
 * Cada una vale por sí sola y ninguna suma con otra para desempatar: se cuentan para saber si el
 * parecido tiene respaldo, no para elegir entre dos.
 */
export function corroboracionesDe(candidata, contexto = {}) {
  const out = []
  const ct = tokens(candidata.nombre)
  const compartido = (texto) => [...tokens(texto)].filter((t) => ct.has(t))

  if (contexto.unidad && candidata.unidad && normalizar(contexto.unidad) === normalizar(candidata.unidad)) {
    out.push({ senal: 'unidad', porQue: `las dos se miden en ${candidata.unidad}` })
  }
  const rubro = compartido(contexto.seccion)
  if (rubro.length) {
    out.push({ senal: 'rubro', porQue: `el rubro «${contexto.seccion}» nombra ${rubro.join(', ')}` })
  }
  const porObra = compartido(contexto.obra)
  if (porObra.length) {
    out.push({ senal: 'obra', porQue: `la obra «${contexto.obra}» nombra ${porObra.join(', ')}` })
  }
  const vecina = (contexto.hermanas ?? []).find((h) => h.tareaTipoId && h.tareaTipoId === candidata.tareaTipoId)
  if (vecina) {
    out.push({ senal: 'vecina', porQue: `«${vecina.nombre}», del mismo frente, ya está clasificada como esta tarea` })
  }
  if (contexto.analisisTareaTipoId && contexto.analisisTareaTipoId === candidata.tareaTipoId) {
    out.push({ senal: 'analisis', porQue: 'el análisis de precios de la actividad apunta a esta tarea' })
  }
  return out
}

/**
 * LA PRUEBA QUE NO NECESITA PARECIDO: la actividad cuelga de una partida cotizada o de un análisis,
 * y esos YA dicen de qué tarea se trata. No es una inferencia, es un dato del presupuesto.
 *
 * Hoy las 248 sin clasificar no tienen ninguno de los dos —entraron como cronograma, sin
 * presupuesto detrás— así que esto no clasifica una sola fila más. Está igual porque la próxima
 * obra que nazca de una cotización se clasifica sola y sin mirar un nombre.
 */
export function pruebaDirecta(contexto = {}) {
  if (contexto.partidaTareaTipoId) {
    return {
      veredicto: 'EXACTO', tareaTipoId: contexto.partidaTareaTipoId,
      confianza: 'EXACTO', origen: 'presupuesto',
      porQue: 'la actividad cuelga de una partida cotizada, que ya declara la tarea',
      evidencia: { senal: 'partida', partida: contexto.partidaCodigo ?? null },
    }
  }
  if (contexto.analisisTareaTipoId) {
    return {
      veredicto: 'EXACTO', tareaTipoId: contexto.analisisTareaTipoId,
      confianza: 'EXACTO', origen: 'plantilla',
      porQue: 'la actividad usa un análisis de precios, que ya declara la tarea',
      evidencia: { senal: 'analisis' },
    }
  }
  return null
}
