import test from 'node:test'
import assert from 'node:assert/strict'
import { veredictoConectividad, NATURALEZA_DE_MARCA } from './caja-conectividad.mjs'
import { pestanasSumadasSegunMapa, MAPA, ROLES_SUMADOS } from '../lib/cash-flow-cobertura.mjs'
import { lineasDeCaja, marcaDeLinea } from '../lib/calendario-egresos.mjs'

// ═══ DÓNDE SE MIDE AHORA "CONECTADA" (13/08/2026) ═══
//
// `fuentesSumadas` dejó de derivarse del `CUADRO` retirado y pasa a medirse sobre los movimientos del
// Libro, así que la pregunta "¿alguna pestaña quedó desconectada DE VERDAD?" ya no se puede contestar
// en frío: se contesta en cada corrida con `problemasDeRol(libro)` dentro de
// `libro-movimientos-pestana.mjs`. Lo que sigue vivo acá es el contrato de `veredictoConectividad`:
// que una FUENTE ausente se reporte, que una DERIVADA no se confunda con un hueco, y que un concepto
// ciego se nombre. Ese contrato es lo que hace que el control de arriba signifique algo.
const SEGUN_MAPA = () => pestanasSumadasSegunMapa()

test('toda pestaña que el mapa declara FUENTE aparece conectada, y ninguna queda como hueco', () => {
  const v = veredictoConectividad(SEGUN_MAPA())
  const rotas = v.filter((x) => x.estado === 'DESCONECTADA')
  assert.deepEqual(rotas, [], `pestañas sin conectar: ${rotas.map((x) => x.pestania).join(', ')}`)
  // Y todas las que el MAPA declara sumadas aparecen como conectadas, ninguna de más ni de menos.
  const conectadas = v.filter((x) => x.estado === 'conectada').map((x) => x.pestania).sort()
  assert.deepEqual(conectadas, MAPA.filter((m) => ROLES_SUMADOS.has(m.rol)).map((m) => m.pestania).sort())
})

test('una DERIVADA no es un hueco: se declara aparte, con la pestaña de la que deriva', () => {
  // Confundir "no la suma" con "no la ve" llevaría a sumar Proveedores y Materiales encima de Compras:
  // contar los mismos materiales dos veces.
  //
  // ERAN CINCO Y HOY SON DOS, y cada baja fue un extractor que se escribió, no una regla que se
  // aflojó: "Cargas Sociales" pasó a FUENTE el 06/08 (su cadena publica la serie), y el 13/08 lo
  // hicieron "Impuestos y Financieros" (el calendario de IVA/IIBB, que Compras no tiene ni en una
  // fila), "Recurrentes" (la provisión del mes) y "Estructura" (la proyección de los meses futuros).
  // Las tres emiten movimientos con origen propio y netos de lo ya materializado en Compras.
  const v = veredictoConectividad(SEGUN_MAPA())
  const der = v.filter((x) => x.rol === 'DERIVADA')
  assert.deepEqual(der.map((x) => x.pestania).sort(), ['Materiales', 'Proveedores'],
    'si una derivada se agrega o se va, tiene que ser porque cambió de dónde sale su plata')
  for (const d of der) {
    assert.equal(d.estado, 'derivada', `${d.pestania} no puede figurar como hueco`)
    assert.match(d.porque, /ya viaja por Compras/)
  }
})

test('un concepto sin fuente con fecha SÍ se reporta como desconectado, con su nombre', () => {
  // Los tres cargos que el banco debita solo no tienen pestaña que los proyecte. No tenerlos es una
  // limitación legítima; no NOMBRARLOS es el defecto que dejó el piso optimista sin avisar.
  const v = veredictoConectividad(SEGUN_MAPA(), ['Impuesto al cheque (Ley 25.413, 0,6% de cada lado)'])
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
