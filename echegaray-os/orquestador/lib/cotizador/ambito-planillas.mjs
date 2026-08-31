// TRES PLANILLAS DE LA MISMA OBRA. ¿CUÁL MANDA? Puro, determinístico, sin modelo y sin red.
//
// ═══ EL PROBLEMA MEDIDO ═══
//
// La carpeta `ARCOR - SAN JUAN/FILTRO SANITARIO` tiene cuatro documentos y TRES traen la grilla de
// cotización entera:
//
//   ARCHIVOS VIEJOS/PEDIDO DE COTIZACION.xlsx    22 ítems · 6 rubros · TOTAL 45.098.706,01
//   ARCHIVOS VIEJOS/Cotizacion interna.xlsx      22 ítems · 6 rubros · TOTAL 45.098.706,01
//   PROYECTO FINAL/…ESTRUCTURAS METALICAS…xlsx   12 ítems · 2 rubros · TOTAL 13.216.025,42
//
// Las dos primeras son el MISMO cómputo (la interna agrega columnas de trabajo a la derecha y no
// toca ni una cantidad). La tercera es otro alcance: se cayeron obra civil, demoliciones, tareas
// preliminares y varios — **$ 31.882.680,59 de diferencia**.
//
// Cotizar la que agarre primero el `for` es cotizar una obra distinta. Y elegir «la más nueva» por
// la fecha del archivo tampoco sirve: en Drive la fecha es la de la última vez que alguien la abrió
// y guardó, no la de la revisión.
//
// ═══ LA REGLA: LA CARPETA ES UNA DECLARACIÓN, EL EMPATE NO SE ROMPE SOLO ═══
//
// Quien archivó puso «ARCHIVOS VIEJOS» y «PROYECTO FINAL» a mano: eso es un acto de la empresa sobre
// su propia documentación, y es exactamente el tipo de evidencia que §5 pide. Se usa, y se declara
// que se usó y por qué.
//
// Lo que NO se hace es desempatar sin criterio. Si después de aplicar las carpetas quedan dos
// cómputos distintos, `elegido` sale `null` y el conflicto queda en la cola: la obra no se cotiza
// mientras nadie diga cuál de las dos versiones es la que el cliente pidió. Un motor que elige a
// ciegas entre $ 13 M y $ 45 M no está cotizando, está tirando una moneda.
//
// ═══ EL CASI-DUPLICADO NO ES UN CONFLICTO ═══
//
// Dos archivos con el MISMO cómputo son el mismo documento guardado dos veces. Tratarlos como
// versiones en conflicto llenaría la cola de ruido y taparía el conflicto real, que es el otro.

import { issue, TIPO_ISSUE, SEVERIDAD } from './contrato.mjs'

/** Carpetas con las que la empresa declara que un archivo quedó atrás. Salidas de la ruta real:
 *  existe tal cual en Drive. Inventar sinónimos haría que el filtro descarte de más. */
export const CARPETA_SUPERADA = Object.freeze(['archivos viejos', 'archivo viejo'])

/** Carpetas con las que la empresa declara cuál es la versión que rige. */
export const CARPETA_VIGENTE = Object.freeze(['proyecto final'])

const enRuta = (titulo, carpetas) => {
  const t = String(titulo ?? '').toLowerCase()
  return carpetas.some((c) => t.includes(`/${c}/`))
}

/** Sin tildes, sin puntuación y con un solo espacio. PURA. */
const clave = (v) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * LA HUELLA DEL CÓMPUTO DE UNA PLANILLA. PURA.
 *
 * Es lo que se compara para decir «éstas dos son la misma obra». Entran unidad, cantidad y
 * descripción; NO entra ningún precio. Dos ofertas del mismo cómputo a distinto precio son la misma
 * obra cotizada dos veces, y meter el importe acá las separaría justo cuando hay que juntarlas.
 */
export function huellaDeComputo(lectura) {
  return (lectura?.items ?? [])
    .map((i) => `${clave(i.unidad)}|${i.cantidad ?? '-'}|${clave(i.descripcion).slice(0, 120)}`)
    .sort()
    .join('\n')
}

/** El TOTAL declarado por la planilla, si lo declara. `null` cuando no: una oferta sin total es un
 *  hallazgo, no un cero. PURA. */
export function totalDeclarado(lectura) {
  const t = (lectura?.cierre ?? []).find((c) => c.concepto === 'TOTAL')
  const v = (t?.valores ?? []).find((x) => Number.isFinite(x))
  return v === undefined ? null : v
}

/** Los documentos del ámbito que traen grilla, con su huella y su total. PURA. */
export function grillasDelAmbito(artefacto) {
  return (artefacto?.documentos ?? [])
    .filter((d) => d.lectura?.ok && (d.lectura.items ?? []).length)
    .map((d) => ({
      hash: d.hash, nombre: d.nombre, titulo: d.titulo, lectura: d.lectura,
      items: d.lectura.items.length, rubros: (d.lectura.rubros ?? []).length,
      total: totalDeclarado(d.lectura),
      huella: huellaDeComputo(d.lectura),
      superada: enRuta(d.titulo, CARPETA_SUPERADA),
      vigente: enRuta(d.titulo, CARPETA_VIGENTE),
    }))
}

/** Las grillas agrupadas por cómputo idéntico. Cada grupo es UNA obra. PURA. */
export function agruparPorComputo(grillas = []) {
  const porHuella = new Map()
  for (const g of grillas) porHuella.set(g.huella, [...(porHuella.get(g.huella) ?? []), g])
  return [...porHuella.values()]
}

/**
 * CUÁL DE LAS VERSIONES RIGE, Y POR QUÉ. PURA.
 *
 * Devuelve `elegido: null` cuando no hay criterio: es una respuesta, no una falla.
 */
export function versionOperativa(artefacto) {
  const grupos = agruparPorComputo(grillasDelAmbito(artefacto))
  const duplicados = grupos.filter((g) => g.length > 1)
    .map((g) => ({ huella: g[0].huella.slice(0, 40), archivos: g.map((x) => x.nombre), items: g[0].items, total: g[0].total }))

  // Un representante por cómputo: el casi-duplicado ya no aporta nada a la decisión.
  const versiones = grupos.map((g) => g.find((x) => x.vigente) ?? g.find((x) => !x.superada) ?? g[0])
  if (!versiones.length) return { elegido: null, versiones: [], duplicados, porQue: 'ningún documento del ámbito trae una grilla de cotización legible', conflicto: null }
  if (versiones.length === 1) return { elegido: versiones[0], versiones, duplicados, porQue: `es la única grilla del ámbito (${versiones[0].items} ítems)`, conflicto: null }

  const vigentes = versiones.filter((v) => v.vigente)
  const noSuperadas = versiones.filter((v) => !v.superada)
  const elegido = vigentes.length === 1 ? vigentes[0] : (noSuperadas.length === 1 ? noSuperadas[0] : null)
  const porQue = vigentes.length === 1
    ? `está bajo «PROYECTO FINAL», que es una declaración de la empresa sobre su propia documentación; las otras ${versiones.length - 1} están bajo «ARCHIVOS VIEJOS»`
    : (noSuperadas.length === 1
      ? `es la única que no está bajo «ARCHIVOS VIEJOS»; las otras ${versiones.length - 1} sí`
      : `hay ${versiones.length} cómputos distintos y ninguna carpeta los ordena: no se elige`)

  return { elegido, versiones, duplicados, porQue, conflicto: conflictoDeAlcance(versiones, elegido) }
}

/** Cuánto alcance se movió entre versiones, en ítems y en plata. PURA. */
export function conflictoDeAlcance(versiones = [], elegido = null) {
  if (versiones.length < 2) return null
  const totales = versiones.filter((v) => v.total !== null).map((v) => v.total)
  const brecha = totales.length >= 2 ? Math.max(...totales) - Math.min(...totales) : null
  const plata = (n) => `$ ${Math.round(n).toLocaleString('es-AR')}`
  return {
    versiones: versiones.map((v) => ({ nombre: v.nombre, items: v.items, rubros: v.rubros, total: v.total, superada: v.superada, vigente: v.vigente })),
    brecha,
    elegido: elegido?.nombre ?? null,
    porQue: `el ámbito tiene ${versiones.length} cómputos distintos (${versiones.map((v) => `${v.nombre}: ${v.items} ítems${v.total === null ? '' : `, ${plata(v.total)}`}`).join(' · ')})`
      + (brecha === null ? '. No todas declaran total, así que la brecha no se puede medir' : `. Entre la mayor y la menor hay ${plata(brecha)} de alcance`)
      + (elegido ? `. Se cotizó «${elegido.nombre}»; si el cliente pidió la otra, la oferta está incompleta` : '. Ninguna se puede elegir con la evidencia disponible'),
  }
}

/** El conflicto de versiones, como issue de la cola. PURA. `null` si no hay más de una versión. */
export function issueDeVersion(conflicto, { ambito = null } = {}) {
  if (!conflicto) return null
  return issue({
    type: TIPO_ISSUE.CONFLICTO,
    // Cuando la carpeta ya ordenó las versiones queda ALTA y no BLOQUEANTE: hay una decisión de la
    // empresa detrás. Sin esa decisión nadie puede cotizar, y ahí sí bloquea.
    severity: conflicto.elegido ? SEVERIDAD.ALTA : SEVERIDAD.BLOQUEANTE,
    entity: `version:${ambito ?? 'ámbito'}`,
    impact: conflicto.brecha,
    evidence: { versiones: conflicto.versiones },
    detalle: conflicto.porQue,
    recommended_action: null,
  })
}

/** Los casi-duplicados, como issues informativos. Dos archivos con el mismo cómputo no bloquean
 *  nada; que nadie sepa que son el mismo, sí cuesta tiempo. PURA. */
export const issuesDeDuplicados = (duplicados = [], { ambito = null } = {}) => duplicados.map((d) => issue({
  type: TIPO_ISSUE.AMBIGUO, severity: SEVERIDAD.BAJA,
  entity: `duplicado:${ambito ?? 'ámbito'}:${d.archivos[0]}`,
  evidence: { archivos: d.archivos, items: d.items, total: d.total },
  detalle: `${d.archivos.length} archivos tienen el mismo cómputo (${d.items} ítems, mismas unidades y mismas cantidades): ${d.archivos.join(' = ')}. Son el mismo documento guardado dos veces, no dos versiones`,
  recommended_action: null,
}))
