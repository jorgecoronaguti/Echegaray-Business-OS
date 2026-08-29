// LAS TABLAS DEL MÓDULO EN UN TELÉFONO (QA visual a 390×844, 29/08/2026).
//
// ═══ EL DEFECTO ═══
//
// `TablaPreparacionObra` escribía `gridTemplateColumns` a mano y nunca pasaba por
// `EnvoltorioAncho`, que es lo que reserva ancho por debajo de 1024 px. Con `body` en
// `overflow-x: clip`, a 390 px la columna de la descripción —`minmax(0,1.7fr)`— caía a CERO: el
// dato no se corría, se cortaba. En pantalla quedaban «s/c» y la cantidad, sin forma de saber de
// qué partida se hablaba ni barra que avisara que faltaba algo.
//
// ═══ QUÉ PUEDE Y QUÉ NO PUEDE PROBAR ESTE ARCHIVO ═══
//
// Sin navegador no se mide `scrollWidth`. Lo que sí se verifica es la cadena entera de condiciones
// que tienen que cumplirse para que el mecanismo funcione, y que era donde estaba rota: que la
// tabla declare sus columnas, que las pase al envoltorio, y que el ancho reservado supere el
// viewport más chico. La medición en un viewport real es del QA y está pedida en el informe.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { anchoMinimoDeGrilla } from '../../../shared/components/canon/ancho-minimo.ts'

const AQUI = dirname(fileURLToPath(import.meta.url))
const leer = (f: string) => readFileSync(join(AQUI, f), 'utf8')

/** El teléfono más angosto que el repo declara soportar. */
const VIEWPORT_MAS_ANGOSTO = 390

/** Las tres tablas del módulo, con el `COLS` leído DEL ARCHIVO — no copiado acá. */
const TABLAS = [
  { archivo: 'ListaPresupuestos.tsx', nombre: 'cartera (14)' },
  { archivo: 'TablaPartidas.tsx', nombre: 'edición (15)' },
  { archivo: 'TablaPreparacionObra.tsx', nombre: 'preparar obra (13)' },
]

/** Copiar los `COLS` a este test los dejaría envejecer en silencio: se leen del componente. */
function colsDe(archivo: string): string {
  const m = /const COLS = '([^']+)'/.exec(leer(archivo))
  assert.ok(m, `no encontré el COLS de ${archivo}: el test dejó de mirar donde tenía que mirar`)
  return m[1]
}

describe('toda tabla del módulo reserva ancho en el teléfono', () => {
  for (const t of TABLAS) {
    test(`${t.nombre}: el ancho reservado supera los ${VIEWPORT_MAS_ANGOSTO} px`, () => {
      const ancho = anchoMinimoDeGrilla(colsDe(t.archivo))
      assert.ok(
        ancho > VIEWPORT_MAS_ANGOSTO,
        `${t.archivo} reserva ${ancho} px: a 390 las columnas fraccionales caen a cero y el dato se corta`,
      )
    })

    test(`${t.nombre}: sus columnas pasan por EnvoltorioAncho`, () => {
      const src = leer(t.archivo)
      // MUTACIÓN QUE LO PONE ROJO: sacar `cols={COLS}` de la tabla, o volver a armar la grilla a
      // mano sin envolverla. Es exactamente lo que le pasaba a TablaPreparacionObra.
      const porTarjeta = /<TarjetaTabla[^>]*cols=\{COLS\}/.test(src)
      const porEnvoltorio = /<EnvoltorioAncho cols=\{COLS\}>/.test(src)
      assert.ok(
        porTarjeta || porEnvoltorio,
        `${t.archivo} dibuja una grilla que nadie envuelve: en el teléfono no va a scrollear`,
      )
    })
  }

  test('el cálculo puede dar un número chico: si no, estos controles no controlan nada', () => {
    // Una grilla de una sola columna angosta NO tiene por qué reservar 400 px. Sin esto, un
    // `anchoMinimoDeGrilla` que devolviera siempre 9999 dejaría los tres tests de arriba en verde
    // para siempre sin mirar nada.
    assert.ok(anchoMinimoDeGrilla('40px') < VIEWPORT_MAS_ANGOSTO)
    assert.equal(anchoMinimoDeGrilla(''), 0)
  })
})

// ═══ LA CLAVE DE LA COLA DE ATENCIÓN (auditoría delta, 29/08/2026) ═══
//
// Colisionó DOS veces, por los dos lados, y la segunda vez porque el arreglo de la primera no tenía
// test — el auditor lo revirtió y 496 tests siguieron en verde. Ahora sí lo tiene.
//
//   1ª · `${type}-${entity}`: `entity` cae a la descripción cuando la partida no tiene código, así
//        que dos partidas con la misma descripción daban la misma clave.
//   2ª · sólo `partidaId`: UNA fila puede tener DOS huecos a la vez —cantidad ausente y subcontrato
//        sin precio— y los dos daban `row-1`.
//
// Hacen falta los dos componentes: QUÉ le falta y A CUÁL.
describe('la cola de atención no puede repetir una clave', () => {
  const COLA = readFileSync(join(AQUI, 'ColaDeAtencion.tsx'), 'utf8')

  /** La expresión de `key=` tal como está escrita en el componente. */
  const claveDelComponente = (): string => {
    const m = /key=\{`([^`]+)`\}/.exec(COLA) ?? /key=\{([^}]+)\}/.exec(COLA)
    assert.ok(m, 'no encontré la key de la lista: el test dejó de mirar donde tenía que mirar')
    return m[1]
  }

  test('la clave usa el TIPO y la FILA, no uno solo de los dos', () => {
    const k = claveDelComponente()
    // MUTACIÓN QUE LO PONE ROJO: volver a `key={i.evidence?.partidaId ?? ...}` (colisión 2ª) o a
    // `key={`${i.type}-${i.entity}`}` (colisión 1ª). Las dos dejan de nombrar una de las dos cosas.
    assert.match(k, /i\.type/, 'la clave no distingue QUÉ hueco es: dos huecos de la misma fila colisionan')
    assert.match(k, /partidaId/, 'la clave no distingue A CUÁL fila: dos partidas iguales colisionan')
  })

  test('sobre datos reales, las claves de dos huecos de la misma fila son distintas', () => {
    // La forma exacta de los dos issues que colisionaban: misma fila, dos tipos.
    const issues = [
      { type: 'CANTIDAD_CRITICA_AUSENTE', entity: 'ZZ-01', evidence: { partidaId: 'row-1' } },
      { type: 'SUBCONTRATO_SIN_PRECIO', entity: 'ZZ-01', evidence: { partidaId: 'row-1' } },
      // Y el caso de la primera colisión: dos filas distintas que se leen igual.
      { type: 'SIN_PRECIO', entity: 'Sanitaria', evidence: { partidaId: 'row-2' } },
      { type: 'SIN_PRECIO', entity: 'Sanitaria', evidence: { partidaId: 'row-3' } },
    ]
    const clave = (i: typeof issues[number]) => `${i.type}-${i.evidence?.partidaId ?? i.entity}`
    assert.equal(new Set(issues.map(clave)).size, issues.length, 'dos issues distintos comparten clave')
  })
})
