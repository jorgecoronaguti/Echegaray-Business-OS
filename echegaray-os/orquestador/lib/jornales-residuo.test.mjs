// LA LIMPIEZA DECLARADA DE "JORNALES POR QUINCENA" — y los dos casos en que NO tiene que borrar.
//
// El archivo vivo, tal como se leyó el 14/08 con render FORMULA. Cada fila de acá abajo se copió de
// la pestaña, no se inventó: el test vale por eso.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  copiaHuerfana, residuosDeclarados, candidatasDeBancoOficina, candidatasDeBancoDireccion,
  encabezadosDeMesBanco, finDeBloque,
} from './jornales-residuo.mjs'
import { CANDIDATAS } from '../scripts/limpiar-residuo-jornales.mjs'

const MIN = '=IFERROR(MIN(FILTER(Compras!$AD$4:$AD;REGEXMATCH(LOWER(Compras!$K$4:$K&"");"^(jorge echegaray|rodrigo echegaray|jorge corona)$");ISNUMBER(Compras!$AD$4:$AD)));"")'
const MAX = '=IFERROR(MAX(FILTER(Compras!$AD$4:$AD;REGEXMATCH(LOWER(Compras!$K$4:$K&"");"^(jorge echegaray|rodrigo echegaray|jorge corona)$");(Compras!$AD$4:$AD)));"")'

/** La pestaña real, recortada a lo que este archivo decide: columnas E (4) y N (13). */
function pestanaViva({ n113 = 46038, n114 = 46055 } = {}) {
  const g = Array.from({ length: 130 }, () => [])
  g[55][4] = MIN                       // E56 — bloque 3 «Desde», vivo
  g[57][4] = 'Se paga el'              // E58 — encabezado vivo del bloque 3
  for (let f = 59; f <= 70; f++) g[f - 1][4] = MAX  // E59:E70 — «Se paga el» vivo, mes por mes
  g[75][4] = MIN                       // E76 — la copia que dejó el rediseño
  g[78][4] = MAX                       // E79 — ídem, en la columna del dueño de 4.1
  g[109][13] = 'Pagado el'             // N110 — encabezado huérfano
  g[112][13] = n113                    // N113 — serial huérfano
  g[113][13] = n114                    // N114 — ídem
  g[114][13] = 'Pagado el'             // N115 — el encabezado VIVO del registro
  g[115][13] = 46038                   // N116 — la fecha viva
  g[116][13] = 46055                   // N117 — la fecha viva
  return g
}

test('LAS CINCO CELDAS DECLARADAS SON COPIAS HUÉRFANAS — y se nombra el gemelo vivo de cada una', () => {
  const { vaciables, conservadas } = residuosDeclarados(pestanaViva(), CANDIDATAS)
  assert.deepEqual(conservadas, [], `no se pudo probar: ${conservadas.map((c) => c.motivo).join(' · ')}`)
  assert.deepEqual(vaciables.map((v) => [v.fila, v.col, v.gemelo]), [
    [76, 4, 56], [79, 4, 59], [110, 13, 115], [113, 13, 116], [114, 13, 117],
  ])
})

test('EL SEGURO QUE IMPORTA: una fecha del dueño SIN gemelo vivo NO se borra', () => {
  // N113 y N114 son fechas que carga él. Se pueden vaciar sólo porque el generador YA las re-copió a
  // su posición nueva y están vivas en N116/N117. Si el registro no las tuviera, esta celda sería el
  // único ejemplar y borrarla sería destruir su trabajo — que es la falla que este repo ya pagó seis
  // veces. Acá se prueba que en ese caso la regla conserva.
  const g = pestanaViva()
  g[115][13] = ''                       // el registro perdió la fecha de N116
  g[116][13] = ''                       // y la de N117
  const { vaciables, conservadas } = residuosDeclarados(g, CANDIDATAS)
  assert.deepEqual(conservadas.map((c) => c.fila), [113, 114])
  assert.ok(conservadas.every((c) => /NO tiene gemelo vivo/.test(c.motivo)))
  assert.deepEqual(vaciables.map((v) => v.fila), [76, 79, 110], 'el resto sí se puede probar')
})

test('una fecha PARECIDA no alcanza: el gemelo tiene que ser el mismo dato', () => {
  // Un serial distinto en el registro significa que la celda de arriba NO es una copia de nada vivo.
  // La forma enmascarada las haría iguales a las dos (`<n>`), así que la comparación no puede ser por
  // forma para un número — y por eso el módulo compara el VALOR cuando no es fórmula ni texto.
  const g = pestanaViva()
  g[112][13] = 46099                    // N113 con una fecha que el registro no tiene
  const { conservadas } = residuosDeclarados(g, CANDIDATAS)
  assert.ok(conservadas.some((c) => c.fila === 113), 'un serial huérfano de verdad se conserva')
})

test('una celda ADENTRO de la tabla viva nunca es huérfana, aunque se repita', () => {
  const g = pestanaViva()
  const r = copiaHuerfana(g, { fila: 116, col: 13, tabla: [115, 130] })
  assert.equal(r.gemelo, null)
  assert.match(r.motivo, /ADENTRO de la tabla viva/)
})

test('una celda vacía no se toca ni se cuenta', () => {
  const r = copiaHuerfana(pestanaViva(), { fila: 99, col: 13, tabla: [115, 130] })
  assert.equal(r.gemelo, null)
  assert.match(r.motivo, /vacía/)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA COLUMNA «Banco» DE OFICINA — el defecto que duplicaba el canal (14/08)
//
// Leída la pestaña viva con render FORMULA: mayo–agosto tenían las ventanas del CALENDARIO y
// diciembre un TOTAL de la propia columna, que la fila de total volvía a sumar. El canal publicaba
// $5.238.607 contra $2.619.303 reales. Las filas de abajo son las que se leyeron, recortadas.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const VENTANA = (c) => `=SUMIFS($H$79:$H$90;$E$79:$E$90;">="&$C$${c};$E$79:$E$90;"<"&$C$${c + 1})`
const BANCO = (a, b) => `=SUM('_J_OFICINA'!W${a}:W${b})`

/** El cuadro de Oficina como estaba: encabezado en 36, doce meses 37..48, total 49, calendario 18..28. */
function conOficina({ dic = '=SUM(F$36:F$47)' } = {}) {
  const g = Array.from({ length: 60 }, () => [])
  g[17] = ['Período', 'Hasta', 'Se paga el', 'Obreros', 'Oficina', 'Dirección', 'TOTAL', 'Efectivo']
  for (let f = 19; f <= 27; f++) g[f - 1] = ['', '', '', '', '', VENTANA(f), '', '']
  g[27] = ['⇒ Total a pagar hasta diciembre', '', '', '', '', '', '', '']
  g[35] = ['Mes', 'Ajuste escalón', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Adelanto', 'Proyectado']
  for (let f = 37; f <= 48; f++) g[f - 1] = ['Mes', '', 1000, 'pagado', '', '', '', '']
  g[36][5] = BANCO(5, 8)      // F37 enero — banco de verdad
  g[37][5] = BANCO(24, 25)    // F38 febrero — ídem
  for (let f = 41; f <= 44; f++) g[f - 1][5] = VENTANA(f + 1) // F41:F44 — la ventana del calendario
  g[47][5] = dic              // F48 diciembre — el total adentro del cuerpo
  g[48] = ['⇒ Oficina — pagado y por pagar en el año', '', '', '', '', '=SUM(F$37:F$48)', '', '']
  return g
}

test('EL TOTAL DUPLICADO: diciembre tenía un SUM de su propia columna y la fila de total lo volvía a sumar', () => {
  const g = conOficina()
  const { vaciables, conservadas } = residuosDeclarados(g, candidatasDeBancoOficina(g))
  const filas = vaciables.map((v) => v.fila)
  assert.ok(filas.includes(48), 'diciembre sigue con el total adentro de la tabla: el canal se publica al doble')
  assert.deepEqual(filas, [41, 42, 43, 44, 48],
    'tienen que salir las cuatro ventanas del calendario y el total de diciembre, y nada más')
  // EL LADO QUE IMPORTA: el banco de verdad se conserva. Si esto se rompe, el arreglo borra el dato.
  const sanas = conservadas.map((c) => c.fila)
  assert.ok(sanas.includes(37) && sanas.includes(38), 'se marcó como residuo un banco leído del espejo')
  assert.equal(vaciables.find((v) => v.fila === 48).gemelo, 49, 'el gemelo de diciembre es la fila de total')
})

test('EL ANCLA ES EL ENCABEZADO, NO LA FILA: el bloque se corre y las coordenadas siguen bien', () => {
  // El propio arreglo mueve el cuadro —entra la línea del acuerdo 50/50 arriba— así que una lista de
  // coordenadas escrita a mano sería correcta hasta la corrida siguiente, y después borraría la celda
  // de al lado. Ése es exactamente el modo en que se pierde el trabajo del dueño.
  const g = conOficina()
  g.splice(30, 0, ['Por banco — contra el acuerdo 50/50 declarado'])  // el bloque baja un renglón
  const filas = residuosDeclarados(g, candidatasDeBancoOficina(g)).vaciables.map((v) => v.fila)
  assert.deepEqual(filas, [42, 43, 44, 45, 49], 'las candidatas no siguieron al bloque cuando se movió')
})

test('SIN ANCLA NO SE TOCA NADA: falla cerrado', () => {
  const g = conOficina()
  g[35] = ['Mes', 'Ajuste escalón', 'Pagado']  // el encabezado ya no es el del cuadro
  assert.deepEqual(candidatasDeBancoOficina(g), [], 'sin encabezado reconocible tiene que devolver lista vacía')
})

test('UN BANCO SANO EN TODA LA COLUMNA NO PRODUCE UNA SOLA CANDIDATA VACIABLE', () => {
  const g = conOficina({ dic: BANCO(90, 93) })
  for (let f = 41; f <= 44; f++) g[f - 1][5] = BANCO(f * 2, f * 2 + 3)
  const { vaciables } = residuosDeclarados(g, candidatasDeBancoOficina(g))
  assert.deepEqual(vaciables, [], 'la limpieza tocaría celdas legítimas de la columna Banco')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA COLUMNA «Banco» DEL BLOQUE 3 (DIRECCIÓN) — la que nadie miraba (15/08)
//
// La pestaña tiene DOS cuadros con el encabezado «Mes · Ajuste escalón · Pagado · Estado · Se paga
// el · Banco · Adelanto · Proyectado», carácter por carácter: Oficina (fila 53 del archivo vivo) y
// Dirección (fila 76). `findIndex` devolvía el primero y ahí se quedaba. Medido en el archivo:
//
//   F88  "Básico convenio"   ← el encabezado vivo de esa columna está en F96, adentro del 4.1
//
// publicado en el renglón de Diciembre de los retiros de los socios.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Los dos cuadros mensuales y el 4.1, con las coordenadas del archivo vivo del 15/08. */
function conDosCuadros({ f88 = 'Básico convenio' } = {}) {
  const g = Array.from({ length: 105 }, () => [])
  const ENCABEZADO = ['Mes', 'Ajuste escalón', 'Pagado', 'Estado', 'Se paga el', 'Banco', 'Adelanto', 'Proyectado']
  g[52] = [...ENCABEZADO]                                        // fila 53 — Oficina
  for (let f = 54; f <= 65; f++) g[f - 1] = ['Mes', '', 1000, 'pagado', '', '', '', '']
  g[65] = ['⇒ Oficina — pagado y por pagar en el año', '', '', '', '', '', '', '']
  g[75] = [...ENCABEZADO]                                        // fila 76 — Dirección, el segundo
  for (let f = 77; f <= 88; f++) g[f - 1] = ['Mes', '', 1000, 'pagado', '', '', '', '']
  g[87][5] = f88                                                 // F88 — el residuo
  g[88] = ['⇒ Dirección — pagado y por pagar en el año', '', '', '', '', '', '', '']
  g[95] = ['Categoría', 'Personas', 'Σ $/hora', '$/hora mínimo', 'Convenio (tuya)', 'Básico convenio', 'Margen', 'Estado']
  for (let f = 97; f <= 100; f++) g[f - 1] = ['OF', 4, 23700, 5400, '', 6348, -0.149, '✓ sobre el convenio']
  g[100] = ['⇒ Plantel base — la última quincena cerrada', 15, 80400, 4500, '', '', '', '']
  return g
}

test('LOS DOS ENCABEZADOS «Mes … Banco … Proyectado», no sólo el primero', () => {
  assert.deepEqual(encabezadosDeMesBanco(conDosCuadros()), [52, 75],
    'con findIndex la columna Banco de Dirección no era candidata de nada')
})

test('F88 «Básico convenio» se prueba contra su gemelo VIVO en F96, adentro del 4.1', () => {
  const g = conDosCuadros()
  const { vaciables, conservadas } = residuosDeclarados(g, candidatasDeBancoDireccion(g))
  assert.deepEqual(vaciables.map((v) => [v.fila, v.col, v.gemelo]), [[88, 5, 96]],
    `el residuo del renglón de Diciembre no se pudo probar: ${conservadas.map((c) => c.motivo).join(' · ')}`)
})

test('y las once celdas sanas de esa columna se conservan, una por una', () => {
  const { conservadas } = residuosDeclarados(conDosCuadros(), candidatasDeBancoDireccion(conDosCuadros()))
  assert.equal(conservadas.length, 11, 'la limpieza tocaría celdas legítimas de la columna Banco')
  assert.ok(conservadas.every((c) => /vacía|NO tiene gemelo/.test(c.motivo)))
})

test('EL SEGURO: un retiro que el dueño cargó a mano en esa misma celda NO se borra', () => {
  // Es la razón por la que la columna se emite con cadena vacía. Un importe sin gemelo vivo adentro
  // del 4.1 no tiene con qué probarse, y el lado para equivocarse es conservar.
  const g = conDosCuadros({ f88: 3000000 })
  const { vaciables, conservadas } = residuosDeclarados(g, candidatasDeBancoDireccion(g))
  assert.deepEqual(vaciables, [], 'se borró un retiro cargado a mano')
  assert.ok(conservadas.some((c) => c.fila === 88 && /NO tiene gemelo vivo/.test(c.motivo)))
})

test('SIN EL 4.1 NO SE BUSCA GEMELO AHÍ: falla cerrado', () => {
  const g = conDosCuadros()
  g[95] = ['Categoría', 'Personas']          // el 4.1 ya no es reconocible
  const { vaciables } = residuosDeclarados(g, candidatasDeBancoDireccion(g))
  assert.deepEqual(vaciables, [], 'sin la tabla viva no hay nada que probar y no se toca nada')
})

test('SIN SEGUNDO CUADRO, LISTA VACÍA', () => {
  const g = conDosCuadros()
  g[75] = ['Mes', 'Ajuste escalón', 'Pagado']
  assert.deepEqual(candidatasDeBancoDireccion(g), [])
})

test('el fin de un bloque es su fila de TOTAL, y sin total no se inventa un tope', () => {
  const g = conDosCuadros()
  assert.equal(finDeBloque(g, 95), 101, 'el 4.1 termina en su ⇒ Plantel base')
  g[100] = ['Categoría suelta']
  assert.equal(finDeBloque(g, 95), -1, 'un rango que se estira encuentra gemelos en otra tabla')
})
