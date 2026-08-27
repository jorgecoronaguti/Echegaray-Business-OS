// QUE DOS CORRIDAS DEN LO MISMO, Y QUE LO QUE NO SE PUEDE DEFENDER NO SE CONFIRME.
//
// El defecto que estas pruebas existen para impedir está medido: con los MISMOS archivos, la MISMA
// Base Maestra y los MISMOS precios, una corrida eligió T1023 y otra T1075. La prueba del final
// baraja el catálogo antes de decidir — si el orden de llegada de los datos puede cambiar la
// partida, esa prueba se pone roja.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seleccionar, seleccionarTodas, candidatosDe, huella, ESTADO } from './seleccion.mjs'
import { atributosDe, comparar, espesorDe, materialDe, terminacionDe, metodoDe } from './atributos.mjs'
import { SISTEMA } from './interpretar.mjs'

const CATALOGO = [
  { id: 'u-1010', codigo: 'T1010', nombre: 'COLUMNA DE CARGA H21', unidad: 'M3' },
  { id: 'u-1023', codigo: 'T1023', nombre: 'VIGA DE ENCADENADO H21', unidad: 'M3' },
  { id: 'u-1075', codigo: 'T1075', nombre: 'VIGA DE FUNDACION H21', unidad: 'M3' },
  { id: 'u-1110', codigo: 'T1110', nombre: 'CERCHA P/TECHO METALICO', unidad: 'ML' },
  { id: 'u-1200', codigo: 'T1200', nombre: 'PLATEA DE HORMIGON - 50CM', unidad: 'M2' },
  { id: 'u-1201', codigo: 'T1201', nombre: 'PISO DE HORMIGON ALISADO - 10CM', unidad: 'M2' },
  { id: 'u-1300', codigo: 'T1300', nombre: 'EXCAVACION DE ZANJAS A MANO', unidad: 'M3' },
  { id: 'u-1301', codigo: 'T1301', nombre: 'EXCAVACION DE ZANJAS CON MAQUINA', unidad: 'M3' },
  { id: 'u-1400', codigo: 'T1400', nombre: 'MAMPOSTERIA LADRILLON 0,20 VISTO', unidad: 'M2' },
  { id: 'u-1401', codigo: 'T1401', nombre: 'MAMPOSTERIA LADRILLON 0,20 A REVOCAR', unidad: 'M2' },
]

const computo = (extra) => ({ id: 'E1', unidad: 'm3', cantidad: { valor: 10 }, sistema: SISTEMA.HORMIGON_ARMADO, ...extra })

test('LA PLATEA DE 50 CM, GENERALIZADA: la partida declara un espesor que el plano no demuestra', () => {
  const r = seleccionar(computo({ id: 'PLATEA', nombre: 'Platea de fundación', especificacion: 's/Calculo', unidad: 'm2' }), CATALOGO)
  assert.equal(r.estado, ESTADO.PARTIDA_CANDIDATA)
  assert.equal(r.tarea, null, '$ 29,6 M de hormigón salían de acá')
  assert.ok(r.faltan.some((f) => f.atributo === 'espesor_m'))
  assert.match(r.porQue, /exige un atributo que el plano no demuestra/)
})

test('…y con el espesor declarado en el plano, la misma partida SÍ se confirma', () => {
  const r = seleccionar(computo({ id: 'PLATEA', nombre: 'Platea de fundación', especificacion: 'e = 0,50 m', unidad: 'm2' }), CATALOGO)
  assert.equal(r.estado, ESTADO.MAPEADA)
  assert.equal(r.tarea.codigo, 'T1200')
})

test('el espesor que NO coincide descarta la partida: 0,10 no es 0,50', () => {
  const { candidatos } = candidatosDe(computo({ nombre: 'Piso de hormigón', especificacion: 'e = 0,10 m', unidad: 'm2' }), CATALOGO)
  assert.ok(!candidatos.some((c) => c.codigo === 'T1200'), 'la de 50 cm queda afuera, no queda segunda')
  assert.equal(candidatos[0].codigo, 'T1201')
})

test('EL MÉTODO SEPARA: una excavación a mano no puede cotizarse con la partida de máquina', () => {
  const { candidatos } = candidatosDe(computo({ nombre: 'Excavación de zanjas', especificacion: 'ejecución a mano', sistema: SISTEMA.MOVIMIENTO_SUELO }), CATALOGO)
  assert.ok(candidatos.some((c) => c.codigo === 'T1300'))
  assert.ok(!candidatos.some((c) => c.codigo === 'T1301'), 'la de máquina contradice el método declarado')
})

test('LA TERMINACIÓN SEPARA: «visto» y «a revocar» no son la misma partida', () => {
  const { candidatos } = candidatosDe(computo({ nombre: 'Mampostería de ladrillón visto', unidad: 'm2', sistema: SISTEMA.MAMPOSTERIA }), CATALOGO)
  assert.ok(candidatos.some((c) => c.codigo === 'T1400'))
  assert.ok(!candidatos.some((c) => c.codigo === 'T1401'))
})

test('EL MATERIAL SEPARA: una correa metálica no entra en una partida de hormigón', () => {
  const { candidatos } = candidatosDe(computo({ id: 'CORREA', nombre: 'Correa C140', material: 'perfil metálico C140', unidad: 'm', sistema: SISTEMA.METALICA }), CATALOGO)
  assert.ok(!candidatos.some((c) => String(c.nombre).includes('H21')))
})

test('EL EMPATE ES AMBIGUO Y SE DICE, no se desempata solo', () => {
  const r = seleccionar(computo({ id: 'V1', nombre: 'Viga de hormigón armado H21' }), CATALOGO)
  assert.equal(r.estado, ESTADO.AMBIGUO)
  assert.equal(r.tarea, null)
  assert.match(r.porQue, /T1023.*T1075|T1075.*T1023/)
  assert.ok(r.candidatos.length >= 2, 'las dos opciones se muestran')
})

test('REPRODUCIBILIDAD: barajar el catálogo NO cambia una sola partida — éste es el defecto T1023/T1075', () => {
  const elementos = [
    computo({ id: 'V1', nombre: 'Viga de hormigón armado H21' }),
    computo({ id: 'C1', nombre: 'Columna de carga H21' }),
    computo({ id: 'PLATEA', nombre: 'Platea de fundación', especificacion: 's/Calculo', unidad: 'm2' }),
    computo({ id: 'EXC', nombre: 'Excavación de zanjas', especificacion: 'a mano', sistema: SISTEMA.MOVIMIENTO_SUELO }),
  ]
  const barajar = (a, semilla) => [...a].sort((x, y) => ((x.codigo + semilla).localeCompare(y.codigo + semilla) * (semilla % 2 ? -1 : 1)))
  const huellas = new Set()
  for (let s = 0; s < 8; s++) huellas.add(huella(seleccionarTodas(elementos, barajar(CATALOGO, s))))
  assert.equal(huellas.size, 1, `ocho órdenes distintos del catálogo produjeron ${huellas.size} resultados distintos`)
})

test('REPRODUCIBILIDAD: el orden de los elementos tampoco mueve el resultado de cada uno', () => {
  const a = [computo({ id: 'A', nombre: 'Columna de carga H21' }), computo({ id: 'B', nombre: 'Viga de hormigón armado H21' })]
  const uno = seleccionarTodas(a, CATALOGO)
  const dos = seleccionarTodas([...a].reverse(), CATALOGO)
  assert.equal(huella(uno), huella(dos))
})

test('UN VETO SÓLO PUEDE RESTAR: sacar la ganadora no promueve a una que el código había descartado', () => {
  const sinVeto = seleccionar(computo({ id: 'C1', nombre: 'Columna de carga H21' }), CATALOGO)
  assert.equal(sinVeto.estado, ESTADO.MAPEADA)
  assert.equal(sinVeto.tarea.codigo, 'T1010')
  const conVeto = seleccionar(computo({ id: 'C1', nombre: 'Columna de carga H21' }), CATALOGO, { veto: ['T1010'] })
  assert.notEqual(conVeto.tarea?.codigo, 'T1010')
  assert.deepEqual(conVeto.vetados, ['T1010'])
  assert.ok(!conVeto.candidatos.some((c) => c.codigo === 'T1010'))
})

test('sin ninguna candidata compatible, el resultado es la pregunta y no el silencio', () => {
  const r = seleccionar(computo({ id: 'X', nombre: 'Portón corredizo de chapa', unidad: 'un', sistema: SISTEMA.CARPINTERIA }), CATALOGO)
  assert.equal(r.estado, ESTADO.PARTIDA_CANDIDATA)
  assert.match(r.porQue, /no hay ninguna tarea/)
})

test('el recuento separa MAPEADA de AMBIGUO: una cotización con empates no es una cotización cerrada', () => {
  const r = seleccionarTodas([
    computo({ id: 'C1', nombre: 'Columna de carga H21' }),
    computo({ id: 'V1', nombre: 'Viga de hormigón armado H21' }),
  ], CATALOGO)
  assert.equal(r.mapeadas, 1)
  assert.equal(r.ambiguas, 1)
})

test('los atributos se leen con su literal, para poder citarlos', () => {
  assert.equal(espesorDe('PLATEA DE HORMIGON - 50CM').valor, 0.5)
  assert.equal(espesorDe('CONTRAPISO e = 0,10 m').valor, 0.1)
  assert.equal(espesorDe('tabique tipo Durlock 12,5 mm').valor, 0.013)
  assert.equal(espesorDe('Platea s/Calculo'), null, 'lo que no está no se completa')
  assert.equal(materialDe('HºAº p/bases').valor, 'hormigon_armado', 'el CIRCOT escribe con ordinal masculino')
  assert.equal(materialDe('H°A° p/bases').valor, 'hormigon_armado', 'los planos escriben con grado')
  assert.equal(terminacionDe('MAMPOSTERIA LADRILLON 0,20 VISTO').valor, 'visto')
  assert.equal(metodoDe('EXCAVACION DE ZANJAS A MANO').valor, 'manual')
  assert.ok(espesorDe('PLATEA DE HORMIGON - 50CM').literal.includes('50'))
})

test('comparar separa las tres cosas que NO son lo mismo: conflicto, sin respaldo y coincidencia', () => {
  const elemento = atributosDe('Platea de hormigón armado')
  const c = comparar(elemento, atributosDe('PLATEA DE HORMIGON - 50CM'))
  assert.equal(c.conflictos.length, 0)
  assert.ok(c.sinRespaldo.some((s) => s.atributo === 'espesor_m'), 'la partida exige un espesor que el elemento no tiene')
  assert.ok(c.coincidencias.some((s) => s.atributo === 'material'))

  const choque = comparar(atributosDe('Piso de hormigón e = 0,10 m'), atributosDe('PLATEA DE HORMIGON - 50CM'))
  assert.ok(choque.conflictos.some((x) => x.atributo === 'espesor_m'))
})
