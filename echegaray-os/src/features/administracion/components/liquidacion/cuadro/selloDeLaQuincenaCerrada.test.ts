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
// ═══ Y EL PEOR DE LOS TRES (auditor, 18/09/2026): EL $/H DE `persona_tarifa` DISFRAZADO DE SELLADO ═══
//
// Este archivo afirmaba por regex que el sello sale de `l.valorHora` con la tarifa vigente a `q.hasta`. Eso certificaba
// la fuente equivocada: la foto es `liquidacion_linea.valor_hora`. Ahora se prueba con un fixture donde las dos difieren.
//
// MUTACIONES: sacar la rama del sello, pasarle `hoy` en vez de `q.hasta`, dejar de pasar `selloDe(l)` en la rama
// cerrada del servicio, o volver a armar el cuadro cerrado con `persona_tarifa` → rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { categoriasDeLaFila } from './categoriasDeLaFila.ts'
import { motivoSinCobra, sinSello } from './estadoDelPago.ts'
import { cuadroSellado } from '../../../services/liquidacionSellada.ts'
import { sinOverrides } from '../../../services/liquidacionOverrides.ts'
import type { LineaLiquidada } from '../../../services/liquidacionQuincena.ts'

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

test('EL $/H DEL SELLO ES EL DE `liquidacion_linea`, NO EL DE `persona_tarifa` (auditor, 18/09/2026)', () => {
  // ═══ EL TEST QUE ESTABA ACÁ CERTIFICABA LA FUENTE EQUIVOCADA ═══
  //
  // Afirmaba por regex que el sello sale de `l.valorHora` con `persona_tarifa` filtrada a `q.hasta`. Eso NO es la foto:
  // Bazán tiene una sola tarifa cargada ($4.000 desde enero) y la 2ª de marzo se cerró a $4.300; la pantalla decía
  // «Se liquidó a $4.000/h · cobra $36.000» sobre $38.700 entregados. Ahora se prueba con un fixture donde la tarifa
  // vigente y la sellada difieren, de punta a punta: cuadro sellado → sello → renglón de la fila.
  const vigente: LineaLiquidada = {
    personaId: 'bazan', nombre: 'BAZAN JUAN', esJefe: false, horas: 9, horasEquivalentes: 9, extras: [], valorHora: 4000,
    netoMensual: null, modalidad: 'hora', cobra: 36000, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 36000,
    total: 36000, efectivoRedondeado: null, sinTarifa: false, reciboNeto: null, blancoAcuerdo: 18000, efectivoAcuerdo: 18000,
    reciboSinGiro: false, origenTarifa: 'liquidacion_linea sellada quincena 2026-01-01',
  }
  const { lineas } = cuadroSellado({
    grupo: 'obreros',
    selladas: [{ personaId: 'bazan', horas: 9, valorHora: 4300, cobra: 38700, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 38700, total: 38700 }],
    vivas: [vigente],
    personas: new Map([['bazan', { id: 'bazan', nombre: 'BAZAN JUAN', esJefe: false }]]),
    selladosEnLaQuincena: new Set(['bazan']),
    redondeos: new Map(),
  })
  const l = lineas[0]
  const fila = sinOverrides(l, null, {}, { valorHora: l.valorHora, conLinea: true, piso: 5703, pisoDesde: '2026-03-01', hasta: '2026-03-31' })
  const c = categoriasDeLaFila({ ...CERRADA, pisoPlataforma: 5703, sello: fila.sello })
  assert.equal(c.recibo, 'Se liquidó a $4.300/h', 'MUTACIÓN: el sello lleva la tarifa vigente ($4.000) y no la sellada')
  assert.equal(fila.cobra, 38700)
  assert.match(c.titulo, /31\/03\/2026/)

  // Y EL SERVICIO ARMA EL CUADRO CERRADO CON `cuadroSellado` Y LE PASA ESA LÍNEA AL SELLO: no hay otra rama que
  // pueda volver a `persona_tarifa`.
  const servicio = fuente('../../../services/liquidacionQuincenaService.ts')
  assert.match(servicio, /const cuadros = vivos\.map\(\(c\) => \{\s*if \(estadoDelCuadro\(estados, c\.grupo\)\.estado !== 'cerrada'\) return c\s*const foto = cuadroSellado\(\{/)
  assert.match(servicio, /'horas', 'valor_hora', 'adelanto', 'ya_transferido', 'por_banco',\s*'en_efectivo', 'total',/, 'las columnas selladas se piden a la base')
  assert.match(servicio, /sinOverrides\(l, presentismosSellados\.get\(l\.personaId\) \?\? null, overrides\.get\(l\.personaId\) \?\? \{\}, selloDe\(l\)\)/,
    'la rama cerrada le pasa el sello de la línea sellada')
  const armado = servicio.slice(servicio.indexOf('const selloDe ='))
  const cuerpo = armado.slice(armado.indexOf('=> ({'), armado.indexOf('  })') + 4)
  assert.match(cuerpo, /hasta: q\.hasta,/, 'la foto se fecha con el fin de la quincena')
  assert.doesNotMatch(cuerpo, /\bhoy\b/, 'nunca la fecha de hoy')

  const overrides = fuente('../../../services/liquidacionOverrides.ts')
  // LA ABIERTA NO TIENE FOTO: su $/h sale del modelo, que sí puede correr.
  assert.match(overrides, /\/\/ LA ABIERTA NO TIENE FOTO[\s\S]{0,120}sello: null,/)
  // Y LA CERRADA SIGUE SIN RECALCULAR: `sueldo` queda en null.
  assert.match(overrides, /referenciaJornales: null, sueldo: null, sello,/)
})

test('SIN $/H EN LA FOTO LA CELDA DICE «sin dato sellado»; SIN LÍNEA, «sin línea sellada»', () => {
  assert.equal(sinSello({ sello: { conLinea: true } }), 'sin dato sellado')
  assert.equal(sinSello({ sello: { conLinea: false } }), 'sin línea sellada')
  assert.equal(sinSello({ sello: null }), null, 'la abierta no tiene sello: cada celda dice lo suyo')
  assert.equal(motivoSinCobra({ modalidad: 'hora', sello: { conLinea: false } }), 'sin línea sellada')
  assert.equal(motivoSinCobra({ modalidad: 'hora', sello: null }), 'sin tarifa')
  const celdas = fuente('./CeldasBlancoNegro.tsx')
  assert.match(celdas, /if \(s == null && sello != null\) \{[\s\S]{0,400}\{sinSello\(fila\.linea\)\}/, 'el $/h cat. de la cerrada sin foto lo dice')
  assert.match(fuente('./CeldaTarifa.tsx'), /\{actual == null \? \(sinSello\(l\) \?\? '—'\) : pesos\(actual\)\}/)
  assert.match(fuente('./CeldasDelEspejo.tsx'), /if \(fila\.cerrada && l\.horas == null && sinSello\(l\)\)/)
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
