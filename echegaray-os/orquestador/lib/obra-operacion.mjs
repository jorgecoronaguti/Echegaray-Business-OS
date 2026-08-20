// OPERACIÓN DE UNA OBRA — la regla PURA que ata un texto de obra a la obra canónica.
//
// ═══ POR QUÉ ESTA REGLA VIVE EN JAVASCRIPT SI YA VIVE EN POSTGRES ═══
//
// La fuente única del cruce es `obra_costo_real`, que resuelve
// `norm_obra(costos_obra.obra_texto) = obra_alias.alias` del lado del servidor. PostgREST —la vía
// por la que entra la web— no deja filtrar por el resultado de una función aplicada a una columna,
// así que una pantalla que necesite el DETALLE (y no sólo el total agregado) tiene que hacer ese
// último paso del lado del cliente.
//
// Lo que se replica es sólo la normalización, que es `immutable` y no cambia. El DICCIONARIO —
// `obra_alias`, que es lo que sí cambia cuando aparece una grafía nueva— se sigue leyendo de la
// base. Y la réplica no se valida contra sí misma: el consumidor compara la suma del detalle contra
// el total que `obra_costo_real` calculó por su cuenta (`detalleCubreElTotal`). Si la normalización
// se desincroniza del `norm_obra()` de Postgres, ese control se pone en falso.
//
// ═══ POR QUÉ NO ESTÁ EN `obras.mjs` ═══
//
// `obras.mjs` importa `db.mjs`, que trae el driver `pg`. La web necesita esta misma regla y no
// puede arrastrar un pool de Postgres al bundle de Next para usar una expresión regular. Este
// módulo NO IMPORTA NADA: lo consumen el orquestador (que le reexporta `normObra` a `obras.mjs`,
// para que siga habiendo una sola implementación) y `src/features/obras/services/operacionService.ts`.

/** @typedef {{ alias: string, obra_id: string|null, clasificacion: string }} FilaAlias */

// 'indirecto' y 'excluido' NO son obra: Administración, Taller, F931, UOCRA, IERIC son estructura, y
// Lebane está excluida por decisión del dueño. Es el mismo recorte que hace `obra_costo_real`, y
// olvidarlo imputaría el costo de la empresa entera a la primera obra que se abra.
const CLASIFICACION_DE_OBRA = new Set(['obra', 'mantenimiento'])

/**
 * Normaliza un texto de obra a su clave canónica. Réplica de `public.norm_obra()`:
 * minúsculas → sin acentos → todo lo no alfanumérico a espacio → sin artículos → espacios colapsados.
 * @param {unknown} s
 * @returns {string}
 */
export function normObra(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    // El rango de marcas diacríticas combinantes, escrito con escapes: en `obras.mjs` está con los
    // caracteres literales y no se ve lo que dice.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(la|el|los|las|de|del)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Con qué nombres normalizados se identifica UNA obra en las tablas que la guardan como texto.
 * Vacío significa que todavía no hay forma verificable de atarle nada — y eso se dice, no se adivina.
 * @param {FilaAlias[]} filas filas crudas de `public.obra_alias`
 * @param {string} obraId id de `obra_canonica` (el slug de la ruta)
 * @returns {string[]}
 */
export function aliasDeObra(filas, obraId) {
  const set = new Set()
  for (const f of filas ?? []) {
    if (!f || f.obra_id !== obraId) continue
    if (!CLASIFICACION_DE_OBRA.has(f.clasificacion)) continue
    const a = normObra(f.alias)
    if (a) set.add(a)
  }
  return [...set].sort()
}

/**
 * ¿Este texto crudo nombra a la obra?
 *
 * MATCH EXACTO SOBRE EL ALIAS NORMALIZADO, sin contención ni prefijos. `resolverObraCon()` sí tiene
 * un fallback aproximado, pero acá se está imputando plata y herramientas a UNA obra: "Estrella
 * Norte" contiene "estrella" y no es La Estrella. Un texto que no matchea no se muestra en ningún
 * lado — aparece como faltante, que es la verdad.
 * @param {Iterable<string>} nombres
 * @param {unknown} texto
 * @returns {boolean}
 */
export function esDeObra(nombres, texto) {
  const a = normObra(texto)
  if (!a) return false
  for (const n of nombres) if (n === a) return true
  return false
}

/**
 * EL CONTROL: ¿el detalle que se está por mostrar cubre lo que la base declara para esta obra?
 *
 * No se compara contra sí mismo: `totalDeclarado` sale de `obra_costo_real`, que Postgres calcula
 * con su propio `norm_obra()`. Si esto da false, el detalle está incompleto (o la normalización
 * replicada se desincronizó) y la pantalla no puede presentar la lista como si fuera todo.
 * @param {{ total: number|null|undefined }[]} filas
 * @param {number|null|undefined} totalDeclarado
 * @returns {boolean}
 */
export function detalleCubreElTotal(filas, totalDeclarado) {
  const suma = (filas ?? []).reduce((a, f) => a + Number(f?.total ?? 0), 0)
  if (totalDeclarado == null) return suma === 0
  // Tolerancia de un peso: `numeric` de Postgres y `number` de JS no redondean igual.
  return Math.abs(suma - Number(totalDeclarado)) < 1
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL ÍNDICE: EL MISMO PUENTE, RECORRIDO UNA VEZ PARA TODAS LAS OBRAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `aliasDeObra` + `esDeObra` contestan «¿este texto es de ESTA obra?», que es la pregunta de la
// ficha. La vista global hace la pregunta al revés: «¿de qué obra es este texto?». Escribir las dos
// por separado es exactamente el defecto que el dueño nombró —*"NO crear dos sistemas"*—: dos
// resoluciones del mismo cruce que se desincronizan y hacen que la fila aparezca en una pantalla y
// no en la otra.
//
// Por eso hay UNA función que contesta las dos: `obraDeTexto()` devuelve la obra, y «¿es de la obra
// X?» pasa a ser `obraDeTexto(idx, t) === X`. La equivalencia no es una convención que haya que
// respetar a mano: es la misma llamada.
//
// UN ALIAS AMBIGUO NO SE IMPUTA A NADIE. Si dos obras declaran alias que normalizan igual, no hay
// forma verificable de saber de cuál es la fila: se marca `null` y la fila queda «sin obra» en la
// lista global. Falla cerrado, igual que `ve_obra_texto()` en Postgres — que ante un texto que no
// resuelve deja la fila afuera en vez de mostrarla bajo la primera obra que aparezca.

/** Marca interna de colisión. No se exporta: afuera, un alias ambiguo simplemente no resuelve. */
const AMBIGUO = Symbol('alias ambiguo')

/**
 * El diccionario `obra_alias` dado vuelta: alias normalizado → id de obra.
 * @param {FilaAlias[]} filas filas crudas de `public.obra_alias`
 * @returns {Map<string, string|symbol>}
 */
export function indiceDeAlias(filas) {
  /** @type {Map<string, string|symbol>} */
  const idx = new Map()
  for (const f of filas ?? []) {
    if (!f || !f.obra_id) continue
    if (!CLASIFICACION_DE_OBRA.has(f.clasificacion)) continue
    const a = normObra(f.alias)
    if (!a) continue
    const previo = idx.get(a)
    if (previo === undefined) idx.set(a, f.obra_id)
    else if (previo !== f.obra_id) idx.set(a, AMBIGUO)
  }
  return idx
}

/**
 * ¿De qué obra es este texto? `null` cuando no resuelve — que es la verdad, no un faltante que
 * haya que rellenar. Match EXACTO sobre el alias normalizado, igual que `esDeObra`.
 * @param {Map<string, string|symbol>} indice
 * @param {unknown} texto
 * @returns {string|null}
 */
export function obraDeTexto(indice, texto) {
  const a = normObra(texto)
  if (!a) return null
  const v = indice.get(a)
  return typeof v === 'string' ? v : null
}
