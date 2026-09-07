// LA GRILLA DE `OBRAS`, VERIFICADA EN FRÍO — porque sus defectos NO dan #ERROR.
//
// Esta pestaña casi no tiene números propios: son fórmulas. Y una fórmula equivocada acá no se rompe,
// devuelve un número creíble. Los cuatro modos de mentir que este archivo persigue:
//
//   · SUMAR DOS VECES — en Cobranzas conviven la fila madre de la obra y su cronograma de
//     certificaciones, con el mismo importe. Sumar todo lo que matchea duplica la venta.
//   · FILTRAR POR UN NOMBRE QUE NO EXISTE — un cliente que no es el canónico del desplegable de
//     Compras da $0 para siempre, sin un solo error.
//   · PUBLICAR UNA CELDA EN ERROR — `NA()` en una columna de costo dejó 20 `#N/A` en el archivo del
//     dueño el 07/09/2026, y el escritor aborta ante cualquiera de ellas.
//   · LA COMA — en locale es_AR el separador de argumentos es `;`. Una coma es un decimal, y la
//     fórmula entra rota al archivo.
//
// ═══ EL CONTRATO QUE ESTE ARCHIVO FIJA (07/09/2026) ═══
//
// El dueño rechazó la pestaña de cinco cuadros —*"no es world class, es inusable y espantosa"*— y
// eligió el reemplazo con las bajas nombradas una por una: **dos cuadros, el año y las obras**. Se
// fueron el titular de cartera por tramos (1), el cuadro por CLIENTE (2), el de costo separado (4) y
// el de materiales previstos (5). Las nueve columnas del cuadro de obras son:
//
//   A obra · B inicio · C fin · D contratado · E cobrado · F por cobrar · G vencido · H costo
//   proyectado · I próximo cobro
//
// y el cuadro del año publica cuatro cifras ALINEADAS con esas columnas: vendido (D), cobrado (E),
// por cobrar (F) y vencido (G). Que signifiquen lo mismo arriba y abajo no es estética: es lo que
// permite leer la pestaña de un vistazo y lo que habilita el control de doble conteo del escritor.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  grillaObras, serialISO, criterioCliente, variantesDe, anchoColumnaA, pxDeTexto, clientesDeCobranzas,
  celdasEnError, problemaDeSintaxis, ERRORES_SHEET, nombreEnCostos, ANO,
  ANCHO_OBRAS, ANCHOS_OBRAS, ANCHO_HISTORICO, ALTO_HISTORICO, conColaLimpiable, REFS_OBRAS, CLIENTES_MUESTRA,
  rotuloDeObra, SIN_CONTRATO, SIN_COSTO, SECCION_OBRAS, ROTULO_TOTAL_ANO, ROTULO_TOTAL_OBRAS,
} from './obras-grilla.mjs'
import { ESPECIES_DE_PLATA } from './obras-especies.mjs'
import { formulaCostoProyectado, TIPO } from './obras-replica.mjs'
import { OBRAS_FUTURAS, CLIENTES_CANONICOS, esProyectable } from './obras-datos.mjs'
import { VACIO } from './preservar-anotaciones.mjs'
import { ALERTA, glifosInvisibles } from './glifos.mjs'

const COLS = 'ABCDEFGHIJK'
const g = grillaObras({ obras: OBRAS_FUTURAS })

/** El contenido de una celda por su referencia A1 ("D16"), como se lee en el Sheet. */
const cel = (grid, ref) => {
  const [, col, fila] = ref.match(/^([A-K])(\d+)$/)
  return grid.filas[Number(fila) - 1][COLS.indexOf(col)]
}
/** Todas las fórmulas de la grilla, con su referencia A1 — el material de casi todos los tests. */
const formulas = (grid) => grid.filas.flatMap((f, i) => f
  .map((v, c) => [`${COLS[c]}${i + 1}`, v])
  .filter(([, v]) => typeof v === 'string' && v.startsWith('=')))
/** Las filas de obra: una por obra declarada. */
const filasObra = g.bloques.map((b) => b.fProt)

// ─────────────────────────────────────────────────────────────────────────────
// LA FORMA DE LA PESTAÑA: DOS CUADROS Y NADA MÁS
// ─────────────────────────────────────────────────────────────────────────────

test('LA PESTAÑA TIENE EXACTAMENTE DOS CUADROS: es la decisión del dueño, no una preferencia', () => {
  // Los títulos de bloque son las únicas celdas de la columna A que empiezan con un número y un
  // punto medio. Si mañana alguien repone el cuadro de clientes o el de materiales, esto se pone
  // rojo — que es exactamente para lo que existe.
  const titulos = g.filas.map((f) => String(f[0] ?? ''))
    .filter((t) => /^(=")?\d+ · /.test(t))
    .map((t) => (t.match(/^(?:=")?(\d+) · ([A-ZÁÉÍÓÚÑ ]+)/) ?? []).slice(1))
  assert.equal(titulos.length, 2, `hay ${titulos.length} cuadros y el dueño pidió dos`)
  assert.deepEqual(titulos.map(([n]) => Number(n)), [1, SECCION_OBRAS], 'numerados 1 y 2, sin huecos')
  assert.match(titulos[0][1], /^EL AÑO/)
  assert.match(titulos[1][1], /^OBRAS/)
})

test('la pestaña entra en 20 filas: era de 68 y el dueño la llamó inusable', () => {
  // No es un número mágico: son 3 de encabezado + 3 del año + 1 en blanco + 2 de título/encabezado
  // del cuadro de obras + una fila por obra + el cierre. Si crece sin que crezcan las obras, algo
  // volvió a entrar.
  assert.equal(g.filas.length, 10 + OBRAS_FUTURAS.length)
  assert.ok(g.filas.length <= ALTO_HISTORICO, 'y sigue entrando en el alto declarado')
})

test('CADA OBRA ES UNA SOLA FILA: dos filas por obra en dos cuadros fue lo que se sacó', () => {
  assert.equal(filasObra.length, OBRAS_FUTURAS.length)
  assert.equal(new Set(filasObra).size, filasObra.length, 'ninguna obra comparte fila con otra')
  // Y son CONSECUTIVAS: un hueco en el medio es una fila de detalle que volvió.
  assert.deepEqual(filasObra, filasObra.map((_, i) => filasObra[0] + i))
})

test('el cuadro del año NO suma las filas de abajo: sale de Cobranzas entera', () => {
  // Las obras son un SUBCONJUNTO de lo que se factura. Si el año sumara las obras, el número grande
  // bajaría solo cada vez que una obra sale de la lista y nadie se enteraría.
  for (const c of ['D', 'E', 'F', 'G']) {
    const f = String(cel(g, `${c}${g.fAno}`))
    assert.match(f, /SUMIFS\('Cobranzas'/, `${c}${g.fAno}: sale de la fuente`)
    assert.ok(!filasObra.some((n) => f.includes(`${c}${n}`)), `${c}${g.fAno}: no cita ninguna fila de obra`)
  }
  assert.equal(cel(g, `A${g.fAno}`), ROTULO_TOTAL_ANO)
})

test('el año y las obras dicen lo MISMO en la MISMA columna: E cobrado, F por cobrar, G vencido', () => {
  // Es la gramática que hace legible la pestaña, y además lo que habilita el control de doble conteo
  // del escritor: compara celda contra celda de la misma columna.
  const enc = (f) => g.filas[f - 1].map((v) => (v === VACIO ? '' : String(v)))
  const [encAno, encObras] = g.encabezados.map(enc)
  for (const i of [4, 5, 6]) {
    assert.equal(encAno[i].replace(/ \(total\)$/, ''), encObras[i].replace(/ \(total\)$/, ''),
      `la columna ${COLS[i]} tiene que significar lo mismo arriba y abajo`)
  }
  assert.deepEqual(encObras, ['Obra', 'Inicio', 'Fin', 'Contratado', 'Cobrado', 'Por cobrar',
    `${ALERTA} Vencido`, 'Costo proyectado', '· mano de obra', '· materiales', 'Próx. cobro'])
})

// ─────────────────────────────────────────────────────────────────────────────
// LAS FÓRMULAS: QUÉ MIDE CADA COLUMNA
// ─────────────────────────────────────────────────────────────────────────────

test('la venta del año es una SUMIFS directa, sin el IF que elegía qué filas mirar', () => {
  // El defecto original: un IF descartaba las filas cuyo concepto decía "Certificación", y eso
  // borraba la mitad de la venta sin dar un solo error.
  const f = String(cel(g, `D${g.fAno}`))
  assert.ok(f.startsWith('=SUMIFS('), 'la venta del año es una suma directa')
  assert.ok(!/\bIF\(/.test(f), 'ningún IF elige qué filas entran')
  assert.ok(!/Certificaci/i.test(f), 'y nada descarta filas por su concepto')
})

test('la VENTA sale del neto y el COBRADO del total: no se mezclan en la misma columna', () => {
  // Vender es devengado y al neto (el IVA no es venta); cobrar es percibido y al total (lo que entra
  // a la cuenta). Mezclarlos en una columna es la regla de oro 6 rota.
  assert.match(String(cel(g, `D${g.fAno}`)), new RegExp(`\\$${REFS_OBRAS.cob.neto}\\$`))
  assert.match(String(cel(g, `E${g.fAno}`)), new RegExp(`\\$${REFS_OBRAS.cob.total}\\$`))
  for (const n of filasObra) {
    assert.match(String(cel(g, `E${n}`)), new RegExp(`\\$${REFS_OBRAS.cob.total}\\$`), `E${n}`)
    assert.match(String(cel(g, `F${n}`)), new RegExp(`\\$${REFS_OBRAS.cob.total}\\$`), `F${n}`)
  }
})

test('lo que RESTA COBRAR sale del ESTADO, no de una columna de saldo', () => {
  // La columna M de Cobranzas no es un saldo: es el total a cobrar de la fila. Restar contra ella
  // daría un número creíble y equivocado.
  for (const n of [...filasObra, g.fAno]) {
    const f = String(cel(g, `F${n}`))
    assert.ok(f.includes(`$${REFS_OBRAS.cob.estado}$`), `F${n}: la resta se calcula por estado`)
    assert.ok(f.includes(')-(') || f.includes(')-'), `F${n}: es una resta de dos poblaciones`)
  }
})

test('el CONTRATO no es una fórmula: lo trae el escritor de la Orden de Compra de Cobranzas', () => {
  // Sheets no puede extraer "47.590.272" de adentro del texto "Resto 50% s/ total 47.590.272 —
  // certificación quincenal 1/4". Por eso el número lo lee `cobranzas-contrato.mjs` en cada corrida
  // y entra como valor; sin contrato, la celda publica el guion y NUNCA un cero.
  for (const n of filasObra) {
    const v = cel(g, `D${n}`)
    assert.ok(typeof v === 'number' || v === SIN_CONTRATO, `D${n}: contrato o guion, nada más`)
    assert.notEqual(v, 0, `D${n}: un 0 afirmaría que el contrato vale cero`)
  }
})

test('EL COSTO SE ABRE EN MANO DE OBRA Y MATERIALES, y las dos partes suman el total', () => {
  // Pedido del dueño: «valor de venta y costos totales y discriminado por mano de obra y
  // materiales». Es además lo que pide un WIP schedule de construcción: el costo a la fecha se abre
  // por naturaleza. La brecha entre las dos columnas ES el dato —87% de mano de obra en la
  // instalación eléctrica contra 21% en BSA—: dos obras del mismo año con motores opuestos.
  for (const b of g.bloques) {
    const [total, mo, mat] = ['H', 'I', 'J'].map((c) => String(cel(g, `${c}${b.fProt}`)))
    if (b.sinCosto) {
      assert.deepEqual([total, mo, mat], [SIN_COSTO, SIN_COSTO, SIN_COSTO], `${b.clave}: sin costo, tres guiones`)
      continue
    }
    assert.ok(mo.includes(`"${TIPO.mo}"`), `I${b.fProt}: la mano de obra filtra por su tipo`)
    assert.ok(mat.includes(`"${TIPO.material}"`), `J${b.fProt}: los materiales filtran por el suyo`)
    assert.ok(!total.includes(`"${TIPO.mo}"`) && !total.includes(`"${TIPO.material}"`),
      `H${b.fProt}: el total NO filtra por tipo — si lo hiciera, dejaría afuera una de las dos partes`)
  }
  // Y el cierre suma las mismas filas en las tres columnas: un total que cita otras filas que su
  // desglose publica un desglose que no explica su total.
  const conCosto = g.bloques.filter((b) => !b.sinCosto).map((b) => b.fProt)
  for (const c of ['H', 'I', 'J']) {
    assert.equal(cel(g, `${c}${g.fTotObras}`), `=${conCosto.map((n) => `${c}${n}`).join('+')}`)
  }
})

test('el COSTO es el PROYECTADO y sale de la réplica, nunca de Compras', () => {
  // El 87% del costo de una obra es mano de obra, y la mano de obra se paga por Jornales: NO está en
  // Compras y no va a estarlo. Publicar el comprado al lado del contratado se leería como un margen
  // enorme que no existe — por eso la columna es la explosión de gastos que cargó el dueño.
  for (const b of g.bloques) {
    const v = String(cel(g, `H${b.fProt}`))
    if (b.sinCosto) { assert.equal(v, SIN_COSTO, `H${b.fProt}: sin costo cargado va el guion`); continue }
    const base = formulaCostoProyectado(OBRAS_FUTURAS.find((o) => o.clave === b.clave).obra)
    assert.equal(v, `=IFNA(${base.slice(1)};"${SIN_COSTO}")`, `H${b.fProt}: la réplica, envuelta contra el NA()`)
    assert.ok(!v.includes("'Compras'"), `H${b.fProt}: el costo proyectado no mira Compras`)
  }
})

test('NINGUNA celda publica NA(): el escritor aborta con una sola, y ya dejó 20 en el archivo', () => {
  // 07/09/2026: las tres obras de MESSINA sin explosión de gastos publicaron `#N/A` en el cuadro 4 y
  // el dueño avisó *"cuidado q quedo roto obras en sheet flujo de fondos"*. Un dato que falta se ve
  // con el GUION, que es el idioma que la pestaña ya hablaba para el contrato.
  // El NA() de la réplica existe y es deliberado; lo que no puede es LLEGAR a la celda sin red.
  for (const [ref, f] of formulas(g)) {
    if (!/\bNA\(\)/.test(f)) continue
    assert.ok(f.startsWith(`=IFNA(`) && f.endsWith(`;"${SIN_COSTO}")`), `${ref}: un NA() sin IFNA rompe la pestaña`)
  }
  assert.deepEqual(celdasEnError(g.filas.map((f) => f.map((v) => (v === VACIO ? '' : v)))), [])
  assert.equal(SIN_COSTO, SIN_CONTRATO, 'un dato que falta se dibuja siempre igual')
})

test('el próximo cobro publica el guion cuando no hay nada pendiente, no un blanco', () => {
  // Un blanco lo cuenta `columnasDesparejas` como fórmula rota: el timer del Flujo de Caja terminó en
  // FAILURE con la pestaña ya publicada y sana por esto exacto.
  for (const n of filasObra) {
    const f = String(cel(g, `K${n}`))
    assert.ok(f.startsWith('=IF('), `K${n}`)
    assert.ok(f.includes(`"${SIN_CONTRATO}"`), `K${n}: sin pendientes va el guion`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// EL CLIENTE: EL FILTRO QUE DA $0 PARA SIEMPRE SIN DAR ERROR
// ─────────────────────────────────────────────────────────────────────────────

test('el cliente se matchea EXACTO: ningún nombre puede llevarse las filas de otro que lo contenga', () => {
  // "San Francisco" adentro de "IMOTOR/San Francisco/JAVI SANCHEZ" es otro cliente. El match por
  // contenido le sumaba nueve filas ajenas.
  for (const [ref, f] of formulas(g)) {
    for (const cli of CLIENTES_CANONICOS) {
      assert.ok(!f.includes(`"*${cli}*"`), `${ref}: ${cli} entra con comodines a los dos lados`)
    }
  }
  assert.equal(criterioCliente('MESSINA'), 'MESSINA', 'el criterio es el nombre, sin comodines')
})

test('IMOTOR es San Francisco: la decisión del dueño vive en un mapa, no en un comodín más ancho', () => {
  const v = variantesDe('San Francisco')
  assert.ok(v.includes('San Francisco') && v.length > 1, 'la variante está declarada')
  for (const cli of ['MESSINA', 'ARCOR']) assert.deepEqual(variantesDe(cli), [cli], 'y sólo donde se declaró')
})

test('ninguna fórmula filtra por un cliente que no esté en CLIENTES_CANONICOS', () => {
  // Un nombre que no es el del desplegable da $0 para siempre y sin un solo error.
  const declarados = new Set([...CLIENTES_CANONICOS, ...CLIENTES_CANONICOS.flatMap(variantesDe),
    ...CLIENTES_CANONICOS.map(nombreEnCostos)])
  for (const [ref, f] of formulas(g)) {
    for (const m of f.matchAll(/\$F\$5:\$F;"([^"*<>]+)"/g)) {
      assert.ok(declarados.has(m[1]), `${ref}: filtra por "${m[1]}", que no es un cliente declarado`)
    }
  }
})

test('la lista de clientes sale de Cobranzas: un cliente nuevo aparece solo', () => {
  const derivados = clientesDeCobranzas(['MESSINA', 'ARCOR', 'MESSINA', '', 'NUEVO SA'])
  assert.ok(derivados.includes('NUEVO SA'), 'lo que la fuente dice, entra')
  assert.equal(new Set(derivados).size, derivados.length, 'sin repetir')
  assert.ok(!derivados.includes(''), 'y sin la fila vacía')
})

test('las variantes declaradas COLAPSAN: derivar en crudo reabriría la fila de IMOTOR', () => {
  const derivados = clientesDeCobranzas(['San Francisco', 'IMOTOR/San Francisco/JAVI SANCHEZ'])
  assert.deepEqual(derivados, ['San Francisco'], 'la variante no es un cliente aparte')
})

// ─────────────────────────────────────────────────────────────────────────────
// LOS CIERRES: LO QUE SUMAN Y LO QUE NO
// ─────────────────────────────────────────────────────────────────────────────

test('los cierres suman las filas UNA POR UNA, no un rango que se lleve puesto lo que venga', () => {
  // Un `SUM(E10:E19)` se come cualquier fila que alguien inserte en el medio — incluido un subtotal.
  for (const c of ['E', 'F', 'G']) {
    assert.equal(cel(g, `${c}${g.fTotObras}`), `=${filasObra.map((n) => `${c}${n}`).join('+')}`)
  }
  assert.ok(!String(cel(g, `E${g.fTotObras}`)).includes(':'), 'ningún rango en el cierre')
})

test('el cierre del contratado y el del costo citan SÓLO las filas que publican un número', () => {
  // Las otras publican el guion, y una suma que ignora texto depende de una conducta de Sheets que no
  // se puede verificar sin escribir en el archivo. Citando sólo las filas con número, el resultado es
  // el mismo en Sheets y en el evaluador en frío — y el test puede afirmarlo.
  const conContrato = g.bloques.filter((b) => b.contrato).map((b) => b.fProt)
  const conCosto = g.bloques.filter((b) => !b.sinCosto).map((b) => b.fProt)
  assert.equal(cel(g, `D${g.fTotObras}`),
    conContrato.length ? `=${conContrato.map((n) => `D${n}`).join('+')}` : SIN_CONTRATO)
  assert.equal(cel(g, `H${g.fTotObras}`),
    conCosto.length ? `=${conCosto.map((n) => `H${n}`).join('+')}` : SIN_COSTO)
  assert.ok(conCosto.length < filasObra.length, 'hay obras sin costo cargado: si no, este test no prueba nada')
})

test('el cierre NO afirma una población que sólo tienen algunas de sus columnas', () => {
  // Decía «⇒ TOTAL — 10 OBRAS» y tres de sus seis columnas suman menos: «Contratado» cita sólo las
  // obras que declaran contrato en Cobranzas y «Costo proyectado» sólo las que tienen explosión de
  // gastos. Un cierre que promete diez y suma cinco miente despacio. Cuántas hay lo dicen las filas,
  // numeradas 2.1 … 2.10.
  assert.equal(cel(g, `A${g.fTotObras}`), ROTULO_TOTAL_OBRAS)
  assert.ok(!/\d/.test(ROTULO_TOTAL_OBRAS), 'el rótulo del cierre no lleva un conteo')
  const conContrato = g.bloques.filter((b) => b.contrato).length
  assert.ok(conContrato < OBRAS_FUTURAS.length, 'si todas declararan contrato este test no probaría nada')
})

test('LAS OBRAS SE LEEN COMO UNA LÍNEA DE TIEMPO: ordenadas por inicio, igual que la app', () => {
  // ISO 24896 («Notation for business reporting», 11/06/2026): un cuadro se ordena por la magnitud
  // que decide. Acá es el TIEMPO. Y es la MISMA lectura que el módulo Obras de app.ecsas.com.ar —
  // dos órdenes distintos para la misma cartera hacen dudar de si son la misma lista.
  const inicios = g.bloques.map((b) => OBRAS_FUTURAS.find((o) => o.clave === b.clave).inicio ?? '9999')
  assert.deepEqual(inicios, [...inicios].sort((a, b) => a.localeCompare(b)), 'las obras salen desordenadas')
  // Y el rótulo de cada fila sigue al orden publicado, no al del módulo de datos.
  for (const [i, b] of g.bloques.entries()) {
    assert.match(g.rotulos.find((r) => r.fila === b.fProt).texto, new RegExp(`^${SECCION_OBRAS}\\.${i + 1} · `))
  }
})

test('sin obras no se arma media pestaña: no se publica un cierre que no existe', () => {
  const vacia = grillaObras({ obras: [] })
  assert.equal(vacia.fTotObras, null, 'sin obras no hay cierre de obras')
  assert.ok(vacia.fAno, 'pero el año sigue saliendo: es de Cobranzas, no de las obras')
  assert.deepEqual(vacia.bloques, [])
})

test('NINGUNA fila de residuo: el dueño sacó "sin ubicar" y "Otros trabajos" dos veces', () => {
  // Un control que da $0 todos los días no es información: es una fila que ocupa la portada para
  // decir que no pasa nada. La CAPACIDAD de detectar el problema no se perdió — vive en el escritor,
  // que compara lo publicado y ABORTA si las obras superan al año.
  for (const f of g.filas) {
    const t = String(f[0] ?? '')
    assert.ok(!/sin ubicar|Otros trabajos|SIN IMPUTAR/i.test(t), `sobrevivió una fila de residuo: "${t}"`)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// EL RÓTULO DE CADA OBRA
// ─────────────────────────────────────────────────────────────────────────────

test('LAS FECHAS SON COLUMNAS, no una cola del rótulo: así se comparan entre obras', () => {
  for (const [i, b] of g.bloques.entries()) {
    const o = OBRAS_FUTURAS.find((x) => x.clave === b.clave)
    if (!esProyectable(o)) continue
    assert.equal(cel(g, `B${b.fProt}`), serialISO(o.inicio), `${b.clave}: el inicio del dueño`)
    assert.equal(cel(g, `C${b.fProt}`), serialISO(o.fin), `${b.clave}: y su fin`)
    // Y NO se repiten en el rótulo: el dato una vez, en la columna que se puede ordenar.
    assert.ok(!/\d{2}\/\d{2} → \d{2}\/\d{2}/.test(g.rotulos[i].texto), `${b.clave}: la fecha no vuelve al rótulo`)
  }
})

test('la marca de "ya pasó el fin" es una FÓRMULA con TODAY(), no un texto tipeado en la corrida', () => {
  // Tipeada, la obra que vence mañana queda sin marcar hasta que alguien corra el generador — justo
  // el día que la marca sirve para algo.
  const o = OBRAS_FUTURAS.find(esProyectable)
  const { celda } = rotuloDeObra(o, 1)
  assert.ok(celda.startsWith('='), 'es una fórmula')
  assert.ok(celda.includes(`TODAY()>${serialISO(o.fin)}`), 'compara contra SU fin')
  assert.ok(celda.includes(`" ${ALERTA}"`), 'y el glifo sale de la comparación')
  // Cada obra contra la SUYA: un fin fijo marcaría todas juntas.
  const otra = OBRAS_FUTURAS.filter(esProyectable).find((x) => x.fin !== o.fin)
  if (otra) assert.notEqual(rotuloDeObra(otra, 1).celda, celda)
})

test('una obra SIN fechas no inventa ninguna: avisa, y no lleva fórmula', () => {
  const sinFechas = { cliente: 'X', obra: 'Y', inicio: null, fin: null }
  const { texto, celda } = rotuloDeObra(sinFechas, 1)
  assert.equal(texto, celda, 'sin fechas no hay nada que calcular')
  assert.ok(!celda.startsWith('='), 'y por eso no es una fórmula que no puede fallar')
  assert.match(celda, /sin fechas/)
  // Y su fila publica el guion en las dos columnas de fecha, no un cero (que sería 30/12/1899).
  const gr = grillaObras({ obras: [{ ...sinFechas, clave: 'x', ventaTexto: 'Y' }] })
  assert.equal(cel(gr, `B${gr.bloques[0].fProt}`), SIN_CONTRATO)
  assert.equal(cel(gr, `C${gr.bloques[0].fProt}`), SIN_CONTRATO)
})

test('la grilla expone el texto VISIBLE de cada rótulo: sin eso la columna A mide la fórmula', () => {
  for (const b of g.bloques) {
    const r = g.rotulos.find((x) => x.fila === b.fProt)
    assert.ok(r, `la fila ${b.fProt} no declaró su texto visible`)
    assert.ok(!r.texto.startsWith('='), 'el texto visible no es la fórmula')
    assert.ok(r.texto.length < String(cel(g, `A${b.fProt}`)).length, 'y es más corto que ella')
  }
})

test('LA NUMERACIÓN DE LOS RÓTULOS SIGUE AL CUADRO: 2.1, 2.2, … sin huecos', () => {
  for (const [i, b] of g.bloques.entries()) {
    assert.match(g.rotulos.find((r) => r.fila === b.fProt).texto, new RegExp(`^${SECCION_OBRAS}\\.${i + 1} · `))
  }
})

test('ningún rótulo excede el ancho declarado de la columna A: con CLIP, lo que no entra DESAPARECE', () => {
  const px = anchoColumnaA(g)
  for (const r of g.rotulos) {
    assert.ok(pxDeTexto(r.texto, { tam: 10, bold: true }) <= px,
      `"${r.texto}" (${pxDeTexto(r.texto, { tam: 10, bold: true })}px) no entra en ${px}px`)
  }
})

test('el ancho SALE de los datos: una obra con nombre más largo ensancha la columna sola', () => {
  const larga = { ...OBRAS_FUTURAS[0], clave: 'l', obra: 'UNA OBRA CON UN NOMBRE MUCHÍSIMO MÁS LARGO QUE TODAS' }
  assert.ok(anchoColumnaA(grillaObras({ obras: [...OBRAS_FUTURAS, larga] })) > anchoColumnaA(g))
})

// ─────────────────────────────────────────────────────────────────────────────
// LA FORMA DE LA GRILLA: ANCHO, ALTO, ESPECIES, LOCALE
// ─────────────────────────────────────────────────────────────────────────────

test('toda fila mide exactamente ANCHO_OBRAS y las vacías llevan el centinela', () => {
  for (const [i, f] of g.filas.entries()) {
    assert.equal(f.length, ANCHO_OBRAS, `fila ${i + 1}`)
    for (const [c, v] of f.entries()) {
      assert.ok(v !== '' && v !== null && v !== undefined, `${COLS[c]}${i + 1}: un vacío crudo conserva lo viejo`)
    }
  }
  assert.equal(ANCHOS_OBRAS.length, ANCHO_OBRAS, 'hay un ancho declarado por columna')
})

test('la cola de la columna y de la fila se limpian: sacarlas del código no las saca del archivo', () => {
  const con = conColaLimpiable(g.filas)
  assert.equal(con.length, ALTO_HISTORICO, 'la grilla se rellena hasta el alto histórico')
  for (const f of con) assert.equal(f.length, ANCHO_HISTORICO)
  for (const f of con.slice(g.filas.length)) {
    assert.deepEqual(f, Array.from({ length: ANCHO_HISTORICO }, () => VACIO), 'la cola es centinela puro')
  }
})

test('si la grilla supera el alto declarado, ROMPE: una cola silenciosa es peor que un aborto', () => {
  assert.throws(() => conColaLimpiable(Array.from({ length: ALTO_HISTORICO + 1 }, () => [])), /obras-grilla/)
})

test('la matriz de especies no tiene agujeros: un formato que nadie repone sobrevive para siempre', () => {
  assert.equal(g.especies.length, g.filas.length)
  for (const f of g.especies) assert.equal(f.length, ANCHO_OBRAS)
  // Y toda celda que publica plata declara una especie de plata: seis celdas de `Vencido` quedaron en
  // TEXTO una vez, dibujando `17449303,3143` crudo al lado de importes con formato.
  for (const [i, f] of g.filas.entries()) {
    for (const [c, v] of f.entries()) {
      if (typeof v !== 'string' || !v.startsWith('=SUMIFS')) continue
      assert.ok(ESPECIES_DE_PLATA.includes(g.especies[i][c]),
        `${COLS[c]}${i + 1}: publica un importe con especie "${g.especies[i][c]}"`)
    }
  }
})

test('las dos columnas de fecha declaran especie `fecha` cuando llevan un serial', () => {
  for (const b of g.bloques) {
    const o = OBRAS_FUTURAS.find((x) => x.clave === b.clave)
    for (const [c, campo] of [[1, 'inicio'], [2, 'fin']]) {
      assert.equal(g.especies[b.fProt - 1][c], o[campo] ? 'fecha' : 'texto',
        `${COLS[c]}${b.fProt}: un serial con formato de texto se dibuja 46239`)
    }
  }
})

test('ninguna coma SEPARA ARGUMENTOS: en es-AR el separador es `;` y una coma suelta es un decimal', () => {
  for (const [ref, f] of formulas(g)) {
    const sinTextos = f.replace(/"[^"]*"/g, '""')
    assert.ok(!/,/.test(sinTextos), `${ref}: lleva una coma fuera de un literal — ${f}`)
  }
})

test('TODA fórmula parsea: un paréntesis de más se publica como #ERROR! en la cara del dueño', () => {
  for (const [ref, f] of formulas(g)) assert.equal(problemaDeSintaxis(f), null, `${ref}: ${f}`)
})

test('el contador de sintaxis detecta de verdad: si no atrapa el caso real, no sirve de nada', () => {
  // El `#ERROR!` que se publicó en las 7 obras era un paréntesis de más en `proximoCobro`.
  assert.ok(problemaDeSintaxis('=IF(A1;MIN(B1);0))'))
  assert.ok(problemaDeSintaxis('=SUMIFS(A:A;B:B;"x"'))
  assert.equal(problemaDeSintaxis('=IF(A1;"a)";B1)'), null, 'un paréntesis dentro de un texto no cuenta')
})

test('el escáner de errores publicados encuentra los ocho, y no confunde un dato con un error', () => {
  const filas = ERRORES_SHEET.map((e) => [e])
  assert.equal(celdasEnError(filas).length, ERRORES_SHEET.length)
  assert.deepEqual(celdasEnError([['#N/A gasoil'], [0], [''], ['—']]), [], 'un dato que los contiene no es un error')
})

test('ninguna fórmula lleva una variable rota interpolada: undefined, null, NaN o $$', () => {
  for (const [ref, f] of formulas(g)) {
    for (const roto of ['undefined', 'null', 'NaN', '$$']) {
      assert.ok(!f.includes(roto), `${ref}: interpola "${roto}" — ${f}`)
    }
  }
})

test('una columna sin resolver NO construye la grilla: el `undefined` ya se publicó una vez', () => {
  const refs = { cob: { ...REFS_OBRAS.cob, total: undefined } }
  assert.throws(() => grillaObras({ obras: OBRAS_FUTURAS, refs }))
})

test('las columnas salen de las refs INYECTADAS: ninguna letra queda pegada en la fórmula', () => {
  const refs = { cob: { ...REFS_OBRAS.cob, total: 'ZZ' }, cmp: REFS_OBRAS.cmp }
  const otra = grillaObras({ obras: OBRAS_FUTURAS, refs })
  assert.ok(String(cel(otra, `E${otra.fAno}`)).includes('$ZZ$'), 'la columna inyectada se usa')
  assert.ok(!String(cel(otra, `E${otra.fAno}`)).includes(`$${REFS_OBRAS.cob.total}$`), 'y la de defecto no queda')
})

test('las fuentes se citan con rango ABIERTO desde su primera fila de datos', () => {
  // Un rango cerrado deja afuera la fila que se cargue mañana, sin dar error.
  for (const [ref, f] of formulas(g)) {
    for (const m of f.matchAll(/'Cobranzas'!\$([A-Z]+)\$(\d+):\$([A-Z]+)(\$?\d*)/g)) {
      assert.equal(m[4], '', `${ref}: el rango ${m[0]} está cerrado`)
      assert.equal(Number(m[2]), REFS_OBRAS.cob.desde, `${ref}: arranca en la fila de datos`)
    }
  }
})

test('NI UNA CELDA DE OBRAS LLEVA UN GLIFO QUE EL PDF NO DIBUJA', () => {
  // La verificación del Sheet se hace por PDF: un glifo que el PDF no dibuja es una marca que existe
  // en la celda y no en la pantalla del que verifica.
  const malos = glifosInvisibles(g.filas.flat().map((v) => (v === VACIO ? '' : String(v))).join(' '))
  assert.deepEqual(malos, [], `glifos invisibles: ${malos.join(' ')}`)
})

test('la pestaña no lleva prosa: el estándar del dueño es que el dato ES el diseño', () => {
  // Ninguna celda de la grilla puede ser una oración. El único texto largo permitido es el subtítulo
  // de la fila 2, que declara procedencia, y los rótulos de obra.
  for (const [i, f] of g.filas.entries()) {
    if (i === 1) continue
    for (const [c, v] of f.entries()) {
      if (typeof v !== 'string' || v.startsWith('=') || v === VACIO) continue
      assert.ok(v.length <= 60, `${COLS[c]}${i + 1} mide ${v.length}: "${v}"`)
    }
  }
})

test('el subtítulo declara PROCEDENCIA y el tipo de cambio, y no explica la pestaña', () => {
  const sub = String(g.filas[1][0])
  assert.ok(sub.startsWith('='), 'lleva la fecha y el TC vivos, no tipeados')
  assert.ok(sub.includes('TIPO_CAMBIO_USD'), 'el TC sale del rango con nombre de CAJA, no de una copia')
  const visible = sub.replace(/&?IFERROR\([^)]*\)[^&]*/g, '').match(/"([^"]*)"/g).join('').replace(/"/g, '')
  assert.ok(visible.length <= 120, `la fila 2 mide ${visible.length} caracteres: "${visible}"`)
})

test('serialISO da el serial que Sheets entiende, no un número parecido', () => {
  assert.equal(serialISO('1899-12-30'), 0, 'el origen del calendario de Sheets')
  assert.equal(serialISO('2026-01-01'), 46023)
  assert.equal(serialISO('2026-12-31'), 46387)
  assert.equal(serialISO(`${ANO}-01-01`) < serialISO(`${ANO}-12-31`), true)
})

test('CLIENTES_MUESTRA sirve para un test y NO para la pestaña: la lista viva sale del archivo', () => {
  // Si el generador cayera a la muestra en producción, la pestaña publicaría clientes de mentira sin
  // dar un solo error. El escritor aborta si no lee ni un cliente de Cobranzas.
  assert.ok(CLIENTES_MUESTRA.length > 0)
  for (const c of CLIENTES_MUESTRA) assert.equal(typeof c, 'string')
})
