import { test } from 'node:test'
import assert from 'node:assert/strict'
import { periodoDelNombre, rotuloDocumento } from './rotuloDocumento.ts'

test('el papel se llama por su TIPO, no por el nombre del archivo', () => {
  // El defecto que atrapa: la lista «Documentación» de la ficha 20 dibujaba
  // «Recibo 2026-07 Q2 - AGUERO CRISTIAN (firmado).pdf». Seis filas así no contestan qué papeles
  // tiene esta persona, que es para lo que existe la lista.
  assert.deepEqual(
    rotuloDocumento({ tipo_documento: 'dni', nombre: 'DNI_AGUERO_CRISTIAN_frente_dorso.pdf' }),
    { titulo: 'DNI', archivo: 'DNI_AGUERO_CRISTIAN_frente_dorso.pdf' },
  )
  assert.equal(rotuloDocumento({ tipo_documento: 'art', nombre: 'x.pdf' }).titulo, 'Constancia ART')
  assert.equal(rotuloDocumento({ tipo_documento: 'examen_medico', nombre: null }).titulo, 'Examen médico')
  // «HM» es la libreta del IERIC, no una historia médica.
  assert.equal(rotuloDocumento({ tipo_documento: 'ieric', nombre: 'HM 0142.pdf' }).titulo, 'Libreta IERIC')
})

test('el recibo lleva su período, y sale del NOMBRE del archivo', () => {
  assert.equal(
    rotuloDocumento({ tipo_documento: 'recibo_sueldo', nombre: 'Recibo 2026-07 Q2 - AGUERO CRISTIAN (firmado).pdf' }).titulo,
    'Recibo julio 2026',
  )
  assert.equal(periodoDelNombre('Recibo 2026/12 - X.pdf'), 'diciembre 2026')
  // Sin período escrito no se inventa uno: el rótulo va pelado.
  assert.equal(rotuloDocumento({ tipo_documento: 'recibo_sueldo', nombre: 'recibo firmado.pdf' }).titulo, 'Recibo')
})

test('un mes imposible NO se convierte en período', () => {
  // El defecto que atrapa: `20\d{2}-\d{2}` tomaba «2026-13» y escribía `undefined 2026`.
  assert.equal(periodoDelNombre('Legajo 2026-13.pdf'), null)
  assert.equal(periodoDelNombre('Legajo 2026-00.pdf'), null)
  // Un número más largo no es un período: «2026-071234» no es julio.
  assert.equal(periodoDelNombre('acta 2026-071234.pdf'), null)
  assert.equal(periodoDelNombre(null), null)
})

test('el período NO se le cuelga a un papel que no tiene mes', () => {
  // El defecto que atrapa: aplicar la regla a todas las categorías escribiría «DNI julio 2026»
  // porque así se llamó el escaneo — una vigencia que nadie cargó.
  assert.equal(
    rotuloDocumento({ tipo_documento: 'dni', nombre: 'DNI 2026-07 escaneo.pdf' }).titulo,
    'DNI',
  )
})

test('sin categoría conocida NO se inventa un rótulo: queda el archivo', () => {
  // El defecto que atrapa: llamar «Documento» a lo que nadie clasificó esconde justamente eso.
  assert.deepEqual(
    rotuloDocumento({ tipo_documento: 'otro', nombre: 'escaneo 12.pdf' }),
    { titulo: 'escaneo 12.pdf', archivo: 'escaneo 12.pdf' },
  )
  assert.deepEqual(
    rotuloDocumento({ tipo_documento: null, nombre: null }),
    { titulo: 'sin nombre', archivo: null },
  )
  // Un nombre en blanco es ausencia de nombre, no un título vacío en la fila.
  assert.deepEqual(
    rotuloDocumento({ tipo_documento: null, nombre: '   ' }),
    { titulo: 'sin nombre', archivo: null },
  )
})
