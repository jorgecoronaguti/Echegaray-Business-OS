// LO INVERTIDO, LEÍDO POR RÓTULO — y las mutaciones que prueban que el control puede gritar.
//
// EL DEFECTO QUE ESTE ARCHIVO MANTIENE MUERTO. Los dos Cash Flow publicaban la caja OPERATIVA al
// cierre —banco y efectivo— y ninguna de sus cifras incluía los $45.015.210 que están en Balanz.
// El dueño: *"caja a fin de año está mal"*.
//
// Y EL SEGUNDO, QUE ES PEOR PORQUE NO SE VE: si la suma de lo invertido diera 0, la tarjeta de
// liquidez total valdría exactamente lo mismo que la de caja operativa y nadie notaría que dejó de
// leer nada. Un control que no puede decir que no es una constante disfrazada.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  expresionInvertido, formulasDeLiquidez, glosaConInvertido, liquidezDeNumeros,
  emparejaCriterio, esInvertido, citaUnaFilaDe,
  CRITERIO_INVERTIDO, MARCA_INVERTIDO, COL_ROTULO, COL_PESOS,
  AVISO_SIN_INVERTIDO, GLOSA_SIN_INVERTIDO, IMPORTE_MUESTRA, muestraIncluye,
} from './cash-flow-invertido.mjs'
import { IMPORTE_MAS_LARGO } from './cash-flow-hero-cabe.mjs'
import { grilla } from './caja-grilla.mjs'
import { CUENTAS } from './caja-disponibilidades.mjs'

/** Lo mínimo que `caja-grilla` necesita para armarse en memoria. No toca la red. */
const REFS_CAJA = {
  cheques: 'Cheques Emitidos',
  recibidos: 'Cheques Recibidos',
  tarjeta: 'Tarjeta',
  bancoRaw: '_BANCO_RAW',
  cierre: 'CF_CIERRE',
  inicio: 'CF_INICIO',
  cab: 'CF_MESES',
  filasCal: { iva: 10, iibb: 11 },
}

/**
 * QUÉ FILAS ENTRAN — evaluando EL CRITERIO QUE SE PUBLICA, no una copia escrita a mano.
 *
 * La versión anterior de esta línea decía `rotulo.endsWith(MARCA_INVERTIDO)`: una segunda
 * implementación que NO derivaba de `CRITERIO_INVERTIDO`. Con eso, aflojar el criterio a `*‖*` dejaba
 * los 58 tests en verde mientras la fórmula publicada se llevaba la fila de los echeq en custodia y la
 * del TOTAL de la caja. Un control no se valida contra otra información que la que produce.
 */
const empareja = esInvertido

const letraACol = (l) => l.charCodeAt(0) - 'A'.charCodeAt(0)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA SEMÁNTICA DEL CRITERIO — lo que de verdad decide qué filas entran en la suma
// ══════════════════════════════════════════════════════════════════════════════════════════════════

// ═══ EL ESCAPE QUE FALTABA: `~~` ES LA TILDE LITERAL DE SHEETS ═══
//
// `~*` y `~?` andaban; `~~` tiraba `SyntaxError: Invalid regular expression: /^\~$/iu` porque con el
// flag `u` la tilde NO es un identity escape válido. Lo encontró la auditoría, no el autor: de los
// seis comportamientos que este módulo documenta, era el único que la verificación contra Sheets vivo
// no había cubierto. Hoy el criterio publicado no lleva tildes — pero un módulo que dice implementar
// la semántica de Sheets no puede reventar en uno de los casos que dice implementar.
test('los tres escapes de Sheets son literales, y la tilde no revienta', () => {
  assert.equal(emparejaCriterio('~*', '*'), true, 'asterisco literal')
  assert.equal(emparejaCriterio('~?', '?'), true, 'signo de pregunta literal')
  assert.equal(emparejaCriterio('~~', '~'), true, 'tilde literal — esto tiraba SyntaxError')
  assert.equal(emparejaCriterio('~~', 'x'), false, 'y sigue siendo una igualdad, no un comodín')
  assert.equal(emparejaCriterio('~*', 'cualquier cosa'), false, 'escapado NO es comodín')
})

test('el criterio se interpreta como lo interpreta Sheets, no como una expresión regular', () => {
  // `*` cualquier cosa · `?` un carácter · `~*` el asterisco literal · sin comodines, IGUALDAD.
  assert.equal(emparejaCriterio('*x', 'una x'), true)
  assert.equal(emparejaCriterio('*x', 'x una'), false)
  assert.equal(emparejaCriterio('a?c', 'abc'), true)
  assert.equal(emparejaCriterio('a?c', 'abbc'), false)
  assert.equal(emparejaCriterio('a~*b', 'a*b'), true)
  assert.equal(emparejaCriterio('a~*b', 'aXb'), false)
  // SIN COMODINES ES IGUALDAD, NO "CONTIENE": si esto se leyera como "contiene", el criterio
  // `‖ invertido` a secas parecería seguro y se llevaría cualquier fila que lo mencionara.
  assert.equal(emparejaCriterio('Balanz', 'Balanz · inversiones ARS ‖ invertido'), false)
  // Y no distingue mayúsculas, igual que Sheets.
  assert.equal(emparejaCriterio('*‖ INVERTIDO', 'Balanz · inversiones ARS ‖ invertido'), true)
  // El punto: el criterio que se publica sale de la marca, y así emparejado es lo que el resto de este
  // archivo simula. Si alguien cambia la constante, cambia lo que TODOS estos tests ven.
  assert.equal(CRITERIO_INVERTIDO, `*${MARCA_INVERTIDO}`)
  assert.equal(esInvertido(`Lo que sea ${MARCA_INVERTIDO}`), true)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL EMPAREJAMIENTO — contra la grilla de CAJA de verdad, no contra una que yo describa
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el criterio encuentra EXACTAMENTE las filas que CAJA declaró invertidas, y en las columnas que cita', () => {
  const g = grilla(new Map(), REFS_CAJA)
  const encontradas = g.filas
    .map((f, i) => (empareja(f?.[letraACol(COL_ROTULO)]) ? i + 1 : 0))
    .filter(Boolean)

  // Las dos filas de Balanz, ni una más: el ‖ de "Valores a depositar" también marca una fila que el
  // total resta, pero NO es plata invertida —es un echeq en custodia— y no tiene por qué entrar acá.
  assert.deepEqual(encontradas, [g.fBalanzArs, g.fBalanzUsd])
  assert.ok(g.noSuman.includes(g.fBalanzArs) && g.noSuman.includes(g.fBalanzUsd),
    'las filas que la tarjeta suma tienen que ser las que la caja operativa RESTA, o el número se contaría dos veces')

  // Y LA FILA DE CIERRE LLEVA EL MISMO `‖` ("Total disponibilidades ‖ percibido"). Un criterio aflojado
  // a `*‖*` se la tragaría entera y la tarjeta de liquidez sumaría la caja dos veces; por eso el
  // criterio termina en la palabra que declara la naturaleza, no en el símbolo que declara que no suma.
  const cierre = String(g.filas[g.fCierre - 1][0])
  assert.ok(cierre.includes('‖'), cierre)
  assert.ok(!empareja(cierre), `el criterio se traga el total de la caja: ${cierre}`)

  // Y la columna que la expresión suma es la del saldo en pesos, no la del importe en origen: sumar la
  // columna de origen mezclaría $22.530.000 con U$S 15.000 en un mismo total.
  for (const f of encontradas) {
    assert.match(String(g.filas[f - 1][letraACol(COL_PESOS)]), /^=/, 'la columna C de una cuenta tiene que ser el saldo calculado en pesos')
  }
})

test('LA MUTACIÓN POSICIONAL: una cuenta nueva arriba corre las filas y una referencia por fila apunta a otra cosa', () => {
  const g = grilla(new Map(), REFS_CAJA)
  const filaVieja = g.fBalanzArs

  // El mismo panel con una cuenta más antes de Balanz. Es lo que pasa cada vez que la empresa abre una
  // cuenta: `caja-disponibilidades` gana un renglón y todo lo de abajo baja una fila.
  const corrido = g.filas.map((f) => f.slice())
  corrido.splice(filaVieja - 1, 0, ['Banco Nación · cta cte ARS', 0, '=IF(ISNUMBER(B10);B10;"")', ''])

  // Por RÓTULO: la fila cambió y la cuenta se sigue encontrando.
  const porRotulo = corrido.map((f, i) => (empareja(f?.[0]) ? i + 1 : 0)).filter(Boolean)
  assert.deepEqual(porRotulo, [filaVieja + 1, g.fBalanzUsd + 1])

  // POR FILA: `Caja!$C$11` sigue devolviendo un número —el de la cuenta nueva— sin un solo #REF!. Ése
  // es el modo de falla, y es por eso que la expresión NO puede citar una fila.
  assert.notEqual(corrido[filaVieja - 1][0], g.filas[filaVieja - 1][0])
  assert.equal(corrido[filaVieja - 1][0], 'Banco Nación · cta cte ARS')
  assert.ok(!expresionInvertido('Caja').match(/\$[AC]\$\d/), 'la expresión volvió a citar una fila de CAJA')
})

test('LAS DOS DEFINICIONES DE «LO INVERTIDO» SELECCIONAN LAS MISMAS FILAS — y se separan con ruido, no en silencio', () => {
  // ═══ LÍMITE DECLARADO, CON SU GUARDA ═══
  //
  // `caja-tarjetas.mjs` define lo invertido como `N(invArs)+N(invUsd)`: dos celdas que `caja-grilla`
  // ubica por el campo `banco: 'balanzArs'|'balanzUsd'`. Este módulo lo define por la MARCA
  // `‖ invertido`. Son DOS definiciones del mismo concepto crítico y hoy dan lo mismo — pero eso no se
  // confía: el día que exista una cuenta invertida que no sea de Balanz, CAJA mostraría una cifra y
  // los Cash Flow otra, de la misma plata. Realidad única. La unificación correcta vive en el
  // generador de CAJA (que derive esas dos filas de la misma marca) y hoy no se toca; mientras tanto
  // esto se pone rojo ANTES de que las dos versiones se separen.
  const g = grilla(new Map(), REFS_CAJA)
  const porMarca = g.filas.map((f, i) => (empareja(f?.[0]) ? i + 1 : 0)).filter(Boolean)
  const porCableado = [g.fBalanzArs, g.fBalanzUsd] // lo que caja-tarjetas suma en la tarjeta INVERTIDO
  assert.deepEqual(porMarca, porCableado,
    'CAJA y los Cash Flow dejaron de seleccionar las mismas filas: hay dos definiciones de lo invertido')
})

test('todo lo que CAJA declara invertido está hoy en Balanz — la glosa nombra al broker y no puede mentir', () => {
  const invertidas = CUENTAS.filter((c) => empareja(c.nombre))
  assert.ok(invertidas.length >= 2, 'desaparecieron las cuentas invertidas de CAJA')
  for (const c of invertidas) {
    assert.match(c.nombre, /balanz/i,
      `"${c.nombre}" está declarada invertida y no es de Balanz: la glosa "invertido en Balanz" dejó de ser cierta`)
    assert.equal(c.noSuma, true, `"${c.nombre}" tiene que quedar fuera de la caja operativa`)
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA DECISIÓN — probada con números, no con la forma de un IF
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la liquidez total suma; y con 0 o sin dato NO publica el número de la caja operativa', () => {
  assert.deepEqual(liquidezDeNumeros({ cierre: 27493859, invertido: 45015210 }), { total: 72509069, aviso: null })
  // Las tres formas de no poder leerlo terminan en lo mismo: un aviso, nunca el cierre pelado.
  for (const invertido of [0, null, undefined, NaN]) {
    const r = liquidezDeNumeros({ cierre: 27493859, invertido })
    assert.equal(r.total, null, `con invertido=${invertido} publicó un total`)
    assert.equal(r.aviso, GLOSA_SIN_INVERTIDO)
  }
  // Un cierre negativo no es un impedimento: se le suma lo invertido igual, que es el punto.
  assert.equal(liquidezDeNumeros({ cierre: -10000000, invertido: 45015210 }).total, 35015210)
})

test('las fórmulas emiten esas dos ramas y ninguna otra', () => {
  const f = formulasDeLiquidez({ refCierre: '$M$50', exprInvertido: expresionInvertido('CAJA') })
  assert.ok(f.valor.includes(`"${AVISO_SIN_INVERTIDO}"`), f.valor)
  assert.ok(f.valor.includes('N($M$50)+N(SUMIF('), f.valor)
  assert.ok(f.glosa.includes(`"${GLOSA_SIN_INVERTIDO}"`), f.glosa)
  assert.ok(f.glosa.includes('en Balanz'), f.glosa)
  // ═══ LA VENTANA DE TIEMPO, DECLARADA DONDE SE LEE LA CIFRA ═══
  //
  // La tarjeta suma el saldo PROYECTADO al 31/12 con un SUMIF que vale HOY: $45.015.210 sobre
  // $72.509.069 — el 62% de la cifra — bajo un rótulo que dice "al 31/12". Regla de oro 3. El supuesto
  // (que lo invertido no se rescata ni rinde en cuatro meses) no se puede eliminar sin inventar una
  // proyección de Balanz que el OS no tiene, así que se declara. Si alguien saca las dos palabras, la
  // tarjeta vuelve a mezclar dos ventanas en silencio.
  assert.ok(/valuado hoy/.test(f.glosa), `la glosa dejó de declarar que lo invertido vale HOY: ${f.glosa}`)
  assert.ok(/valuado hoy/.test(f.muestra), f.muestra)
  // El separador del archivo es `;` (es-AR) y el patrón de formato va en US: las dos reglas conviven
  // en la misma fórmula y confundirlas deja la celda en #ERROR! o el número sin puntos.
  assert.ok(!f.valor.includes(','), `separador de coma en: ${f.valor}`)
  assert.ok(f.glosa.includes('"$ #,##0"'), f.glosa)

  // Sin pestaña que leer no hay fórmula: la celda dice el aviso, y NO queda vacía ni en cero.
  const sin = formulasDeLiquidez({ refCierre: '$M$50', exprInvertido: null })
  assert.deepEqual(sin, { valor: AVISO_SIN_INVERTIDO, glosa: GLOSA_SIN_INVERTIDO, muestra: GLOSA_SIN_INVERTIDO })
  assert.equal(expresionInvertido(null), null)
  assert.equal(expresionInvertido('  '), null)
})

test('el título de la pestaña se cita entero, con espacios y con comilla adentro', () => {
  assert.ok(expresionInvertido('Caja al día').includes("'Caja al día'!$A:$A"))
  assert.ok(expresionInvertido("O'Caja").includes("'O''Caja'!$A:$A"))
  assert.ok(expresionInvertido('CAJA').includes(`"${CRITERIO_INVERTIDO}"`))
})

test('la guarda «nunca por fila» ve las cuatro columnas, no la primera', () => {
  // Escrita dos veces, cerró una sola: la del Semanal miraba la columna 0 de la fila de glosas y una
  // referencia posicional metida en cualquiera de los otros tres slots pasaba en verde. Es UN control.
  assert.equal(citaUnaFilaDe('CAJA', "=N('CAJA'!$C$11)"), true)
  assert.equal(citaUnaFilaDe('CAJA', '=N(CAJA!C11)'), true)
  assert.equal(citaUnaFilaDe('CAJA', "=SUMIF('CAJA'!$A:$A;\"x\";'CAJA'!$C:$C)"), false)
  assert.equal(citaUnaFilaDe('Caja al día', "=N('Caja al día'!$AA$7)"), true)
  // Y no se confunde con OTRA pestaña citada por fila: eso lo caza el control de fuente única.
  assert.equal(citaUnaFilaDe('CAJA', "=N('Cobranzas'!$C$11)"), false)
})

test('la glosa del Semanal cuelga de la fecha y avisa igual cuando no puede leer', () => {
  const con = glosaConInvertido('"al "&TEXT(CAJA_FECHA_SALDO;"d/mm")', expresionInvertido('CAJA'))
  assert.ok(con.startsWith('="al "&TEXT(CAJA_FECHA_SALDO;"d/mm")&IF('), con)
  assert.ok(con.includes(GLOSA_SIN_INVERTIDO) && con.includes('invertido en Balanz'), con)
  const sin = glosaConInvertido('"al "&TEXT(CAJA_FECHA_SALDO;"d/mm")', null)
  assert.equal(sin, `="al "&TEXT(CAJA_FECHA_SALDO;"d/mm")&" · ${GLOSA_SIN_INVERTIDO}"`)
})

test('la muestra con la que se miden las glosas es el MISMO peor caso que mide el auditor de ancho', () => {
  // Dos constantes con el mismo número escrito distinto se desincronizan sin que nadie lo note, y
  // entonces el titular se mide contra una cifra más corta que la que puede llegar a mostrar.
  const digitos = (s) => String(s).replace(/\D/g, '')
  assert.equal(digitos(IMPORTE_MUESTRA), digitos(IMPORTE_MAS_LARGO))
  assert.ok(muestraIncluye().includes(IMPORTE_MUESTRA))
})
