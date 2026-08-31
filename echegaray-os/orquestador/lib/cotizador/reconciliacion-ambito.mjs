// RECONCILIAR DOS CÓMPUTOS DEL MISMO ÁMBITO — ítem por ítem, con veredicto y evidencia.
//
// ═══ QUÉ FALTABA ═══
//
// `ambito-planillas.mjs` ya medía la BRECHA entre versiones —sobre ARCOR · FILTRO SANITARIO da
// $ 31.882.681 entre el pedido del cliente (22 ítems, $ 45.098.706) y el cómputo que rige (12 ítems,
// $ 13.216.025)— y `suministro-del-cliente.mjs` ya detectaba el material que el cliente provee. Los
// dos números salían, y nadie podía decir QUÉ ítem explica cada peso: una diferencia de treinta y un
// millones sin desglose no se puede llevar a una reunión con el cliente.
//
// Esto no reemplaza a ninguno de los dos: los cruza y le pone nombre a cada renglón.
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTO: SIMILAR ≠ MISMA PARTIDA ═══
//
// Dos ítems son el mismo ítem cuando su unidad y su descripción normalizada son IGUALES. No
// parecidas: iguales. Un par que se parece mucho y no coincide sale `UNRESOLVED` con el candidato
// adjunto para que lo mire una persona, nunca `MATCH`. Emparejar por similitud es exactamente cómo
// se concilia de más: dos renglones distintos se dan por el mismo, la diferencia desaparece del
// informe y nadie vuelve a mirarla.
//
// ═══ POR QUÉ EL CERO NO APARECE EN NINGUNA PARTE ═══
//
// Un ítem sin cantidad legible no es un ítem de cantidad cero, y un ítem sin importe no vale $ 0: los
// dos salen `UNRESOLVED` con el motivo. La suma de plata de cada veredicto es `null` cuando ningún
// renglón de ese veredicto pudo valorizarse — no cero.

import { issue, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'

/** Los seis resultados posibles de reconciliar un renglón. Cada uno con evidencia, siempre. */
export const VEREDICTO = Object.freeze({
  /** Mismo ítem, misma cantidad, en los dos cómputos. */
  MATCH: 'MATCH',
  /** Mismo ítem, distinta cantidad. La diferencia está medida. */
  DIFFERENCE: 'DIFFERENCE',
  /** Misma descripción y unidades que no se pueden comparar. No se elige una: se dice. */
  CONFLICT: 'CONFLICT',
  /** Está en el cómputo que NO rige y no tiene par en el que rige: salió del alcance cotizado. */
  EXCLUDED: 'EXCLUDED',
  /** El ítem cerró contra una partida cuyo análisis COMPRA material que el cliente ya provee. */
  CLIENT_SUPPLIED: 'CLIENT_SUPPLIED',
  /** No se pudo decidir, y se dice por qué. Nunca es un MATCH silencioso. */
  UNRESOLVED: 'UNRESOLVED',
})

const normal = (t) => String(t ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()

const claveDe = (i) => `${normal(i?.unidad)}|${normal(i?.descripcion).slice(0, 120)}`
const hayNumero = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
const importeDe = (i) => (hayNumero(i?.importe) ? Number(i.importe) : (hayNumero(i?.total) ? Number(i.total) : null))

/** Cuántas palabras comparten dos descripciones, sobre la más corta. PURA. Sólo se usa para OFRECER
 *  un candidato en un `UNRESOLVED`; nunca para decidir que dos ítems son el mismo. */
function parecido(a, b) {
  const pa = new Set(normal(a).split(' ').filter((w) => w.length > 3))
  const pb = new Set(normal(b).split(' ').filter((w) => w.length > 3))
  if (!pa.size || !pb.size) return 0
  const comunes = [...pa].filter((w) => pb.has(w)).length
  return Math.round((comunes / Math.min(pa.size, pb.size)) * 100) / 100
}

/** El mejor parecido de `item` contra `otros`, si supera el piso. PURA. */
function candidatoParecido(item, otros = [], piso = 0.6) {
  let mejor = null
  for (const o of otros) {
    const p = parecido(item.descripcion, o.descripcion)
    if (p >= piso && (!mejor || p > mejor.parecido)) mejor = { parecido: p, item: o.item ?? null, descripcion: String(o.descripcion ?? '').slice(0, 90), unidad: o.unidad ?? null }
  }
  return mejor
}

/** Un renglón reconciliado. PURA, congelado. La evidencia va SIEMPRE: sin ella el veredicto no se
 *  puede discutir, y un veredicto que no se puede discutir no sirve para decidir nada. */
const renglon = (veredicto, { clave, rige = null, pedido = null, plata = null, porQue, evidencia = {} }) =>
  Object.freeze({ veredicto, clave, rige, pedido, plata, porQue, evidencia: Object.freeze(evidencia) })

/** El ítem, reducido a lo que se cita. PURA. */
const cita = (i, documento) => (i ? Object.freeze({
  documento, hoja: i.hoja ?? null, fila: i.fila ?? null, item: i.item ?? null,
  descripcion: String(i.descripcion ?? '').slice(0, 120), unidad: i.unidad ?? null,
  cantidad: hayNumero(i.cantidad) ? Number(i.cantidad) : null, importe: importeDe(i),
}) : null)

/**
 * RECONCILIAR EL CÓMPUTO QUE RIGE CONTRA EL QUE NO. PURA.
 *
 * `rige` y `contra` son dos grillas de `grillasDelAmbito()`. `suministros` es el resultado de
 * `barrerSuministros()`: sus choques pisan cualquier otro veredicto, porque un ítem cuyo análisis
 * compra material que el cliente ya compró es un problema de plata aunque el ítem coincida perfecto.
 */
export function reconciliarAmbito({ rige = null, contra = null, suministros = null } = {}) {
  if (!rige || !contra) {
    return Object.freeze({
      renglones: Object.freeze([]), resumen: null, issues: Object.freeze([]),
      porQue: 'hacen falta DOS cómputos del mismo ámbito para reconciliar: con uno solo no hay contra qué',
    })
  }
  const itemsRige = rige.lectura?.items ?? []
  const itemsContra = contra.lectura?.items ?? []
  const porClaveContra = new Map(itemsContra.map((i) => [claveDe(i), i]))
  const porClaveRige = new Map(itemsRige.map((i) => [claveDe(i), i]))
  // Los elementos con choque de suministro, por el `item` de la planilla que los produjo.
  const conChoque = new Map((suministros?.conChoque ?? []).map((c) => [String(c.elemento), c]))

  const renglones = [
    ...itemsRige.map((i) => renglonDeRige(i, { porClaveContra, itemsContra, conChoque, rige, contra })),
    // Lo que está en el pedido y no en lo que rige: SALIÓ del alcance cotizado. Es la mitad de la
    // brecha que el cliente va a preguntar.
    ...itemsContra.filter((i) => !porClaveRige.has(claveDe(i))).map((i) => renglon(VEREDICTO.EXCLUDED, {
      clave: claveDe(i), pedido: cita(i, contra.nombre), plata: importeDe(i),
      porQue: `«${String(i.descripcion).slice(0, 70)}» está en «${contra.nombre}» y no en el cómputo que rige: salió del alcance cotizado`,
      evidencia: { candidatoParecido: candidatoParecido(i, itemsRige) },
    })),
  ]
  return Object.freeze({ renglones: Object.freeze(renglones), ...resumirYAvisar(renglones, { rige, contra }) })
}

/** El veredicto de un ítem del cómputo que rige. PURA. */
function renglonDeRige(i, { porClaveContra, itemsContra, conChoque, rige, contra }) {
  const clave = claveDe(i)
  const par = porClaveContra.get(clave) ?? null
  const choque = conChoque.get(String(i.item)) ?? null
  // ═══ EL CHOQUE DE SUMINISTRO GANA SOBRE CUALQUIER OTRO VEREDICTO ═══
  // Un ítem que coincide perfecto entre los dos cómputos y cuyo análisis compra el material que el
  // cliente ya compró es un MATCH que paga dos veces. El veredicto tiene que decir eso.
  if (choque) {
    return renglon(VEREDICTO.CLIENT_SUPPLIED, {
      clave, rige: cita(i, rige.nombre), pedido: cita(par, contra.nombre), plata: choque.plataEnRiesgo,
      porQue: choque.porQue,
      evidencia: { declarado: choque.declarados?.[0]?.literal ?? null, partida: choque.codigo, lineas: choque.lineas },
    })
  }
  if (!par) {
    const otroConMismaDescripcion = itemsContra.find((o) => normal(o.descripcion).slice(0, 120) === normal(i.descripcion).slice(0, 120))
    if (otroConMismaDescripcion) {
      return renglon(VEREDICTO.CONFLICT, {
        clave, rige: cita(i, rige.nombre), pedido: cita(otroConMismaDescripcion, contra.nombre), plata: importeDe(i),
        porQue: `el mismo ítem está en «${i.unidad}» en el cómputo que rige y en «${otroConMismaDescripcion.unidad}» en «${contra.nombre}»: multiplicar una por el precio de la otra da un número sin significado`,
        evidencia: { unidadRige: i.unidad, unidadPedido: otroConMismaDescripcion.unidad },
      })
    }
    return renglon(VEREDICTO.UNRESOLVED, {
      clave, rige: cita(i, rige.nombre), plata: importeDe(i),
      porQue: `«${String(i.descripcion).slice(0, 70)}» se está cotizando y no aparece en «${contra.nombre}»: o el cliente no lo pidió, o los dos documentos lo llaman distinto`,
      evidencia: { candidatoParecido: candidatoParecido(i, itemsContra) },
    })
  }
  if (!hayNumero(i.cantidad) || !hayNumero(par.cantidad)) {
    return renglon(VEREDICTO.UNRESOLVED, {
      clave, rige: cita(i, rige.nombre), pedido: cita(par, contra.nombre), plata: null,
      porQue: 'uno de los dos ítems no declara cantidad legible: NO es una cantidad de cero, es que no se puede comparar',
      evidencia: {},
    })
  }
  if (Number(i.cantidad) === Number(par.cantidad)) {
    return renglon(VEREDICTO.MATCH, {
      clave, rige: cita(i, rige.nombre), pedido: cita(par, contra.nombre), plata: importeDe(i),
      porQue: `misma unidad, misma descripción y misma cantidad (${i.cantidad} ${i.unidad}) en los dos cómputos`,
      evidencia: {},
    })
  }
  const delta = Number(i.cantidad) - Number(par.cantidad)
  return renglon(VEREDICTO.DIFFERENCE, {
    clave, rige: cita(i, rige.nombre), pedido: cita(par, contra.nombre), plata: importeDe(i),
    porQue: `la misma partida está computada ${i.cantidad} ${i.unidad} en el que rige y ${par.cantidad} en «${contra.nombre}»: ${delta > 0 ? '+' : ''}${Math.round(delta * 1000) / 1000}`,
    evidencia: { cantidadRige: Number(i.cantidad), cantidadPedido: Number(par.cantidad), delta },
  })
}

/** El resumen por veredicto y los issues que van a la cola. PURA. */
function resumirYAvisar(renglones, { rige, contra }) {
  const de = (v) => renglones.filter((r) => r.veredicto === v)
  // La plata de un veredicto es `null` cuando NINGÚN renglón se pudo valorizar. Cero significaría
  // «se sacó algo que no vale nada», que es otra afirmación.
  const plata = (v) => {
    const con = de(v).filter((r) => hayNumero(r.plata))
    return con.length ? Math.round(con.reduce((a, r) => a + Number(r.plata), 0) * 100) / 100 : null
  }
  const resumen = Object.freeze(Object.fromEntries(Object.values(VEREDICTO).map((v) =>
    [v, Object.freeze({ n: de(v).length, plata: plata(v), sinValorizar: de(v).filter((r) => !hayNumero(r.plata)).length })])))

  const issues = [
    ...de(VEREDICTO.CLIENT_SUPPLIED).map((r) => issue({
      type: TIPO_ISSUE.CONFLICTO, severity: SEVERIDAD.BLOQUEANTE, entity: `reconciliacion:${r.rige?.item ?? r.clave}`,
      impact: r.plata, evidence: r.evidencia, detalle: r.porQue, recommended_action: null,
    })),
    ...de(VEREDICTO.CONFLICT).map((r) => issue({
      type: TIPO_ISSUE.CONFLICTO, severity: SEVERIDAD.BLOQUEANTE, entity: `reconciliacion:${r.rige?.item ?? r.clave}`,
      impact: r.plata, evidence: r.evidencia, detalle: r.porQue, recommended_action: null,
    })),
    ...de(VEREDICTO.DIFFERENCE).map((r) => issue({
      type: TIPO_ISSUE.CONFLICTO, severity: SEVERIDAD.ALTA, entity: `reconciliacion:${r.rige?.item ?? r.clave}`,
      impact: r.plata, evidence: r.evidencia, detalle: r.porQue, recommended_action: null,
    })),
    // Lo excluido NO bloquea —cotizar menos de lo que el cliente pidió puede ser correcto— pero su
    // plata es la respuesta a «¿por qué tu oferta es más barata que la otra?».
    ...(de(VEREDICTO.EXCLUDED).length ? [issue({
      type: TIPO_ISSUE.EXCLUSION_CON_COMPUTO, severity: SEVERIDAD.ALTA, entity: `reconciliacion:${contra.nombre}`,
      impact: plata(VEREDICTO.EXCLUDED),
      evidence: { items: de(VEREDICTO.EXCLUDED).map((r) => r.pedido?.item ?? r.clave).slice(0, 20) },
      detalle: `${de(VEREDICTO.EXCLUDED).length} ítem(s) de «${contra.nombre}» no están en el cómputo que rige`,
      recommended_action: 'include_scope',
    })] : []),
  ]
  return {
    resumen, issues: Object.freeze(issues),
    porQue: `«${rige.nombre}» (${rige.items} ítems) contra «${contra.nombre}» (${contra.items} ítems): `
      + Object.values(VEREDICTO).map((v) => `${resumen[v].n} ${v}`).join(' · '),
  }
}
