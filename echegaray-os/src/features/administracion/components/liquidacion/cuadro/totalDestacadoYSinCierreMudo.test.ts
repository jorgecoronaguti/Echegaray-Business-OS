// LIQUIDACIÓN, 30/09/2026 — dos pedidos del dueño el mismo día:
//  · «esa es la columna q marca el TOTAL q cobra, marcamela de otra manera distinguila con otro color»
//  · «no me permite anotar pagado en efectivo y si se toca el efect red. lo has roto»: no estaba roto, pero confirmar
//    lo mismo que ya estaba cerraba la celda MUDA, indistinguible de una escritura perdida. Ahora se dice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CUADRO_JORNALEROS, CUADRO_MENSUALES, columnaDestacada } from './columnasDelCuadro.ts'
import { accionDelRedondeo, motivoSinCambios } from '../../../services/efectivoRedondeado.ts'
import { resumenDeEstados } from '../../../services/estadoDelCuadro.ts'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('la columna destacada es Total, en los dos cuadros, y su línea de grid cuenta Persona y los días', () => {
  assert.equal(CUADRO_JORNALEROS.columnas.filter((c) => c.destacada).map((c) => c.clave).join(), 'total')
  assert.equal(CUADRO_MENSUALES.columnas.filter((c) => c.destacada).map((c) => c.clave).join(), 'total')
  const i = CUADRO_JORNALEROS.columnas.findIndex((c) => c.clave === 'total')
  assert.equal(columnaDestacada(CUADRO_JORNALEROS, 15), 2 + 15 + i)
  assert.equal(columnaDestacada(CUADRO_MENSUALES, 0), 2 + CUADRO_MENSUALES.columnas.findIndex((c) => c.clave === 'total'))
  assert.equal(columnaDestacada({ ...CUADRO_MENSUALES, columnas: CUADRO_MENSUALES.columnas.filter((c) => !c.destacada) }, 0), null)
})

test('la banda es la marca suave, detrás de filas y pie y en el encabezado; el rótulo Total va en tinta', () => {
  const tabla = fuente('./TablaDeBloques.tsx')
  assert.match(tabla, /const CLASE_DESTACADA = 'bg-marca-soft'/, 'un token, nunca un hex')
  assert.match(tabla, /data-fondo-columna="destacada" className=\{CLASE_DESTACADA\}/, 'MUTACIÓN: la banda no cubre las filas ni el pie')
  assert.match(tabla, /data-testid=\{`banda-\$\{c\.clave\}`\} className=\{CLASE_DESTACADA\}/, 'MUTACIÓN: el encabezado no la marca')
  assert.match(tabla, /c\.destacada \? \{ color: V\.tinta, fontWeight: 600/, 'el rótulo Total pesa como su columna')
  assert.doesNotMatch(tabla, /bg-marca(?!-soft)/, 'el amarillo pleno no va de fondo')
})

test('confirmar lo mismo que ya estaba no es mudo: InlineEdit y Efect. red. dicen «sin cambios»', () => {
  const inline = fuente('../../../../../shared/components/ds/InlineEdit.tsx')
  assert.match(inline, /setSinCambios\(true\)\n\s+setTimeout\(\(\) => setSinCambios\(false\), 1500\)\n\s+luego\?\.\(\); return/, 'MUTACIÓN: vuelve el cierre mudo')
  assert.match(inline, /aria-live="polite" data-testid=\{testid \? `\$\{testid\}-sin-cambios` : undefined\}>sin cambios</)
  const celdas = fuente('../CeldasDeLiquidacion.tsx')
  assert.match(celdas, /setSinCambios\(motivoSinCambios\(\{ texto, guardado: valor, sugerido: mostrado\.sugeridoAhora \}\)\)/)
  assert.match(celdas, /\{!error && sinCambios && <span role="status" data-testid=\{`redondeo-sin-cambios-\$\{personaId\}`\}/)
  assert.match(celdas, /const AVISO_DEL_REDONDEO: CSSProperties = \{ \.\.\.ERROR_DEL_REDONDEO, color: V\.tenue \}/, 'tenue, no rojo: no es un problema')
})

test('el motivo dice por qué no se guardó, y coincide con la acción «nada»', () => {
  const casos = [
    { e: { texto: '70000', guardado: null, sugerido: 70000 }, motivo: 'sin cambios · es el sugerido' },
    { e: { texto: '70.000', guardado: 70000, sugerido: 71000 }, motivo: 'sin cambios · igual al guardado' },
    { e: { texto: '', guardado: null, sugerido: 70000 }, motivo: 'sin cambios · vacío, queda el sugerido' },
    { e: { texto: 'abc', guardado: null, sugerido: 70000 }, motivo: 'sin cambios · no es un número' },
  ]
  for (const c of casos) {
    assert.equal(accionDelRedondeo(c.e).accion, 'nada', JSON.stringify(c.e))
    assert.equal(motivoSinCambios(c.e), c.motivo)
  }
})

test('la cabecera resume el estado de los cuadros de la base y ofrece volver a la de hoy', () => {
  assert.equal(resumenDeEstados([]), null)
  assert.equal(resumenDeEstados(['abierta', 'abierta']), 'abierta')
  assert.equal(resumenDeEstados(['cerrada', 'cerrada']), 'cerrada')
  assert.equal(resumenDeEstados(['cerrada', 'abierta']), 'cerrada en parte')
  const bloque = fuente('../BloqueLiquidacion.tsx')
  assert.match(bloque, /fontSize: '15px', fontWeight: 600, color: V\.tinta \}\} data-testid="rotulo-quincena-liquidacion"/)
  assert.match(bloque, /\{!esLaDeHoy && \(\s*<Link href=\{hrefDe\(quincenaDe\(hoy\)\.desde\)\}/, 'MUTACIÓN: sin vuelta a hoy')
  assert.match(bloque, /data-testid="estado-quincena-liquidacion"/)
})
