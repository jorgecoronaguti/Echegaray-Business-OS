import test from 'node:test'
import assert from 'node:assert/strict'
import { veredictoConectividad, NATURALEZA_DE_MARCA } from './caja-conectividad.mjs'
import { fuentesSumadas, MAPA, ROLES_SUMADOS } from '../lib/cash-flow-cobertura.mjs'
import { lineasDeCaja, marcaDeLinea } from '../lib/calendario-egresos.mjs'

test('con las fuentes reales, ninguna pestaña que aporta plata queda DESCONECTADA', () => {
  // Es la pregunta del dueño —"conectada a todas las pestañas"— convertida en un rojo/verde. Si
  // mañana el cuadro deja de sumar de una pestaña, esto se pone rojo antes que el piso mienta.
  const v = veredictoConectividad(fuentesSumadas())
  const rotas = v.filter((x) => x.estado === 'DESCONECTADA')
  assert.deepEqual(rotas, [], `pestañas sin conectar: ${rotas.map((x) => x.pestania).join(', ')}`)
  // Y todas las que el MAPA declara sumadas aparecen como conectadas, ninguna de más ni de menos.
  const conectadas = v.filter((x) => x.estado === 'conectada').map((x) => x.pestania).sort()
  assert.deepEqual(conectadas, MAPA.filter((m) => ROLES_SUMADOS.has(m.rol)).map((m) => m.pestania).sort())
})

test('una DERIVADA no es un hueco: se declara aparte, con la pestaña de la que deriva', () => {
  // Confundir "no la suma" con "no la ve" llevaría a sumar Proveedores, Materiales, Impuestos,
  // Estructura y Recurrentes encima de Compras: contar todo dos veces.
  //
  // "Cargas Sociales" estuvo en esta lista hasta el 06/08 y dejó de estarlo: su cadena calcula las
  // cargas del mes y publica la serie, así que ahora es FUENTE y el Libro excluye de Compras las
  // filas planas de esos rubros. Es el mismo camino que hizo la planilla de jornales.
  const v = veredictoConectividad(fuentesSumadas())
  const der = v.filter((x) => x.rol === 'DERIVADA')
  assert.ok(der.length >= 5, `quedaron ${der.length} derivadas: si bajan, alguien dejó de declarar de dónde viene su plata`)
  for (const d of der) {
    assert.equal(d.estado, 'derivada', `${d.pestania} no puede figurar como hueco`)
    assert.match(d.porque, /ya viaja por Compras/)
  }
})

test('un concepto sin fuente con fecha SÍ se reporta como desconectado, con su nombre', () => {
  // Los tres cargos que el banco debita solo no tienen pestaña que los proyecte. No tenerlos es una
  // limitación legítima; no NOMBRARLOS es el defecto que dejó el piso optimista sin avisar.
  const v = veredictoConectividad(fuentesSumadas(), ['Impuesto al cheque (Ley 25.413, 0,6% de cada lado)'])
  const roto = v.find((x) => x.estado === 'DESCONECTADA')
  assert.ok(roto, 'un concepto ciego tiene que aparecer como desconectado')
  assert.match(roto.porque, /Impuesto al cheque/)
  assert.match(roto.porque, /CERO en todos los tramos/)
})

test('EL PUENTE A LA NATURALEZA DEL BANCO ES EXPLÍCITO, no por palabra clave', () => {
  // El defecto: emparejar "Intereses del acuerdo en descubierto" con "Costo financiero del
  // descubierto" buscando la primera palabra daba $0 — un cero de matcheo disfrazado de cero medido,
  // que es exactamente lo que este script existe para no hacer.
  const marcas = lineasDeCaja().filter(({ signo }) => signo === -1)
    .map(({ linea }) => marcaDeLinea(linea))
    .filter((m) => ['descubierto', 'comisiones', 'impuestoCheque'].includes(m))
  assert.equal(marcas.length, 3, 'son tres las líneas sin fuente con fecha')
  for (const m of marcas) {
    assert.ok(NATURALEZA_DE_MARCA[m], `la marca "${m}" no tiene naturaleza declarada: mediría $0 en silencio`)
  }
})
