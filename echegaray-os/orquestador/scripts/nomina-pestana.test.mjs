import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { conEfectivoRedondeadoDelDueno, COL_REDONDEADO, oficinaDelEspejo } from './nomina-pestana.mjs'

// ═══ QUÉ DEFECTO ATRAPAN ESTOS TESTS ═══
//
// La columna «EFECTIVO redondeado» la tipea el DUEÑO: es la cifra que decide al pagar y el OS no la
// puede deducir de ninguna fuente («voy a hacer cargas manuales de montos en columna efectivo
// redondeado, no tocarla»). Hasta el 09/09 la única protección era la guarda NO-BORRAR: el generador
// escribía `''` en esa celda y la fusión conservaba lo que hubiera. Es una protección POR CELDA, y
// por eso se rompe sola en cuanto el cuadro cambia de fila.
//
// Se rompió, y así estaba publicado en el archivo vivo: quince importes suyos en `I14:I28` sobre un
// cuadro de personas que va de la fila 11 a la 25. Doce quedaron al lado de OTRA persona y tres sobre
// la fila de total, una nota y el título del cuadro de oficina.
//
// El fixture de abajo es exactamente esa forma: previo con el cuadro dos filas más abajo que el
// nuevo. Si `conEfectivoRedondeadoDelDueno` volviera a anclarse en el número de fila, el importe de
// Aguero aparecería al lado de Tello y estos tests se ponen en rojo.

/** Un «antes» con el cuadro arrancando en la fila 6 y la columna del dueño con tres importes. */
const previo = () => [
  ['Nómina'],
  ['Jornales · recibos · al 09/09/2026'],
  [],
  ['⇒ Total a pagar', 999],
  ['1 · OBREROS · QUINCENA 01/09–15/09'],
  ['Persona', 'Categoría', 'COBRA', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR', 'EFECTIVO redondeado', 'Horas', '$/hora'],
  ['AGUERO CRISTIAN', 'Oficial', 100, '', '', '', '', '', 412000, 54, 5974],
  ['GONZALEZ EMILIANO  ▲ sin cargar desde el 03/09', 'Ayudante', 200, '', '', '', '', '', 327000, 41, 4950],
  ['TELLO JUAN', 'Oficial', 300, '', '', '', '', '', 320000, 23, 5924],
  ['⇒ 3 persona(s)', '', 600, '', '', '', '', '', '=SUM(I7:I9)', 118, ''],
]

/** El «después»: el mismo cuadro dos filas más arriba, con la columna del dueño vacía. */
const nueva = () => [
  ['Nómina'],
  ['Jornales · recibos · al 09/09/2026'],
  [],
  ['1 · OBREROS · QUINCENA 01/09–15/09'],
  ['Persona', 'Categoría', 'COBRA', 'ADELANTO', 'YA TRANSFERIDO', 'POR BANCO', 'EN EFECTIVO', 'TOTAL A PAGAR', 'EFECTIVO redondeado', 'Horas', '$/hora'],
  ['AGUERO CRISTIAN', 'Oficial', 100, '', '', '', '', '', '', 54, 5974],
  ['GONZALEZ EMILIANO', 'Ayudante', 200, '', '', '', '', '', '', 41, 4950],
  ['TELLO JUAN', 'Oficial', 300, '', '', '', '', '', '', 23, 5924],
  ['⇒ 3 persona(s)', '', 600, '', '', '', '', '', '=SUM(I6:I8)', 118, ''],
]

test('«EFECTIVO redondeado» viaja con su PERSONA cuando el cuadro cambia de fila', () => {
  const { grid, copiadas } = conEfectivoRedondeadoDelDueno(nueva(), previo())
  assert.equal(copiadas, 3)
  const por = new Map(grid.filter((f) => f[COL_REDONDEADO] !== '').map((f) => [f[0], f[COL_REDONDEADO]]))
  assert.equal(por.get('AGUERO CRISTIAN'), 412000)
  assert.equal(por.get('TELLO JUAN'), 320000)
  // Y NO por número de fila: en la grilla nueva la fila 7 es Gonzalez, no Aguero. Un ancla por fila
  // le pondría a Gonzalez los $412.000 de Aguero, que es lo que estaba publicado en el archivo.
  assert.notEqual(por.get('GONZALEZ EMILIANO'), 412000)
})

test('el aviso pegado al nombre no le hace perder el importe a esa persona', () => {
  // La pestaña vieja escribía «GONZALEZ EMILIANO  ▲ sin cargar desde el 03/09» adentro de la celda del
  // nombre. Sin recortar el aviso, esa fila no se reconoce y su importe sale huérfano: el defecto
  // quedaría arreglado para catorce personas y roto justo para la que más se mira.
  const { grid } = conEfectivoRedondeadoDelDueno(nueva(), previo())
  const fila = grid.find((f) => f[0] === 'GONZALEZ EMILIANO')
  assert.equal(fila[COL_REDONDEADO], 327000)
})

test('la fórmula de la fila de total NO se toma como un importe del dueño', () => {
  // `=SUM(I7:I9)` es del generador. Leído como VALOR llega como un importe y se denunciaría como
  // huérfano en cada corrida — un aviso que suena siempre deja de mirarse.
  const { huerfanos } = conEfectivoRedondeadoDelDueno(nueva(), previo())
  assert.deepEqual(huerfanos, [])
})

test('un importe que no está en la fila de una persona se DENUNCIA, no se reubica', () => {
  // Los tres importes que en el archivo vivo cayeron sobre la fila de total, sobre una nota y sobre
  // el título del cuadro de oficina. Reubicarlos «por orden» sería adivinar a quién se le entregan
  // esos billetes: es plata, y la decisión no es del OS.
  const p = previo()
  p[9][COL_REDONDEADO] = 120000                          // encima de «⇒ 3 persona(s)»
  const { grid, huerfanos } = conEfectivoRedondeadoDelDueno(nueva(), p)
  assert.deepEqual(huerfanos, [{ fila: 10, valor: 120000 }])
  assert.equal(grid.filter((f) => f[COL_REDONDEADO] === 120000).length, 0)
})

test('a nadie que no tenga importe suyo se le inventa uno', () => {
  const p = previo()
  p[6][COL_REDONDEADO] = ''                              // Aguero sin monto tipeado
  const { grid, copiadas } = conEfectivoRedondeadoDelDueno(nueva(), p)
  assert.equal(copiadas, 2)
  assert.equal(grid.find((f) => f[0] === 'AGUERO CRISTIAN')[COL_REDONDEADO], '')
})

// ═══ EL CONTRATO DE COLUMNAS: UNO SOLO PARA LOS TRES CUADROS ═══
//
// El dueño, 09/09: «los diseños de todas las pestañas son distintos, tenés que mejorar y unificar».
// Acá el descuadre era literal: el cuadro 1 declaraba doce columnas, el 2 nueve con «Quincenas del
// mes» en la letra de «EFECTIVO redondeado» y el 3 nueve con «MITAD BLANCA» en esa misma letra.
//
// Se mide sobre el TEXTO del generador porque armar su grilla necesita la red (el espejo de jornales,
// los recibos, Postgres). Es lo mismo que hace `pestanas-sin-prosa.test.mjs` con la prosa, y cuesta
// cero llamadas a la API.
const fuente = readFileSync(new URL('./nomina-pestana.mjs', import.meta.url), 'utf8')

test('los tres cuadros escriben el MISMO encabezado, y sale de una sola constante', () => {
  const encabezados = [...fuente.matchAll(/^\s*fila\((.*)\)$/gm)]
    .map((m) => m[1])
    .filter((x) => x.includes('COLUMNAS') || x.includes("'Persona'"))
  assert.equal(encabezados.length, 3, `esperaba tres encabezados de tabla y encontré ${encabezados.length}`)
  // Ninguno puede escribir la lista a mano: dos listas literales son dos contratos que se separan.
  assert.deepEqual([...new Set(encabezados)], ['...COLUMNAS'])
})

test('el titular no puede sumarse a sí mismo', () => {
  // Las tres cifras del titular empiezan con «⇒», igual que las filas de total que suman. Si el rango
  // del SUMIF las alcanzara, Sheets publicaría #REF! en las tres — pasó con la versión anterior de
  // este titular, en su primera corrida.
  const m = fuente.match(/const deTodos = \(col\) => `SUMIF\(\$A\$\$\{(\w+)\}/)
  assert.ok(m, 'no encontré la fórmula del titular')
  const nombre = m[1]
  const decl = fuente.match(new RegExp(`const ${nombre} = (\\d+)`))
  assert.ok(decl, `no encontré la declaración de ${nombre}`)
  // El titular ocupa las filas 4, 5 y 6: el rango tiene que arrancar en la 7 o más abajo.
  assert.ok(Number(decl[1]) >= 7, `el rango del titular arranca en la fila ${decl[1]} y se sumaría a sí mismo`)
})

test('oficinaDelEspejo lee las columnas de canal de OFICINA, no las de obra', () => {
  // Regresión de dominio que ya costó un aviso: `_J_OFICINA` tiene V $/hora · W banco · X adelanto ·
  // Y total (índices 21 a 24). Con las letras de obra, el adelanto de alguien sale en su banco.
  const grid = [
    ['', 'OBRERO'],
    ['', 'EMI MALDONADO', ...Array(19).fill(''), 1000, 2000, 3000, 4000],
    ['', 'SIN PAGO', ...Array(19).fill(''), 0, 0, 0, 0],
  ]
  const m = oficinaDelEspejo(grid)
  assert.deepEqual(m.get('EMI MALDONADO'), { nombre: 'EMI MALDONADO', fila: 2, hora: 1000, banco: 2000, adelanto: 3000, total: 4000 })
  assert.equal(m.has('SIN PAGO'), false)
})
