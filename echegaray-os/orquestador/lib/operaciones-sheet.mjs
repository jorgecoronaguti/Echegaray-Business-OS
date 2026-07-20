// OPERACIONES CON NOMBRE sobre una pestaña — el reemplazo de "el modelo decide qué poner en H7".
//
// Por qué existe: hasta hoy cada arreglo de una planilla era un modelo de lenguaje improvisando
// celda por celda en vivo. Medido el 2026-07-19 sobre la pestaña Caja: 13 pasos, 100 segundos,
// $1,99, dos escrituras que dieron #N/A y hubo que reintentar, y un corte por tope de costo que
// dejó la pestaña a medio hacer. La mejor práctica escrita en la skill no servía de nada porque
// nadie la ejecutaba de forma repetible.
//
// Acá cada mejora es una OPERACIÓN determinística: mira la grilla real, decide qué cambiar según el
// criterio profesional de `google-sheets-business-systems`, y devuelve las celdas exactas a
// escribir. El modelo elige CUÁL operación; este código sabe CÓMO. Testeable sin API.
//
// CONTRATO: toda operación devuelve { operacion, resumen, cambios[], sin_cambios?, requiere_decision? }
// y NUNCA escribe por su cuenta. Proponer y aplicar están separados a propósito: sobre la planilla
// real de la empresa, el dueño ve qué se va a tocar antes de que se toque.

const COL = (i) => {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}
const a1 = (fila, col) => `${COL(col)}${fila + 1}`
const llena = (c) => !!(c && (c.formula || (c.valor !== null && c.valor !== '')))
const texto = (c) => String(c?.valor ?? '').trim()

/** Índice de la columna cuyo encabezado matchea `re`. -1 si no está. PURA. */
export function buscarColumna(encabezado, re) {
  return (encabezado || []).findIndex((h) => re.test(String(h || '')))
}

// ---------------------------------------------------------------------------------------------
// OPERACIÓN 1 — NORMALIZAR NOMBRES DE OBRA
//
// Un cobro o un gasto cargado con un nombre que no matchea ninguna obra canónica queda fuera de
// todo control económico: no se cruza con costo real, avance ni margen. Es la falla más cara y la
// más invisible de la planilla.
// ---------------------------------------------------------------------------------------------
export function normalizarObras(grid, { encabezado, filaDatos, canonicas = [], alias = {} }) {
  const col = buscarColumna(encabezado, /\bobra|cliente|asignaci[oó]n|imputa/i)
  if (col < 0) return { operacion: 'normalizar_obras', sin_cambios: true, resumen: 'La pestaña no tiene una columna de obra/cliente.' }

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const porNombre = new Map(canonicas.map((c) => [norm(c), c]))
  for (const [a, c] of Object.entries(alias)) porNombre.set(norm(a), c)

  const cambios = []
  const requiere_decision = []
  const vistos = new Map()
  // `filaDatos` es el índice de la fila de ENCABEZADO; los datos arrancan en la siguiente. Mismo
  // criterio en las tres operaciones: antes ésta arrancaba en el encabezado y lo trataba como dato.
  for (let f = filaDatos + 1; f < (grid.filas || []).length; f++) {
    const celda = (grid.filas[f] || [])[col]
    const v = texto(celda)
    if (!v || celda?.formula) continue
    const k = norm(v)
    if (vistos.has(k)) { if (vistos.get(k)) cambios.push({ celda: a1(f, col), de: v, a: vistos.get(k) }); continue }

    const exacto = porNombre.get(k)
    if (exacto) { vistos.set(k, exacto === v ? null : exacto); if (exacto !== v) cambios.push({ celda: a1(f, col), de: v, a: exacto }); continue }
    // Coincidencia por contención: "LA ESTRELLA /ALIMENTOS DEL SUR SAS" contiene "la estrella".
    const candidatos = [...porNombre.entries()].filter(([n]) => n.length > 3 && k.includes(n)).map(([, c]) => c)
    const unicos = [...new Set(candidatos)]
    if (unicos.length === 1) {
      vistos.set(k, unicos[0])
      cambios.push({ celda: a1(f, col), de: v, a: unicos[0] })
    } else {
      // Varias obras en un mismo campo ("IMOTOR/San Francisco/JAVI SANCHEZ") o ninguna conocida.
      // NO se elige por el dueño: se le muestra y decide él. Adivinar acá corrompe el costo por obra.
      vistos.set(k, null)
      requiere_decision.push({ celda: a1(f, col), valor: v, candidatos: unicos })
    }
  }
  return {
    operacion: 'normalizar_obras',
    columna: COL(col),
    cambios,
    requiere_decision,
    resumen: `${cambios.length} celda(s) se pueden unificar con la obra canónica. ${requiere_decision.length} necesitan que decidas vos (nombre desconocido o varias obras en un mismo campo).`,
  }
}

// ---------------------------------------------------------------------------------------------
// OPERACIÓN 2 — TOTALES PEGADOS A MANO → FÓRMULA
//
// La regla de oro del proyecto: en el Sheet nunca un número suelto calculado por fuera. Un total
// que no es fórmula deja de ser cierto en cuanto alguien agrega una fila, y nadie se entera.
// ---------------------------------------------------------------------------------------------
const RE_TOTAL = /^\s*(total|totales|subtotal|suma|acumulado)\b/i

export function totalesAFormula(grid, { encabezado, filaDatos, separador = ';' }) {
  const filas = grid.filas || []
  const cambios = []
  for (let f = 0; f < filas.length; f++) {
    const fila = filas[f] || []
    if (!fila.some((c) => texto(c) && RE_TOTAL.test(texto(c)))) continue
    for (let col = 0; col < fila.length; col++) {
      const c = fila[col]
      if (!c || c.formula || c.numero === null || c.numero === undefined) continue
      // OJO con el off-by-one: `filaDatos` y `f` son índices base 0, pero una referencia A1 usa
      // números de fila base 1. La primera fila de datos es filaDatos+2 y la última, la anterior
      // al total, es f. Equivocarse acá suma el encabezado dentro del total.
      const desde = filaDatos + 2
      const hasta = f
      if (hasta <= desde) continue
      cambios.push({
        celda: a1(f, col),
        de: c.valor,
        // es-AR: separador de argumentos ';' (la coma es decimal). Escribirlo con ',' rompe.
        a: `=SUMA(${COL(col)}${desde}:${COL(col)}${hasta})`,
      })
    }
  }
  return {
    operacion: 'totales_a_formula',
    cambios,
    sin_cambios: cambios.length === 0,
    resumen: cambios.length
      ? `${cambios.length} total(es) escritos a mano pasan a ser fórmula viva.`
      : 'No hay totales pegados a mano.',
  }
}

// ---------------------------------------------------------------------------------------------
// OPERACIÓN 3 — NÚMEROS GUARDADOS COMO TEXTO
//
// Un número guardado como texto NO suma: los SUMAR.SI lo ignoran en silencio y el total queda corto
// sin dar error. Es la causa silenciosa de "los números casi cierran".
// ---------------------------------------------------------------------------------------------
export function numerosComoTexto(grid, { encabezado, filaDatos }) {
  const filas = grid.filas || []
  const ancho = filas.reduce((m, f) => Math.max(m, (f || []).length), 0)
  const cambios = []
  for (let col = 0; col < ancho; col++) {
    const cuerpo = []
    for (let f = filaDatos + 1; f < filas.length; f++) {
      const c = (filas[f] || [])[col]
      if (llena(c) && !c.formula) cuerpo.push({ f, c })
    }
    if (cuerpo.length < 4) continue
    const nums = cuerpo.filter((x) => x.c.numero !== null && x.c.numero !== undefined)
    if (nums.length < cuerpo.length * 0.7) continue
    for (const x of cuerpo) {
      if (x.c.numero !== null && x.c.numero !== undefined) continue
      const v = texto(x.c)
      // Convertible sólo si REALMENTE es un número escrito con formato es-AR ("1.234,56").
      const limpio = v.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')
      const n = Number(limpio)
      if (v && Number.isFinite(n)) {
        cambios.push({ celda: a1(x.f, col), de: v, a: n, columna: encabezado[col] || COL(col) })
      }
      // Si no es convertible (ej. "s/d", "-", "pendiente") NO se toca: borrar texto que alguien
      // escribió a propósito destruye información. Se reporta como decisión del dueño.
    }
  }
  return {
    operacion: 'numeros_como_texto',
    cambios,
    sin_cambios: cambios.length === 0,
    resumen: cambios.length
      ? `${cambios.length} celda(s) numéricas guardadas como texto: hoy no suman.`
      : 'No hay números guardados como texto en columnas numéricas.',
  }
}

export const OPERACIONES = {
  normalizar_obras: normalizarObras,
  totales_a_formula: totalesAFormula,
  numeros_como_texto: numerosComoTexto,
}

/** Texto para el chat: qué se va a tocar, ANTES de tocarlo. PURO. */
export function formatPropuesta(r) {
  if (!r) return 'sin datos'
  const L = [`OPERACIÓN: ${r.operacion}`, r.resumen]
  const muestra = (r.cambios || []).slice(0, 12)
  if (muestra.length) {
    L.push('\nCambios propuestos:')
    for (const c of muestra) L.push(`  ${c.celda}: "${c.de}" → "${c.a}"`)
    if (r.cambios.length > muestra.length) L.push(`  … y ${r.cambios.length - muestra.length} más.`)
  }
  if (r.requiere_decision?.length) {
    L.push('\nNECESITAN TU DECISIÓN (el OS no elige por vos):')
    for (const d of r.requiere_decision.slice(0, 10)) {
      L.push(`  ${d.celda}: "${d.valor}"${d.candidatos?.length ? ` — podría ser: ${d.candidatos.join(' o ')}` : ' — no matchea ninguna obra conocida'}`)
    }
  }
  return L.join('\n')
}
