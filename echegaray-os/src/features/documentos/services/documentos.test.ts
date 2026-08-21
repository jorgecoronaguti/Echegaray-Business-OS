// DOCUMENTOS — los tests son los casos que hacían mentir a la pantalla.
//
// El más importante es el de la vigencia: el canónico de diseño pinta «Vigente» en verde para casi
// todas las filas, y con los datos reales eso es una afirmación falsa 3.123 veces.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  carpetaDe, conVinculos, enlaceDrive, estadoVigencia, etiquetaLegajo, hayVencimientos,
  migajaDe, pesoLegible, type ArchivoIndexado, type VinculoCliente, type VinculoLegajo,
} from './documentos.ts'

const archivo = (p: Partial<ArchivoIndexado> = {}): ArchivoIndexado => ({
  drive_file_id: 'f1',
  name: 'EPP QUIROGA Y BAZAN.pdf',
  path: 'administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN/PUENTE DE PLAYA/EPP.pdf',
  tipo: 'pdf', mime_type: 'application/pdf', size_bytes: 1766658,
  modified_time: '2024-03-20T15:04:19.005+00:00', ...p,
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
  drive_file_id: 'f1', tipo_documento: 'alta_temprana', fecha_vencimiento: null,
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
