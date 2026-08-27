// LA SALUD DE XSAS, POR CAPAS — porque «FULL» no era una respuesta.
//
// ═══ EL DEFECTO QUE ESTO CORRIGE (27/08/2026) ═══
//
// `xsas-estado.mjs` publicaba **FULL** con 2 rendimientos aprendidos, 0 validados y 10% de las
// actividades clasificadas. No mentía: el nivel de operación mide si el OS PUEDE razonar, y podía.
// El problema es que era la única palabra grande del cuadro, y quien la leía entendía «la
// inteligencia está bien». Los timers corriendo no son que el sistema esté aprendiendo.
//
// ═══ LAS CINCO CAPAS ═══
//
//   INFRAESTRUCTURA  la base contesta, los trabajos avanzan, nada está trabado.
//   DATOS            la empresa está cargada: obras con avance, actividades con hechos reales.
//   APRENDIZAJE      esos hechos se convirtieron en experiencia REUTILIZABLE.
//   CAPACIDADES      agentes, herramientas y método de dominio disponibles.
//   IA EXTERNA       el proveedor del modelo, y cuánto se le está gastando.
//
// Cada una con su propio veredicto, porque cada una se arregla de una forma distinta: la primera
// con un servicio, la segunda cargando obra, la tercera esperando ejecución, la cuarta escribiendo
// código y la quinta pagando una factura. Un semáforo único no le dice a nadie qué hacer.
//
// ═══ LA REGLA ═══
//
// **Lo que no se pudo leer NUNCA sale OK.** Un control que no pudo mirar no dice «está bien». Y
// este módulo es puro: recibe el estado ya leído y decide, para poder probarlo sin base — que es
// exactamente la situación en la que hace falta que conteste.

/** Los veredictos, del mejor al peor. El orden define cuál gana cuando se resume el conjunto. */
export const VEREDICTO = Object.freeze({
  OK: 'OK',
  PARCIAL: 'PARCIAL',
  INSUFICIENTE: 'INSUFICIENTE',
  NO_DISPONIBLE: 'NO DISPONIBLE',
  NO_SE_PUDO_LEER: 'NO SE PUDO LEER',
  CAIDA: 'CAÍDA',
})

const ORDEN = [VEREDICTO.OK, VEREDICTO.PARCIAL, VEREDICTO.INSUFICIENTE,
  VEREDICTO.NO_DISPONIBLE, VEREDICTO.NO_SE_PUDO_LEER, VEREDICTO.CAIDA]

/** El peor veredicto de un conjunto: el que manda cuando hay que decir una sola palabra. */
export function peorVeredicto(veredictos) {
  return veredictos.reduce((peor, v) =>
    (ORDEN.indexOf(v) > ORDEN.indexOf(peor) ? v : peor), VEREDICTO.OK)
}

function infraestructura(e) {
  if (e.agentes == null && e.trabajos == null) {
    return { veredicto: VEREDICTO.CAIDA, porQue: e.noSePudoLeer ?? 'la base no contestó', medidas: {} }
  }
  const t = e.trabajos ?? {}
  const medidas = { activos: t.activos ?? null, trabados: t.trabados ?? null, completados: t.completados ?? null }

  // ═══ EL FALLO PARCIAL NO ES UN OK (hallazgo de la auditoría adversarial, 27/08/2026) ═══
  //
  // Con `agentes` leído y `trabajos` en null —una consulta de las dos que falla— `t` quedaba en `{}`,
  // `t.trabados > 0` daba false, y esta capa devolvía **OK: «la base contesta y no hay trabajos
  // trabados»**. Afirmaba que no hay trabajos trabados sin haber podido contarlos.
  //
  // Es el mismo modo de fallar que ya costó seis falsos faltantes en control de documentación: un
  // control que no pudo mirar NO dice «está todo bien», dice que no pudo mirar. La diferencia
  // importa porque el OS decide distinto: ante OK no se hace nada; ante NO SE PUDO LEER se va a
  // buscar por qué.
  const falta = [e.agentes == null ? 'los agentes' : null, e.trabajos == null ? 'los trabajos' : null].filter(Boolean)
  if (falta.length) {
    return {
      veredicto: VEREDICTO.NO_SE_PUDO_LEER,
      porQue: `no se pudo leer ${falta.join(' ni ')}${e.noSePudoLeer ? `: ${e.noSePudoLeer}` : ''} — no se puede afirmar que esté sana`,
      medidas,
    }
  }
  if (t.trabados > 0) {
    return {
      veredicto: VEREDICTO.PARCIAL,
      porQue: `${t.trabados} trabajo(s) trabado(s) esperando a una persona: el Work Fabric no los va a retomar solo`,
      medidas,
    }
  }
  return { veredicto: VEREDICTO.OK, porQue: 'la base contesta y no hay trabajos trabados', medidas }
}

/**
 * DATOS — ¿de cuánto de la empresa tiene el OS estado real?
 *
 * El umbral no es un porcentaje inventado: es **todas las obras activas con avance medido**. Una
 * obra activa sin avance cargado es una obra sobre la que el OS no puede decir nada, y eso se
 * arregla cargando obra, no programando.
 */
function datos(e) {
  const m = e.empresa
  if (!m) return { veredicto: VEREDICTO.NO_SE_PUDO_LEER, porQue: e.noSePudoLeer ?? 'no se pudo leer la empresa', medidas: {} }
  const activas = Number(m.activas ?? 0)
  const conAvance = Number(m.con_avance ?? 0)
  const conReal = Number(m.con_real ?? 0)
  const medidas = {
    obrasActivas: activas, obrasConAvance: conAvance,
    actividades: Number(m.actividades ?? 0), conHechosReales: conReal,
    conFechaReal: Number(m.con_inicio_real ?? 0), terminadas: Number(m.terminadas ?? 0),
  }
  if (!conAvance && !Number(m.con_inicio_real ?? 0)) {
    return { veredicto: VEREDICTO.INSUFICIENTE, porQue: 'ninguna obra tiene avance ni fechas reales cargadas', medidas }
  }
  if (conAvance < activas) {
    return {
      veredicto: VEREDICTO.PARCIAL,
      porQue: `${conAvance} de ${activas} obras activas tienen avance medido: de las otras el OS no puede afirmar nada`,
      medidas,
    }
  }
  return { veredicto: VEREDICTO.OK, porQue: 'todas las obras activas tienen avance medido', medidas }
}

/**
 * APRENDIZAJE — ¿esos hechos ya sirven para la próxima cotización?
 *
 * Reutilizable pide DOS obras distintas con la misma tarea, que es la regla que ya usan
 * `experiencia_por_tarea` y el aprendizaje: con una obra hay un dato, no una referencia. Mientras
 * ninguna tarea llegue a dos obras, el circuito funciona y no rinde: eso es PARCIAL, no OK.
 */
function aprendizaje(e) {
  const m = e.empresa
  if (!m) return { veredicto: VEREDICTO.NO_SE_PUDO_LEER, porQue: e.noSePudoLeer ?? 'no se pudo leer', medidas: {} }
  const x = m.experiencia ?? {}
  // Un control que no pudo mirar no dice «está bien» NI «está mal»: dice que no pudo mirar. Contar
  // cero hechos porque la consulta falló publicaría «el circuito no recibió nada», que es una
  // emergencia distinta a «la tabla no existe todavía».
  if (x.noSePudoLeer) {
    return { veredicto: VEREDICTO.NO_SE_PUDO_LEER, porQue: `no se pudo contar la experiencia: ${x.noSePudoLeer}`, medidas: {} }
  }
  const hechos = Number(x.hechosDuracion ?? 0) + Number(x.hechosRendimiento ?? 0) + Number(x.hechosDotacion ?? 0)
  const reutilizables = Number(x.tareasReutilizables ?? 0)
  const medidas = {
    hechos, reutilizables,
    duracion: Number(x.hechosDuracion ?? 0),
    rendimiento: Number(x.hechosRendimiento ?? 0),
    dotacion: Number(x.hechosDotacion ?? 0),
    costo: 'no disponible: se imputa por obra, no por actividad',
    actividadesClasificadas: Number(m.con_tarea_tipo ?? 0),
    actividades: Number(m.actividades ?? 0),
  }
  if (!hechos) return { veredicto: VEREDICTO.INSUFICIENTE, porQue: 'no hay un solo hecho medido: el circuito no recibió nada', medidas }
  if (!reutilizables) {
    return {
      veredicto: VEREDICTO.PARCIAL,
      porQue: `${hechos} hechos medidos y ninguna tarea llega a dos obras: la experiencia todavía no se puede reutilizar`,
      medidas,
    }
  }
  return { veredicto: VEREDICTO.OK, porQue: `${reutilizables} tarea(s) con experiencia de dos obras o más`, medidas }
}

function capacidades(e) {
  const medidas = {
    agentesDeNegocio: e.agentes?.deNegocio ?? null,
    herramientas: e.herramientas, skills: e.skills,
  }
  if (e.agentes == null) return { veredicto: VEREDICTO.NO_SE_PUDO_LEER, porQue: 'no se pudo leer la lista de agentes', medidas }
  if (!e.agentes.total) return { veredicto: VEREDICTO.CAIDA, porQue: 'no hay un solo agente registrado', medidas }
  // Un agente del NEGOCIO que razona con Claude Code es una dependencia del negocio con la cuota de
  // una herramienta de desarrollo. Es el invariante del mandato y por eso baja el veredicto.
  const deMas = (e.agentes.conClaudeCode ?? 0) - (e.agentes.delBuilder ?? 0)
  if (deMas > 0) {
    return { veredicto: VEREDICTO.PARCIAL, porQue: `${deMas} agente(s) de negocio razonan con Claude Code`, medidas }
  }
  return { veredicto: VEREDICTO.OK, porQue: `${e.agentes.deNegocio} agentes de negocio, ${e.herramientas} herramientas, ${e.skills} skills`, medidas }
}

/**
 * IA EXTERNA — la única capa que depende de un tercero, y por eso la única que se declara aparte.
 *
 * Que esté NO DISPONIBLE no degrada a las otras cuatro: ése es todo el punto de que XSAS se
 * describa con SQL y lectura de disco. Lo que sí baja el veredicto es gastar sin saber quién gastó.
 */
function iaExterna(e) {
  const medidas = {
    disponible: e.motor?.disponible ?? null,
    llamadas: e.costo?.llamadas ?? null, usd: e.costo?.usd ?? null,
    sinAtribuir: e.costo?.sinAtribuir ?? null,
  }
  if (!e.motor?.disponible) {
    return {
      veredicto: VEREDICTO.NO_DISPONIBLE,
      porQue: `sin razonador desde ${e.motor?.sinCreditoDesde ?? 'hace rato'} — todo lo determinístico sigue andando`,
      medidas,
    }
  }
  if ((e.costo?.sinAtribuir ?? 0) > 0) {
    return {
      veredicto: VEREDICTO.PARCIAL,
      porQue: `${e.costo.sinAtribuir} llamadas no dicen qué agente las pidió: el gasto no se puede atribuir`,
      medidas,
    }
  }
  return { veredicto: VEREDICTO.OK, porQue: 'el razonador contesta y todo el gasto está atribuido', medidas }
}

/**
 * LAS CINCO CAPAS DE UN ESTADO YA LEÍDO. Puro: no toca la base ni el disco.
 *
 * El veredicto del conjunto es el PEOR de los cinco, no un promedio: promediar una capa caída con
 * cuatro sanas produce «casi bien», que no es un estado en el que se pueda operar.
 */
export function capasDeSalud(e = {}) {
  const capas = {
    infraestructura: infraestructura(e),
    datos: datos(e),
    aprendizaje: aprendizaje(e),
    capacidades: capacidades(e),
    iaExterna: iaExterna(e),
  }
  return {
    capas,
    // La IA externa NO entra en el veredicto del conjunto: es infraestructura de un tercero y el OS
    // fue construido para funcionar sin ella. Si entrara, un proveedor caído pintaría de rojo un
    // sistema que está aprendiendo y operando igual.
    veredicto: peorVeredicto(['infraestructura', 'datos', 'aprendizaje', 'capacidades']
      .map((k) => capas[k].veredicto)),
  }
}
