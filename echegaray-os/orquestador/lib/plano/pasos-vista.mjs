// LOS SIETE PASOS COMO DATO, NO COMO PÁRRAFO — el contrato entre el motor y la pantalla.
//
// `razonamiento.mjs` ya contesta las siete preguntas del dueño y `textoDeRazonamiento` las escribe
// en markdown. Un párrafo no se puede abrir, filtrar, ni cruzar con el cómputo: la pantalla de
// lectura del plano necesita CADA paso con su pregunta, su estado, su tabla y las partidas que
// deriva. Eso es lo que produce este módulo.
//
// ═══ POR QUÉ ES UN MÓDULO APARTE Y NO UN CAMPO MÁS DEL RAZONAMIENTO ═══
//
// `razonar()` responde «qué dice el plano». Acá se responde «cómo se muestra y qué certeza tiene»,
// que es una decisión de presentación con una regla dura: el ESTADO de un paso sale de la evidencia
// real, nunca de una etiqueta puesta a mano. Un paso es `firme` sólo si no le falta nada y no
// apoya en ningún supuesto — y `sin dato` en cuanto una sola fila no tenga su cita. Mezclarlo con
// el razonamiento dejaría el criterio de certeza repartido en dos lugares.
//
// PURO: sin red, sin base, sin modelo. Entra el resultado de `razonar()` + el cómputo del pipeline.

import { rolDe, ROL } from './razonamiento.mjs'

/** Los estados posibles de un paso. El orden es de peor a mejor: `peorEstado` los compara. */
export const ESTADO = Object.freeze({
  CONFLICTO: 'conflicto',
  SIN_DATO: 'sin dato',
  CON_SUPUESTO: 'con supuesto',
  REVISAR: 'revisar',
  FIRME: 'firme',
})

const GRAVEDAD = [ESTADO.CONFLICTO, ESTADO.SIN_DATO, ESTADO.CON_SUPUESTO, ESTADO.REVISAR, ESTADO.FIRME]
const peorEstado = (...ee) => GRAVEDAD.find((e) => ee.includes(e)) ?? ESTADO.FIRME

/** Qué paso cotiza cada rol constructivo. Es la ÚNICA atribución partida→paso que existe: si un
 *  rol no está acá, sus partidas caen en el barrido (paso 6) y se declaran sin paso asignado. */
const PASO_DE_ROL = Object.freeze({
  [ROL.BASE]: 'p2',
  [ROL.MUERTO]: 'p2',
  [ROL.EXCAVACION]: 'p3',
  [ROL.VIGA_FUNDACION]: 'p4',
  [ROL.ARRIOSTRAMIENTO]: 'p4',
  [ROL.VIGA_CARGA]: 'p4',
  [ROL.COLUMNA]: 'p5',
  [ROL.ENCADENADO]: 'p5',
})

/** El paso al que pertenece un item del cómputo. `p7` es el cajón de lo que no encaja: se ve. */
export function pasoDeItem(item) {
  return PASO_DE_ROL[rolDe(item)] ?? 'p7'
}

const N = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v)
  ? v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d })
  : null)

/** El importe de un item del cómputo, o `null`. NUNCA cero: sin precio no hay importe. */
function importeDe(item) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const directo = n(item?.importe ?? item?.subtotal)
  if (directo !== null) return directo
  const c = n(item?.cantidad ?? item?.cantidadElementos)
  const u = n(item?.costoUnitario ?? item?.unitario ?? item?.precioUnitario)
  return c !== null && u !== null ? c * u : null
}

/** Las partidas que deriva un paso: cuántas y por cuánta plata (null si ninguna trae precio). */
function derivaDe(pid, items) {
  const mios = items.filter((i) => pasoDeItem(i) === pid)
  if (!mios.length) return { partidas: 0, importe: null, sinCotizar: 0 }
  let importe = null
  let sinCotizar = 0
  for (const it of mios) {
    const imp = importeDe(it)
    if (imp === null) sinCotizar += 1
    else importe = (importe ?? 0) + imp
  }
  return { partidas: mios.length, importe, sinCotizar }
}

// ── LOS SIETE PASOS ──────────────────────────────────────────────────────────────────────────
//
// Las etiquetas son las del dueño: la excavación es el paso «X» —una pregunta transversal que se
// hace en cualquier momento— y por eso va tercera en la lectura pero no numerada como las otras.

function verSuperficies(s) {
  const filas = []
  if (s.cubiertaDeclarada) {
    filas.push({ k: s.cubiertaDeclarada.lamina, d: 'Superficie cubierta declarada', sub: 'rótulo o carátula de la lámina', n: N(s.cubiertaDeclarada.area, 0), u: 'm²', v: 'Base de los globales' })
  }
  for (const d of s.declaradas) {
    filas.push({ k: d.lamina, d: d.que ?? 'Superficie declarada', sub: d.textoLiteral ? `«${String(d.textoLiteral).slice(0, 90)}»` : 'declarada en la documentación', n: N(d.area, 0), u: 'm²', v: 'Declarada' })
  }
  for (const i of s.improntas) {
    filas.push({ k: i.lamina, d: 'Impronta (CÁLCULO)', sub: i.calculo, n: N(i.area, 0), u: 'm²', v: 'Limpieza y replanteo' })
  }
  for (const f of s.faltan) {
    const [que, ...resto] = String(f).split(':')
    filas.push({ k: '—', d: que.trim(), sub: resto.join(':').trim(), n: null, u: '', v: 'sin dato', falta: true })
  }
  const resumen = [
    s.cubiertaDeclarada ? `${N(s.cubiertaDeclarada.area, 0)} m² cubiertos declarados` : 'superficie cubierta sin declarar en la documentación leída',
    s.improntas.length ? `impronta calculada de la grilla: ${s.improntas.map((i) => `${N(i.area, 0)} m²`).join(' · ')}` : null,
    s.faltan.length ? `${s.faltan.length} faltante(s) con nombre` : null,
  ].filter(Boolean).join(' · ')
  return {
    estado: s.faltan.length ? ESTADO.SIN_DATO : ESTADO.FIRME,
    resumen,
    columnas: { a: 'LÁMINA', b: 'QUÉ ES', c: 'CANT.', d: 'DERIVA EN' },
    filas,
    evidencia: s.improntas.map((i) => i.lamina).concat(s.cubiertaDeclarada ? [s.cubiertaDeclarada.lamina] : []).filter(Boolean).join(' · ') || null,
    supuesto: null,
  }
}

/** Una fila por grupo del razonamiento (B0=4, VF=312 ml…). La sección sin cita se DICE. */
function filasDeGrupos(grupos, { unidad = 'un', deriva = null } = {}) {
  return grupos.map((g) => ({
    k: g.tipo,
    d: g.nombre ?? g.tipo,
    sub: [g.seccion ? `sección ${g.seccion.texto}` : 'sección sin cita en el plano', g.laminas.length ? g.laminas.join(', ') : null].filter(Boolean).join(' · '),
    n: g.sinCantidad ? (g.cantidad ? N(g.cantidad) : null) : N(g.cantidad),
    u: unidad,
    v: g.sinCantidad ? 'cantidad incompleta' : (deriva ?? (g.seccion ? 'Hormigón y armadura' : 'sin sección')),
    falta: g.sinCantidad || !g.seccion,
  }))
}

const sinSeccion = (grupos) => grupos.filter((g) => !g.seccion).length
const sinCantidad = (grupos) => grupos.filter((g) => g.sinCantidad).length
const total = (grupos) => grupos.reduce((a, g) => a + (g.cantidad || 0), 0)

function verBases(b) {
  const grupos = [...b.bases, ...b.muertos]
  const filas = [
    ...filasDeGrupos(b.bases, { unidad: 'un' }),
    ...filasDeGrupos(b.muertos, { unidad: 'un', deriva: 'Muertos de anclaje' }),
  ]
  const faltaSeccion = sinSeccion(grupos)
  const faltaCantidad = sinCantidad(grupos)
  const resumen = grupos.length
    ? `${N(total(b.bases))} bases en ${b.bases.length} tipo(s)`
      + (b.muertos.length ? ` · ${N(total(b.muertos))} muerto(s) de anclaje` : ' · sin muertos de anclaje detectados')
      + (faltaSeccion ? ` · ${faltaSeccion} sin sección citada: contadas, sin cotizar` : '')
    : 'ninguna base detectada en la documentación leída'
  return {
    estado: grupos.length === 0 || faltaCantidad || faltaSeccion ? ESTADO.SIN_DATO : ESTADO.FIRME,
    resumen,
    columnas: { a: 'TIPO', b: 'DÓNDE', c: 'CANT.', d: 'DERIVA EN' },
    filas,
    evidencia: [...new Set(grupos.flatMap((g) => g.laminas))].join(' · ') || null,
    supuesto: faltaSeccion ? 'Sin sección citada no hay volumen: adoptar una típica sería un supuesto mío, no una medición.' : null,
  }
}

function verExcavaciones(x) {
  const filas = x.excavaciones.map((e) => ({
    k: e.elemento,
    d: e.profundidad ? `Cota de fondo −${N(e.profundidad, 2)} m` : 'Sin profundidad en el plano',
    sub: e.formula ?? (e.falta ? `falta ${e.falta}` : 'sin fórmula computable'),
    n: e.cantidad === null ? null : N(e.cantidad),
    u: 'un',
    v: e.volumenBanco ? `${N(e.volumenBanco, 1)} m³` : 'sin dato',
    falta: !e.volumenBanco,
  }))
  const resumen = x.conVolumen.length
    ? `${N(x.conVolumen.reduce((a, e) => a + e.volumenBanco, 0), 1)} m³ en banco con cita`
      + (x.sinProfundidad.length ? ` · ${x.sinProfundidad.length} sin cota de fondo: sin profundidad no hay volumen` : '')
    : 'sin volumen computable: la documentación no declara profundidades'
  return {
    estado: x.conVolumen.length && !x.sinProfundidad.length ? ESTADO.FIRME : ESTADO.SIN_DATO,
    resumen,
    columnas: { a: 'ELEM.', b: 'COTA DE FONDO', c: 'CANT.', d: 'EXCAVACIÓN' },
    filas,
    evidencia: null,
    supuesto: null,
    faltan: x.faltan,
  }
}

function verFundacionLineal(f) {
  const grupos = [...f.vigasFundacion, ...f.arriostramientos, ...f.vigasCarga]
  const filas = [
    ...filasDeGrupos(f.vigasFundacion, { unidad: 'un', deriva: 'Viga de fundación' }),
    ...filasDeGrupos(f.arriostramientos, { unidad: 'un', deriva: 'Arriostramiento' }).map((r) => ({ ...r, disputa: !f.sismica.declarada })),
    ...filasDeGrupos(f.vigasCarga, { unidad: 'un', deriva: 'Viga de carga' }),
  ]
  // La pregunta sísmica NO se contesta con un default: si el plano no la nombra, es DESCONOCIDO —
  // y un arriostramiento cuya exigencia no está declarada queda en disputa, no en economía.
  const enDisputa = f.arriostramientos.length > 0 && !f.sismica.declarada
  const resumen = grupos.length
    ? `${f.vigasFundacion.length} tipo(s) de viga de fundación · ${f.arriostramientos.length} de arriostramiento · ${f.vigasCarga.length} de carga`
      + (f.sismica.declarada ? ` · sísmica mencionada: «${f.sismica.cita}»` : ` · ${f.sismica.nota}`)
    : 'ninguna viga de fundación, arriostramiento ni viga de carga detectada'
  return {
    estado: enDisputa ? ESTADO.CONFLICTO : (grupos.length === 0 || sinSeccion(grupos) ? ESTADO.SIN_DATO : ESTADO.FIRME),
    resumen,
    columnas: { a: 'TIPO', b: 'FUNCIÓN', c: 'CANT.', d: 'DERIVA EN' },
    filas,
    evidencia: [...new Set(grupos.flatMap((g) => g.laminas))].join(' · ') || null,
    supuesto: f.sismica.declarada ? `Exigencia sísmica citada en el plano: «${f.sismica.cita}»` : null,
  }
}

function verColumnas(c) {
  const grupos = [...c.columnas, ...c.encadenados]
  const filas = [
    ...filasDeGrupos(c.columnas, { unidad: 'un', deriva: 'Pedestal y arranque' }),
    ...filasDeGrupos(c.encadenados, { unidad: 'un', deriva: 'Encadenado' }),
  ]
  const faltaSeccion = sinSeccion(grupos)
  return {
    estado: grupos.length === 0 || faltaSeccion ? ESTADO.SIN_DATO : ESTADO.FIRME,
    resumen: grupos.length
      ? `${N(total(c.columnas))} columna(s) en ${c.columnas.length} tipo(s) · ${c.encadenados.length} tipo(s) de encadenado`
        + (faltaSeccion ? ` · ${faltaSeccion} sin sección citada: contadas, sin acero` : '')
      : 'ninguna columna ni encadenado detectado en la documentación leída',
    columnas: { a: 'ELEM.', b: 'QUÉ ES', c: 'CANT.', d: 'DERIVA EN' },
    filas,
    evidencia: [...new Set(grupos.flatMap((g) => g.laminas))].join(' · ') || null,
    supuesto: faltaSeccion ? 'Sin perfil ni sección no hay kilos. Por analogía sería un supuesto tuyo, no una medición.' : null,
  }
}

function verLuces(l) {
  const filas = [
    ...l.luces.flatMap((x) => (x.luces ?? []).map((v) => ({
      k: N(v, 2) ?? String(v), d: 'Luz entre ejes', sub: x.cita ? `«${String(x.cita).slice(0, 90)}»` : 'declarada en la grilla', n: null, u: '', v: x.lamina,
    }))),
    ...l.vigas.map((v) => ({ k: v.tipo, d: 'Largo unitario citado', sub: v.lamina ?? 'sin lámina', n: N(v.largoUnitario, 2), u: 'm', v: 'Verifica el paso 3' })),
    ...l.faltan.map((f) => ({ k: '—', d: 'Sin luces ni largos declarados', sub: f, n: null, u: '', v: 'sin dato', falta: true })),
  ]
  return {
    estado: l.faltan.length ? ESTADO.SIN_DATO : ESTADO.FIRME,
    resumen: l.luces.length || l.vigas.length
      ? `${l.luces.reduce((a, x) => a + (x.luces?.length ?? 0), 0)} luz(ces) declaradas · ${l.vigas.length} largo(s) unitario(s) citados. Verifican la medición del paso 3.`
      : 'ninguna lámina declara luces entre ejes ni largos unitarios de viga',
    columnas: { a: 'LUZ (m)', b: 'DÓNDE', c: 'LARGO', d: 'EVIDENCIA' },
    filas,
    evidencia: l.luces.map((x) => x.lamina).join(' · ') || null,
    supuesto: null,
  }
}

function verBarrido(b, items) {
  const huerfanos = items.filter((i) => pasoDeItem(i) === 'p7')
  const filas = [
    ...b.laminas.map((l) => ({
      k: l.lamina ?? '—', d: (l.vistas ?? []).join(', ') || 'lámina leída', sub: l.archivo ?? '',
      n: N(l.elementos), u: 'el', v: l.dimensionesTotales ?? 'sin dimensiones totales', falta: !l.dimensionesTotales,
    })),
    ...b.noLegibles.map((n) => ({ k: '—', d: 'No legible', sub: n, n: null, u: '', v: 'no leída', falta: true })),
    ...huerfanos.map((i) => ({ k: '—', d: i.nombre ?? i.id ?? 'elemento', sub: 'dibujado y sin paso asignado', n: null, u: '', v: 'sin paso', falta: true })),
  ]
  return {
    // Sin ninguna lámina leída el barrido NO puede decir que cierra: no barrió nada.
    estado: b.laminas.length === 0 ? ESTADO.SIN_DATO : (b.noLegibles.length || huerfanos.length ? ESTADO.REVISAR : ESTADO.FIRME),
    resumen: (b.laminas.length ? `${b.laminas.length} lámina(s) leídas` : 'ninguna lámina se pudo leer: no hay barrido')
      + (b.noLegibles.length ? ` · ${b.noLegibles.length} NO legible(s): ${b.noLegibles.join(', ')}` : '')
      + (huerfanos.length ? ` · ${huerfanos.length} elemento(s) sin paso asignado: no los cotizo hasta que confirmes el alcance` : ' · todo lo leído quedó asignado a un paso'),
    columnas: { a: 'BARRIDO', b: 'QUÉ ENCONTRÉ', c: 'ELEM.', d: 'ESTADO' },
    filas,
    evidencia: b.laminas.map((l) => l.lamina).filter(Boolean).join(' · ') || null,
    supuesto: null,
  }
}

/** El esqueleto: id, etiqueta y la PREGUNTA que contesta cada paso. Las preguntas son del dueño. */
export const ESQUELETO = Object.freeze([
  { id: 'p1', etiqueta: '1', clave: 'superficies', titulo: 'Superficie de impronta, cubierta y semicubierta', pregunta: '¿Cuánto cubre, cuánto semicubre y cuánto perímetro cierra?' },
  { id: 'p2', etiqueta: '2', clave: 'bases', titulo: 'Bases y muertos de anclaje', pregunta: '¿Cuántas bases, de qué sección? ¿Cuántos muertos de anclaje?' },
  { id: 'p3', etiqueta: 'x', clave: 'excavaciones', titulo: 'Excavaciones puntuales y profundidades', pregunta: 'Punto por punto: hasta qué cota se excava' },
  { id: 'p4', etiqueta: '3', clave: 'fundacionLineal', titulo: 'Vigas de fundación, arriostramiento y carga', pregunta: '¿Cuántas vigas de fundación? ¿Arriostramiento? ¿De carga? ¿Sísmica?' },
  { id: 'p5', etiqueta: '4', clave: 'columnas', titulo: 'Columnas de carga y encadenado', pregunta: '¿Cuántas columnas de carga? ¿Va encadenado?' },
  { id: 'p6', etiqueta: '5', clave: 'luces', titulo: 'Longitud unitaria entre columna y columna', pregunta: '¿Cuánto mide la viga entre columna y columna?' },
  { id: 'p7', etiqueta: '6', clave: 'barrido', titulo: 'Lectura X-Y y barrido del plano', pregunta: '¿Quedó algo dibujado sin contar?' },
])

const VISTAS = {
  superficies: (rz) => verSuperficies(rz.superficies),
  bases: (rz) => verBases(rz.bases),
  excavaciones: (rz) => verExcavaciones(rz.excavaciones),
  fundacionLineal: (rz) => verFundacionLineal(rz.fundacionLineal),
  columnas: (rz) => verColumnas(rz.columnas),
  luces: (rz) => verLuces(rz.luces),
  barrido: (rz, items) => verBarrido(rz.barrido, items),
}

/**
 * LOS SIETE PASOS LISTOS PARA MOSTRAR. Uno por pregunta, en el orden de la lectura.
 *
 * Cada paso trae: la pregunta que contesta, su ESTADO derivado de la evidencia, un resumen en
 * palabras, la tabla con sus filas (las que no tienen cita vienen con `falta: true`), la evidencia
 * que lo respalda, el supuesto que lo sostiene si lo hay, y las partidas que deriva con su plata.
 *
 * @param {object} rz resultado de `razonar()`
 * @param {{ items?: object[] }} computo el cómputo del pipeline — de ahí sale la derivación
 */
export function vistaDePasos(rz, { items = [] } = {}) {
  if (!rz) return []
  return ESQUELETO.map((e) => {
    const v = VISTAS[e.clave](rz, items)
    const deriva = derivaDe(e.id, items)
    return {
      id: e.id,
      etiqueta: e.etiqueta,
      titulo: e.titulo,
      pregunta: e.pregunta,
      estado: v.estado,
      resumen: v.resumen,
      columnas: v.columnas,
      filas: v.filas,
      evidencia: v.evidencia,
      supuesto: v.supuesto,
      faltan: v.faltan ?? [],
      deriva,
    }
  })
}

/** El estado de la lectura entera: el peor de sus pasos, y el conteo por estado. */
export function certezaDeLectura(pasos = []) {
  if (!pasos.length) return { estado: null, porEstado: {}, firmes: 0, total: 0 }
  const porEstado = {}
  for (const p of pasos) porEstado[p.estado] = (porEstado[p.estado] ?? 0) + 1
  return {
    estado: peorEstado(...pasos.map((p) => p.estado)),
    porEstado,
    firmes: porEstado[ESTADO.FIRME] ?? 0,
    total: pasos.length,
  }
}
