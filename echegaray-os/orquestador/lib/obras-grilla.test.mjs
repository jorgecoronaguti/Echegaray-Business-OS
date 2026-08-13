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
  grillaObras, serialISO, criterioCliente, variantesDe, anchoColumnaA, pxDeTexto, clientesDeCobranzas,
  celdasEnError, problemaDeSintaxis, ERRORES_SHEET,
  ANCHO_OBRAS, ANCHOS_OBRAS, REFS_OBRAS, CLIENTES_MUESTRA,
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
/** ¿La glosa de esta fila arrastra una nota escrita por el DUEÑO? Su texto no se recorta acá. */
const esDelDueño = (n) => OBRAS_FUTURAS.some((o) => {
  const t = String(g.filas[n - 1]?.[8] ?? '')
  return (o.notas && t.includes(o.notas)) || (o.egresos ?? []).some((e) => e.nota && t.includes(e.nota))
})

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
// EL TOTAL SE CONCILIA CONTRA LA FUENTE
// ─────────────────────────────────────────────────────────────────────────────

test('el ⇒ TOTAL 2026 sale de Cobranzas ENTERA, no de la suma de los clientes listados', () => {
  // Un total que es la suma de las filas de arriba no puede detectar que falta un cliente: da
  // "correcto" por construcción. El residuo se publica con nombre y el total los incluye, así que la
  // pestaña se concilia sola contra su fuente.
  const otros = cel(g, `C${g.fOtros}`)
  assert.match(otros, /^=SUMIFS\([^)]*\)-SUM\(C\d+:C\d+\)$/, 'residuo = todo el archivo − los listados')
  assert.ok(!otros.includes(`'Cobranzas'!$G`), 'el total del archivo no filtra por cliente: una fila sin cliente entra igual')
  // EL TOTAL NO PUEDE SER LA SUMA DE LAS FILAS DE ARRIBA. Con el residuo = "archivo − las filas", el
  // total daba el archivo POR CONSTRUCCIÓN: una identidad que no puede fallar no controla nada. El
  // total sale de la fuente y el control falsificable es el residuo, que SÍ puede dar ≠ 0.
  assert.match(cel(g, `C${g.totales[0]}`), /^=SUMIFS\(/, 'el total sale del archivo, no de las filas')
  assert.ok(!cel(g, `C${g.totales[0]}`).includes('SUM(C'), 'no es la suma de los renglones')
  assert.match(cel(g, `D${g.totales[0]}`), /^=SUMIFS\(/)
})

test('el residuo NO se borra por dar cero: se queda como control y grita si deja de serlo', () => {
  // Con los clientes derivados esta fila vale $0. Borrarla "porque ya no hace falta" es como se
  // pierde la capacidad de detectar el problema: el día que aparezca un cliente que el mecanismo no
  // sepa ubicar, esta fila es lo único que lo dice.
  assert.match(String(cel(g, `A${g.fOtros}`)), /sin ubicar.*\$0/, 'el rótulo dice qué tiene que valer')
  assert.equal(cel(g, `B${g.fOtros}`), `=IF(ROUND(C${g.fOtros}+D${g.fOtros}+E${g.fOtros};2)<>0;"⚠";"✓")`, 'y grita si no es cero')
  assert.equal(g.fOtros, g.fClientes[1] + 1, 'va inmediatamente debajo de los clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
// LOS CLIENTES SE DERIVAN, NO SE TIPEAN
// ─────────────────────────────────────────────────────────────────────────────

test('la lista de clientes sale de Cobranzas: un cliente nuevo aparece solo', () => {
  // EL DEFECTO (13/08, lo cazó el dueño mirando la pestaña): la lista estaba TIPEADA, así que
  // LIRIO DANIEL RAMIRO ($17.303.000), ADDATO ($2.500.000) y MACRO ($135.520) —clientes reales y
  // cobrados— caían en un cajón anónimo. Una lista escrita a mano garantiza que el cuadro quede
  // incompleto cada vez que la empresa factura a alguien nuevo, y que nadie se entere.
  const crudo = [
    ['MESSINA'], ['San Francisco'], ['IMOTOR/San Francisco/JAVI SANCHEZ'], ['MESSINA'],
    ['LIRIO DANIEL RAMIRO'], [''], ['  ADDATO  '], ['UN CLIENTE QUE NADIE DECLARÓ'],
  ]
  assert.deepEqual(clientesDeCobranzas(crudo), [
    'MESSINA', 'San Francisco', 'LIRIO DANIEL RAMIRO', 'ADDATO', 'UN CLIENTE QUE NADIE DECLARÓ',
  ])
})

test('las variantes declaradas COLAPSAN: derivar en crudo reabriría la fila de IMOTOR', () => {
  // Lo que se deriva es QUÉ clientes existen; cómo se agrupan sigue siendo decisión del dueño.
  assert.deepEqual(clientesDeCobranzas([['IMOTOR/San Francisco/JAVI SANCHEZ']]), ['San Francisco'],
    'la variante entra como su canónico, aunque el canónico no haya aparecido todavía')
  assert.deepEqual(clientesDeCobranzas([['San Francisco'], ['IMOTOR/San Francisco/JAVI SANCHEZ']]), ['San Francisco'],
    'y no abre una segunda fila')
  // Sin el mapa, IMOTOR sería un cliente más: eso es exactamente lo que el dueño mandó unificar.
  assert.deepEqual(clientesDeCobranzas([['San Francisco'], ['IMOTOR/San Francisco/JAVI SANCHEZ']], {}),
    ['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ'])
})

test('el cliente se matchea EXACTO: ningún nombre puede llevarse las filas de otro que lo contenga', () => {
  // Al derivar los nombres del archivo, el rótulo ES el texto de Cobranzas y el prefijo deja de ser
  // necesario. Y con prefijo, un futuro "MESSINA SRL" quedaría absorbido por "MESSINA" sin dar error.
  assert.equal(criterioCliente('MESSINA'), 'MESSINA', 'sin comodines')
  const [f0, f1] = g.fClientes
  for (let f = f0; f <= f1; f++) {
    const cli = String(cel(g, `A${f}`))
    assert.ok(cel(g, `C${f}`).includes(`;"${cli}"`), `C${f}: el cliente va exacto`)
    assert.ok(!cel(g, `C${f}`).includes(`"${cli}*"`), `C${f}: sin prefijo`)
  }
  for (const [ref, f] of formulas(g)) {
    assert.ok(!/\$G\$\d+:\$G;"[^"]*\*"/.test(f), `${ref}: quedó un comodín en el criterio de cliente`)
  }
})

test('los clientes derivados se dibujan tal como los escribe el archivo, sin recortes míos', () => {
  const derivados = clientesDeCobranzas(CLIENTES_MUESTRA.map((c) => [c]))
  const otra = grillaObras({ obras: OBRAS_FUTURAS, clientes: derivados })
  const [f0, f1] = otra.fClientes
  assert.deepEqual(otra.filas.slice(f0 - 1, f1).map((f) => f[0]), derivados)
  assert.ok(derivados.includes('LA ESTRELLA /ALIMENTOS DEL SUR SAS'), 'el nombre entero, no "LA ESTRELLA"')
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
    `=MAX(0;C${f}-SUMIFS('Compras'!$M$4:$M;'Compras'!$E$4:$E;"ACA";'Compras'!$J$4:$J;"San Francisco";'Compras'!$C$4:$C;">="&${serialISO('2026-08-05')}))`)
  assert.ok(vacia(cel(g, `E${f}`)), 'la columna E ya no es el real: es la resta a cobrar de la obra')
})

test('las columnas salen de las refs INYECTADAS: ninguna letra queda pegada en la fórmula', () => {
  // El escritor resuelve las columnas contra los encabezados vivos. Si una letra quedara fija, la
  // fórmula sumaría otra columna el día que el archivo se reordene, y sin dar error.
  const refs = {
    cob: { hoja: 'Cobranzas', cliente: 'Z', concepto: 'Y', neto: 'V', total: 'X', estado: 'W', forma: 'U', fechaCobro: 'T', desde: 9 },
    cmp: { hoja: 'Compras', fecha: 'V', proveedor: 'U', cliente: 'T', neto: 'R', total: 'S', desde: 7 },
    mat: REFS_OBRAS.mat,
  }
  const otra = grillaObras({ obras: OBRAS_FUTURAS, refs })
  const b = otra.bloques.find((x) => x.clave === 'sf-pisos-industriales')
  const pend = cel(otra, `F${b.fDetalle[0]}`)
  assert.match(pend, /'Compras'!\$R\$7:\$R/, 'el NETO de Compras ("Importe"), no el total con IVA')
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
  const f = g.fClientes[0] + CLIENTES_MUESTRA.indexOf('San Francisco')
  assert.equal(cel(g, `A${f}`), 'San Francisco')
  const v = cel(g, `C${f}`)
  assert.ok(v.includes('"San Francisco"'), 'el canónico')
  assert.ok(v.includes('"IMOTOR/San Francisco/JAVI SANCHEZ"'), 'y su variante declarada')
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
  assert.match(real, /\$M\$4:\$M/, 'arranca en la fila de datos y no termina')
  assert.ok(!real.includes(':$M$'), 'y no se cierra en una fila fija')
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
  assert.match(String(cel(g, `A${f}`)), /sin proveedor/, 'el rótulo de la fila lo dice: no hay contra qué medir')
})

// ─────────────────────────────────────────────────────────────────────────────
// LA ESTRUCTURA
// ─────────────────────────────────────────────────────────────────────────────

test('NO se publica margen por obra: no es calculable y publicarlo optimista es inventar', () => {
  // Decisión del dueño (13/08) sobre la evidencia: Compras tiene "Cliente / Asignación" y NO tiene
  // columna de obra, así que las 4 obras de San Francisco comparten un costo real que nadie puede
  // repartir. Lo que se publicaba era venta menos costo PROYECTADO, alto y falso donde la proyección
  // está declarada incompleta. Si alguien repone la columna sin resolver el origen, esto se pone rojo.
  for (const b of g.bloques) {
    assert.ok(vacia(cel(g, `G${b.fProt}`)), `${b.clave}: no puede publicar un margen`)
    assert.equal(b.fDetalle[1], b.fMO, `${b.clave}: el costo del detalle llega hasta la MO`)
  }
  const rotulos = g.filas.flatMap((f) => f.filter((v) => typeof v === 'string' && !v.startsWith('=')))
  assert.ok(!rotulos.some((r) => /^Margen/i.test(r.trim())), 'ni el encabezado lo nombra')
  // El porqué queda en el encabezado del módulo, que es donde lo va a leer el que intente
  // reponerla: la pestaña ya no tiene columna de prosa, y ése era justamente el punto.
})

test('REGLA DEL DUEÑO: un cliente de UNA obra tiene la venta de la obra igual a la del cliente', () => {
  // El invariante NO es "la suma de las obras = la venta del cliente" — eso se pondría rojo por
  // MESSINA, que factura trabajos fuera de las 7 obras y su gap de $43.265.118 es legítimo. El que
  // vale es el CONDICIONAL: si el cliente tiene una sola obra declarada, esa obra ES todo el cliente.
  const cuenta = OBRAS_FUTURAS.reduce((m, o) => m.set(o.cliente, (m.get(o.cliente) ?? 0) + 1), new Map())
  const unicos = [...cuenta].filter(([, n]) => n === 1).map(([c]) => c)
  assert.deepEqual(unicos, ['Quattropani - Melisa García SAS'], 'hoy hay exactamente un cliente así')
  for (const cli of unicos) {
    const b = g.bloques.find((x) => OBRAS_FUTURAS.find((o) => o.clave === x.clave).cliente === cli)
    const fCli = g.fClientes[0] + CLIENTES_MUESTRA.indexOf(cli)
    for (const c of ['C', 'D', 'E', 'F']) {
      assert.equal(cel(g, `${c}${b.fProt}`), cel(g, `${c}${fCli}`), `${c}: la obra y el cliente miden lo mismo`)
    }
    assert.ok(!cel(g, `C${b.fProt}`).includes('Salón Comercial'), 'sin filtrar por el texto de la obra')
  }
})

test('un cliente con DOS obras sigue con el match por texto: forzarlo sería inventar', () => {
  // MESSINA tiene Playón y BSA, y además factura otras cosas. Aplicarle la regla del cliente único
  // le metería $43.265.118 de trabajos ajenos adentro de una obra.
  for (const clave of ['messina-playon-azufre', 'messina-bsa']) {
    const b = g.bloques.find((x) => x.clave === clave)
    assert.match(cel(g, `C${b.fProt}`), /'Cobranzas'!\$I\$5:\$I;"\*/, `${clave}: filtra por el concepto`)
    assert.match(cel(g, `C${b.fProt}`), /'Cobranzas'!\$H\$5:\$H;"\*/, `${clave}: y también por la orden de compra`)
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

test('el total de la sección 2 suma las protagonistas, no un rango que se lleva el detalle puesto', () => {
  const esperado = `=${g.bloques.map((b) => b.fProt).join('+')}`
  for (const c of ['C', 'D', 'E', 'F']) {
    assert.equal(cel(g, `${c}${g.totales[1]}`), esperado.replace(/(\d+)/g, `${c}$1`))
  }
  assert.ok(vacia(cel(g, `G${g.totales[1]}`)), 'y el pie tampoco totaliza un margen que no existe')
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

test('ninguna coma SEPARA ARGUMENTOS: en es-AR el separador es `;` y una coma suelta es un decimal', () => {
  // LA DISTINCIÓN ES EL PUNTO, no un detalle del test. Las dos reglas conviven en la misma línea:
  //   · fuera de comillas —la estructura de la fórmula— el separador va en LOCALE: `;`, nunca `,`
  //   · dentro de comillas —un patrón de TEXT()— la notación es US: `#,##0` lleva coma A PROPÓSITO
  // Prohibir la coma en todos lados obligaba a escribir "#.##0", que fue un defecto publicado.
  // Se mira sólo la estructura: los literales se sacan antes de juzgar.
  for (const [ref, f] of formulas(g)) {
    const estructura = f.replace(/"[^"]*"/g, '""')
    assert.ok(!estructura.includes(','), `${ref}: coma separando argumentos → ${estructura.slice(0, 90)}`)
  }
  // La distinción sigue valiendo aunque esta pestaña ya no formatee texto: el patrón US y su trampa
  // viven ahora en `evaluar-formula-sheet.test.mjs`, que es donde se pueden EJERCER.
})

// ─────────────────────────────────────────────────────────────────────────────
// QUE PARSEE — EL DEFECTO QUE SE PUBLICÓ EN EL ARCHIVO DEL DUEÑO
// ─────────────────────────────────────────────────────────────────────────────

test('TODA fórmula parsea: un paréntesis de más se publica como #ERROR! en la cara del dueño', () => {
  // EL DEFECTO REAL (13/08): `Próx. cobro` cerraba un paréntesis de más y las 7 obras salieron con
  // #ERROR! en el archivo. Ningún test lo vio porque todos comparaban el texto que el generador
  // emite contra el texto que el generador espera — las dos puntas del mismo lado. Éste no compara
  // con una expectativa: CUENTA. Es el mismo chequeo que ahora corre el escritor antes de escribir.
  for (const [ref, f] of formulas(g)) {
    assert.equal(problemaDeSintaxis(f), null, `${ref}: ${problemaDeSintaxis(f)} → ${f.slice(0, 110)}`)
  }
})

test('el contador de sintaxis detecta de verdad: si no atrapa el caso real, no sirve de nada', () => {
  // Un verificador que siempre dice "está bien" es peor que ninguno. Se lo prueba con el defecto
  // exacto que se escapó, escrito a mano.
  assert.match(String(problemaDeSintaxis('=IFERROR(1/(1/MIN(MINIFS(A;B;"x"))));"")')), /cierra un paréntesis/)
  assert.equal(problemaDeSintaxis('=IFERROR(1/(1/MIN(MINIFS(A;B;"x")));"")'), null, 'el mismo, ya corregido')
  assert.match(String(problemaDeSintaxis('=SUM(A1:A2')), /sin cerrar/)
  assert.match(String(problemaDeSintaxis('=IF(A="x;1;2)')), /comilla/)
  // Un paréntesis DENTRO de un texto no cuenta: es contenido, no estructura.
  assert.equal(problemaDeSintaxis('=IF(A1="cerró )";1;2)'), null)
})

test('el escáner de errores publicados encuentra los ocho, y no confunde un dato con un error', () => {
  const leido = [['ok', '#ERROR!', 123], ['', '#REF!', '#N/A'], ['#DIV/0! del mes', '#NAME?', null]]
  const malas = celdasEnError(leido)
  assert.deepEqual(malas.map((x) => x.ref), ['B1', 'B2', 'C2', 'B3'])
  assert.equal(celdasEnError([]).length, 0)
  // "#DIV/0! del mes" es texto que CONTIENE un error, no una celda en error: no se cuenta.
  assert.ok(!malas.some((x) => x.ref === 'A3'), 'un texto que menciona un error no es un error')
  for (const e of ERRORES_SHEET) assert.equal(celdasEnError([[e]]).length, 1, `${e} tiene que gritar`)
})

// ─────────────────────────────────────────────────────────────────────────────
// QUE SE PUEDA LEER
// ─────────────────────────────────────────────────────────────────────────────

test('NINGÚN rótulo afirma "c/IVA": las obras en negro no llevan un peso y serían un rótulo falso', () => {
  // Corrección del dueño (13/08): *"si dice N es negro sin iva, si dice B es blanco con iva"*. La
  // categoría es por FILA (col B). Verificado: 0 de las 34 filas N tienen IVA, y las cuatro obras de
  // San Francisco son todas N — salían rotuladas "c/IVA" sin llevar nada. Los números estaban bien;
  // lo falso era lo que la pestaña afirmaba, que es lo que hace desconfiar de todo lo demás.
  const rotulos = g.filas.flatMap((f) => f.filter((v) => typeof v === 'string' && !v.startsWith('=')))
  for (const r of rotulos) assert.ok(!/c\/IVA|con IVA/i.test(r), `rótulo que afirma IVA donde puede no haberlo: "${r}"`)

})

test('el costo se mide NETO contra NETO: el IVA de compras es crédito fiscal, no costo', () => {
  // Cerrar esto era la limitación declarada ayer: con la venta al neto y el costo con IVA, el margen
  // quedaba castigado ~21% en todo lo comprado en blanco. "Importe" (M) es el neto de Compras.
  const neto = new RegExp(`'Compras'!\\$${REFS_OBRAS.cmp.neto}\\$`)
  const conIva = new RegExp(`'Compras'!\\$${REFS_OBRAS.cmp.total}\\$`)
  const conNeteo = g.filas.flatMap((f, i) => (typeof f[5] === 'string' && f[5].includes('Compras') ? [[i + 1, f[5]]] : []))
  assert.ok(conNeteo.length >= 15, `tiene que haber egresos con neteo vivo, hay ${conNeteo.length}`)
  for (const [n, f] of conNeteo) {
    assert.match(f, neto, `F${n}: el costo real se mide en el neto de Compras`)
    assert.ok(!conIva.test(f), `F${n}: el costo NO puede medirse en el total con IVA`)
  }
})

test('la glosa no tapa al dato: el estándar del dueño es muy poco texto', () => {
  // En el PDF del 13/08 había filas donde la glosa ocupaba más que el importe. Las que quedan largas
  // son notas del DUEÑO en obras-datos.mjs — su texto no se recorta acá; lo que se recortó es lo que
  // escribía el generador (el desglose de horas por categoría y las notas que repetían las cuotas).
  const propias = g.filas
    .map((f, i) => [i + 1, f[8] === VACIO ? '' : String(f[8] ?? '')])
    .filter(([n, t]) => t && !t.startsWith('=') && !esDelDueño(n))
  for (const [n, t] of propias) {
    assert.ok(t.length <= 110, `fila ${n}: la glosa del generador mide ${t.length} caracteres — "${t}"`)
  }
})

test('los seis clientes del año salen en la sección 1, en orden y sin repetir', () => {
  const [f0, f1] = g.fClientes
  assert.equal(f1 - f0 + 1, CLIENTES_MUESTRA.length)
  assert.deepEqual(g.filas.slice(f0 - 1, f1).map((f) => f[0]), CLIENTES_MUESTRA)
  assert.equal(new Set(CLIENTES_MUESTRA).size, CLIENTES_MUESTRA.length)
})

test('cada cliente de una obra futura es uno de los clientes del año: la sección 2 no cuelga de nadie', () => {
  for (const o of OBRAS_FUTURAS) assert.ok(CLIENTES_MUESTRA.includes(o.cliente), `${o.clave}: "${o.cliente}" no está en la sección 1`)
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
