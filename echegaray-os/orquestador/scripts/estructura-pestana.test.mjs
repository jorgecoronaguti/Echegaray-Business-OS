// `ESTRUCTURA_TOTAL_MESES` APUNTABA A LA FILA 3, QUE ES UNA FILA EN BLANCO.
//
// Es el tercero de los tres rangos ciegos de la auditoría del 03/08, y el de causa más simple: este
// generador NO publicaba ningún rango con nombre. El nombre venía de un layout anterior —cuando el
// cuadro arrancaba arriba de todo, sin subtítulo ni títulos de sección— y como nadie lo republicaba,
// se quedó donde estaba mientras el cuadro bajaba. Anclado a la posición.
//
// Lo que se prueba: que el nombre caiga SOBRE la fila de totales que este generador acaba de armar,
// y que esa fila tenga contenido. El oráculo es la grilla, no un número de fila escrito acá.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, rangosDeEstructura, ROTULO_TOTAL, formatosPropios } from './estructura-pestana.mjs'
import { verificarRangos, explicarProblemas, fila } from '../lib/rangos-con-nombre.mjs'
import { tiene, fusionar } from '../lib/preservar-anotaciones.mjs'

const g = grilla()

test('ESTRUCTURA_TOTAL_MESES cae sobre la fila de totales, con los doce meses adentro', () => {
  const problemas = verificarRangos(g.filas, rangosDeEstructura(g))
  assert.deepEqual(problemas, [], explicarProblemas(problemas))
  const [d] = rangosDeEstructura(g)
  assert.equal(d.r0, g.fTot, 'el rango tiene que salir de la fila que el generador acaba de calcular')
  assert.equal(d.c1 - d.c0 + 1, 12, 'son los doce meses del año, no el total anual')
})

test('LA FILA 3 —donde estaba— es justamente una fila en blanco', () => {
  // El defecto medido en el archivo real: cero celdas con dato, y por lo tanto cualquier fórmula que
  // lo leyera valía 0 sin dar error. Si algún día la fila 3 dejara de estar en blanco, esto avisa que
  // el "antes" de este arreglo ya no es el que se documentó.
  // `tiene()` y no `=== ''`: desde el 04/08 una celda que el generador deja vacía lleva el centinela
  // VACIO ("es mía y va vacía"), justamente para que la fusión la BORRE en vez de preservar el
  // fantasma del layout anterior. Sigue estando en blanco; ahora además se limpia.
  assert.ok(!tiene(g.filas[2]?.[1]), 'la fila 3 sigue sin dato')
  const viejo = fila('ESTRUCTURA_TOTAL_MESES', { fila: 3, c0: 1, c1: 12, rotulo: ROTULO_TOTAL })
  assert.equal(verificarRangos(g.filas, [viejo])[0].problema, 'desanclado')
})

test('la fila de totales conserva su rótulo: es el ancla del rango', () => {
  assert.equal(g.filas[g.fTot - 1][0], ROTULO_TOTAL)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CUADRO DUPLICADO DEL 04/08 — lo que el dueño vio como "rompiste estructura"
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// La pestaña real tenía DOS encabezados y DOS bloques de datos: el de la versión anterior clavado en
// las filas 2 a 5 (seriales de fecha en crudo pintados como moneda, y fórmulas de "% del total"
// dividiendo por $P$11 — que en el layout de hoy es "Honorarios y servicios") y el bueno desde la 6.
// La causa no era el generador escribiendo dos veces: era que armaba sus filas con `fill('')` y la
// fusión preserva la cadena vacía. Si se vuelve a `fill('')`, este test se pone rojo.

test('EL CUADRO DUPLICADO: la fusión limpia el encabezado y los datos del layout anterior', () => {
  const enLaPestana = g.filas.map(() => [])
  enLaPestana[1] = ['(subtítulo viejo)', 46023, 46054, 46082, 46113, 46143, 46174, 46204, 46235, 46266, 46296, 46327, 46357, 'Total real', 'Proyectado', 'Total 2026', '% del total']
  enLaPestana[2] = ['Equipos y rodados (inversión)', '=IF(S3<>0;S3;0)', '', '', '', '', '', '', '', '', '', '', '', '=SUM($S3:$AD3)', '=$P3-$N3', '=SUM($B3:$M3)', '=IFERROR($P3/$P11;0)']
  enLaPestana[3] = ['Combustible', '=IF(S4<>0;S4;0)']
  enLaPestana[4] = ['1 · EL GASTO DE ESTRUCTURA, MES A MES', '=IF(S5<>0;S5;0)']

  const fusion = fusionar(g.filas, enLaPestana)
  for (const i of [1, 2, 3, 4]) {
    for (let c = 1; c <= 16; c++) {
      assert.equal(fusion[i][c], '', `fila ${i + 1}, columna ${c + 1}: sobrevivió "${fusion[i][c]}" del layout anterior`)
    }
  }
  // Y el rótulo del cuadro fantasma tampoco sobrevive: la fila 3 es una separadora, no "Equipos y rodados".
  assert.equal(fusion[2][0], '')
  assert.equal(fusion[4][0], '1 · EL GASTO DE ESTRUCTURA, MES A MES', 'el título de sección del layout de hoy sí se escribe')
})

test('lo que la persona anota fuera del ancho declarado se preserva igual', () => {
  const enLaPestana = g.filas.map(() => [])
  enLaPestana[7] = Array(40).fill('')
  enLaPestana[7][34] = 'el combustible de julio incluye la moto'
  assert.equal(fusionar(g.filas, enLaPestana)[7][34], 'el combustible de julio incluye la moto')
})

test('EL FALSO ROJO: la diferencia del control se redondea a peso', () => {
  const dif = String(g.filas[g.fCtrl][1])
  assert.match(dif, /^=ROUND\(.*;0\)$/, 'sin ROUND, medio centavo de residuo dibujaba "-$0" en rojo con los datos perfectos')
})

test('NI UNA COLUMNA DE PROSA: la columna D del bloque de control quedó vacía', () => {
  for (let i = g.fCtrl - 2; i < g.filas.length; i++) {
    for (let j = 2; j < 17; j++) {
      assert.ok(!tiene(g.filas[i]?.[j]),
        `fila ${i + 1}, columna ${j + 1}: "${g.filas[i][j]}" es la prosa que el dueño borra y volvía en cada corrida`)
    }
  }
})

test('el subtítulo entra en una línea', () => {
  assert.ok(String(g.filas[1][0]).length <= 130, `mide ${String(g.filas[1][0]).length} caracteres`)
})

test('los formatos propios no pintan un solo fondo: el color quedó en el rojo del control', () => {
  const reqs = formatosPropios(1, g)
  const fondos = reqs.filter((r) => JSON.stringify(r).includes('backgroundColor'))
  assert.deepEqual(fondos, [], 'la barra azul, el ámbar de lo proyectado y el gris del total se van a la piel de statement')
  // Lo proyectado se distingue en itálica, que es la convención de un estimado en un estado financiero.
  const italicas = reqs.filter((r) => r.repeatCell?.cell?.userEnteredFormat?.textFormat?.italic)
  assert.ok(italicas.length >= 2, 'los meses proyectados y la columna Proyectado van en itálica')
})
