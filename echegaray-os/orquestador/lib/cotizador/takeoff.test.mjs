// LOS SEIS DEFECTOS QUE ESTE MÓDULO EXISTE PARA NO TENER.
//
// La hoja de prueba tiene la MISMA FORMA que el COMPUTO.xlsx real de Quattropani, y esa forma es el
// punto: encabezado en la fila 2 (no en la 1), DOS columnas rotuladas «Cantidad» —la C, que cuenta
// piezas, y la P, que trae la cantidad de obra con su unidad al lado—, una cadena de fórmulas
// P3 → H3 → C3*D3*E3*F3, una fila sin cantidad y una celda con error.
//
// Cada bloque declara la mutación que lo pone en rojo. Las seis se corrieron.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encabezadoDe, bloquesDe, bloquesDeCantidad, papelesDe, cadenaDe, aplanar,
  cantidadDeFila, takeoffDeHoja, contrastar, medirTakeoff, elementoDe, ESTADO,
} from './takeoff.mjs'
import { partirDireccion, refsDeFormula } from '../ingesta/planilla.mjs'

/** Una celda del modelo canónico de `planilla.mjs`, armada a mano. */
function celda(dir, valor, { formula = null, tipo = null } = {}) {
  const d = partirDireccion(dir)
  const t = tipo ?? (typeof valor === 'number' ? 'NUMERO' : valor === null ? 'VACIA' : 'TEXTO')
  return {
    celda: dir, fila: d.fila, columna: d.columna, letra: d.letra, tipo,
    ...{ tipo: t },
    valor: t === 'ERROR' || t === 'VACIA' ? null : valor,
    texto: valor == null ? null : String(valor),
    formula,
    inputs: formula ? refsDeFormula(formula) : [],
  }
}

/** La hoja de prueba, con la forma del COMPUTO real. */
function hojaDePrueba(nombre = 'Presupuestado', { p4 = 6.75 } = {}) {
  return {
    nombre,
    celdas: [
      celda('R1', 'Resumen'),
      // Encabezado en la fila 2. B–N es el cómputo dimensional; P–S el resumen. Dos «Cantidad».
      celda('B2', 'Bases'), celda('C2', 'Cantidad'), celda('D2', 'X'), celda('E2', 'Y'), celda('F2', 'Z'), celda('G2', 'Long'), celda('H2', 'Vol Total'),
      celda('P2', 'Cantidad'), celda('Q2', 'Unidad'), celda('R2', 'Tipo'),
      celda('B3', 'B1'), celda('C3', 11), celda('D3', 1.2), celda('E3', 1), celda('F3', 0.75),
      celda('H3', 9.9, { formula: 'C3*D3*E3*F3' }), celda('P3', 9.9, { formula: 'H3' }), celda('Q3', 'm3'), celda('R3', 'H17'),
      celda('B4', 'B0'), celda('C4', 9), celda('P4', p4, { formula: 'H4' }), celda('Q4', 'm3'),
      celda('B5', 'Mamposteria'), celda('Q5', 'm2'), // fila SIN cantidad
      celda('B6', 'Contrapiso'), celda('P6', null, { tipo: 'ERROR' }), celda('Q6', 'm2'),
    ].sort((a, b) => a.fila - b.fila || a.columna - b.columna),
  }
}

test('takeoff · el encabezado NO se asume en la fila 1', () => {
  const enc = encabezadoDe(hojaDePrueba())
  assert.equal(enc.fila, 2)
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══ en `encabezadoDe`, `return { fila: 1, ... }` fijo.
  // El COMPUTO real trae «Resumen» suelto en la fila 1 y la tabla arranca en la 2.
  assert.equal(bloquesDe(enc).length, 2, 'B–H y P–R son dos bloques, partidos por la columna vacía')
})

test('takeoff · POSITIVO: la unidad desempata cuál «Cantidad» es la cantidad de obra', () => {
  const enc = encabezadoDe(hojaDePrueba())
  const bloques = bloquesDeCantidad(enc)
  assert.equal(bloques.length, 1, 'sólo el bloque con unidad califica')
  assert.equal(bloques[0].papeles.cantidad, 'P')
  assert.equal(bloques[0].papeles.unidad, 'Q')
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══
  // En `bloquesDeCantidad`, filtrar sólo por `b.papeles.cantidad`. Entonces califica también B–H,
  // cuya «Cantidad» es la C: la cotización pasa a decir «11» donde la cantidad de obra es 9,9 m³.
  assert.equal(papelesDe(bloques[0]).tipo, 'R')
})

test('takeoff · POSITIVO: la cadena llega hasta los números que alguien escribió a mano', () => {
  const h = hojaDePrueba()
  const c = cantidadDeFila(h, 3, bloquesDeCantidad(encabezadoDe(h))[0], { documento: 'COMPUTO.xlsx', hash: 'h1' })
  assert.equal(c.valor, 9.9)
  assert.equal(c.unidad, 'm3')
  assert.equal(c.estado, ESTADO.DEFENDIBLE)
  assert.equal(c.evidencia.ubicacion, 'Presupuestado!P3')
  assert.ok(c.evidencia.textoLiteral.includes('B=B1'), 'la evidencia dice QUÉ dice la fila, no sólo dónde')
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══ en `cadenaDe`, `const inputs = []`.
  // La cantidad conserva su fórmula pero pierde los factores: 9,9 vuelve a ser una constante.
  assert.deepEqual(c.literales.map((l) => l.celda), ['Presupuestado!C3', 'Presupuestado!D3', 'Presupuestado!E3', 'Presupuestado!F3'])
  assert.deepEqual(c.literales.map((l) => l.valor), [11, 1.2, 1, 0.75])
  assert.ok(c.provenance.includes('Presupuestado!H3 = C3*D3*E3*F3'))
})

test('takeoff · NEGATIVO: fila sin cantidad es FALTA_DATO, no una cantidad de 0', () => {
  const h = hojaDePrueba()
  const b = bloquesDeCantidad(encabezadoDe(h))[0]
  const c = cantidadDeFila(h, 5, b, { documento: 'COMPUTO.xlsx' })
  assert.equal(c.estado, ESTADO.FALTA_DATO)
  assert.equal(c.valor, null)
  assert.equal(c.dato.fuente, 'FALTA_DATO')
  assert.match(c.dato.porque, /Presupuestado!P5/)
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══
  // En `cantidadDeFila`, borrar la rama `!cCant || cCant.tipo === 'VACIA'`. La fila cae al camino
  // normal y «Mamposteria» entra al cómputo con valor null disfrazado de cantidad leída.
  assert.notEqual(c.valor, 0)
})

test('takeoff · NEGATIVO: una celda con error de planilla no vale 0', () => {
  const h = hojaDePrueba()
  const c = cantidadDeFila(h, 6, bloquesDeCantidad(encabezadoDe(h))[0], { documento: 'COMPUTO.xlsx' })
  assert.equal(c.estado, ESTADO.ERROR)
  assert.equal(c.valor, null)
  assert.match(c.dato.porque, /un error no es un cero/)
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══ en `cantidadDeFila`, borrar la rama `cCant.tipo === 'ERROR'`.
})

test('takeoff · el elemento se busca a la IZQUIERDA del bloque, no adentro', () => {
  const h = hojaDePrueba()
  const b = bloquesDeCantidad(encabezadoDe(h))[0]
  assert.deepEqual(elementoDe(h, 3, b, b.papeles), { nombre: 'B1', celda: 'B3' })
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══
  // En `elementoDe`, arrancar el `for` en `bloque.desde`. El bloque P–S no tiene columna de
  // descripción y todas las cantidades salen anónimas: 60 números sin nombre de elemento.
  assert.equal(cantidadDeFila(h, 3, b, { documento: 'x' }).elemento, 'B1')
})

test('takeoff · NEGATIVO: dos unidades distintas son un CONFLICTO, no una resta', () => {
  const a = takeoffDeHoja(hojaDePrueba('Presupuestado'), { documento: 'COMPUTO.xlsx' }).cantidades
  const bh = hojaDePrueba('Real', { p4: 8.1 })
  bh.celdas.find((c) => c.celda === 'Q4').valor = 'uni'
  const b = takeoffDeHoja(bh, { documento: 'COMPUTO.xlsx' }).cantidades
  const k = contrastar(a, b, { etiquetaA: 'Presupuestado', etiquetaB: 'Real' })
  const u = k.conflictos.find((c) => c.elemento === 'B0')
  assert.equal(u.clase, 'UNIDAD_DISTINTA')
  assert.equal(u.citas.length, 2, 'un conflicto sin las DOS citas es una opinión sobre cuál está mal')
  assert.deepEqual(u.citas.map((c) => c.ubicacion), ['Presupuestado!P4', 'Real!P4'])
  // ═══ MUTACIÓN QUE LO PONE ROJO ═══
  // En `contrastar`, borrar la rama `x.unidad !== y.unidad`. 6,75 m³ y 8,1 unidades se comparan
  // como números y sale un CANTIDAD_DISTINTA del 20%: una diferencia inventada entre dos cosas que
  // ni siquiera se miden igual.
  assert.ok(k.coinciden.some((c) => c.elemento === 'B1'), 'lo que coincide se dice que coincide')
})

test('takeoff · una referencia circular corta, no cuelga', () => {
  const h = { nombre: 'h', celdas: [celda('A1', 1, { formula: 'B1' }), celda('B1', 1, { formula: 'A1' })] }
  const c = cadenaDe(h, 'A1')
  const plano = aplanar(c)
  assert.ok(plano.some((p) => p.estado === 'CORTADA'), 'la recursión tiene que declarar que se cortó')
  assert.ok(plano.length < 10)
})

test('takeoff · la medición dice cada categoría por separado', () => {
  const t = takeoffDeHoja(hojaDePrueba(), { documento: 'COMPUTO.xlsx' })
  const m = medirTakeoff(t.cantidades)
  assert.equal(m.filas, 4)
  assert.equal(m.defendibles, 2)
  assert.equal(m.faltaDato, 1)
  assert.equal(m.error, 1)
  // Las categorías NO se deducen restando: si alguna se calculara como `filas - resto`, un estado
  // nuevo se repartiría solo entre las otras y nadie vería que apareció.
  assert.equal(m.conEvidencia, 4)
})

test('takeoff · una hoja sin encabezado reconocible se DECLARA, no se adivina', () => {
  const t = takeoffDeHoja({ nombre: 'notas', celdas: [celda('A1', 'hola'), celda('A2', 'chau')] }, { documento: 'x.xlsx' })
  assert.deepEqual(t.cantidades, [])
  assert.match(t.porQue, /no hay tabla que leer/)
  const sinUnidad = takeoffDeHoja({ nombre: 'h', celdas: [celda('A1', 'Item'), celda('B1', 'Cantidad'), celda('A2', 'x'), celda('B2', 3)] }, { documento: 'x.xlsx' })
  assert.deepEqual(sinUnidad.cantidades, [])
  assert.match(sinUnidad.porQue, /cantidad Y de unidad/)
})
