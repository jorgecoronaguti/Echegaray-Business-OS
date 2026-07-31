import test from 'node:test'
import assert from 'node:assert/strict'
import { formulaInteresSemana, edicionesConContenidoReal } from './cash-flow-lineas.mjs'
import { TASAS } from './costo-descubierto.mjs'
import { ALICUOTA, formulaImpuesto } from './impuesto-cheque.mjs'
import { respetarEdiciones } from './respetar-ediciones.mjs'
import { grilla } from '../scripts/cash-flow-rehacer.mjs'

// Helpers de validación de una fórmula es-AR (no la evaluamos en un Sheet real: la validamos estructural).
const ERROR_TOKENS = /#(REF|ERROR|N\/A|VALUE|DIV|NAME|NUM|NULL|¡)/
const balanceada = (s) => { let n = 0; for (const c of String(s)) { if (c === '(') n++; if (c === ')') n--; if (n < 0) return false } return n === 0 }
const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// Las filas del calendario de impuestos en "Impuestos y Financieros". El script las ubica POR RÓTULO en
// el archivo real; acá se simulan, igual que `filasTabla` (Estructura/Recurrentes) más abajo. No se
// puede omitir: `filasCalendarioOk` exige que estén, porque una referencia a una fila muerta devolvería
// $0 en silencio — y un test que pasa `{}` estaría probando el caso que el guardián prohíbe.
const FILAS_CAL = { iva: 30, iibb: 31 }

// ── CAMBIO 1 · las líneas 40/41 (descubierto e impuesto al cheque) ahora SE CALCULAN por semana ──

test('formulaInteresSemana: mismo modelo verificado que el mensual, ventana de 7 días, sin inventar tasa', () => {
  const f = formulaInteresSemana('B41', 'B$3', 'B$3+7')
  assert.ok(f.startsWith('=MAX('), 'toma el mayor entre proyectado y lo que el banco ya cobró (PISO)')
  assert.ok(balanceada(f), 'paréntesis balanceados')
  assert.ok(!ERROR_TOKENS.test(f), 'sin tokens de error')
  // NO inventa la tasa: usa las MISMAS constantes verificadas de costo-descubierto.mjs.
  assert.ok(f.includes(`${TASAS.tna}/${TASAS.base}`), 'tasa diaria = TNA/365 del acuerdo, importada, no redefinida')
  assert.ok(f.includes(`(1+${TASAS.iva}+${TASAS.percepcion})`), 'con IVA + percepción (×1,12), como el cargo real del banco')
  // La ÚNICA diferencia con el mensual es la ventana: 7 días fijos (el mensual usa DAY(EOMONTH(...))).
  assert.ok(/\*7\*/.test(f) || f.includes('*7*'), 'siete días de una semana')
  assert.ok(!/EOMONTH/.test(f.split('IFERROR')[0]), 'la proyección NO usa el mes: es semana')
  // Sobre el saldo con el que ARRANCA la semana (Efectivo al inicio de ESA columna): sin circularidad.
  assert.ok(f.includes('N(B41)>=0') && f.includes('-B41*'), 'proyecta sobre el saldo inicial de su columna')
  // Ventana del interés YA cobrado: semi-abierta [desde, hasta), como las demás columnas del semanal.
  assert.ok(f.includes('">="&B$3') && f.includes('"<"&B$3+7'), 'real acotado a la semana, límite superior excluyente')
  // es-AR: separador de argumentos ';', nunca ',' cruda entre argumentos.
  assert.ok(f.includes(';') && !/\d,\d/.test(f.replace(/0\.\d+/g, '')), 'es-AR: punto y coma, coma no es separador')
})

test("grilla semanal: las líneas del descubierto e impuesto al cheque NO quedan vacías en ninguna semana", () => {
  const g = grilla('semanal', [], "'Caja'!$E$5", "MAX('Caja'!$A$6:$A$9)", {}, FILAS_CAL)
  const desc = g.meta.detalle.find((d) => d.linea.descubierto)
  const imp = g.meta.detalle.find((d) => d.linea.impuestoCheque)
  assert.ok(desc && imp, 'existen ambas líneas en el semanal')
  const rowDesc = g.filas[desc.fila - 1]
  const rowImp = g.filas[imp.fila - 1]
  // Todas las columnas de datos (1..n) tienen contenido — antes iban '' en el semanal.
  for (let i = 1; i <= g.n; i++) {
    assert.ok(rowDesc[i] !== '' && rowDesc[i] != null, `descubierto semana ${i} no vacía`)
    assert.ok(rowImp[i] !== '' && rowImp[i] != null, `impuesto semana ${i} no vacía`)
  }
  // El descubierto ya es una fórmula viva (no un número pegado) que arranca en =MAX y referencia el
  // placeholder de inicio de su columna (lo resuelve el script contra la fila real de "Efectivo al inicio").
  assert.ok(String(rowDesc[1]).startsWith('=MAX('), 'descubierto es fórmula viva')
  assert.ok(String(rowDesc[1]).includes('#{INICIO}'), 'referencia el inicio de su columna (placeholder que resuelve el script)')
  assert.equal(String(rowImp[1]), `#{IMP:${letra(1)}}`, 'impuesto usa el mismo marcador que el mensual, resuelto abajo')
})

test('impuesto al cheque semanal resuelto = 0,6% de entradas + 0,6% de salidas de la semana', () => {
  const g = grilla('semanal', [], "'Caja'!$E$5", "MAX('Caja'!$A$6:$A$9)", {}, FILAS_CAL)
  const ingreso = g.meta.detalle.filter((d) => d.signo > 0).map((d) => d.fila)
  const egreso = g.meta.detalle.filter((d) => d.signo < 0 && !d.linea.impuestoCheque).map((d) => d.fila)
  const imp = g.meta.detalle.find((d) => d.linea.impuestoCheque)
  // El script resuelve #{IMP:col} con formulaImpuesto (la MISMA del mensual): reúso, no cálculo nuevo.
  const resuelto = formulaImpuesto('B', ingreso, egreso)
  assert.ok(resuelto.endsWith(`)*${ALICUOTA}`), '× 0,6% al final (0,6% de cada lado)')
  assert.ok(!ERROR_TOKENS.test(resuelto) && balanceada(resuelto))
  // Suma ingresos Y egresos de la columna, y NO se referencia a sí misma (sería circular: es un egreso).
  assert.ok(ingreso.every((f) => resuelto.includes(`B${f}`)), 'incluye las entradas')
  assert.ok(egreso.every((f) => resuelto.includes(`B${f}`)), 'incluye las salidas')
  assert.ok(!resuelto.includes(`B${imp.fila}`), 'no se suma a sí misma')
})

test('regresión: el MENSUAL sigue calculando descubierto e impuesto como antes', () => {
  // El mensual proyecta desde las pestañas de detalle: necesita la fila del total (la ubica el script
  // por rótulo; acá se simula). El semanal no las usa (muestra sólo lo comprometido).
  const g = grilla('mensual', [], "'Caja'!$E$5", "MAX('Caja'!$A$6:$A$9)", { Estructura: 15, Recurrentes: 24 }, FILAS_CAL)
  const desc = g.meta.detalle.find((d) => d.linea.descubierto)
  const imp = g.meta.detalle.find((d) => d.linea.impuestoCheque)
  const rowDesc = g.filas[desc.fila - 1]
  const rowImp = g.filas[imp.fila - 1]
  // El mensual proyecta por mes: DAY(EOMONTH(...)) días, no 7.
  assert.ok(String(rowDesc[1]).includes('DAY(EOMONTH('), 'mensual usa los días del mes, no 7')
  assert.equal(String(rowImp[1]), `#{IMP:${letra(1)}}`, 'mensual sigue usando el marcador de impuesto')
})

// ── CAMBIO 2 · --force NO destructivo: la fusión que preserva lo del dueño sigue SIEMPRE activa ──

test('edicionesConContenidoReal: conserva renombres reales, descarta borrados (reemplazo vacío)', () => {
  const ed = new Map([
    ['Jornales de obra', 'Jornales de obra de LA ESTRELLA'], // renombre real → se conserva
    ['Cargas sociales (F931)', ''],                          // borrado → se descarta bajo --force
    ['Impuestos', '   '],                                    // sólo espacios = borrado → se descarta
  ])
  const reales = edicionesConContenidoReal(ed)
  assert.equal(reales.size, 1)
  assert.equal(reales.get('Jornales de obra'), 'Jornales de obra de LA ESTRELLA')
  assert.ok(!reales.has('Cargas sociales (F931)') && !reales.has('Impuestos'))
})

test('bajo --force la fusión preserva un renombre REAL del dueño Y no pierde un header del generador aunque cambie el tamaño de la grilla', () => {
  const S = '    ' // la sangría de los subconceptos
  // Generador v2: la estructura CRECIÓ (se agregó una línea nueva de header abajo → todo se corre).
  const generado = [
    ['ACTIVIDADES OPERATIVAS'],
    [`${S}Jornales de obra`, '=J'],
    [`${S}Sueldos de administración`, '=S'],
    [`${S}Cargas sociales (F931)`, '=C'], // ← header del generador; en v1 no existía / estaba en otra fila
  ]
  // Lo que hay HOY: estructura v1 (más chica), con un RENOMBRE real del dueño en la primera línea.
  const actual = [
    ['ACTIVIDADES OPERATIVAS'],
    [`${S}Jornales de obra de LA ESTRELLA`, '111'],
    [`${S}Sueldos de administración`, '222'],
  ]
  // Registro: el dueño renombró "Jornales de obra" (real), y quedó un borrado viejo/falso de
  // "Cargas sociales (F931)" (reemplazo vacío) que — de aplicarse — borraría el header del generador.
  const registro = new Map([
    ['Jornales de obra', `${S}Jornales de obra de LA ESTRELLA`],
    ['Cargas sociales (F931)', ''],
  ])

  // BAJO --force: sólo las ediciones con contenido real. La fusión ancla al TEXTO, no a la posición.
  const rForce = respetarEdiciones(generado, actual, edicionesConContenidoReal(registro))
  // (1) el renombre REAL del dueño se respeta:
  assert.equal(rForce.grid[1][0], `${S}Jornales de obra de LA ESTRELLA`, 'preserva la edición real del dueño')
  // (2) el header del generador NO se pierde por el borrado viejo, aunque la estructura cambió de tamaño:
  assert.equal(rForce.grid[3][0], `${S}Cargas sociales (F931)`, 'no pierde un header del generador')
  // (3) los VALORES (fórmulas) del generador quedan intactos: la fusión toca sólo rótulos de texto.
  assert.equal(rForce.grid[3][1], '=C')

  // CONTRASTE — la corrida NORMAL (registro completo) SÍ aplicaría el borrado: la feature sigue viva.
  const rNormal = respetarEdiciones(generado, actual, registro)
  assert.equal(rNormal.grid[1][0], `${S}Jornales de obra de LA ESTRELLA`, 'el renombre también se respeta normal')
  assert.equal(rNormal.grid[3][0], '', 'en modo normal el borrado del dueño SÍ se aplica (no se rompe la feature)')
})
