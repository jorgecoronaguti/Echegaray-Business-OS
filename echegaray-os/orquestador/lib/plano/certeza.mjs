// ¿CUÁNTO SE PUEDE APOYAR EN ESTE NÚMERO? PURO. El escalón que faltaba entre «hay un total» y
// «se puede mandar».
//
// ═══ POR QUÉ NO HAY UN «CONFIDENCE SCORE» ═══
//
// Un puntaje compuesto —0,87— tiene una propiedad fatal: nadie lo puede rehacer a mano, y por lo
// tanto nadie lo puede discutir. Cuando el 0,87 sale de promediar cobertura con conflictos y
// supuestos, un conflicto documental se compensa con dos partidas más mapeadas, y la cotización que
// no se puede firmar termina puntuando mejor que la que sí. La compensación es el defecto, no la
// escala.
//
// Acá cada regla es un UMBRAL SOBRE UN NÚMERO QUE YA SE MIDE, y cada regla que falla pone un TECHO.
// El estado es el techo más bajo. Nada se promedia, nada se compensa: para subir un escalón hay que
// arreglar exactamente lo que la regla nombra, y eso sale escrito.
//
// ═══ LA REGLA QUE NO SE NEGOCIA ═══
//
// Un conflicto documental sin resolver, o un supuesto oculto que sostiene plata, NO puede llegar a
// COTIZABLE por buena que sea la cobertura. En el piloto de Quattropani son 4 supuestos ocultos con
// $ 4,1 M adentro: cotizarlos es elegir en silencio el resultado de una discusión que no ocurrió.
//
// ═══ VALIDADO NO LO PUEDE ALCANZAR EL CÓDIGO ═══
//
// Las cuatro primeras las decide la medición. La quinta la firma una persona, y no cualquiera: la
// misma regla que la biblioteca de conocimiento —`validar()` exige un firmante distinto del que
// extrajo—. Ningún trabajo lo cierra quien lo construyó.

import { AMBIGUEDADES_QUE_BLOQUEAN } from './control.mjs'

/** Los cinco estados. El orden es el de exigencia, y se usa para quedarse con el techo más bajo. */
export const CERTEZA = Object.freeze({
  BORRADOR_TECNICO: 'BORRADOR_TECNICO',
  INCOMPLETO: 'INCOMPLETO',
  REQUIERE_DEFINICION: 'REQUIERE_DEFINICION',
  COTIZABLE: 'COTIZABLE',
  VALIDADO: 'VALIDADO',
})

const ESCALERA = Object.freeze([CERTEZA.BORRADOR_TECNICO, CERTEZA.INCOMPLETO, CERTEZA.REQUIERE_DEFINICION, CERTEZA.COTIZABLE])

/**
 * LOS UMBRALES, TODOS JUNTOS Y TODOS DISCUTIBLES.
 *
 * `diasPrecio` es una CONVENCIÓN declarada, no un dato: nadie publica cuántos días vale un precio.
 * Se eligió 30 porque es el período de la paritaria y del IPC con el que después se reajusta, y se
 * reporta SIEMPRE junto a la fecha real del precio más viejo — para que la decisión no dependa de
 * creerle al umbral.
 */
export const UMBRAL = Object.freeze({
  cantidadesMinimas: 0.5,
  cantidades: 0.9,
  partidas: 0.9,
  economica: 0.95,
  composicion: 0.95,
  // `diasPrecio` es el corte de «viejo» y `plataEnPreciosViejos` cuánto de eso se tolera. Los dos son
  // CONVENCIONES declaradas, no datos: nadie publica cuántos días vale un precio de obra, y el
  // segundo no puede salir de una medición porque es una decisión de riesgo comercial. El dueño los
  // tiene que fijar; mientras tanto son 180 días y 10% del costo, y se reportan siempre con la
  // fracción real al lado para que el número se pueda discutir con evidencia.
  diasPrecio: 180,
  plataEnPreciosViejos: 0.10,
})

const frac = (n, d) => (d ? Math.round((n / d) * 1000) / 1000 : 0)
/** Días entre una fecha `YYYY-MM-DD` y hoy. `null` cuando la fecha no es una fecha: un `NaN`
 *  impreso como número hace que la regla de vigencia se lea como cumplida. PURA. */
const dias = (desde, hasta) => {
  const n = Math.round((hasta - new Date(`${desde}T00:00:00Z`)) / 86400000)
  return Number.isFinite(n) ? n : null
}

/**
 * LA PLATA QUE SE APOYA EN UN SUPUESTO OCULTO. PURA.
 *
 * Es el número que convierte «4 supuestos ocultos» en una decisión: mientras sean cuatro renglones
 * de un listado se postergan, y cuando son $ 4,1 M del precio no se postergan más. Se reparte el
 * subtotal de cada partida entre sus renglones en proporción a la cantidad, que es exactamente como
 * se armó el subtotal.
 */
export function plataEnSupuestos({ supuestosOcultos = [], cotizacion = null } = {}) {
  const afectados = new Set(supuestosOcultos.map((o) => String(o.elemento)))
  if (!cotizacion) return { pesos: null, partidas: [], porQue: 'sin cotización valorizada no se puede saber cuánta plata sostienen: el control no puede afirmar que sea cero' }
  const partidas = []
  let pesos = 0
  for (const p of cotizacion.partidas ?? []) {
    if (p.subtotal === null || !(p.cantidad > 0)) continue
    const suyos = (p.lineas ?? []).filter((l) => afectados.has(String(l.elemento)))
    if (!suyos.length) continue
    const cant = suyos.reduce((a, l) => a + Number(l.cantidad ?? 0), 0)
    const monto = Math.round(p.subtotal * (cant / p.cantidad) * 100) / 100
    pesos += monto
    partidas.push({ codigo: p.codigo, descripcion: p.descripcion, elementos: suyos.map((l) => l.elemento), monto })
  }
  pesos = Math.round(pesos * 100) / 100
  return {
    pesos,
    partidas: partidas.sort((a, b) => b.monto - a.monto),
    porQue: pesos ? `${partidas.length} partida(s) llevan adentro un número que la cita no respalda` : 'ningún supuesto oculto cae sobre una partida con precio',
  }
}

/**
 * CUÁNTA PLATA DE ESTA COTIZACIÓN SE APOYA EN PRECIOS VIEJOS. PURA.
 *
 * ═══ POR QUÉ NO ALCANZA CON EL PRECIO MÁS VIEJO ═══
 *
 * Medido el 28/08/2026 sobre la Base Maestra real: de 389 precios marcados vigentes, **112 tienen
 * más de cinco años** y sólo 83 tienen menos de seis meses. Con ese catálogo, un semáforo binario
 * sobre el insumo más antiguo queda en ROJO PARA SIEMPRE, y un control que siempre está en rojo se
 * mira una vez y después se ignora — deja de ser un control.
 *
 * Y al revés, el número solo engaña en la otra dirección: sobre Quattropani, «el precio más viejo
 * tiene 974 días» convivía con que esa línea pesa **$ 202 de $ 73.895** del unitario. Cierto como
 * dato, falso como conclusión.
 *
 * Lo que sí decide es CUÁNTA PLATA. Se reparte el subtotal de cada partida entre sus renglones en
 * proporción a lo que cada uno aporta al costo unitario, que es como se armó el subtotal.
 */
export function plataEnPreciosViejos(cotizacion, { hoy = new Date(), diasLimite = 180 } = {}) {
  if (!cotizacion) return { pesos: null, total: null, fraccion: null, partidas: [], porQue: 'sin cotización valorizada no se puede saber cuánta plata se apoya en precios viejos: el control no puede afirmar que sea cero' }
  const partidas = []
  let pesos = 0
  let total = 0
  let sinFecha = 0
  for (const p of cotizacion.partidas ?? []) {
    if (p.subtotal === null || !(p.subtotal > 0)) continue
    total += p.subtotal
    const lineas = p.composicion ?? []
    const aporte = (l) => Number(l.cantidad ?? 0) * Number(l.costoUnitario ?? 0) * (1 + Number(l.desperdicio ?? 0))
    const base = lineas.reduce((a, l) => a + aporte(l), 0)
    if (!(base > 0)) continue
    const viejas = lineas.filter((l) => {
      if (!l.fechaPrecio) { sinFecha += 1; return true } // sin fecha NO es «al día»: no se puede afirmar
      const d = dias(l.fechaPrecio, hoy)
      return d === null || d > diasLimite
    })
    if (!viejas.length) continue
    const monto = Math.round(p.subtotal * (viejas.reduce((a, l) => a + aporte(l), 0) / base) * 100) / 100
    pesos += monto
    partidas.push({ codigo: p.codigo, descripcion: p.descripcion, monto, lineas: viejas.length, de: lineas.length })
  }
  pesos = Math.round(pesos * 100) / 100
  total = Math.round(total * 100) / 100
  return {
    pesos, total, sinFecha,
    fraccion: total > 0 ? Math.round((pesos / total) * 10000) / 10000 : null,
    partidas: partidas.sort((a, b) => b.monto - a.monto),
    porQue: total > 0
      ? `$ ${pesos.toLocaleString('es-AR')} de $ ${total.toLocaleString('es-AR')} (${Math.round((pesos / total) * 1000) / 10}%) se apoya en precios de más de ${diasLimite} días${sinFecha ? `, y ${sinFecha} renglón(es) no tienen fecha` : ''}`
      : 'ninguna partida tiene subtotal: no hay plata sobre la que medir exposición',
  }
}

/** El precio más viejo que entra en la cotización, y cuántos días tiene. PURA. */
export function vigenciaDePrecios(cotizacion, hoy = new Date()) {
  const fechas = (cotizacion?.partidas ?? []).flatMap((p) => (p.composicion ?? []).map((l) => l.fechaPrecio)).filter(Boolean)
  if (!fechas.length) return { masViejo: null, dias: null, porQue: 'ninguna línea de composición trae fecha de precio: la vigencia no se puede afirmar ni negar' }
  const masViejo = fechas.sort()[0]
  const d = dias(masViejo, hoy)
  return {
    masViejo, dias: d,
    porQue: d === null
      ? `la fecha del precio más viejo («${masViejo}») no se puede interpretar como fecha: la vigencia no se puede afirmar ni negar`
      : `el precio más viejo que entra al total es del ${masViejo} (${d} días)`,
  }
}

/**
 * LAS ONCE MÉTRICAS OBSERVABLES. PURA — ninguna se estima, todas se cuentan.
 *
 * `cotizacion` es opcional: sin ella las cuatro económicas salen en `null` y eso NO se lee como
 * cero. Un control que informa cero cuando no pudo mirar es la falla que este repo ya pagó.
 */
export function metricas({ control = {}, items = null, cotizacion = null, proyecto = null, hoy = new Date() } = {}) {
  const cob = control.cobertura ?? {}
  const partidas = cotizacion?.partidas ?? []
  const conCosto = partidas.filter((p) => p.subtotal !== null)
  const conComposicion = partidas.filter((p) => (p.composicion ?? []).length > 0)
  const sup = plataEnSupuestos({ supuestosOcultos: control.supuestosOcultos ?? [], cotizacion })
  const vig = vigenciaDePrecios(cotizacion, hoy)
  const plataVieja = plataEnPreciosViejos(cotizacion, { hoy, diasLimite: UMBRAL.diasPrecio })
  return {
    elementos: { detectados: cob.detectados ?? 0, conCantidad: cob.conCantidad ?? 0, conPartida: cob.conPartida ?? 0, resueltos: cob.resueltos ?? 0 },
    coberturaCantidades: cob.coberturaComputo ?? 0,
    coberturaPartidas: cob.cobertura ?? 0,
    coberturaEconomica: partidas.length ? frac(conCosto.length, partidas.length) : null,
    coberturaComposicion: partidas.length ? frac(conComposicion.length, partidas.length) : null,
    costoDirecto: cotizacion?.costoDirecto ?? null,
    hh: cotizacion?.hh ?? null,
    partidasSinPrecio: cotizacion ? (cotizacion.sinCosto ?? []).length : null,
    supuestos: { ocultos: (control.supuestosOcultos ?? []).length, ...sup },
    ambiguedades: { total: (control.identidadesAmbiguas ?? []).length, bloqueantes: (control.ambiguedadesQueBloquean ?? []).length, tiposQueBloquean: AMBIGUEDADES_QUE_BLOQUEAN },
    conflictos: (control.conflictos ?? []).length,
    datosFaltantes: { huecos: (control.preguntas ?? []).length, decisiones: (control.decisiones ?? []).length, sueltas: (control.preguntasSueltas ?? []).length },
    fuentes: { clases: Object.keys(proyecto?.porClase ?? {}).length, hechos: (proyecto?.hechos ?? []).length, sinCitaLiteral: sinCitaLiteral(items) },
    vigencia: vig,
    plataVieja,
  }
}

/** Los elementos que tienen cantidad y NO tienen con qué volver al documento. `null` cuando no se
 *  pasaron los items: no poder mirar no es poder decir que no hay ninguno. PURA. */
export function sinCitaLiteral(items) {
  if (!Array.isArray(items)) return null
  return items.filter((i) => Number.isFinite(Number(i?.cantidad?.valor)) && !i?.evidencia?.textoLiteral).length
}

/**
 * LAS REGLAS. Cada una es una línea: qué exige, qué mira, y hasta dónde deja subir si falla.
 *
 * `tope` no es una penalización: es el estado más alto que la cotización puede alcanzar mientras esa
 * regla siga roja. El estado final es el tope más bajo de todas las rotas.
 */
export const REGLAS = Object.freeze([
  {
    clave: 'cantidades_minimas', tope: CERTEZA.BORRADOR_TECNICO,
    exige: `al menos ${UMBRAL.cantidadesMinimas * 100}% de los elementos detectados con cantidad`,
    pasa: (m) => m.coberturaCantidades >= UMBRAL.cantidadesMinimas,
    falta: (m) => `medir ${Math.ceil(UMBRAL.cantidadesMinimas * m.elementos.detectados) - m.elementos.conCantidad} elemento(s) más: hoy ${m.elementos.conCantidad} de ${m.elementos.detectados} tienen cantidad, y por debajo de la mitad esto es un relevamiento, no un cómputo`,
  },
  {
    clave: 'cantidades', tope: CERTEZA.INCOMPLETO,
    exige: `${UMBRAL.cantidades * 100}% de los elementos detectados con cantidad`,
    pasa: (m) => m.coberturaCantidades >= UMBRAL.cantidades,
    falta: (m) => `medir ${Math.ceil(UMBRAL.cantidades * m.elementos.detectados) - m.elementos.conCantidad} elemento(s) más para llegar al ${UMBRAL.cantidades * 100}% (hoy ${Math.round(m.coberturaCantidades * 100)}%)`,
  },
  {
    clave: 'partidas', tope: CERTEZA.INCOMPLETO,
    exige: `${UMBRAL.partidas * 100}% de los elementos detectados con cantidad Y con partida de la Base Maestra`,
    pasa: (m) => m.coberturaPartidas >= UMBRAL.partidas,
    falta: (m) => `mapear ${Math.ceil(UMBRAL.partidas * m.elementos.detectados) - m.elementos.resueltos} elemento(s) más a una partida (hoy ${Math.round(m.coberturaPartidas * 100)}%)`,
  },
  {
    clave: 'economica', tope: CERTEZA.INCOMPLETO,
    exige: `${UMBRAL.economica * 100}% de las partidas con costo completo`,
    pasa: (m) => m.coberturaEconomica !== null && m.coberturaEconomica >= UMBRAL.economica,
    falta: (m) => m.coberturaEconomica === null ? 'valorizar la cotización: sin partidas valorizadas no hay cobertura económica que medir' : `poner precio a ${m.partidasSinPrecio} partida(s): un solo recurso sin precio deja la partida entera sin subtotal`,
  },
  {
    clave: 'composicion', tope: CERTEZA.INCOMPLETO,
    exige: `${UMBRAL.composicion * 100}% de las partidas con análisis de precio cargado (de donde salen las HH)`,
    pasa: (m) => m.coberturaComposicion !== null && m.coberturaComposicion >= UMBRAL.composicion,
    falta: (m) => m.coberturaComposicion === null ? 'valorizar la cotización: sin composiciones no hay HH que informar' : `cargar el análisis de las partidas sin composición: sin APU no hay ni costo ni HH, y las HH del proyecto (${m.hh ?? '—'}) salen incompletas`,
  },
  {
    clave: 'fuentes', tope: CERTEZA.INCOMPLETO,
    exige: 'toda cantidad con un texto literal del documento que la sostenga',
    pasa: (m) => m.fuentes.sinCitaLiteral === 0,
    falta: (m) => m.fuentes.sinCitaLiteral === null ? 'pasar los items del cómputo al control: sin ellos no se puede afirmar que todas las cantidades sean citables' : `dar cita literal a ${m.fuentes.sinCitaLiteral} cantidad(es): una afirmación que no se puede releer no se puede defender`,
  },
  {
    clave: 'supuestos', tope: CERTEZA.REQUIERE_DEFINICION,
    exige: 'cero supuestos ocultos — y en particular cero pesos apoyados en un número que la cita no contiene',
    // Cero ocultos implica cero pesos apoyados en ellos; el monto se reporta para PRIORIZAR, no
    // para decidir. Si alguna vez el monto decidiera, un supuesto sobre una partida sin precio
    // pasaría a COTIZABLE por el solo hecho de que todavía no tiene precio.
    pasa: (m) => m.supuestos.ocultos === 0,
    falta: (m) => m.supuestos.pesos === null
      ? `confirmar o declarar ${m.supuestos.ocultos} supuesto(s) oculto(s); sin cotización valorizada no se puede decir cuánta plata sostienen`
      : `confirmar o declarar ${m.supuestos.ocultos} supuesto(s) oculto(s), que hoy sostienen $ ${m.supuestos.pesos.toLocaleString('es-AR')} del precio${m.supuestos.partidas.length ? ` (${m.supuestos.partidas.slice(0, 2).map((p) => p.codigo).join(', ')})` : ''}`,
  },
  {
    clave: 'conflictos', tope: CERTEZA.REQUIERE_DEFINICION,
    exige: 'cero conflictos entre documentos del proyecto',
    pasa: (m) => m.conflictos === 0,
    falta: (m) => `resolver ${m.conflictos} conflicto(s): dos documentos legítimos dicen cosas distintas y elegir uno en silencio inventa el resultado de una discusión que no ocurrió`,
  },
  {
    clave: 'ambiguedades', tope: CERTEZA.REQUIERE_DEFINICION,
    exige: 'cero piezas cuya medida o cantidad no esté determinada',
    pasa: (m) => m.ambiguedades.bloqueantes === 0,
    falta: (m) => `confirmar ${m.ambiguedades.bloqueantes} pieza(s) donde dos lecturas se contradicen (${m.ambiguedades.tiposQueBloquean.join(' / ')})`,
  },
  {
    clave: 'decisiones', tope: CERTEZA.REQUIERE_DEFINICION,
    exige: 'cero decisiones abiertas de alcance o de proyecto',
    pasa: (m) => m.datosFaltantes.decisiones === 0 && m.datosFaltantes.sueltas === 0,
    falta: (m) => `contestar ${m.datosFaltantes.decisiones} decisión(es) y ${m.datosFaltantes.sueltas} pregunta(s) suelta(s), que hoy dejan ${m.datosFaltantes.huecos} hueco(s) abiertos`,
  },
  {
    clave: 'vigencia', tope: CERTEZA.REQUIERE_DEFINICION,
    // La regla mira la PLATA EXPUESTA, no el insumo más viejo. Con el catálogo real —112 de 389
    // precios con más de cinco años— la versión binaria quedaba en rojo para siempre, y un control
    // que siempre está en rojo se mira una vez y después se ignora.
    exige: `menos del ${UMBRAL.plataEnPreciosViejos * 100}% del costo apoyado en precios de más de ${UMBRAL.diasPrecio} días`,
    pasa: (m) => m.plataVieja.fraccion !== null && m.plataVieja.fraccion < UMBRAL.plataEnPreciosViejos,
    falta: (m) => (m.plataVieja.fraccion === null
      ? 'valorizar la cotización: sin subtotales no se puede medir cuánta plata se apoya en precios viejos'
      : `re-preciar antes de mandarla: ${m.plataVieja.porQue}${m.vigencia.masViejo ? ` · el más viejo es del ${m.vigencia.masViejo} (${m.vigencia.dias} días)` : ''}`),
  },
])

/** El techo más bajo de las reglas rotas. PURA. */
const techo = (rotas) => rotas.reduce((peor, r) => (ESCALERA.indexOf(r.tope) < ESCALERA.indexOf(peor) ? r.tope : peor), CERTEZA.COTIZABLE)

/**
 * EL ESTADO DE CERTEZA. PURA.
 *
 * `firma` es lo único que puede llevar a VALIDADO, y sólo cuando la cotización ya es COTIZABLE por
 * medición: firmar lo que está incompleto no lo completa. Y el firmante no puede ser quien la
 * produjo — ningún trabajo lo cierra quien lo construyó.
 */
export function certeza({ control = {}, items = null, cotizacion = null, proyecto = null, firma = null, producidoPor = 'xsas', hoy = new Date() } = {}) {
  const m = metricas({ control, items, cotizacion, proyecto, hoy })
  const evaluadas = REGLAS.map((r) => ({ clave: r.clave, exige: r.exige, tope: r.tope, pasa: Boolean(r.pasa(m)) }))
  const rotas = REGLAS.filter((r) => !r.pasa(m))
  const porMedicion = techo(rotas)
  const val = validacionDe({ porMedicion, firma, producidoPor })
  return {
    estado: val.estado,
    porMedicion,
    metricas: m,
    reglas: evaluadas,
    queFalta: rotas.map((r) => ({ regla: r.clave, exige: r.exige, tope: r.tope, falta: r.falta(m) })),
    validacion: val.validacion,
    paraSubir: paraSubir(porMedicion, rotas, m, val),
    resumen: `${val.estado} · cantidades ${Math.round(m.coberturaCantidades * 100)}% · partidas ${Math.round(m.coberturaPartidas * 100)}% · económica ${m.coberturaEconomica === null ? '—' : `${Math.round(m.coberturaEconomica * 100)}%`} · supuestos ${m.supuestos.ocultos} (${m.supuestos.pesos === null ? 'plata desconocida' : `$ ${m.supuestos.pesos.toLocaleString('es-AR')}`}) · conflictos ${m.conflictos} · ambigüedades que bloquean ${m.ambiguedades.bloqueantes} · ${rotas.length} regla(s) rotas de ${REGLAS.length}`,
  }
}

/** VALIDADO se firma; no se calcula. PURA — y tira si el firmante es quien produjo la cotización. */
export function validacionDe({ porMedicion, firma = null, producidoPor = 'xsas' } = {}) {
  if (!firma?.firmante) return { estado: porMedicion, validacion: null }
  if (firma.firmante === producidoPor) throw new Error(`«${firma.firmante}» produjo esta cotización y no puede firmarla: ningún trabajo lo cierra quien lo construyó`)
  if (porMedicion !== CERTEZA.COTIZABLE) {
    return { estado: porMedicion, validacion: { firmante: firma.firmante, aceptada: false, porQue: `la firma no se aplica: la cotización está ${porMedicion} por medición, y firmar lo que está incompleto no lo completa` } }
  }
  return { estado: CERTEZA.VALIDADO, validacion: { firmante: firma.firmante, cuando: firma.cuando ?? null, porQue: firma.porQue ?? null, aceptada: true } }
}

/** Qué falta EXACTAMENTE para el escalón siguiente. Un estado que no dice esto no sirve. PURA. */
function paraSubir(porMedicion, rotas, m, val) {
  if (val.estado === CERTEZA.VALIDADO) return { siguiente: null, falta: [], porQue: 'no hay escalón más arriba' }
  if (porMedicion === CERTEZA.COTIZABLE) {
    return { siguiente: CERTEZA.VALIDADO, falta: ['la firma de una persona distinta de quien la produjo'], porQue: 'las once reglas medibles pasan; lo que falta no lo puede hacer el código' }
  }
  const i = ESCALERA.indexOf(porMedicion)
  const siguiente = ESCALERA[i + 1]
  const bloquean = rotas.filter((r) => r.tope === porMedicion)
  return {
    siguiente,
    falta: bloquean.map((r) => r.falta(m)),
    porQue: `${bloquean.length} regla(s) con techo ${porMedicion} están rotas; las otras ${rotas.length - bloquean.length} también hay que arreglarlas, pero no son las que frenan este escalón`,
  }
}
