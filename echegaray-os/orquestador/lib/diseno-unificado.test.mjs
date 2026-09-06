// LO QUE ESTOS TESTS PRUEBAN: que la regla del 05/09 —«sin aclaraciones ni explicaciones de nada»—
// PUEDE DAR ROJO, y que da rojo sobre los textos que hoy están de verdad en el archivo.
//
// Los casos no son inventados: salen de leer el Sheet real el 05/09/2026 con `readSheetValues`.
// Un test de minimalismo escrito con texto de laboratorio prueba el regex, no la pestaña.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXCLUIDAS, TOPE_SUBTITULO, esProsa, prosaEnGrilla, bloquesDe, numeracionRota,
  encabezadoRoto, auditarDiseno, enAlcance, partesDeTitulo,
} from './diseno-unificado.mjs'
import { glosasLargas } from './patron-pestana.mjs'
import { PASOS, esReporte } from './flujo-caja-pasos.mjs'

// ── LOS TEXTOS REALES, COPIADOS DEL ARCHIVO VIVO EL 05/09/2026 ──────────────────────────────────
/** Materiales!A47 — el párrafo que abre el bloque «RESPALDO FISCAL». 229 caracteres. */
const MATERIALES_A47 = 'Mide SÓLO lo que esta pestaña lista, comprobante por comprobante contra el libro de ARCA. '
  + 'No compara totales: ARCA no trae rubro, así que su total es el de TODAS las compras y no el de '
  + 'esta vista. Por fecha de FACTURA, no de caja.'
/** Materiales!A2 — la línea de procedencia, que dejó de declarar y se puso a explicar. */
const MATERIALES_A2 = 'En qué se va la plata: por familia de material y por mes, y la misma plata abierta por obra. '
  + 'Sale de la columna "Familia de material" de Compras, que el OS calcula con una sola definición.'
/** Materiales!A20 — un rótulo largo pero legítimo: nombra una familia, no argumenta. */
const ROTULO_LEGITIMO = 'Servicios de obra (baño, contenedor, agua)'
/** Proveedores!C160 — la glosa que vive FUERA de la columna de concepto. */
const PROVEEDORES_C160 = 'Es la misma línea del Cash Flow Mensual, con el mismo criterio de fecha de caja.'

test('el párrafo real de Materiales!A47 es prosa, y por largo', () => {
  const p = esProsa(MATERIALES_A47)
  assert.ok(p, 'A47 son 229 caracteres de explicación y el detector no la ve')
  assert.equal(p.clase, 'larga')
  assert.ok(p.largo > 200)
})

test('un rótulo largo de verdad NO es prosa: la regla no puede vaciar la columna de conceptos', () => {
  // Sin este test, subir el tope o el regex "para limpiar más" borraría los nombres de familia y
  // nadie lo notaría hasta ver la pestaña vacía. Un detector que marca todo no decide nada.
  assert.equal(esProsa(ROTULO_LEGITIMO), null)
  assert.equal(esProsa('TOTAL MATERIALES'), null)
  assert.equal(esProsa('SIN CLASIFICAR — falta describir qué se compró'), null)
})

test('una explicación CORTA también cae: el largo solo no alcanza', () => {
  // 56 caracteres — por debajo del tope. Es lo que el dueño mandó sacar y lo que la regla de largo
  // deja pasar entera. Si esta rama se rompe, el test de arriba sigue verde y la pestaña sigue mal.
  const corta = 'No compara totales porque ARCA no trae el rubro'
  assert.ok(corta.length < 60)
  const p = esProsa(corta)
  assert.ok(p, 'una explicación de 46 caracteres con «porque» tiene que caer igual')
  assert.equal(p.clase, 'argumenta')
})

test('la prosa escondida adentro de una fórmula se ve: el valor de una fórmula, en frío, es la fórmula', () => {
  const f = `=IF(A1>0;"${MATERIALES_A47}";"")`
  assert.ok(esProsa(f), 'un literal largo adentro de un IF es el mismo párrafo en la pantalla')
})

test('EL DEFECTO QUE ESTE MÓDULO EXISTE PARA ATRAPAR: la glosa fuera de la columna A', () => {
  // `glosasLargas` mira SÓLO la columna 0 por diseño. Las doce glosas de "Proveedores" están en la C.
  // Este test compara los dos controles sobre la MISMA grilla: si alguien "simplifica" `prosaEnGrilla`
  // volviéndola a una sola columna, acá se pone rojo.
  const grilla = [
    ['Proveedores'],
    ['Deuda por proveedor · Compras · al 05/09/2026'],
    [],
    ['4 · CONTROL'],
    ['Total', 1234, PROVEEDORES_C160],
  ]
  assert.deepEqual(glosasLargas(grilla), [], 'el control viejo no ve la columna C — es el punto')
  const hallada = prosaEnGrilla(grilla)
  assert.equal(hallada.length, 1)
  assert.equal(hallada[0].col, 'C')
  assert.equal(hallada[0].fila, 5)
})

test('la numeración de bloques con hueco se detecta, y una sub-sección no cuenta como bloque', () => {
  const grilla = [
    ['Estructura'], ['qué contesta · fuente · corte'], [],
    ['1 · UN BLOQUE'], ['Concepto', 'Monto'],
    ['2 · OTRO BLOQUE'],
    ['2.1 · UN RESPALDO'],
    ['5 · EL QUE SALTA'],
  ]
  assert.deepEqual(bloquesDe(grilla).map((b) => b.n), [1, 2, 5], 'la sub-sección 2.1 no es un bloque')
  const mal = numeracionRota(grilla)
  assert.equal(mal.length, 1)
  assert.equal(mal[0].n, 5)
  assert.equal(mal[0].fila, 8)
})

test('un renglón de datos que empieza con «1 · » no abre un bloque', () => {
  // Un título ocupa su fila solo. Sin esta condición, cada fila de detalle numerada se contaría como
  // sección y la numeración daría rota siempre — un control que siempre grita no se mira más.
  const grilla = [['x'], ['y'], [], ['1 · UN BLOQUE'], ['1 · una fila de detalle', 100]]
  assert.deepEqual(bloquesDe(grilla).map((b) => b.n), [1])
  assert.deepEqual(numeracionRota(grilla), [])
})

test('la línea de procedencia real de Materiales pasa el tope y se marca', () => {
  assert.ok(MATERIALES_A2.length > TOPE_SUBTITULO)
  const mal = encabezadoRoto([['Materiales'], [MATERIALES_A2], []], { pestana: 'Materiales' })
  assert.deepEqual(mal.map((x) => x.regla), ['procedencia-larga'])
})

test('un encabezado conforme no reporta nada', () => {
  const ok = encabezadoRoto([['Estructura'], ['Gasto fijo mensual · Compras · al 05/09/2026'], []], { pestana: 'Estructura' })
  assert.deepEqual(ok, [], 'el encabezado del contrato tiene que poder pasar: si no, la regla es inaplicable')
})

test('el encabezado detecta el título acompañado y la fila 3 ocupada', () => {
  const mal = encabezadoRoto([['Estructura', 'al 05/09'], ['Gasto fijo · Compras · 05/09/2026'], ['1 · ALGO']], { pestana: 'Estructura' })
  assert.deepEqual(mal.map((x) => x.regla).sort(), ['sin-respiro', 'titulo-acompanado'])
})

test('una tilde o una mayúscula en el nombre de la pestaña NO es un título distinto', () => {
  // Medido el 05/09: con igualdad literal, 8 de 9 `titulo-distinto` eran esto. Un control con 89% de
  // falsos positivos no se mira, y ahí adentro se pierde el único verdadero.
  const ok = (a1, p) => encabezadoRoto([[a1], ['x · y · z'], []], { pestana: p }).map((x) => x.regla)
  assert.deepEqual(ok('Tarjeta de crédito', 'Tarjeta de Credito'), [])
  assert.deepEqual(ok('Cargas sociales', 'Cargas Sociales'), [])
  assert.deepEqual(ok('Servicios recurrentes 2026', 'Recurrentes'), ['titulo-distinto'],
    'y el que SÍ es otro nombre tiene que seguir cayendo, o el ajuste apagó el control')
})

test('el título que se trae su glosa a cuestas es otra regla, porque el arreglo es otro', () => {
  // "OBRAS — EL AÑO ENTERO, OBRA POR OBRA" no es un nombre equivocado: es la línea de procedencia
  // escrita en la fila del título. Mezclarla con `titulo-distinto` manda a renombrar la pestaña.
  const mal = encabezadoRoto([['OBRAS — EL AÑO ENTERO, OBRA POR OBRA'], ['x · y · z'], []], { pestana: 'OBRAS' })
  assert.deepEqual(mal.map((x) => x.regla), ['titulo-con-glosa'])
  assert.match(mal[0].detalle, /EL AÑO ENTERO/)
})

test('las cinco pestañas que el dueño excluyó no se auditan, aunque estén llenas de prosa', () => {
  const sucia = [['CAJA'], [MATERIALES_A2], [MATERIALES_A47], ['9 · SALTA']]
  assert.deepEqual(auditarDiseno(sucia, { pestana: 'CAJA' }), [],
    'auditar una pestaña excluida es desobedecer una decisión del dueño con cara de control')
  assert.ok(auditarDiseno(sucia, { pestana: 'Materiales' }).length > 0,
    'y la misma grilla en una pestaña del alcance tiene que dar rojo — si no, el test de arriba no prueba nada')
})

test('la lista de excluidas son exactamente las cinco del dueño, cada una con su motivo', () => {
  assert.deepEqual(Object.keys(EXCLUIDAS).sort(),
    ['CAJA', 'Cheques Emitidos', 'Cheques Recibidos', 'Cobranzas', 'Compras'])
  for (const [p, motivo] of Object.entries(EXCLUIDAS)) {
    assert.ok(String(motivo).trim().length > 20, `la exclusión de "${p}" no dice por qué`)
  }
  assert.equal(enAlcance('Estructura'), true)
  assert.equal(enAlcance('Compras'), false)
})

test('el auditor del contrato corre en el macro agente, y como REPORTE', () => {
  // Una capacidad que no está en PASOS sólo se ejecuta si alguien tipea el comando: es el modo de
  // falla que ya congeló `_CRUCE_ARCA` y el espejo de JORNALES.
  const paso = PASOS.find(([s]) => s === 'auditar-diseno-unificado.mjs')
  assert.ok(paso, 'el auditor del contrato no está en PASOS: no lo corre nadie')
  assert.deepEqual(paso[2], [], 'no escribe ninguna pestaña: es un control, no un generador')
  assert.ok(esReporte('auditar-diseno-unificado.mjs'),
    'sin esto, un desvío de diseño pondría el servicio entero en rojo y frenaría la frescura del Cash Flow')
})


// ═══ UN TÍTULO PUEDE NOMBRAR SU BLOQUE; NO PUEDE ARGUMENTAR SOBRE ÉL (05/09/2026) ═══
//
// El detector marcaba QUINCE títulos de sección del archivo real como prosa o como explicación.
// Ninguno argumenta: nombran un bloque, y nombrar un bloque de esta empresa no entra en sesenta
// caracteres. Los textos de acá abajo son los que estaban en el Sheet ese día, con su largo medido.

test('partesDeTitulo corta por el guion LARGO, no por el que vive adentro del nombre del cliente', () => {
  const t = partesDeTitulo('3.7 · Quattropani - Melisa García SAS — SALÓN COMERCIAL · 18/08 → 30/10')
  assert.equal(t.nombre, '3.7 · Quattropani - Melisa García SAS',
    'el guion corto separa el cliente de su razón social: cortar ahí parte el nombre al medio')
  assert.equal(t.glosa, 'SALÓN COMERCIAL · 18/08 → 30/10')
  // Un título sin glosa es todo nombre, y una celda que no es título no se parte.
  assert.deepEqual(partesDeTitulo('6 · LO QUE HAY QUE CORREGIR EN COMPRAS'),
    { nombre: '6 · LO QUE HAY QUE CORREGIR EN COMPRAS', glosa: '' })
  assert.equal(partesDeTitulo('Persona'), null)
})

test('los títulos que sólo NOMBRAN dejan de ser hallazgo, aunque pasen los 60 caracteres', () => {
  for (const t of [
    '1 · DECLARADO EN LA DDJJ F931 — ¿CUÁNTO GENERÓ LA NÓMINA CADA MES?',
    '7 · PLANES DE PAGO DE DEUDA PREVISIONAL — LAS CUOTAS, MES POR MES',
    '1 · IVA — LA DDJJ OFICIAL (F.2051): QUÉ SE DEBE O SE TIENE A FAVOR',
    '4 · OTROS IMPUESTOS — ¿QUÉ MÁS SE PAGA Y NO ESTABA A LA VISTA?',
    '6 · DEUDA FINANCIERA — CUÁNTO SE VA POR MES Y CUÁNTO FALTA PAGAR',
    '7 · SUPUESTOS Y HUECOS — LO QUE ESTE CUADRO ASUME, Y LO QUE NO SABE',
    '3.7 · Quattropani - Melisa García SAS — SALÓN COMERCIAL · 18/08 → 30/10',
    // 38 caracteres, y caía por «hay que»: el conector adentro de un NOMBRE no es un argumento.
    '6 · LO QUE HAY QUE CORREGIR EN COMPRAS',
  ]) {
    assert.equal(esProsa(t), null, `«${t}» nombra su bloque y se estaba reportando como explicación`)
    assert.ok(t.length > 37, 'el caso perdería sentido si el texto fuera corto')
  }
})

test('el título que ARGUMENTA sigue cayendo, y se llama por su nombre', () => {
  // El que de verdad explica: la glosa le dice al lector qué pensar del bloque.
  const p = esProsa('6 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer')
  assert.equal(p.clase, 'argumenta')
  assert.equal(p.sobre, 'glosa')
  assert.equal(p.texto, 'la plomería, no es para leer', 'el hallazgo tiene que mostrar lo que midió, no el renglón entero')
  const h = auditarDiseno([['Proveedores'], ['x'], [], ['6 · LO QUE ARCA REGISTRÓ — la plomería, no es para leer']], { pestana: 'Proveedores' })
  assert.ok(h.some((x) => x.regla === 'titulo-argumenta'), 'un título que argumenta se recorta; una glosa suelta se borra: no es el mismo arreglo')
})

test('la glosa larga del título sigue siendo un hallazgo: el tope no se relajó, se movió de sujeto', () => {
  // 95 caracteres en el archivo real, y su glosa sola pasa los 60.
  const p = esProsa('5 · MATERIALES PREVISTOS — el plan, ítem por ítem (fuera del calendario, que ya cuenta lo pedido)')
  assert.equal(p.clase, 'larga')
  assert.equal(p.sobre, 'glosa')
})

test('un NOMBRE que no entra en el tope dejó de nombrar: la exención no es un agujero', () => {
  const largo = `1 · ${'X'.repeat(80)}`
  const p = esProsa(largo)
  assert.equal(p.sobre, 'nombre')
  assert.equal(p.largo, 84)
  const h = auditarDiseno([['Nómina'], ['x'], [], [largo]], { pestana: 'Nómina' })
  assert.ok(h.some((x) => x.regla === 'titulo-largo'), `no cayó por largo: ${h.map((x) => x.regla).join(', ')}`)
})

// ═══ EL TÍTULO DE UN BLOQUE PUEDE SER UNA FÓRMULA, Y EL CONTROL TIENE QUE VERLO IGUAL ═══
//
// Caso real de «OBRAS», 06/09/2026: el bloque 1 lleva la fecha de corte adentro del título, así que
// se escribe con fórmula. Leído crudo empieza con `=` y no matchea `ES_SECCION_NUM`: el bloque
// desaparecía de la cuenta y los cuatro que seguían quedaban corridos un lugar. El auditor informaba
// cuatro huecos de numeración sobre una pestaña numerada 1,2,3,4,5 sin un solo hueco — y un control
// con cuatro falsos de cuatro deja de mirarse.
test('un título de bloque escrito con fórmula cuenta como bloque', () => {
  const filas = [
    ['OBRAS'], ['qué contesta · fuente · corte'], [],
    ['="1 · COBRANZAS PENDIENTES AL "&TEXT(TODAY();"dd/mm/yyyy")'],
    ['2 · OBRAS DEL AÑO'],
  ]
  assert.deepEqual(bloquesDe(filas).map((b) => b.n), [1, 2])
  assert.deepEqual(numeracionRota(filas), [])
})

test('y con el título en fórmula la pestaña no se llama distinto de su A1', () => {
  const filas = [['="OBRAS al "&TEXT(TODAY();"dd/mm")'], ['qué contesta · fuente · corte'], []]
  assert.deepEqual(encabezadoRoto(filas, { pestana: 'OBRAS' }).map((x) => x.regla), ['titulo-con-glosa'])
})
