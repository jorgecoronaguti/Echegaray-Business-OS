// LA LÍNEA DE TIEMPO DEL CLIENTE — el único lugar donde se puede inventar historia sin que nadie
// se dé cuenta.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// La solapa Actividad muestra hechos con fecha. Los cuatro modos de falla que la vuelven una mentira
// prolija —y que ninguna otra cosa detecta, porque el resultado SIEMPRE se ve bien— son:
//
//   1. Inventar un evento que no pasó. El caso concreto y real: las cuatro filas de `clientes`
//      creadas en la fundación tienen `updated_at` distinto de `created_at` porque una MIGRACIÓN las
//      tocó. Si el criterio fuera "hay updated_at → hubo edición", un cliente que nadie editó nunca
//      mostraría una edición. Y al revés: un cliente creado hoy tiene los dos timestamps IGUALES, y
//      un criterio ingenuo le pondría "creado" y "editado" el mismo día.
//   2. Ubicar un registro sin fecha. Un contacto sin `creado_en` puesto al principio o al final de la
//      lista es una fecha inventada por posición.
//   3. Perder un registro sin fecha EN SILENCIO. Descartarlo está bien; no contarlo, no.
//   4. Ordenar mal al mezclar los dos tipos de fecha que tiene la base. `fecha_certificacion` es un
//      `date` ('2026-08-18') y `creado_en` un `timestamptz`. El atajo para poder compararlos —cortar
//      todo al día— empata los seis hechos de una misma jornada, y ahí la lista pasa a estar
//      ordenada por el desempate (el nombre del archivo), no por lo que pasó primero.
//
// Se importa el .ts DE VERDAD (Node 24 saca los tipos solo). Una copia probaría la copia.
import test from 'node:test'
import assert from 'node:assert/strict'
import { construirLineaDeTiempo } from '../../src/features/clientes/services/timeline.ts'

/** Las fuentes vacías. Cada caso llena SÓLO lo que está probando. */
const vacio = (extra = {}) => ({
  cliente: { nombre: 'ARCOR', creado_en: null, actualizado_en: null },
  contactos: [],
  obras: [],
  documentos: [],
  certificados: [],
  ...extra,
})

const claves = (r) => r.eventos.map((e) => e.clave)

test('sin ninguna fuente con fecha no inventa un solo evento', () => {
  const r = construirLineaDeTiempo(vacio())
  assert.deepEqual(r.eventos, [])
  assert.equal(r.sinFecha, 1, 'el alta sin fecha se descarta Y se cuenta')
})

test('un cliente creado y nunca editado NO muestra una edición', () => {
  // Los dos timestamps iguales es exactamente lo que deja el alta por pantalla.
  const t = '2026-08-19T14:00:00.000Z'
  const r = construirLineaDeTiempo(vacio({ cliente: { nombre: 'X', creado_en: t, actualizado_en: t } }))
  assert.deepEqual(claves(r), ['cliente-alta'])
})

test('un cliente cuya ficha cambió después del alta SÍ lo muestra, y arriba', () => {
  const r = construirLineaDeTiempo(vacio({
    cliente: { nombre: 'ARCOR', creado_en: '2026-07-08T00:11:59.641Z', actualizado_en: '2026-08-17T23:37:18.951Z' },
  }))
  assert.deepEqual(claves(r), ['cliente-editado', 'cliente-alta'], 'lo más reciente arriba')
  assert.equal(r.eventos[0].titulo, 'Última modificación de la ficha')
  assert.equal(r.sinFecha, 0)
})

test('una ficha con `actualizado_en` ANTERIOR al alta no genera evento de edición', () => {
  // No debería pasar nunca, y si pasa es un dato roto: lo que no se puede hacer es dibujar una
  // edición ocurrida antes de que el cliente existiera.
  const r = construirLineaDeTiempo(vacio({
    cliente: { nombre: 'X', creado_en: '2026-08-19T10:00:00Z', actualizado_en: '2026-01-01T10:00:00Z' },
  }))
  assert.deepEqual(claves(r), ['cliente-alta'])
})

test('un contacto SIN fecha no aparece, y queda contado', () => {
  const r = construirLineaDeTiempo(vacio({
    contactos: [
      { id: 'a', nombre: 'Con fecha', rol: 'compras', creado_en: '2026-08-10T12:00:00Z' },
      { id: 'b', nombre: 'Sin fecha', rol: null, creado_en: null },
    ],
  }))
  assert.deepEqual(claves(r), ['contacto-a'])
  assert.equal(r.sinFecha, 2, 'el contacto sin fecha + el alta del cliente sin fecha')
  assert.ok(!JSON.stringify(r.eventos).includes('Sin fecha'), 'no se cuela por ningún lado')
})

test('una fecha ilegible se descarta igual que una ausente', () => {
  const r = construirLineaDeTiempo(vacio({
    contactos: [{ id: 'a', nombre: 'Roto', rol: null, creado_en: 'ayer a la tarde' }],
  }))
  assert.deepEqual(r.eventos, [])
  assert.equal(r.sinFecha, 2)
})

test('la obra aporta alta, arranque y fin REALES — y nunca los planificados', () => {
  const r = construirLineaDeTiempo(vacio({
    obras: [{
      obra_id: 'le-comedor', nombre: 'Comedor',
      creada_en: '2026-08-17T21:25:14.704Z',
      fecha_inicio_real: '2026-08-18', fecha_fin_real: null,
    }],
  }))
  assert.deepEqual(claves(r), ['obra-inicio-le-comedor', 'obra-alta-le-comedor'])
  assert.equal(r.eventos[0].href, '/obras/le-comedor', 'el evento lleva a la obra')
})

test('certificar, facturar y cobrar son TRES eventos con sus tres fechas', () => {
  const r = construirLineaDeTiempo(vacio({
    certificados: [{
      id: 'c1', numero: '3', obra_id: 'arcor', obra_nombre: 'ARCOR',
      fecha_certificacion: '2026-06-30', monto_certificado: 4500000,
      fecha_facturacion: '2026-07-05', monto_facturado: 4500000,
      fecha_cobranza: '2026-08-12', monto_cobrado: 4500000,
    }],
  }))
  assert.deepEqual(claves(r), ['cobro-c1', 'fact-c1', 'cert-c1'])
  // El importe viaja como NÚMERO: formatearlo acá lo volvería insumable para cualquier otra cosa.
  assert.equal(r.eventos[0].monto, 4500000)
  assert.equal(r.eventos[2].titulo, 'Certificación N° 3 · ARCOR')
})

test('un certificado emitido y todavía sin facturar aporta UN evento, no tres vacíos', () => {
  const r = construirLineaDeTiempo(vacio({
    certificados: [{
      id: 'c2', numero: '1', obra_id: 'arcor', obra_nombre: 'ARCOR',
      fecha_certificacion: '2026-08-01', monto_certificado: 1000,
      fecha_facturacion: null, monto_facturado: null,
      fecha_cobranza: null, monto_cobrado: null,
    }],
  }))
  assert.deepEqual(claves(r), ['cert-c2'])
  assert.equal(r.sinFecha, 1, 'sólo el alta del cliente; lo no facturado NO es un dato faltante')
})

test('dos hechos del MISMO día conservan el orden de la hora', () => {
  // LA TRAMPA: truncar la fecha al día para poder mezclar `date` con `timestamptz` empata todo lo
  // que pasó en la misma jornada, y el desempate por clave pone el documento «a» arriba del «b»
  // aunque «b» sea de seis horas después. En un día de carga —que es cuando alguien mira esto— la
  // lista queda ordenada por nombre de archivo y parece que no pasó nada en orden.
  const r = construirLineaDeTiempo(vacio({
    // VINCULADOS A MANO: no se agrupan, porque cada uno es una decisión de una persona.
    documentos: [
      { drive_file_id: 'a-primero', name: 'Acta', rol: null, origen: 'manual', creado_en: '2026-08-18T09:00:00.000Z' },
      { drive_file_id: 'z-despues', name: 'Contrato', rol: null, origen: 'manual', creado_en: '2026-08-18T15:00:00.000Z' },
    ],
  }))
  assert.deepEqual(claves(r), ['doc-z-despues', 'doc-a-primero'])
})

test('un `date` de Postgres se ubica al principio de su día, no en el anterior', () => {
  // `fecha_certificacion` es un `date` ('2026-08-18') y `creado_en` un `timestamptz`. Mezclarlos con
  // un parseo que los interprete en horario local corre el `date` al día anterior a las 21:00.
  const r = construirLineaDeTiempo(vacio({
    documentos: [{ drive_file_id: 'd1', name: 'Plano', rol: null, origen: 'manual', creado_en: '2026-08-17T22:00:00.000Z' }],
    certificados: [{
      id: 'c1', numero: '1', obra_id: null, obra_nombre: 'ARCOR',
      fecha_certificacion: '2026-08-18', monto_certificado: 1,
      fecha_facturacion: null, monto_facturado: null, fecha_cobranza: null, monto_cobrado: null,
    }],
  }))
  assert.deepEqual(claves(r), ['cert-c1', 'doc-d1'], 'la certificación del 18 va arriba del documento del 17')
})

test('dos hechos del mismo instante salen SIEMPRE en el mismo orden', () => {
  const t = '2026-08-18T10:00:00Z'
  const armar = (ids) => construirLineaDeTiempo(vacio({
    contactos: ids.map((id) => ({ id, nombre: id, rol: null, creado_en: t })),
  }))
  // Mismo conjunto, orden de llegada invertido: la pantalla no se puede reordenar sola entre dos
  // recargas idénticas.
  assert.deepEqual(claves(armar(['a', 'b', 'c'])), claves(armar(['c', 'b', 'a'])))
})

test('ningún evento habla en idioma de base de datos', () => {
  const r = construirLineaDeTiempo(vacio({
    cliente: { nombre: 'ARCOR', creado_en: '2026-07-08T00:11:59Z', actualizado_en: '2026-08-17T23:37:18Z' },
    contactos: [{ id: 'a', nombre: 'Ana', rol: 'compras', creado_en: '2026-08-10T12:00:00Z' }],
    documentos: [{ drive_file_id: 'd1', name: 'Contrato.pdf', rol: 'contrato', origen: 'manual', creado_en: '2026-08-11T12:00:00Z' }],
  }))
  const texto = r.eventos.map((e) => `${e.titulo} ${e.detalle ?? ''} ${e.fuente}`).join(' | ')
  for (const jerga of ['cliente_contacto', 'created_at', 'updated_at', 'creado_en', 'drive_file_id', 'null']) {
    assert.ok(!texto.includes(jerga), `se filtró jerga de base a la pantalla: ${jerga}`)
  }
})

// ── LO QUE COLGÓ EL SINCRONIZADOR SE AGRUPA POR DÍA ────────────────────────
//
// EL DEFECTO MEDIDO EN LA BASE REAL: los 214 vínculos de `cliente_documento` los puso el
// sincronizador de Drive de una sola pasada, todos con el mismo `creado_en` (17/08/2026). Uno por
// renglón, la ficha de La Estrella abre con NOVENTA Y TRES líneas idénticas y el alta de sus obras
// queda tres pantallas más abajo: la línea de tiempo deja de contar una historia y pasa a ser el
// volcado de una tabla.
//
// Agrupar no inventa nada —el conteo es de filas reales y la fecha es la de esas filas—, y lo que se
// pierde (el nombre de cada archivo) está entero en la solapa Documentos.

test('93 vínculos del sincronizador del mismo día son UN evento, no 93', () => {
  const documentos = Array.from({ length: 93 }, (_, i) => ({
    drive_file_id: `f${i}`, name: `archivo ${i}.pdf`, rol: null,
    origen: 'path_inferido', creado_en: `2026-08-17T03:00:0${i % 10}.000Z`,
  }))
  const r = construirLineaDeTiempo(vacio({ documentos }))
  const docs = r.eventos.filter((e) => e.tipo === 'documento_alta')
  assert.equal(docs.length, 1, 'un renglón por día, no uno por archivo')
  assert.equal(docs[0].titulo, '93 documentos vinculados desde la carpeta de Drive')
})

test('el conteo del grupo es el de filas REALES, y los días distintos no se mezclan', () => {
  const r = construirLineaDeTiempo(vacio({
    documentos: [
      { drive_file_id: 'a', name: 'a', rol: null, origen: 'path_inferido', creado_en: '2026-08-17T03:00:00Z' },
      { drive_file_id: 'b', name: 'b', rol: null, origen: 'path_inferido', creado_en: '2026-08-17T04:00:00Z' },
      { drive_file_id: 'c', name: 'c', rol: null, origen: 'path_inferido', creado_en: '2026-08-18T03:00:00Z' },
    ],
  }))
  const docs = r.eventos.filter((e) => e.tipo === 'documento_alta')
  assert.equal(docs.length, 2, 'dos días, dos renglones')
  assert.equal(docs[0].titulo, 'Documento vinculado: c', 'un solo archivo ese día: se dice cuál')
  assert.equal(docs[1].titulo, '2 documentos vinculados desde la carpeta de Drive')
})

test('lo que vinculó una PERSONA nunca se agrupa, ni con lo del sincronizador del mismo día', () => {
  // Que alguien haya decidido colgar el contrato es un hecho de la relación, no un movimiento de
  // sincronización. Meterlo en la bolsa de «31 documentos» lo borra.
  const r = construirLineaDeTiempo(vacio({
    documentos: [
      { drive_file_id: 'x', name: 'Contrato firmado.pdf', rol: 'contrato', origen: 'manual', creado_en: '2026-08-17T10:00:00Z' },
      { drive_file_id: 'a', name: 'a', rol: null, origen: 'path_inferido', creado_en: '2026-08-17T03:00:00Z' },
      { drive_file_id: 'b', name: 'b', rol: null, origen: 'path_inferido', creado_en: '2026-08-17T04:00:00Z' },
    ],
  }))
  const docs = r.eventos.filter((e) => e.tipo === 'documento_alta')
  assert.equal(docs.length, 2)
  assert.deepEqual(docs.map((e) => e.titulo), [
    'Documento vinculado: Contrato firmado.pdf',
    '2 documentos vinculados desde la carpeta de Drive',
  ])
  assert.equal(docs[0].detalle, 'contrato', 'el rol del papel viaja con el evento')
})

test('un vínculo del sincronizador SIN fecha no se cuela en el grupo del día de al lado', () => {
  const r = construirLineaDeTiempo(vacio({
    documentos: [
      { drive_file_id: 'a', name: 'a', rol: null, origen: 'path_inferido', creado_en: '2026-08-17T03:00:00Z' },
      { drive_file_id: 'b', name: 'b', rol: null, origen: 'path_inferido', creado_en: null },
    ],
  }))
  const docs = r.eventos.filter((e) => e.tipo === 'documento_alta')
  assert.equal(docs.length, 1)
  assert.equal(docs[0].titulo, 'Documento vinculado: a', 'cuenta UNO, no dos')
  assert.equal(r.sinFecha, 2, 'el vínculo sin fecha + el alta del cliente sin fecha')
})
