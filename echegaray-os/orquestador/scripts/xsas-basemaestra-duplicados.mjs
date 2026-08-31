// ¿SON LA MISMA PARTIDA? — EL VEREDICTO SE ARGUMENTA, NO SE ADIVINA. PURO: no toca la base.
//
// ═══ POR QUÉ EXISTE ═══
//
// La Base Maestra tiene 205 tareas que entraron de una sola planilla. Hay pares que se parecen, y
// «se parecen» es exactamente la palabra que no sirve para decidir: **SIMILAR ≠ MISMA PARTIDA**.
// Fusionar dos tareas por parecido borra un análisis que alguien cargó y deja sin destino a las
// cotizaciones que lo referencian. Este módulo no fusiona nada: COMPARA eje por eje y publica el
// veredicto con la evidencia que lo sostiene, para que el merge —si alguna vez ocurre— tenga de
// dónde agarrarse.
//
// ═══ CÓMO SE ELIGEN LOS CANDIDATOS, Y POR QUÉ NO POR PARECIDO DE NOMBRE ═══
//
// Dos criterios DUROS, los dos verificables:
//
//   NOMBRE      el nombre normalizado (sin tildes, sin puntuación, sin espacios) coincide
//   COMPOSICION la huella `recurso@cantidad` de la composición vigente coincide byte a byte
//
// Se probó un tercero —el mismo SET de recursos, ignorando las cantidades— y se descartó con el
// número en la mano: sobre las 205 tareas produce 18 grupos, uno de ellos de OCHO tareas, porque
// todo lo que lleva `OFICIAL + AYUDANTE + CARGA SOCIAL OF + CARGA SOCIAL AY` cae en el mismo grupo.
// Un criterio que agrupa una excavación con un techo no está detectando duplicados: está detectando
// que las dos las hacen personas. Por eso la huella EXIGE las cantidades.
//
// Tampoco hay distancia de edición ni umbral de parecido. Un umbral es un número que nadie puede
// defender y que decide plata: con 0,80 entran dos pares, con 0,75 entran nueve. Los dos criterios
// de arriba se pueden explicar en una oración y se reproducen con un `group by`.
//
// ═══ LOS CINCO VEREDICTOS ═══
//
//   DUPLICADO_CONFIRMADO  misma unidad, mismo nombre normalizado y la MISMA composición
//   VARIANTE              la misma tarea con otro sistema/material: mismo nombre base, distinta receta
//   RELACIONADO           misma familia y distinto alcance — no se fusionan, se distinguen mejor
//   NO_DUPLICADO          hay un hecho que los separa (la unidad, la receta, la escala)
//   FALTA_DATO            todo lo medible coincide y lo único que los separa es una declaración que
//                         nadie hizo. NO es un empate: es una pregunta con destinatario.
//
// FALTA_DATO es el veredicto que más cuesta escribir y el que más vale. Decir «duplicado» cuando lo
// único que se sabe es que los números coinciden convierte una sospecha en una orden de borrado.

/** La unidad manda y no se interpreta: `M2` y `ML` no son la misma unidad aunque el nombre coincida. */
export const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

/** El nombre sin NADA que no sea letra o dígito. Es la clave que usa el criterio NOMBRE. */
export const claveNombre = (s) => norm(s).replace(/ /g, '')

/** La huella de una composición: `recurso@cantidad`, ordenada. Dos huellas iguales son la MISMA
 *  receta — mismos insumos y mismas cantidades— y eso sí es un hecho, no un parecido. */
export function huellaComposicion(lineas = []) {
  if (!lineas.length) return 'VACIA'
  return lineas
    .map((l) => `${l.recurso}@${Number(l.cantidad)}`)
    .sort()
    .join(',')
}

/** Sólo el SET de recursos. Se calcula para poder MEDIR el solapamiento de familia, nunca para
 *  decidir un duplicado: ver el encabezado, agrupa ocho tareas que no tienen nada que ver. */
export const setRecursos = (lineas = []) => new Set(lineas.map((l) => String(l.recurso)))

/** Jaccard sobre los recursos. Es una MEDIDA que se publica, no un umbral que decide: el veredicto
 *  no depende de ella salvo en un punto declarado —separar RELACIONADO de NO_DUPLICADO— y ahí el
 *  corte está en 0,50, que es «comparten más de lo que no comparten». */
export function solapamiento(a, b) {
  const A = setRecursos(a)
  const B = setRecursos(b)
  if (A.size === 0 && B.size === 0) return null
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? null : Math.round((inter / union) * 10000) / 10000
}

export const CORTE_FAMILIA = 0.5

/** Un nombre contiene al otro cuando el más largo empieza por el más corto en TOKENS completos.
 *  «EXCAVACIONES DE BASES Y ZANJAS» contiene a «EXCAVACIONES»; «CAMION REGADOR» no contiene a
 *  «COMPACTACION DE SUELO». La distinción importa: en el primer caso los dos hablan del mismo
 *  trabajo con distinto detalle, en el segundo no hablan de lo mismo en absoluto. */
export function unoContieneAlOtro(nombreA, nombreB) {
  const a = norm(nombreA).split(' ').filter(Boolean)
  const b = norm(nombreB).split(' ').filter(Boolean)
  if (!a.length || !b.length) return false
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a]
  return corto.every((t, i) => largo[i] === t)
}

const tol = (x, y, rel = 0.001) => {
  if (x === null || x === undefined || y === null || y === undefined) return null
  const a = Number(x)
  const b = Number(y)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a === b) return true
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * rel
}

/**
 * LOS EJES QUE SE COMPARAN. Cada uno vale IGUAL, DISTINTO o SIN_DATO — nunca se rellena.
 *
 * `SIN_DATO` no cuenta ni a favor ni en contra: un eje que no se pudo mirar no puede decir «son
 * iguales». Es la trampa que este repo ya pagó con los seis faltantes falsos.
 */
export function ejes(a, b) {
  const eje = (v) => (v === null ? 'SIN_DATO' : v ? 'IGUAL' : 'DISTINTO')
  const huellaA = huellaComposicion(a.composicion)
  const huellaB = huellaComposicion(b.composicion)
  const sinReceta = huellaA === 'VACIA' || huellaB === 'VACIA'
  return {
    unidad: eje(norm(a.unidad) === norm(b.unidad)),
    nombre: eje(claveNombre(a.nombre) === claveNombre(b.nombre)),
    composicion: sinReceta ? 'SIN_DATO' : eje(huellaA === huellaB),
    recursos: sinReceta ? 'SIN_DATO' : eje([...setRecursos(a.composicion)].sort().join() === [...setRecursos(b.composicion)].sort().join()),
    costoUnitario: eje(tol(a.costoUnitario, b.costoUnitario)),
    hsUnitarias: eje(tol(a.hsUnitarias, b.hsUnitarias)),
    // El contexto es lo que dice PARA QUIÉN se cargó: `descripcion` trae «ARCOR» en las 30 tareas
    // que entraron de ese presupuesto. Dos tareas de obras distintas no son la misma tarea aunque
    // se llamen igual.
    contexto: eje(norm(a.descripcion ?? '') === norm(b.descripcion ?? '')),
    solapamientoRecursos: solapamiento(a.composicion, b.composicion),
    contencionDeNombre: unoContieneAlOtro(a.nombre, b.nombre),
  }
}

/**
 * EL VEREDICTO. PURA.
 *
 * El orden de las reglas no es cosmético: la primera que dispara gana, y la primera de todas es la
 * unidad. Un M2 y un ML no son la misma partida ni aunque compartan el nombre, la receta y el
 * precio — multiplicar por la cantidad equivocada es exactamente el error que no se puede permitir.
 */
export function veredicto(a, b) {
  const e = ejes(a, b)
  const par = { a: a.codigo, b: b.codigo, ejes: e }

  if (e.unidad === 'DISTINTO') {
    return { ...par, veredicto: 'NO_DUPLICADO', regla: 'UNIDAD',
      porQue: `«${a.codigo}» se mide en ${a.unidad} y «${b.codigo}» en ${b.unidad}: fusionarlos haría que una cantidad se multiplique por el precio de otra magnitud`,
      fusionable: false }
  }

  if (e.composicion === 'SIN_DATO') {
    return { ...par, veredicto: 'FALTA_DATO', regla: 'SIN_COMPOSICION',
      porQue: 'al menos una de las dos no tiene composición cargada: sin receta no hay con qué comparar, y «vacía» no es «igual»',
      fusionable: false, preguntaPara: 'quien cargue la Base Maestra' }
  }

  if (e.nombre === 'IGUAL' && e.composicion === 'IGUAL') {
    return { ...par, veredicto: 'DUPLICADO_CONFIRMADO', regla: 'NOMBRE_Y_RECETA',
      porQue: `mismo nombre normalizado, misma unidad (${a.unidad}) y la misma composición línea por línea: no queda ningún hecho que los separe`,
      fusionable: true }
  }

  if (e.nombre === 'IGUAL' && e.composicion === 'DISTINTO') {
    const familia = (e.solapamientoRecursos ?? 0) >= CORTE_FAMILIA
    return { ...par, veredicto: familia ? 'RELACIONADO' : 'NO_DUPLICADO', regla: 'NOMBRE_IGUAL_RECETA_DISTINTA',
      porQue: `el nombre coincide y la receta no (solapamiento de recursos ${e.solapamientoRecursos}): ${familia
        ? 'misma familia con distinto alcance — el nombre es el que miente, no los números'
        : 'no comparten ni la mitad de los insumos'}`,
      fusionable: false,
      accion: 'el nombre no distingue dos partidas que cuestan distinto: hay que renombrarlas, no fusionarlas' }
  }

  // Nombres distintos y MISMA receta. Acá se separan los dos casos que parecen uno solo.
  if (e.composicion === 'IGUAL') {
    if (e.contencionDeNombre) {
      return { ...par, veredicto: 'FALTA_DATO', regla: 'RECETA_IGUAL_ALCANCE_NO_DECLARADO',
        porQue: `todo lo medible coincide —unidad ${a.unidad}, receta idéntica, costo y HH iguales— y lo único que los separa es el alcance que declara el nombre: «${a.nombre}» vs «${b.nombre}». Nadie escribió qué cubre el más corto`,
        fusionable: false,
        preguntaPara: 'el dueño',
        pregunta: `¿«${[a, b].sort((x, y) => norm(x.nombre).length - norm(y.nombre).length)[0].nombre}» cubre exactamente el mismo trabajo que «${[a, b].sort((x, y) => norm(y.nombre).length - norm(x.nombre).length)[0].nombre}», o se cargó para otra cosa?` }
    }
    return { ...par, veredicto: 'NO_DUPLICADO', regla: 'RECETA_COPIADA',
      porQue: `«${a.nombre}» y «${b.nombre}» no hablan del mismo trabajo y sin embargo comparten la composición byte a byte: la receta de una fue copiada de la otra y no se cambió`,
      fusionable: false,
      hallazgo: `la composición de «${b.nombre}» (${b.codigo}) está hecha con el recurso de «${a.nombre}»: el costo que publica no es el suyo` }
  }

  // Nombres distintos y recetas distintas: no fue candidato por ninguno de los dos criterios duros.
  return { ...par, veredicto: 'NO_DUPLICADO', regla: 'NADA_EN_COMUN',
    porQue: 'ni el nombre ni la receta coinciden', fusionable: false }
}

/**
 * LOS PARES CANDIDATOS. PURA — recibe las fichas ya leídas, no consulta nada.
 *
 * Devuelve cada par UNA sola vez, ordenado por código, con qué criterio lo trajo. Un par que
 * dispara los dos criterios aparece una vez con los dos.
 */
export function paresCandidatos(fichas = []) {
  const porNombre = new Map()
  const porHuella = new Map()
  for (const f of fichas) {
    const kn = claveNombre(f.nombre)
    const kh = huellaComposicion(f.composicion)
    if (kn) porNombre.set(kn, [...(porNombre.get(kn) ?? []), f])
    if (kh !== 'VACIA') porHuella.set(kh, [...(porHuella.get(kh) ?? []), f])
  }
  const pares = new Map()
  const anotar = (grupo, criterio) => {
    for (const g of grupo.values()) {
      if (g.length < 2) continue
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          const [x, y] = [g[i], g[j]].sort((p, q) => (p.codigo < q.codigo ? -1 : 1))
          const k = `${x.codigo}|${y.codigo}`
          const previo = pares.get(k) ?? { a: x, b: y, criterios: [] }
          if (!previo.criterios.includes(criterio)) previo.criterios.push(criterio)
          pares.set(k, previo)
        }
      }
    }
  }
  anotar(porNombre, 'NOMBRE')
  anotar(porHuella, 'COMPOSICION')
  return [...pares.values()].sort((p, q) => (p.a.codigo < q.a.codigo ? -1 : p.a.codigo > q.a.codigo ? 1 : p.b.codigo < q.b.codigo ? -1 : 1))
}

/** El cuadro completo: candidatos + veredicto de cada uno. PURA. */
export const auditarDuplicados = (fichas = []) =>
  paresCandidatos(fichas).map((p) => ({ criterios: p.criterios, ...veredicto(p.a, p.b) }))

/**
 * EL PLAN DE FUSIÓN — Y SU REVERSA, EN EL MISMO OBJETO. PURA: no ejecuta nada.
 *
 * Se NIEGA a producir plan si el veredicto no es DUPLICADO_CONFIRMADO. No es una validación
 * defensiva: es la única barrera entre «se parecen» y «se borró un análisis». El absorbido es
 * siempre el que MENOS se usa; a igual uso, el de código mayor, para que la corrida sea repetible.
 *
 * La reversa no se calcula después: se guarda ANTES, con el estado exacto que hay que restaurar.
 * Una fusión cuya reversa se deduce a posteriori no es reversible, es una esperanza.
 */
export function planDeFusion(v, a, b) {
  if (v?.veredicto !== 'DUPLICADO_CONFIRMADO') {
    return { ok: false, porQue: `el veredicto es ${v?.veredicto ?? 'ninguno'} y sólo se fusiona DUPLICADO_CONFIRMADO: «${v?.porQue ?? 'sin argumento'}»` }
  }
  const uso = (f) => (f.usos?.cotizaciones ?? 0) + (f.usos?.actividades ?? 0) + (f.usos?.rendimientos ?? 0)
  const [sobrevive, absorbido] = uso(a) === uso(b)
    ? (a.codigo < b.codigo ? [a, b] : [b, a])
    : (uso(a) > uso(b) ? [a, b] : [b, a])
  return {
    ok: true,
    sobrevive: sobrevive.codigo,
    absorbido: absorbido.codigo,
    porQue: `«${sobrevive.codigo}» sobrevive porque ${uso(sobrevive) === uso(absorbido)
      ? `los dos se usan lo mismo (${uso(a)} referencias) y su código es menor`
      : `se usa ${uso(sobrevive)} veces contra ${uso(absorbido)}`}`,
    // Qué se hace: NADA se borra. La tarea absorbida se desactiva y se le cuelga el puntero.
    aplicar: [
      { tabla: 'tarea_tipo', codigo: absorbido.codigo, set: { activo: false } },
      { tabla: 'analisis', tarea: absorbido.codigo, set: { vigente: false } },
    ],
    // El estado previo, capturado ANTES de tocar nada.
    deshacer: [
      { tabla: 'tarea_tipo', codigo: absorbido.codigo, set: { activo: absorbido.activo ?? true } },
      { tabla: 'analisis', tarea: absorbido.codigo, set: { vigente: true } },
    ],
    evidencia: v,
  }
}
