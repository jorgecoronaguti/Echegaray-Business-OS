// QUÉ SE ESCRIBE Y QUÉ SE BORRA EN LAS TABLAS DE IMPUESTOS — y cuándo NO se toca nada.
//
// NÚCLEO PURO. El sincronizador lee cada fuente con un LECTOR (la DDJJ de IVA, el extracto, Compras…)
// y cada fila que escribe lleva el nombre de su lector. Con eso la regla es una sola:
//
//   · un lector que LEYÓ BIEN manda sobre sus filas: se hace upsert de lo que trajo y se borra lo suyo
//     que ya no está en la fuente (un comprobante de Compras que el dueño marcó ELIMINADO, una DDJJ de
//     cálculo que ya tiene F.2051);
//   · un lector que FALLÓ no toca nada suyo. Drive caído no es «no hay DDJJ»: borrar por eso es
//     exactamente la guarda que falló cerrada y se llevó la pestaña Proveedores entera.
//   · un lector que leyó bien pero su FUENTE vino vacía (cero filas leídas) donde la base tiene alguna
//     tampoco borra: es más probable una lectura vacía (un rango movido, un encabezado renombrado) que
//     una fuente vaciada, y el costo es asimétrico — no borrar deja una fila vieja visible; borrar la
//     pierde. Se mira lo LEÍDO y no lo producido: el cálculo de IVA sobre ARCA produce cero filas el
//     mes en que todas tienen F.2051, y ahí sus filas viejas SÍ tienen que irse.
//
// Upsert y no «borrar todo y reinsertar»: las tablas avisan por tiempo real, y una corrida que no
// cambió nada tiene que ser una corrida que no avisa.

/**
 * LO PRESENTADO NO SE BORRA NUNCA POR AUSENCIA. Una DDJJ presentada es un hecho histórico: si una
 * corrida no la ve, es que el PDF no se pudo leer (el lector de Drive avisa por consola y sigue, no
 * falla), no que se despresentó. Una rectificativa llega con el mismo período y la pisa el upsert.
 */
export const NUNCA_BORRA = Object.freeze(['ddjj_iva_pdf', 'ddjj_iibb_pdf', 'ddjj_ganancias_pdf', 'f931_raw'])

/** La clave natural de cada tabla. Es la misma `unique` de la migración 20260916T2000. */
export const CLAVE = {
  obligacion: (o) => `${o.impuesto}|${o.periodo}|${o.concepto}|${o.fuente}`,
  pago: (p) => `${p.fuente}|${p.referencia}`,
}

/**
 * @param {object} p
 * @param {'obligacion'|'pago'} p.tabla
 * @param {Record<string, {ok: boolean, leidas?: number, error?: string}>} p.lectores estado de cada lector:
 *   `leidas` = filas crudas que trajo su fuente (no las que produjo)
 * @param {object[]} p.nuevas filas producidas (cada una con `lector`)
 * @param {{clave: string, lector: string}[]} p.existentes lo que hay hoy en la base
 * @returns {{upsert: object[], borrar: string[], retenidos: {lector: string, motivo: string}[]}}
 */
export function planDeEscritura({ tabla, lectores = {}, nuevas = [], existentes = [] }) {
  const clave = CLAVE[tabla]
  if (!clave) throw new Error(`planDeEscritura: tabla desconocida «${tabla}»`)
  const retenidos = []
  const okDe = (l) => lectores[l]?.ok === true

  const upsert = []
  const vistas = new Set()
  for (const n of nuevas) {
    if (!n.lector) throw new Error(`planDeEscritura: fila sin lector (${clave(n)}) — no se puede saber quién la borra`)
    if (!okDe(n.lector)) continue
    const k = clave(n)
    // Dos filas con la misma clave natural en la misma corrida: la segunda pisaría a la primera en el
    // upsert y Postgres rechaza el lote entero («cannot affect row a second time»). Se avisa arriba.
    if (vistas.has(k)) throw new Error(`planDeEscritura: clave repetida en la misma corrida: ${k}`)
    vistas.add(k)
    upsert.push(n)
  }

  const porLector = new Map()
  for (const e of existentes) porLector.set(e.lector, [...(porLector.get(e.lector) ?? []), e.clave])
  const borrar = []
  for (const [lector, claves] of porLector) {
    if (!okDe(lector)) {
      retenidos.push({ lector, motivo: lectores[lector] ? `el lector falló: ${lectores[lector].error ?? 'sin detalle'}` : 'el lector no corrió en esta corrida' })
      continue
    }
    if (NUNCA_BORRA.includes(lector)) {
      const faltan = claves.filter((k) => !vistas.has(k)).length
      if (faltan) retenidos.push({ lector, motivo: `${faltan} declaración(es) presentada(s) no aparecieron en esta lectura: se conservan` })
      continue
    }
    if (!(lectores[lector].leidas > 0)) {
      retenidos.push({ lector, motivo: `su fuente vino vacía y la base tiene ${claves.length}: no se borra por una lectura vacía` })
      continue
    }
    for (const k of claves) if (!vistas.has(k)) borrar.push(k)
  }
  return { upsert, borrar, retenidos }
}

/**
 * DE QUIÉN DEPENDE CADA LECTOR. Un lector que leyó bien su fuente pero cuyo insumo falló produce filas
 * DEGRADADAS, no filas vacías: sin `_F931_RAW` los VEP del banco salen «sin imputar» y pisarían los que
 * hoy están imputados; sin la F.2051 el cálculo de IVA arranca sin saldo y publica meses que ya tienen
 * DDJJ. Por eso hereda el fallo, y con él la regla de no tocar nada.
 */
export const DEPENDE = Object.freeze({
  arca_iva: ['arca', 'ddjj_iva_pdf', 'cobranzas', 'banco'],
  arca_iibb: ['arca', 'ddjj_iibb_pdf', 'cobranzas'],
  // Sin los comprobantes de VEP, el VEP parcial de junio vuelve a «sin imputar» y pisaría su imputación.
  banco: ['f931_raw', 'compras', 'vep_pdf'],
  compras: ['f931_raw', 'vep_pdf'],
})

/** El estado de cada lector con el fallo de sus insumos propagado. PURA. */
export function lectoresEfectivos(estado = {}) {
  const out = {}
  const resolver = (l, visitando = new Set()) => {
    if (out[l]) return out[l]
    const propio = estado[l] ?? { ok: false, error: 'no corrió' }
    if (visitando.has(l)) throw new Error(`lectoresEfectivos: dependencia circular en ${l}`)
    visitando.add(l)
    const caido = (DEPENDE[l] ?? []).find((d) => !resolver(d, visitando).ok)
    out[l] = propio.ok && caido ? { ...propio, ok: false, error: `depende de ${caido}, que falló` } : propio
    return out[l]
  }
  for (const l of new Set([...Object.keys(estado), ...Object.keys(DEPENDE)])) resolver(l)
  return out
}
