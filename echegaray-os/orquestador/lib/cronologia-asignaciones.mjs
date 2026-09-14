// LA CRONOLOGÍA DE OBRA DE CADA EMPLEADO — una sola línea de tiempo, decidida al ESCRIBIR.
//
// ═══ POR QUÉ EXISTE (dueño, 14/09/2026) ═══
//
// «…además del error en la cronologia de cada empleado q no estas guardando ni respetando». El
// desempate al leer (`asignacion-del-dia.mjs`) tapaba el síntoma: la base seguía guardando a la misma
// persona en dos obras el mismo día. Medido ese día: 158 pares app × reconstruida y 9 app × app. Tres
// caminos los fabricaban — mover a alguien sólo cerraba las abiertas, el alta desde la obra no cerraba
// nada, y la reconstrucción desde JORNALES no se recortaba contra lo cargado en la app.
//
// Sin dependencias a propósito: lo importan la app (TypeScript) y el orquestador, igual que el
// desempate de lectura. Una sola definición de qué pisa a qué.
//
// ═══ LAS TRES REGLAS ═══
//
// a) ASIGNAR DESDE D CIERRA LO ANTERIOR. La asignación de la persona a OTRA obra que está abierta o
//    cubre D se cierra con hasta = D−1. La que empieza en D o después y queda adentro del tramo nuevo
//    se reemplaza; la que sigue después del fin del tramo nuevo se recorta.
//    EXCEPCIÓN — EL DÍA SUELTO: una asignación de UN día (desde = hasta) dentro de un tramo largo es una
//    excepción cargada a propósito. Guardarla no parte el tramo largo: la lectura ya la resuelve (gana
//    la más corta). Partirlo multiplicaría filas por cada día suelto y, al cancelar el día, habría que
//    volver a coser el tramo a mano.
// b) LO RECONSTRUIDO CEDE. Una fila reconstruida desde JORNALES no cubre días que ya cubre una fila de
//    la app o del dueño (salvo sus días sueltos, por la misma excepción).
// c) EL ORQUESTADOR NUNCA TOCA UNA FILA DE LA APP O DEL DUEÑO. La normalización sólo les puede cerrar
//    `hasta` según a); reemplazar o recortar una fila de persona es decisión del dueño, y se lista.
//
// ═══ LA FILA SIN `desde` ═══
//
// La grilla creó filas sin `desde` hasta el 08/09. Leída literal, «Pisos Industriales desde siempre»
// pisa ocho meses de historia que JORNALES sí documenta. La fila no afirma nada anterior a su
// creación: su comienzo efectivo es el día (San Juan) de `creado_en`. INFERENCIA de confianza alta —
// es el día en que alguien eligió esa obra—; se usa para decidir y NUNCA se escribe en la fila. Si
// además su `hasta` es anterior a la creación (cierres cargados después), no hay comienzo que inferir:
// queda `sinFecha` y no pisa ni recorta nada.

export const MARCA_RECONSTRUIDA = 'historial reconstruido desde JORNALES (sheet)'
const FIN = '9999-12-31'
const DIA_MS = 86_400_000

const iso = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : x ? String(x).slice(0, 10) : null)
const mover = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)
export const diaAnterior = (d) => mover(d, -1)
export const diaSiguiente = (d) => mover(d, 1)

/** El día en San Juan (UTC−3) de un timestamp. `creado_en` viaja como Date (pg) o ISO (PostgREST). */
export function diaSanJuan(ts) {
  if (!ts) return null
  const ms = ts instanceof Date ? ts.getTime() : Date.parse(String(ts))
  return Number.isFinite(ms) ? new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10) : null
}

export const esDePrueba = (a) => /PRUEBA|ZZ-E2E/i.test(a.notas ?? '') || /^ZZ/i.test(a.obra_id ?? '')

/** 'reconstruida' | 'dueno' | 'app' | 'prueba'. Dueño y app se protegen igual; se separan para el informe. */
export function origenDe(a) {
  if (esDePrueba(a)) return 'prueba'
  const notas = a.notas ?? ''
  if (notas.includes(MARCA_RECONSTRUIDA)) return 'reconstruida'
  return notas.trim() ? 'dueno' : 'app'
}
export const esDePersona = (a) => ['app', 'dueno'].includes(origenDe(a))

/** Un día suelto: `desde = hasta` escrito así en la fila. Un comienzo inferido no lo convierte en uno. */
export const esUnDia = (a) => Boolean(iso(a.desde)) && iso(a.desde) === iso(a.hasta)

/** El tramo que la fila afirma de verdad. Ver «LA FILA SIN `desde`» arriba. */
export function tramoEfectivo(a) {
  const desde = iso(a.desde)
  const hasta = iso(a.hasta)
  if (desde || origenDe(a) === 'reconstruida') return { desde, hasta, sinFecha: false }
  const creada = diaSanJuan(a.creado_en)
  if (!creada) return { desde: null, hasta, sinFecha: false }
  if (hasta && hasta < creada) return { desde: null, hasta, sinFecha: true }
  return { desde: creada, hasta, sinFecha: false }
}

const solapan = (a, b) => (a.desde ?? '') <= (b.hasta ?? FIN) && (b.desde ?? '') <= (a.hasta ?? FIN)

/**
 * REGLA a) Qué pasa con las OTRAS asignaciones de la persona cuando se la asigna a `nueva.obra_id`
 * desde `nueva.desde` (y hasta `nueva.hasta`, o abierta). Las de la MISMA obra no se miran: eso lo
 * resuelve cada camino con el índice `obra_asignacion_una_vigente`.
 *
 * @param filas  las asignaciones de la persona `{ id, obra_id, desde, hasta, notas?, creado_en? }`
 * @param nueva  `{ obra_id, desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' | null }`
 * @returns `{ cerrar: [{ id, hasta, continua }], reemplazar: [{ id }], recortar: [{ id, desde }] }`
 *   `continua` es el pedazo que la fila cerrada seguía cubriendo después del tramo nuevo (el pase de
 *   tres días): `{ obra_id, desde, hasta }` o null. Quien llama decide si lo reabre.
 */
export function planDeAsignacion(filas = [], nueva) {
  // El tipo explícito es para la app: sin él, TypeScript infiere `never[]` de las listas vacías.
  /** @type {{ cerrar: { id: string, hasta: string, continua: { obra_id: string, desde: string, hasta: string | null } | null }[], reemplazar: { id: string }[], recortar: { id: string, desde: string }[] }} */
  const plan = { cerrar: [], reemplazar: [], recortar: [] }
  if (!nueva?.desde) throw new Error('planDeAsignacion: la asignación nueva necesita `desde`')
  // `unDia` explícito gana: la normalización arma `nueva` con el comienzo INFERIDO de una fila sin
  // `desde`, y si se creó el mismo día que cerró parecería un día suelto sin haberlo escrito nadie así.
  if (nueva.unDia ?? esUnDia(nueva)) return plan
  const D = iso(nueva.desde)
  const finNueva = iso(nueva.hasta) ?? FIN
  for (const f of filas) {
    if (f.obra_id === nueva.obra_id || esDePrueba(f)) continue
    const t = tramoEfectivo(f)
    if (t.sinFecha || !solapan(t, { desde: D, hasta: finNueva })) continue
    if (!t.desde || t.desde < D) {
      const sigue = (t.hasta ?? FIN) > finNueva
      plan.cerrar.push({
        id: f.id, hasta: diaAnterior(D),
        continua: sigue ? { obra_id: f.obra_id, desde: diaSiguiente(finNueva), hasta: t.hasta } : null,
      })
    } else if ((t.hasta ?? FIN) <= finNueva) {
      plan.reemplazar.push({ id: f.id })
    } else {
      plan.recortar.push({ id: f.id, desde: diaSiguiente(finNueva) })
    }
  }
  return plan
}

/** Los días que cubren las filas de persona (app o dueño) de UNA persona, sin sus días sueltos. */
function tramosDePersona(filas, personaId) {
  return filas
    .filter((a) => a.persona_id === personaId && esDePersona(a) && !esUnDia(a))
    .map(tramoEfectivo)
    .filter((t) => !t.sinFecha)
    .map((t) => ({ desde: t.desde ?? '', hasta: t.hasta ?? FIN }))
}

/** `[desde, hasta]` menos la unión de `cortes`. Devuelve los pedazos que quedan, en orden. */
export function restarTramos({ desde, hasta }, cortes) {
  let pedazos = [{ desde, hasta: hasta ?? FIN }]
  for (const c of cortes) {
    const siguen = []
    for (const p of pedazos) {
      if (!solapan(p, c)) { siguen.push(p); continue }
      if (p.desde < c.desde) siguen.push({ desde: p.desde, hasta: diaAnterior(c.desde) })
      if (c.hasta !== FIN && c.hasta < p.hasta) siguen.push({ desde: diaSiguiente(c.hasta), hasta: p.hasta })
    }
    pedazos = siguen
  }
  return pedazos.map((p) => ({ desde: p.desde, hasta: p.hasta === FIN ? null : p.hasta }))
}

/**
 * REGLA b) Los tramos reconstruidos que el orquestador quiere tener, recortados contra lo que ya
 * cubren las filas de persona. Un tramo tapado entero desaparece; uno tapado en el medio se parte.
 * Lo usan `conciliar` (reconstrucción y timer) y la normalización: las dos llegan al mismo conjunto.
 */
export function cederAnteLaApp(tramos = [], existentes = []) {
  const salida = []
  for (const t of tramos) {
    const cortes = tramosDePersona(existentes, t.persona_id)
    for (const p of restarTramos({ desde: iso(t.desde), hasta: iso(t.hasta) }, cortes)) {
      salida.push({ ...t, desde: p.desde, hasta: p.hasta })
    }
  }
  return salida
}

/**
 * Pares de filas de la misma persona que cubren algún día en común, clasificados.
 * `clase`: 'app-app' | 'app-reconstruida' | 'reconstruida-reconstruida' (dueño cuenta como app).
 */
export function superposiciones(filas = []) {
  const reales = filas.filter((a) => !esDePrueba(a))
  const porPersona = new Map()
  for (const a of reales) {
    if (!porPersona.has(a.persona_id)) porPersona.set(a.persona_id, [])
    porPersona.get(a.persona_id).push(a)
  }
  const pares = []
  for (const fs of porPersona.values()) {
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const [a, b] = [fs[i], fs[j]]
        const [ta, tb] = [tramoEfectivo(a), tramoEfectivo(b)]
        if (ta.sinFecha || tb.sinFecha || !solapan(ta, tb)) continue
        const g = (x) => (origenDe(x) === 'reconstruida' ? 'reconstruida' : 'app')
        pares.push({
          a, b, clase: [g(a), g(b)].sort().join('-'),
          mismaObra: a.obra_id === b.obra_id, unDia: esUnDia(a) || esUnDia(b),
        })
      }
    }
  }
  return pares
}
