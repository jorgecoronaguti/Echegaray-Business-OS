// LA AUDITORÍA NO PUEDE PUBLICAR LO QUE TRES MIGRACIONES CERRARON.
//
// Los dos defectos que estas pruebas atrapan:
//
//   1. QUE EL NÚMERO DE LA RETRIBUCIÓN SE ESCAPE por la ventana de la auditoría. La solapa la lee
//      `es_administracion()`, que incluye al jefe de obra — el mismo al que la 5000 le sacó la
//      escritura del sueldo pactado y la 2900 la lectura. La base manda `•••`; si esta capa lo
//      destapara, formateara o lo perdiera, la ventana quedaría abierta sin que nadie lo note.
//   2. QUE UN CAMBIO DE 2022 SE LEA COMO DE ESTE AÑO. Una bitácora que dice «14/03 16:30» sobre un
//      hecho de hace cuatro años miente sobre cuándo pasó, y es la única pregunta que contesta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { autorDicho, decirCambios, etiquetaCampo, valorDicho, TAPADO } from './auditoriaCambios.ts'

const AHORA = new Date('2026-08-21T12:00:00-03:00')

test('la retribución llega tapada y sale tapada: el número no se publica por acá', () => {
  const [fila] = decirCambios(
    [{ id: '1', campo: 'retribucion_pactada', antes: TAPADO, despues: TAPADO, autor: null, en: '2026-08-12T12:40:00Z' }],
    new Map(),
    AHORA,
  )
  assert.equal(fila.antes, '•••')
  assert.equal(fila.despues, '•••')
  assert.equal(fila.tapado, true, 'la fila tiene que poder decir que el valor está tapado')
  assert.equal(fila.que, 'Retribución pactada', 'el HECHO sí se publica: qué cambió y cuándo')
  // Y no se cuela por el formateador: si `•••` pasara por el de fechas, saldría «Invalid Date» y
  // el único rastro que la base dejó a propósito se perdería.
  assert.equal(valorDicho('retribucion_pactada', TAPADO), '•••')
  // El orden de los casos dentro de `valorDicho` es lo que se está probando: el día que el trigger
  // tape una columna de FECHA, resolver el tapado después del formateo daría «Invalid Date».
  assert.equal(valorDicho('fecha_egreso', TAPADO), '•••')
})

test('un valor que ANTES no existía se dice «vacío», no se dibuja como un hueco', () => {
  // Pasar de NULL a un valor es un cambio, y el trigger lo registra. Una celda en blanco acá es
  // indistinguible de una fila que no se pudo leer.
  assert.equal(valorDicho('especialidad', null), 'vacío')
  assert.equal(valorDicho('retribucion_pactada', null), 'vacío')
})

test('la fecha, el booleano y la categoría se dicen como se leen en la ficha', () => {
  // `to_jsonb(old) ->> campo` normaliza todo a texto: sin esto la auditoría es un volcado de base.
  assert.equal(valorDicho('fecha_ingreso', '2022-03-14'), '14/03/22')
  assert.equal(valorDicho('en_la_empresa', 'false'), 'no')
  assert.equal(valorDicho('en_la_empresa', 'true'), 'sí')
  assert.equal(valorDicho('categoria', 'medio_oficial'), 'Medio oficial')
  // Una categoría mal importada se muestra TAL CUAL, para que alguien la corrija.
  assert.equal(valorDicho('categoria', '6E60'), '6E60')
})

test('un cambio de otro año NO se confunde con uno de éste', () => {
  const [viejo, nuevo] = decirCambios(
    [
      { id: '1', campo: 'legajo', antes: null, despues: '0142', autor: null, en: '2022-03-14T19:30:00Z' },
      { id: '2', campo: 'legajo', antes: '0142', despues: '0143', autor: null, en: '2026-03-14T19:30:00Z' },
    ],
    new Map(),
    AHORA,
  )
  assert.match(viejo.cuando, /^14\/03\/22 /, `sin año la fila miente: ${viejo.cuando}`)
  assert.equal(nuevo.cuando, '14/03 16:30', 'en el año corriente el año sobra')
  assert.notEqual(viejo.cuando, nuevo.cuando)
})

test('el autor: la persona, el sistema y el que no se pudo resolver son TRES cosas distintas', () => {
  const nombres = new Map([['u-1', 'Rodrigo Echegaray']])
  assert.equal(autorDicho('u-1', nombres), 'Rodrigo Echegaray')
  // `null` es el orquestador escribiendo con la clave de servicio: no hubo persona y no se inventa
  // una. Es lo que dice el comentario de la columna en la base.
  assert.equal(autorDicho(null, nombres), 'el sistema')
  // Un uuid sin perfil legible no es «el sistema» ni una cuenta borrada: no lo sabemos.
  assert.equal(autorDicho('u-9', nombres), 'sin identificar')
  assert.notEqual(autorDicho('u-9', nombres), autorDicho(null, nombres))
})

test('un campo que el trigger sume mañana aparece feo, pero aparece', () => {
  // Filtrar lo desconocido escondería un cambio real. El rótulo crudo es peor que el bonito y
  // muchísimo mejor que la ausencia.
  assert.equal(etiquetaCampo('nombre_completo'), 'Nombre y apellido')
  assert.equal(etiquetaCampo('columna_nueva'), 'columna_nueva')
  assert.equal(etiquetaCampo(null), 'la ficha')
})

test('las catorce columnas que vigila el trigger de personas tienen rótulo', () => {
  // La lista es la del `create trigger personas_auditar` de la migración 5200. Si alguien BORRA un
  // rótulo que la migración vigila, esta prueba se pone roja.
  const VIGILADOS = [
    'nombre_completo', 'dni', 'cuil', 'fecha_nacimiento', 'legajo', 'fecha_ingreso', 'fecha_egreso',
    'en_la_empresa', 'categoria', 'especialidad', 'puesto', 'convenio_colectivo',
    'modalidad_liquidacion', 'retribucion_pactada',
  ]
  for (const c of VIGILADOS) {
    assert.notEqual(etiquetaCampo(c), c, `«${c}» se está mostrando con el nombre de la columna`)
  }
})
