// NINGÚN GENERADOR VUELVE A ESCRIBIR UNA MARCA QUE EL PDF NO DIBUJA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El 13/08 se midieron ~1.060 celdas del archivo vivo con un glifo que el exportador a PDF no embebe:
// la marca que existe para que alguien mire justo ahí era lo único que no se veía en el papel con el
// que el dueño va a una reunión. La causa no fue una decisión: fue que el `⚠` estaba TIPEADO en
// treinta archivos, así que corregirlo en uno no corregía nada y nadie se enteraba.
//
// Este archivo cierra esa puerta por los dos lados:
//
//   1. POR EL RESULTADO — se le pide a los generadores el texto que de verdad publican y se le pasa
//      el mismo detector que audita el Sheet (`glifosInvisibles`). Si mañana una marca vuelve a salir
//      con emoji, acá se pone rojo antes de llegar a una celda.
//   2. POR LA FUENTE — se lee el código de los archivos ya corregidos y se prohíbe el literal. Sin
//      esto, un `⚠` nuevo en una rama de un `IF` que el test no ejercita pasaría igual.
//
// Y SE CUSTODIA LA CONSTANTE: si alguien cambia `ALERTA` por un glifo emoji, el punto 1 se cae solo.
//
// ═══ POR QUÉ HAY UNA LISTA DE EXCEPCIONES Y NO ES UNA GRIETA ═══
//
// Tres clases de archivo tienen que poder nombrar el glifo viejo: el que lo declara
// (`glifos.mjs`), los que RECONOCEN lo ya publicado para no tratarlo como texto ajeno, y los que
// leen el semáforo de "Compras"/"Cobranzas", que es de AppSheet y del dueño. Cada uno está listado
// con su motivo. Una excepción sin motivo escrito es la forma en que esta lista se convertiría en
// una lista de "todo".

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALERTA, SEMAFORO, esInvisible, glifosInvisibles } from './glifos.mjs'
import { formulaEstadoPago } from './compras-valores.mjs'
import { MARCAS, marcaDe } from './cheques-cobertura.mjs'
import { SIN_FACTURA } from './cash-flow-conciliacion.mjs'
import { formulasInstrumento, formulaChequesSinFactura, INSTRUMENTOS } from './cash-flow-lineas.mjs'
import { rotuloAlDia, formulaAntiguedad } from './fecha-de-frescura.mjs'
import { MARCA_ALERTA as MARCA_ALERTA_CAJA } from './caja-avisos.mjs'
import { A_VERIFICAR } from './cargas-cadena.mjs'
import { esDistintiva } from './huella-forma.mjs'
import { formaDeGenerador } from './residuo-propio.mjs'
import { ES_TOTAL } from './estilo-statement.mjs'
import { tratamientoDeFilas } from './impuestos-piel.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..')

/** Lo que se le pide a un generador y se mira con el mismo detector que audita el Sheet. */
const sinGlifosCiegos = (texto, quien) =>
  assert.deepEqual(glifosInvisibles(texto), [], `${quien} publica un glifo que el PDF no dibuja`)

test('LA CONSTANTE DE ALERTA SIGUE CUSTODIADA: si se vuelve emoji, todo lo de abajo miente', () => {
  assert.equal(esInvisible(ALERTA), false)
  assert.equal(MARCA_ALERTA_CAJA, ALERTA, 'CAJA no puede tener una segunda decisión sobre el glifo')
})

test('las marcas que el OS escribe fila por fila en Cheques Emitidos y Tarjeta SE DIBUJAN', () => {
  for (const [k, v] of Object.entries(MARCAS)) sinGlifosCiegos(v, `MARCAS.${k}`)
  sinGlifosCiegos(marcaDe('', new Set()), 'marcaDe sin comprobante')
  sinGlifosCiegos(marcaDe('0001-00000001', new Set()), 'marcaDe sin factura en Compras')
  // Las dos copias del rótulo tienen que decir lo mismo: `cash-flow-conciliacion` lo redeclara a
  // propósito (audita el cuadro con otro código) y una copia que se queda atrás da $0 sin avisar.
  assert.equal(SIN_FACTURA, MARCAS.falta, 'las dos declaraciones del rótulo se separaron')
})

test('las fórmulas que suman por la marca no publican el glifo viejo COMO TEXTO NUEVO', () => {
  // Ojo con lo que se afirma: la fórmula SÍ nombra el glifo heredado —tiene que reconocerlo— pero lo
  // que quede escrito en una celda de la pestaña es la marca vigente. Se verifica el brazo nuevo.
  const f = formulaChequesSinFactura(1, 2, MARCAS.falta)
  assert.ok(f.includes(`="${MARCAS.falta}"`), 'compara contra la marca vigente')
  assert.ok(f.includes('="⚠ FALTA cargar la factura en Compras — este pago no lo ve el cash flow"'),
    'y sigue reconociendo las filas ya publicadas: sin esto la línea del cuadro da $0')
  const F = formulasInstrumento(INSTRUMENTOS.cheques, MARCAS)
  assert.ok(F.falta.cantidad.includes(`COUNTIF`) && F.falta.cantidad.includes(MARCAS.falta))
  assert.ok(F.falta.cantidad.split('COUNTIF').length === 3, 'cuenta los dos glifos, o pierde 60 filas')
  // La partición tiene que seguir cerrando: `ajena` resta LAS DOS formas de cada marca.
  for (const m of Object.values(MARCAS)) {
    assert.ok(F.noReconocida.cantidad.includes(`-(`), 'ajena resta las marcas')
    assert.ok(F.noReconocida.monto.includes(m), `ajena no resta ${m}: sus filas caerían en "no reconocida"`)
  }
})

test('el semáforo de Compras —846 celdas, la peor concentración del archivo— se dibuja', () => {
  // Era de AppSheet y del dueño; desde el 15/08 lo escribe `scripts/compras-semaforo.mjs`, así que
  // deja de ser una excepción de esta lista y pasa a estar exigido como cualquier otro generador.
  sinGlifosCiegos(formulaEstadoPago(4), 'formulaEstadoPago')
  assert.equal(esInvisible(SEMAFORO.porVencer), false, 'el glifo de "Por vencer" volvió a ser emoji')
  assert.equal(esInvisible(SEMAFORO.vigente), false, 'el glifo de "Vigente" volvió a ser emoji')
  assert.equal(SEMAFORO.vencido, ALERTA, 'el semáforo no puede tener una segunda decisión sobre la alerta')
})

test('los rótulos de frescura —los que más pestañas comparten— se dibujan', () => {
  sinGlifosCiegos(formulaAntiguedad('A1'), 'formulaAntiguedad')
  sinGlifosCiegos(rotuloAlDia('Cartera de terceros', 'A1'), 'rotuloAlDia')
  sinGlifosCiegos(A_VERIFICAR, 'A_VERIFICAR de cargas-cadena')
})

test('LOS QUE RECONOCEN LO PUBLICADO ACEPTAN LOS DOS GLIFOS — si no, el borrado del dueño no se sella', () => {
  // Éste es el peor de los efectos posibles del cambio, y por eso tiene su propio test: si la huella
  // deja de ver como propia una celda ya publicada, el vaciado del dueño no se marca y la corrida
  // siguiente la repone. El reclamo textual: "seguís sin respetar q si hay celdas con contenido q yo
  // borro, no las vuelvas a escribir".
  //
  // EL RÓTULO DE PRUEBA ES CORTO A PROPÓSITO (menos de 23 caracteres). `esDistintiva` acepta también
  // el texto largo, así que con un rótulo largo el test pasaba igual con la marca sacada de la lista:
  // verificaba la regla equivocada. Con uno corto, la MARCA es la única evidencia de propiedad —
  // exactamente el caso que decide si el vaciado del dueño se sella o no.
  for (const marca of [ALERTA, '⚠']) {
    const rotulo = `${marca} sin fecha`
    assert.ok(rotulo.length < 23, 'el rótulo tiene que ser corto o el test mide otra cosa')
    assert.equal(esDistintiva(rotulo), true, `esDistintiva no reconoce "${marca}" como marca propia`)
    assert.equal(formaDeGenerador(rotulo), true, `formaDeGenerador no reconoce "${marca}"`)
    assert.equal(ES_TOTAL.test(rotulo), true, `la piel no rulea la alarma con "${marca}"`)
    const t = tratamientoDeFilas([[rotulo, 100]])
    assert.deepEqual(t.alarmas, [1], `impuestos-piel no ve la alarma con "${marca}"`)
  }
  // Y no se ensanchó de más: una anotación del dueño sigue sin ser "mía".
  assert.equal(esDistintiva('total'), false)
  assert.equal(formaDeGenerador('ojo con esto'), false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL GUARDIÁN POR LA FUENTE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Los archivos que PUEDEN nombrar un glifo invisible, con el motivo al lado.
 *
 * `lib/` y `scripts/` cuelgan de la raíz del orquestador; la ruta es la que se ve en el repositorio.
 */
const PUEDEN_NOMBRARLO = new Map([
  ['lib/glifos.mjs', 'lo declara: es el archivo que decide cuál se dibuja y cuál no'],
  ['lib/glifos.test.mjs', 'lo prueba'],
  // Las CLAVES de su mapa son los cinco emoji publicados en Cobranzas!V: sin poder nombrarlos no
  // habría cómo traducirlos. Los VALORES —lo único que este archivo llega a escribir en una celda—
  // son los que sí se dibujan, y eso lo prueba su propio test contra `esInvisible`.
  ['lib/glifos-semaforo.mjs', 'declara la traducción: sus claves SON los glifos que no se dibujan'],
  ['lib/glifos-semaforo.test.mjs', 'lo prueba contra la fórmula real de Cobranzas!V5'],
  ['scripts/cobranzas-glifos.test.mjs', 'transcribe la fórmula rota para probar que sale traducida'],
  ['lib/glifos-generadores.test.mjs', 'este archivo'],
  ['lib/defectos-pantalla.mjs', 'el detector: nombra el defecto que busca'],
  ['lib/defectos-pantalla.test.mjs', 'lo prueba'],
  ['lib/huella-forma.mjs', 'reconoce lo ya publicado para poder sellar que el dueño lo borró'],
  ['lib/huella-celda.mjs', 'ídem — comenta la lista de marcas'],
  ['lib/residuo-propio.mjs', 'reconoce lo propio ya publicado, incluido el semáforo 🟡✅ que sigue en celdas de Compras'],
  ['lib/estilo-statement.mjs', 'rulea la alarma por su marca, publicada con cualquiera de las dos'],
  ['lib/impuestos-piel.mjs', 'ídem, en la columna A de Impuestos'],
  ['lib/cheques-cobertura.mjs', 'documenta por qué la marca cambió de glifo'],
  ['lib/cash-flow-conciliacion.mjs', 'ídem'],
  ['lib/cash-flow-lineas.mjs', 'ídem, en la fórmula que suma por la marca'],
  ['lib/libro-extractores.mjs', 'compara la marca publicada con `mismaMarca`'],
  ['lib/cheques-emitidos-cabecera.mjs', 'el contrato con CAJA nombra la fórmula vieja y la nueva'],
  ['lib/libro-extractores-compras.mjs', 'lee el semáforo "✅ Pagado" de Compras, que es de AppSheet'],
  ['lib/libro-estado-vivo.mjs', 'ídem'],
  ['lib/cuentas-por-pagar.mjs', 'ídem'],
  ['lib/direccion-retiros.mjs', 'ídem — documenta los estados de Compras!Z'],
  ['lib/cobertura-datos.mjs', 'comentario que cita el rótulo publicado de Cobranzas!BA'],
  ['lib/cash-flow-mapa.mjs', 'el criterio de la línea cita el rótulo, con la marca vigente'],
  ['scripts/cobranzas-control.mjs', 'su lista de "esto lo escribí yo" lleva las dos marcas'],
  ['scripts/proveedores-formato.mjs', 'un título de cuadro puede abrir con cualquiera de las dos'],
  ['scripts/refrescar-proveedores.mjs', 'lee el aviso del generador en su stdout'],
  ['scripts/cheques-cobertura-sheet.mjs', 'decide qué celda de la columna de marcas es suya'],
  ['scripts/cargas-sociales-pestana.mjs', 'comenta el semáforo de Compras, que es de AppSheet'],
])

/**
 * QUÉ SE MIRA DE UNA LÍNEA, Y POR QUÉ NO ES LA LÍNEA ENTERA.
 *
 * Un comentario que explica el defecto NOMBRA el glifo, y tiene que poder hacerlo: si no, el archivo
 * que documenta el problema no podría describirlo. Y una línea de `console.*` va a una terminal, que
 * dibuja los emoji perfectamente — el vocabulario de las corridas (✋ 🔒 🧹 🔖) es deliberado y
 * NO se toca. Lo que este control persigue es lo que termina en una CELDA: un literal de cadena, en
 * una línea que no es un comentario ni una salida de consola. Es el mismo corte con el que se hizo
 * la corrección, escrito una vez y ejecutable.
 */
export function literalesDeCelda(linea) {
  const t = linea.trim()
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return []
  if (/\bconsole\.(log|error|warn|info)\(|(?<![.\w])log\(|L\.push\(/.test(linea)) return []
  const out = []
  for (let i = 0; i < linea.length; i++) {
    const q = linea[i]
    if (q !== "'" && q !== '"' && q !== '`') continue
    let j = i + 1
    while (j < linea.length && linea[j] !== q) j += linea[j] === '\\' ? 2 : 1
    if (j >= linea.length) break // literal sin cerrar en esta línea: no se juzga a medias
    out.push(linea.slice(i + 1, j))
    i = j
  }
  return out
}

/** Los archivos ya corregidos: acá un glifo invisible en el código es un defecto, no una decisión. */
function fuentesDeGeneradores() {
  const out = []
  for (const dir of ['lib', 'scripts']) {
    for (const f of fs.readdirSync(path.join(RAIZ, dir))) {
      if (!f.endsWith('.mjs') || f.endsWith('.test.mjs')) continue
      const rel = `${dir}/${f}`
      if (PUEDEN_NOMBRARLO.has(rel)) continue
      const src = fs.readFileSync(path.join(RAIZ, dir, f), 'utf8')
      // No es de los corregidos: no se le exige nada todavía. `SEMAFORO` entra por la misma puerta
      // que `ALERTA` — es la otra constante de `glifos.mjs` que decide un glifo publicado, y sin
      // nombrarla acá los archivos del semáforo de "Compras" quedaban fuera del barrido.
      if (!src.includes('ALERTA') && !src.includes('SEMAFORO')) continue
      out.push([rel, src])
    }
  }
  return out
}

test('NINGÚN ARCHIVO YA CORREGIDO VUELVE A TIPEAR UN GLIFO INVISIBLE EN UN TEXTO DE CELDA', () => {
  const reincidentes = []
  for (const [rel, src] of fuentesDeGeneradores()) {
    src.split('\n').forEach((linea, i) => {
      for (const lit of literalesDeCelda(linea)) {
        const ciegos = glifosInvisibles(lit)
        if (ciegos.length) reincidentes.push(`${rel}:${i + 1} ${ciegos.join(' ')} — ${lit.slice(0, 60)}`)
      }
    })
  }
  assert.deepEqual(reincidentes, [],
    'usá ALERTA de lib/glifos.mjs; si el archivo tiene que NOMBRAR el glifo viejo, agregalo a PUEDEN_NOMBRARLO con su motivo')
})

test('el corte del guardián: mira el literal, no el comentario ni el log', () => {
  // Sin estas tres reglas el control gritaría por 180 líneas legítimas y se dejaría de mirar — el
  // modo de falla que este repo ya pagó con los 688 falsos positivos del guion del cero contable.
  assert.deepEqual(literalesDeCelda('// el ⚠ no se dibuja'), [])
  assert.deepEqual(literalesDeCelda("  console.log('  ⚠ no coinciden')"), [])
  assert.deepEqual(literalesDeCelda("  push(['⚠ falta'])"), ['⚠ falta'])
  assert.deepEqual(literalesDeCelda('  const x = `=IF(A1="";"⚠ sin cargar";"")`'), ['=IF(A1="";"⚠ sin cargar";"")'])
})

test('el guardián está mirando algo: la lista de archivos exigidos no puede quedar vacía', () => {
  // Un control que no recorre nada pasa siempre. Ya pasó en este repo con el guardián de generadores.
  assert.ok(fuentesDeGeneradores().length >= 30, 'el barrido dejó de encontrar los generadores corregidos')
})
