// V0 CONTRA EL HISTÓRICO — y la clasificación de por qué difieren. Puro.
//
// ═══ EL HISTÓRICO NO TIENE RAZÓN POR SER HISTÓRICO ═══
//
// Una diferencia es una PREGUNTA, no un error de XSAS. Sobre Quattropani hay un ejemplo que lo
// demuestra: la cotización aprobada dice «Nota 1: La cotizacion contempla SOLO mano de obra» y
// «Nota 3: No se contempla entrepiso ni escalera». Eso no está en ningún plano — es una decisión
// COMERCIAL. XSAS computó el entrepiso y la escalera porque estaban dibujados, y computarlos fue
// correcto: lo que faltaba era el alcance, que ningún plano puede dar.
//
// Por eso la causa `alcance_no_documentado` existe con nombre propio y no se disfraza de error de
// interpretación. Confundirlas haría que el aprendizaje «corrigiera» a XSAS para que deje de leer
// lo que el plano dice, que es exactamente lo contrario de lo que hay que aprender.
//
// ═══ LAS CAUSAS ═══
//
// Son las diez del método, con nombre en vez de letra: una letra en una tabla no dice nada seis
// meses después. Cada una implica un arreglo distinto, y ahí está el valor de clasificar.

/** Por qué V0 y el histórico dicen cosas distintas. Cada causa se arregla en un lugar distinto. */
export const CAUSA = Object.freeze({
  INTERPRETACION: { clave: 'interpretacion_del_plano', arregla: 'el prompt de lectura o la segunda pasada de medición' },
  DOCUMENTACION: { clave: 'documentacion_faltante', arregla: 'conseguir la lámina o el dato que falta (o abrir el DWG)' },
  COMPUTO: { clave: 'regla_de_computo', arregla: 'la fórmula o el criterio de medición del motor' },
  BASE_MAESTRA: { clave: 'base_maestra', arregla: 'falta una partida, o la elegida no es la correcta' },
  COMPOSICION: { clave: 'composicion', arregla: 'el análisis de precios de esa tarea' },
  RENDIMIENTO: { clave: 'rendimiento', arregla: 'las HH unitarias de la composición' },
  PRECIO: { clave: 'precio', arregla: 'el precio del recurso' },
  ALCANCE: { clave: 'alcance_no_documentado', arregla: 'nada de XSAS: es una decisión comercial que hay que declarar antes de cotizar' },
  ERROR_HISTORICO: { clave: 'error_del_historico', arregla: 'el histórico, si se confirma' },
  OTRO: { clave: 'otro', arregla: 'a determinar' },
})

const TOLERANCIA_PCT = 5

/** `M3` y `m3` son la misma unidad. Sin esto la comparación marcaba «XSAS midió en M3 y el
 *  histórico en m3» y clasificaba como problema de Base Maestra lo que era una diferencia de
 *  MEDICIÓN — mandando el arreglo al lugar equivocado, que es todo lo que la clasificación tiene
 *  que evitar. */
const mismaUnidad = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

const pct = (a, b) => (b === 0 || b === null || a === null ? null : Math.round(((a - b) / b) * 1000) / 10)

/** Índice por código de partida. Dos partidas del mismo código se suman: el histórico las separa a
 *  veces por frente y la comparación es por partida, no por renglón. PURA. */
function indexar(partidas = [], campos) {
  const m = new Map()
  for (const p of partidas) {
    const k = String(p[campos.codigo] ?? '')
    if (!k) continue
    const prev = m.get(k)
    m.set(k, prev
      ? { ...prev, cantidad: prev.cantidad + Number(p[campos.cantidad] ?? 0), subtotal: prev.subtotal + Number(p[campos.subtotal] ?? 0) }
      : { codigo: k, descripcion: p[campos.descripcion], unidad: p[campos.unidad], cantidad: Number(p[campos.cantidad] ?? 0), subtotal: Number(p[campos.subtotal] ?? 0) })
  }
  return m
}

/**
 * LA COMPARACIÓN. `elementos` es el cómputo de XSAS: sirve para distinguir una partida que XSAS
 * NUNCA VIO de una que vio y no pudo computar. Son dos fallas distintas y se arreglan distinto —
 * la primera es de lectura, la segunda es de documentación.
 */
export function comparar({ v0 = [], historico = [], elementos = [], camposV0, camposHist } = {}) {
  const a = indexar(v0, camposV0 ?? { codigo: 'codigo', descripcion: 'descripcion', unidad: 'unidad', cantidad: 'cantidad', subtotal: 'subtotal' })
  const b = indexar(historico, camposHist ?? { codigo: 'codigo', descripcion: 'descripcion', unidad: 'unidad', cantidad: 'cantidad', subtotal: 'subtotal' })
  const detectados = new Set(elementos.map((e) => String(e.id)))
  const conHueco = new Map(elementos.filter((e) => e.cantidad === null).map((e) => [String(e.id), e.faltan?.join('; ') ?? '']))

  const diferencias = []
  for (const [k, h] of b) {
    const x = a.get(k)
    if (!x) {
      // ¿Es que no lo leyó, o que lo leyó y no lo pudo medir? Los huecos declarados lo dicen.
      const huecoRelacionado = [...conHueco.entries()].find(([, motivo]) => motivo && String(h.descripcion ?? '').toLowerCase().split(' ').some((w) => w.length > 5 && motivo.toLowerCase().includes(w)))
      diferencias.push({
        codigo: k, descripcion: h.descripcion, tipo: 'falta_en_v0',
        historico: { cantidad: h.cantidad, unidad: h.unidad, subtotal: h.subtotal }, v0: null,
        causa: huecoRelacionado ? CAUSA.DOCUMENTACION : CAUSA.INTERPRETACION,
        detalle: huecoRelacionado ? `XSAS lo detectó y no lo pudo medir: ${huecoRelacionado[1]}` : 'XSAS no lo identificó como elemento en las láminas legibles',
      })
      continue
    }
    const dCant = pct(x.cantidad, h.cantidad)
    const dCosto = pct(x.subtotal, h.subtotal)
    if (dCant !== null && Math.abs(dCant) > TOLERANCIA_PCT) {
      diferencias.push({
        codigo: k, descripcion: h.descripcion, tipo: 'cantidad',
        historico: { cantidad: h.cantidad, unidad: h.unidad, subtotal: h.subtotal },
        v0: { cantidad: x.cantidad, unidad: x.unidad, subtotal: x.subtotal },
        desvioCantidadPct: dCant, desvioCostoPct: dCosto,
        causa: mismaUnidad(x.unidad, h.unidad) ? CAUSA.COMPUTO : CAUSA.BASE_MAESTRA,
        detalle: mismaUnidad(x.unidad, h.unidad) ? 'misma partida y misma unidad: la diferencia está en la medición' : `XSAS midió en ${x.unidad} y el histórico en ${h.unidad}`,
      })
      continue
    }
    if (dCosto !== null && Math.abs(dCosto) > TOLERANCIA_PCT) {
      diferencias.push({
        codigo: k, descripcion: h.descripcion, tipo: 'costo',
        historico: { cantidad: h.cantidad, subtotal: h.subtotal }, v0: { cantidad: x.cantidad, subtotal: x.subtotal },
        desvioCostoPct: dCosto, causa: CAUSA.PRECIO,
        detalle: 'la cantidad coincide y el costo no: es composición o precio del recurso',
      })
    }
  }
  for (const [k, x] of a) {
    if (b.has(k)) continue
    diferencias.push({
      codigo: k, descripcion: x.descripcion, tipo: 'sobra_en_v0',
      historico: null, v0: { cantidad: x.cantidad, unidad: x.unidad, subtotal: x.subtotal },
      causa: CAUSA.ALCANCE,
      detalle: 'XSAS lo computó del plano y el histórico no lo cotizó: o el alcance lo excluía, o el histórico lo omitió',
    })
  }

  const sumar = (m) => [...m.values()].reduce((s, p) => s + (p.subtotal ?? 0), 0)
  return {
    diferencias,
    coincidentes: [...b.keys()].filter((k) => a.has(k)),
    totalV0: sumar(a), totalHistorico: sumar(b),
    desvioTotalPct: pct(sumar(a), sumar(b)),
    partidasV0: a.size, partidasHistorico: b.size,
    detectados: detectados.size,
    porCausa: diferencias.reduce((acc, d) => { acc[d.causa.clave] = (acc[d.causa.clave] ?? 0) + 1; return acc }, {}),
  }
}
