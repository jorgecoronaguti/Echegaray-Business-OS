// EL INSUMO DE OBRAS, VERIFICADO EN FRÍO: la transcripción de las explosiones del dueño no se puede
// deformar en silencio. Un monto en cero, una fecha imposible o un cliente fuera del desplegable de
// Compras rompen la pestaña OBRAS sin dar un solo #ERROR — por eso se verifican acá.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as datos from './obras-datos.mjs'
import { OBRAS_FUTURAS, CLIENTES_CANONICOS, esProyectable, totalEgresos } from './obras-datos.mjs'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const fechaValida = (iso) => {
  if (!ISO.test(String(iso))) return false
  const [y, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(y, m - 1, d))
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
}
const porClave = (clave) => OBRAS_FUTURAS.find((o) => o.clave === clave)

test('el shape es completo: cada obra trae todo lo que la grilla consume', () => {
  assert.equal(OBRAS_FUTURAS.length, 7, 'las siete obras de las explosiones del dueño')
  for (const o of OBRAS_FUTURAS) {
    assert.ok(o.clave && typeof o.clave === 'string', 'clave')
    assert.ok(o.cliente && o.obra && o.ventaTexto, `${o.clave}: cliente, obra y texto de venta`)
    for (const k of ['oficialEspecializado', 'oficial', 'ayudante']) {
      assert.ok(typeof o.horas?.[k] === 'number' && o.horas[k] >= 0, `${o.clave}: horas.${k}`)
    }
    assert.ok(typeof o.moCargasPesos === 'number' && o.moCargasPesos > 0, `${o.clave}: MO+cargas > 0`)
    assert.ok(Array.isArray(o.egresos), `${o.clave}: egresos es array`)
    assert.ok(typeof o.noCaja?.maquinaPropia === 'number' && o.noCaja.maquinaPropia >= 0, `${o.clave}: noCaja declarado`)
    assert.ok(typeof o.pctEjecutado === 'number' && o.pctEjecutado >= 0 && o.pctEjecutado < 1, `${o.clave}: pctEjecutado`)
  }
})

test('las claves no se repiten', () => {
  assert.equal(new Set(OBRAS_FUTURAS.map((o) => o.clave)).size, OBRAS_FUTURAS.length)
})

test('los clientes son los CANÓNICOS del desplegable de Compras, letra por letra', () => {
  // La fórmula del real acumulado filtra Compras col J por este texto: un alias ("Quattropani" a
  // secas) daría $0 para siempre, sin error.
  for (const o of OBRAS_FUTURAS) {
    assert.ok(CLIENTES_CANONICOS.includes(o.cliente), `${o.clave}: "${o.cliente}" no es canónico`)
  }
})

test('las fechas son ISO válidas y el fin no es anterior al inicio', () => {
  for (const o of OBRAS_FUTURAS) {
    if (!esProyectable(o)) continue
    assert.ok(fechaValida(o.inicio), `${o.clave}: inicio "${o.inicio}"`)
    assert.ok(fechaValida(o.fin), `${o.clave}: fin "${o.fin}"`)
    assert.ok(o.fin >= o.inicio, `${o.clave}: fin ${o.fin} < inicio ${o.inicio}`)
  }
})

test('todos los montos son > 0 y cada egreso sabe CUÁNDO sale (fecha o cuotas), o su obra no proyecta', () => {
  for (const o of OBRAS_FUTURAS) {
    for (const e of o.egresos) {
      assert.ok(e.concepto, `${o.clave}: egreso sin concepto`)
      assert.ok(typeof e.monto === 'number' && e.monto > 0, `${o.clave}/${e.concepto}: monto > 0`)
      if (e.cuotas) {
        for (const c of e.cuotas) {
          assert.ok(fechaValida(c.fecha), `${o.clave}/${e.concepto}: cuota "${c.fecha}"`)
          assert.ok(c.monto > 0, `${o.clave}/${e.concepto}: cuota en cero`)
        }
      } else if (e.fechaEstimada) {
        assert.ok(fechaValida(e.fechaEstimada), `${o.clave}/${e.concepto}: fecha "${e.fechaEstimada}"`)
      }
    }
  }
})

test('las cuotas suman EXACTAMENTE el monto del egreso: repartir no puede cambiar el total', () => {
  for (const o of OBRAS_FUTURAS) {
    for (const e of o.egresos) {
      if (!e.cuotas?.length) continue
      const suma = e.cuotas.reduce((s, c) => s + c.monto, 0)
      assert.ok(Math.abs(suma - e.monto) < 0.01, `${o.clave}/${e.concepto}: cuotas ${suma} ≠ monto ${e.monto}`)
    }
  }
})

test('MAMPOSTERÍA: tiene fechas, y el aviso de "venta no cargada" ya NO está — se cargó el 13/08', () => {
  const m = porClave('sf-mamposteria')
  assert.ok(m, 'la obra está')
  assert.ok(esProyectable(m), 'ya no está marcada sin fechas: el dueño las dio (07 al 19/08)')
  assert.equal(m.inicio, '2026-08-07')
  assert.equal(m.fin, '2026-08-19')
  assert.equal(m.ventaDeclarada, 8_758_810, 'la venta propia declarada por el dueño, para contrastar')
  // El aviso decía "⚠ venta aún no cargada en Cobranzas". La fila existe desde el 13/08 ($8.758.810,
  // cobro 19/08). Un aviso que quedó viejo miente con más autoridad que un dato que falta: parece
  // verificado. Si alguien lo repone como texto fijo, este test se pone rojo.
  assert.equal(m.notas, null, 'sin aviso: la venta viva la trae la fórmula')
  assert.ok(!/no cargada/i.test(String(m.notas)), 'y nunca vuelve a afirmarse que no está cargada')
})

test('ninguna nota del insumo afirma algo que la fórmula viva ya sabe: los avisos se pudren', () => {
  for (const o of OBRAS_FUTURAS) {
    if (!o.notas) continue
    assert.ok(!/no cargada|sin cargar|todavía no está en Cobranzas/i.test(o.notas),
      `${o.clave}: "${o.notas}" es una afirmación sobre Cobranzas tipeada a mano`)
  }
})

test('BSA (actualización 07/08): sin egresos proyectados — los materiales ya están facturados en Compras', () => {
  const b = porClave('messina-bsa')
  assert.ok(b, 'la obra está')
  assert.equal(b.egresos.length, 0, 'proyectar un material ya facturado lo contaría dos veces')
  assert.match(String(b.notas), /materiales ya facturados en Compras/, 'y el porqué queda escrito')
  assert.equal(b.pctEjecutado, 0.40)
  assert.equal(b.moCargasPesos, 2_108_281, 'sólo queda la MO del 60% restante')
})

test('los totales por obra salen de la suma declarada, no de un número aparte', () => {
  const pisos = porClave('sf-pisos-industriales')
  assert.equal(totalEgresos(pisos), 377_740 + 977_760 + 21_904_446)
  const bsa = porClave('messina-bsa')
  assert.equal(totalEgresos(bsa), 2_108_281, 'BSA es sólo MO')
})

test('LOS DOS CONSUMIDORES DE MAIN encuentran las obras: el desacuerdo de nombre devolvía [] sin avisar', () => {
  // Dos ramas paralelas llegaron a esta fuente esperando nombres distintos. Se replica acá la
  // resolución EXACTA de cada una (sus módulos viven en main, no en esta rama, así que no se pueden
  // importar todavía). El de Jornales es el peligroso: su aviso está en el `catch` del import, o sea
  // que con el módulo presente y el nombre distinto devolvía [] EN SILENCIO y la pestaña proyectaba
  // sólo el piso al convenio.
  // scripts/libro-movimientos-pestana.mjs → m.OBRAS_FUTURAS ?? []
  assert.equal(datos.OBRAS_FUTURAS ?? [], OBRAS_FUTURAS)
  assert.equal((datos.OBRAS_FUTURAS ?? []).length, 7, 'el Libro tiene que ver las 7 obras')
  // lib/jornales-demanda-fuente.mjs → m.obrasVendidas ?? m.OBRAS_VENDIDAS ?? m.OBRAS ?? m.default
  const bruto = datos.obrasVendidas ?? datos.OBRAS_VENDIDAS ?? datos.OBRAS ?? datos.default
  const paraJornales = typeof bruto === 'function' ? bruto() : bruto
  assert.ok(Array.isArray(paraJornales), 'si esto no es un arreglo, Jornales pierde la demanda sin un solo log')
  assert.equal(paraJornales.length, 7, 'Jornales tiene que ver las 7 obras')
  // Y es LA MISMA fuente, no una copia que pueda divergir.
  assert.equal(paraJornales, OBRAS_FUTURAS, 'un alias, no un segundo arreglo')
})

test('lo no-caja NUNCA se mezcla con los egresos: máquina propia va aparte', () => {
  for (const o of OBRAS_FUTURAS) {
    for (const e of o.egresos) {
      assert.ok(!/m[aá]quina propia/i.test(String(e.concepto)), `${o.clave}: la máquina propia no es un egreso de caja`)
    }
  }
  assert.equal(porClave('sf-pisos-industriales').noCaja.maquinaPropia, 8_832_714)
})
