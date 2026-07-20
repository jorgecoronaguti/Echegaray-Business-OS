// BIBLIOTECA POR ÁREA — qué sabe, qué le falta y qué debe el OS sobre una de las 8 áreas.
//
// POR QUÉ EXISTE (auditoría 20/07, sobre datos vivos): el OS ya tenía 201 piezas de conocimiento
// —afirmaciones confirmadas, fuentes de datos, preguntas de negocio, capacidades medidas, reportes,
// pendientes y acciones— repartidas en 7 tablas con 6 taxonomías incompatibles entre sí. El
// conocimiento existía y NO era recuperable: para saber qué sabe el OS sobre Administración y
// Finanzas había que leer siete tablas a mano.
//
// Peor: el chat adopta la persona del CFO y razona con la skill del dominio, pero nunca recibía
// `conocimiento_empresa`. Es decir, el OS podía tener anotado "los saldos bancarios están en la
// pestaña Caja del Cash Flow" y aun así ponerse a buscarlo de cero.
//
// Esto NO agrega conocimiento nuevo. Lo hace recuperable por área, desde una sola fuente
// (public.conocimiento_por_area) que no copia ninguna fila: cada una sigue viviendo en su tabla
// dueña. Costo 0 API.
//
// CRITERIO: un área sin conocimiento no es un área sana. Se declara el hueco tal cual — "Calidad:
// 0 afirmaciones, 0 fuentes" es información accionable, no un espacio en blanco que se disimula.

/** Las 8 áreas oficiales, en el orden del programa. Espejo de public.area_canonica. */
export const AREAS = [
  { clave: 'compras', nombre: 'Compras' },
  { clave: 'administracion_finanzas', nombre: 'Administración y Finanzas' },
  { clave: 'obras', nombre: 'Obras' },
  { clave: 'personas', nombre: 'Personas' },
  { clave: 'contabilidad_legales', nombre: 'Contabilidad y Legales' },
  { clave: 'comercial', nombre: 'Comercial / Cotización' },
  { clave: 'calidad', nombre: 'Calidad' },
  { clave: 'gestion_general', nombre: 'Gestión General' },
]

const SIN_TILDES = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Resuelve lo que escribió el dueño ("finanzas", "administracion y finanzas", "rrhh") a una de las
 * 8 claves. PURA. Devuelve null si no matchea — no se elige un área "parecida" por descarte, porque
 * responder con la biblioteca del área equivocada es peor que decir que no se entendió.
 */
export function resolverArea(texto) {
  const t = SIN_TILDES(texto)
  if (!t) return null
  for (const a of AREAS) if (SIN_TILDES(a.clave) === t || SIN_TILDES(a.nombre) === t) return a.clave
  // Sinónimos que usa el dueño hablando, no los nombres formales.
  const SINONIMOS = {
    compras: ['compra', 'proveedores', 'abastecimiento', 'materiales'],
    administracion_finanzas: ['finanzas', 'administracion', 'admin', 'caja', 'tesoreria', 'cobranzas', 'admin y finanzas', 'administracion y finanzas'],
    obras: ['obra', 'produccion', 'avance', 'certificacion'],
    personas: ['personal', 'rrhh', 'gente', 'jornales', 'sueldos', 'laboral', 'seguridad e higiene'],
    contabilidad_legales: ['contabilidad', 'legales', 'legal', 'impuestos', 'fiscal', 'contable', 'contabilidad y legales'],
    comercial: ['cotizacion', 'cotizaciones', 'presupuestacion', 'ventas', 'clientes', 'comercial cotizacion'],
    calidad: ['no conformidades', 'calidad de obra'],
    gestion_general: ['gestion', 'direccion', 'general', 'empresa', 'gestion general'],
  }
  for (const [clave, lista] of Object.entries(SINONIMOS)) if (lista.some((s) => s === t)) return clave
  // Coincidencia parcial sólo si es inequívoca (una sola área matchea).
  const parciales = AREAS.filter((a) => SIN_TILDES(a.nombre).includes(t) || t.includes(SIN_TILDES(a.clave)))
  return parciales.length === 1 ? parciales[0].clave : null
}

// Términos que identifican un área DENTRO de una frase. Sólo los inequívocos: "caja" o "obra"
// aparecen en mil preguntas que no son sobre el área, y arrastrarlas haría que la biblioteca
// secuestre consultas ajenas — el mismo defecto que esta detección viene a corregir.
const EN_FRASE = [
  ['administracion_finanzas', ['administracion y finanzas', 'admin y finanzas', 'administracion finanzas', 'adm y finanzas', 'finanzas', 'tesoreria']],
  ['contabilidad_legales', ['contabilidad y legales', 'contabilidad', 'legales', 'impuestos', 'fiscal']],
  ['comercial', ['comercial', 'cotizacion', 'cotizaciones', 'presupuestacion']],
  ['personas', ['personas', 'personal', 'rrhh', 'jornales', 'sueldos']],
  ['compras', ['compras', 'abastecimiento', 'proveedores']],
  ['gestion_general', ['gestion general', 'direccion']],
  ['calidad', ['calidad']],
  ['obras', ['obras']],
]

/**
 * Busca si una frase NOMBRA una de las 8 áreas. PURA. Devuelve la clave o null.
 * Se usa para que una pregunta como "¿qué sabés del área de personas?" vaya a la biblioteca de esa
 * área y no al volcado general de lo aprendido. Si la frase nombra DOS áreas, devuelve null: elegir
 * una sería adivinar cuál le interesa al dueño.
 */
export function areaMencionada(texto) {
  const t = ` ${SIN_TILDES(texto)} `
  if (t.trim().length < 2) return null
  const encontradas = new Set()
  for (const [clave, terminos] of EN_FRASE) {
    if (terminos.some((x) => t.includes(` ${x} `))) encontradas.add(clave)
  }
  return encontradas.size === 1 ? [...encontradas][0] : null
}

/** Nombre para mostrar de una clave. PURA. */
export function nombreArea(clave) {
  return AREAS.find((a) => a.clave === clave)?.nombre ?? clave
}

const $ = (n) => Number(n) || 0

/**
 * NÚCLEO PURO: arma el informe de un área a partir de sus piezas ya clasificadas.
 * @param {object} d { area, piezas:[{tipo,titulo,confianza,activo,origen_tabla}] }
 */
export function componerBiblioteca(d = {}) {
  const clave = d.area
  const piezas = d.piezas || []
  const de = (t) => piezas.filter((p) => p.tipo === t)
  const activos = (t) => de(t).filter((p) => p.activo)

  const saber = de('afirmacion')
  const fuentes = de('fuente')
  const preguntas = activos('pregunta')
  const pendientes = activos('pendiente')
  const acciones = activos('accion')
  const reportes = activos('reporte')
  const capacidad = de('capacidad')

  // Un área "vacía" no se disimula: es el hallazgo más útil que puede dar esta capacidad.
  const huecos = []
  if (!saber.length) huecos.push('no hay ninguna afirmación confirmada: el OS no sabe nada estable de esta área')
  if (!fuentes.length) huecos.push('no hay ninguna fuente de datos declarada: no se sabe de dónde sale el dato')
  if (!reportes.length) huecos.push('no hay ningún reporte automático definido')

  return {
    area: clave,
    area_nombre: nombreArea(clave),
    total: piezas.length,
    sabe: saber.map((p) => ({ afirmacion: p.titulo, confianza: p.confianza })),
    fuentes: fuentes.map((p) => ({ nombre: p.titulo, criticidad: p.confianza })),
    preguntas_abiertas: preguntas.map((p) => p.titulo),
    pendientes: pendientes.map((p) => p.titulo),
    acciones_abiertas: acciones.map((p) => p.titulo),
    reportes: reportes.map((p) => p.titulo),
    capacidad_declarada: capacidad.map((p) => ({ dominio: p.titulo, nivel: p.confianza })),
    huecos,
  }
}

/** Texto legible del informe de un área. PURO. */
export function formatBiblioteca(r) {
  if (!r || r.error) return `No pude armar la biblioteca: ${r?.error ?? 'sin datos'}`
  const L = [`BIBLIOTECA — ${r.area_nombre.toUpperCase()} (${r.total} piezas)`, '']

  const bloque = (titulo, items, fmt = (x) => `  • ${x}`) => {
    if (!items?.length) return
    L.push(`${titulo} (${items.length}):`)
    for (const i of items) L.push(fmt(i))
    L.push('')
  }

  bloque('LO QUE SABE', r.sabe, (s) => `  • ${s.afirmacion}${s.confianza ? ` [${s.confianza}]` : ''}`)
  bloque('DE DÓNDE SALE EL DATO', r.fuentes, (f) => `  • ${f.nombre}${f.criticidad ? ` [${f.criticidad}]` : ''}`)
  bloque('CAPACIDAD MEDIDA', r.capacidad_declarada, (c) => `  • ${c.dominio}: nivel ${c.nivel}`)
  bloque('PREGUNTAS SIN RESPONDER', r.preguntas_abiertas)
  bloque('ACCIONES ABIERTAS', r.acciones_abiertas)
  bloque('PENDIENTES DEL BACKLOG', r.pendientes)
  bloque('REPORTES AUTOMÁTICOS', r.reportes)

  if (r.huecos.length) {
    L.push('HUECOS:')
    for (const h of r.huecos) L.push(`  ⚠ ${h}`)
  }
  return L.join('\n').trim()
}

/** Panorama de las 8 áreas: cuánto sabe el OS de cada una. PURO. */
export function formatPanorama(filas) {
  const L = ['CONOCIMIENTO DEL OS POR ÁREA', '']
  L.push('  ÁREA                          TOTAL  SABE  FUENTES  PREG  PEND')
  for (const f of filas) {
    if (f.area === null) continue
    L.push(
      `  ${nombreArea(f.area).padEnd(28)}  ${String($(f.total)).padStart(5)}  ${String($(f.sabe)).padStart(4)}  ` +
        `${String($(f.fuentes)).padStart(7)}  ${String($(f.preguntas)).padStart(4)}  ${String($(f.pendientes)).padStart(4)}`,
    )
  }
  const sin = filas.find((f) => f.area === null)
  if (sin && $(sin.total)) {
    L.push('')
    L.push(`  SIN CLASIFICAR: ${$(sin.total)} pieza(s) que no se pueden rutear a ningún área.`)
  }
  const vacias = filas.filter((f) => f.area && !$(f.sabe))
  if (vacias.length) {
    L.push('')
    L.push(`  ⚠ Sin ninguna afirmación confirmada: ${vacias.map((f) => nombreArea(f.area)).join(', ')}.`)
  }
  return L.join('\n')
}

/** Informe de un área desde la fuente única. */
export async function bibliotecaArea(areaTexto) {
  const clave = resolverArea(areaTexto)
  if (!clave) {
    return { error: `no reconozco el área "${areaTexto}". Las 8 son: ${AREAS.map((a) => a.nombre).join(', ')}.` }
  }
  const { query } = await import('./db.mjs')
  const { rows } = await query(
    `select tipo, titulo, confianza, activo, origen_tabla
       from public.conocimiento_por_area
      where area = $1
      order by tipo, created_at desc`,
    [clave],
  )
  return componerBiblioteca({ area: clave, piezas: rows })
}

/** Panorama de las 8 áreas desde la fuente única. */
export async function panoramaAreas() {
  const { query } = await import('./db.mjs')
  // Se parte del CATÁLOGO de áreas, no del conocimiento: si se agrupara por lo que existe, un área
  // con cero piezas (Calidad, al 20/07) desaparecería de la lista en vez de mostrarse vacía. Un área
  // que el OS no conoce es justamente lo que hay que ver.
  const { rows } = await query(
    `select a.clave as area,
            count(k.*)::int                                                as total,
            count(*) filter (where k.tipo = 'afirmacion')::int             as sabe,
            count(*) filter (where k.tipo = 'fuente')::int                 as fuentes,
            count(*) filter (where k.tipo = 'pregunta'  and k.activo)::int as preguntas,
            count(*) filter (where k.tipo = 'pendiente' and k.activo)::int as pendientes
       from public.area_canonica a
       left join public.conocimiento_por_area k on k.area = a.clave
      group by a.clave, a.orden
      union all
     select null, count(*)::int, 0, 0, 0, count(*) filter (where tipo = 'pendiente' and activo)::int
       from public.conocimiento_por_area where area is null
      order by 1 nulls last`,
  )
  // El union all rompe el orden del catálogo; se reordena con el orden oficial del programa.
  const orden = new Map(AREAS.map((a, i) => [a.clave, i]))
  return rows.sort((x, y) => (orden.get(x.area) ?? 99) - (orden.get(y.area) ?? 99))
}
