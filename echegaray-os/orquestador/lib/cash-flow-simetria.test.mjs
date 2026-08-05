// LOS DOS CUADROS NO PUEDEN CONTRADECIRSE SOBRE EL MISMO MES.
//
// Estos tests atrapan el defecto medido el 05/08/2026 en el Sheet vivo: el Semanal proyectaba
// $318.461.819 de "lo que falta cargar" contra $150.021.078 del Mensual, y el mismo diciembre cerraba
// en ($168.625.438) según uno y en $8.758.805 según el otro. $177M de contradicción entre dos cuadros
// que el comentario de cash-flow-horizonte.mjs declaraba imposibles de contradecir.
//
// Ninguno de los tres tests de acá compara números del Sheet: comparan las FÓRMULAS que el generador
// escribe, que es donde vive la causa. Un test que leyera el Sheet sólo diría que hoy no coinciden.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formulaLineaMes, expresionProyeccionMes, mesCerrado, CUADRO, NOMBRE_MESES } from './cash-flow-lineas.mjs'
import { formulaLineaSemana, expresionFalta } from './cash-flow-horizonte.mjs'

const TABLAS = { Estructura: 15, Recurrentes: 24 }
/** Las líneas del cuadro que SÍ proyectan — las únicas donde la simetría puede romperse. */
const lineasQueProyectan = () => CUADRO
  .flatMap((a) => a.grupos)
  .flatMap((g) => g.lineas)
  .filter((l) => expresionProyeccionMes(l, 'B$3', TABLAS, 2026) !== null)

test('LA GUARDA DEL MES CERRADO ES LA MISMA EN LAS DOS PESTAÑAS — el defecto de los $177M', () => {
  const lineas = lineasQueProyectan()
  assert.ok(lineas.length > 0, 'tiene que haber líneas que proyecten, si no el test no prueba nada')
  for (const l of lineas) {
    const mensual = formulaLineaMes(l, 'B', 'B', 3, TABLAS, 2026)
    const semanal = formulaLineaSemana(l, 'B$3', 'B$3+7', TABLAS, 2026)
    // El mensual pregunta "¿este mes ya cerró?" antes de proyectar. El semanal NO lo hacía: llamaba a
    // expresionProyeccionMes directo y repartía el mes en curso ENTERO entre sus semanas, mientras el
    // mensual no lo proyectaba en absoluto. Si alguien vuelve a sacar la guarda del semanal, acá se ve.
    assert.ok(mensual.includes(mesCerrado('B$3')),
      `${l.nombre}: el mensual perdió la guarda del mes cerrado`)
    assert.ok(semanal.includes('EOMONTH(EOMONTH(B$3;-1)+1;0)<=EOMONTH(TODAY();0)'),
      `${l.nombre}: el SEMANAL proyecta sin preguntar si el mes ya cerró — es el defecto de los $177M`)
  }
})

test('EL REPARTO ENTRE SEMANAS ES UNA PARTICIÓN: los días propios sobre los días del MES, no sobre los que faltan', () => {
  const l = lineasQueProyectan()[0]
  const f = formulaLineaSemana(l, 'B$3', 'B$3+7', TABLAS, 2026)
  // El denominador tiene que ser el mes entero. Con `finMes - MAX(M;TODAY())` —los días que faltan
  // desde hoy— la suma de las semanas de un mes NO da 1 y las dos pestañas no pueden cerrar.
  assert.ok(!/MAX\(EOMONTH\(EOMONTH\(B\$3;-1\)\+1;0\)\+1;TODAY\(\)\)/.test(f),
    'el denominador del reparto no puede depender de TODAY()')
  assert.match(f, /\)\/\(EOMONTH\(EOMONTH\(B\$3;-1\)\+1;0\)\+1-\(EOMONTH\(B\$3;-1\)\+1\)\)/,
    'el reparto divide por los días del mes entero')
})

test('MAX(real;proy) del mensual y real+falta del semanal son la MISMA cantidad, escrita distinto', () => {
  // La identidad que hace que las dos pestañas cierren:
  //     MAX(real; proy) = real + MAX(0; proy − real)
  // El mensual usa la izquierda, el semanal la derecha. Si `expresionFalta` dejara de ser
  // MAX(0; proy − real), la igualdad se rompe y con ella el cuadre entre pestañas.
  const l = lineasQueProyectan()[0]
  const M = 'EOMONTH(B$3;-1)+1'
  const falta = expresionFalta(l, M, TABLAS, 2026)
  assert.match(falta, /^IF\(EOMONTH\(EOMONTH\(B\$3;-1\)\+1;0\)<=EOMONTH\(TODAY\(\);0\);0;MAX\(0;/,
    'falta = 0 si el mes cerró, si no MAX(0; proy − real)')
  assert.ok(falta.includes(expresionProyeccionMes(l, M, TABLAS, 2026)), 'la proyección es la del mensual, no otra')
})

test('EL TEST DE HISTORIA APUNTA A LOS DOCE MESES DEL EJERCICIO, POR SU NOMBRE', () => {
  // `$B$3:$M$3` a secas es relativo a la pestaña donde cae la fórmula: en el Semanal esas doce celdas
  // son las doce primeras SEMANAS (29/12/2025 … 16/03/2026), no los doce meses. El test
  // "¿este rubro tuvo gasto en al menos 4 meses?" medía otra cosa y prendía o apagaba la proyección
  // por el motivo equivocado, sin dar un solo error.
  //
  // DESDE EL 05/08/2026 LA REFERENCIA ES UN NOMBRE, y el motivo es el mismo defecto una vuelta más:
  // calificar con la pestaña arregla el "a qué pestaña", pero no el "a qué fila". Las dos vistas se
  // rehicieron como bloques y la fila 3 del Mensual quedó vacía — una referencia a celdas vacías no
  // da error: COUNTIFS cuenta cero meses y la proyección por ritmo se apaga en silencio. CF_MESES
  // apunta a los doce meses se muevan donde se muevan.
  const conRitmo = lineasQueProyectan()
    .map((l) => expresionProyeccionMes(l, 'B$3', TABLAS, 2026))
    .filter((e) => e.includes('COUNTIFS'))
  assert.ok(conRitmo.length > 0, 'tiene que haber al menos una línea proyectada por ritmo')
  for (const e of conRitmo) {
    assert.ok(!/\$B\$3:\$M\$3/.test(e), 'ninguna fórmula puede seguir apuntando a la fila 3 de una pestaña que ya no la tiene')
    assert.ok(e.includes(NOMBRE_MESES), 'los doce meses se citan por su rango con nombre')
  }
})

test('FUERA DEL AÑO DEL CUADRO NO SE PROYECTA — tampoco por ritmo', () => {
  // La última columna del semanal (lunes 28/12/2026) pisa enero de 2027: sin esta guarda cobraba
  // 3/31 de un mes entero de ritmo por cada rubro, plata de otro ejercicio sumada al total de éste.
  const conRitmo = lineasQueProyectan()
    .map((l) => expresionProyeccionMes(l, 'B$3', TABLAS, 2026))
    .filter((e) => e.includes('COUNTIFS'))
  for (const e of conRitmo) {
    assert.match(e, /^IF\(YEAR\(B\$3\)<>2026;0;/, 'la rama de ritmo también tiene que cortar fuera del año')
  }
})
