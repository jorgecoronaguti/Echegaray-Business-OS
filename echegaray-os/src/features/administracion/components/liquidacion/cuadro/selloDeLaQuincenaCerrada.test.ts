// EL $/H DE LAS QUINCENAS ANTERIORES (dueño, 17/09/2026: «no salen los valores $/h de cada uno en los empleados en
// las quincenas anteriores, revisar y rehacer»).
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// Una quincena cerrada se dibuja con `sinOverrides`, que deja `sueldo` en `null` a propósito: el modelo blanco+negro
// no puede volver a estimar sobre algo ya pagado. Pero la pantalla leía el $/h SÓLO de ese modelo, así que la 1ª de
// junio mostraba «Recibo: sin recibo todavía», «Plataforma: Oficial · —/h» y la columna «$/h cat.» en «—» para gente
// a la que se le liquidaron horas × $/h. El dato existía y no había por dónde decirlo.
//
// ═══ Y EL QUE TAMBIÉN ATRAPA: UN VALOR DE HOY DISFRAZADO DE VALOR VIEJO ═══
//
// Es el error peor de los dos. Los dos números están tomados al último día de ESA quincena (`q.hasta`) y el `title`
// lo dice; si alguien los tomara de hoy, la pantalla afirmaría que en junio se pagó la escala de septiembre.
//
// MUTACIONES: sacar la rama del sello, pasarle `hoy` en vez de `q.hasta`, o dejar de pasar `selloDe(l)` en la rama
// cerrada del servicio → rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { categoriasDeLaFila } from './categoriasDeLaFila.ts'

const fuente = (n: string): string => readFileSync(new URL(n, import.meta.url), 'utf8')

/** Una fila de quincena CERRADA: sin modelo blanco+negro, con la foto de esa fecha. */
const CERRADA = {
  plataforma: 'Oficial',
  pisoPlataforma: 5703,
  categoriaRecibo: undefined,
  valorHoraRecibo: undefined,
  periodoRecibo: undefined,
  estado: null,
  sello: { valorHora: 5400, pisoDesde: '2026-05-01', hasta: '2026-06-15' },
} as const

test('LA CERRADA DICE SU $/H, NO «sin recibo todavía»', () => {
  const c = categoriasDeLaFila(CERRADA)
  assert.equal(c.recibo, 'Se liquidó a $5.400/h', 'el $/h con el que se liquidó, dicho como hecho')
  assert.doesNotMatch(c.recibo, /sin recibo todavía/)
  // Y EL PISO DE ESA FECHA, en el renglón de plataforma: antes decía «—/h».
  assert.equal(c.plataforma, 'Plataforma: Oficial · $5.703/h')
})

test('EL TÍTULO DICE A QUÉ FECHA ESTÁ TOMADO CADA NÚMERO, Y QUE LA CATEGORÍA ES LA DE HOY', () => {
  const t = categoriasDeLaFila(CERRADA).titulo
  assert.match(t, /CERRADA/, 'se dice que es una foto')
  assert.match(t, /15\/06\/2026/, 'la fecha a la que está tomada la tarifa')
  assert.match(t, /No es la de hoy/, 'y que no es el valor de hoy')
  assert.match(t, /rige desde el 01\/05\/2026/, 'desde cuándo rige el piso que se muestra')
  // LA CATEGORÍA NO SE SELLA: `liquidacion_linea.categoria_sellada` está vacío en toda la base.
  assert.match(t, /no quedó sellada[^\n]*legajo de HOY/)
})

test('SIN $/H SELLADO NO SE INVENTA NADA: vuelve a «sin recibo todavía»', () => {
  const c = categoriasDeLaFila({ ...CERRADA, sello: { valorHora: null, pisoDesde: null, hasta: '2026-06-15' } })
  assert.equal(c.recibo, 'Recibo: sin recibo todavía')
  // Y SIN PISO TAMPOCO: una persona sin categoría en el legajo no tiene piso que mostrar (AHUMADA, 1ª de junio).
  const sinCategoria = categoriasDeLaFila({ ...CERRADA, plataforma: null, pisoPlataforma: null })
  assert.equal(sinCategoria.plataforma, 'Plataforma: sin categoría · —/h')
})

test('LA ABIERTA NO CAMBIA: con recibo manda el recibo, sin sello no hay foto', () => {
  const abierta = categoriasDeLaFila({
    plataforma: 'Oficial', pisoPlataforma: 6348, categoriaRecibo: 'OFICIAL', valorHoraRecibo: 6348,
    periodoRecibo: 'Q2-09/2026', estado: 'recibo', sello: null,
  })
  assert.equal(abierta.recibo, 'Recibo: Oficial · $6.348/h')
  assert.equal(abierta.coinciden, true)
})

test('EL SELLO SE ARMA A LA FECHA DE LA QUINCENA, Y SÓLO EN LA RAMA CERRADA', () => {
  const servicio = fuente('../../../services/liquidacionQuincenaService.ts')
  // `pisoDe` y `pisoDesdeDe` salen de `exposicion`, que corre con `q.hasta` (`exponerAlPiso(p, escalas, q.hasta, …)`).
  assert.match(servicio, /const pisoDesdeDe = new Map\(exposicion\.lineas\.map/)
  // SÓLO EL CUERPO DE `selloDe`: `q.hasta` aparece en varios lugares del archivo y una búsqueda global no probaría
  // nada. Acá el único `hasta` admisible es el de la quincena.
  const armado = servicio.slice(servicio.indexOf('const selloDe ='))
  const cuerpo = armado.slice(armado.indexOf('=> ({'), armado.indexOf('  })') + 4)
  assert.match(cuerpo, /hasta: q\.hasta,/, 'la foto se fecha con el fin de la quincena')
  assert.doesNotMatch(cuerpo, /\bhoy\b/, 'nunca la fecha de hoy')
  assert.match(servicio, /sinOverrides\(l, presentismosSellados\.get\(l\.personaId\) \?\? null, overrides\.get\(l\.personaId\) \?\? \{\}, selloDe\(l\)\)/,
    'la rama cerrada le pasa el sello')

  const overrides = fuente('../../../services/liquidacionOverrides.ts')
  // LA ABIERTA NO TIENE FOTO: su $/h sale del modelo, que sí puede correr.
  assert.match(overrides, /\/\/ LA ABIERTA NO TIENE FOTO[\s\S]{0,120}sello: null,/)
  // Y LA CERRADA SIGUE SIN RECALCULAR: `sueldo` queda en null.
  assert.match(overrides, /referenciaJornales: null, sueldo: null, sello,/)
})

test('LA COLUMNA «$/h cat.» DIBUJA EL SELLO, APAGADO Y CON SU FECHA; Y NUNCA PIERDE SU TESTID', () => {
  const celdas = fuente('./CeldasBlancoNegro.tsx')
  assert.match(celdas, /if \(s == null && sello\?\.valorHora != null\)/, 'la cerrada muestra su $/h')
  assert.match(celdas, /data-sellado="1"/, 'se puede medir desde un E2E')
  assert.match(celdas, /tomada al \$\{diaDeLaFoto\(sello\.hasta\)\}/, 'con la fecha de esa quincena')
  // EL «—» TENÍA QUE PODER MEDIRSE: sin testid, el defecto vivió hasta que lo vio el dueño.
  assert.match(celdas, /if \(!s\) return <div data-testid=\{testid\}/)
  // Y EL $/H NEGRO DE UNA CERRADA TAMBIÉN: el botón se cambia por un span con el MISMO testid.
  assert.match(fuente('./CeldaTarifa.tsx'), /<span data-testid=\{`tarifa-\$\{fila\.personaId\}`\} data-solo-lectura="1"/)
})
