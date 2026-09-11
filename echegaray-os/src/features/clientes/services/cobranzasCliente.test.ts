// LAS REGLAS DE LA SOLAPA COBRANZAS, PROBADAS SOBRE LAS FILAS REALES DEL SHEET.
//
// Lo que estos casos impiden: que un total no cuadre con las filas que tiene debajo, que una fila
// anulada se sume, que el recorte esconda plata sin decirlo, y que las filas que la imputación no
// pudo atar a una obra desaparezcan de la pantalla — que es como el dueño perdería $47,6 M de vista
// sin que nada se ponga rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparCobranzas, comprobanteDe, COLUMNA_INEXISTENTE, esRenglonDeIva, estadoDe, getCobranzasDelCliente,
  ordenarPorCobro, ordenDeLaFila,
  filasSinImporte, partirEnSecciones, proximoCobro, recortar, seccionDe, totalDeFilas,
  totalesDeCobranzas,
  totalPorCircuito, vencidoDeFilas, type FilaCobranza,
} from './cobranzasCliente.ts'
import { COBRANZAS_MESSINA, COBRANZAS_QUATTROPANI } from './cobranzasReales.fixture.ts'

const OBRAS_MESSINA = [
  { obra_id: 'messina-bsa', nombre: 'ME - BSA' },
  { obra_id: 'messina-playon-azufre', nombre: 'ME - PLAYÓN DE AZUFRE' },
  { obra_id: 'messina-pisos-120-rampa', nombre: 'ME - PISOS 120 M² Y RAMPA' },
  { obra_id: 'messina-adicional-tercer-muro', nombre: 'ME - ADICIONAL TERCER MURO' },
  { obra_id: 'messina-playon-dilucion-acido', nombre: 'ME - PLAYÓN DILUCIÓN' },
]

test('el fixture es la pestaña: 24 filas de Messina y 14 de Quattropani', () => {
  // Si el archivo se regenera y cambia de tamaño, esto avisa. No es un dato clavado: es la prueba
  // de que los casos de abajo corren sobre la pestaña entera y no sobre un recorte.
  assert.equal(COBRANZAS_MESSINA.length, 24)
  assert.equal(COBRANZAS_QUATTROPANI.length, 14)
})

test('el total del cliente es la suma de los totales de sus grupos, siempre', () => {
  // ES LA REGLA QUE HACE AUDITABLE LA PANTALLA: la cabecera no puede decir un número y los grupos
  // otro. Si una fila se cae de todos los grupos, esta cuenta se rompe.
  for (const filas of [COBRANZAS_MESSINA, COBRANZAS_QUATTROPANI]) {
    const grupos = agruparCobranzas(filas, OBRAS_MESSINA)
    const total = totalesDeCobranzas(filas)
    const sumaDeGrupos = (campo: 'facturado' | 'cobrado' | 'pendiente' | 'vencido') =>
      grupos.reduce((a, g) => a + (g.totales[campo] ?? 0), 0)
    for (const campo of ['facturado', 'cobrado', 'pendiente', 'vencido'] as const) {
      assert.equal(
        Math.round(sumaDeGrupos(campo)), Math.round(total[campo] ?? 0),
        `«${campo}» del cliente no cuadra con la suma de sus grupos`,
      )
    }
    assert.equal(grupos.reduce((a, g) => a + g.filas.length, 0), filas.length,
      'alguna fila no entró en ningún grupo: la pantalla la perdería sin decirlo')
  }
})

test('las filas que ningún papel ató a una obra van a un grupo propio, y al final', () => {
  const grupos = agruparCobranzas(COBRANZAS_MESSINA, OBRAS_MESSINA)
  const sueltas = grupos.filter((g) => g.obra_id === null)
  assert.equal(sueltas.length, 1, 'hay un solo grupo de sueltas, o ninguno')
  if (sueltas.length) {
    assert.equal(grupos[grupos.length - 1].obra_id, null, 'el grupo sin obra va último')
    assert.ok(sueltas[0].filas.length > 0)
  }
})

test('una fila anulada se ve pero no se cuenta, y se dice cuántas son', () => {
  const anulada: FilaCobranza = {
    ...COBRANZAS_MESSINA[0], cobranza_id: 'x', esta_cancelada: true, esta_cobrada: false,
    estado: 'CANCELAR', total_bruto: 999_999_999, categoria: 'B',
  }
  const conAnulada = [...COBRANZAS_MESSINA, anulada]
  const antes = totalesDeCobranzas(COBRANZAS_MESSINA)
  const despues = totalesDeCobranzas(conAnulada)
  assert.equal(despues.facturado, antes.facturado, 'la anulada engordó el facturado')
  assert.equal(despues.pendiente, antes.pendiente)
  assert.equal(despues.anuladas, 1, 'sin este número, una fila que no cuenta desaparece en silencio')
  assert.equal(despues.filas, antes.filas)
  // Y SIGUE APARECIENDO en el recorte «Todo»: esconderla es cómo un total deja de cuadrar contra el
  // Sheet sin que nadie sepa por qué.
  assert.equal(recortar(conAnulada, 'todo').length, conAnulada.length)
  assert.equal(estadoDe(anulada), 'anulado')
})

test('el facturado suma las filas B y ninguna N: son dos universos', () => {
  // «Lo que se factura es Cobranzas B» (decisión del dueño). Una fila N no tiene comprobante y
  // sumarla al facturado inventaría IVA que no existe.
  const total = totalesDeCobranzas(COBRANZAS_MESSINA)
  const soloB = COBRANZAS_MESSINA
    .filter((f) => f.categoria === 'B' && !f.esta_cancelada)
    .reduce((a, f) => a + (f.total_bruto ?? 0), 0)
  assert.equal(Math.round(total.facturado ?? 0), Math.round(soloB))
  const conN = COBRANZAS_MESSINA.some((f) => f.categoria === 'N')
  assert.ok(conN, 'el fixture tiene que tener filas N, si no este caso no prueba nada')
})

test('lo cobrado es percibido y lo pendiente es lo que falta: nunca se pisan', () => {
  for (const filas of [COBRANZAS_MESSINA, COBRANZAS_QUATTROPANI]) {
    const t = totalesDeCobranzas(filas)
    const vivas = filas.filter((f) => !f.esta_cancelada)
    const suma = vivas.reduce((a, f) => a + (f.total_bruto ?? 0), 0)
    assert.equal(
      Math.round((t.cobrado ?? 0) + (t.pendiente ?? 0)), Math.round(suma),
      'cobrado + pendiente tiene que dar el total vivo: si no, hay filas contadas dos veces o ninguna',
    )
    // Y lo vencido es un SUBCONJUNTO de lo pendiente, nunca un quinto total suelto.
    assert.ok((t.vencido ?? 0) <= (t.pendiente ?? 0))
  }
})

test('el próximo cobro suma TODAS las filas de ese día, no la primera', () => {
  // San Francisco cobra tres cuotas el 18/09: publicar una diría que ese día entra un tercio.
  const dia = '2026-09-30'
  const base = COBRANZAS_MESSINA[0]
  const dos: FilaCobranza[] = [
    { ...base, cobranza_id: 'a', esta_cobrada: false, esta_cancelada: false, fecha_cobro: dia, total_bruto: 100, forma_cobro: 'Transferencia' },
    { ...base, cobranza_id: 'b', esta_cobrada: false, esta_cancelada: false, fecha_cobro: dia, total_bruto: 50, forma_cobro: 'Transferencia' },
    { ...base, cobranza_id: 'c', esta_cobrada: false, esta_cancelada: false, fecha_cobro: '2026-12-01', total_bruto: 999, forma_cobro: 'Efectivo' },
  ]
  assert.deepEqual(proximoCobro(dos), { fecha: dia, medio: 'Transferencia', importe: 150 })
})

test('sin ninguna fila pendiente no se inventa un próximo cobro', () => {
  const cobradas = COBRANZAS_MESSINA.map((f) => ({ ...f, esta_cobrada: true }))
  assert.equal(proximoCobro(cobradas), null)
})

test('los recortes no inventan filas ni las pierden', () => {
  const filas = COBRANZAS_MESSINA
  assert.equal(recortar(filas, 'todo').length, filas.length)
  const pendiente = recortar(filas, 'pendiente')
  const cobrado = recortar(filas, 'cobrado')
  const anuladas = filas.filter((f) => f.esta_cancelada).length
  assert.equal(pendiente.length + cobrado.length + anuladas, filas.length,
    'pendiente + cobrado + anuladas tiene que ser el total: un recorte no puede duplicar una fila')
  assert.equal(recortar(filas, 'b').length + recortar(filas, 'n').length, filas.length)
})

test('el comprobante se escribe como se lee, y una fila sin comprobante no lo inventa', () => {
  assert.equal(comprobanteDe({ ...COBRANZAS_MESSINA[0], factura: 'FA', numero_comprobante: '230' }), 'FA 230')
  assert.equal(comprobanteDe({ ...COBRANZAS_MESSINA[0], factura: null, numero_comprobante: null }), null)
})

test('el estado de una fila es UNO, y el peor manda', () => {
  const base = COBRANZAS_MESSINA[0]
  assert.equal(estadoDe({ ...base, esta_cobrada: true, esta_vencida: false, esta_cancelada: false }), 'cobrado')
  assert.equal(estadoDe({ ...base, esta_cobrada: false, esta_vencida: true, esta_cancelada: false }), 'vencido')
  assert.equal(estadoDe({ ...base, esta_cobrada: false, esta_vencida: false, esta_cancelada: false }), 'pendiente')
  // Una fila anulada NO puede leerse como cobrada aunque la réplica traiga la marca puesta.
  assert.equal(estadoDe({ ...base, esta_cobrada: true, esta_cancelada: true }), 'anulado')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL REDISEÑO DEL 11/09/2026 — las reglas que hacen que la pantalla se pueda entender
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('las tres secciones parten la pestaña: ninguna fila se duplica ni se pierde', () => {
  for (const filas of [COBRANZAS_MESSINA, COBRANZAS_QUATTROPANI]) {
    const s = partirEnSecciones(filas)
    assert.equal(s.porCobrar.length + s.cobrado.length + s.anuladas.length, filas.length)
    const ids = new Set([...s.porCobrar, ...s.cobrado, ...s.anuladas].map((f) => f.cobranza_id))
    assert.equal(ids.size, filas.length, 'una fila cayó en dos secciones')
  }
})

test('una fila anulada nunca entra en «cobrado», aunque la réplica la traiga cobrada', () => {
  const f: FilaCobranza = { ...COBRANZAS_MESSINA[0], esta_cancelada: true, esta_cobrada: true }
  assert.equal(seccionDe(f), 'anulada')
  assert.equal(partirEnSecciones([f]).cobrado.length, 0)
})

test('EL TOTAL DE UN BLOQUE ES LA SUMA DE SUS RENGLONES VISIBLES — el defecto que el dueño marcó', () => {
  // «facturado $78,0 M» arriba de renglones que sumaban $114,9 M. Pasaba porque el encabezado
  // mezclaba denominadores. Ahora el total de una sección es, por construcción, `totalDeFilas`.
  for (const filas of [COBRANZAS_MESSINA, COBRANZAS_QUATTROPANI]) {
    const s = partirEnSecciones(filas)
    const t = totalesDeCobranzas(filas)
    assert.equal(Math.round(totalDeFilas(s.porCobrar) ?? 0), Math.round(t.pendiente ?? 0))
    assert.equal(Math.round(totalDeFilas(s.cobrado) ?? 0), Math.round(t.cobrado ?? 0))
    // Y los dos circuitos de un bloque suman el bloque entero: B + N = total, sin resto.
    for (const bloque of [s.porCobrar, s.cobrado]) {
      const { b, n } = totalPorCircuito(bloque)
      assert.equal(Math.round((b ?? 0) + (n ?? 0)), Math.round(totalDeFilas(bloque) ?? 0))
    }
    // Lo vencido vive dentro de lo que falta cobrar y en ningún otro lado.
    assert.equal(Math.round(vencidoDeFilas(s.porCobrar) ?? 0), Math.round(t.vencido ?? 0))
    assert.equal(vencidoDeFilas(s.cobrado), null, 'una fila cobrada no puede estar vencida')
  }
})

test('un bloque sin ninguna fila que aporte da null, nunca cero', () => {
  assert.equal(totalDeFilas([]), null)
  assert.deepEqual(totalPorCircuito([]), { b: null, n: null })
  assert.equal(vencidoDeFilas([]), null)
})

test('la agenda ordena por fecha de cobro y deja sin fecha al final en los dos sentidos', () => {
  const base = COBRANZAS_MESSINA[0]
  const filas: FilaCobranza[] = [
    { ...base, cobranza_id: 'c', fecha_cobro: '2026-10-09' },
    { ...base, cobranza_id: 'sin', fecha_cobro: null },
    { ...base, cobranza_id: 'a', fecha_cobro: '2026-09-22' },
  ]
  assert.deepEqual(ordenarPorCobro(filas, 'asc').map((f) => f.cobranza_id), ['a', 'c', 'sin'])
  assert.deepEqual(ordenarPorCobro(filas, 'desc').map((f) => f.cobranza_id), ['c', 'a', 'sin'])
  // Y no muta el arreglo que recibe: la lista de la pantalla se dibuja dos veces por sección.
  assert.equal(filas[0].cobranza_id, 'c')
})

test('la columna ORDEN DE COMPRA se parte en número y condición comercial', () => {
  assert.deepEqual(ordenDeLaFila('00002-00000279'), { oc: '279', condicion: null })
  assert.deepEqual(ordenDeLaFila('00002-00002226 · cta. cte. 15 días'),
    { oc: '2226', condicion: 'cta. cte. 15 días' })
  assert.deepEqual(
    ordenDeLaFila('Resto 50% s/ total 65.000.000 — certificación quincenal 1/2 · OC 00002-00002173'),
    { oc: '2173', condicion: 'Resto 50% s/ total 65.000.000 — certificación quincenal 1/2' },
  )
  // SIN NÚMERO: el texto entero es la condición y NO se tira. «Cargar OC» es trabajo pendiente.
  assert.deepEqual(ordenDeLaFila('Anticipo inicio de obra 50% Negro. Cargar OC'),
    { oc: null, condicion: 'Anticipo inicio de obra 50% Negro. Cargar OC' })
  assert.deepEqual(
    ordenDeLaFila('Resto 50% s/ contrato U$S 63.000 + IVA — certificación quincenal 1/9 -  ($1503,6*USD3500)'),
    { oc: null, condicion: 'Resto 50% s/ contrato U$S 63.000 + IVA — certificación quincenal 1/9 - ($1503,6*USD3500)' },
  )
  assert.deepEqual(ordenDeLaFila(null), { oc: null, condicion: null })
  assert.deepEqual(ordenDeLaFila('   '), { oc: null, condicion: null })
})

test('cada fila real del fixture conserva su información: o número, o condición, o las dos', () => {
  // LA REGLA QUE IMPIDE QUE EL PARSER SE COMA UN DATO: ningún campo no vacío puede quedar en nada.
  for (const f of [...COBRANZAS_MESSINA, ...COBRANZAS_QUATTROPANI]) {
    const crudo = (f.orden_compra ?? '').trim()
    if (!crudo) continue
    const { oc, condicion } = ordenDeLaFila(crudo)
    assert.ok(oc || condicion, `«${crudo}» se perdió entera`)
  }
})

test('NINGÚN NÚMERO SE DECLARA «OC» SIN QUE EL CAMPO LO DIGA', () => {
  // Los tres casos que el auditor le sacó al parser anterior (11/09/2026). Cada uno inventaba una
  // orden de compra que no existe —regla de oro 1— y además se comía el token del renglón.
  for (const crudo of ['Cert. 09-2026 a facturar', 'Segun Factura 0001-00000230', 'A cuenta 1-0000']) {
    assert.deepEqual(ordenDeLaFila(crudo), { oc: null, condicion: crudo },
      `«${crudo}» no tiene ninguna OC: el parser la fabricó`)
  }
  // Y lo que SÍ es una OC sigue reconociéndose por las tres formas legítimas.
  assert.equal(ordenDeLaFila('00002-00002173').oc, '2173', 'el campo que ES el número')
  assert.equal(ordenDeLaFila('00002-00002226 · cta. cte. 15 días').oc, '2226', 'el número y su condición')
  assert.equal(ordenDeLaFila('Anticipo… OC 00002-00002173 (11/08/2026)').oc, '2173', 'marcada con OC')
  assert.equal(ordenDeLaFila('OC 2162').oc, '2162', 'marcada con OC, en su forma corta')
  // «Cargar OC» es trabajo pendiente, no una orden: no hay número y no se inventa ninguno.
  assert.equal(ordenDeLaFila('Playon de Azufre. Cargar OC').oc, null)
})

test('el próximo cobro NO elige un medio cuando el día mezcla dos', () => {
  // Messina cobra el 22/09 $19.662.500 por transferencia y $9.400.000 en efectivo: decir
  // «$29.062.500 por transferencia» es falso por $9,4 M.
  const base = { ...COBRANZAS_MESSINA[0], esta_cobrada: false, esta_cancelada: false }
  const mezcla: FilaCobranza[] = [
    { ...base, cobranza_id: 'a', fecha_cobro: '2026-09-22', total_bruto: 19_662_500, forma_cobro: 'Transferencia' },
    { ...base, cobranza_id: 'b', fecha_cobro: '2026-09-22', total_bruto: 9_400_000, forma_cobro: 'Efectivo' },
  ]
  assert.deepEqual(proximoCobro(mezcla), { fecha: '2026-09-22', medio: null, importe: 29_062_500 })
  // Con un solo medio en el día, se dice.
  const uno = mezcla.map((f) => ({ ...f, forma_cobro: 'Transferencia' }))
  assert.equal(proximoCobro(uno)?.medio, 'Transferencia')
})

test('una fila sin importe se cuenta aparte: el total no puede callar que la dejó afuera', () => {
  const base = COBRANZAS_MESSINA[0]
  const filas: FilaCobranza[] = [
    { ...base, cobranza_id: 'a', total_bruto: 100 },
    { ...base, cobranza_id: 'b', total_bruto: null },
  ]
  assert.equal(totalDeFilas(filas), 100)
  assert.equal(filasSinImporte(filas), 1)
  assert.equal(filasSinImporte([{ ...base, total_bruto: 5 }]), 0)
})

test('un renglón que es el IVA de otra factura se reconoce, y una venta no', () => {
  assert.ok(esRenglonDeIva('IVA de Factura 220'))
  assert.ok(esRenglonDeIva('IVA de FC A 0001-00000230 (cert. avance USD 3.500)'))
  assert.ok(!esRenglonDeIva('Salón Comercial - Certificación 2/9'))
  assert.ok(!esRenglonDeIva('IVA'))
  assert.ok(!esRenglonDeIva(null))
})

// ═══ LA LECTURA NO SE CAE POR UNA COLUMNA QUE TODAVÍA NO EXISTE ═══

/** Un `supabase` de mentira que responde distinto según las columnas que le pidan. */
function supabaseFalso(respuestas: { columnas: string; resultado: unknown }[]) {
  const pedidos: string[] = []
  const cliente = {
    from() { return cliente },
    select(columnas: string) { pedidos.push(columnas); return cliente },
    eq() { return cliente },
    order() {
      const pedida = pedidos[pedidos.length - 1]
      const r = respuestas.find((x) => pedida.includes(x.columnas))
      return Promise.resolve(r ? r.resultado : { data: null, error: { code: 'otro' } })
    },
  }
  return { cliente, pedidos }
}

test('si la vista no tiene las columnas del respaldo, se reintenta sin ellas', async () => {
  // Medido el 11/09/2026: con la migración 20260911T0920 sin aplicar, la solapa entera de un
  // cliente con 24 cobranzas se dibujaba como «no pude leer las cobranzas».
  const fila = { ...COBRANZAS_MESSINA[0] }
  const { cliente, pedidos } = supabaseFalso([
    { columnas: 'respaldo_drive_id', resultado: { data: null, error: { code: COLUMNA_INEXISTENTE } } },
    { columnas: 'forma_cobro', resultado: { data: [fila], error: null } },
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = await getCobranzasDelCliente(cliente as any, 'messina')
  assert.equal(filas?.length, 1)
  assert.equal(pedidos.length, 2, 'tiene que haber reintentado exactamente una vez')
  assert.ok(!pedidos[1].includes('respaldo_drive_id'))
})

test('un fallo que NO es una columna faltante sigue devolviendo null, no una lista vacía', () => {
  const { cliente } = supabaseFalso([
    { columnas: 'cobranza_id', resultado: { data: null, error: { code: '42501' } } },
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getCobranzasDelCliente(cliente as any, 'messina').then((r) => assert.equal(r, null))
})
