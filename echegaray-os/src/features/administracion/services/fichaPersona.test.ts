import test from 'node:test'
import assert from 'node:assert/strict'
import {
  antiguedadEnAnios, estadoDocumento, papelesPendientes, solicitadosDelLegajo,
} from './fichaPersona.ts'
import type { DocumentoLegajo } from '../types/index.ts'

// ═══ LOS DOS DEFECTOS QUE ATRAPAN ESTAS PRUEBAS ═══
//
// 1 · «PRESENTE» NO ES «ESTÁ». En `documentacion_legajo` conviven una casilla que tilda una persona
//     (`presente`) y un vínculo que se puede abrir (`drive_file_id`). Leer sólo la casilla dibuja un
//     legajo completo del que no se puede sacar un solo papel — y el legajo se mira cuando lo pide
//     el IERIC, que no acepta «alguien dijo que lo tenemos».
//
// 2 · SIN FECHA DE ALTA NO HAY CERO AÑOS. La antigüedad va en el slab, al lado del nombre. Un «0 a»
//     sobre alguien que entró en 2019 no se ve como un dato faltante: se ve como un dato.

const doc = (d: Partial<DocumentoLegajo> = {}): DocumentoLegajo => ({
  id: 'x', tipo_documento: null, nombre: null, drive_file_id: null,
  fecha_documento: null, presente: null, notas: null, ...d,
})

test('un papel tildado SIN archivo no se lee como cargado', () => {
  assert.equal(estadoDocumento(doc({ presente: true, drive_file_id: null })), 'sin_archivo')
  assert.equal(estadoDocumento(doc({ presente: true, drive_file_id: 'abc' })), 'cargado')
  assert.equal(estadoDocumento(doc({ presente: false, drive_file_id: null })), 'solicitado')
})

test('el vínculo le gana a la casilla cuando discrepan', () => {
  // Alguien destildó la casilla y el archivo sigue vinculado: se puede abrir, o sea que está.
  assert.equal(estadoDocumento(doc({ presente: false, drive_file_id: 'abc' })), 'cargado')
})

test('sin fecha de alta la antigüedad es DESCONOCIDA, no cero', () => {
  assert.equal(antiguedadEnAnios(null, '2026-08-24'), null)
  assert.equal(antiguedadEnAnios('', '2026-08-24'), null)
  assert.equal(antiguedadEnAnios('no-es-una-fecha', '2026-08-24'), null)
})

test('un alta en el futuro no produce antigüedad negativa', () => {
  assert.equal(antiguedadEnAnios('2027-01-01', '2026-08-24'), null)
})

test('la antigüedad se cuenta en años con un decimal', () => {
  assert.equal(antiguedadEnAnios('2023-03-12', '2026-08-24'), 3.5)
  assert.equal(antiguedadEnAnios('2026-08-24', '2026-08-24'), 0)
})

test('a quien ya no está no se le pide ningún papel', () => {
  const vacio: DocumentoLegajo[] = []
  assert.deepEqual(solicitadosDelLegajo(vacio, false), [])
  assert.ok(solicitadosDelLegajo(vacio, true).length > 0, 'a un legajo activo y vacío le falta todo')
})

test('los pendientes cuentan lo tildado-sin-archivo Y lo que nunca llegó', () => {
  const docs = [
    doc({ tipo_documento: 'alta_temprana', drive_file_id: 'a' }),
    doc({ tipo_documento: 'dni', presente: true }), // tildado, sin archivo: NO está
  ]
  // Faltan `examen_medico` y `epp` (sin fila) + el DNI sin archivo.
  assert.equal(papelesPendientes(docs, true), 3)
  // Cerrado: sólo lo que existe y no se puede abrir.
  assert.equal(papelesPendientes(docs, false), 1)
})
