// Tests del snapshot de pestañas. Herméticos: sólo las funciones puras, sin DB ni API.
import assert from 'node:assert/strict'
import { pestanaObjetivo, archivoObjetivo, mereceSnapshot, celdaARestaurar, TOOLS_DE_UNDO } from './sheet-snapshot.mjs'

let n = 0
const t = (nombre, fn) => { fn(); n++; console.log('  ok', nombre) }

t('detecta la pestaña por argumento directo', () => {
  assert.equal(pestanaObjetivo({ pestana: 'Caja' }), 'Caja')
  assert.equal(pestanaObjetivo({ tab: '02_Cobranzas' }), '02_Cobranzas')
})

t('detecta la pestaña dentro de un rango A1, con y sin comillas', () => {
  assert.equal(pestanaObjetivo({ range: 'Caja!A1:D10' }), 'Caja')
  assert.equal(pestanaObjetivo({ rango: "'05_Dashboard P&L'!B2" }), '05_Dashboard P&L')
  assert.equal(pestanaObjetivo({ ranges: ['Compras!A1:Z100', 'Otra!A1'] }), 'Compras')
})

t('sin pestaña identificable devuelve null (no adivina)', () => {
  assert.equal(pestanaObjetivo({ valores: [[1]] }), null)
  assert.equal(pestanaObjetivo({}), null)
})

t('el archivo puede venir en el input o del contexto de la conversación', () => {
  assert.equal(archivoObjetivo({ archivo_id: 'abc' }), 'abc')
  assert.equal(archivoObjetivo({}, 'del-contexto'), 'del-contexto')
  assert.equal(archivoObjetivo({}), null)
})

t('sólo se snapshotea una ESCRITURA', () => {
  assert.equal(mereceSnapshot('drive_update', 'drive.write', { archivo_id: 'x', pestana: 'Caja' }), true)
  assert.equal(mereceSnapshot('drive_read', 'drive.read', { archivo_id: 'x', pestana: 'Caja' }), false)
})

t('las escrituras que NO tocan el contenido de una pestaña no gastan snapshot', () => {
  for (const tool of ['drive_create', 'drive_rename_tab', 'drive_freeze', 'drive_auto_resize', 'exportar_a_pdf']) {
    assert.equal(mereceSnapshot(tool, 'drive.write', { archivo_id: 'x', pestana: 'Caja' }), false, tool)
  }
})

t('las que SÍ la tocan lo gastan, incluidas las destructivas', () => {
  for (const tool of ['drive_clear', 'drive_batch_update', 'drive_render_tabla', 'drive_delete_rows', 'drive_write']) {
    assert.equal(mereceSnapshot(tool, 'drive.write', { range: 'Caja!A1:D9' }, 'file-del-contexto'), true, tool)
  }
})

t('sin archivo o sin pestaña no se snapshotea (no hay qué guardar)', () => {
  assert.equal(mereceSnapshot('drive_update', 'drive.write', { pestana: 'Caja' }), false)
  assert.equal(mereceSnapshot('drive_update', 'drive.write', { archivo_id: 'x' }), false)
})

t('restaurar devuelve la FÓRMULA cuando la celda la tenía, no el valor calculado', () => {
  assert.equal(celdaARestaurar({ f: '=SUMA(A1:A9)', v: '1500' }), '=SUMA(A1:A9)',
    'restaurar el valor en vez de la fórmula convertiría una celda viva en un número muerto')
  assert.equal(celdaARestaurar({ f: null, v: 'Cemento' }), 'Cemento')
  assert.equal(celdaARestaurar({ f: null, v: null }), '')
  assert.equal(celdaARestaurar(null), '')
})

t('la tool de deshacer NO se snapshotea desde el ejecutor (bug real: el undo no hacía nada)', () => {
  // Si el ejecutor snapshoteaba antes de correr el undo, el snapshot más reciente pasaba a ser el
  // del estado ROTO — y "volvé atrás" restauraba exactamente lo que se quería descartar.
  assert.equal(mereceSnapshot('deshacer_cambio_sheet', 'drive.write', { archivo_id: 'x', pestana: 'Caja' }), false)
})

t('los snapshots de la maquinaria de undo están identificados para poder excluirlos', () => {
  assert.ok(TOOLS_DE_UNDO.includes('deshacer_cambio_sheet'))
  assert.ok(TOOLS_DE_UNDO.includes('restaurar_pestana'), 'el respaldo que toma el propio undo tampoco es "un cambio del OS"')
})

console.log(`sheet-snapshot: ${n} checks OK`)
