// LA QUINCENA DE «Obreros 26» LEÍDA COMO LÍNEAS DE LIQUIDACIÓN.
//
// El dueño (09/09/2026) pidió dejar cargadas en el módulo Liquidación de la web las quincenas ya
// cerradas de 2026 «según lo indica el Sheet JORNALES». Esto es el NÚCLEO PURO de esa carga: recibe
// la grilla y devuelve líneas; no habla con Google, no habla con Postgres y por eso se puede probar.
//
// ═══ POR QUÉ NO REUSA `plantelDelEspejo` ═══
//
// Ese lector responde otra pregunta —quién está en el plantel y cuál es su $/hora vigente— y para
// eso colapsa el año entero en una fila por persona. Acá hace falta lo contrario: UNA LÍNEA POR
// PERSONA Y POR QUINCENA, con la plata de esa quincena. Lo que sí se reusa es su `claveNombre`, que
// es la que resuelve el nombre dado vuelta de abril («Marcelo Pastran» / «Pastran Marcelo»).
//
// ═══ LAS COLUMNAS SE BUSCAN, NO SE TIPEAN ═══
//
// Los rótulos (Hs · $/h · BANCO · ADELANTO · EFECTIVO · TOTAL) están a veces en la fila de fechas y
// a veces en la de arriba, y la planilla tiene más de un layout a lo largo del año. Tipear los
// índices haría que el día que se corran las columnas la carga siga andando y liquide el ADELANTO
// como si fuera el TOTAL. Se leen del rótulo de cada bloque, y si un bloque no los trae, ese bloque
// no se carga: no se hereda el layout del vecino.

import { claveNombre } from './desvinculacion-plantel.mjs'

export { claveNombre }

const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** Las celdas rotas de la planilla. Un #REF! leído como 0 liquidaría a alguien en cero sin avisar. */
export const esError = (v) => /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!)/i.test(texto(v))

/**
 * NÚCLEO PURO: un importe de la planilla ("$260.000,00") como número.
 * Devuelve `null` cuando la celda está vacía o rota — NUNCA cero. Una quincena sin dato no es una
 * quincena de $ 0, y esa distinción es la que decide si la línea se carga o se informa.
 */
export function importe(v) {
  const s = texto(v)
  if (!s || esError(s)) return null
  const n = Number(s.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const ROTULOS = {
  horas: /^hs\.?$/i,
  valorHora: /^\$\s*\/?\s*h/i,
  porBanco: /^banco$/i,
  adelanto: /^adelanto$/i,
  enEfectivo: /^efectivo$/i,
  cobra: /^total$/i,
}

/**
 * NÚCLEO PURO: dónde está cada columna de plata en ESTE bloque.
 * Mira la fila de fechas y la inmediata anterior, que son los dos lugares donde la planilla escribe
 * los rótulos. Devuelve `null` si falta alguno: media cuenta no es una cuenta.
 * @param {Array<Array>} grid
 * @param {{filaFecha:number}} bloque filas en base 1
 */
export function columnasDelBloque(grid = [], bloque = {}) {
  const cols = {}
  for (const fila of [grid[bloque.filaFecha - 1], grid[bloque.filaFecha - 2]]) {
    for (const [i, celda] of (fila ?? []).entries()) {
      for (const [campo, re] of Object.entries(ROTULOS)) {
        if (cols[campo] === undefined && re.test(texto(celda))) cols[campo] = i
      }
    }
  }
  const faltan = Object.keys(ROTULOS).filter((k) => cols[k] === undefined)
  return faltan.length ? { faltan } : { cols, faltan: [] }
}

const dosDigitos = (n) => String(n).padStart(2, '0')
const finDeMes = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate()

/**
 * NÚCLEO PURO: a qué quincena CANÓNICA pertenece un bloque, a partir de su PRIMERA fecha.
 *
 * Se toma la primera y no la última a propósito: el bloque del 4/5 al 16/5 se pasa un día del 15, y
 * rotularlo por la última fecha lo mandaría a la segunda quincena de mayo, donde ya vive el bloque
 * del 18/5 — dos bloques distintos peleando por la misma clave única.
 *
 * @param {string} ddmm "4/5"
 * @returns {{desde:string, hasta:string}|null} ISO
 */
export function quincenaDeFecha(ddmm, anio = 2026) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(texto(ddmm))
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return dia <= 15
    ? { desde: `${anio}-${dosDigitos(mes)}-01`, hasta: `${anio}-${dosDigitos(mes)}-15` }
    : { desde: `${anio}-${dosDigitos(mes)}-16`, hasta: `${anio}-${dosDigitos(mes)}-${finDeMes(anio, mes)}` }
}

/** NÚCLEO PURO: la quincena canónica en la que cae una fecha ISO. La de HOY es la que está EN CURSO. */
export function quincenaEnCurso(hoy = new Date()) {
  const anio = hoy.getUTCFullYear()
  const mes = hoy.getUTCMonth() + 1
  return quincenaDeFecha(`${hoy.getUTCDate()}/${mes}`, anio)
}

/** La primera fecha DD/MM del rótulo del bloque, en el orden en que está escrita. */
export function primeraFecha(grid = [], bloque = {}) {
  for (const celda of grid[bloque.filaFecha - 1] ?? []) {
    if (/^\d{1,2}\/\d{1,2}$/.test(texto(celda))) return texto(celda)
  }
  return null
}

/**
 * NÚCLEO PURO: las líneas de personas de un bloque.
 *
 * `cobra` es la columna TOTAL de la planilla (Hs × $/h) y es la que suma el total de la quincena.
 * `total` de la línea es lo que impone el CHECK de la base: por_banco + en_efectivo, o sea lo que se
 * paga en esta quincena una vez descontado el adelanto ya entregado.
 *
 * Una línea a la que le falte cualquiera de las cuatro cifras de plata sale con `incompleta`: se
 * informa y no se carga. Rellenarla con ceros la haría indistinguible de una liquidación real.
 */
export function lineasDelBloque(grid = [], bloque = {}, cols = {}) {
  const out = []
  for (let r = bloque.inicio; r <= bloque.fin; r++) {
    const f = grid[r - 1] ?? []
    const nombre = texto(f[1])
    if (nombre.length < 3) continue
    const cobra = importe(f[cols.cobra])
    const adelanto = importe(f[cols.adelanto]) ?? 0
    const porBanco = importe(f[cols.porBanco]) ?? 0
    const enEfectivo = importe(f[cols.enEfectivo])
    const horas = importe(f[cols.horas])
    const valorHora = importe(f[cols.valorHora])
    const faltan = []
    if (cobra == null) faltan.push('TOTAL')
    if (enEfectivo == null) faltan.push('EFECTIVO')
    for (const campo of ['cobra', 'adelanto', 'porBanco', 'enEfectivo']) {
      if (esError(f[cols[campo]])) faltan.push(`${campo} roto`)
    }
    const linea = {
      fila: r,
      nombre,
      clave: claveNombre(nombre),
      horas,
      valorHora,
      cobra,
      adelanto,
      porBanco,
      enEfectivo,
      total: cobra == null || enEfectivo == null ? null : porBanco + enEfectivo,
      incompleta: faltan.length ? faltan.join(', ') : null,
    }
    // LA IDENTIDAD DE LA PLANILLA ES SU PROPIO CONTROL: TOTAL = BANCO + ADELANTO + EFECTIVO. Si no
    // cierra, alguna de las cuatro celdas dice otra cosa que lo que el bloque suma, y cargarla
    // metería en la base una fila que no reproduce el papel.
    // El residuo se nombra porque tiene culpable: en la quincena del 17/8 la planilla estrenó una
    // columna de plata SIN RÓTULO (la 24, $200.000 por cabeza) que su propia fila de totales tampoco
    // suma. Decir «no cierra» sin el número obliga a rehacer la resta a mano.
    const residuo = cobra == null || enEfectivo == null ? null : cobra - (porBanco + adelanto + enEfectivo)
    linea.residuo = residuo
    if (!linea.incompleta && Math.abs(residuo) > 0.5) {
      linea.incompleta = `no cierra por ${residuo.toFixed(2)}: TOTAL ${cobra} vs BANCO+ADELANTO+EFECTIVO ${porBanco + adelanto + enEfectivo}`
    }
    out.push(linea)
  }
  return out
}

/**
 * NÚCLEO PURO: quién es esta persona, y por qué vía se lo afirma.
 *
 * Tres niveles, de más fuerte a más débil, y NINGUNO adivina por parecido:
 *   1. `puente`  — el CUIL declarado a mano en el repo para ese nombre de planilla.
 *   2. `exacta`  — el mismo conjunto de tokens que el nombre de la base ("Jofre Ismael" = "JOFRE
 *                  ISMAEL"). No es similitud: es igualdad después de normalizar.
 *   3. `subconjunto` — todos los tokens del nombre de planilla están en el de la base y el candidato
 *                  es ÚNICO ("Emanuel Alaniz" ⊂ "ALANIZ EMANUEL ARIEL"). Con dos candidatos no
 *                  resuelve: devuelve `ambiguo`, porque elegir uno sería inventar.
 *
 * El nivel 3 se marca en la salida para que quien lo mire pueda rechazarlo: es el que una vez metió
 * a «Castillo Carlos» dentro de «GONZALEZ CARLOS SAMUEL».
 */
export function resolverPersona(clave, { puente, porCuil, personas }) {
  const cuil = puente.get(clave)
  if (cuil) {
    const p = porCuil.get(cuil)
    if (p) return { persona: p, via: 'puente' }
  }
  const tokens = clave.split(' ').filter(Boolean)
  const exactas = personas.filter((p) => p.clave === clave)
  if (exactas.length === 1) return { persona: exactas[0], via: 'exacta' }
  if (exactas.length > 1) return { persona: null, via: 'ambiguo', candidatos: exactas.map((p) => p.nombre) }
  const sub = personas.filter((p) => tokens.every((t) => p.tokens.includes(t)))
  if (sub.length === 1) return { persona: sub[0], via: 'subconjunto' }
  if (sub.length > 1) return { persona: null, via: 'ambiguo', candidatos: sub.map((p) => p.nombre) }
  return { persona: null, via: 'sin-persona' }
}

/**
 * NÚCLEO PURO: EL CONTROL DE CIERRE de una quincena.
 *
 * La regla es dura a propósito: una quincena entra COMPLETA o no entra. Cargar las líneas que
 * matchean y dejar afuera las que no dejaría en la base una quincena con el total corto que se lee
 * igual de bien que una correcta — que es exactamente la forma en que un dato miente en silencio.
 */
export function controlDeCierre(lineas = []) {
  const totalSheet = lineas.reduce((a, l) => a + (l.cobra ?? 0), 0)
  const cargables = lineas.filter((l) => !l.incompleta && l.persona_id)
  const totalCargable = cargables.reduce((a, l) => a + (l.cobra ?? 0), 0)
  const problemas = lineas.filter((l) => l.incompleta || !l.persona_id)
  return {
    totalSheet,
    totalCargable,
    diferencia: totalSheet - totalCargable,
    cargables,
    problemas,
    cierra: problemas.length === 0 && Math.abs(totalSheet - totalCargable) <= 0.5,
  }
}
