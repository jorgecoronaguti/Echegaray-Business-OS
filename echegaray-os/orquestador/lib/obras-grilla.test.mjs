// LA GRILLA DE `OBRAS`, VERIFICADA EN FRÍO — porque sus defectos NO dan #ERROR.
//
// Esta pestaña casi no tiene números propios: son fórmulas. Y una fórmula equivocada acá no se rompe,
// devuelve un número creíble. Los cuatro modos de mentir que este archivo persigue:
//
//   · SUMAR DOS VECES — en Cobranzas conviven la fila madre de la obra y su cronograma de
//     certificaciones, con el mismo importe. Sumar todo lo que matchea duplica la venta.
//   · FILTRAR POR UN NOMBRE QUE NO EXISTE — un cliente que no es el canónico del desplegable de
//     Compras da $0 para siempre, sin un solo error.
//   · MEZCLAR LO QUE NO ES CAJA — la máquina propia y la mano de obra no son plata que sale por
//     Compras; si entran a los totales, el pendiente miente para arriba.
//   · LA COMA — en locale es_AR el separador de argumentos es `;`. Una coma es un decimal, y la
//     fórmula entra rota al archivo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaObras, serialISO, ANCHO_OBRAS, ANCHOS_OBRAS, REFS_OBRAS, OBRAS_DEL_ANO } from './obras-grilla.mjs'
import { OBRAS_FUTURAS, CLIENTES_CANONICOS, esProyectable, totalEgresos } from './obras-datos.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

const COLS = 'ABCDEFGHI'
const g = grillaObras({ obras: OBRAS_FUTURAS })

/** El contenido de una celda por su referencia A1 ("C16"), como se lee en el Sheet. */
const cel = (grid, ref) => {
  const [, col, fila] = ref.match(/^([A-I])(\d+)$/)
  return grid.filas[Number(fila) - 1][COLS.indexOf(col)]
}
const vacia = (v) => v === VACIO || v === '' || v === undefined
/** Todas las fórmulas de la grilla, con su referencia A1 — el material de casi todos los tests. */
const formulas = (grid) => grid.filas.flatMap((f, i) => f
  .map((v, c) => [`${COLS[c]}${i + 1}`, v])
  .filter(([, v]) => typeof v === 'string' && v.startsWith('=')))
const bloque = (clave) => g.bloques.find((b) => b.clave === clave)

// ─────────────────────────────────────────────────────────────────────────────
// LA VENTA, UNA SOLA VEZ
// ─────────────────────────────────────────────────────────────────────────────

test('la venta POR CLIENTE no suma la fila madre Y su cronograma: el "⇒ TOTAL 2026" era el número más inflado', () => {
  // El defecto real (corregido el 13/08): la Sección 1 sumaba TODO lo que matcheaba el cliente. Con
  // la madre ("Playon Azufre", $58M) y sus certificaciones (los mismos $58M) cargadas, la venta del
  // año salía al doble. Si alguien vuelve a la SUMIFS pelada, este test se pone rojo.
  const [f0, f1] = g.fClientes
  for (let f = f0; f <= f1; f++) {
    const v = cel(g, `C${f}`)
    assert.match(v, /^=IF\(SUMIFS\(/, `C${f}: la venta del cliente tiene que preferir las filas fuera del cronograma`)
    assert.match(v, /"<>\*Certificaci\*"/, `C${f}: sin el filtro de certificaciones, la venta se cuenta dos veces`)
  }
})

test('el anti-duplicado es a prueba de acento: "Certificacion" sin tilde también es cronograma', () => {
  // Un needle "*Certificación*" perdona a la fila escrita sin tilde — y perdonarla es volver a duplicar.
  for (const [ref, f] of formulas(g)) {
    assert.ok(!f.includes('Certificación'), `${ref}: el needle no puede llevar el acento (deja pasar "Certificacion")`)
  }
  assert.ok(formulas(g).some(([, f]) => f.includes('"<>*Certificaci*"')), 'y el needle cortado tiene que existir')
})

test('venta se define UNA vez: la fila del cliente y la de la obra usan la misma anatomía', () => {
  // Realidad única. Si la Sección 1 y la Sección 2 divergen, el total del año deja de ser la suma de
  // las obras y nadie se entera hasta que los dos números se miran juntos.
  const anatomia = (v) => [/^=IF\(SUMIFS\(/.test(v), v.includes('"<>*Certificaci*"'), v.includes('"<>CANCELAR"')]
  const cliente = anatomia(cel(g, `C${g.fClientes[0]}`))
  for (const b of g.bloques) {
    assert.deepEqual(anatomia(cel(g, `C${b.fProt}`)), cliente, `${b.clave}: la venta de la obra no se calcula como la del cliente`)
  }
  assert.deepEqual(cliente, [true, true, true], 'las dos excluyen el cronograma y el estado CANCELAR')
})

// ─────────────────────────────────────────────────────────────────────────────
// CONTRA QUÉ FILTRA EL REAL
// ─────────────────────────────────────────────────────────────────────────────

test('ninguna fórmula de real acumulado filtra por un cliente que no esté en CLIENTES_CANONICOS', () => {
  // Compras col J es un desplegable: el texto tiene que coincidir letra por letra. Un alias
  // ("Quattropani" a secas) devuelve $0 y el pendiente queda igual al proyectado para siempre.
  const col = REFS_OBRAS.cmp.cliente
  const usados = formulas(g)
    .flatMap(([, f]) => [...f.matchAll(new RegExp(`'Compras'!\\$${col}\\$\\d+:\\$${col};"([^"]+)"`, 'g'))].map((m) => m[1]))
  assert.ok(usados.length > 0, 'tiene que haber fórmulas de real acumulado que mirar')
  for (const c of usados) assert.ok(CLIENTES_CANONICOS.includes(c), `"${c}" no es un cliente canónico de Compras`)
})

test('dos obras del MISMO cliente no pueden compartir proveedor: el real se contaría en las dos', () => {
  // El real acumulado filtra por (proveedor, cliente, fecha ≥ inicio de la obra). Dos obras del mismo
  // cliente con el mismo proveedor y fechas solapadas reclaman LA MISMA factura cada una: el costo
  // real sale al doble sin un solo error. Hoy no pasa; este test es el que avisa el día que pase.
  const vistos = new Map()
  for (const o of OBRAS_FUTURAS) {
    for (const e of o.egresos ?? []) {
      if (!e.proveedor) continue
      const k = `${o.cliente} ‖ ${e.proveedor}`
      assert.ok(!vistos.has(k), `${o.clave}/${e.concepto}: "${k}" ya lo usa ${vistos.get(k)} — el real se duplicaría`)
      vistos.set(k, o.clave)
    }
  }
})

test('el real se mide desde el inicio de la obra leído de la celda, no de una fecha pegada', () => {
  const b = bloque('sf-pisos-industriales')
  assert.equal(cel(g, `E${b.fDetalle[0]}`),
    `=SUMIFS('Compras'!$O$4:$O;'Compras'!$E$4:$E;"ACA";'Compras'!$J$4:$J;"San Francisco";'Compras'!$C$4:$C;">="&$H$${b.fProt})`)
})

test('las columnas salen de las refs INYECTADAS: ninguna letra queda pegada en la fórmula', () => {
  // El escritor resuelve las columnas contra los encabezados vivos. Si una letra quedara fija, la
  // fórmula sumaría otra columna el día que el archivo se reordene, y sin dar error.
  const refs = {
    cob: { hoja: 'Cobranzas', cliente: 'Z', concepto: 'Y', total: 'X', estado: 'W', desde: 9 },
    cmp: { hoja: 'Compras', fecha: 'V', proveedor: 'U', cliente: 'T', total: 'S', desde: 7 },
    mat: REFS_OBRAS.mat,
  }
  const otra = grillaObras({ obras: OBRAS_FUTURAS, refs })
  const b = otra.bloques.find((x) => x.clave === 'sf-pisos-industriales')
  const real = cel(otra, `E${b.fDetalle[0]}`)
  assert.match(real, /'Compras'!\$S\$7:\$S/, 'el total de Compras')
  assert.match(real, /'Compras'!\$T\$7:\$T;"San Francisco"/, 'el cliente de Compras')
  assert.match(cel(otra, `C${b.fProt}`), /'Cobranzas'!\$X\$9:\$X/, 'el total de Cobranzas')
  for (const [ref, f] of formulas(otra)) {
    assert.ok(!/'Compras'!\$[EJCO]\$4/.test(f), `${ref}: quedó una columna de Compras pegada`)
  }
})

test('las fuentes se citan con rango ABIERTO desde su primera fila de datos', () => {
  // Cerrarlo en la última fila conocida deja de ver lo nuevo — sin error. Es el único lugar donde el
  // rango abierto se acepta: el número que decide sale de la fuente, no de una ventana.
  const real = cel(g, `E${bloque('sf-pisos-industriales').fDetalle[0]}`)
  assert.match(real, /\$O\$4:\$O/, 'arranca en la fila de datos y no termina')
  assert.ok(!real.includes(':$O$'), 'y no se cierra en una fila fija')
})

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE NO ES CAJA
// ─────────────────────────────────────────────────────────────────────────────

test('la máquina propia queda FUERA del rango que suma el bloque, y no declara real ni pendiente', () => {
  // Regla del dueño: el equipo propio no es plata que sale. Si su fila entrara al rango de detalle,
  // el pendiente de la obra subiría por un desembolso que no existe.
  const conMaquina = g.bloques.filter((b) => b.fNoCaja)
  assert.equal(conMaquina.length, 4, 'las cuatro obras con máquina propia declarada')
  for (const b of conMaquina) {
    assert.ok(b.fNoCaja > b.fDetalle[1], `${b.clave}: la máquina propia cae dentro del rango sumado (${b.fDetalle})`)
    for (const c of ['D', 'E', 'F', 'G']) {
      assert.ok(vacia(cel(g, `${c}${b.fNoCaja}`)), `${b.clave}: la máquina propia no puede declarar ${c}`)
    }
  }
})

test('la mano de obra no se mide contra Compras y su pendiente es el monto entero', () => {
  // La MO se paga por Jornales. Buscarla en Compras la dejaría siempre en $0 real; y contarla como
  // gasto de Compras sería el doble conteo que el dueño prohibió expresamente.
  for (const b of g.bloques) {
    assert.ok(vacia(cel(g, `E${b.fMO}`)), `${b.clave}: la MO no tiene real en Compras`)
    assert.equal(cel(g, `F${b.fMO}`), `=C${b.fMO}`, `${b.clave}: la MO pendiente va entera`)
    assert.ok(b.fMO === b.fDetalle[1], `${b.clave}: la MO es la última fila del detalle`)
  }
})

test('un egreso sin proveedor no inventa un real: lo dice y deja el pendiente completo', () => {
  const b = bloque('sf-mamposteria')
  const f = b.fDetalle[0]
  assert.ok(vacia(cel(g, `E${f}`)), 'sin proveedor no hay contra qué medir')
  assert.equal(cel(g, `F${f}`), `=MAX(0;C${f})`)
  assert.match(String(cel(g, `I${f}`)), /sin proveedor/, 'y la pestaña lo dice en vez de mostrar un $0 mudo')
})

// ─────────────────────────────────────────────────────────────────────────────
// LA ESTRUCTURA
// ─────────────────────────────────────────────────────────────────────────────

test('la protagonista suma EXACTAMENTE las filas de su detalle', () => {
  // Un off-by-one acá deja un egreso afuera del pendiente: el número más chico y más creíble.
  for (const b of g.bloques) {
    const [f0, f1] = b.fDetalle
    assert.equal(cel(g, `E${b.fProt}`), `=SUM(E${f0}:E${f1})`, `${b.clave}: real`)
    assert.equal(cel(g, `F${b.fProt}`), `=SUM(F${f0}:F${f1})`, `${b.clave}: pendiente`)
    assert.equal(cel(g, `G${b.fProt}`), `=C${b.fProt}-E${b.fProt}-F${b.fProt}`, `${b.clave}: margen`)
  }
})

test('el total de la sección 2 suma las protagonistas, no un rango que se lleva el detalle puesto', () => {
  const esperado = `=${g.bloques.map((b) => b.fProt).join('+')}`
  for (const c of ['C', 'D', 'E', 'F', 'G']) {
    assert.equal(cel(g, `${c}${g.totales[1]}`), esperado.replace(/(\d+)/g, `${c}$1`))
  }
})

test('toda fila mide exactamente ANCHO_OBRAS y las vacías llevan el centinela', () => {
  // Una fila más ancha hace que la API rechace el batch ENTERO. Y una celda vacía SIN centinela es
  // una celda ajena: el generador es dueño de todo su ancho, y sólo limpia lo que declara suyo.
  assert.equal(ANCHOS_OBRAS.length, ANCHO_OBRAS, 'un ancho de píxeles por columna')
  for (const [i, f] of g.filas.entries()) {
    assert.equal(f.length, ANCHO_OBRAS, `fila ${i + 1}`)
    for (const [c, v] of f.entries()) {
      assert.ok(v !== '' && v !== undefined && v !== null, `fila ${i + 1} col ${COLS[c]}: vacía sin centinela`)
    }
  }
})

test('en locale es_AR ninguna fórmula lleva una coma: ahí una coma es un decimal', () => {
  for (const [ref, f] of formulas(g)) assert.ok(!f.includes(','), `${ref}: ${f.slice(0, 80)}`)
})

test('los seis clientes del año salen en la sección 1, en orden y sin repetir', () => {
  const [f0, f1] = g.fClientes
  assert.equal(f1 - f0 + 1, OBRAS_DEL_ANO.length)
  assert.deepEqual(g.filas.slice(f0 - 1, f1).map((f) => f[0]), OBRAS_DEL_ANO)
  assert.equal(new Set(OBRAS_DEL_ANO).size, OBRAS_DEL_ANO.length)
})

test('cada cliente de una obra futura es uno de los clientes del año: la sección 2 no cuelga de nadie', () => {
  for (const o of OBRAS_FUTURAS) assert.ok(OBRAS_DEL_ANO.includes(o.cliente), `${o.clave}: "${o.cliente}" no está en la sección 1`)
})

// ─────────────────────────────────────────────────────────────────────────────
// LA OBRA QUE NO SE PUEDE PROYECTAR
// ─────────────────────────────────────────────────────────────────────────────

test('una obra sin fechas se VE, se marca y no proyecta nada: sin inicio no hay ventana para medir', () => {
  const sinFecha = {
    clave: 'x-sin-fechas', cliente: 'MESSINA', obra: 'SIN FECHAS', ventaTexto: 'Sin Fechas',
    inicio: null, fin: null, pctEjecutado: 0, horas: { oficialEspecializado: 0, oficial: 1, ayudante: 1 },
    moCargasPesos: 1000, egresos: [{ concepto: 'Algo', proveedor: 'FEMENIA', monto: 500 }],
    noCaja: { maquinaPropia: 0 }, notas: null,
  }
  assert.equal(esProyectable(sinFecha), false)
  const otra = grillaObras({ obras: [sinFecha] })
  const b = otra.bloques[0]
  assert.equal(b.proyectable, false)
  assert.match(String(cel(otra, `A${b.fProt}`)), /sin fechas/, 'se marca en el rótulo')
  assert.ok(vacia(cel(otra, `H${b.fProt}`)), 'y no inventa una fecha de inicio')
  const f = b.fDetalle[0]
  assert.ok(vacia(cel(otra, `E${f}`)), 'sin inicio no se puede medir el real contra Compras')
  assert.equal(cel(otra, `F${f}`), `=MAX(0;C${f})`)
})

test('sin obras no se arma media pestaña: la sección 2 no publica un total que no existe', () => {
  const vacio = grillaObras({ obras: [] })
  assert.equal(vacio.bloques.length, 0)
  assert.equal(vacio.totales.length, 1, 'sólo queda el total de la sección 1')
})

// ─────────────────────────────────────────────────────────────────────────────
// LOS NÚMEROS TIPEADOS
// ─────────────────────────────────────────────────────────────────────────────

test('los ÚNICOS números tipeados son los proyectados del dueño, y son los suyos sin retocar', () => {
  const numeros = g.filas.flatMap((f, i) => f.map((v, c) => [`${COLS[c]}${i + 1}`, v]).filter(([, v]) => typeof v === 'number'))
  const montos = numeros.filter(([ref]) => ref.startsWith('C')).map(([, v]) => v)
  const esperados = OBRAS_FUTURAS.flatMap((o) => [
    ...(o.egresos ?? []).map((e) => e.monto), o.moCargasPesos,
    ...(o.noCaja?.maquinaPropia ? [o.noCaja.maquinaPropia] : []),
  ])
  assert.deepEqual(montos, esperados, 'ni escalados ni redondeados: los del PDF del dueño')
  // Lo demás que sea número tiene que ser una fecha (columna H), nunca plata suelta.
  for (const [ref] of numeros) assert.ok(/^[CH]/.test(ref), `${ref}: un número tipeado fuera de C y H`)
})

test('el total proyectado de caja es egresos + MO, y la máquina propia NO está adentro', () => {
  const total = OBRAS_FUTURAS.reduce((s, o) => s + totalEgresos(o), 0)
  const maquinas = OBRAS_FUTURAS.reduce((s, o) => s + (o.noCaja?.maquinaPropia ?? 0), 0)
  assert.equal(total, 145_855_278)
  assert.equal(maquinas, 13_100_982, 'declarada, visible y afuera del total')
})

test('serialISO da el serial que Sheets entiende, no un número parecido', () => {
  assert.equal(serialISO('1899-12-30'), 0, 'el origen del calendario de Sheets')
  assert.equal(serialISO('2026-08-05'), 46239)
  assert.equal(cel(g, `H${bloque('sf-pisos-industriales').fProt}`), serialISO('2026-08-05'))
})
