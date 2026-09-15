// UNA PESTAÑA DE «JORNALES» COMO QUINCENAS DE LIQUIDACIÓN: EL PLAN, PURO.
//
// Vivía dentro de `scripts/liquidacion-cargar-jornales.mjs`, atado a «Obreros 26». El dueño
// (15/09/2026): «está mal lo histórico de las quincenas tanto en horas como en montos pagados». Tres
// de las causas medidas eran del plan y no del Sheet —las filas BAJA cortaban el bloque, «Oficina 26»
// no se leía nunca ($24,3 M de enero a agosto) y dos bloques con la misma quincena se pisaban en el
// upsert—, y un plan metido en un script con `main()` no se puede probar sin ejecutarlo. Acá entra la
// grilla y sale lo que se cargaría; no habla con Google ni con Postgres.

import { detectarQuincenas } from './nomina-sync.mjs'
import {
  columnasDelBloque, controlDeCierre, lineasDelBloque, MOTIVO_EXCLUSION, primeraFecha,
  quincenaDeFecha, quincenaEnCurso, ROTULOS_OFICINA,
} from './liquidacion-jornales.mjs'

/** Qué pestaña va a qué grupo de `liquidacion_quincena`, y cómo se leen sus rótulos. */
export const HOJAS_LIQUIDACION = Object.freeze([
  { hoja: 'Obreros 26', grupo: 'obreros' },
  { hoja: 'Oficina 26', grupo: 'oficina', rotulos: ROTULOS_OFICINA, filaRotulos: 1 },
])

const DIA_MS = 864e5
const redondear2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Las fechas del encabezado que no caben en la quincena que le tocó al bloque.
 *
 * «Oficina 26», bloque de la fila 56: «1/4 · 2/3 · 3/4 …». La quincena sale de la PRIMERA fecha
 * escrita (1/4) y así queda en la 1ª de abril; ese «2/3» es un tipeo, no un bloque de marzo. No se
 * corrige: se declara. Se tolera una semana después del cierre porque hay bloques legítimos que se
 * pasan (4/5..16/5).
 */
export function fechasFueraDeQuincena(grid, bloque, rango, anio) {
  const desde = Date.parse(rango.desde)
  const hasta = Date.parse(rango.hasta) + 7 * DIA_MS
  const out = []
  for (const celda of grid[bloque.filaFecha - 1] ?? []) {
    const m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(celda ?? '').trim())
    if (!m) continue
    const t = Date.UTC(anio, Number(m[2]) - 1, Number(m[1]))
    if (t < desde || t > hasta) out.push(m[0])
  }
  return out
}

/**
 * UNA PERSONA, UNA LÍNEA POR QUINCENA — Y LA REPETIDA SE DECLARA.
 *
 * «Oficina 26» tiene bajo MARZO dos bloques con el encabezado de febrero copiado («2/2…», «16/2…»):
 * Maldonado y Nievas quedan dos veces en la 1ª y en la 2ª de febrero, con horas e importes distintos.
 * `liquidacion_linea` es única por (quincena, persona), así que el upsert dejaba en silencio la del
 * último bloque. La regla: entra la línea del PRIMER bloque en el orden de la hoja y la siguiente sale
 * con `superpuesta` = la fila que ganó, para que su importe quede en `monto_excluido`.
 *
 * Se descartó SUMARLAS: daría 188 h de oficina en una quincena y pondría en febrero plata que la hoja
 * rotula MARZO. Se descartó MOVERLAS a marzo: sería inventar la fecha que la planilla no escribió.
 */
export function marcarSuperpuestas(lineas = []) {
  const primera = new Map()
  for (const l of lineas) {
    const k = l.persona_id ?? `?${l.clave}`
    if (primera.has(k)) l.superpuesta = primera.get(k).fila
    else primera.set(k, l)
  }
  return lineas
}

/**
 * El plan de una pestaña: sus quincenas, cada una con sus líneas y su control de cierre.
 * @param {object} o
 * @param {(linea: object) => {persona?: {id:string, nombre:string}|null, via:string, candidatos?:string[]}} o.resolver
 */
export function planDeHoja({
  grid = [], gridCrudo = null, anio, hoy, resolver, incluirBajas = false, rotulos, filaRotulos,
} = {}) {
  const avisos = []
  const enCurso = quincenaEnCurso(hoy)
  const bloques = detectarQuincenas(grid, { bajas: true })
  const porClave = new Map()
  for (const bloque of bloques) {
    const ddmm = primeraFecha(grid, bloque)
    const rango = ddmm ? quincenaDeFecha(ddmm, anio) : null
    if (!rango) { avisos.push(`bloque en fila ${bloque.inicio}: sin fecha legible — NO se carga`); continue }
    const { cols, faltan } = columnasDelBloque(grid, bloque, { rotulos, filaRotulos })
    if (faltan.length) {
      avisos.push(`${rango.desde} (fila ${bloque.inicio}): faltan los rótulos ${faltan.join(', ')} — NO se carga`)
      continue
    }
    const raras = fechasFueraDeQuincena(grid, bloque, rango, anio)
    if (raras.length) {
      avisos.push(`bloque fila ${bloque.inicio}: el encabezado trae ${raras.join(', ')} fuera de ${rango.desde}..${rango.hasta} — manda la primera fecha escrita (${ddmm})`)
    }
    const lineas = lineasDelBloque(grid, bloque, cols, gridCrudo).map((l) => {
      const r = resolver(l)
      return { ...l, persona_id: r.persona?.id ?? null, personaBase: r.persona?.nombre ?? null, via: r.via, candidatos: r.candidatos }
    })
    const k = `${rango.desde}|${rango.hasta}`
    if (!porClave.has(k)) {
      porClave.set(k, { ...rango, etiqueta: ddmm, enCurso: !!enCurso && rango.desde === enCurso.desde, bloques: [], lineas: [] })
    }
    const q = porClave.get(k)
    q.bloques.push(bloque.inicio)
    q.lineas.push(...lineas)
  }
  const quincenas = [...porClave.values()].sort((a, b) => a.desde.localeCompare(b.desde)).map((q) => {
    if (q.bloques.length > 1) {
      avisos.push(`${q.desde}..${q.hasta}: ${q.bloques.length} bloques con la misma quincena (filas ${q.bloques.join(', ')}) — entra la línea del primero; las repetidas se declaran afuera`)
    }
    marcarSuperpuestas(q.lineas)
    return { ...q, control: controlDeCierre(q.lineas, { incluirBajas }) }
  })
  return { bloques: bloques.length, quincenas, avisos, enCurso }
}

/** `liquidacion_quincena.excluidas`: nombre e importe como siempre, más por qué y de qué fila. */
export function excluidasParaBase(control) {
  return control.excluidas.map((l) => ({
    nombre: l.nombre,
    importe: redondear2(l.cobra ?? 0),
    motivo: l.motivo,
    fila: l.fila,
    ...(l.incompleta ? { detalle: l.incompleta } : {}),
  }))
}

/** `liquidacion_quincena.observacion`: cada motivo con su cuenta. Una quincena completa lo dice. */
export function observacionDeCarga(hoja, control) {
  const base = `Cargada desde JORNALES '${hoja}'.`
  const cuantas = (m) => control.excluidas.filter((l) => l.motivo === m).length
  const partes = []
  const sinPersona = cuantas(MOTIVO_EXCLUSION.SIN_PERSONA)
  const bajas = cuantas(MOTIVO_EXCLUSION.BAJA)
  const repetidas = cuantas(MOTIVO_EXCLUSION.SUPERPUESTA)
  if (sinPersona) partes.push(`${sinPersona} persona(s) de la planilla no existen en public.personas y el dueño decidió no darlas de alta (09/09/2026)`)
  if (bajas) partes.push(`${bajas} fila(s) marcadas BAJA no se cargaron: falta que el dueño confirme que se pagaron`)
  const bajasIlegibles = cuantas(MOTIVO_EXCLUSION.BAJA_ILEGIBLE)
  if (bajasIlegibles) partes.push(`${bajasIlegibles} fila(s) marcadas BAJA no se cargaron porque su plata no cierra (TOTAL ≠ BANCO + ADELANTO + EFECTIVO): el importe declarado es el TOTAL de la planilla y lo decide una persona`)
  if (repetidas) partes.push(`${repetidas} línea(s) repiten persona en otro bloque de la misma quincena: entró la del primer bloque`)
  const conBajas = control.bajasCargadas ? ` Incluye ${control.bajasCargadas} fila(s) marcadas BAJA (--incluir-bajas).` : ''
  if (!partes.length) return `${base} Entró completa: ninguna línea quedó afuera.${conBajas}`
  return `${base} ${partes.join('; ')}. Su importe está en monto_excluido.${conBajas}`
}

/**
 * ¿ESTA QUINCENA DE LA BASE YA ES DE ALGUIEN? (auditoría del 15/09/2026)
 *
 * El cargador hace upsert de la cabecera y de las líneas sin mirar el estado: podía reescribir una
 * quincena que alguien cerró desde la web, cuyas líneas están selladas, que se reabrió con motivo, o
 * que está abierta con celdas corregidas a mano. En cualquiera de esos casos la base ya dice algo que
 * dijo una persona, y la planilla no le gana. Se saltea entera —cabecera, `observacion`,
 * `monto_excluido` y líneas— y se nombra el motivo.
 *
 * Una quincena `cerrada` SIN `cerrada_por` ni sello ni reapertura es la que escribió este mismo
 * script el 09/09 (las 16 de obreros): ésa sí se recarga.
 *
 * @param {{estado?:string, cerrada_por?:string|null, lineas_manuales?:number, lineas_selladas?:number, reaperturas?:number}|null|undefined} base
 * @returns {string|null} el motivo, o null si se puede cargar
 */
export function motivoParaSaltear(base) {
  if (!base) return null
  if (Number(base.reaperturas) > 0) return `reabierta ${base.reaperturas} vez/veces`
  if (base.cerrada_por) return `cerrada por ${base.cerrada_por}`
  if (Number(base.lineas_selladas) > 0) return `sellada (${base.lineas_selladas} línea/s)`
  if (base.estado === 'abierta' && Number(base.lineas_manuales) > 0) return `abierta con ${base.lineas_manuales} línea(s) editadas en la app`
  return null
}

/** Separa lo cargable de lo salteado. `estados` va por `${grupo}|${desde}|${hasta}`. */
export function separarSalteadas(quincenas, grupo, estados = new Map()) {
  const aCargar = []
  const salteadas = []
  for (const q of quincenas) {
    const motivo = motivoParaSaltear(estados.get(`${grupo}|${q.desde}|${q.hasta}`))
    if (motivo) salteadas.push({ ...q, salteada: motivo })
    else aCargar.push(q)
  }
  return { aCargar, salteadas }
}

/** No termina en `_manual` y también lo escribe una persona: los billetes que el dueño entrega en mano. */
const EDITADAS_SIN_SUFIJO = Object.freeze(['efectivo_redondeado'])
const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/

/**
 * LAS COLUMNAS QUE DICEN «ESTO LO ESCRIBIÓ ALGUIEN EN LA APP», A PARTIR DE LAS QUE LA BASE TIENE.
 *
 * La guarda contaba siete `*_manual` tipeadas y le faltaban cinco (`horas_recibo_manual`,
 * `valor_hora_recibo_manual`, `negro_manual`, `horas_negro_manual`, `efectivo_redondeado`): la 1ª de
 * septiembre decía «1 línea editada» y eran 2 (Agüero, `horas_recibo_manual` = 50). Una lista tipeada
 * queda corta el día que la web agrega una celda editable; por eso entra lo que devuelve
 * `information_schema` y la regla es el sufijo, que es el contrato de `COLUMNA_DE`
 * (liquidacionOverrides.ts) — su test verifica que todas sus columnas lo cumplen.
 */
export function columnasEditadasEnApp(columnas = []) {
  return [...new Set(columnas)]
    .filter((c) => IDENTIFICADOR.test(c) && (c.endsWith('_manual') || EDITADAS_SIN_SUFIJO.includes(c)))
    .sort()
}

/** El predicado SQL «la línea `alias` tiene alguna celda editada». Sin columnas no hay cómo saberlo: falla. */
export function sqlLineaEditada(columnas = [], alias = 'l') {
  const cols = columnasEditadasEnApp(columnas)
  if (!cols.length) throw new Error('liquidacion_linea sin columnas editables en information_schema: no puedo saber qué tocó una persona, NO cargo nada')
  return `(${cols.map((c) => `${alias}.${c} is not null`).join(' or ')})`
}
