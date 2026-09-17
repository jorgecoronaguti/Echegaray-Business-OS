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
  const corregidas = control.cargables.filter((l) => l.totalDeLaPlanilla != null)
  const conBajas = (control.bajasCargadas ? ` Incluye ${control.bajasCargadas} fila(s) marcadas BAJA (--incluir-bajas).` : '')
    + corregidas.map((l) => ` Fila ${l.fila} ${l.nombre}: TOTAL de la planilla ${l.totalDeLaPlanilla} ≠ Hs × $/h ${l.cobra} = BANCO + ADELANTO + EFECTIVO; se cargó Hs × $/h (confirmado por el dueño, 15/09/2026).`).join('')
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

/**
 * NO TERMINAN EN `_manual` Y TAMBIÉN LAS ESCRIBE UNA PERSONA.
 *
 *   efectivo_redondeado            los billetes que el dueño entrega en mano.
 *   pagado_banco · pagado_efectivo lo que se le pagó de verdad (20260915T2340). Su valor por defecto NO vive
 *                                  en la columna —se deriva de los adelantos—, así que `is not null` significa
 *                                  exactamente «alguien registró este pago». Si no estuvieran acá, una línea
 *                                  con un pago registrado a mano se recargaría desde JORNALES y el registro
 *                                  del pago desaparecería.
 *
 * `formulas` NO entra y no puede entrar: es `not null default '{}'`, así que `is not null` sería verdadero en
 * TODAS las filas y la guarda dejaría de cargar nada.
 */
const EDITADAS_SIN_SUFIJO = Object.freeze(['efectivo_redondeado', 'pagado_banco', 'pagado_efectivo'])
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

// ═══ LO PAGADO DE CADA QUINCENA CERRADA, DESDE LA MISMA PLANILLA QUE LA CARGÓ (dueño, 17/09/2026) ═══
//
// Textual: *«revisando el historial de $/h y pagos del año hay información incompleta de los miembros del
// plantel que podés completar sacando del Sheet JORNALES»*. Medido ese día: las 272 líneas cerradas de 2026
// coinciden peso por peso con la planilla, pero `pagado_banco` y `pagado_efectivo` están vacíos en TODAS, así
// que la sección Retribución del legajo dice «consta pagado $0» sobre quincenas que el dueño pagó y registró.
//
// LA CADENA DE LA PLANILLA ES EL PAGO: ADELANTO (efectivo) + ADELANTO BANCO/EMBARGOS + BANCO + EFECTIVO = lo
// que cobró. Banco = ya transferido + por banco; efectivo = adelanto + en efectivo.
//
// SÓLO COMPLETA HUECOS, Y SÓLO SOBRE UNA LÍNEA QUE ES LA MISMA QUE LA PLANILLA:
//   · `pagado_banco`, `pagado_efectivo` o `pagada_en` escritos → es de una persona, no se toca.
//   · La línea de la base y la de la planilla difieren en horas, $/h o cualquier importe → la base ya dice
//     otra cosa que la planilla y decide una persona: no se completa sobre una cadena que no es la sellada.
//   · La planilla no trae la fila, la trae dos veces, o la trae excluida (BAJA, superpuesta) → sin dato.
//   · La cadena no suma lo que cobra, o un lado da negativo → no se afirma un pago que no cierra.

const TOLERANCIA_PESOS = 1

const iguales = (a, b) => a != null && b != null && Number.isFinite(Number(a)) && Number.isFinite(Number(b))
  && Math.abs(Number(a) - Number(b)) < TOLERANCIA_PESOS

/**
 * @param {{horas:number|null, valor_hora:number|null, cobra:number|null, adelanto:number|null, ya_transferido:number|null,
 *          por_banco:number|null, en_efectivo:number|null, pagado_banco:number|null, pagado_efectivo:number|null,
 *          pagada_en:string|null}} base  la línea de `liquidacion_linea`
 * @param {Array<{horas:number|null, valorHora:number|null, cobra:number|null, adelanto:number|null, yaTransferido:number|null,
 *          porBanco:number|null, enEfectivo:number|null, motivo:string|null}>} dePlanilla  las filas de la planilla de ESA
 *          persona en ESA quincena
 * @returns {{pagado_banco:number, pagado_efectivo:number} | {motivo:string}}
 */
export function pagadoDeLaPlanilla(base, dePlanilla = []) {
  if (!base) return { motivo: 'sin línea en la base' }
  if (base.pagado_banco != null || base.pagado_efectivo != null || base.pagada_en != null) {
    return { motivo: 'pago ya registrado en la app' }
  }
  const c = cadenaDeLaPlanilla(base, dePlanilla)
  if (c.motivo) return c
  // UN LADO NEGATIVO NO ES UN PAGO DE ESTA QUINCENA: «EFECTIVO −$358.000» dice que el banco giró más de lo que la
  // quincena cobra (Oficina, 2ª de julio: $1.365.000 contra $1.007.000). Para quien cobra por hora no se afirma; para
  // un mensual el mes lo explica (`pagadoMensualDeLaPlanilla`).
  if (c.pagado_banco < 0 || c.pagado_efectivo < 0) {
    return { motivo: `un lado negativo (banco ${c.pagado_banco}, efectivo ${c.pagado_efectivo}): el giro no es sólo esta quincena` }
  }
  return c
}

/** La cadena de la planilla como pago, sin mirar lo registrado ni el signo. */
function cadenaDeLaPlanilla(base, dePlanilla = []) {
  if (!base) return { motivo: 'sin línea en la base' }
  const validas = dePlanilla.filter((l) => !l.motivo)
  if (validas.length === 0) return { motivo: dePlanilla.length ? `la planilla la excluye (${dePlanilla[0].motivo})` : 'la planilla no la trae' }
  if (validas.length > 1) return { motivo: `la planilla la trae ${validas.length} veces` }
  const p = validas[0]
  const pares = [
    ['horas', base.horas, p.horas], ['$/h', base.valor_hora, p.valorHora], ['cobra', base.cobra, p.cobra],
    ['adelanto', base.adelanto, p.adelanto], ['ya transferido', base.ya_transferido, p.yaTransferido],
    ['por banco', base.por_banco, p.porBanco], ['en efectivo', base.en_efectivo, p.enEfectivo],
  ]
  const distintos = pares.filter(([, b, s]) => !iguales(b, s)).map(([n]) => n)
  if (distintos.length) return { motivo: `la base difiere de la planilla en ${distintos.join(', ')}` }
  const pagadoBanco = redondear2(Number(p.yaTransferido) + Number(p.porBanco))
  const pagadoEfectivo = redondear2(Number(p.adelanto) + Number(p.enEfectivo))
  if (!iguales(pagadoBanco + pagadoEfectivo, p.cobra)) {
    return { motivo: `la cadena no cierra: banco ${pagadoBanco} + efectivo ${pagadoEfectivo} ≠ cobra ${p.cobra}` }
  }
  return { pagado_banco: pagadoBanco, pagado_efectivo: pagadoEfectivo }
}

// ═══ LOS MENSUALES SE AFIRMAN POR MES (dueño, 17/09/2026) ═══
//
// Textual: *«cobran mensual, esto ya lo sabés»*. Los jefes de Oficina cobran UN sueldo por mes; hasta agosto JORNALES
// los anotaba por hora en dos bloques, y el banco gira los dos recibos juntos en la 2ª quincena. Medido el 17/09/2026:
// julio, Maldonado y Nievas, extracto del 31/07 = $1.365.843,84 = recibo Q1-07 $661.065,29 + Q2-07 $704.778,55; enero,
// Maldonado, $1.113.592 = Q1-01 $554.979,40 + Q2-01 $558.612,81. NO es aguinaldo: es el blanco del mes entero. Por eso la
// 2ª trae «EFECTIVO −$358.000»: es el efectivo de la 1ª que el banco ya cubrió.
//
// LA REGLA: la cadena de cada quincena se valida igual que por quincena (misma línea que la planilla, cierra con
// cobra); el signo se mira sobre el MES. Si el mes da los dos lados ≥ 0, lo pagado del mes es banco + efectivo de sus
// quincenas, y como `liquidacion_linea` no admite un pagado negativo (CHECK), el negativo de un lado se descuenta del
// mismo lado de las otras quincenas del mes, de la más vieja a la más nueva. La suma del mes —lo único que la solapa
// Retribución lee de un mensual— es exactamente la de la planilla; el reparto entre las dos quincenas es una
// convención y se declara en `observacion`.

const centavos = (n) => Math.round(Number(n) * 100)

/** Los negativos de un lado se descuentan de los positivos del mismo lado, en orden. La suma no cambia. */
function netear(valores) {
  const c = valores.map(centavos)
  let deficit = -c.filter((v) => v < 0).reduce((a, v) => a + v, 0)
  return c.map((v) => Math.max(0, v)).map((v) => {
    const toma = Math.min(v, deficit)
    deficit -= toma
    return (v - toma) / 100
  })
}

/**
 * @param {Array<{base: object, dePlanilla: object[]}>} delMes  las quincenas del MES de una persona mensual, de la más vieja
 *        a la más nueva (sólo las que tienen línea en la base)
 * @returns {Array<{pagado_banco:number, pagado_efectivo:number} | {motivo:string}>} una por quincena, mismo orden
 */
export function pagadoMensualDeLaPlanilla(delMes = []) {
  const cadenas = delMes.map(({ base, dePlanilla }) => cadenaDeLaPlanilla(base, dePlanilla))
  const rota = cadenas.findIndex((c) => c.motivo)
  if (rota >= 0) {
    return cadenas.map((c, i) => ({ motivo: i === rota ? c.motivo : `el mes no se puede afirmar: otra quincena ${cadenas[rota].motivo}` }))
  }
  const banco = cadenas.reduce((a, c) => a + centavos(c.pagado_banco), 0) / 100
  const efectivo = cadenas.reduce((a, c) => a + centavos(c.pagado_efectivo), 0) / 100
  if (banco < 0 || efectivo < 0) {
    return cadenas.map(() => ({ motivo: `el mes da un lado negativo (banco ${banco}, efectivo ${efectivo}): no se afirma` }))
  }
  const b = netear(cadenas.map((c) => c.pagado_banco))
  const e = netear(cadenas.map((c) => c.pagado_efectivo))
  return cadenas.map((_, i) => ({ pagado_banco: b[i], pagado_efectivo: e[i] }))
}

/**
 * ¿Qué hay hoy en lo pagado de la línea frente a lo que se va a escribir?
 *   vacio       nada registrado → se completa
 *   igual       ya es lo esperado → silencio
 *   cadena      es la cadena cruda de ESTA quincena (la escribió `--completar-pagado` por quincena) → se rehace
 *   registrado  otra cifra, o la línea marcada pagada → es de una persona: no se toca
 */
export function estadoDelPagado(base, esperado) {
  if (base.pagada_en != null) return 'registrado'
  if (base.pagado_banco == null && base.pagado_efectivo == null) return 'vacio'
  if (iguales(base.pagado_banco, esperado.pagado_banco) && iguales(base.pagado_efectivo, esperado.pagado_efectivo)) return 'igual'
  return pagadoEsLaCadena(base) ? 'cadena' : 'registrado'
}

/** La frase que queda en `liquidacion_quincena.observacion`: de dónde salió lo pagado. Idempotente. */
export const MARCA_PAGADO_JORNALES = 'Pagado completado desde JORNALES (sheet:jornales)'

export const MARCA_PAGADO_MENSUAL = 'Mensuales: lo pagado se afirma por MES'

export function observacionConPagado(observacion, lineas, fecha, { mensual = false } = {}) {
  let previa = (observacion ?? '').trim()
  if (!previa.includes(MARCA_PAGADO_JORNALES)) {
    const frase = `${MARCA_PAGADO_JORNALES} el ${fecha} en ${lineas} línea(s): banco = ADELANTO BANCO + BANCO, efectivo = ADELANTO + EFECTIVO.`
    previa = previa ? `${previa} ${frase}` : frase
  }
  if (mensual && !previa.includes(MARCA_PAGADO_MENSUAL)) {
    previa = `${previa} ${MARCA_PAGADO_MENSUAL} (${fecha}): el banco gira los recibos del mes juntos; el negativo de un lado en una quincena se descuenta del mismo lado de la otra quincena del mes.`
  }
  return previa
}

/** ¿Lo pagado de la línea es EXACTAMENTE la cadena de la planilla con la que se cargó? Entonces salió de acá. */
export function pagadoEsLaCadena(l) {
  if (!l || l.pagado_banco == null || l.pagado_efectivo == null) return false
  return iguales(l.pagado_banco, Number(l.ya_transferido) + Number(l.por_banco))
    && iguales(l.pagado_efectivo, Number(l.adelanto) + Number(l.en_efectivo))
}

/**
 * AL RECARGAR UNA QUINCENA CERRADA DESDE JORNALES (auditoría 17/09/2026): lo pagado que salió de la cadena vieja
 * se rehace con la nueva; lo que no es la cadena (o una línea marcada pagada) es de una persona y se conserva.
 * Si la cadena nueva no se puede afirmar como pago (lado negativo, no cierra), vuelve a vacío: «sin dato».
 *
 * @param {object|null} previa  la línea de la base ANTES de la recarga (snake_case)
 * @param {{cobra:number|null, adelanto:number|null, yaTransferido:number|null, porBanco:number|null, enEfectivo:number|null}} nueva
 * @returns {{pagado_banco:number|null, pagado_efectivo:number|null}}
 */
export function pagadoTrasRecarga(previa, nueva) {
  if (!previa) return { pagado_banco: null, pagado_efectivo: null }
  const conservar = { pagado_banco: previa.pagado_banco ?? null, pagado_efectivo: previa.pagado_efectivo ?? null }
  if (previa.pagada_en != null || !pagadoEsLaCadena(previa)) return conservar
  const banco = redondear2(Number(nueva.yaTransferido) + Number(nueva.porBanco))
  const efectivo = redondear2(Number(nueva.adelanto) + Number(nueva.enEfectivo))
  if (!Number.isFinite(banco) || !Number.isFinite(efectivo) || banco < 0 || efectivo < 0 || !iguales(banco + efectivo, nueva.cobra)) {
    return { pagado_banco: null, pagado_efectivo: null }
  }
  return { pagado_banco: banco, pagado_efectivo: efectivo }
}

/** La observación de una recarga conserva la frase de lo pagado, que es el único registro de su fuente. */
export function observacionDeRecarga(nueva, previa) {
  const i = (previa ?? '').indexOf(MARCA_PAGADO_JORNALES)
  if (i < 0 || (nueva ?? '').includes(MARCA_PAGADO_JORNALES)) return nueva
  return `${nueva} ${previa.slice(i)}`.trim()
}
