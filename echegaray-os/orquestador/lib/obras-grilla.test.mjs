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
import {
  grillaObras, serialISO, anclaCliente, variantesDe, anchoColumnaA, pxDeTexto,
  ANCHO_OBRAS, ANCHOS_OBRAS, REFS_OBRAS, OBRAS_DEL_ANO,
} from './obras-grilla.mjs'
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
// LA VENTA SON TODAS LAS FILAS — EL DEFECTO QUE LLEGÓ AL ARCHIVO REAL
// ─────────────────────────────────────────────────────────────────────────────

test('NINGUNA fórmula descarta filas por decir "Certificación": eso borraba la mitad de la venta', () => {
  // EL DEFECTO, MEDIDO EN EL ARCHIVO VIVO (13/08). Dos versiones de este archivo creyeron que las
  // filas sin "Certificación" eran una "fila madre" que duplicaba al cronograma, y las prefirieron.
  // Son los ANTICIPOS del 50%: su orden de compra dice "Anticipo inicio obra 50% $ 47.590.272" y la
  // certificación dice "Resto 50% s/ total 47.590.272". Descartarlas publicó $624.243.320 de venta
  // 2026 sobre una fuente de $808.994.353, y puso Instalación Eléctrica en margen NEGATIVO con
  // semáforo ⚠ por comparar el costo entero contra media venta.
  for (const [ref, f] of formulas(g)) {
    assert.ok(!/Certificaci/i.test(f), `${ref}: filtra por certificación — anticipo y certificaciones son el MISMO contrato`)
  }
})

test('la venta es una SUMIFS directa, sin el IF que elegía qué filas mirar', () => {
  const objetivo = [...g.fClientes.slice(0, 1), ...g.bloques.map((b) => b.fProt)]
  for (const f of objetivo) {
    const v = cel(g, `C${f}`)
    assert.match(v, /^=SUMIFS\(/, `C${f}: la venta no elige filas, las suma`)
    assert.ok(!v.includes('IF('), `C${f}: sin rama que descarte nada`)
    assert.ok(v.includes('"<>CANCELAR"'), `C${f}: lo único que se excluye es la venta cancelada`)
  }
})

test('venta se define UNA vez: la fila del cliente y la de la obra usan la misma anatomía', () => {
  // Realidad única. Si la Sección 1 y la Sección 2 divergen, el total del año deja de ser comparable
  // con las obras y nadie se entera hasta que los dos números se miran juntos.
  const anatomia = (v) => [/^=SUMIFS\(/.test(v), v.includes('IF('), v.includes('"<>CANCELAR"')]
  const cliente = anatomia(cel(g, `C${g.fClientes[0]}`))
  for (const b of g.bloques) {
    assert.deepEqual(anatomia(cel(g, `C${b.fProt}`)), cliente, `${b.clave}: la venta de la obra no se calcula como la del cliente`)
  }
  assert.deepEqual(cliente, [true, false, true])
})

// ─────────────────────────────────────────────────────────────────────────────
// EL CLIENTE SE ANCLA AL PREFIJO
// ─────────────────────────────────────────────────────────────────────────────

test('el cliente se ancla al PRINCIPIO: "San Francisco" no puede tragarse a "IMOTOR/San Francisco/…"', () => {
  // Medido en el archivo vivo: San Francisco salía $161.183.719 = sus $104.077.336 más los
  // $104.765.646 de IMOTOR… menos lo que el filtro de certificaciones ya había borrado. IMOTOR es
  // otro cliente, con sus 9 filas propias. El comodín va SÓLO al final.
  const [f0, f1] = g.fClientes
  for (let f = f0; f <= f1; f++) {
    const cli = String(cel(g, `A${f}`))
    assert.ok(cel(g, `C${f}`).includes(`"${cli}*"`), `C${f}: el cliente tiene que anclarse al prefijo`)
    assert.ok(!cel(g, `C${f}`).includes(`"*${cli}*"`), `C${f}: buscar el cliente ADENTRO mezcla clientes distintos`)
  }
  for (const b of g.bloques) {
    const v = cel(g, `C${b.fProt}`)
    const o = OBRAS_FUTURAS.find((x) => x.clave === b.clave)
    assert.ok(v.includes(`"${o.cliente}*"`), `${b.clave}: cliente anclado al prefijo`)
    assert.ok(!v.includes(`"*${o.cliente}*"`), `${b.clave}: sin comodín a la izquierda del cliente`)
  }
})

test('el prefijo sigue tomando al cliente escrito con cola: "LA ESTRELLA /ALIMENTOS DEL SUR SAS"', () => {
  // El match no puede ser exacto: el archivo escribe el cliente con una cola. Anclar al prefijo es el
  // punto medio, y es el que resuelve los dos casos reales a la vez.
  assert.equal(anclaCliente('LA ESTRELLA'), 'LA ESTRELLA*')
  const casos = [
    ['LA ESTRELLA', 'LA ESTRELLA /ALIMENTOS DEL SUR SAS', true],
    ['San Francisco', 'San Francisco', true],
    ['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ', false],
    ['MESSINA', 'MESSINA', true],
    ['Quattropani - Melisa García SAS', 'Quattropani - Melisa García SAS', true],
  ]
  for (const [canon, enElArchivo, esperado] of casos) {
    assert.equal(enElArchivo.startsWith(canon), esperado, `"${canon}" vs "${enElArchivo}"`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// EL TOTAL SE CONCILIA CONTRA LA FUENTE
// ─────────────────────────────────────────────────────────────────────────────

test('el ⇒ TOTAL 2026 sale de Cobranzas ENTERA, no de la suma de los clientes listados', () => {
  // Un total que es la suma de las filas de arriba no puede detectar que falta un cliente: da
  // "correcto" por construcción. El residuo se publica con nombre y el total los incluye, así que la
  // pestaña se concilia sola contra su fuente.
  const otros = cel(g, `C${g.fOtros}`)
  assert.match(otros, /^=SUMIFS\([^)]*\)-SUM\(C\d+:C\d+\)$/, 'residuo = todo el archivo − los listados')
  assert.ok(!otros.includes(`'Cobranzas'!$G`), 'el total del archivo no filtra por cliente: una fila sin cliente entra igual')
  assert.equal(cel(g, `C${g.totales[0]}`), `=SUM(C${g.fClientes[0]}:C${g.fOtros})`, 'el total incluye el residuo')
  assert.equal(cel(g, `D${g.totales[0]}`), `=SUM(D${g.fClientes[0]}:D${g.fOtros})`)
})

test('la fila de residuo existe, está rotulada y dice para qué sirve', () => {
  assert.match(String(cel(g, `A${g.fOtros}`)), /Otros clientes/)
  assert.match(String(cel(g, `I${g.fOtros}`)), /falta un cliente en la lista/)
  assert.equal(g.fOtros, g.fClientes[1] + 1, 'va inmediatamente debajo de los clientes')
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

test('el neteo vivo va EMBEBIDO en el pendiente del egreso: la factura real de Compras lo baja sola', () => {
  // La columna del real acumulado dejó su lugar a "Resta cobrar" (el dueño la declaró inútil acá el
  // 13/08). El neteo NO se perdió: vive adentro del pendiente, que es el número que decide cuánto
  // falta desembolsar. Si alguien lo saca, el pendiente deja de reaccionar a Compras.
  const b = bloque('sf-pisos-industriales')
  const f = b.fDetalle[0]
  assert.equal(cel(g, `F${f}`),
    `=MAX(0;C${f}-SUMIFS('Compras'!$O$4:$O;'Compras'!$E$4:$E;"ACA";'Compras'!$J$4:$J;"San Francisco";'Compras'!$C$4:$C;">="&${serialISO('2026-08-05')}))`)
  assert.ok(vacia(cel(g, `E${f}`)), 'la columna E ya no es el real: es la resta a cobrar de la obra')
})

test('las columnas salen de las refs INYECTADAS: ninguna letra queda pegada en la fórmula', () => {
  // El escritor resuelve las columnas contra los encabezados vivos. Si una letra quedara fija, la
  // fórmula sumaría otra columna el día que el archivo se reordene, y sin dar error.
  const refs = {
    cob: { hoja: 'Cobranzas', cliente: 'Z', concepto: 'Y', neto: 'V', total: 'X', estado: 'W', forma: 'U', fechaCobro: 'T', desde: 9 },
    cmp: { hoja: 'Compras', fecha: 'V', proveedor: 'U', cliente: 'T', total: 'S', desde: 7 },
    mat: REFS_OBRAS.mat,
  }
  const otra = grillaObras({ obras: OBRAS_FUTURAS, refs })
  const b = otra.bloques.find((x) => x.clave === 'sf-pisos-industriales')
  const pend = cel(otra, `F${b.fDetalle[0]}`)
  assert.match(pend, /'Compras'!\$S\$7:\$S/, 'el total de Compras')
  assert.match(pend, /'Compras'!\$T\$7:\$T;"San Francisco"/, 'el cliente de Compras')
  assert.match(cel(otra, `C${b.fProt}`), /'Cobranzas'!\$V\$9:\$V/, 'la venta sale del NETO de Cobranzas')
  assert.match(cel(otra, `D${b.fProt}`), /'Cobranzas'!\$X\$9:\$X/, 'el cobrado sale del TOTAL de Cobranzas')
  for (const [ref, f] of formulas(otra)) {
    assert.ok(!/'Compras'!\$[EJCO]\$4/.test(f), `${ref}: quedó una columna de Compras pegada`)
    assert.ok(!/'Cobranzas'!\$[GIJMNOQ]\$5/.test(f), `${ref}: quedó una columna de Cobranzas pegada`)
  }
})

test('la VENTA sale del neto y el COBRADO del total: no se mezclan en la misma columna', () => {
  // El IVA se cobra y se rinde: no es venta. Pero SÍ es plata que entra, así que el cobrado y la
  // resta van con IVA. Mezclarlos infló Playón a $116.150.000 sobre un contrato de $102.500.000.
  const neto = new RegExp(`'Cobranzas'!\\$${REFS_OBRAS.cob.neto}\\$`)
  const total = new RegExp(`'Cobranzas'!\\$${REFS_OBRAS.cob.total}\\$`)
  const objetivo = [g.fClientes[0], ...g.bloques.map((b) => b.fProt)]
  for (const f of objetivo) {
    assert.match(cel(g, `C${f}`), neto, `C${f}: la venta se mide en el neto`)
    assert.ok(!total.test(cel(g, `C${f}`)), `C${f}: la venta NO puede tocar el total con IVA`)
    for (const c of ['D', 'E']) {
      assert.match(cel(g, `${c}${f}`), total, `${c}${f}: la plata que entra se mide con IVA`)
      assert.ok(!neto.test(cel(g, `${c}${f}`)), `${c}${f}: no se mide en el neto`)
    }
  }
})

test('IMOTOR es San Francisco: la decisión del dueño vive en un mapa, no en un comodín más ancho', () => {
  // 13/08, textual del dueño: "si es san francisco, imotor". Aflojar el match para que entrara este
  // caso habría vuelto a mezclar los clientes que acabábamos de separar.
  assert.deepEqual(variantesDe('San Francisco'), ['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ'])
  assert.deepEqual(variantesDe('MESSINA'), ['MESSINA'], 'un cliente sin alias no inventa variantes')
  const f = g.fClientes[0] + OBRAS_DEL_ANO.indexOf('San Francisco')
  assert.equal(cel(g, `A${f}`), 'San Francisco')
  const v = cel(g, `C${f}`)
  assert.ok(v.includes('"San Francisco*"'), 'el canónico')
  assert.ok(v.includes('"IMOTOR/San Francisco/JAVI SANCHEZ*"'), 'y su variante declarada')
  assert.equal(v.split('SUMIFS(').length - 1, 2, 'un SUMIFS por variante: SUMIFS no sabe hacer OR')
  // Ningún OTRO cliente puede arrastrar a IMOTOR.
  for (let x = g.fClientes[0]; x <= g.fClientes[1]; x++) {
    if (x === f) continue
    assert.ok(!cel(g, `C${x}`).includes('IMOTOR'), `C${x}: IMOTOR es de San Francisco y de nadie más`)
  }
})

test('las fuentes se citan con rango ABIERTO desde su primera fila de datos', () => {
  // Cerrarlo en la última fila conocida deja de ver lo nuevo — sin error. Es el único lugar donde el
  // rango abierto se acepta: el número que decide sale de la fuente, no de una ventana.
  const real = cel(g, `F${bloque('sf-pisos-industriales').fDetalle[0]}`)
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

test('el margen resta EXACTAMENTE el costo proyectado de la obra: ni una fila de más ni de menos', () => {
  // Un off-by-one acá deja un egreso afuera del costo y el margen sale más lindo de lo que es. El
  // rango llega hasta la MO inclusive y NO alcanza a la máquina propia, que no es plata que sale.
  for (const b of g.bloques) {
    const [f0, f1] = b.fDetalle
    assert.equal(cel(g, `G${b.fProt}`), `=C${b.fProt}-SUM(C${f0}:C${f1})`, `${b.clave}: margen`)
    assert.equal(f1, b.fMO, `${b.clave}: el costo llega hasta la MO`)
    if (b.fNoCaja) assert.ok(b.fNoCaja > f1, `${b.clave}: la máquina propia queda afuera del margen`)
  }
})

test('el semáforo mira lo VENCIDO, no el margen: es lo único que exige llamar a alguien hoy', () => {
  for (const b of g.bloques) {
    assert.equal(cel(g, `B${b.fProt}`), `=IF(F${b.fProt}>0;"⚠";"✓")`, `${b.clave}`)
    assert.match(cel(g, `F${b.fProt}`), /TODAY\(\)/, `${b.clave}: vencido = fecha de cobro pasada y sin cobrar`)
  }
})

test('lo que RESTA COBRAR sale del estado, no de una columna de saldo', () => {
  // La col "TOTAL a cobrar" NO es un saldo: las 46 filas en estado Cobrado suman $451.507.276 ahí.
  // Leerla como saldo daría el contrato entero como pendiente.
  for (const f of [g.fClientes[0], ...g.bloques.map((b) => b.fProt)]) {
    const e = cel(g, `E${f}`)
    assert.match(e, /"<>CANCELAR"/, `E${f}: parte de todo lo vivo`)
    assert.match(e, /-\(SUMIFS/, `E${f}: y le resta lo cobrado`)
    assert.match(e, /"Cobrado"/, `E${f}`)
  }
})

test('cada obra publica su próxima fecha de cobro y el detalle de lo pendiente en UNA celda', () => {
  // El dueño pidió saber a quién reclamarle y por cuánto. El detalle va por TEXTJOIN sobre un
  // ARRAYFORMULA: devuelve UNA celda y por eso NO derrama sobre las columnas del generador.
  for (const b of g.bloques) {
    assert.match(cel(g, `H${b.fProt}`), /^=IFERROR\(1\/\(1\/MIN\(MINIFS\(/, `${b.clave}: próxima fecha de cobro`)
    const det = cel(g, `I${b.fProt}`)
    assert.match(det, /^=IFERROR\(TEXTJOIN\(/, `${b.clave}: el detalle por obra`)
    assert.match(det, /ARRAYFORMULA/, `${b.clave}`)
    assert.ok(!det.includes('QUERY('), `${b.clave}: nada que derrame filas sobre la grilla`)
    for (const campo of ['fechaCobro', 'total', 'forma']) {
      assert.ok(det.includes(`$${REFS_OBRAS.cob[campo]}$`), `${b.clave}: el detalle muestra ${campo}`)
    }
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
  const f = b.fDetalle[0]
  assert.ok(vacia(cel(otra, `E${f}`)), 'el detalle no publica resta a cobrar')
  assert.equal(cel(otra, `F${f}`), `=MAX(0;C${f})`, 'sin inicio no hay ventana para netear contra Compras')
  assert.ok(!cel(otra, `F${f}`).includes('Compras'), 'y no se inventa una ventana')
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
  assert.equal(cel(g, `H${bloque('sf-pisos-industriales').fDetalle[0]}`), serialISO('2026-08-10'), 'la fecha del egreso')
})

// ─────────────────────────────────────────────────────────────────────────────
// EL ANCHO DE LA COLUMNA A — EL DEFECTO QUE NINGÚN TEST MIRABA
// ─────────────────────────────────────────────────────────────────────────────

test('ningún rótulo excede el ancho declarado de la columna A: con CLIP, lo que no entra DESAPARECE', () => {
  // EL DEFECTO, VISTO EN EL PDF DEL 13/08: con 300px fijos, "OBRAS — EL AÑO ENTERO, OBRA POR OBRA"
  // se leía "…OBRA P" y "2.7 · Quattropani - Melisa García SAS — SALÓN" perdía "COMERCIAL". El
  // estilo de la casa pone wrapStrategy CLIP en toda la hoja: un rótulo más largo que su columna no
  // se derrama sobre la vecina, se corta. Ningún test unitario lo miraba — éste sí.
  const ancho = anchoColumnaA(g)
  const grandes = new Set([...g.protagonistas, ...g.totales])
  g.filas.forEach((fila, i) => {
    const t = fila[0] === VACIO ? '' : String(fila[0] ?? '')
    const n = i + 1
    if (!t || n === 2) return // la 2 es el subtítulo: va con WRAP y no ensancha nada
    const estilo = n === 1 ? { tam: 13, bold: true }
      : (grandes.has(n) || /^\d · /.test(t) || /^⇒/.test(t)) ? { tam: 10, bold: true }
        : { tam: 9, bold: false }
    assert.ok(pxDeTexto(t, estilo) <= ancho, `fila ${n}: "${t}" necesita ${pxDeTexto(t, estilo)}px y la columna mide ${ancho}px`)
  })
})

test('el ancho SALE de los datos: una obra con nombre más largo ensancha la columna sola', () => {
  const ancho = anchoColumnaA(g)
  const larga = grillaObras({
    obras: [{ ...OBRAS_FUTURAS[0], obra: 'UNA OBRA CON UN NOMBRE DELIBERADAMENTE LARguísimo PARA PROBAR EL ANCHO' }],
  })
  assert.ok(anchoColumnaA(larga) > ancho, 'si el rótulo crece, la columna crece')
  assert.equal(anchoColumnaA({ filas: [] }), 300, 'y nunca baja del mínimo de la casa')
})

test('el subtítulo NO ensancha la columna: va con WRAP, no clipeado', () => {
  const conSubtituloLargo = { ...g, filas: g.filas.map((f, i) => (i === 1 ? [`${'x'.repeat(400)}`, ...f.slice(1)] : f)) }
  assert.equal(anchoColumnaA(conSubtituloLargo), anchoColumnaA(g))
})
