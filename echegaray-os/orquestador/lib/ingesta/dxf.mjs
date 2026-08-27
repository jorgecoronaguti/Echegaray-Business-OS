// LEER UN DXF SIN DEPENDER DE NADA. Puro, determinístico, 0 tokens, 0 dependencias.
//
// ═══ POR QUÉ UN PARSER PROPIO Y NO UNA BIBLIOTECA ═══
//
// El DXF no es un formato binario ni comprimido: es una lista de pares (código, valor), una línea
// cada uno, en texto plano. Leer LINE, LWPOLYLINE, CIRCLE, ARC, TEXT e INSERT es medio kilo de
// código con reglas que se pueden leer. A cambio no hay que instalar nada —y en este repo instalar
// algo en un worktree está prohibido—, no hay superficie de dependencia y el resultado es el mismo
// hoy y dentro de tres años.
//
// ═══ QUÉ CAMBIA TENER EL CAD ═══
//
// Un PDF de plano hay que MIRARLO: la cota vale por dónde está dibujada, y eso es visión y es cara.
// Un DXF se MIDE: la longitud de una correa es la distancia entre sus dos extremos, con quince
// decimales y sin modelo. Y las repeticiones —el problema más caro de computar un plano— dejan de
// ser un conteo de símbolos y pasan a ser un `group by` sobre los INSERT.
//
// ═══ LO QUE ESTE PARSER NO HACE, Y ESTÁ BIEN ═══
//
// No resuelve SPLINE, no aplica transformaciones anidadas de bloque dentro de bloque, no interpreta
// HATCH como superficie y no lee DIMENSION como valor medido (lee su texto). Cada una de esas cosas
// sale DECLARADA en `sinSoporte` en vez de salir mal: un parser que devuelve una longitud incompleta
// sin avisar produce un cómputo que parece completo.

/** Las unidades de `$INSUNITS`. Un DXF sin unidad declarada NO se asume en metros: se declara. */
export const INSUNITS = Object.freeze({
  0: null, 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 8: 'uin', 9: 'mil', 10: 'yd', 11: 'A', 12: 'nm', 13: 'um', 14: 'dm', 15: 'dam', 16: 'hm', 17: 'Gm',
})

/** Cuánto vale una unidad de dibujo en metros. `null` cuando no se puede saber — y entonces las
 *  longitudes salen en unidades de dibujo, dichas como tales. */
export const A_METROS = Object.freeze({ mm: 0.001, cm: 0.01, dm: 0.1, m: 1, dam: 10, hm: 100, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144 })

/** Los pares (código, valor) de un DXF. El formato pone el código en una línea y el valor en la
 *  siguiente, y esa es toda la gramática. PURA. */
export function pares(texto) {
  const lineas = String(texto ?? '').split(/\r\n|\r|\n/)
  const salida = []
  for (let i = 0; i + 1 < lineas.length; i += 2) {
    const codigo = Number(lineas[i].trim())
    if (!Number.isFinite(codigo)) continue
    salida.push([codigo, lineas[i + 1]])
  }
  return salida
}

const num = (v) => {
  const n = Number(String(v ?? '').trim())
  return Number.isFinite(n) ? n : null
}

/** Los códigos que describen geometría y que se guardan tal cual en la entidad.
 *  El 90 se llama `cantidadVertices` y NO `vertices` a propósito: `vertices` es el array que se va
 *  acumulando con los 10/20, y pisarlo con el número declarado deja la entidad sin geometría. */
const CAMPO = Object.freeze({
  8: 'capa', 2: 'nombre', 1: 'texto', 3: 'textoExtra', 6: 'tipoLinea', 62: 'color',
  10: 'x', 20: 'y', 30: 'z', 11: 'x2', 21: 'y2', 31: 'z2',
  40: 'radio', 41: 'escalaX', 42: 'escalaY', 43: 'escalaZ', 50: 'anguloInicio', 51: 'anguloFin', 70: 'banderas', 90: 'cantidadVertices',
})

/**
 * LAS ENTIDADES DE UN DXF, con sus vértices. PURA.
 *
 * Los códigos 10/20 se repiten dentro de una LWPOLYLINE —uno por vértice—, así que no alcanza con
 * guardar «el último 10»: hay que ACUMULAR. Ese detalle es la diferencia entre medir una polilínea
 * de doce tramos y medir su primer punto.
 */
export function entidades(paresDxf = []) {
  const salida = []
  let seccion = null
  let actual = null
  let bloque = null
  const cerrar = () => { if (actual) salida.push(actual); actual = null }
  for (const [codigo, valor] of paresDxf) {
    const v = String(valor ?? '').trim()
    if (codigo === 0) {
      cerrar()
      if (v === 'SECTION') { seccion = 'esperando'; continue }
      if (v === 'ENDSEC') { seccion = null; continue }
      if (v === 'BLOCK') { bloque = null; actual = { tipo: 'BLOCK', vertices: [] }; continue }
      if (v === 'ENDBLK') { bloque = null; continue }
      if (seccion === 'ENTITIES' || seccion === 'BLOCKS') actual = { tipo: v, seccion, bloque, vertices: [] }
      continue
    }
    if (codigo === 2 && seccion === 'esperando') { seccion = v; continue }
    if (!actual) continue
    if (codigo === 10) { actual.vertices.push({ x: num(v), y: null }) ; actual.x ??= num(v); continue }
    if (codigo === 20) {
      const ultimo = actual.vertices[actual.vertices.length - 1]
      if (ultimo && ultimo.y === null) ultimo.y = num(v)
      actual.y ??= num(v)
      continue
    }
    const campo = CAMPO[codigo]
    if (!campo) continue
    const n = num(v)
    actual[campo] = codigo === 8 || codigo === 2 || codigo === 1 || codigo === 3 || codigo === 6 ? v : (n ?? v)
    if (actual.tipo === 'BLOCK' && codigo === 2) bloque = v
  }
  cerrar()
  return salida.filter((e) => e.tipo !== 'BLOCK')
}

/** El encabezado: lo único que se busca es la unidad de dibujo. PURA. */
export function encabezado(paresDxf = []) {
  let esperando = null
  let insunits = null
  for (const [codigo, valor] of paresDxf) {
    const v = String(valor ?? '').trim()
    if (codigo === 9) { esperando = v; continue }
    if (esperando === '$INSUNITS' && codigo === 70) { insunits = num(v); esperando = null }
  }
  return { insunits, unidad: insunits === null ? null : (INSUNITS[insunits] ?? null) }
}

const dist = (a, b) => Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0))

/** Los tipos que este parser NO sabe medir. Se declaran para que su ausencia no se lea como cero. */
export const SIN_SOPORTE = Object.freeze(['SPLINE', 'ELLIPSE', 'HATCH', 'SOLID', '3DFACE', 'MESH', 'REGION'])

/**
 * LA LONGITUD DE UNA ENTIDAD, en unidades de dibujo. `null` cuando no se puede medir. PURA.
 *
 * La polilínea cerrada suma además el tramo de vuelta: el código 70 con el bit 1 encendido es lo
 * que dice que cierra, y olvidarlo deja afuera un lado entero de todo perímetro.
 */
export function longitudDe(e) {
  if (e?.tipo === 'LINE') return e.x2 === undefined ? null : dist({ x: e.x, y: e.y }, { x: e.x2, y: e.y2 })
  if (e?.tipo === 'CIRCLE') return e.radio != null ? 2 * Math.PI * e.radio : null
  if (e?.tipo === 'ARC') {
    if (e.radio == null || e.anguloInicio == null || e.anguloFin == null) return null
    const barrido = ((e.anguloFin - e.anguloInicio) % 360 + 360) % 360
    return (barrido * Math.PI / 180) * e.radio
  }
  if (e?.tipo === 'LWPOLYLINE' || e?.tipo === 'POLYLINE') {
    const v = (e.vertices ?? []).filter((p) => p.x != null && p.y != null)
    if (v.length < 2) return null
    let total = 0
    for (let i = 1; i < v.length; i++) total += dist(v[i - 1], v[i])
    if (Number(e.banderas ?? 0) & 1) total += dist(v[v.length - 1], v[0])
    return total
  }
  return null
}

/** El área de una polilínea cerrada, por la fórmula del cordón. `null` si no cierra. PURA. */
export function areaDe(e) {
  if (e?.tipo === 'CIRCLE') return e.radio != null ? Math.PI * e.radio ** 2 : null
  if (e?.tipo !== 'LWPOLYLINE' && e?.tipo !== 'POLYLINE') return null
  if (!(Number(e.banderas ?? 0) & 1)) return null
  const v = (e.vertices ?? []).filter((p) => p.x != null && p.y != null)
  if (v.length < 3) return null
  let suma = 0
  for (let i = 0; i < v.length; i++) {
    const a = v[i]
    const b = v[(i + 1) % v.length]
    suma += a.x * b.y - b.x * a.y
  }
  return Math.abs(suma) / 2
}

const redondear = (n, d = 4) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d)

/**
 * LO QUE UN DXF DICE, MEDIDO. PURA.
 *
 * Devuelve por CAPA —que en un plano de obra es la disciplina o el elemento— la longitud total, el
 * área de lo que cierra y cuántas entidades hay. Y devuelve aparte el conteo de INSERT por bloque,
 * que es la respuesta directa a «¿cuántas correas hay?» sin contar un solo símbolo a ojo.
 */
export function medirDxf(texto) {
  const p = pares(texto)
  const cab = encabezado(p)
  const ents = entidades(p)
  const factor = cab.unidad ? (A_METROS[cab.unidad] ?? null) : null
  const porCapa = new Map()
  const bloques = new Map()
  const textos = []
  const sinSoporte = new Map()

  // La geometría de la sección BLOCKS es la DEFINICIÓN de un bloque, no una copia dibujada: sumarla
  // a las capas contaría una vez la plantilla además de cada instancia. Se mide aparte.
  const definiciones = new Map()
  for (const e of ents.filter((x) => x.seccion === 'BLOCKS' && x.bloque)) {
    const d = definiciones.get(e.bloque) ?? { longitud: 0, entidades: 0 }
    d.entidades++
    const l = longitudDe(e)
    if (l !== null) d.longitud += l
    definiciones.set(e.bloque, d)
  }

  for (const e of ents.filter((x) => x.seccion === 'ENTITIES')) {
    if (SIN_SOPORTE.includes(e.tipo)) { sinSoporte.set(e.tipo, (sinSoporte.get(e.tipo) ?? 0) + 1); continue }
    if (e.tipo === 'INSERT') {
      const b = e.nombre ?? '(sin nombre)'
      const item = bloques.get(b) ?? { bloque: b, cantidad: 0, capas: new Set() }
      item.cantidad++
      if (e.capa) item.capas.add(e.capa)
      bloques.set(b, item)
      continue
    }
    if (e.tipo === 'TEXT' || e.tipo === 'MTEXT') {
      if (e.texto) textos.push({ capa: e.capa ?? null, texto: e.texto, x: e.x ?? null, y: e.y ?? null })
      continue
    }
    const capa = e.capa ?? '(sin capa)'
    const c = porCapa.get(capa) ?? { capa, entidades: 0, longitud: 0, area: 0, sinMedir: 0 }
    c.entidades++
    const l = longitudDe(e)
    const a = areaDe(e)
    if (l === null && a === null) c.sinMedir++
    if (l !== null) c.longitud += l
    if (a !== null) c.area += a
    porCapa.set(capa, c)
  }

  return {
    unidadDibujo: cab.unidad,
    factorAMetros: factor,
    porQueSinUnidad: cab.unidad ? null : 'el DXF no declara $INSUNITS: las longitudes salen en unidades de dibujo y NO se pueden llamar metros',
    capas: [...porCapa.values()].map((c) => ({
      ...c,
      longitud: redondear(c.longitud), area: redondear(c.area),
      // Seis decimales y no cuatro: 24 mm² son 0,000024 m², y redondear a cuatro los convierte en
      // CERO. Un área que se vuelve cero al cambiar de unidad es una partida que desaparece.
      longitud_m: factor ? redondear(c.longitud * factor, 6) : null,
      area_m2: factor ? redondear(c.area * factor ** 2, 6) : null,
    })).sort((a, b) => a.capa.localeCompare(b.capa)),
    // `longitudTotal` NO aplica la escala ni la rotación del INSERT: es la longitud de la definición
    // por la cantidad de copias. Cuando un bloque se inserta escalado, ese número es un piso y hay
    // que decirlo — por eso viaja con `escalaAplicada: false` y no como si fuera la medida final.
    bloques: [...bloques.values()].map((b) => {
      const d = definiciones.get(b.bloque)
      return {
        ...b, capas: [...b.capas].sort(),
        longitudUnitaria: redondear(d?.longitud ?? null),
        longitudTotal: d?.longitud ? redondear(d.longitud * b.cantidad) : null,
        escalaAplicada: false,
      }
    }).sort((a, b) => a.bloque.localeCompare(b.bloque)),
    textos,
    entidades: ents.length,
    sinSoporte: [...sinSoporte.entries()].map(([tipo, cantidad]) => ({ tipo, cantidad, porQue: 'este parser no mide esa entidad — la cantidad está declarada para que su ausencia no se lea como cero' })).sort((a, b) => a.tipo.localeCompare(b.tipo)),
  }
}
