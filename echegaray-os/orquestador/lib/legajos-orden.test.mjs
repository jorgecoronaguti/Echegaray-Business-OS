import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coincidencia, estadoSegunNomina, personaDeArchivo, sinFechaPegada, tipoDeDocumento, ubicar,
} from './legajos-orden.mjs'

// LA REGLA QUE DECIDE DÓNDE VA CADA PAPEL DEL LEGAJO.
//
// Se prueba con los nombres REALES del data room —no con inventados— porque el desorden concreto es
// el que tiene que resistir: cuatro González, dos Peralta que no son la misma persona, fechas
// pegadas al nombre de la carpeta, y archivos que se llaman `HM.pdf` a secas.

test('las tildes y las mayúsculas no hacen dos personas', () => {
  assert.ok(coincidencia('Agüero Cristian', 'AGUERO, CRISTIAN DOMINGO'))
  assert.ok(coincidencia('DNI - Walter Santander', 'SANTANDER WALTER'))
})

test('UN apellido en común NO alcanza: en este plantel hay cuatro González', () => {
  assert.equal(coincidencia('GONZALEZ CARLOS', 'GONZALEZ TOBARES JUAN GUILLERMO'), null)
  assert.equal(coincidencia('Gonzalez Juan', 'GONZALEZ CARLOS SAMUEL'), null)
  assert.ok(coincidencia('Gonzalez Juan', 'GONZALES TOBARES JUAN GUILLERMO'))
})

test('la fecha pegada sale del nombre de la carpeta', () => {
  assert.equal(sinFechaPegada('AGUIRRE LEANDRO 7:2:26'), 'AGUIRRE LEANDRO')
  assert.equal(sinFechaPegada('RIOS FERNANDO21:1:26'), 'RIOS FERNANDO')
  assert.equal(sinFechaPegada('DIAZ BRAIAN 21:1:26'), 'DIAZ BRAIAN')
  // Un nombre sin fecha no se toca.
  assert.equal(sinFechaPegada('SANTANDER WALTER'), 'SANTANDER WALTER')
})

test('el tipo de documento sale del nombre del archivo', () => {
  assert.equal(tipoDeDocumento('HM - QUIROGA MAURICIO.pdf'), 'EXAMEN MEDICO')
  assert.equal(tipoDeDocumento('Alta - Quiroga S.pdf'), 'ALTA')
  assert.equal(tipoDeDocumento('Baja - Aballay Jose.pdf'), 'BAJA')
  assert.equal(tipoDeDocumento('DNI - Cristian Agüero.pdf'), 'DNI')
  assert.equal(tipoDeDocumento('EPP - FERREYRA A.pdf'), 'EPP')
  assert.equal(tipoDeDocumento('Capacitan - Cocheras.pdf'), 'CAPACITACION')
  assert.equal(tipoDeDocumento('CARATULAS EMPLEADOS.docx'), null)
})

test('el nombre de la persona se saca del nombre del archivo, en sus cuatro formas', () => {
  assert.equal(personaDeArchivo('HM - QUIROGA MAURICIO.pdf'), 'QUIROGA MAURICIO')
  assert.equal(personaDeArchivo('Alta Santander Walter.pdf'), 'Santander Walter')
  assert.equal(personaDeArchivo('HM 24:4- FERREYRA RODOLFO.pdf'), 'FERREYRA RODOLFO')
  assert.equal(personaDeArchivo('DNI - Carlos Salinas_1.jpg'), 'Carlos Salinas')
  assert.equal(personaDeArchivo('HM - IVAN ROSALES 9:6:25.pdf'), 'IVAN ROSALES')
})

const CARPETAS = [
  { id: 'f1', name: 'QUIROGA MAURICIO' },
  { id: 'f2', name: 'SANTANDER WALTER' },
  { id: 'f3', name: 'Peralta Ricardo' },
  { id: 'f4', name: 'Peralta Alexander Ricardo' },
  { id: 'f5', name: 'GONZALEZ CARLOS SAMUEL' },
]

test('cada papel va a la carpeta de SU persona', () => {
  assert.equal(ubicar({ name: 'HM - QUIROGA MAURICIO.pdf' }, CARPETAS).destino.id, 'f1')
  assert.equal(ubicar({ name: 'DNI - Walter Santander.pdf' }, CARPETAS).destino.id, 'f2')
})

test('EL EMPATE NO SE RESUELVE ADIVINANDO: dos Peralta son dos personas', () => {
  // «Baja - Peralta Alexander.pdf» empata contra las dos carpetas Peralta. Elegir una metería la
  // baja de uno en el legajo del otro — el error más caro que puede cometer este script.
  const r = ubicar({ name: 'Baja - Peralta Alexander.pdf' }, [
    { id: 'f3', name: 'Peralta Ricardo Alexander' },
    { id: 'f4', name: 'Peralta Alexander Ricardo' },
  ])
  assert.equal(r.destino, null)
  assert.match(r.motivo, /ambiguo/)
})

test('lo que no tiene carpeta se declara, no se inventa una', () => {
  const r = ubicar({ name: 'HM - SANCHEZ.pdf' }, CARPETAS)
  assert.equal(r.destino, null)
  assert.equal(r.motivo, 'no tiene carpeta')
})

test('un archivo que no dice de quién es se queda donde está', () => {
  const r = ubicar({ name: 'HM.pdf' }, CARPETAS)
  assert.equal(r.destino, null)
})

const NOMINA = [
  { nombre: 'AGUERO, CRISTIAN DOMINGO', activo: true },
  { nombre: 'NAVARRO MATIAS JESUS', activo: false },
  { nombre: 'GONZALEZ TOBARES, EMILIAN', activo: true },
]

test('el estado sale de la NÓMINA, no de si hay un papel de baja en la carpeta', () => {
  // El Drive se atrasa: ocho carpetas no tienen baja cargada de gente que ya no está en la nómina.
  assert.equal(estadoSegunNomina('AGUERO CRISTIAN', NOMINA).estado, 'ACTIVOS')
  assert.equal(estadoSegunNomina('NAVARRO MATIAS JESUS', NOMINA).estado, 'INACTIVOS')
  assert.equal(estadoSegunNomina('GONZALEZ TOBARES EMILIANO', NOMINA).estado, 'ACTIVOS')
})

test('quien no está en ninguna nómina no se declara inactivo: se declara SIN NÓMINA', () => {
  // Son cosas distintas: «se fue» y «no sé quién es». Meterlos juntos borra la pregunta.
  assert.equal(estadoSegunNomina('CAPELLI CESAR', NOMINA).estado, 'SIN NOMINA')
})


// ═══ EL APELLIDO SOLO, CUANDO ES ÚNICO ═══

const PLANTEL = [
  { id: 'g1', name: 'GALVAN GUADALUPE' },
  { id: 'g2', name: 'POBLETE LUIS' },
  { id: 'g3', name: 'QUIROGA MAURICIO' },
  { id: 'g4', name: 'QUIROGA JULIO CESAR' },
]

test('un apellido único alcanza: no hay nada que adivinar', () => {
  assert.equal(ubicar({ name: 'HM - GALVAN.pdf' }, PLANTEL).destino.id, 'g1')
  assert.equal(ubicar({ name: 'EPP - POBLETE.pdf' }, PLANTEL).destino.id, 'g2')
})

test('un apellido que es de dos personas NO alcanza', () => {
  const r = ubicar({ name: 'HM - QUIROGA S..pdf' }, PLANTEL)
  assert.equal(r.destino, null)
  assert.match(r.motivo, /2 personas distintas/)
})

test('el orden invertido no inventa una segunda persona', () => {
  // «GALVAN GUADALUPE» (carpeta) y «Guadalupe Galván» (archivo) son la misma. Contarlas como dos
  // dejaba el examen médico de Galván sin atribuir.
  const universo = ['GALVAN GUADALUPE', 'Guadalupe Galván', 'GALVAN']
  const r = ubicar({ name: 'HM - GALVAN.pdf' }, [{ id: 'g1', name: 'GALVAN GUADALUPE' }], universo)
  assert.equal(r.destino.id, 'g1')
})

test('tres Ferreyra distintos SÍ son tres personas: no se atribuye a ninguno', () => {
  const universo = ['FERREYRA EZEQUIEL', 'FERREYRA ALEJANDRO', 'FERREYRA RODOLFO']
  const r = ubicar({ name: 'EPP - FERREYRA A.pdf' }, [{ id: 'f1', name: 'FERREYRA EZEQUIEL' }], universo)
  assert.equal(r.destino, null, 'el EPP de un Ferreyra se fue al legajo de otro')
  assert.match(r.motivo, /3 personas/)
})
