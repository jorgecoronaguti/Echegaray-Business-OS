// EL MOTOR DE CRONOGRAMA — pases hacia adelante y hacia atrás, holgura y camino crítico.
//
// Trabaja sobre ÍNDICES DE DÍA HÁBIL, no sobre fechas: el día 0 es el primer día trabajado de la
// obra. Los feriados y los sábados los resolvió `CalendarioObra` antes de entrar acá, así que la
// aritmética de este módulo es entera y exacta. Al final se vuelve a fechas.
//
// No es Primavera. Resuelve lo que una constructora PyME necesita de verdad:
//
//   · las cuatro relaciones (FS, SS, FF, SF) con demora, positiva o negativa;
//   · la fecha más temprana posible de cada actividad respetando a sus predecesoras;
//   · cuánto se puede atrasar cada una sin mover el fin de obra (holgura);
//   · cuáles no tienen holgura — el camino crítico;
//   · qué se arrastra si alguien mueve una, y en cuánto cambia el fin de obra.
//
// ═══ LO QUE NO INVENTA ═══
//
// Una actividad sin duración NO se planifica: queda con `sinPlan: true` y no arrastra a nadie.
// Ponerle un día para que el grafo cierre sería fabricar un plazo. Y una actividad con fecha de
// inicio impuesta a mano manda sobre el cálculo: es una restricción del que planifica, no un error
// a corregir.

/** Las cuatro relaciones, expresadas como la restricción que imponen sobre el destino. */
const RESTRICCION = {
  // el destino no puede empezar antes de que el origen termine (+ demora)
  FS: (o, lag) => ({ inicioMin: o.fin + 1 + lag }),
  // el destino no puede empezar antes de que el origen empiece (+ demora)
  SS: (o, lag) => ({ inicioMin: o.inicio + lag }),
  // el destino no puede terminar antes de que el origen termine (+ demora)
  FF: (o, lag) => ({ finMin: o.fin + lag }),
  // el destino no puede terminar antes de que el origen empiece (+ demora)
  SF: (o, lag) => ({ finMin: o.inicio + lag }),
}

export const TIPOS = Object.keys(RESTRICCION)

/**
 * Ordena las actividades de modo que ninguna aparezca antes que sus predecesoras.
 * Lanza si hay un ciclo: la base ya lo impide, pero este módulo también corre sobre datos armados
 * a mano y un ciclo silencioso acá sería un cronograma que no converge sin decir por qué.
 */
export function ordenTopologico(actividades, dependencias) {
  const grado = new Map(actividades.map((a) => [a.id, 0]))
  const salidas = new Map(actividades.map((a) => [a.id, []]))
  for (const d of dependencias) {
    if (!grado.has(d.origen) || !grado.has(d.destino)) continue
    grado.set(d.destino, grado.get(d.destino) + 1)
    salidas.get(d.origen).push(d.destino)
  }
  const cola = actividades.filter((a) => grado.get(a.id) === 0).map((a) => a.id)
  const orden = []
  while (cola.length) {
    const id = cola.shift()
    orden.push(id)
    for (const s of salidas.get(id)) {
      grado.set(s, grado.get(s) - 1)
      if (grado.get(s) === 0) cola.push(s)
    }
  }
  if (orden.length !== actividades.length) {
    const enCiclo = actividades.filter((a) => !orden.includes(a.id)).map((a) => a.nombre || a.id)
    throw new Error(`hay un ciclo de dependencias entre: ${enCiclo.join(', ')}`)
  }
  return orden
}

/**
 * Calcula el cronograma.
 *
 * @param {Array} actividades  [{ id, nombre?, duracion, inicioFijo?, diasTecnicos? }]
 *        `duracion` en días hábiles. null/undefined = sin plan. `inicioFijo` es un índice.
 * @param {Array} dependencias [{ origen, destino, tipo, lag }]
 * @returns {{ actividades: Map, finObra: number|null, criticas: string[], sinPlan: string[] }}
 */
export function calcular(actividades, dependencias = []) {
  const porId = new Map(actividades.map((a) => [a.id, a]))
  const entrantes = new Map(actividades.map((a) => [a.id, []]))
  const salientes = new Map(actividades.map((a) => [a.id, []]))
  for (const d of dependencias) {
    if (!porId.has(d.origen) || !porId.has(d.destino)) continue
    const rel = { ...d, tipo: RESTRICCION[d.tipo] ? d.tipo : 'FS', lag: Number(d.lag ?? 0) }
    entrantes.get(d.destino).push(rel)
    salientes.get(d.origen).push(rel)
  }

  const orden = ordenTopologico(actividades, dependencias)
  const r = new Map()
  const sinPlan = []

  // ── pase hacia adelante: lo más temprano que cada una puede pasar ──
  for (const id of orden) {
    const a = porId.get(id)
    const dur = a.duracion == null ? null : Math.max(0, Number(a.duracion))
    if (dur == null) {
      sinPlan.push(id)
      r.set(id, { id, inicio: null, fin: null, duracion: null, sinPlan: true })
      continue
    }
    const tecnicos = Math.max(0, Number(a.diasTecnicos ?? 0))
    const largo = Math.max(1, dur + tecnicos)

    let inicioMin = 0
    let finMin = null
    for (const d of entrantes.get(id)) {
      const o = r.get(d.origen)
      if (!o || o.sinPlan) continue // una predecesora sin plan no arrastra: no se inventa su fin
      const c = RESTRICCION[d.tipo](o, d.lag)
      if (c.inicioMin != null) inicioMin = Math.max(inicioMin, c.inicioMin)
      if (c.finMin != null) finMin = finMin == null ? c.finMin : Math.max(finMin, c.finMin)
    }
    if (finMin != null) inicioMin = Math.max(inicioMin, finMin - largo + 1)
    if (a.inicioFijo != null) inicioMin = Math.max(inicioMin, Number(a.inicioFijo))

    const inicio = Math.max(0, inicioMin)
    r.set(id, { id, inicio, fin: inicio + largo - 1, duracion: largo, sinPlan: false })
  }

  const conPlan = [...r.values()].filter((x) => !x.sinPlan)
  const finObra = conPlan.length ? Math.max(...conPlan.map((x) => x.fin)) : null

  // ── pase hacia atrás: lo más tarde que cada una puede pasar sin mover el fin de obra ──
  for (const id of [...orden].reverse()) {
    const x = r.get(id)
    if (x.sinPlan) continue
    let finTarde = finObra
    for (const d of salientes.get(id)) {
      const s = r.get(d.destino)
      if (!s || s.sinPlan) continue
      // el límite que la sucesora le impone al origen es el espejo de la restricción de ida
      if (d.tipo === 'FS') finTarde = Math.min(finTarde, s.finTarde - s.duracion - d.lag)
      else if (d.tipo === 'SS') finTarde = Math.min(finTarde, s.finTarde - s.duracion - d.lag + x.duracion)
      else if (d.tipo === 'FF') finTarde = Math.min(finTarde, s.finTarde - d.lag)
      else if (d.tipo === 'SF') finTarde = Math.min(finTarde, s.finTarde - d.lag + x.duracion)
    }
    x.finTarde = finTarde
    x.inicioTarde = finTarde - x.duracion + 1
    x.holgura = x.finTarde - x.fin
    x.critica = x.holgura <= 0
  }

  return {
    actividades: r,
    finObra,
    criticas: [...r.values()].filter((x) => x.critica).map((x) => x.id),
    sinPlan,
  }
}

/**
 * Qué pasa si alguien mueve una actividad `delta` días.
 *
 * Devuelve QUÉ se arrastró y en cuánto, y cómo queda el fin de obra. La pantalla lo muestra antes
 * de confirmar: mover una actividad y enterarse después de que corrió la obra tres semanas es
 * exactamente lo que el contrato pide evitar.
 */
export function simularMovimiento(actividades, dependencias, id, delta) {
  const antes = calcular(actividades, dependencias)
  const base = antes.actividades.get(id)
  if (!base || base.sinPlan) {
    return {
      arrastradas: [], movimientos: [],
      finObraAntes: antes.finObra, finObraDespues: antes.finObra, sinPlan: true,
    }
  }
  const movidas = actividades.map((a) =>
    a.id === id ? { ...a, inicioFijo: base.inicio + Number(delta) } : a)
  const despues = calcular(movidas, dependencias)

  // `movimientos` incluye a la MOVIDA y trae las posiciones NUEVAS, en índices de día hábil. Es lo
  // que hay que escribir para aplicar el arrastre, y sale de este mismo cálculo a propósito: si la
  // simulación que se muestra y la escritura que se guarda salieran de dos lugares, la pantalla
  // podría prometer una cosa y la base guardar otra. La movida va SIEMPRE aunque su delta quede en
  // cero: `inicioFijo` es un piso, no un imán, y una predecesora puede frenarla — el número honesto
  // de cuánto se movió de verdad es éste, no el que pidió el gesto.
  const movimientos = []
  for (const [otroId, d] of despues.actividades) {
    if (d.sinPlan) continue
    const a = antes.actividades.get(otroId)
    if (!a || a.sinPlan) continue
    if (otroId !== id && d.inicio === a.inicio) continue
    movimientos.push({ id: otroId, dias: d.inicio - a.inicio, inicio: d.inicio, fin: d.fin })
  }
  const arrastradas = movimientos
    .filter((m) => m.id !== id)
    .map((m) => ({ id: m.id, dias: m.dias }))

  return {
    arrastradas,
    movimientos,
    finObraAntes: antes.finObra,
    finObraDespues: despues.finObra,
    corrimientoFinObra: (despues.finObra ?? 0) - (antes.finObra ?? 0),
    sinPlan: false,
  }
}

/**
 * Conflictos de recurso: la misma cuadrilla en dos actividades que se pisan en el tiempo.
 * No los resuelve — los nombra. Resolverlos es una decisión de obra, no una regla.
 */
export function conflictosDeCuadrilla(actividades, calculo) {
  const conflictos = []
  const conCuadrilla = actividades.filter((a) => a.cuadrillaId && !calculo.actividades.get(a.id)?.sinPlan)
  for (let i = 0; i < conCuadrilla.length; i++) {
    for (let j = i + 1; j < conCuadrilla.length; j++) {
      const a = conCuadrilla[i]
      const b = conCuadrilla[j]
      if (a.cuadrillaId !== b.cuadrillaId) continue
      const x = calculo.actividades.get(a.id)
      const y = calculo.actividades.get(b.id)
      if (x.inicio <= y.fin && y.inicio <= x.fin) {
        conflictos.push({
          cuadrillaId: a.cuadrillaId,
          actividades: [a.id, b.id],
          desde: Math.max(x.inicio, y.inicio),
          hasta: Math.min(x.fin, y.fin),
        })
      }
    }
  }
  return conflictos
}
