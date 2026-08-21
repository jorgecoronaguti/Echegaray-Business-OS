// EL PLAN DE CARGA DE LA BASE MAESTRA. NÚCLEO PURO: SIN RED NI BASE.
//
// Toma lo que salió del libro (`base-maestra-xlsm.mjs`) y lo que ya hay en Postgres, y devuelve qué
// haría con cada fila, clasificada en las cinco únicas categorías posibles:
//
//     nuevo · modificado · sin cambios · conflicto · inválido
//
// ═══ POR QUÉ LA IDEMPOTENCIA SE MIDE ACÁ Y NO EN LA BASE ═══
//
// Un `upsert` que reescribe todo siempre «funciona» y nunca dice nada: corre dos veces y las dos
// informa 409 recursos cargados. Este plan compara CONTENIDO —no existencia— así que la segunda
// corrida sobre un libro sin tocar da 0 nuevos y 0 modificados, y eso es lo que hace observable el
// proceso. La consecuencia práctica: `origen` y `fuente` llevan la fecha de la ingestión y por eso
// NO entran en la comparación; se reescriben sólo cuando algo de fondo cambió, y entonces la fecha
// significa «cuándo entró este contenido», que es lo que uno quiere leer ahí.
//
// ═══ LO QUE NO SE PISA ═══
//
// Una fila que ya existe en la base y cuyo `origen` no viene de este libro es de otro: puede haberla
// cargado una persona o un módulo de compras. No se toca y se informa como CONFLICTO. Un ingestor
// que sobrescribe lo ajeno porque la clave coincide destruye trabajo sin dar error.

import { LIBRO } from './base-maestra-xlsm.mjs'

/** Los cinco estados. No hay un sexto: una fila que no entra en ninguno es un defecto del plan. */
export const ESTADOS = Object.freeze(['nuevo', 'modificado', 'sin_cambios', 'conflicto', 'invalido'])

/** Igualdad numérica tolerante al viaje por `numeric` de Postgres (que vuelve como texto). */
export function mismoNumero(a, b) {
  const x = a === null || a === undefined || a === '' ? null : Number(a)
  const y = b === null || b === undefined || b === '' ? null : Number(b)
  if (x === null || y === null) return x === y
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y))
}

/** Igualdad de texto donde `null`, `undefined` y `''` son la misma ausencia. */
export const mismoTexto = (a, b) => (a ?? '') === (b ?? '')

/** ¿Esta fila de la base la puso este libro? Si no, es de otro y no se pisa. */
export const esDeEsteLibro = (origen) => String(origen ?? '').startsWith(LIBRO)

/**
 * Compara un registro del libro contra el de la base y devuelve QUÉ campos difieren.
 * @returns {string[]} vacío = idénticos
 */
export function diferencias(nuevo, base, campos) {
  const dif = []
  for (const [campo, tipo] of Object.entries(campos)) {
    const igual = tipo === 'numero' ? mismoNumero(nuevo[campo], base[campo]) : mismoTexto(nuevo[campo], base[campo])
    if (!igual) dif.push(`${campo}: base ${JSON.stringify(base[campo] ?? null)} → libro ${JSON.stringify(nuevo[campo] ?? null)}`)
  }
  return dif
}

const CAMPOS_RECURSO = Object.freeze({
  nombre: 'texto', unidad: 'texto', tipo: 'texto', familia: 'texto', division: 'texto', desperdicio: 'numero',
})
const CAMPOS_PRECIO = Object.freeze({ costo: 'numero', fecha_precio: 'texto', proveedor: 'texto' })
const CAMPOS_TAREA = Object.freeze({ nombre: 'texto', unidad: 'texto', descripcion: 'texto' })

/** Un cajón vacío de los cinco estados, para que el conteo exista aunque no haya ninguna fila. */
export const cajones = () => ({ nuevo: [], modificado: [], sin_cambios: [], conflicto: [], invalido: [] })

/** Reparte una lista contra su espejo en la base usando la clave `codigo`. */
function repartir(delLibro, deLaBase, campos, invalidos = [], conflictosPrevios = []) {
  const c = cajones()
  c.invalido = invalidos
  c.conflicto = [...conflictosPrevios]
  const enBase = new Map(deLaBase.map((b) => [String(b.codigo), b]))
  for (const n of delLibro) {
    const b = enBase.get(String(n.codigo))
    if (!b) { c.nuevo.push(n); continue }
    if (!esDeEsteLibro(b.origen) && b.origen !== undefined) {
      c.conflicto.push({ clave: n.codigo, entidad: 'ajeno', motivo: `ya existe con origen "${b.origen ?? '∅'}", que no es este libro: no se pisa` })
      continue
    }
    const dif = diferencias(n, b, campos)
    if (dif.length) c.modificado.push({ ...n, difiere: dif })
    else c.sin_cambios.push(n)
  }
  return c
}

/** La firma de un análisis: sus líneas en orden. Dos análisis con la misma firma son el mismo. */
export const firmaLineas = (lineas = []) => lineas
  .map((l, i) => `${l.orden ?? i}|${l.codigoRecurso ?? l.codigo_recurso}|${Number(l.cantidad)}|${l.nota ?? ''}`)
  .join('\n')

/**
 * EL PLAN COMPLETO. Puro: no escribe, dice qué haría.
 *
 * @param {object} libro  `{recursos, precios, tareas, invalidos, conflictos}` — la salida del lector
 * @param {object} base   `{recursos, precios, tareas, analisis}` — lo que ya hay en Postgres
 * @returns {{recurso, precio, tarea_tipo, analisis, resumen}}
 */
export function planDeCarga({ libro = {}, base = {} } = {}) {
  const recurso = repartir(libro.recursos ?? [], base.recursos ?? [], CAMPOS_RECURSO, libro.invalidosRecurso ?? [], libro.conflictosRecurso ?? [])

  // El precio se compara contra el ÚNICO vigente del recurso. Si cambió, no se edita: se abre una
  // versión nueva y la anterior deja de ser vigente — un precio es una versión, no una columna.
  const precioBase = new Map((base.precios ?? []).map((p) => [String(p.codigo), p]))
  const precio = cajones()
  for (const p of libro.precios ?? []) {
    const b = precioBase.get(String(p.codigo))
    if (!b) { precio.nuevo.push(p); continue }
    const dif = diferencias(p, b, CAMPOS_PRECIO)
    if (dif.length) precio.modificado.push({ ...p, difiere: dif })
    else precio.sin_cambios.push(p)
  }
  // Un recurso que en el libro se quedó SIN costo pero en la base tiene precio vigente: el precio de
  // la base no se borra (puede venir de una compra real) y la diferencia se denuncia.
  const conCosto = new Set((libro.precios ?? []).map((p) => String(p.codigo)))
  for (const b of base.precios ?? []) {
    if (!conCosto.has(String(b.codigo)) && esDeEsteLibro(b.fuente)) {
      precio.conflicto.push({ clave: b.codigo, entidad: 'precio', motivo: 'el libro ya no le pone costo y la base tiene un precio vigente cargado por este libro: se deja como está' })
    }
  }

  const tarea_tipo = repartir(libro.tareas ?? [], base.tareas ?? [], CAMPOS_TAREA, libro.invalidosTarea ?? [], libro.conflictosTarea ?? [])

  // El análisis se compara ENTERO: la unidad de cambio es el juego de líneas, no la línea suelta.
  // Media línea cambiada con la otra media vieja no es un análisis: es un costo que no existió nunca.
  const analisisBase = new Map((base.analisis ?? []).map((a) => [String(a.codigo), a]))
  const analisis = cajones()
  for (const t of libro.tareas ?? []) {
    const b = analisisBase.get(String(t.codigo))
    const firma = firmaLineas(t.lineas)
    if (!b) { analisis.nuevo.push({ codigo: t.codigo, lineas: t.lineas, version: 1 }); continue }
    if (firmaLineas(b.lineas) === firma) { analisis.sin_cambios.push({ codigo: t.codigo, lineas: t.lineas, version: b.version }); continue }
    analisis.modificado.push({
      codigo: t.codigo, lineas: t.lineas, version: Number(b.version ?? 1) + 1,
      difiere: [`${(b.lineas ?? []).length} línea(s) vigentes → ${t.lineas.length} en el libro`],
    })
  }

  const contar = (c) => Object.fromEntries(ESTADOS.map((e) => [e, c[e].length]))
  return {
    recurso, precio, tarea_tipo, analisis,
    resumen: { recurso: contar(recurso), precio: contar(precio), tarea_tipo: contar(tarea_tipo), analisis: contar(analisis) },
  }
}
