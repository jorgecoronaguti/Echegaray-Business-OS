// FIXTURE ESTRUCTURAL DE JORNALES — reproduce la gramática REAL del archivo, no una
// planilla ideal. Cada rareza de acá se verificó leyendo "Obreros 26" el 30/07/2026:
//
//   · dos bloques con ANCHOS de fecha distintos (10 y 14 columnas);
//   · el primer bloque SIN fila de letras de día y SIN rótulos propios (los toma de la
//     fila 1); el segundo CON rótulos propios ("n", "Obrero", "Categoria", CLIENTE, OBRA);
//   · la fila de letras del segundo bloque trae un ERROR real (miércoles rotulado "M");
//   · fechas como SERIAL de Google, y una como TEXTO (el primer día del bloque suele
//     estar tipeado y el resto es fórmula =anterior+1);
//   · celda diaria con FÓRMULA de horas extra (=8+6);
//   · TEXTO libre en una columna diaria ("NO SE TOCA HASTA JUL");
//   · celda VACÍA y celda 0 conviviendo (no son lo mismo);
//   · el mismo trabajador en filas distintas de cada bloque, con espacio final en el
//     nombre en uno de ellos;
//   · dos obras que sólo difieren en espacios/acentos (deben colapsar al comparar);
//   · fila intermedia sin nombre con sólo importes (no es trabajador, no cierra bloque);
//   · fila de TOTALES por fórmulas y bloque de referencia UOCRA cuya columna de nombre
//     dice "Oficial", "Ayudante" (no son personas).
//
// Se usa en los tests del parser, de la política de jornada y del planificador, para
// que se ejerciten contra la forma real del archivo sin tocar la red ni el Sheet.

import { interpretarCarga } from './horas-extra.mjs'

const IDX = (letra) => {
  let n = 0
  for (const ch of String(letra).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** ISO 'YYYY-MM-DD' → serial de Google (epoch 1899-12-30). */
export const isoASerial = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569
}

const dm = (iso) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${d}/${m}`
}

/** Celda de fecha como la devuelve readSheetGrid: valor formateado + serial. */
const fecha = (iso, { comoFormula = true } = {}) => ({
  valor: dm(iso),
  numero: isoASerial(iso),
  formula: comoFormula ? '=F1+1' : null,
  derivada: false,
})

const num = (n) => ({ valor: String(n).replace('.', ','), numero: n, formula: null, derivada: false })
const formula = (f, n) => ({ valor: String(n).replace('.', ','), numero: n, formula: f, derivada: false })
const txt = (s) => ({ valor: s, numero: null, formula: null, derivada: false })

/** Construye la grilla desde filas declaradas como { A: valor, F: num(9), ... }. */
function construir(filasSpec) {
  const filas = filasSpec.map((spec) => {
    if (spec == null) return []
    const maxCol = Math.max(...Object.keys(spec).map(IDX))
    const fila = new Array(maxCol + 1).fill(null)
    for (const [letra, v] of Object.entries(spec)) {
      fila[IDX(letra)] = typeof v === 'string' ? txt(v) : v
    }
    return fila
  })
  return { titulo: 'Obreros 26', filas, merges: [], offset: { fila: 0, col: 0 } }
}

// Fechas del bloque viejo (enero, jornada de 8) y del bloque vigente (julio, 9/8).
const ENERO = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
  '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16']
export const JULIO = ['2026-07-16', '2026-07-17', '2026-07-18', '2026-07-20', '2026-07-21',
  '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-27',
  '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31']

/** La fecha operativa que el fixture deja SIN cargar (existe la columna, está vacía). */
export const FECHA_HOY = '2026-07-30' // jueves
export const FECHA_SABADO = '2026-07-25'
export const FECHA_DOMINGO = '2026-07-26' // NO existe como columna en el bloque
export const FECHA_INEXISTENTE = '2026-08-10'

const colDe = (lista, iso, base) => String.fromCharCode(base.charCodeAt(0) + lista.indexOf(iso))

/** Columnas de fecha del bloque de julio: F..S (14). */
const cJ = (iso) => {
  const i = JULIO.indexOf(iso)
  return i < 21 ? String.fromCharCode('F'.charCodeAt(0) + i) : null
}
/** Columnas del bloque de enero: F..O (10). */
const cE = (iso) => colDe(ENERO, iso, 'F')

function filaEnero(n, nombre, cliente, obra, horas) {
  const f = { A: String(n), B: nombre, AB: cliente, AC: obra }
  for (const [iso, h] of Object.entries(horas)) {
    if (h === null) continue // vacía a propósito
    f[cE(iso)] = num(h)
  }
  return f
}

function filaJulio(n, nombre, cliente, obra, celdas, extra = {}) {
  const f = { A: String(n), B: nombre, D: 'OF M', AB: cliente, AC: obra, ...extra }
  for (const [iso, v] of Object.entries(celdas)) {
    if (v === null) continue
    f[cJ(iso)] = typeof v === 'object' ? v : num(v)
  }
  return f
}

const j8 = (isos, h = 8) => Object.fromEntries(isos.map((i) => [i, h]))

/** Grilla completa del fixture. */
export function gridJornales() {
  const laborablesJulio = JULIO.filter((i) => !['2026-07-18', '2026-07-25', '2026-07-30', '2026-07-31'].includes(i))
  const nueve = Object.fromEntries(laborablesJulio.map((i) => [i, [1, 2, 3, 4].includes(new Date(i + 'T00:00:00Z').getUTCDay()) ? 9 : 8]))

  return construir([
    // ── fila 1: rótulos a nivel pestaña (los usa el bloque viejo, que no trae propios)
    { A: 'x', B: 'OBRERO', C: 'Fecha de Ingreso', E: 'DIAS TRABAJADOS', V: 'DIAS / HORAS', W: '$ HORA', AA: 'TOTAL SEMANA', AB: 'CLIENTE', AC: 'OBRA' },
    null, null, null,
    // fila 5: una fila con SÓLO dos fechas ("5/1 al 15/1") — NO es un bloque (<3)
    { J: fecha('2026-01-05', { comoFormula: false }), V: 'al', W: fecha('2026-01-15') },
    // ── fila 6: BLOQUE ENERO (10 columnas F..O), sin fila de letras de día
    Object.fromEntries(ENERO.map((iso, i) => [String.fromCharCode('F'.charCodeAt(0) + i), fecha(iso, { comoFormula: i > 0 })])),
    // filas 7..9: trabajadores (jornada de 8 en enero: la regla CAMBIÓ después)
    filaEnero(1, 'Aguero Cristian', 'JAVIER SANCHEZ', '', { ...j8(ENERO), '2026-01-12': null, '2026-01-16': 4 }),
    filaEnero(2, 'Quiroga Sebastian', 'LA ESTRELLA', '', { ...j8(ENERO), '2026-01-09': 0 }),
    filaEnero(3, 'Emanuel Alaniz', 'LA ESTRELLA', '', j8(ENERO)),
    // fila 10: TOTALES por fórmula (cierra el bloque)
    Object.fromEntries(ENERO.map((iso, i) => [String.fromCharCode('F'.charCodeAt(0) + i), formula('=SUM(F7:F9)', 24)])),
    // filas 11..14: referencia UOCRA — la columna B parece un nombre y NO lo es
    { B: 'UOCRA', C: 'diciembre' },
    { B: 'Oficial Especializado', C: '$6.119,00', V: 'TOTAL SEMANA' },
    { B: 'Ayudante', C: '$4.452,00', V: 'BANCO' },
    { B: 'Medio Oficial', C: '$4.837,00', V: 'acumulado 26' },
    null, null, null, null,
    // ── fila 19: fila de letras de día CON EL ERROR REAL (29/7 miércoles rotulado "M")
    Object.fromEntries(JULIO.map((iso, i) => [
      String.fromCharCode('F'.charCodeAt(0) + i),
      iso === '2026-07-29' ? 'M' : ['D', 'L', 'M', 'X', 'J', 'V', 'S'][new Date(iso + 'T00:00:00Z').getUTCDay()],
    ])),
    // ── fila 20: BLOQUE JULIO (14 columnas F..S) con rótulos PROPIOS
    {
      A: 'n', B: 'Obrero', D: 'Categoria', AB: 'CLIENTE', AC: 'OBRA',
      ...Object.fromEntries(JULIO.map((iso, i) => [String.fromCharCode('F'.charCodeAt(0) + i), fecha(iso, { comoFormula: i > 0 })])),
    },
    // filas 21..26: trabajadores del bloque vigente. 30/7 y 31/7 SIN cargar.
    filaJulio(1, 'Aguero Cristian', 'JAVIER SANCHEZ', 'Revoque', nueve),
    // mismo trabajador que enero, otra fila, con ESPACIO FINAL en el nombre
    filaJulio(2, 'Quiroga Sebastian ', 'JAVIER SANCHEZ', 'Revoque', { ...nueve, '2026-07-16': formula('=8+6', 14) }),
    // celda diaria con TEXTO libre (existe en el archivo real)
    filaJulio(3, 'Emanuel Alaniz', 'JAVIER SANCHEZ', 'Revoque', { ...nueve, '2026-07-22': 0, '2026-07-31': txt('NO SE TOCA HASTA JUL') }),
    // obra que difiere SÓLO en espacios y acentos → misma obra al comparar
    filaJulio(4, 'Pastran Marcelo', 'LA  ESTRELLA', 'OFICINAS Y FABRICA', { ...nueve, '2026-07-18': 4 }),
    filaJulio(5, 'Petina Jairo', 'LA ESTRELLA', 'OFICINAS Y FÁBRICA', nueve),
    // trabajador de otra obra, y con 30/7 YA CARGADO (para probar sobrescritura)
    filaJulio(6, 'Reta Sebastian', 'MESSINAS', 'BASES DE TANQUE', { ...nueve, '2026-07-30': 9 }),
    // fila 27: sin nombre, sólo importes → NO es trabajador y NO cierra el bloque
    { Z: formula('=SUM(Z21:Z26)', 0), AA: formula('=Z27', 0) },
    // fila 28: TOTALES del bloque julio
    Object.fromEntries(JULIO.map((iso, i) => [String.fromCharCode('F'.charCodeAt(0) + i), formula('=SUM(F21:F26)', 45)])),
    // fila 29+: referencia UOCRA de nuevo
    { B: 'UOCRA', C: 'MAYO' },
    { B: 'Oficial', C: '$5.235,00', V: 'TOTAL MO' },
  ])
}

/** Pestañas que declara el archivo real (para probar la resolución por año). */
export const PESTANAS = ['JORNALES 25', 'Oficina 26', 'Obreros 26', 'JORNALES 24']

const idxCol = (letra) => {
  let n = 0
  for (const ch of String(letra).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Cliente de Google FALSO sobre el fixture, con la misma superficie que usa el
 * adaptador (`listTabs`, `readSheetGrid`, `batchUpdateValues`). Las escrituras MUTAN la
 * grilla, así que la relectura de verificación ve exactamente lo que vería el Sheet real.
 *
 * `alLeer(grid, nroDeLectura)` permite simular que alguien tocó la planilla entre el
 * plan y la escritura — así se ejercita el control de concurrencia de verdad.
 *
 * `alEscribir(data)` permite simular que la API de Google falla en la escritura (un 503,
 * un token vencido). Sin este seam no se podía probar qué pasa DESPUÉS de confirmar y
 * ANTES de que la celda entre: exactamente donde vivía el bloqueo de idempotencia.
 */
export function fakeGoogleJornales({ tabs = PESTANAS, protegido = false, congelado = false, alLeer, alEscribir } = {}) {
  const grid = gridJornales()
  const escrituras = []
  let lecturas = 0
  return {
    grid,
    escrituras,
    get lecturas() { return lecturas },
    async listTabs() { return tabs },
    async readSheetGrid() {
      lecturas++
      if (alLeer) alLeer(grid, lecturas)
      return grid
    },
    async batchUpdateValues(id, data, opts) {
      // `opts` se registra porque una bandera de escritura (p.ej. `compartida`, que decide si el portón
      // aplica la firma de pestaña) es parte del contrato del llamador, no un detalle interno.
      escrituras.push({ id, data, opts })
      if (alEscribir) alEscribir(data)
      // DOS NEGATIVAS DISTINTAS, como las devuelve el cliente real: el candado de pestaña trae
      // sólo `protegido`, y el freno de mano general de Sheets trae además `congelado`. Antes acá
      // había una sola y por eso el mensaje al jefe de obra confundía las dos causas.
      if (congelado) return { protegido: true, congelado: true, bloqueadas: ['Obreros 26'], motivo: 'freno de mano (simulado)' }
      if (protegido) return { protegido: true, bloqueadas: ['Obreros 26'] }
      for (const d of data) {
        const m = /!([A-Z]+)(\d+)$/.exec(d.range)
        const fila = Number(m[2]) - 1
        const col = idxCol(m[1])
        const v = d.values[0][0]
        while (grid.filas[fila].length <= col) grid.filas[fila].push(null)
        // El Sheet EVALÚA una fórmula al escribirla: guarda la fórmula Y su valor
        // calculado. Sin emular eso, una escritura con horas extra (`=9+2`) volvía de la
        // relectura como el texto "=9+2" y la verificación posterior fallaba siempre.
        if (typeof v === 'string' && v.startsWith('=')) {
          const total = interpretarCarga({ formula: v }).total
          grid.filas[fila][col] = {
            valor: total == null ? v : String(total).replace('.', ','),
            numero: total, formula: v, derivada: false,
          }
        } else {
          grid.filas[fila][col] = { valor: String(v).replace('.', ','), numero: v, formula: null, derivada: false }
        }
      }
      return { totalUpdatedCells: data.length, totalUpdatedRanges: data.length }
    },
  }
}

export { construir as construirGrid, num, formula, txt, fecha, idxCol }
