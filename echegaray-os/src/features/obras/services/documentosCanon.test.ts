import test from 'node:test'
import assert from 'node:assert/strict'
import {
  actividadDelPapel, contarVinculados, dondeVive, fechaPapel, metaCarpeta, numeroOrden, pieDriveTelefono,
  requiereAtencion, resumenGrupo, retencionAdjunta, sublineaArchivo, ultimosCambios,
} from './documentosCanon.ts'
import { CATEGORIAS, SIN_CLASIFICAR } from './documentosCategoria.ts'

test('la sublínea del archivo dice tipo y ruta, o «raíz de la carpeta» cuando la ruta está vacía', () => {
  assert.equal(sublineaArchivo('PDF', '02 Planos/Estructura'), 'PDF · 02 Planos/Estructura')
  assert.equal(sublineaArchivo('Foto', ''), 'Foto · raíz de la carpeta')
  assert.equal(sublineaArchivo('Hoja de cálculo', null), 'Hoja de cálculo')
})

test('la actividad del papel: el nombre, «la obra» para el contrato, «sin asignar» para el resto', () => {
  const nombre = (id: string) => (id === 'A' ? 'Corte de juntas' : null)
  assert.deepEqual(actividadDelPapel({ actividad_id: 'A', rol: null }, nombre), { texto: 'Corte de juntas', asignada: true })
  assert.deepEqual(actividadDelPapel({ actividad_id: null, rol: CATEGORIAS.CONTRATO }, nombre), { texto: 'la obra', asignada: false })
  assert.deepEqual(actividadDelPapel({ actividad_id: null, rol: null }, nombre), { texto: 'sin asignar', asignada: false })
})

test('el resumen del grupo: sin confirmar en alerta, confirmados sin alerta, para clasificar en alerta, nada si está vacío', () => {
  assert.deepEqual(resumenGrupo(CATEGORIAS.PLANOS, [{ origen: 'confirmado' }, { origen: 'carpeta_drive' }]), { texto: '1 sin confirmar', alerta: true })
  assert.deepEqual(resumenGrupo(CATEGORIAS.CONTRATO, [{ origen: 'confirmado' }]), { texto: '1 confirmados', alerta: false })
  assert.deepEqual(resumenGrupo(SIN_CLASIFICAR, [{ origen: 'inferido' }]), { texto: '1 para clasificar', alerta: true })
  assert.equal(resumenGrupo(CATEGORIAS.SEGURIDAD, []), null)
})

test('«Requiere atención» cuenta sin clasificar y sin confirmar sobre toda la lista', () => {
  assert.deepEqual(requiereAtencion([
    { origen: 'confirmado', rol: 'Planos y documentación técnica' }, { origen: 'inferido', rol: null }, { origen: 'carpeta_drive', rol: '' },
  ]), { sinClasificar: 2, sinConfirmar: 2 })
})

test('«Últimos cambios» ordena por modified_time y escribe dd/mm · nombre', () => {
  const c = ultimosCambios([
    { drive_file_id: '1', name: 'a.pdf', modified_time: '2026-09-02T10:00:00Z' },
    { drive_file_id: '2', name: null, modified_time: '2026-09-04T10:00:00Z' },
    { drive_file_id: '3', name: 'sin fecha', modified_time: null },
  ])
  assert.deepEqual(c, [{ id: '2', fecha: '04/09', nombre: '2' }, { id: '1', fecha: '02/09', nombre: 'a.pdf' }])
})

test('papeles del cliente: número, retención adjunta, dónde vive y fecha', () => {
  assert.equal(numeroOrden('oc', '2266'), 'OC 2266')
  assert.equal(numeroOrden('op', null), 'OP s/n')
  assert.equal(retencionAdjunta('5146', 1), '· retención 5146 adjunta')
  assert.equal(retencionAdjunta('5146', 0), null)
  assert.equal(dondeVive('x'), 'PDF en Drive')
  assert.equal(dondeVive(null), 'PDF en el OS')
  assert.equal(fechaPapel('2026-04-14'), '14/04/2026')
  assert.equal(fechaPapel(null), 'sin fecha')
})

test('la carpeta de Drive: meta, vinculados por drive_file_id y el pie del teléfono', () => {
  assert.equal(metaCarpeta(61, 38, false), '61 archivos · 38 vinculados · del catálogo, no de Drive en vivo')
  assert.equal(contarVinculados([{ drive_file_id: 'a' }, { drive_file_id: 'b' }], [{ drive_file_id: 'b' }]), 1)
  assert.deepEqual(pieDriveTelefono('carpeta', 61), { estado: 'vinculada', resto: '61 archivos' })
  assert.deepEqual(pieDriveTelefono(null, 0), { estado: 'sin vincular', resto: null })
})
