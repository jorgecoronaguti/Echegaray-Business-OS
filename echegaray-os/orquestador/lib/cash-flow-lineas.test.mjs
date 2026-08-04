import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formulaInteresSemana, edicionesConContenidoReal,
  formulaComisionesMes, formulaComisionesSemana, expresionComisionesPromedio, COMISIONES,
  formulaOficina, formulaLineaMes, CUADRO, expresionReal, verificarCuadro, formulaCobranzas,
} from './cash-flow-lineas.mjs'
import { NAT } from './banco-santander.mjs'
import { TASAS } from './costo-descubierto.mjs'
import { ALICUOTA, formulaImpuesto } from './impuesto-cheque.mjs'
import { respetarEdiciones } from './respetar-ediciones.mjs'
import { grilla } from '../scripts/cash-flow-rehacer.mjs'

// Helpers de validación de una fórmula es-AR (no la evaluamos en un Sheet real: la validamos estructural).
const ERROR_TOKENS = /#(REF|ERROR|N\/A|VALUE|DIV|NAME|NUM|NULL|¡)/
const balanceada = (s) => { let n = 0; for (const c of String(s)) { if (c === '(') n++; if (c === ')') n--; if (n < 0) return false } return n === 0 }
const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// LAS FILAS DEL CALENDARIO DE IMPUESTOS, QUE `grilla` EXIGE (arreglado el 31/07 en dos frentes a la vez).
//
// En el generador real las ubica getSheetMeta POR RÓTULO; acá se simulan, igual que FILAS_TABLA. No se
// pueden omitir: `filasCalendarioOk` exige que estén, porque una referencia a una fila muerta devolvería
// $0 en silencio — así que un test que pasara `{}` estaría probando justo el caso que el guardián
// prohíbe. Y faltaban desde que se agregó la línea de IVA/IIBB: los tres tests de abajo venían tirando
// "no sé en qué filas están IVA a pagar/IIBB a pagar" y por lo tanto NINGUNO probaba nada. Un test que
// tira antes de la primera aserción es peor que no tenerlo: figura en la suite y no defiende la grilla.
//
// Los números son los REALES de "Impuestos y Financieros" (leídos del archivo: IVA en la 18, IIBB en la
// 28), no dos cualquiera: si algún día el simulacro y la pestaña se separan, que se note acá.
const FILAS_CAL = { iva: 18, iibb: 28 }

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// LA LÍNEA DE COMISIONES BANCARIAS (31/07) — EL COSTO QUE EL CUADRO PROYECTABA EN $0
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Lo que estos tests defienden no es la fórmula: es que el rótulo con el que el SUMIFS busca sea EL
// MISMO que escribe clasificarMovimiento en la columna F de _BANCO_RAW. Si uno de los dos cambia y el
// otro no, la fórmula no da error: da $0, y $381.649,64 de costo bancario desaparecen sin ruido.

test('el SUMIFS de comisiones busca EXACTAMENTE el rótulo que el clasificador escribe en _BANCO_RAW', () => {
  assert.equal(COMISIONES.marca, NAT.comisiones, 'el contrato del SUMIFS es el mismo string que NAT.comisiones')
  assert.equal(COMISIONES.hoja, '_BANCO_RAW')
  assert.equal(COMISIONES.naturaleza, 'F', 'la columna Naturaleza de la réplica (contrato con banco-raw-pestana.mjs)')
  const f = formulaComisionesMes('B$3')
  assert.ok(f.includes(`"${NAT.comisiones}"`), 'el criterio del SUMIFS es el rótulo literal')
})

test('la línea mensual de comisiones: real en los meses pasados, PISO en los futuros, sin circularidad', () => {
  const f = formulaComisionesMes('B$3')
  assert.ok(balanceada(f) && !ERROR_TOKENS.test(f))
  // Mes cerrado o en curso → lo que el banco cobró. Mes futuro → MAX(real; promedio).
  assert.ok(f.startsWith('=IF(EOMONTH(B$3;0)<=EOMONTH(TODAY();0);'), 'el pasado es el real, no una proyección')
  assert.ok(f.includes('MAX('), 'el futuro es un PISO: nunca subestima un costo')
  // NO referencia ninguna celda de su propia fila: el promedio sale de la réplica. La tentación era un
  // AVERAGEIF sobre la propia fila ($B7:$M7) —lo que hace la pestaña de Impuestos en una fila APARTE—
  // pero acá sería circular: la celda del mes futuro entraría en su propio promedio y Google devolvería
  // #REF! en cada mes proyectado. Se comprueba que toda referencia esté calificada: o es la réplica
  // (_BANCO_RAW!...), o es la espina de meses del encabezado ($B$3:$M$3), o es la celda del mes.
  assert.ok(!/AVERAGEIF/i.test(f), 'no promedia sobre su propia fila (sería circular)')
  const refsSueltas = f.replace(/_BANCO_RAW!\$[A-Z]\$4:\$[A-Z]/g, '').replace(/\$B\$3:\$M\$3/g, '').replace(/B\$3/g, '')
  assert.ok(!/\$?[A-Z]{1,2}\$?\d+/.test(refsSueltas), `quedó una referencia sin calificar: ${refsSueltas}`)
  assert.ok(f.includes(';">="&B$3;') && f.includes('"<"&EOMONTH(B$3;0)+1'), 'ventana del mes, límite superior excluyente')
  // es-AR: punto y coma como separador de argumentos.
  assert.ok(f.includes(';') && !/\d,\d/.test(f.replace(/0\.\d+/g, '')), 'es-AR: punto y coma, coma no es separador')
})

test('el promedio de comisiones se calcula sobre los meses QUE TIENEN extracto, no sobre doce', () => {
  const p = expresionComisionesPromedio()
  assert.ok(balanceada(p) && !ERROR_TOKENS.test(p))
  // Divide por la cantidad de meses de la espina que tienen al menos un movimiento de esa naturaleza:
  // dividir por 12 daría un promedio artificialmente bajo mientras el extracto cubra dos meses.
  assert.ok(p.includes('SUMPRODUCT(--(COUNTIFS('), 'cuenta los meses con dato, como el resto del archivo')
  assert.ok(p.includes('$B$3:$M$3'), 'contra la espina de doce meses del encabezado')
  assert.ok(p.startsWith('IF(') && p.includes('=0;0;'), 'sin extracto todavía → 0, nunca una división por cero')
})

test('la línea semanal de comisiones carga el cargo en la semana del cierre de mes, que es cuando el banco lo cobra', () => {
  const f = formulaComisionesSemana('B$3', 'B$3+7')
  assert.ok(balanceada(f) && !ERROR_TOKENS.test(f))
  assert.ok(f.startsWith('=MAX('), 'PISO, igual que el interés del descubierto semanal')
  // La condición que decide si esta semana es la del cargo: el cierre del mes cae dentro de [desde, hasta).
  assert.ok(f.includes('(EOMONTH(B$3;0)>=B$3)*(EOMONTH(B$3;0)<B$3+7)'),
    'la proyección cae íntegra en la semana que contiene el último día del mes, no repartida entre las cuatro')
  assert.ok(f.includes('">="&B$3') && f.includes('"<"&B$3+7'), 'el real acotado a la semana, límite excluyente')
})

test('la línea de comisiones está en el cuadro, en Financiación, y NO queda vacía en ninguna columna', () => {
  for (const [periodo, filasTabla] of [['mensual', { Estructura: 15, Recurrentes: 24 }], ['semanal', {}]]) {
    const g = grilla(periodo, [], "'Caja'!$E$5", "MAX('Caja'!$A$6:$A$9)", filasTabla, FILAS_CAL)
    const com = g.meta.detalle.find((d) => d.linea.comisionesBancarias)
    assert.ok(com, `${periodo}: la línea de comisiones existe en el cuadro`)
    assert.equal(com.signo, -1, `${periodo}: es un egreso`)
    const row = g.filas[com.fila - 1]
    for (let i = 1; i <= g.n; i++) {
      assert.ok(row[i] !== '' && row[i] != null, `${periodo}: comisiones columna ${i} no vacía`)
      assert.ok(String(row[i]).startsWith('='), `${periodo}: columna ${i} es fórmula viva, no un número pegado`)
      assert.ok(String(row[i]).includes(NAT.comisiones), `${periodo}: columna ${i} filtra por la naturaleza`)
    }
  }
})

test('el impuesto al cheque incluye las comisiones en su base: el banco lo cobra sobre ellas', () => {
  // VERIFICADO CONTRA EL EXTRACTO: el 29/06 los débitos del día suman $3.667.838,24 —incluidas las tres
  // comisiones y sus impuestos— y el banco cobró $22.007,03 de impuesto al cheque, que es el 0,6%
  // EXACTO de ese total. O sea: la comisión bancaria está gravada, y la línea del impuesto tiene que
  // contarla entre los egresos de la columna. Se excluye a sí misma (sería circular), nada más.
  const g = grilla('mensual', [], "'Caja'!$E$5", "MAX('Caja'!$A$6:$A$9)", { Estructura: 15, Recurrentes: 24 }, FILAS_CAL)
  const com = g.meta.detalle.find((d) => d.linea.comisionesBancarias)
  const egreso = g.meta.detalle.filter((d) => d.signo < 0 && !d.linea.impuestoCheque).map((d) => d.fila)
  assert.ok(egreso.includes(com.fila), 'la fila de comisiones entra a la base del impuesto al cheque')
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

test('OFICINA: la línea de la planilla de sueldos lee los rangos con nombre, no Compras', () => {
  const f = formulaOficina('$C$3', '$D$3')
  assert.match(f, /OFICINA_PAGO/)
  assert.match(f, /OFICINA_PAGADO/)
  assert.match(f, /OFICINA_PROYECTADO/)
  assert.ok(!/Compras!/.test(f), 'la nómina sale de la planilla de sueldos, no de Compras')
  assert.ok(!/,/.test(f.replace(/"[^"]*"/g, '')), 'separador es-AR')
})

test('OFICINA: un mes pagado y un mes proyectado se suman, y el mes de otra ventana no entra', () => {
  const f = formulaOficina('$C$3', '$D$3')
  assert.match(f, /ISNUMBER\(OFICINA_PAGO\)\*\(OFICINA_PAGO>=\$C\$3\)\*\(OFICINA_PAGO<\$D\$3\)/)
})

test('OFICINA: NO se vuelve a proyectar en el mensual — su bloque ya proyecta hasta diciembre', () => {
  const l = { nombre: 'Oficina', oficina: true }
  const f = formulaLineaMes(l, 'C', 'C', 3, {})
  assert.ok(!/EOMONTH\(TODAY\(\);-4\)/.test(f), 'no debe entrar en el promedio de los últimos 3 meses')
  assert.match(f, /OFICINA_PAGO/)
})

test('NÓMINA DE ADMINISTRACIÓN: suma la planilla, y Compras queda como memo que no suma', () => {
  // SE INVIRTIÓ EL 01/08. Hasta ese día la que sumaba era Compras y el memo era la planilla, porque
  // no se sabía cuál de las dos era la correcta. Ahora se sabe: Compras tenía CINCO personas y la
  // planilla DOS —faltaban los tres retiros de Dirección— así que la planilla estaba incompleta, no
  // equivocada. Completada, manda ella. Ver lib/direccion-retiros.mjs.
  const grupos = CUADRO.flatMap((a) => a.grupos)
  const memo = grupos.find((g) => /según Compras/.test(g.nombre))
  assert.ok(memo, 'existe el grupo de control de la nómina de administración')
  assert.equal(memo.signo, 0, 'un memo NUNCA suma: contaría dos veces el mismo sueldo')
  // UNA sola línea, y su subtotal es esa línea. Con tres, el subtotal sumaba las dos mitades más la
  // otra fuente de esas mismas mitades: un número que parece el costo del mes y no es nada.
  assert.equal(memo.lineas.length, 1, 'el subtotal de un grupo de control tiene que significar algo')
  assert.ok(memo.lineas[0].desdeCompras, 'el control se lee de Compras, que es la otra fuente')

  // La línea que SUMA existe, está en un grupo con signo, y no es la del memo.
  const gCaja = grupos.find((g) => g.lineas.some((l) => l.rubro === 'Nómina · Sueldos administración' && !l.desdeCompras))
  assert.ok(gCaja, 'la nómina de administración tiene que seguir saliendo de caja')
  assert.equal(gCaja.signo, -1)
})

test('la línea que suma lee la planilla; la del memo lee Compras — si no, el control se compara consigo mismo', () => {
  const lineas = CUADRO.flatMap((a) => a.grupos.flatMap((g) => g.lineas))
  const suma = lineas.find((l) => l.rubro === 'Nómina · Sueldos administración' && !l.desdeCompras)
  const memo = lineas.find((l) => l.desdeCompras)
  const fSuma = expresionReal(suma, '$C$3', '$D$3')
  const fMemo = expresionReal(memo, '$C$3', '$D$3')
  assert.ok(fSuma.includes('OFICINA_PAGO') && fSuma.includes('DIRECCION_PAGO'), fSuma)
  assert.ok(!fSuma.includes('Compras!'), `la que suma no puede leer Compras: ${fSuma}`)
  assert.ok(fMemo.includes('Compras!$AC$4:$AC'), `el memo tiene que leer Compras: ${fMemo}`)
  assert.notEqual(fSuma, fMemo, 'un control que devuelve lo mismo que lo controlado no controla nada')
})

test('una línea de control NUNCA puede vivir en un grupo que suma', () => {
  // El guard de verificarCuadro. Se prueba de verdad —moviendo la línea— y no leyendo el código:
  // si mañana alguien la muda a "Pagos al personal", el cuadro contaría el sueldo dos veces y el
  // control del pie seguiría cerrando, porque las dos líneas salen del mismo lado.
  const grupos = CUADRO.flatMap((a) => a.grupos)
  const memo = grupos.find((g) => g.lineas.some((l) => l.desdeCompras))
  const original = memo.signo
  memo.signo = -1
  try {
    assert.throws(() => verificarCuadro(), /líneas de control que SÍ suman/)
  } finally {
    memo.signo = original
  }
  assert.doesNotThrow(() => verificarCuadro(), 'el cuadro tiene que volver a estar sano')
})

// ═══ EL CUADRO PROYECTABA LO QUE SE PAGA Y NO LO QUE SE COBRA (04/08/2026) ═══
//
// Medido contra el archivo real: los egresos de ago–dic estaban proyectados y sumaban ($72–89M por
// mes); las cobranzas esperadas del mismo período eran un memo con signo 0. Cierre de diciembre
// −$254.274.052 contra +$169.646.277 haciéndolo simétrico: $423.920.329 de diferencia, y una empresa
// sana leyéndose como una quiebra. El dueño: "me da todo en rojo y a pérdida cuando la empresa
// demuestra lo contrario".

test('LAS COBRANZAS ESPERADAS SUMAN AL FLUJO, igual que los egresos proyectados', () => {
  const todos = JSON.parse(JSON.stringify(CUADRO))
  const buscar = (n) => JSON.stringify(n).length && null
  void buscar
  const grupos = []
  const recorrer = (x) => {
    if (Array.isArray(x)) return x.forEach(recorrer)
    if (x && typeof x === 'object') {
      if (typeof x.nombre === 'string' && Array.isArray(x.lineas)) grupos.push(x)
      Object.values(x).forEach(recorrer)
    }
  }
  recorrer(todos)
  const esperadas = grupos.find((g) => /cobranzas esperadas/i.test(g.nombre))
  assert.ok(esperadas, 'no encontré el grupo de cobranzas esperadas en el cuadro')
  assert.equal(esperadas.signo, 1, 'sigue siendo un memo: el cuadro proyecta el gasto y no el cobro')
  assert.match(esperadas.nombre, /suma al flujo/, 'el rótulo tiene que decir lo que hace')
})

test('un cobro esperado NO suma hacia atrás: el pasado es un hecho, no una expectativa', () => {
  const f = formulaCobranzas('civil', 'A1', 'B1', 'esperado')
  assert.match(f, /EOMONTH\(TODAY\(\);-1\)\+1/,
    'sin el corte, un cobro que se esperaba en julio y no entró inflaría un mes ya cerrado')
  assert.match(f, /\(A1>=EOMONTH/, 'el corte tiene que mirar el INICIO de la ventana, no la fecha del cobro')
})

test('el cobro REAL no lleva corte: enero sigue mostrando lo que entró en enero', () => {
  const f = formulaCobranzas('civil', 'A1', 'B1', 'cobrado')
  assert.doesNotMatch(f, /EOMONTH\(TODAY\(\)/, 'el hecho verificable contra el banco no se recorta')
  assert.match(f, /\(LOWER\(Cobranzas!\$O\$5:\$O\$400\)="cobrado"\)/)
})

test('esperado y cobrado son excluyentes: ninguna cobranza puede contarse dos veces', () => {
  const cob = formulaCobranzas('civil', 'A1', 'B1', 'cobrado')
  const esp = formulaCobranzas('civil', 'A1', 'B1', 'esperado')
  assert.match(cob, /="cobrado"/)
  assert.match(esp, /<>"cobrado"/)
  // Y ninguno de los dos toma un valor endosado: esa plata se entregó a un tercero.
  for (const f of [cob, esp]) assert.match(f, /ENDOSADO/)
})

// ── LA CADENA DE CAJA AL CIERRE DE CADA PERÍODO ────────────────────────────────────────────────────
//
// El defecto que estos dos tests atrapan (04/08/2026): el ancla del saldo real se decidía con
// EOMONTH en las DOS pestañas. En la semanal las cinco columnas de agosto caen en el mismo mes, así
// que las cinco arrancaban con el saldo declarado en vez de encadenar con el cierre de la anterior.
// La definición vive en lib/cash-flow-ancla-saldo.mjs; acá se prueba que la grilla la use.

// La columna que sigue a los períodos es el "Total 2026" y no lleva ancla: es el saldo del primer
// período, no una columna más. Se recorta acá para no probar contra ella.
const columnasDePeriodo = (fila, n) => fila.slice(1, n + 1)

test('grilla semanal: el ancla se decide por la ventana de la semana, no por su mes', () => {
  const g = grilla('semanal', [], 'CAJA_TOTAL_DISPONIBLE', 'CAJA_FECHA_SALDO', {}, FILAS_CAL)
  const fila = g.filas[g.meta.inicio - 1]
  for (const c of columnasDePeriodo(fila, 53)) {
    assert.doesNotMatch(String(c), /EOMONTH/,
      'un cuadro semanal no puede decidir su ancla con un criterio mensual: agosto tiene 5 columnas')
    assert.match(String(c), /\$3\+7<=CAJA_FECHA_SALDO/, 'la ventana del período es [desde, desde+7)')
  }
  // Cada semana encadena con el CIERRE de la anterior, no con el saldo declarado.
  assert.match(String(fila[3]), new RegExp(`C${g.meta.cierre}`), 'la 3ª semana engancha del cierre de la 2ª')
})

test('grilla mensual: el ancla sigue siendo el mes del saldo — la corrección no toca lo que ya cerraba', () => {
  // El mensual proyecta desde dos pestañas-tabla; sin sus filas el generador se niega a referenciar
  // una fila muerta. Los números son los rótulos reales ubicados por el script.
  const filasTabla = { Estructura: 60, Recurrentes: 40 }
  const g = grilla('mensual', [], 'CAJA_TOTAL_DISPONIBLE', 'CAJA_FECHA_SALDO', filasTabla, FILAS_CAL)
  const fila = g.filas[g.meta.inicio - 1]
  for (const c of columnasDePeriodo(fila, 12)) {
    assert.match(String(c), /EOMONTH\([A-Z]+\$3;0\)\+1<=CAJA_FECHA_SALDO/,
      'el mes usa el primero del mes siguiente como límite excluyente')
  }
  assert.match(String(fila[3]), new RegExp(`C${g.meta.cierre}`), 'marzo encadena con el cierre de febrero')
})
