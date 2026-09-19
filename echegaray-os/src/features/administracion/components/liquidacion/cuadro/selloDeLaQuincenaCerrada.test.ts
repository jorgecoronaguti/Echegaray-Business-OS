// UNA QUINCENA CERRADA MUESTRA SU REGISTRO, NO UNA RECONSTRUCCIÓN DE HOY.
//
// ═══ LOS DOS DEFECTOS QUE ATRAPA ═══
//
// 1 · «No salen los valores $/h de cada uno en las quincenas anteriores» (dueño, 17/09/2026). La 1ª de junio decía
//     «Recibo: sin recibo todavía», «Plataforma: Oficial · —/h» y «$/h cat.» en «—» sobre veinte personas a las que
//     se les liquidaron horas × $/h.
//
// 2 · EL PEOR, y el que el primer arreglo introdujo: tapar ese hueco RECOMPONIENDO desde `persona_tarifa` y
//     escribirlo como hecho («Se liquidó a $4.000/h … No es la de hoy»). Medido contra Postgres el 17/09/2026 sobre
//     20 quincenas cerradas y 324 líneas, las dos fuentes difieren en 45 líneas. BAZÁN JUAN, 16–31/03/2026:
//     `liquidacion_linea` guarda 9 h × $4.300 = $38.700 y la recomposición daba $4.000. La pantalla afirmaba el
//     número equivocado con cara de registro. Una afirmación falsa es peor que el «—» que reemplazó.
//
// ═══ POR QUÉ ESTE TEST SÍ PUEDE DECIR QUE NO ═══
//
// El anterior se validaba contra un fixture escrito a mano y contra el TEXTO del servicio: con el defecto de Bazán
// vivo daba verde. Éste ejecuta `sinOverrides` con las DOS fuentes en desacuerdo —los números reales de Bazán— y
// exige que gane la guardada, campo por campo. Con el código de antes (`...base` sin la cadena) da rojo en el acto.
//
// La comprobación contra la base viva —fila por fila de una quincena cerrada— es
// `scripts/contraste-quincena-cerrada.mjs`: no entra en la suite porque necesita red, y la red no es un control
// que pueda correr en cada edición.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { categoriasDeLaFila } from './categoriasDeLaFila.ts'
import { sinOverrides, type CadenaSellada, type SelloDeLaQuincena } from '../../../services/liquidacionOverrides.ts'
import type { LineaLiquidada } from '../../../services/liquidacionQuincena.ts'

const fuente = (n: string): string => readFileSync(new URL(n, import.meta.url), 'utf8')

// ═══ BAZÁN JUAN, 16–31/03/2026 — los números REALES de las dos fuentes ═══
//
// Guardado en `liquidacion_linea`: horas 9, valor_hora 4300, cobra 38700 (cierra exacto).
// Recompuesto hoy desde `registros_hh` + `persona_tarifa`: $4.000/h, y de ahí un cobra distinto.
const GUARDADO: CadenaSellada = {
  horas: 9, valorHora: 4300, cobra: 38700,
  adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 38700, total: 38700,
}

const RECOMPUESTA: LineaLiquidada = {
  personaId: 'bazan', nombre: 'BAZAN JUAN',
  horas: 12, horasEquivalentes: 12, extras: [],
  valorHora: 4000, netoMensual: null, modalidad: 'hora',
  cobra: 48000, adelanto: 15000, yaTransferido: 5000, porBanco: 20000, enEfectivo: 28000, total: 48000,
  efectivoRedondeado: null, sinTarifa: false, reciboNeto: null, blancoAcuerdo: null, efectivoAcuerdo: null,
} as unknown as LineaLiquidada

const CONTEXTO = { piso: 4851, pisoDesde: '2026-03-01', hasta: '2026-03-31' }
const DEL_REGISTRO: SelloDeLaQuincena = {
  origen: 'sello', valorHora: 4300, horas: 9, cobra: 38700, categoria: null, ...CONTEXTO,
}
const RECONSTRUIDO: SelloDeLaQuincena = {
  origen: 'reconstruido', valorHora: 4000, horas: null, cobra: null, categoria: null, ...CONTEXTO,
}

test('CON LAS DOS FUENTES EN DESACUERDO GANA LA GUARDADA — el caso Bazán, campo por campo', () => {
  const l = sinOverrides(RECOMPUESTA, null, {}, DEL_REGISTRO, GUARDADO)
  // MUTACIÓN: borrar el argumento `cadena` de `sinOverrides`, o volver a `...base` — cada una de estas ocho
  // afirmaciones pasa a ser el número recompuesto y el test se pone rojo.
  const publicado = {
    horas: l.horas, valorHora: l.valorHora, cobra: l.cobra, adelanto: l.adelanto,
    yaTransferido: l.yaTransferido, porBanco: l.porBanco, enEfectivo: l.enEfectivo, total: l.total,
  }
  assert.deepEqual(publicado, {
    horas: 9, valorHora: 4300, cobra: 38700, adelanto: 0,
    yaTransferido: 0, porBanco: 0, enEfectivo: 38700, total: 38700,
  })
  // NINGUNA CIFRA DE LA RECOMPUESTA SE COLÓ: son valores distintos a propósito, así que una sola coincidencia
  // delata que el campo no se leyó de la guardada.
  for (const [campo, valor] of Object.entries(publicado)) {
    assert.notEqual(valor, (RECOMPUESTA as unknown as Record<string, number>)[campo], `${campo} salió de la recomposición`)
  }
})

test('EL SALDO DE UNA CERRADA ES EL DEL REGISTRO — el saldo negativo de Agüero era fabricado', () => {
  // AGUERO, 1ª de junio: guardado 87 h, cobra $469.800, adelanto 0, ya_transferido 0. La pantalla mostraba
  // «Cobra $91.800 · pagado $469.800 · saldo −$378.000», porque recomponía horas de `registros_hh` vivo.
  const guardado: CadenaSellada = {
    horas: 87, valorHora: 5400, cobra: 469800, adelanto: 0, yaTransferido: 0, porBanco: 0, enEfectivo: 469800, total: 469800,
  }
  const recompuesta = { ...RECOMPUESTA, horas: 17, cobra: 91800, adelanto: 469800, yaTransferido: 0, porBanco: 0 } as LineaLiquidada
  const l = sinOverrides(recompuesta, null, {}, { ...DEL_REGISTRO, valorHora: 5400, horas: 87, cobra: 469800 }, guardado)
  assert.equal(l.cobra, 469800, 'cobra es el guardado')
  assert.equal(l.pago.pagado, 0, 'lo pagado sale del adelanto GUARDADO, no del vivo')
  assert.equal(l.pago.saldoTotal, 469800, 'y el saldo es lo que falta pagar, no −378.000')
  assert.ok(l.pago.saldoTotal > 0, 'ningún saldo negativo fabricado')
})

test('SIN CADENA GUARDADA NO SE INVENTA NADA: la línea queda como la recompuesta', () => {
  const l = sinOverrides(RECOMPUESTA, null, {}, RECONSTRUIDO, null)
  assert.equal(l.valorHora, 4000)
  assert.equal(l.cobra, 48000)
  assert.equal(l.horas, 12)
  assert.equal(l.sello?.origen, 'reconstruido')
})

test('CON $/H GUARDADO NADIE QUEDA «sin tarifa» — Gonzales Abel Valentín, 1ª de junio', () => {
  // Guardado: 94 h × $4.000 = $376.000. Hoy no tiene fila en `persona_tarifa`, así que la recomposición lo daba
  // «sin tarifa» y «—» en $/h: el pedido del dueño seguía incumplido justo ahí.
  const guardado: CadenaSellada = {
    horas: 94, valorHora: 4000, cobra: 376000, adelanto: 200000, yaTransferido: 0, porBanco: 176000, enEfectivo: 0, total: 376000,
  }
  const sinTarifaHoy = { ...RECOMPUESTA, valorHora: null, cobra: null, sinTarifa: true } as LineaLiquidada
  const l = sinOverrides(sinTarifaHoy, null, {}, { ...DEL_REGISTRO, valorHora: 4000, horas: 94, cobra: 376000 }, guardado)
  assert.equal(l.sinTarifa, false)
  assert.equal(l.valorHora, 4000)
  assert.equal(l.cobra, 376000)
})

test('LO RECONSTRUIDO NO SE DICE COMO HECHO: «Se liquidó a» es sólo del registro', () => {
  const base = {
    plataforma: 'Oficial', pisoPlataforma: 4851, categoriaRecibo: undefined, valorHoraRecibo: undefined,
    periodoRecibo: undefined, estado: null,
  } as const
  const registro = categoriasDeLaFila({ ...base, sello: { origen: 'sello', valorHora: 4300, pisoDesde: '2026-03-01', hasta: '2026-03-31' } })
  assert.equal(registro.recibo, 'Se liquidó a $4.300/h')
  assert.match(registro.titulo, /GUARDADO en la línea del cierre/)

  const recompuesto = categoriasDeLaFila({ ...base, sello: { origen: 'reconstruido', valorHora: 4000, pisoDesde: '2026-03-01', hasta: '2026-03-31' } })
  assert.doesNotMatch(recompuesto.recibo, /Se liquidó/, 'una reconstrucción no puede afirmarse como hecho')
  assert.match(recompuesto.recibo, /Sin línea guardada/)
  assert.match(recompuesto.titulo, /RECONSTRUCCIÓN[\s\S]*Puede no ser lo que se liquidó/)
  // Y NO SE COMPARA CONTRA EL PISO como si fuera el $/h real: eso afirmaría un cumplimiento que nadie verificó.
  assert.equal(recompuesto.coinciden, false)
})

test('EL PISO ES CONTEXTO Y VA CON SU FECHA — nunca el de hoy', () => {
  const c = categoriasDeLaFila({
    plataforma: 'Oficial', pisoPlataforma: 4851, categoriaRecibo: undefined, valorHoraRecibo: undefined,
    periodoRecibo: undefined, estado: null,
    sello: { origen: 'sello', valorHora: 4300, pisoDesde: '2026-03-01', hasta: '2026-03-31' },
  })
  assert.equal(c.plataforma, 'Plataforma: Oficial · $4.851/h')
  assert.match(c.titulo, /rige desde el 01\/03\/2026/)
  assert.match(c.titulo, /no quedó sellada[^\n]*legajo de HOY/)
})

test('EL SERVICIO LEE LA LÍNEA GUARDADA Y SÓLO RECOMPONE COMO RESPALDO', () => {
  const servicio = fuente('../../../services/liquidacionQuincenaService.ts')
  // LAS COLUMNAS DE LA CADENA SE PIDEN: sin esto `sellos` viene vacío y todo vuelve a recomponerse en silencio.
  assert.match(servicio, /const COLUMNAS_SELLO = \[\s*'horas', 'valor_hora', 'adelanto', 'ya_transferido', 'por_banco', 'en_efectivo', 'total', 'categoria_sellada',/)
  assert.match(servicio, /COLUMNAS_PAGADA, COLUMNAS_SELLO,/, 'y entran en la lectura')
  // EL ORIGEN LO DECIDE QUE HAYA FILA GUARDADA, no una marca: `sellado_en` está vacío en las 324 líneas cerradas.
  const armado = servicio.slice(servicio.indexOf('const selloDe ='))
  const cuerpo = armado.slice(0, armado.indexOf('\n  }\n') + 4)
  assert.match(cuerpo, /const guardada = sellos\.get\(l\.personaId\)/)
  assert.match(cuerpo, /origen: 'sello'/)
  assert.match(cuerpo, /origen: 'reconstruido'/)
  assert.doesNotMatch(cuerpo, /sellado_en/, 'no se gatea por una marca que está vacía en toda la base')
  assert.match(servicio, /selloDe\(l\), sellos\.get\(l\.personaId\) \?\? null,/, 'la cadena guardada llega a la línea')

  const guardadas = fuente('../../../services/liquidacionGuardadas.ts')
  assert.match(guardadas, /if \(horas == null && valorHora == null && cobra == null\) return null/, 'sin ninguno de los tres no hay registro')

  const overrides = fuente('../../../services/liquidacionOverrides.ts')
  // LA ABIERTA NO TIENE FOTO: su $/h sale del modelo, que sí puede correr.
  assert.match(overrides, /\/\/ LA ABIERTA NO TIENE FOTO[\s\S]{0,120}sello: null,/)
})

test('LA COLUMNA «$/h cat.» DISTINGUE REGISTRO DE RECONSTRUCCIÓN, Y NUNCA PIERDE SU TESTID', () => {
  const celdas = fuente('./CeldasBlancoNegro.tsx')
  assert.match(celdas, /if \(s == null && sello\?\.valorHora != null\)/, 'la cerrada muestra su $/h')
  assert.match(celdas, /const esRegistro = sello\.origen === 'sello'/)
  assert.match(celdas, /data-sellado=\{esRegistro \? '1' : undefined\}/, 'el registro se puede medir')
  assert.match(celdas, /data-reconstruido=\{esRegistro \? undefined : '1'\}/, 'y la reconstrucción también')
  assert.match(celdas, /\{!esRegistro && <Rec \/>\}/, 'la reconstrucción se ve distinta')
  // EL «—» TENÍA QUE PODER MEDIRSE: sin testid, el defecto vivió hasta que lo vio el dueño.
  assert.match(celdas, /if \(!s\) return <div data-testid=\{testid\}/)
  // Y EL $/H NEGRO DE SÓLO LECTURA LLEVA EL SUYO, distinto del del botón editable: dos nodos con el mismo testid
  // hacen que un `getByTestId` devuelva el que esté, no el que se quiso medir.
  assert.match(fuente('./CeldaTarifa.tsx'), /data-testid=\{`tarifa-leida-\$\{fila\.personaId\}`\}/)
})

test('EL RENGLÓN DE COBRO DICE DE DÓNDE SALE', () => {
  const cobro = fuente('./LoQueCobra.tsx')
  assert.match(cobro, /const cerradaSinRegistro = l\.sello\?\.origen === 'reconstruido'/)
  assert.match(cobro, /el registro de lo que se pagó, no un recálculo/)
  assert.match(cobro, /RECONSTRUIDAS[\s\S]{0,80}Pueden no ser lo que se pagó/)
  assert.match(cobro, /data-origen=\{l\.sello\?\.origen\}/, 'se puede medir desde un E2E')
})
