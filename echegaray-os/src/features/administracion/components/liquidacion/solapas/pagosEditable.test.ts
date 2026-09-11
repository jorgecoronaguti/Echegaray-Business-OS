// LA SOLAPA PAGOS SE ESCRIBE Y NO CONFUNDE HORAS CON PESOS.
//
// Dueño, 11/09/2026, textual: *«el módulo de liquidación de hs en app.ecsas.com.ar está mal hecho, no
// tengo celdas editables, calcula mal»*. Eran dos defectos distintos en la misma pantalla:
//
//   1. Las cuatro celdas que el handoff declara escribibles (R5) se dibujaban como un `<span>` con
//      marco de control. El comentario del propio archivo decía que «el `<input>` real lo monta la
//      grilla editable» — esa grilla no existía. La pantalla enseñaba cuáles celdas decide una
//      persona y no dejaba escribir ninguna.
//   2. `Celda` formateaba TODA columna con `pesos`, así que HORAS publicaba «$80» y el pie «$1.188».
//
// ═══ POR QUÉ SE PRUEBA SOBRE EL CÓDIGO FUENTE ═══
//
// Porque el defecto es estructural: no hay número que dé distinto, hay un `<input>` que no existe.
// Un render de React Server Components no se puede montar en `node --test` sin levantar Next, y la
// regla del repo es la de `liquidacionSoloAdmin.test.ts`: lo que se puede probar sin base se prueba
// acá, y lo que no, va al informe de cierre con su evidencia. La MUTACIÓN que lo pone rojo es
// volver `<CeldaEditable` a un `<span>` mudo, o devolver `formato = pesos` a la columna de horas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { horas, pesos } from '../formato.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const PAGOS = fuente('./pagos.tsx')
const CELDAS = fuente('../CeldasDeLiquidacion.tsx')

test('LAS HORAS NO LLEVAN SIGNO DE PESOS, Y LOS PESOS SÍ', () => {
  // EL DEFECTO EXACTO QUE EL DUEÑO LEYÓ EN LA PANTALLA: «$80» donde dice 80 horas.
  assert.equal(horas(80), '80')
  assert.equal(pesos(80), '$80')
  // Un decimal cuando existe, ninguno cuando no: la planilla carga 8,8 y 9.
  assert.equal(horas(8.8), '8,8')
  assert.equal(horas(1188), '1.188')
  // R1 · NULL NO ES CERO, en las dos unidades.
  assert.equal(horas(null), '—')
  assert.equal(pesos(null), '—')
})

test('LAS CUATRO CELDAS DE LA CADENA DE PAGO MONTAN EL CAMPO REAL (R5)', () => {
  // Las tres primeras pasan por `Escribible`, que es el que monta `CeldaEditable` con el marco.
  for (const campo of ['adelanto', 'yaTransferido', 'porBanco']) {
    assert.match(PAGOS, new RegExp(`<Escribible\\s+campo="${campo}"`),
      `${campo} tiene que ser escribible`)
  }
  // `assert.ok` y no `assert.match`: un `match` fallido vuelca el archivo entero al informe.
  assert.ok(/function Escribible\([\s\S]*?<CeldaEditable/.test(PAGOS),
    'el marco de control tiene que tener el campo adentro, no un <span> mudo')
  // EFECT. RED. tiene su propia acción: es la columna del dueño y no participa de ninguna cuenta.
  assert.match(PAGOS, /<CeldaRedondeo/)
  // LA MUTACIÓN QUE ESTO ATRAPA: el `<span>` mudo que prometía un input que nadie montaba.
  assert.doesNotMatch(PAGOS, /el `<input>` real lo monta la grilla editable/)
})

test('LA COLUMNA DE HORAS Y EL PIE USAN EL FORMATO DE HORAS', () => {
  assert.match(PAGOS, /<Celda valor=\{l\.horas\} formato=\{nHoras\}/)
  assert.match(PAGOS, /<Celda valor=\{totales\.horas\} formato=\{nHoras\}/)
})

test('NINGUNA FUNCIÓN CRUZA DE PAGOS A UNA CELDA DE CLIENTE', () => {
  // EL DEFECTO QUE ATRAPA, y que ni el typecheck ni el resto de estos tests vieron: `pagos.tsx` es un
  // componente de SERVIDOR y le pasaba `formato={(n) => …}` a `CeldaEditable`, que es de cliente.
  // React corta con «Functions cannot be passed directly to Client Components» y la pantalla entera
  // queda en «No se pudo cargar el legajo de personas». Lo encontró el primer `goto` del E2E.
  // Ahora cruza una UNIDAD, que es un dato.
  assert.match(PAGOS, /unidad="pesos"/)
  assert.doesNotMatch(PAGOS, /formato=\{\(n\)/)
  assert.match(CELDAS, /unidad: UnidadDeCelda/)
  // Y la celda del cuadro clásico también: una sola forma de decirlo en las dos pantallas.
  assert.match(fuente('../CuadroLiquidacion.tsx'), /unidad: UnidadDeCelda/)
})

test('EL CONTENIDO DE PAGOS NO COMPARTE `data-testid` CON SU PESTAÑA', () => {
  // `BarraSolapas` publica `solapa-<clave>` en la PESTAÑA. El contenido usaba el mismo, así que el
  // ancla resolvía primero al nodo de la barra móvil —que está oculto— y un test sin nada roto
  // fallaba por timeout. «Horas» ya usaba `vista-horas`.
  assert.match(PAGOS, /data-testid="vista-pagos"/)
  assert.doesNotMatch(PAGOS, /data-testid="solapa-pagos"/)
})

test('LA QUINCENA CERRADA NO SE EDITA, Y SE DECIDE POR CUADRO (R6)', () => {
  // EL DEFECTO QUE ATRAPA: un solo booleano «la quincena está cerrada» para los tres cuadros.
  // Cerrar Oficina no sella a los obreros, y al revés congelaría quince filas que siguen abiertas.
  assert.match(PAGOS, /cerradas: ReadonlySet<string>/)
  assert.match(PAGOS, /const cerrada = cerradas\.has\(seccion\.grupo\)/)
  assert.match(PAGOS, /bloqueada=\{cerradas\.has\(sec\.grupo\)\}/)
})

test('UNA SOLA DEFINICIÓN DE LAS CELDAS: Pagos y el cuadro clásico importan la misma', () => {
  // EL DEFECTO QUE ATRAPA: copiar `Editable` a Pagos. Dos copias son dos formas de marcar lo manual
  // y dos maneras de acusar el error del servidor — y una de las dos no se actualiza nunca.
  assert.match(PAGOS, /from '\.\.\/CeldasDeLiquidacion'/)
  assert.match(fuente('../CuadroLiquidacion.tsx'), /from '\.\/CeldasDeLiquidacion'/)
  assert.match(CELDAS, /^'use client'/)
  // Y la marca de lo escrito a mano vive ahí, una vez.
  assert.equal((CELDAS.match(/export function Manual\(/g) ?? []).length, 1)
})

test('LO PISADO A MANO SE VE TAMBIÉN EN LAS COLUMNAS CALCULADAS (R8)', () => {
  // COBRA, EN EFECTIVO y TOTAL son cuentas, pero el dueño las puede pisar. Sin la marca, un importe
  // escrito por él se lee igual que un derivado y después nadie lo puede explicar frente al recibo.
  for (const campo of ['cobra', 'enEfectivo', 'total', 'horas']) {
    assert.match(PAGOS, new RegExp(`manual=\\{l\\.manual\\.${campo}\\}`),
      `${campo} tiene que publicar su marca «manual»`)
  }
})
