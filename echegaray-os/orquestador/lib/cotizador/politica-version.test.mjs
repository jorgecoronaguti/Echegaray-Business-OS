// LA POLÍTICA VERSIONADA — y las dos fórmulas que no se pueden intercambiar.
//
// Cada mutación anotada abajo de un test SE CORRIÓ (mutar → correr → ver rojo → revertir) y lo que
// dice el comentario es el mensaje que la corrida devolvió, no lo que se supone que devolvería.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO } from './contrato.mjs'
import { cascada, coeficienteDe } from './comercial.mjs'
import {
  CONCEPTO, ESTADO_VERSION, componenteDePolitica, versionDePolitica, referenciaDePolitica,
  resolverReferencia, overrideDeCotizacion, politicaEfectiva, proyectarACascada,
  precioDesdeMarkup, precioDesdeMargenSobreVenta, margenDeMarkup, markupDeMargen,
  margenSobreVenta, markupSobreCosto, cumpleMargenObjetivo,
} from './politica-version.mjs'

const LIBRO = 'Planilla para Cotizar (2).xlsm · hoja Presupuesto B62:H89 · reverse-engineering 21/08/2026'

/** La v1 real de la empresa: los ocho porcentajes verificados contra el libro, 6/6 casos con
 *  diferencia $0,00. Riesgo y contingencia van en `null` porque el libro NO los tiene: hoy están
 *  implícitos adentro del 22 % de beneficio y eso es un hallazgo, no un default. */
const v1 = versionDePolitica({
  version: 1, estado: ESTADO_VERSION.PUBLICADA, publicadaPor: 'Dirección', fuente: LIBRO,
  componentes: [
    componenteDePolitica({ clave: 'pctBeneficio', valor: 0.22, fuente: LIBRO }),
    componenteDePolitica({ clave: 'pctFinanciero', valor: 0.07, fuente: LIBRO }),
    componenteDePolitica({ clave: 'factorFinanciero', valor: 0.5, fuente: `${LIBRO} · medio período` }),
    componenteDePolitica({ clave: 'pctIibb', valor: 0.024, fuente: `${LIBRO} · IIBB + Lote Hogar, NO verificado contra la DGR de San Juan` }),
    componenteDePolitica({ clave: 'pctGanancias', valor: 0.02, fuente: `${LIBRO} · proxy de costeo, no la alícuota` }),
    componenteDePolitica({ clave: 'pctCheque', valor: 0.012, fuente: LIBRO }),
    componenteDePolitica({ clave: 'pctIva', valor: 0.21, fuente: 'Ley de IVA · alícuota general' }),
    componenteDePolitica({ clave: 'pctRiesgo', valor: null, fuente: 'la cascada del libro no tiene escalón de riesgo: hoy está implícito en el beneficio' }),
    componenteDePolitica({ clave: 'pctContingencia', valor: null, fuente: 'la cascada del libro no tiene escalón de contingencia: hoy está implícita en el beneficio' }),
    componenteDePolitica({
      clave: 'margenObjetivoPct', valor: null, estado: ESTADO.CONFLICTO,
      fuente: 'parametro_operativo.margen_objetivo_pct · migración 20260829T1400',
      conflicto: 'el código productivo (ListaPresupuestos.tsx:58) usa 17 % y el handoff de diseño de la pantalla 14 dice 12 %. No hay evidencia de cuál decidió el dueño.',
    }),
  ],
})

const efectivaLimpia = () => politicaEfectiva({ version: v1, overrides: [] })

// ══════════════════════════════════════════════════════════════════════════════════════════════
// MARGEN SOBRE VENTA ≠ MARKUP SOBRE COSTO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el mismo 30 % da DOS precios distintos según sea markup o margen', () => {
  assert.equal(precioDesdeMarkup({ costo: 100, markup: 0.30 }), 130)
  assert.equal(precioDesdeMargenSobreVenta({ costo: 100, margen: 0.30 }), 142.86)
  assert.notEqual(precioDesdeMarkup({ costo: 100, markup: 0.30 }), precioDesdeMargenSobreVenta({ costo: 100, margen: 0.30 }))
  // Quien aplica «30 %» sobre el costo creyendo que gana 30 % gana 23,08 %. Son $12,86 por cada
  // $100 de costo: sobre una obra de $100 M, $12,9 M.
  assert.equal(Number(margenDeMarkup(0.30).toFixed(6)), 0.230769)
  assert.equal(Number(markupDeMargen(0.30).toFixed(6)), 0.428571)
  // MUTACIÓN CORRIDA: en `precioDesdeMargenSobreVenta`, usar `costo * (1 + margen)` —o sea, la
  //   fórmula del markup—. FALLA: «Expected values to be strictly equal: 130 !== 142.86».
})

test('las dos fórmulas son inversas una de la otra, ida y vuelta', () => {
  for (const m of [0.05, 0.12, 0.17, 0.22, 0.3, 0.45]) {
    // Sin tolerancia esto sería un test de aritmética de punto flotante, no de la conversión. La
    // tolerancia es 1e-12: el defecto que buscamos —redondear el ratio a 6 decimales— daba 1e-6.
    assert.ok(Math.abs(margenDeMarkup(markupDeMargen(m)) - m) < 1e-12, `margen ${m} no sobrevive la ida y vuelta: ${margenDeMarkup(markupDeMargen(m))}`)
    // El precio se redondea a CENTAVOS, así que el margen que se recupera de él no puede ser
    // exacto: $1.052,63 sobre $1.000 deja 4,99985 % y no 5 %. La tolerancia es de un centavo
    // llevado a fracción, no una licencia — si fuera exacto, el precio no sería un precio.
    const precio = precioDesdeMargenSobreVenta({ costo: 1000, margen: m })
    assert.ok(Math.abs(margenSobreVenta({ precio, costo: 1000 }) - m) < 1e-5, `margen ${m} → precio ${precio} → ${margenSobreVenta({ precio, costo: 1000 })}`)
  }
  // Y un margen del 100 % o más no tiene precio finito: sale `null`, no un infinito disfrazado.
  assert.equal(precioDesdeMargenSobreVenta({ costo: 100, margen: 1 }), null)
  assert.equal(markupDeMargen(1), null)
})

test('el MOTOR no intercambia beneficio con margen: el 22 % del libro deja 15,54 % sobre la venta', () => {
  const proy = proyectarACascada({ efectiva: efectivaLimpia(), pctGastosGenerales: 0.27 })
  const c = cascada({ costoDirecto: 100_000_000, politica: proy.politica })
  // El coeficiente de la empresa, verificado contra el libro.
  assert.equal(c.coeficienteSinIva, 1.681968, 'el 1,68197 del libro, con la precisión que publica el motor')
  assert.equal(coeficienteDe(proy.politica), 1.681968)
  // El BENEFICIO es markup sobre el costo industrial: 127M × 0,22 = 27,94M.
  assert.equal(c.beneficio, 27_940_000)
  // El MARGEN sobre la venta es otro número y SIEMPRE más chico que el 22 %.
  assert.equal(c.margenSobrePrecioPct, 16.61)
  assert.ok(c.margenSobrePrecioPct < 22, 'el margen sobre venta no puede ser igual ni mayor que el markup sobre costo')
  assert.equal(markupSobreCosto({ precio: c.ventaSinIva, costo: c.costoDirecto }), 0.681968, 'el markup total sobre el costo directo ES el coeficiente menos uno')
  assert.equal(margenSobreVenta({ precio: c.ventaSinIva, costo: c.costoDirecto }), 0.405458)
  // COSTO ≠ PRECIO: son dos campos distintos y ninguno devuelve el otro.
  assert.notEqual(c.costoDirecto, c.ventaSinIva)
  assert.equal(c.costoDirecto, 100_000_000)
  // MUTACIÓN CORRIDA: en `cascada` de comercial.mjs, publicar
  //   `margenSobrePrecioPct: p.pctBeneficio * 100` —o sea, llamar margen al markup—.
  //   FALLA: «Expected values to be strictly equal: 22 !== 16.61».
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA REFERENCIA A LA VERSIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('una cotización CONGELADA no cambia de precio cuando la empresa cambia su política', () => {
  const ref = referenciaDePolitica({ cotizacionId: 'COT-1', version: 1, congeladaEn: '2026-08-15' })
  const antes = cascada({
    costoDirecto: 100_000_000,
    politica: proyectarACascada({ efectiva: politicaEfectiva({ version: resolverReferencia(ref, [v1]).version }), pctGastosGenerales: 0.27 }).politica,
  })

  // La empresa publica la v2 con el beneficio en 30 % y la deja vigente.
  const v2 = versionDePolitica({
    version: 2, estado: ESTADO_VERSION.PUBLICADA, publicadaPor: 'Dirección',
    fuente: 'decisión de Dirección 30/08/2026',
    componentes: v1.componentes.map((c) => (c.clave === 'pctBeneficio' ? componenteDePolitica({ ...c, valor: 0.30, fuente: 'decisión de Dirección 30/08/2026' }) : c)),
  })
  const catalogo = [v1, v2]

  const despues = cascada({
    costoDirecto: 100_000_000,
    politica: proyectarACascada({ efectiva: politicaEfectiva({ version: resolverReferencia(ref, catalogo).version }), pctGastosGenerales: 0.27 }).politica,
  })
  assert.equal(despues.ventaSinIva, antes.ventaSinIva, 'la oferta de agosto se defiende con la política de agosto')
  assert.equal(despues.politica.version, 1)

  // Y una cotización NUEVA que referencia la v2 sí cotiza distinto: la política nueva SÍ sirve.
  const nueva = cascada({
    costoDirecto: 100_000_000,
    politica: proyectarACascada({ efectiva: politicaEfectiva({ version: resolverReferencia(referenciaDePolitica({ cotizacionId: 'COT-2', version: 2 }), catalogo).version }), pctGastosGenerales: 0.27 }).politica,
  })
  assert.ok(nueva.ventaSinIva > antes.ventaSinIva, 'si el precio nuevo no se moviera, el test anterior no probaría nada')
  // MUTACIÓN CORRIDA: en `resolverReferencia`, buscar `catalogo.find(x => x.estado === 'PUBLICADA')`
  //   en vez de por número de versión —el atajo «la vigente»—.
  //   FALLA: «la oferta de agosto se defiende con la política de agosto», actual 178.931.112,8.
})

test('una cotización no se puede apoyar en una política que nadie publicó', () => {
  const borrador = versionDePolitica({ version: 9, fuente: 'propuesta sin firmar', componentes: v1.componentes })
  const r = resolverReferencia(referenciaDePolitica({ cotizacionId: 'COT-3', version: 9 }), [borrador])
  assert.equal(r.ok, false)
  assert.match(r.porQue, /BORRADOR/)
})

test('publicar una política sin quién la firma no se puede', () => {
  assert.throws(() => versionDePolitica({ version: 3, estado: ESTADO_VERSION.PUBLICADA, fuente: 'x', componentes: [] }), /GLOBAL_POLICY_WRITE/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS OVERRIDES POR COTIZACIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════

const OVERRIDE_OK = {
  clave: 'pctBeneficio', valor: 0.19, autorizadoPor: 'Jorge Corona (Dirección)',
  motivo: 'cliente recurrente, tercera obra del año', evidencia: 'mail del 28/08 · hilo «Quattropani – ajuste»',
  fecha: '2026-08-30',
}

test('un override AUTORIZADO cambia el precio y deja el valor anterior a la vista', () => {
  const ef = politicaEfectiva({ version: v1, overrides: [overrideDeCotizacion(OVERRIDE_OK)] })
  assert.equal(ef.valores.pctBeneficio, 0.19)
  assert.equal(ef.aplicados.length, 1)
  assert.equal(ef.aplicados[0].valorAnterior, 0.22, 'sin el valor anterior nadie sabe que hubo una negociación')
  assert.equal(ef.aplicados[0].autorizadoPor, 'Jorge Corona (Dirección)')
  assert.equal(ef.rechazados.length, 0)
  assert.equal(ef.versionReferenciada, 1, 'el override NO crea una versión de la política de la empresa')
  const c = cascada({ costoDirecto: 100_000_000, politica: proyectarACascada({ efectiva: ef, pctGastosGenerales: 0.27 }).politica })
  assert.ok(c.ventaSinIva < cascada({ costoDirecto: 100_000_000, politica: proyectarACascada({ efectiva: efectivaLimpia(), pctGastosGenerales: 0.27 }).politica }).ventaSinIva)
})

test('un override SIN autorización o SIN auditoría no aplica, y no desaparece', () => {
  for (const falta of ['autorizadoPor', 'motivo', 'evidencia', 'fecha']) {
    const intento = overrideDeCotizacion({ ...OVERRIDE_OK, [falta]: null })
    assert.equal(intento.ok, false, `sin ${falta} el override no puede aplicarse`)
    const ef = politicaEfectiva({ version: v1, overrides: [intento] })
    assert.equal(ef.valores.pctBeneficio, 0.22, `sin ${falta} el beneficio tiene que seguir siendo el de la política`)
    assert.equal(ef.aplicados.length, 0)
    assert.equal(ef.rechazados.length, 1, 'se intentó y no se pudo NO es lo mismo que nunca se intentó')
    assert.equal(ef.issues.length, 1)
  }
  // MUTACIÓN CORRIDA: en `politicaEfectiva`, cambiar `if (!o?.ok)` por `if (false)` → el override
  //   sin autorizar entra igual. ROJO: «sin autorizadoPor el beneficio tiene que seguir siendo el
  //   de la política».
})

test('el IVA es NORMATIVO: no se negocia por cotización', () => {
  const intento = overrideDeCotizacion({ ...OVERRIDE_OK, clave: 'pctIva', valor: 0.105 })
  assert.equal(intento.ok, false)
  assert.match(intento.porQue, /NORMATIVO/)
})

test('el coeficiente NO es una clave de la política: no se puede escribir', () => {
  assert.equal(overrideDeCotizacion({ ...OVERRIDE_OK, clave: 'coeficienteSinIva', valor: 1.9 }).ok, false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE LA CASCADA DEL LIBRO TODAVÍA NO SABE HACER
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un riesgo declarado NO se disuelve en el beneficio: el motor se niega a calcular', () => {
  const conRiesgo = versionDePolitica({
    version: 4, estado: ESTADO_VERSION.PUBLICADA, publicadaPor: 'Dirección', fuente: 'decisión de Dirección',
    componentes: v1.componentes.map((c) => (c.clave === 'pctRiesgo' ? componenteDePolitica({ clave: 'pctRiesgo', valor: 0.03, fuente: 'decisión de Dirección 30/08' }) : c)),
  })
  const proy = proyectarACascada({ efectiva: politicaEfectiva({ version: conRiesgo }), pctGastosGenerales: 0.27 })
  assert.equal(proy.politica, null, 'publicar un precio sin el riesgo que la empresa decidió cobrar es regalarlo')
  assert.equal(proy.estado, ESTADO.CONFLICTO)
  assert.deepEqual(proy.sinRepresentar, ['pctRiesgo'])
  // Sin riesgo declarado la misma política SÍ proyecta: la negativa es del dato, no del código.
  assert.ok(proyectarACascada({ efectiva: efectivaLimpia(), pctGastosGenerales: 0.27 }).politica)
  // MUTACIÓN CORRIDA: en `proyectarACascada`, cambiar el `if (declaradosSinEscalon.length)` por
  //   `if (false)` → el 3 % de riesgo se descarta en silencio y el precio sale igual que sin riesgo.
  //   FALLA: «publicar un precio sin el riesgo que la empresa decidió cobrar es regalarlo».
})

test('el indirecto NO es cero: sin él no hay precio', () => {
  const proy = proyectarACascada({ efectiva: efectivaLimpia(), pctGastosGenerales: null })
  assert.equal(proy.politica, null)
  assert.equal(proy.estado, ESTADO.FALTA_DATO)
  assert.match(proy.porQue, /NO es cero/)
})

test('el margen objetivo en CONFLICTO no juzga a nadie: 17 y 12 conviven hasta que el dueño decida', () => {
  const r = cumpleMargenObjetivo({ version: v1, margenLogrado: 0.1554 })
  assert.equal(r.estado, ESTADO.CONFLICTO)
  assert.equal(r.cumple, null, 'con umbral 17 daría NO y con 12 daría SÍ: elegir uno fabrica una regla que la empresa no decidió')
  assert.match(r.porQue, /17 %/)
  assert.match(r.porQue, /12 %/)
  // Y con el umbral DECIDIDO sí juzga — en los dos sentidos, para probar que puede decir las dos cosas.
  const decidida = versionDePolitica({
    version: 5, estado: ESTADO_VERSION.PUBLICADA, publicadaPor: 'Dirección', fuente: 'decisión del dueño',
    componentes: [componenteDePolitica({ clave: 'margenObjetivoPct', valor: 0.12, fuente: 'decisión del dueño 30/08/2026' })],
  })
  assert.equal(cumpleMargenObjetivo({ version: decidida, margenLogrado: 0.1554 }).cumple, true)
  assert.equal(cumpleMargenObjetivo({ version: decidida, margenLogrado: 0.09 }).cumple, false)
  // MUTACIÓN CORRIDA: en `cumpleMargenObjetivo`, borrar la rama del CONFLICTO → devuelve
  //   `cumple: null` con estado FALTA_DATO y el conflicto deja de nombrarse.
  //   FALLA: «Expected values to be strictly equal: 'FALTA_DATO' !== 'CONFLICTO'».
})

test('un componente en conflicto no se puede rotular CONFIRMADO', () => {
  assert.throws(() => componenteDePolitica({ clave: 'pctBeneficio', valor: 0.22, fuente: 'x', estado: ESTADO.CONFIRMADO, conflicto: 'dos fuentes' }), /no se resuelve cambiándole el rótulo/)
})

test('los seis conceptos agrupan las claves, y el indirecto NO es uno de ellos', () => {
  assert.equal(v1.porConcepto[CONCEPTO.IMPUESTOS].length, 4)
  assert.equal(v1.porConcepto[CONCEPTO.FINANCIACION].length, 2)
  assert.equal(v1.porConcepto[CONCEPTO.BENEFICIO].length, 1)
  assert.equal(v1.porConcepto[CONCEPTO.RIESGO].length, 1)
  assert.equal(v1.porConcepto[CONCEPTO.CONTINGENCIA].length, 1)
  assert.throws(() => componenteDePolitica({ clave: 'pctGastosGenerales', valor: 0.27, fuente: 'x' }), /no es una clave de la política/)
})
