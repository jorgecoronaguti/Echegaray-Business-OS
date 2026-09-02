// EL RAZONAMIENTO DEL COTIZADOR — los pasos del dueño (02/09/2026), contestables uno por uno.
//
//   1. superficie de impronta/cubierta · semicubierta
//   2. cuántas bases por tipo (B0=n, B1=n…) · muertos de anclaje · secciones
//   3. cuántas vigas de fundación · arriostramientos · vigas de carga · ¿sísmica?
//   4. cuántas columnas de carga · encadenados
//   5. longitud unitaria de viga entre columna y columna
//   6. lectura X/Y — el barrido del plano
//   X. excavaciones: SABER PROFUNDIDADES
//
// Todo sale del MISMO pipeline que cotiza (láminas interpretadas + cómputo): acá no se mide nada
// nuevo — se ORDENA lo medido según las preguntas que un cotizador se hace, y se dice con nombre
// propio lo que la documentación NO declara. La regla de siempre: la profundidad, la sección y la
// superficie salen de una CITA del plano o salen como FALTA_DATO. Nunca de un supuesto.
//
// PURO: sin red, sin base, sin modelo. La entrada es el resultado de `pipeline.correr()`.

import { computarExcavacion } from '../computo-constructivo.mjs'

/** El rol constructivo de un elemento. El ORDEN de las reglas decide: lo específico primero —
 *  un «muerto de anclaje» matchea /base|muerto/ del vocabulario viejo y se perdía adentro de
 *  las bases; una «viga de fundación» no es una viga de carga. */
export const ROL = Object.freeze({
  MUERTO: 'muerto_de_anclaje',
  BASE: 'base',
  VIGA_FUNDACION: 'viga_de_fundacion',
  ARRIOSTRAMIENTO: 'arriostramiento',
  ENCADENADO: 'encadenado',
  COLUMNA: 'columna',
  VIGA_CARGA: 'viga_de_carga',
  EXCAVACION: 'excavacion',
  OTRO: 'otro',
})

const REGLAS_DE_ROL = Object.freeze([
  // «Excavación de bases» es una excavación, no una base: la regla va ANTES que /bases?/.
  [ROL.EXCAVACION, /excavaci|zanja|desmonte/i],
  [ROL.MUERTO, /muerto/i],
  [ROL.VIGA_FUNDACION, /viga\s*(?:de\s*)?fundaci|(?:^|[^a-z])vf\d*(?:$|[^a-z])/i],
  [ROL.ENCADENADO, /encadenad/i],
  [ROL.ARRIOSTRAMIENTO, /arriostr|tensor|riostra|cruces?\s+de\s+san\s+andr[eé]s/i],
  [ROL.BASE, /\bbases?\b|zapata|cabezal|pilote|platea|(?:^|[^a-z])[bz]\d+(?:$|[^a-z])/i],
  [ROL.COLUMNA, /columna|pilar\b/i],
  [ROL.VIGA_CARGA, /\bvigas?\b|dintel/i],
])

export function rolDe(item) {
  const texto = `${item?.id ?? ''} ${item?.nombre ?? ''}`
  if (String(item?.sistema ?? '') === 'movimiento_suelo' && /excav|zanja|desmonte/i.test(texto)) return ROL.EXCAVACION
  for (const [rol, re] of REGLAS_DE_ROL) if (re.test(texto)) return rol
  return ROL.OTRO
}

/** La sección de un elemento: de sus dimensiones citadas, o del texto del plano (C1(30-50),
 *  60x60, 0,20×0,30). Sin cita no hay sección: se devuelve null, no un típico. */
export function seccionDe(item) {
  const d = item?.dimensiones ?? {}
  const n = (v) => (typeof v === 'number' && v > 0 ? v : (typeof v?.valor === 'number' && v.valor > 0 ? v.valor : null))
  const ancho = n(d.ancho_m ?? d.ancho), alto = n(d.alto_m ?? d.alto)
  if (ancho && alto) return { texto: `${redondo(ancho * 100)}×${redondo(alto * 100)} cm`, origen: 'dimensiones citadas del plano' }
  const literal = `${item?.especificacion ?? ''} ${item?.nombre ?? ''} ${item?.evidencia?.textoLiteral ?? ''}`
  const m = literal.match(/\(?(\d{1,3}(?:[.,]\d{1,2})?)\s*[x×\-\/]\s*(\d{1,3}(?:[.,]\d{1,2})?)\)?/)
  if (m) return { texto: `${m[1]}${literal.includes('-') ? '-' : '×'}${m[2]} (del texto del plano: «${m[0].trim()}»)`, origen: 'texto del plano' }
  return null
}

const redondo = (v) => (Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : v.toFixed(1))

const cantidadDe = (item) => (typeof item?.cantidadElementos === 'number' ? item.cantidadElementos : null)

/** Agrupa items de un rol por su denominación del plano (B0, B1, VF10…). */
function grupoPorTipo(items) {
  const grupos = new Map()
  for (const it of items) {
    const clave = String(it.id ?? it.nombre ?? 's/d')
    const g = grupos.get(clave) ?? { tipo: clave, nombre: it.nombre ?? null, cantidad: 0, sinCantidad: false, seccion: seccionDe(it), laminas: new Set(), faltan: [] }
    const n = cantidadDe(it)
    if (n === null) { g.sinCantidad = true; g.faltan.push(...(it.faltan ?? [])) } else g.cantidad += n
    if (it.lamina) g.laminas.add(it.lamina)
    grupos.set(clave, g)
  }
  return [...grupos.values()].map((g) => ({ ...g, laminas: [...g.laminas] }))
}

// ── LOS PASOS ────────────────────────────────────────────────────────────────────────────────

/** 1 · superficies: sólo las DECLARADAS (con cita) y la impronta como CÁLCULO declarado. */
export function pasoSuperficies(laminas = []) {
  const declaradas = []
  const improntas = []
  let cubiertaDeclarada = null
  for (const l of laminas) {
    const g = l?.grilla ?? {}
    for (const s of g.superficiesDeclaradas ?? []) declaradas.push({ ...s, lamina: l.lamina?.codigo ?? l.archivo })
    if (g.largoTotal && g.anchoTotal) {
      improntas.push({
        lamina: l.lamina?.codigo ?? l.archivo,
        area: g.largoTotal * g.anchoTotal,
        calculo: `${g.largoTotal} m × ${g.anchoTotal} m (dimensiones totales de la grilla${g.textoLiteral ? ` — «${g.textoLiteral}»` : ''})`,
      })
    }
    const sc = l?.proyecto?.superficie_cubierta_m2
    if (typeof sc === 'number' && sc > 0 && cubiertaDeclarada === null) cubiertaDeclarada = { area: sc, lamina: l.lamina?.codigo ?? l.archivo }
  }
  const faltan = []
  if (!cubiertaDeclarada && !declaradas.length) faltan.push('superficie cubierta: ningún rótulo ni planta la declara')
  if (!improntas.length) faltan.push('impronta: ninguna lámina trae las dimensiones totales de la grilla')
  faltan.push(...(declaradas.some((d) => /semicubiert/i.test(d.que ?? '')) ? [] : ['superficie semicubierta: no declarada en la documentación leída']))
  return { cubiertaDeclarada, declaradas, improntas, faltan }
}

/** 2 · bases por tipo + muertos de anclaje, con secciones. */
export function pasoBases(items = []) {
  return {
    bases: grupoPorTipo(items.filter((i) => rolDe(i) === ROL.BASE)),
    muertos: grupoPorTipo(items.filter((i) => rolDe(i) === ROL.MUERTO)),
  }
}

/** 3 · fundación lineal y arriostramiento + la pregunta sísmica (SÓLO si el plano la nombra). */
export function pasoVigasFundacion(items = [], laminas = []) {
  const textos = []
  for (const l of laminas) {
    for (const e of l?.elementos ?? []) textos.push(`${e?.especificacion ?? ''} ${e?.evidencia?.textoLiteral ?? ''}`)
    textos.push(`${(l?.proyecto?.notas_generales ?? []).join(' ')} ${l?.grilla?.textoLiteral ?? ''}`)
  }
  const sismo = textos.map((t) => t.match(/[^.]*(s[ií]smic|antis[ií]sm|inpres|cirsoc\s*103)[^.]*/i)).find(Boolean)
  return {
    vigasFundacion: grupoPorTipo(items.filter((i) => rolDe(i) === ROL.VIGA_FUNDACION)),
    arriostramientos: grupoPorTipo(items.filter((i) => rolDe(i) === ROL.ARRIOSTRAMIENTO)),
    vigasCarga: grupoPorTipo(items.filter((i) => rolDe(i) === ROL.VIGA_CARGA)),
    sismica: sismo
      ? { declarada: true, cita: sismo[0].trim().slice(0, 160) }
      : { declarada: false, nota: 'la documentación leída no menciona consideración sísmica — DESCONOCIDO, no «no tiene»' },
  }
}

/** 4 · columnas y encadenados. */
export function pasoColumnas(items = []) {
  return {
    columnas: grupoPorTipo(items.filter((i) => rolDe(i) === ROL.COLUMNA)),
    encadenados: grupoPorTipo(items.filter((i) => rolDe(i) === ROL.ENCADENADO)),
  }
}

/** 5 · luces entre ejes (grilla) y largo unitario de cada viga citado en el plano. */
export function pasoLuces(items = [], laminas = []) {
  const luces = []
  for (const l of laminas) {
    const g = l?.grilla ?? {}
    if (g.lucesEntreEjes?.length) luces.push({ lamina: l.lamina?.codigo ?? l.archivo, luces: g.lucesEntreEjes, cita: g.textoLiteral })
  }
  const vigas = items
    .filter((i) => [ROL.VIGA_CARGA, ROL.VIGA_FUNDACION, ROL.ENCADENADO].includes(rolDe(i)))
    .map((i) => {
      const largo = i?.dimensiones?.largo_m ?? i?.dimensiones?.largo
      const v = typeof largo === 'number' ? largo : (typeof largo?.valor === 'number' ? largo.valor : null)
      return v ? { tipo: i.id ?? i.nombre, largoUnitario: v, lamina: i.lamina } : null
    })
    .filter(Boolean)
  return {
    luces, vigas,
    faltan: luces.length || vigas.length ? [] : ['ninguna lámina declara luces entre ejes ni largos unitarios de viga — pedirlos al proyectista o medirlos sobre el plano acotado'],
  }
}

/** 6 · el barrido del plano: qué se leyó, con qué dimensiones totales, y qué NO se pudo leer. */
export function pasoBarrido(laminas = [], documentos = {}) {
  return {
    laminas: laminas.map((l) => ({
      lamina: l.lamina?.codigo ?? l.archivo,
      archivo: l.archivo,
      vistas: l.lamina?.vistas ?? [],
      elementos: (l.elementos ?? []).length,
      dimensionesTotales: l.grilla?.largoTotal && l.grilla?.anchoTotal ? `${l.grilla.largoTotal} × ${l.grilla.anchoTotal} m` : null,
    })),
    noLegibles: (documentos?.planos?.noLegibles ?? []).map((d) => d.name),
  }
}

/** X · excavaciones: el volumen SÓLO cuando ancho+largo+profundidad tienen cita; si no, el
 *  faltante con nombre. Conecta `computarExcavacion` (estaba escrito y sin llamar). */
export function pasoExcavaciones(items = []) {
  const n = (v) => (typeof v === 'number' && v > 0 ? v : (typeof v?.valor === 'number' && v.valor > 0 ? v.valor : null))
  const excavaciones = items.filter((i) => rolDe(i) === ROL.EXCAVACION).map((i) => {
    const d = i?.dimensiones ?? {}
    const ancho = n(d.ancho_m ?? d.ancho), largo = n(d.largo_m ?? d.largo), profundidad = n(d.profundidad_m ?? d.profundidad)
    const cantidad = cantidadDe(i)
    if (ancho && largo && profundidad) {
      const c = computarExcavacion({ ancho, largo, profundidad })
      const unitario = c.volumenBanco?.valor ?? null
      return {
        elemento: i.id ?? i.nombre, profundidad, cantidad,
        volumenBanco: unitario !== null && cantidad !== null ? unitario * cantidad : unitario,
        formula: `${ancho} × ${largo} × ${profundidad} m${cantidad !== null ? ` × ${cantidad} elemento(s)` : ''}`,
        nota: 'sin sobreancho de trabajo ni talud (los define la dirección técnica) y sin esponjamiento',
      }
    }
    return {
      elemento: i.id ?? i.nombre, profundidad: profundidad ?? null, cantidad,
      falta: ['ancho', 'largo', 'profundidad'].filter((k, ix) => ![ancho, largo, profundidad][ix]).join(', ') || null,
    }
  })
  const conVolumen = excavaciones.filter((e) => e.volumenBanco)
  const sinProfundidad = excavaciones.filter((e) => e.falta?.includes('profundidad'))
  return {
    excavaciones, conVolumen, sinProfundidad,
    faltan: excavaciones.length
      ? sinProfundidad.map((e) => `${e.elemento}: falta la PROFUNDIDAD en la documentación — sin ella no hay m³ (nunca se adopta una típica)`)
      : ['la documentación leída no declara excavaciones como elemento — las profundidades hay que pedirlas al proyectista'],
  }
}

/** El razonamiento completo sobre un resultado del pipeline. PURO. */
export function razonar(r) {
  const items = r?.computo?.items ?? []
  const laminas = r?.laminas ?? []
  return {
    superficies: pasoSuperficies(laminas),
    bases: pasoBases(items),
    fundacionLineal: pasoVigasFundacion(items, laminas),
    columnas: pasoColumnas(items, laminas),
    luces: pasoLuces(items, laminas),
    barrido: pasoBarrido(laminas, r?.documentos ?? {}),
    excavaciones: pasoExcavaciones(items),
  }
}

// ── EL TEXTO — los siete pasos como los pide el dueño, con faltantes con nombre ─────────────

const linea = (g) => `${g.tipo}=${g.sinCantidad ? `${g.cantidad || '?'} (cantidad incompleta: ${[...new Set(g.faltan)].slice(0, 1).join('')})` : g.cantidad}${g.seccion ? ` · sección ${g.seccion.texto}` : ' · sección sin cita en el plano'}`
const bloque = (rotulo, grupos) => (grupos.length ? `${rotulo}: ${grupos.map(linea).join(' · ')}` : `${rotulo}: ninguno detectado en la documentación leída`)

export function textoDeRazonamiento(rz, { proyecto = '' } = {}) {
  const s = rz.superficies
  const partes = [
    `**RAZONAMIENTO DEL COTIZADOR${proyecto ? ` — ${proyecto.toUpperCase()}` : ''}** (todo con cita del plano; lo que falta se nombra, no se inventa)`,
    '',
    `**1 · Superficies** — ${s.cubiertaDeclarada ? `cubierta declarada: ${s.cubiertaDeclarada.area} m² (${s.cubiertaDeclarada.lamina})` : 'cubierta: sin declarar'}`
      + (s.declaradas.length ? ` · declaradas por ambiente: ${s.declaradas.map((d) => `${d.que} ${d.area} m²`).join(', ')}` : '')
      + (s.improntas.length ? ` · impronta (CÁLCULO): ${s.improntas.map((i) => `${i.area.toFixed(1)} m² [${i.calculo}]`).join(' · ')}` : ''),
    `**2 · Bases** — ${bloque('bases', rz.bases.bases)} · ${bloque('muertos de anclaje', rz.bases.muertos)}`,
    `**3 · Fundación lineal** — ${bloque('vigas de fundación', rz.fundacionLineal.vigasFundacion)} · ${bloque('arriostramientos', rz.fundacionLineal.arriostramientos)} · ${bloque('vigas de carga', rz.fundacionLineal.vigasCarga)}`
      + `\n   sísmica: ${rz.fundacionLineal.sismica.declarada ? `mencionada — «${rz.fundacionLineal.sismica.cita}»` : rz.fundacionLineal.sismica.nota}`,
    `**4 · Verticales** — ${bloque('columnas', rz.columnas.columnas)} · ${bloque('encadenados', rz.columnas.encadenados)}`,
    `**5 · Luces entre apoyos** — ${rz.luces.luces.length ? rz.luces.luces.map((l) => `${l.lamina}: ${l.luces.join(' · ')} m`).join(' · ') : 'sin luces declaradas en grilla'}`
      + (rz.luces.vigas.length ? ` · largos unitarios citados: ${rz.luces.vigas.map((v) => `${v.tipo} ${v.largoUnitario} m`).join(', ')}` : ''),
    `**6 · Barrido del plano** — ${rz.barrido.laminas.length} lámina(s) leídas: ${rz.barrido.laminas.map((l) => `${l.lamina} (${l.elementos} elementos${l.dimensionesTotales ? `, ${l.dimensionesTotales}` : ''})`).join(' · ')}`
      + (rz.barrido.noLegibles.length ? ` · NO legibles: ${rz.barrido.noLegibles.join(', ')}` : ''),
    `**X · Excavaciones** — ${rz.excavaciones.conVolumen.length
      ? rz.excavaciones.conVolumen.map((e) => `${e.elemento}: ${e.volumenBanco.toFixed(1)} m³ en banco [${e.formula}] (${e.nota})`).join(' · ')
      : 'sin volumen computable'}`,
  ]
  const faltan = [...s.faltan, ...rz.luces.faltan, ...rz.excavaciones.faltan]
  if (faltan.length) partes.push('', `⚠️ **FALTA (con nombre, para pedir):** ${faltan.join(' · ')}`)
  return partes.join('\n')
}
