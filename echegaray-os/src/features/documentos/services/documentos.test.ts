// DOCUMENTOS — los tests son los casos que hacían mentir a la pantalla.
//
// El más importante es el de la vigencia: el canónico de diseño pinta «Vigente» en verde para casi
// todas las filas, y con los datos reales eso es una afirmación falsa 3.123 veces.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  carpetaDe, conVinculos, enlaceDescarga, enlaceDrive, enlacePreview, estadoVigencia, etiquetaLegajo,
  hayVencimientos, migajaDe, pesoLegible,
  type ArchivoIndexado, type VinculoCliente, type VinculoLegajo,
} from './documentos.ts'

const archivo = (p: Partial<ArchivoIndexado> = {}): ArchivoIndexado => ({
  drive_file_id: 'f1',
  name: 'EPP QUIROGA Y BAZAN.pdf',
  path: 'administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/PUENTE DE PLAYA/EPP.pdf',
  tipo: 'pdf', mime_type: 'application/pdf', size_bytes: 1766658,
  modified_time: '2024-03-20T15:04:19.005+00:00',
  nombre_norm: 'epp quiroga y bazan', ...p,
})

test('un documento sin vencimiento cargado NO está vigente: no se sabe', () => {
  assert.equal(estadoVigencia(null, '2026-08-21'), null, 'afirmó vigencia sin tener la fecha')
  assert.equal(estadoVigencia('', '2026-08-21'), null)
})

test('la vigencia distingue vencido, por vencer y vigente contra el día de hoy', () => {
  assert.equal(estadoVigencia('2026-08-12', '2026-08-21'), 'vencido')
  assert.equal(estadoVigencia('2026-09-04', '2026-08-21'), 'vence-pronto')
  assert.equal(estadoVigencia('2027-02-11', '2026-08-21'), 'vigente')
  // El borde: vence HOY todavía no está vencido, y a 30 días sigue siendo aviso.
  assert.equal(estadoVigencia('2026-08-21', '2026-08-21'), 'vence-pronto')
  assert.equal(estadoVigencia('2026-09-20', '2026-08-21'), 'vence-pronto')
  assert.equal(estadoVigencia('2026-09-21', '2026-08-21'), 'vigente')
})

test('la columna VENCE no se dibuja si ninguna fila tiene vencimiento', () => {
  const sin = conVinculos([archivo()], [], [])
  assert.equal(hayVencimientos(sin), false, 'iba a dibujar 3.123 celdas que dicen «sin dato»')
  const con = conVinculos([archivo()], [legajo({ fecha_vencimiento: '2026-09-04' })], [])
  assert.equal(hayVencimientos(con), true, 'escondió el único vencimiento que existe')
})

const legajo = (p: Partial<VinculoLegajo> = {}): VinculoLegajo => ({
  id: 'l1', drive_file_id: 'f1', tipo_documento: 'alta_temprana', fecha_vencimiento: null,
  persona_id: 'p1', personas: { nombre_completo: 'GONZALEZ EMILIANO' }, ...p,
})

const docCliente = (p: Partial<VinculoCliente> = {}): VinculoCliente => ({
  drive_file_id: 'f1', rol: null,
  clientes: { nombre_comercial: 'ARCOR', slug: 'arcor' }, ...p,
})

test('un archivo que cuelga de una persona y de un cliente muestra los DOS vínculos', () => {
  const [d] = conVinculos([archivo()], [legajo()], [docCliente()])
  assert.equal(d.vinculos.length, 2, 'se quedó con el primer vínculo y ocultó el otro')
  assert.deepEqual(d.vinculos.map((v) => v.clase).sort(), ['cliente', 'persona'])
})

test('un archivo sin vínculo no se pierde ni se le inventa dueño', () => {
  const [d] = conVinculos([archivo({ drive_file_id: 'huerfano' })], [legajo()], [docCliente()])
  assert.deepEqual(d.vinculos, [], 'le colgó el vínculo de OTRO archivo')
  assert.equal(d.drive_file_id, 'huerfano')
})

test('el rol vacío de un documento de cliente es «sin clasificar», no una cadena vacía', () => {
  // Las 214 filas de `cliente_documento` tienen `rol` en null: si se dibujara tal cual, la columna
  // quedaría con 214 huecos mudos en vez de decir que nadie los clasificó.
  const [d] = conVinculos([archivo()], [], [docCliente({ rol: '   ' })])
  assert.equal(d.vinculos[0].detalle, null)
})

test('un vínculo sin destino navegable no dibuja un enlace roto', () => {
  const [d] = conVinculos([archivo()], [legajo({ persona_id: null })], [])
  assert.equal(d.vinculos[0].href, null, 'iba a dibujar un enlace a /administracion/personas/null')
})

test('el nombre del tipo de documento se lee, no se muestra el valor de la base', () => {
  assert.equal(etiquetaLegajo('libreta_fondo_cese'), 'Libreta fondo cese')
  assert.equal(etiquetaLegajo(null), null)
  assert.equal(etiquetaLegajo('  '), null)
})

test('el archivo se ABRE en Drive: el OS no lo copia ni lo sirve', () => {
  assert.equal(
    enlaceDrive('17P0Zrixdwa091srh-p4LXD30Mv8qS6sG'),
    'https://drive.google.com/file/d/17P0Zrixdwa091srh-p4LXD30Mv8qS6sG/view',
  )
})

// ── DESCARGAR Y PREVISUALIZAR ──────────────────────────────────────────────────────────────────
//
// EL DEFECTO QUE ATRAPAN: ofrecer «Descargar» sobre algo que no tiene bytes. 15 de los 3.123
// archivos son de Google —10 nativos y 5 accesos directos— y para ésos el botón bajaría nada.

test('un binario de Drive se descarga; un nativo de Google, no', () => {
  assert.equal(
    enlaceDescarga('17P0Zri', 'application/pdf'),
    'https://drive.google.com/uc?export=download&id=17P0Zri',
  )
  assert.equal(enlaceDescarga('17P0Zri', 'application/vnd.google-apps.document'), null,
    'iba a bajar un archivo de 0 bytes')
  assert.equal(enlaceDescarga('17P0Zri', 'application/vnd.google-apps.shortcut'), null)
  // Sin mime declarado se asume binario: es el caso de los 17 `application/octet-stream` del índice
  // y de cualquier archivo que el indexador no supo tipar. Bajarlo funciona.
  assert.equal(enlaceDescarga('17P0Zri', null), 'https://drive.google.com/uc?export=download&id=17P0Zri')
})

test('el visor embebido cambia según el producto, y no existe para un acceso directo', () => {
  assert.equal(enlacePreview('a1', 'application/pdf'), 'https://drive.google.com/file/d/a1/preview')
  // Un Doc nativo en drive.google.com/file/… devuelve error, no el documento.
  assert.equal(enlacePreview('a1', 'application/vnd.google-apps.document'), 'https://docs.google.com/document/d/a1/preview')
  assert.equal(enlacePreview('a1', 'application/vnd.google-apps.spreadsheet'), 'https://docs.google.com/spreadsheets/d/a1/preview')
  assert.equal(enlacePreview('a1', 'application/vnd.google-apps.shortcut'), null, 'un acceso directo no tiene nada que mostrar')
  assert.equal(enlacePreview('a1', 'application/vnd.google-apps.folder'), null)
})

// ── EL VÍNCULO QUE PUEDE LLEVAR VENCIMIENTO ────────────────────────────────────────────────────

test('sólo el vínculo de legajo trae el id con el que se escribe el vencimiento', () => {
  const [d] = conVinculos([archivo()], [legajo({ id: 'leg-9' })], [docCliente()])
  const persona = d.vinculos.find((v) => v.clase === 'persona')
  const cliente = d.vinculos.find((v) => v.clase === 'cliente')
  assert.equal(persona?.legajoId, 'leg-9')
  // `cliente_documento` NO tiene columna de vencimiento: ofrecer el campo ahí sería un formulario
  // que acepta una fecha y no la guarda en ningún lado.
  assert.equal(cliente?.legajoId, null, 'iba a ofrecer editar el vencimiento de un cliente')
})

test('la carpeta es la ruta SIN el nombre del archivo', () => {
  assert.equal(carpetaDe('administracion/LOGO SAS/logo.png'), 'administracion/LOGO SAS')
  assert.equal(carpetaDe('carga-masiva.xlsx'), null, 'llamó carpeta al archivo suelto de la raíz')
  assert.equal(carpetaDe(null), null)
})

test('la migaja recorta por el MEDIO y respeta el máximo de tramos', () => {
  const larga = 'administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/PUENTE DE PLAYA/x.pdf'
  assert.equal(migajaDe(larga), 'administracion / … / PUENTE DE PLAYA')
  assert.equal(
    migajaDe(larga)?.split(' / ').length, 3,
    'recortó a 3 y devolvió 4: el recorte no acotaba nada',
  )
  // Corta ya: no se recorta lo que entra.
  assert.equal(migajaDe('libro-sueldos/2025/recibo.pdf'), 'libro-sueldos / 2025')
})

test('un tamaño ausente es «sin dato», nunca «0 kB»', () => {
  assert.equal(pesoLegible(null), null, 'un archivo sin tamaño se dibujó como vacío')
  assert.equal(pesoLegible(0), '0 B')
  assert.equal(pesoLegible(1766658), '1,7 MB')
  assert.equal(pesoLegible(2048), '2 kB')
})
