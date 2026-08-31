import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cuilPlano, importeArca, constanciaDePagina, agruparPorPersona, nombreDeArchivo, yaTieneAlta,
} from './constancia-afip.mjs'

/** Una página real del PDF de ARCA del 31/08/2026, tal como sale del extractor de texto. */
const PAGINA = `Simplificación Registral
CONSTANCIA DEL TRABAJADOR
Alta
Original para el empleador, duplicado para el empleado.
Empleador: CUIT: 30-71630464-3
Nombre y apellido o Denominación: ECHEGARAY CONSTRUCCIONES S.A.S.
Datos del Empleado
Apellido y nombre: AGUERO CRISTIAN DOMINGO
CUIL: 20-29427106-7
Fecha Inicio: 26/05/2025 Fecha Cese: Obra Social: 105408 - O.S.DEL PERSONAL DE LA CONSTRUCCION
Modalidad de contrato: 024 - Personal de la construcción Ley N°22250 Situación de Revista: 01 - Activo
Categoria: 019448 - OFICIAL Puesto: 7129 - Oficiales y operarios de la construcción (obra gruesa) y
afines, no clasificados bajo otros epígrafes
Retrib. pactada: $4056,00 Mod. Liq.: 5 - HORA
Talón para el empleador (Original)
`

const DUPLICADO = PAGINA
  .replace('Talón para el empleador (Original)', 'Número de registro de trámite 252129480869\nTalón para el empleado (Duplicado)')

test('el CUIL se lee en dígitos venga como venga', () => {
  assert.equal(cuilPlano('20-29427106-7'), '20294271067')
  assert.equal(cuilPlano('20294271067'), '20294271067')
  assert.equal(cuilPlano('20.294.271.06-7'), '20294271067')
  // Un CUIL a medio leer no es un CUIL: emparejaría con cualquiera o con nadie.
  assert.equal(cuilPlano('2029427106'), null)
  assert.equal(cuilPlano(''), null)
  assert.equal(cuilPlano(null), null)
})

test('el importe de ARCA usa punto de miles y coma decimal', () => {
  assert.equal(importeArca('4056,00'), 4056)
  // LA TRAMPA: con Number() a secas «4.056,00» da 4,056 — mil veces menos.
  assert.equal(importeArca('4.056,00'), 4056)
  assert.equal(importeArca('759,00'), 759)
  assert.equal(importeArca(null), null)
  assert.equal(importeArca('0,00'), null)
})

test('una página declara persona, fecha, categoría y valor hora', () => {
  const c = constanciaDePagina(PAGINA)
  assert.equal(c.cuil, '20294271067')
  assert.equal(c.nombre, 'AGUERO CRISTIAN DOMINGO')
  assert.equal(c.tipo, 'Alta')
  assert.equal(c.fechaInicio, '26/05/2025')
  assert.equal(c.fechaCese, null)
  assert.equal(c.categoria, 'OFICIAL')
  assert.equal(c.retribucion, 4056)
  assert.equal(c.porHora, true)
  assert.equal(c.cuitEmpleador, '30716304643')
  assert.equal(c.talon, 'empleador')
  assert.equal(c.tramite, null)
})

test('el duplicado es el único que trae el número de trámite', () => {
  const c = constanciaDePagina(DUPLICADO)
  assert.equal(c.talon, 'empleado')
  assert.equal(c.tramite, '252129480869')
})

test('una página que no es constancia o no tiene CUIL no se atribuye a nadie', () => {
  assert.equal(constanciaDePagina(''), null)
  assert.equal(constanciaDePagina('una hoja escaneada sin capa de texto'), null)
  // Es una constancia, pero sin CUIL legible: no se cuelga de nadie.
  assert.equal(constanciaDePagina(PAGINA.replace(/CUIL: [\d-]+/, 'CUIL:')), null)
})

test('las dos páginas de una persona quedan en una sola constancia', () => {
  const { personas, descartadas } = agruparPorPersona([PAGINA, DUPLICADO])
  assert.equal(personas.length, 1)
  assert.deepEqual(personas[0].paginas, [0, 1])
  assert.equal(personas[0].tramite, '252129480869', 'el trámite del duplicado completa al original')
  assert.deepEqual(personas[0].conflictos, [])
  assert.deepEqual(descartadas, [])
})

test('se agrupa por CUIL, no por orden: dos personas intercaladas no se mezclan', () => {
  const otra = PAGINA.replace('20-29427106-7', '20-30402018-1').replace('AGUERO CRISTIAN DOMINGO', 'TELLO JUAN ALBERTO')
  const { personas } = agruparPorPersona([PAGINA, otra, DUPLICADO])
  assert.equal(personas.length, 2)
  assert.deepEqual(personas.find((p) => p.cuil === '20294271067').paginas, [0, 2])
  assert.deepEqual(personas.find((p) => p.cuil === '20304020181').paginas, [1])
})

test('dos talones del mismo CUIL que se contradicen quedan marcados', () => {
  const torcida = DUPLICADO.replace('$4056,00', '$9999,00')
  const { personas } = agruparPorPersona([PAGINA, torcida])
  assert.equal(personas.length, 1)
  assert.equal(personas[0].conflictos.length, 1)
  assert.match(personas[0].conflictos[0], /retribucion/)
})

test('una página ilegible se informa, no rompe el resto', () => {
  const { personas, descartadas } = agruparPorPersona(['', PAGINA])
  assert.equal(personas.length, 1)
  assert.deepEqual(descartadas, [0])
})

test('el archivo se nombra como ya se nombran las altas del legajo', () => {
  assert.equal(nombreDeArchivo('AGUERO CRISTIAN DOMINGO'), 'Alta - Aguero Cristian Domingo.pdf')
  assert.equal(nombreDeArchivo('GONZALEZ TOBARES JUAN GUILLERMO'), 'Alta - Gonzalez Tobares Juan Guillermo.pdf')
})

test('reconoce el alta que ya está, con cualquiera de los nombres que usa el legajo', () => {
  assert.equal(yaTieneAlta(['ALTA.pdf']), true)
  assert.equal(yaTieneAlta(['alta.pdf', 'HM.pdf']), true)
  assert.equal(yaTieneAlta(['Alta - Quiroga S.pdf']), true)
  assert.equal(yaTieneAlta(['ALTA - QUIROGA ALEXANDER.pdf']), true)
  assert.equal(yaTieneAlta(['FWEB_1988796.pdf']), true, 'el nombre crudo de la descarga de ARCA')
})

test('«HM» es la libreta del IERIC, no un alta', () => {
  assert.equal(yaTieneAlta(['HM.pdf', 'DNI.pdf', 'EPP - Fulano.pdf']), false)
  assert.equal(yaTieneAlta(['HM - AGUERO.pdf']), false)
  assert.equal(yaTieneAlta([]), false)
  // «Altas y bajas» no es el alta de esta persona; empieza con «alta» pero sigue con otra cosa.
  assert.equal(yaTieneAlta(['Alternativa.pdf']), false, 'la palabra tiene que estar entera')
})
