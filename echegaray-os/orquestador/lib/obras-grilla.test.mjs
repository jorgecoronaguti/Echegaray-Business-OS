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
  celdasEnError, problemaDeSintaxis, ERRORES_SHEET, nombreEnCostos, ANO, trabajosFueraDeObra,
  ANCHO_OBRAS, ANCHOS_OBRAS, ANCHO_HISTORICO, ALTO_HISTORICO, conColaLimpiable, REFS_OBRAS, CLIENTES_MUESTRA,
  rotuloDeObra, SIN_CONTRATO, SECCION_OBRAS, SECCION_COSTO,
} from './obras-grilla.mjs'
import { OBRAS_FUTURAS, CLIENTES_CANONICOS, esProyectable, totalEgresos } from './obras-datos.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { ALERTA, glifosInvisibles } from './glifos.mjs'

const COLS = 'ABCDEFGHI'
const g = grillaObras({ obras: OBRAS_FUTURAS })

/** El contenido de una celda por su referencia A1 ("C16"), como se lee en el Sheet. */
const cel = (grid, ref) => {
  const [, col, fila] = ref.match(/^([A-I])(\d+)$/)
  return grid.filas[Number(fila) - 1][COLS.indexOf(col)]
}
/** Las filas 1-based de `a` a `b`, inclusive — para recorrer un rango que la grilla devuelve. */
const rangoFilas = (a, b) => [...Array(b - a + 1)].map((_, i) => a + i)
/** Todas las fórmulas de la grilla, con su referencia A1 — el material de casi todos los tests. */
const formulas = (grid) => grid.filas.flatMap((f, i) => f
  .map((v, c) => [`${COLS[c]}${i + 1}`, v])
  .filter(([, v]) => typeof v === 'string' && v.startsWith('=')))
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
  assert.ok(!cel(g, `C${g.fTotClientes}`).includes(`'Cobranzas'!$G`), 'el total no filtra por cliente: una fila sin cliente entra igual')
  // EL TOTAL NO PUEDE SER LA SUMA DE LAS FILAS DE ARRIBA. Con el residuo = "archivo − las filas", el
  // total daba el archivo POR CONSTRUCCIÓN: una identidad que no puede fallar no controla nada. El
  // total sale de la fuente y el control falsificable es el residuo, que SÍ puede dar ≠ 0.
  assert.match(cel(g, `C${g.fTotClientes}`), /^=SUMIFS\(/, 'el total sale del archivo, no de las filas')
  assert.ok(!cel(g, `C${g.fTotClientes}`).includes('SUM(C'), 'no es la suma de los renglones')
  assert.match(cel(g, `D${g.fTotClientes}`), /^=SUMIFS\(/)
})

test('el COSTO de la Sección 1 se mide al NETO desde la fuente, no heredando el criterio de otra pestaña', () => {
  // EL DEFECTO (13/08): esta columna leía `TOTAL POR OBRA` de la pestaña Materiales, que la arma con
  // "Total" (O, CON IVA). Publicaba $251.440.609 al lado de "Venta (neto)" donde el criterio que esta
  // misma pestaña declara y testea da $165.196.937: $86.243.672 de más. El test que exigía el neto
  // sólo miraba la columna del detalle — la que el dueño lee no la cubría nadie.
  //
  // Y LA REGLA NO ES "M o O": "Importe" (M) está vacía en 185 de 829 filas —obligaciones sin IVA,
  // ninguna con IVA cargado— donde el importe se tipea en "Total". Es: M si está, si no O − N.
  const [f0, f1] = g.fClientes
  for (let f = f0; f <= f1; f++) {
    const cel_ = cel(g, `G${f}`)
    assert.ok(!cel_.includes('Materiales'), `G${f}: no hereda el criterio de otra pestaña`)
    assert.match(cel_, new RegExp(`^=SUMIFS\\('Compras'!\\$${REFS_OBRAS.cmp.neto}\\$`), `G${f}: arranca por el neto`)
    // Y SÓLO MATERIALES: filtra por "Familia de material" no vacía. Sin ese filtro la columna medía
    // el costo entero del cliente, que es un cambio que el dueño no pidió.
    assert.ok(cel_.includes(`'Compras'!$${REFS_OBRAS.cmp.familia}$`), `G${f}: filtra por familia de material`)
    // la cola de la regla: lo que no tiene Importe entra por Total − IVA
    assert.ok(cel_.includes(`+SUMIFS('Compras'!$${REFS_OBRAS.cmp.total}$`), `G${f}: suma el Total de las filas sin Importe`)
    assert.ok(cel_.includes(`'Compras'!$${REFS_OBRAS.cmp.neto}$4:$${REFS_OBRAS.cmp.neto};""`), `G${f}: acotado a las que no tienen Importe`)
    assert.match(cel_, new RegExp(`-SUMIFS\\('Compras'!\\$${REFS_OBRAS.cmp.iva}\\$`), `G${f}: y les resta su IVA`)
    // el cliente se busca con el nombre que usa Compras, no con el rótulo derivado de Cobranzas
    assert.ok(cel_.includes(`"${nombreEnCostos(String(cel(g, `A${f}`)))}"`), `G${f}: nombre de Compras`)
  }
  assert.equal(nombreEnCostos('LA ESTRELLA /ALIMENTOS DEL SUR SAS'), 'LA ESTRELLA')
})

// ─────────────────────────────────────────────────────────────────────────────
// RETENIDO — LA COLUMNA QUE ENTRÓ POR EL MODELO DEL DUEÑO
// ─────────────────────────────────────────────────────────────────────────────

test('el RETENIDO sale de la columna de retenciones, sólo de lo COBRADO y por fecha de COBRO', () => {
  // QUÉ MIDE: los $7.671.680 que los clientes retuvieron en 2026 y depositaron a nombre de la
  // empresa. Es la traducción de las tres columnas de retención del modelo (Ganancias · IIBB · LH).
  //
  // LOS TRES DEFECTOS QUE ESTE TEST ATRAPA, Y NINGUNO DA ERROR EN SHEETS:
  //  · leer otra columna — el archivo tiene además tres de DESGLOSE que empiezan con "Retención";
  //    citar una daría una parte del total, con formato de dato correcto;
  //  · no filtrar por Cobrado — publicaría como sufrida una retención tipeada sobre una fila
  //    pendiente, que es una estimación presentada como hecho;
  //  · acotar por fecha de VENTA — mezclaría devengado y percibido en la misma columna.
  const desde = serialISO(`${ANO}-01-01`)
  for (const f of [...rangoFilas(...g.fClientes), g.fTotClientes]) {
    const v = cel(g, `H${f}`)
    assert.match(v, new RegExp(`^=SUMIFS\\('Cobranzas'!\\$${REFS_OBRAS.cob.retenciones}\\$`), `H${f}: suma la col de retenciones`)
    assert.ok(v.includes(`;"${'Cobrado'}"`), `H${f}: sólo lo efectivamente cobrado`)
    assert.ok(v.includes(`'Cobranzas'!$${REFS_OBRAS.cob.fechaCobro}$`), `H${f}: ventana por fecha de COBRO`)
    assert.ok(!v.includes(`'Cobranzas'!$${REFS_OBRAS.cob.fechaVenta}$`), `H${f}: NUNCA por fecha de venta`)
    assert.ok(v.includes(`">="&${desde}`), `H${f}: dentro del año`)
  }
  // El total del año sale de la FUENTE ENTERA, no de la suma de los clientes listados: si un cliente
  // quedara fuera de la lista derivada, su retención tiene que seguir estando en el total.
  assert.ok(!cel(g, `H${g.fTotClientes}`).includes(`'Cobranzas'!$${REFS_OBRAS.cob.cliente}$`), 'el total no filtra por cliente')
  assert.ok(!cel(g, `H${g.fTotClientes}`).includes('SUM(H'), 'ni es la suma de los renglones')
})

test('la H lleva IMPORTE en los dos cuadros que la usan, y el escritor lo sabe fila por fila', () => {
  // La H es `Retenido` por cliente y `Falta certificar` por obra: plata en los dos casos. Pero la
  // columna no se puede declarar plata de arriba a abajo, porque el resto de las filas la deja
  // vacía. `importeEnH` es la lista que el escritor usa; si quedara corta, $7.671.680 se publicarían
  // con el formato de la celda de al lado y nadie daría un error.
  assert.deepEqual(g.importeEnH,
    [...rangoFilas(...g.fClientes), g.fTotClientes, ...g.bloques.map((b) => b.fProt), g.fTotObras])
  for (const f of [...rangoFilas(...g.fClientes), g.fTotClientes]) {
    assert.match(String(cel(g, `H${f}`)), /^=SUMIFS\(/, `H${f}: el retenido del cliente`)
  }
  // Las filas del cuadro de COSTO no llevan nada en la H: su cuadro termina en la E.
  for (const f of g.filasCosto) assert.ok(!g.importeEnH.includes(f), `${f}: el cuadro de costo no usa la H`)
})

test('el ⇒ TOTAL 2026 tiene la ventana que su rótulo promete', () => {
  // EL DEFECTO (13/08): ninguna fórmula acotaba el año. El total era TODA la pestaña Cobranzas e
  // incluía una venta del 15/12/2025 ($15.000.000, IMOTOR); la primera fila de 2027 lo iba a empeorar
  // sin un solo error. Un rótulo que afirma un filtro que no existe es una mentira con formato de dato.
  const desde = serialISO(`${ANO}-01-01`)
  const hasta = serialISO(`${ANO}-12-31`)
  const [f0, f1] = g.fClientes
  for (const f of [...Array(f1 - f0 + 1)].map((_, i) => f0 + i).concat(g.bloques.map((b) => b.fProt), g.fTotClientes)) {
    // La VENTA se acota por la fecha de venta (devengado)…
    const venta = cel(g, `C${f}`)
    assert.ok(venta.includes(`$${REFS_OBRAS.cob.fechaVenta}$`), `C${f}: la venta se acota por su fecha de VENTA`)
    assert.ok(venta.includes(`">="&${desde}`) && venta.includes(`"<="&${hasta}`), `C${f}: dentro del año`)
    // …y lo que mide plata que entra, por la de cobro (percibido). La misma fila lo exige: vendida
    // el 15/12/2025 y cobrada el 15/01/2026 — una sola ventana rompería una de las dos.
    for (const c of ['D', 'E']) {
      const v = cel(g, `${c}${f}`)
      assert.ok(v.includes(`$${REFS_OBRAS.cob.fechaCobro}$`), `${c}${f}: se acota por la fecha de COBRO`)
      assert.ok(v.includes(`">="&${desde}`), `${c}${f}: dentro del año`)
    }
  }
})

test('la fila "sin ubicar" NO está en la pestaña: el dueño la sacó dos veces', () => {
  // *"la fila 'otros clientes' no puede ser, estan todos los clientes y obras declarados"*. Un
  // renglón que dice $0 todos los días no es información. La CAPACIDAD de detectar el problema no se
  // perdió: el escritor compara la suma de los clientes contra el total de la fuente y ABORTA SIN
  // PUBLICAR si difieren — un generador que no escribe controla más que una fila que nadie quiere ver.
  const rotulos = g.filas.map((f) => String(f[0] ?? ''))
  assert.ok(!rotulos.some((r) => /sin ubicar|Otros clientes/i.test(r)), 'no puede haber fila de residuo')
  assert.equal(g.fOtros, undefined, 'ni la grilla la expone')
  // Y el total sigue saliendo de la fuente, que es lo que hace posible el control de afuera.
  assert.match(cel(g, `C${g.fTotClientes}`), /^=SUMIFS\(/)
  assert.equal(g.fTotClientes, g.fClientes[1] + 1, 'el total va inmediatamente debajo de los clientes')
})

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
  assert.ok(usados.length > 0, 'tiene que haber fórmulas contra Compras que mirar')
  // Los de las obras son los canónicos; los de la Sección 1 son los clientes derivados ya traducidos
  // al nombre que usa Compras. Ninguno puede ser un nombre que Compras no conozca.
  const validos = new Set([...CLIENTES_CANONICOS, ...CLIENTES_MUESTRA.map(nombreEnCostos)])
  for (const c of usados) assert.ok(validos.has(c), `"${c}" no es un nombre que Compras use`)
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

test('el neteo contra Compras SOBREVIVIÓ a la salida del detalle: vive en la columna "Pagado"', () => {
  // Al sacar las 40 filas de detalle (pedido del dueño, 14/08) el riesgo real era perder con ellas el
  // neteo vivo: la propiedad de que cuando entra la factura a Compras, lo que falta pagar BAJA SOLO.
  // No se perdió — se condensó en una celda por obra. Si alguien la reemplaza por el monto tipeado,
  // esto se pone rojo y la pestaña vuelve a ser una foto congelada del 07/08.
  const c = g.filasCosto[0] // 4.1 = San Francisco PISOS INDUSTRIALES
  const pagado = cel(g, `D${c}`)
  const real = (prov) => `SUMIFS('Compras'!$M$4:$M;'Compras'!$E$4:$E;"${prov}";'Compras'!$J$4:$J;"San Francisco"`
    + `;'Compras'!$C$4:$C;">="&${serialISO('2026-08-05')})`
  assert.equal(pagado, `=MIN(377740;${real('ACA')})+MIN(977760;${real('VILLA DEL PINO')})`)
  // Y lo que falta pagar sale de las dos celdas de SU fila, no de un número tipeado aparte.
  assert.equal(cel(g, `E${c}`), `=C${c}-D${c}`)
})

test('las columnas salen de las refs INYECTADAS: ninguna letra queda pegada en la fórmula', () => {
  // El escritor resuelve las columnas contra los encabezados vivos. Si una letra quedara fija, la
  // fórmula sumaría otra columna el día que el archivo se reordene, y sin dar error.
  const refs = {
    cob: { hoja: 'Cobranzas', cliente: 'Z', concepto: 'Y', neto: 'V', total: 'X', retenciones: 'AB', estado: 'W', oc: 'S', fechaCobro: 'T', fechaVenta: 'N', fechaEmision: 'L', forma: 'M', categoria: 'R', moneda: 'AC', desde: 9 },
    cmp: { hoja: 'Compras', fecha: 'V', proveedor: 'U', cliente: 'T', neto: 'R', iva: 'Q', total: 'S', familia: 'P', desde: 7 },
    mat: REFS_OBRAS.mat,
  }
  const otra = grillaObras({ obras: OBRAS_FUTURAS, refs })
  const b = otra.bloques.find((x) => x.clave === 'sf-pisos-industriales')
  const pagado = cel(otra, `D${otra.filasCosto[0]}`)
  assert.match(pagado, /'Compras'!\$R\$7:\$R/, 'el NETO de Compras ("Importe"), no el total con IVA')
  assert.match(pagado, /'Compras'!\$T\$7:\$T;"San Francisco"/, 'el cliente de Compras')
  assert.match(pagado, /'Compras'!\$V\$7:\$V/, 'la fecha de factura de Compras')
  assert.match(cel(otra, `C${b.fProt}`), /'Cobranzas'!\$V\$9:\$V/, 'la venta sale del NETO de Cobranzas')
  assert.match(cel(otra, `G${otra.fClientes[0]}`), /'Compras'!\$R\$7:\$R/, 'el costo, del neto de Compras')
  assert.match(cel(otra, `D${b.fProt}`), /'Cobranzas'!\$X\$9:\$X/, 'el cobrado sale del TOTAL de Cobranzas')
  assert.match(cel(otra, `H${otra.fClientes[0]}`), /'Cobranzas'!\$AB\$9:\$AB/, 'el retenido, de la col de retenciones')
  // LA MONEDA TAMBIÉN SE INYECTA. Es la columna más nueva y la que decide si un importe se valúa: si
  // quedara pegada en la AA, el día que Cobranzas sume una columna la fórmula miraría otra cosa y los
  // dólares volverían a sumarse como pesos — sin dar error, que es como pasó la primera vez.
  assert.match(cel(otra, `C${b.fProt}`), /'Cobranzas'!\$AC\$9:\$AC;"USD"/, 'la moneda sale de las refs inyectadas')
  // LA FECHA DE EMISIÓN ES EL RELOJ DE LO VENCIDO y entró el 14/08: si quedara pegada en la C, el
  // día que Cobranzas mueva una columna la alarma mediría otra cosa — que es el defecto que se acaba
  // de arreglar, con otro origen.
  assert.match(cel(otra, `F${b.fProt}`), /'Cobranzas'!\$L\$9:\$L;"<"&\(TODAY\(\)-30\)/, 'la emisión sale de las refs')
  for (const [ref, f] of formulas(otra)) {
    assert.ok(!/'Compras'!\$[EJCO]\$4/.test(f), `${ref}: quedó una columna de Compras pegada`)
    assert.ok(!/'Cobranzas'!\$[GIJLMNOQ]\$5/.test(f), `${ref}: quedó una columna de Cobranzas pegada`)
    assert.ok(!/'Cobranzas'!\$AA\$5/.test(f), `${ref}: quedó la columna de MONEDA pegada`)
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
  // TRES SUMIFS POR VARIANTE, y las dos razones son distintas: uno POR VARIANTE porque SUMIFS no sabe
  // hacer OR, y tres POR VARIANTE porque cada suma vale "todo − los dólares mal contados + los
  // dólares valuados" (ver `sumaConUSD`). Dos variantes × tres términos = seis.
  assert.equal(v.split('SUMIFS(').length - 1, 6, 'un SUMIFS por variante (SUMIFS no hace OR) × tres términos de moneda')
  // Ningún OTRO cliente puede arrastrar a IMOTOR.
  for (let x = g.fClientes[0]; x <= g.fClientes[1]; x++) {
    if (x === f) continue
    assert.ok(!cel(g, `C${x}`).includes('IMOTOR'), `C${x}: IMOTOR es de San Francisco y de nadie más`)
  }
})

test('una columna sin resolver NO construye la grilla: el `undefined` ya se publicó una vez', () => {
  // EL DEFECTO, EN EL ARCHIVO DEL DUEÑO (13/08): la grilla empezó a usar la Orden de Compra y el
  // escritor nunca agregó ese rótulo, así que `refs.cob.oc` llegaba undefined y la fórmula salía
  // `'Cobranzas'!$undefined$5:$undefined`. Parsea perfecto — sólo revienta cuando Sheets busca la
  // columna. Fueron 40 celdas con #ERROR!. La guarda vive en `abierto`, por donde pasa TODA
  // referencia: así el desajuste entre lo que la grilla usa y lo que el escritor resuelve es imposible.
  const sinOc = { ...REFS_OBRAS, cob: { ...REFS_OBRAS.cob, oc: undefined } }
  assert.throws(() => grillaObras({ obras: OBRAS_FUTURAS, refs: sinOc }), /la columna "oc" .* no está resuelta/)
  const sinHoja = { ...REFS_OBRAS, cmp: { ...REFS_OBRAS.cmp, hoja: undefined } }
  assert.throws(() => grillaObras({ obras: OBRAS_FUTURAS, refs: sinHoja }), /no está resuelta/)
})

test('ninguna fórmula lleva una variable rota interpolada: undefined, null, NaN o $$', () => {
  // El chequeo es barato y ataca toda la familia: cualquier `${x}` vacío deja su firma en el texto.
  for (const [ref, f] of formulas(g)) {
    assert.ok(!/undefined|null|NaN|\$\$/.test(f), `${ref}: ${f.slice(0, 100)}`)
    assert.equal(problemaDeSintaxis(f), null, ref)
  }
  assert.match(String(problemaDeSintaxis("=SUMIFS('Cobranzas'!$undefined$5:$undefined;A1;1)")), /interpoló "undefined"/)
  assert.match(String(problemaDeSintaxis('=SUM($$5:$$9)')), /interpoló/)
  assert.equal(problemaDeSintaxis('=SUM(A1:A9)'), null, 'y no marca una fórmula sana')
})

test('las fuentes se citan con rango ABIERTO desde su primera fila de datos', () => {
  // Cerrarlo en la última fila conocida deja de ver lo nuevo — sin error. Es el único lugar donde el
  // rango abierto se acepta: el número que decide sale de la fuente, no de una ventana.
  const real = cel(g, `D${g.filasCosto[0]}`)
  assert.match(real, /\$M\$4:\$M/, 'arranca en la fila de datos y no termina')
  assert.ok(!real.includes(':$M$'), 'y no se cierra en una fila fija')
})

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE NO ES CAJA
// ─────────────────────────────────────────────────────────────────────────────

test('la máquina propia NO entra al costo proyectado: es equipo propio, no plata que sale', () => {
  // Regla del dueño. Antes se veía porque su fila quedaba fuera del rango sumado; ahora el cuadro no
  // tiene filas, así que la prueba es sobre el número: los $13.100.982 de las cuatro obras con
  // máquina declarada no pueden estar adentro de ninguna celda de `Costo proyectado`.
  const proyectados = g.filasCosto.map((f) => cel(g, `C${f}`))
  assert.deepEqual(proyectados, OBRAS_FUTURAS.map((o) => totalEgresos(o)))
  for (const [i, o] of OBRAS_FUTURAS.entries()) {
    const conMaquina = totalEgresos(o) + (o.noCaja?.maquinaPropia ?? 0)
    if (!o.noCaja?.maquinaPropia) continue
    assert.notEqual(proyectados[i], conMaquina, `${o.clave}: la máquina propia entró al costo`)
  }
})

test('la mano de obra no se mide contra Compras: buscarla ahí la dejaría siempre en cero', () => {
  // La MO se paga por Jornales. Está DENTRO del costo proyectado (es plata que sale) pero FUERA de
  // lo pagado que mide esta pestaña, y por eso queda entera del lado de lo que falta. Si alguien la
  // metiera en el neteo contra Compras, el "pagado" no cambiaría y el "falta" bajaría por nada.
  for (const [i, o] of OBRAS_FUTURAS.entries()) {
    const pagado = String(cel(g, `D${g.filasCosto[i]}`))
    assert.ok(!/Jornales|Mano de obra/i.test(pagado), `${o.clave}: la MO no se busca en Compras`)
    const sumandos = pagado.startsWith('=0') ? 0 : pagado.split('+MIN(').length
    const conProveedor = (o.egresos ?? []).filter((e) => e.proveedor).length
    assert.equal(sumandos, conProveedor, `${o.clave}: un sumando por egreso CON proveedor, ni uno más`)
  }
})

test('un egreso sin proveedor no inventa un real: no suma a lo pagado y queda del lado del falta', () => {
  // MAMPOSTERÍA tiene "Materiales sin itemizar" sin proveedor declarado. No hay contra qué medirlo en
  // Compras, así que no puede aparecer en `Pagado` — inventarle un real bajaría lo que falta pagar.
  const i = OBRAS_FUTURAS.findIndex((o) => o.clave === 'sf-mamposteria')
  const o = OBRAS_FUTURAS[i]
  const sinProv = (o.egresos ?? []).filter((e) => !e.proveedor)
  assert.ok(sinProv.length >= 1, 'la obra de prueba tiene que tener un egreso sin proveedor')
  const pagado = String(cel(g, `D${g.filasCosto[i]}`))
  for (const e of sinProv) assert.ok(!pagado.includes(String(e.monto)), `${e.concepto}: no puede sumar a lo pagado`)
  // Pero SÍ está en el costo proyectado: es plata que va a salir, sólo que todavía no se puede medir.
  assert.equal(cel(g, `C${g.filasCosto[i]}`), totalEgresos(o))
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
    assert.ok(!/Margen/i.test(String(cel(g, `A${b.fProt}`))), `${b.clave}: no puede publicar un margen`)
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

test('NINGUNA fila de residuo en la Sección 2: el dueño sacó "Otros trabajos" como sacó "sin ubicar"', () => {
  // Es la tercera fila de sobrante que manda sacar. La CAPACIDAD de detectar el problema no se
  // perdió: la identidad que esa fila publicaba vive en `trabajosFueraDeObra` y la corre el escritor
  // contra lo ya publicado.
  const rotulos = g.filas.map((f) => String(f[0] ?? ''))
  assert.ok(!rotulos.some((r) => /^Otros trabajos|fuera de las/i.test(r)), 'no puede quedar la fila de sobrante')
  // Y el total de la Sección 2 sigue siendo la suma de las protagonistas, que es el número que el
  // control compara: si dejara de serlo, el control estaría midiendo otra cosa.
  assert.equal(cel(g, `C${g.fTotObras}`), `=${g.bloques.map((b) => `C${b.fProt}`).join('+')}`)
  assert.ok(!rotulos.some((r) => /^Presupuesto/i.test(r.trim())),
    'ni un presupuesto por obra: la tabla `presupuestos` del OS sólo tiene dos filas, de obras pausadas')
})

test('el sobrante NEGATIVO delata el doble conteo, y el positivo no es un problema', () => {
  // EL DEFECTO QUE ESTE CONTROL PERSIGUE (13/08): la fila de residuo publicó $692.395.550 donde
  // iban $125.680.764 porque `X - C18+C24+C28…` resta la PRIMERA obra y SUMA las otras seis. Sheets
  // no da error: devuelve un número plausible. La única señal falsificable es que las obras sumen
  // MÁS que la venta entera de sus propios clientes, y eso es aritméticamente imposible sin duplicar.
  assert.equal(trabajosFueraDeObra(800, 675).problema, null, 'el sobrante normal no es un problema')
  assert.equal(trabajosFueraDeObra(800, 675).fuera, 125)
  assert.equal(trabajosFueraDeObra(800, 800).problema, null, 'ni el caso en que las obras son todo')
  assert.equal(trabajosFueraDeObra(800, 800.4).problema, null, 'ni el redondeo de un peso')
  const roto = trabajosFueraDeObra(125_680_764, 692_395_550)
  assert.ok(roto.problema, 'las obras no pueden sumar más que sus clientes')
  assert.match(roto.problema, /DOS VECES/)
  assert.match(roto.problema, /566\.714\.786/, 'y dice cuánto sobra, para poder ir a buscarlo')
})

test('el % COBRADO divide magnitudes del MISMO criterio: con la venta daría más de 100%', () => {
  // La venta se mide al NETO y el cobrado al TOTAL. `cobrado/venta` da 113% en una obra blanca
  // íntegramente cobrada —Playón: venta neta $102.500.000, resta al total $116.150.000— y un avance
  // imposible se lee como un error de la pestaña. El denominador es la cartera: cobrado + resta.
  // SÓLO LA SECCIÓN 1. La B de la Sección 2 dejó de medir cartera y mide avance de CONTRATO (pedido
  // del dueño: *"el % como avance de contrato, no de cartera"*), y tiene su propio test.
  for (const f of [...rangoFilas(...g.fClientes), g.fTotClientes]) {
    const v = cel(g, `B${f}`)
    assert.equal(v, `=IF(D${f}+E${f}=0;0;D${f}/(D${f}+E${f}))`, `B${f}`)
    assert.ok(!v.includes(`C${f}`), `B${f}: la VENTA no puede entrar al porcentaje — es otro criterio`)
    // Sin IFERROR: un vacío haría abortar al escritor por `columnasDesparejas` en una obra recién
    // declarada sin cobranzas, que es un caso legítimo y no un defecto.
    assert.ok(!v.includes('IFERROR'), `B${f}: la fila sin cartera devuelve 0, no vacío`)
  }
  // Y el cuadro de costo tiene su propio porcentaje, con otro significado declarado en su encabezado.
  for (const f of g.filasCosto) assert.equal(cel(g, `B${f}`), `=IF(C${f}=0;0;D${f}/C${f})`, `B${f}: % pagado`)
})

test('el semáforo ✓/⚠ ya NO está: daba lo mismo en las 7 obras y la columna F dice cuánto', () => {
  // Una columna donde todas las celdas dicen ✓ no informa. Su única señal —hay vencido— la publica
  // la F con el importe, que es más específica que un glifo. Y el modelo que el dueño señaló como
  // estándar no usa un solo símbolo: usa números.
  for (const [ref, v] of g.filas.flatMap((f, i) => f.map((x, c) => [`${COLS[c]}${i + 1}`, x]))) {
    assert.ok(!/["=](⚠|✓)/.test(String(v ?? '')), `${ref}: quedó un semáforo`)
  }
  // Lo VENCIDO sigue midiéndose igual: fecha de cobro pasada y sin cobrar.
  for (const b of g.bloques) assert.match(cel(g, `F${b.fProt}`), /TODAY\(\)/, `${b.clave}`)
})

test('NI UNA CELDA DE OBRAS LLEVA UN GLIFO QUE EL PDF NO DIBUJA', () => {
  // EL DEFECTO (13/08): "⚠ sin proveedor" se leía "sin proveedor" y el ⚠ de obra vencida no se iba a
  // ver NUNCA cuando se encendiera — la fórmula estaba bien escrita y el glifo no se dibuja. Se
  // verificó exportando la pestaña a PDF: el ⚠ y el 🟢 desaparecen, el ⊘ y el ⇒ salen enteros.
  const ciegos = g.filas.flatMap((f, i) => f.map((x, c) => [`${COLS[c]}${i + 1}`, glifosInvisibles(x)]))
    .filter(([, x]) => x.length)
  assert.deepEqual(ciegos, [], 'una marca que no se dibuja es una marca que no avisa')
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

test('los cierres suman las filas UNA POR UNA, no un rango que se lleve puesto lo que venga', () => {
  const filas = (ff) => `=${ff.join('+')}`
  for (const c of ['C', 'D', 'E', 'F']) {
    assert.equal(cel(g, `${c}${g.fTotObras}`), filas(g.bloques.map((b) => `${c}${b.fProt}`)), `${c}${g.fTotObras}`)
  }
  // El contrato cierra sólo sobre las obras que LO DECLARAN: las otras publican el guion, y una suma
  // que incluye texto depende de que Sheets lo ignore — una conducta que este worktree no puede probar.
  const conContrato = g.bloques.filter((b) => b.contrato).map((b) => b.fProt)
  for (const c of ['G', 'H']) {
    const v = cel(g, `${c}${g.fTotObras}`)
    assert.equal(v, conContrato.length ? filas(conContrato.map((f) => `${c}${f}`)) : SIN_CONTRATO, `${c}${g.fTotObras}`)
  }
  for (const c of ['C', 'D', 'E']) {
    assert.equal(cel(g, `${c}${g.fTotCosto}`), filas(g.filasCosto.map((f) => `${c}${f}`)), `${c}${g.fTotCosto}`)
  }
})

test('LA NUMERACIÓN DE BLOQUES ES CONSECUTIVA Y SIN HUECOS, y el rótulo de cada obra la sigue', () => {
  // Un cuadro que va "1, 3, 4" hace creer que falta un bloque. Al entrar el titular de cartera como
  // bloque 1 las obras pasaron de 2.x a 3.x, y ese número aparece en DOS lugares —el título del
  // bloque y el rótulo de cada fila—: si se mueve uno solo, la pestaña queda medio renumerada.
  const titulos = g.filas.map((f) => String(f[0] ?? '')).filter((t) => /^\d+ · /.test(t))
    .concat(g.rotulos.filter((r) => /^\d+ · /.test(r.texto)).map((r) => r.texto))
  const numeros = [...new Set(titulos.map((t) => Number(t.split(' · ')[0])))].sort((a, b) => a - b)
  assert.deepEqual(numeros, [1, 2, SECCION_OBRAS, SECCION_COSTO], 'los cuatro bloques, sin huecos')
  // Y cada obra lleva el número de SU cuadro, en los dos: 3.n arriba y 4.n abajo, en el mismo orden.
  for (const [i, b] of g.bloques.entries()) {
    assert.match(g.rotulos.find((r) => r.fila === b.fProt).texto, new RegExp(`^${SECCION_OBRAS}\\.${i + 1} · `))
    assert.match(g.rotulos.find((r) => r.fila === g.filasCosto[i]).texto, new RegExp(`^${SECCION_COSTO}\\.${i + 1} · `))
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
  const conNeteo = g.filas.flatMap((f, i) => f.flatMap((v, c) => (typeof v === 'string' && v.includes("'Compras'!") ? [[`${COLS[c]}${i + 1}`, v]] : [])))
  assert.ok(conNeteo.length >= 8, `tiene que haber celdas que midan contra Compras, hay ${conNeteo.length}`)
  for (const [ref, f] of conNeteo) {
    assert.match(f, neto, `${ref}: el costo real se mide en el neto de Compras`)
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
  // Sin inicio no hay ventana para netear contra Compras: lo pagado no se puede medir y vale 0. No
  // se inventa una ventana ni se toma el gasto entero del cliente, que sería de las otras obras.
  const c = otra.filasCosto[0]
  assert.equal(cel(otra, `D${c}`), '=0', 'sin fechas no se puede medir lo pagado')
  assert.ok(!String(cel(otra, `D${c}`)).includes('Compras'), 'y no se inventa una ventana')
  assert.equal(cel(otra, `C${c}`), totalEgresos(sinFecha), 'pero el costo proyectado se sigue viendo')
})

test('sin obras no se arma media pestaña: la sección 2 no publica un total que no existe', () => {
  const vacio = grillaObras({ obras: [] })
  assert.equal(vacio.bloques.length, 0)
  assert.equal(vacio.filasCosto.length, 0)
  assert.equal(vacio.fTotObras, null)
  assert.equal(vacio.fTotCosto, null)
  assert.deepEqual(vacio.totales, [vacio.fCartera, vacio.fTotClientes], 'quedan la cartera y el cierre de clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
// LOS NÚMEROS TIPEADOS
// ─────────────────────────────────────────────────────────────────────────────

test('los ÚNICOS números tipeados son los proyectados del dueño, y son los suyos sin retocar', () => {
  const numeros = g.filas.flatMap((f, i) => f.map((v, c) => [`${COLS[c]}${i + 1}`, v]).filter(([, v]) => typeof v === 'number'))
  const montos = numeros.filter(([ref]) => ref.startsWith('C')).map(([, v]) => v)
  assert.deepEqual(montos, OBRAS_FUTURAS.map((o) => totalEgresos(o)), 'el costo proyectado, sin retocar')
  // Lo único que puede ser un número tipeado fuera de la C es el CONTRATO de la G, y ése no lo elige
  // el código: `obras-pestana.mjs` lo vuelve a leer de la ORDEN DE COMPRA de Cobranzas en cada corrida.
  for (const [ref] of numeros) assert.ok(/^[CG]/.test(ref), `${ref}: un número tipeado fuera de C y G`)
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
  // El serial ya no se publica en ninguna celda —las fechas de egreso salieron con el detalle— pero
  // sigue siendo el que acota TODA ventana de esta pestaña, así que el error se paga igual.
  assert.ok(cel(g, `C${g.fTotClientes}`).includes(String(serialISO(`${ANO}-01-01`))), 'acota el año')
})

// ─────────────────────────────────────────────────────────────────────────────
// EL ANCHO DE LA COLUMNA A — EL DEFECTO QUE NINGÚN TEST MIRABA
// ─────────────────────────────────────────────────────────────────────────────

test('la cola de la columna que se dejó de usar se limpia: sacarla del código no la saca del archivo', () => {
  // EL DEFECTO (13/08): al pasar de 9 a 8 columnas, la novena quedó EN EL ARCHIVO con la glosa de la
  // corrida anterior —40 celdas— y encima corrida de fila, porque la grilla creció de 61 a 62: el
  // detalle de una obra terminó pegado al encabezado de la Sección 2.
  const conCola = conColaLimpiable(g.filas)
  // 13/08, SEGUNDA VUELTA: al volver a usar la novena columna (Saldo contrato) la cola de COLUMNAS
  // quedó en cero — y eso está bien, no rota. Lo que no puede pasar nunca es que la grilla escriba
  // MÁS ancho del que la cola limpia: ahí quedarían celdas de una corrida vieja fuera de todo control.
  assert.ok(ANCHO_HISTORICO >= ANCHO_OBRAS, 'la cola tiene que cubrir todo lo que el generador escribe')
  assert.equal(conCola.length, ALTO_HISTORICO, 'y llega hasta el alto histórico')
  for (const [i, f] of conCola.entries()) {
    assert.equal(f.length, ANCHO_HISTORICO, `fila ${i + 1}: llega hasta el ancho histórico`)
    for (let c = ANCHO_OBRAS; c < ANCHO_HISTORICO; c++) {
      assert.equal(f[c], VACIO, `fila ${i + 1} col ${c + 1}: la cola va con el centinela, para que se LIMPIE`)
    }
    if (i < g.filas.length) assert.deepEqual(f.slice(0, ANCHO_OBRAS), g.filas[i], 'y no toca lo que sí se escribe')
    // LA COLA DE FILAS: la grilla bajó de 62 a 61 y la vieja 62 quedó publicada — el PDF mostró
    // "Otros trabajos…" DOS VECES, con valores distintos. El generador es dueño de su RANGO, no de
    // su ancho: un rango tiene dos ejes.
    else assert.ok(f.every((c) => c === VACIO), `fila ${i + 1}: la cola de abajo va entera con centinela`)
  }
})

test('si la grilla supera el alto declarado, ROMPE: una cola silenciosa es peor que un aborto', () => {
  const g2 = grillaObras({ obras: OBRAS_FUTURAS })
  assert.throws(() => conColaLimpiable(g2.filas, ANCHO_HISTORICO, g2.filas.length - 1),
    /Subí ALTO_HISTORICO a \d+/)
})

test('ningún rótulo excede el ancho declarado de la columna A: con CLIP, lo que no entra DESAPARECE', () => {
  // EL DEFECTO, VISTO EN EL PDF DEL 13/08: con 300px fijos, "OBRAS — EL AÑO ENTERO, OBRA POR OBRA"
  // se leía "…OBRA P" y "2.7 · Quattropani - Melisa García SAS — SALÓN" perdía "COMERCIAL". El
  // estilo de la casa pone wrapStrategy CLIP en toda la hoja: un rótulo más largo que su columna no
  // se derrama sobre la vecina, se corta. Ningún test unitario lo miraba — éste sí.
  // SE MIDE LO QUE LA CELDA MUESTRA, NO LO QUE TIENE ADENTRO. Desde que el rótulo de una obra lleva
  // el ⚠ vivo, su celda es una fórmula: medir el texto de la fórmula pedía 680px para dibujar 60
  // caracteres, y ensanchar la columna por eso sería empujar los importes fuera de pantalla por un
  // texto que nadie ve. `g.rotulos` es la misma traducción que usa `anchoColumnaA`.
  const ancho = anchoColumnaA(g)
  const grandes = new Set([...g.protagonistas, ...g.totales])
  const visible = new Map(g.rotulos.map((r) => [r.fila, r.texto]))
  g.filas.forEach((fila, i) => {
    const t = visible.get(i + 1) ?? (fila[0] === VACIO ? '' : String(fila[0] ?? ''))
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS FECHAS DE INICIO Y FIN DE OBRA (13/08 — pedido del dueño)
//
// *"necesito q la pestaña obras me marque bien claro los datos q habian sido enviados respecto a las
// fechas de inicio y fin de obra"*. El defecto que estos tests atrapan: las siete obras tienen sus
// fechas declaradas desde el 07/08 en obras-datos.mjs —las mandó él— y la pestaña no publicaba
// NINGUNA. Un dato entregado que el cuadro no muestra es peor que uno que falta: el dueño cree que
// ya está a la vista y decide sin él.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el rótulo de cada obra PUBLICA su inicio y su fin: son datos del dueño y no se pueden perder', () => {
  const conFechas = OBRAS_FUTURAS.filter(esProyectable)
  assert.ok(conFechas.length >= 7, 'el fixture tiene que traer las obras con fechas declaradas')
  for (const [i, o] of OBRAS_FUTURAS.entries()) {
    if (!esProyectable(o)) continue
    const { texto } = rotuloDeObra(o, i + 1)
    const dm = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
    // REVERTIR EL ARREGLO PONE ESTO EN ROJO: sin las fechas en el rótulo, la pestaña vuelve a
    // publicar el nombre de la obra a secas y estas dos aserciones fallan en las siete obras.
    assert.ok(texto.includes(dm(o.inicio)), `${o.clave}: el rótulo no publica el inicio ${o.inicio} — "${texto}"`)
    assert.ok(texto.includes(dm(o.fin)), `${o.clave}: el rótulo no publica el fin ${o.fin} — "${texto}"`)
    assert.ok(texto.includes('→'), `${o.clave}: inicio y fin sin la flecha no se leen como un tramo`)
  }
})

test('la marca de "ya pasó el fin" es una FÓRMULA con TODAY(), no un texto tipeado en la corrida', () => {
  // POR QUÉ IMPORTA: tipeada, la obra que vence mañana queda sin marcar hasta que alguien se acuerde
  // de correr el generador — o sea, justo el día en que la marca sirve. Con TODAY() la pestaña se
  // entera sola. Es el mismo criterio con el que `vencido` mide la cobranza atrasada.
  const o = OBRAS_FUTURAS.find(esProyectable)
  const { celda } = rotuloDeObra(o, 1)
  assert.ok(celda.startsWith('='), 'el rótulo con fechas tiene que ser una fórmula viva')
  assert.match(celda, /TODAY\(\)>\d+/, 'la comparación contra hoy la tiene que hacer Sheets, no este proceso')
  assert.ok(celda.includes(String(serialISO(o.fin))), 'se compara contra el SERIAL de la fecha de fin declarada')
  assert.ok(celda.includes(ALERTA), 'la marca tiene que estar en la fórmula')
  // Y TIENE QUE SER UNA MARCA QUE SE DIBUJE. Acá vivía un ⚠ que el PDF no embebe: la fórmula era
  // correcta, la celda tenía el glifo y la pantalla no mostraba nada — la obra vencida no avisaba.
  assert.deepEqual(glifosInvisibles(celda), [], 'la fórmula lleva un glifo que el archivo no dibuja')
  assert.ok(!celda.includes(','), 'locale es-AR: el separador de argumentos es `;`, una coma es un decimal')
  assert.equal(problemaDeSintaxis(celda), null)
})

test('una obra SIN fechas no inventa ninguna: sigue avisando que falta y no lleva fórmula', () => {
  // La regla de oro 1. Una fecha estimada dentro de un rótulo se lee como una fecha declarada.
  const sinFechas = { ...OBRAS_FUTURAS[0], inicio: null, fin: null }
  const { texto, celda } = rotuloDeObra(sinFechas, 1)
  assert.ok(texto.includes('sin fechas'), 'tiene que declarar que no tiene fechas')
  assert.ok(!celda.startsWith('='), 'sin fecha de fin no hay TODAY() contra qué comparar: es texto plano')
  assert.ok(!/\d{2}\/\d{2}/.test(texto), `no puede aparecer ninguna fecha inventada: "${texto}"`)
})

test('la alerta del rótulo NO se dispara por una obra cuyo fin todavía no llegó', () => {
  // El glifo dice algo verificable —la fecha ya pasó— y nada más. Si el umbral fuera otra cosa
  // (avance físico, "atrasada"), estaría afirmando algo que ninguna fuente de esta pestaña mide.
  const lejos = { ...OBRAS_FUTURAS[0], inicio: '2026-08-05', fin: '2099-12-31' }
  const { celda } = rotuloDeObra(lejos, 1)
  assert.ok(celda.includes(String(serialISO('2099-12-31'))))
  const ayer = { ...OBRAS_FUTURAS[0], inicio: '2026-01-05', fin: '2026-01-31' }
  assert.notEqual(rotuloDeObra(ayer, 1).celda, celda, 'cada obra compara contra SU fin, no contra uno fijo')
})

test('la grilla expone el texto VISIBLE de cada rótulo: sin eso la columna A se dimensiona con la fórmula', () => {
  const g2 = grillaObras({ obras: OBRAS_FUTURAS })
  // Uno por obra en CADA cuadro (el de contrato y el de costo) más el titular de cartera, que
  // también es una fórmula (lleva la fecha viva) y también hay que medir por lo que MUESTRA.
  assert.equal(g2.rotulos.length, OBRAS_FUTURAS.length * 2 + 1, 'un rótulo visible por cada celda-fórmula de la columna A')
  // La fila 2 es el subtítulo y queda afuera a propósito: va con WRAP, así que su largo no ensancha
  // nada y `anchoColumnaA` ya la saltea por número de fila.
  const conFormulaEnA = g2.filas.flatMap((f, i) => (i + 1 !== 2 && typeof f[0] === 'string' && f[0].startsWith('=') ? [i + 1] : []))
  assert.deepEqual(g2.rotulos.map((r) => r.fila).sort((a, b) => a - b), conFormulaEnA,
    'TODA celda de la columna A que sea fórmula necesita su texto visible, o se mide la fórmula')
  for (const r of g2.rotulos) {
    assert.ok(!r.texto.startsWith('='), 'el texto visible no puede ser la fórmula')
  }
  // El ancho medido sobre la FÓRMULA sería absurdo — es el defecto que este mecanismo evita.
  const anchoReal = anchoColumnaA(g2)
  const anchoSinRotulos = anchoColumnaA({ ...g2, rotulos: [] })
  assert.ok(anchoReal < anchoSinRotulos, `medir la fórmula pedía ${anchoSinRotulos}px y el texto pide ${anchoReal}px`)
})
