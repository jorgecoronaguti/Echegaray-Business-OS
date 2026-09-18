import test from 'node:test'
import assert from 'node:assert/strict'
import { armarCostosPorObra } from '../../clientes/services/costosDeObra.ts'
import { armarObra } from './obras.ts'
import { filaDe, type Rubros } from './presupuesto.fixture.ts'
import { cajonesDeLosClientes, celda, cierreDeRubro, cifrasResumen, composicionDelGasto, contenidoPorRubro, tablaPorRubro, contraContrato, contratoPorCliente, controlPorObra, costoPorHora, definicionDe, ITEMS, manoObraDe, obrasQueMasConsumen, porHoraMedido, resumenPorCliente } from './agregados.ts'
import { rotuloEstimada } from './obras.ts'
import { leerConsumoPorRubro } from './consumo.ts'

// `e`: las columnas del contratado de `obra_economia_rubros` (`contratado`, `origen` → `contratado_origen`…).
// `p`: el presupuesto por rubro (MO · MAT · SUB · OTR); `null` = sin presupuesto.
const obra = (id: string, cliente: string, e: Record<string, unknown>, c: Record<string, unknown> | null, p: Rubros | null = null, consumo: unknown[] | null = null) =>
  armarObra(
    { obra_id: id, nombre: id, cliente_id: cliente, cliente_slug: cliente, cliente_nombre: cliente, estado: 'activa', n_comprobantes: 1, avance_pct: null },
    filaDe(id, { contrato: { ...e, contratado_origen: e.origen ?? e.contratado_origen ?? null }, rubros: p }),
    c ? armarCostosPorObra([{ obra_id: id, ...c }])?.get(id) : null,
    consumo ? leerConsumoPorRubro(consumo.map((x) => ({ obra_id: id, ...(x as object) })))?.get(id) ?? null : null,
  )!

test('Resumen: presupuestado y consumido rubro contra rubro; lo demás es «consumido sin presupuesto»; lo sin obra no entra al queda', () => {
  const q = obra('q', 'qp', {}, { mano_obra: 30e6, materiales: 37e6 }, { MO: 39e6 })
  const p = obra('p', 'me', { contratado: 10e6, origen: 'oc-pesos' }, { materiales: 3e6 }, { MAT: 4e6 })
  const sinPres = obra('s', 'me', { contratado: 5e6, origen: 'formulario' }, { materiales: 2e6 })
  const r = cifrasResumen([q, p, sinPres], new Map([['me', 1e6]]))
  assert.equal(r.presupuestado, 43e6)
  assert.equal(r.consumido, 33e6, 'MO de q + materiales de p')
  assert.equal(r.queda, 10e6)
  assert.equal(r.consumoSinPresupuesto, 39e6, 'materiales de q (37) + la obra sin presupuesto (2)')
  assert.equal(r.sinObraAsignada, 1e6)
  assert.equal(r.obrasSinPresupuesto, 1)
  assert.equal(r.contrato, 15e6, 'referencia, no presupuesto')
})

test('Resumen sin ninguna fila: ausencias null, nunca $ 0', () => {
  const r = cifrasResumen([obra('s', 'me', {}, null)], new Map())
  assert.equal(r.presupuestado, null)
  assert.equal(r.queda, null)
  assert.equal(r.consumido, null)
  assert.equal(r.sinObraAsignada, null)
})

test('gráfico por obra: la más consumida primero, las sin presupuesto al final; exceso y consumo sin presupuesto aparte', () => {
  const pasada = obra('a', 'me', {}, { materiales: 12, mano_obra: 5 }, { MAT: 10 })
  const media = obra('b', 'me', {}, { materiales: 5 }, { MAT: 10 })
  const sinPres = obra('c', 'me', {}, { materiales: 50 })
  const f = controlPorObra([sinPres, media, pasada])
  assert.deepEqual(f.map((x) => x.obra.id), ['a', 'b', 'c'])
  assert.equal(f[0].consumido, 12)
  assert.equal(f[0].sinPresupuesto, 5, 'la mano de obra de «a» no tiene presupuesto')
  assert.equal(f[0].queda, -2)
  assert.equal(f[2].consumido, null)
  assert.equal(f[2].sinPresupuesto, 50)
  assert.equal(f[2].pct, null)
})

test('rubros: «otros» tiene consumo y presupuesto propios; HH contra las horas de la cotización; sin presupuesto de este rubro', () => {
  const a = obra('a', 'me', {}, { mano_obra: 12e6, materiales: 1e6, otros: 0.4e6, horas_valorizadas: 90, horas_sin_tarifa: 10 }, { MO: 10e6, OTR: 1e6 })
  assert.equal(celda(a, 'otros').gastado, 0.4e6)
  assert.deepEqual(celda(a, 'otros').lectura, { tipo: 'queda', monto: 0.6e6 })
  assert.match(definicionDe('otros') ?? '', /alquiler/i)
  assert.equal(definicionDe('horas'), null)
  assert.equal(celda(a, 'horas').cotizadoAusente, 'la cotización no previó horas')
  assert.equal(celda(a, 'materiales').cotizadoAusente, 'sin presupuesto de este rubro')
  assert.deepEqual(celda(a, 'materiales').lectura, { tipo: 'sinPresupuesto', monto: null })
  const mo = celda(a, 'manoObra')
  assert.equal(mo.pct, 1.2)
  assert.deepEqual(mo.lectura, { tipo: 'excedido', monto: 2e6 })
  const conHH = obra('h', 'me', {}, { horas_valorizadas: 150 }, { MO: 1 })
  const hh = celda({ ...conHH, hhPresupuestadas: 200 }, 'horas')
  assert.equal(hh.cotizado, 200)
  assert.deepEqual(hh.lectura, { tipo: 'queda', monto: 50 })
})

test('rubros: con presupuesto y sin gasto es «sin movimiento», no «queda todo»', () => {
  const a = obra('a', 'me', {}, null, { MO: 5e6 })
  assert.deepEqual(celda(a, 'manoObra').lectura, { tipo: 'sinMovimiento', monto: null })
})

test('D2 · la mano de obra estimada se dice por rubro y sumada', () => {
  const a = obra('a', 'me', {}, { mano_obra: 1000, mano_obra_estimada: 770, mano_obra_real: 230, horas_valorizadas: 10 })
  const b = obra('b', 'me', {}, { mano_obra: 1000, mano_obra_real: 1000, horas_valorizadas: 10 })
  assert.equal(celda(a, 'manoObra').consumoEstimado, '77 % estimada')
  assert.equal(celda(b, 'manoObra').consumoEstimado, null)
  assert.equal(rotuloEstimada(manoObraDe([a, b])), '39 % estimada')
})

test('$/hora: sólo con MO y horas; la empresa es cociente de sumas, no promedio de cocientes', () => {
  const a = obra('a', 'me', {}, { mano_obra: 1000, horas_valorizadas: 10 })
  const b = obra('b', 'me', {}, { mano_obra: 30000, horas_valorizadas: 1000 })
  const sinHoras = obra('c', 'me', {}, { mano_obra: 5000 })
  const r = costoPorHora([a, b, sinHoras])
  assert.equal(r.puntos.length, 2)
  assert.equal(r.empresa, 31000 / 1010)
  assert.equal(r.puntos[0].obra.id, 'a')
  assert.ok(r.puntos[0].contraEmpresa > 2)
})

test('D2 · $/hora con mano de obra estimada NO es medición: no es punto, no entra a la empresa, la tabla no lo publica', () => {
  const estimada = obra('a', 'me', {}, { mano_obra: 9000, mano_obra_estimada: 9000, horas_valorizadas: 1 })
  const real = obra('b', 'me', {}, { mano_obra: 1000, mano_obra_real: 1000, horas_valorizadas: 10 })
  const r = costoPorHora([estimada, real])
  assert.deepEqual(r.puntos.map((p) => p.obra.id), ['b'])
  assert.equal(r.empresa, 100, 'la tarifa de vuelta no contamina la cifra de la empresa')
  assert.deepEqual(r.noMedidas.map((o) => o.id), ['a'])
  assert.equal(porHoraMedido(estimada), null)
  assert.equal(porHoraMedido(real), 100)
})

test('Resumen por cliente (diseño v6): del que más consumió al que menos; la barra suma el cajón sin obra; el queda sólo con presupuesto y sin el cajón', () => {
  const q = obra('q', 'qp', {}, { mano_obra: 30e6, materiales: 37e6 }, { MO: 39e6 })
  const p = obra('p', 'me', {}, { materiales: 3e6, subcontratos: 1e6 }, { MAT: 10e6 })
  const s = obra('s', 'me', {}, { materiales: 2e6 })
  const x = obra('x', 'ar', {}, { materiales: 1e6 }, { MAT: 0.5e6 })
  const y = obra('y', 'zz', {}, { materiales: 0.2e6 })
  const f = resumenPorCliente([p, s, y, x, q], new Map([['me', 5e6]]))
  assert.deepEqual(f.map((c) => c.clienteId), ['qp', 'me', 'ar', 'zz'])
  const me = f[1]
  assert.equal(me.total, 11e6, 'obras 6 + sin obra 5')
  assert.equal(me.sinObra, 5e6)
  assert.deepEqual(me.lectura, { tipo: 'queda', monto: 7e6, conPresupuesto: 1, obras: 2 }, 'materiales 10 − 3; los subcontratos no tienen presupuesto en p; ni la obra sin presupuesto ni el cajón')
  assert.equal(me.obraPrincipal, 'p')
  assert.deepEqual(f[0].lectura, { tipo: 'queda', monto: 9e6, conPresupuesto: 1, obras: 1 }, 'MO+CS 39 contra mano de obra 30; los materiales sin MA no entran')
  assert.deepEqual(f[2].lectura, { tipo: 'excedido', monto: 0.5e6, conPresupuesto: 1, obras: 1 })
  assert.deepEqual(f[3].lectura, { tipo: 'sinPresupuesto' })
  assert.equal(f[3].presupuestado, null, 'sin presupuesto: null, nunca cero')
  assert.equal(f[3].horas, null, 'sin horas: null')
})

test('de qué está hecho el gasto: empresa y clientes a 100 %, sin el cajón; las obras que más consumen, sin las que no consumieron', () => {
  const a = obra('a', 'c1', {}, { mano_obra: 6, materiales: 4, otros: 2 })
  const b = obra('b', 'c2', {}, { subcontratos: 5 })
  const z = obra('z', 'c2', {}, null)
  const clientes = resumenPorCliente([a, b, z], new Map([['c2', 100]]))
  const mix = composicionDelGasto([a, b, z], clientes)
  assert.deepEqual(mix.map((m) => [m.nombre, m.total, m.otros]), [['Empresa', 17, 2], ['c2', 5, 0], ['c1', 12, 2]], 'los clientes en el orden de la lista por cliente (c2 primero por su cajón)')
  assert.deepEqual(obrasQueMasConsumen([z, b, a]).map((o) => o.id), ['a', 'b'])
  assert.equal(obrasQueMasConsumen([a, b], 1).length, 1)
})

test('el cajón de un cliente que la vista no muestra no entra a la tarjeta ni a las filas (auditoría 17/09/2026)', () => {
  const a = obra('a', 'visible', {}, { materiales: 10e6 }, { MAT: 12e6 })
  const cajones = new Map([['visible', 1e6], ['invisible', 0.09e6]])
  const filtrados = cajonesDeLosClientes(cajones, [a])
  assert.deepEqual([...filtrados.keys()], ['visible'])
  const r = cifrasResumen([a], filtrados)
  const filas = resumenPorCliente([a], filtrados)
  assert.equal(r.sinObraAsignada, 1e6, 'la tarjeta no suma el cajón de un cliente sin filas')
  assert.equal(filas.reduce((x, c) => x + (c.total ?? 0), 0), (r.consumoTotal ?? 0) + (r.sinObraAsignada ?? 0),
    'las filas suman exactamente consumido + sin obra asignada')
  assert.equal(cifrasResumen([a], cajones).sinObraAsignada, 1.09e6, 'sin filtrar, la tarjeta publicaría plata que ninguna fila muestra')
})

// ─── La última línea de cada rubro (dueño, 17/09/2026: «que cada rubro cierre su lectura») ───────

test('NINGÚN rubro queda mudo: los cinco cierran con una frase, con o sin presupuesto', () => {
  // La obra real de la captura: cotizó mano de obra, el fondo de materiales y otros; consumió de todo; no previó horas.
  const q = obra('q', 'qp', {}, { mano_obra: 5.68e6, materiales: 30.88e6, subcontratos: 2.08e6, otros: 0.2e6, horas_valorizadas: 718 }, { MO: 39.35e6, MAT: 44.11e6, SUB: null, OTR: 0.23e6 })
  for (const i of ITEMS) {
    const { texto } = cierreDeRubro(celda(q, i.clave), i.clave)
    assert.ok(texto.trim().length > 0, `el rubro ${i.clave} no dice nada`)
  }
  assert.equal(cierreDeRubro(celda(q, 'subcontratos'), 'subcontratos').texto, 'consumo sin presupuesto de este rubro')
  // Y sin NADA cotizado tampoco: una obra sin presupuesto no deja rubros en blanco.
  const pelada = obra('s', 'me', {}, { materiales: 2e6 })
  for (const i of ITEMS) {
    const { texto } = cierreDeRubro(celda(pelada, i.clave), i.clave)
    assert.ok(texto.trim().length > 0, `el rubro ${i.clave} sin presupuesto no dice nada`)
  }
})

test('materiales y subcontratistas se miden cada uno contra el suyo: ya no hay queda combinado', () => {
  const o = obra('q', 'qp', {}, { materiales: 30.88e6, subcontratos: 2.08e6 }, { MO: 20e6, MAT: 44.11e6, SUB: 0 })
  assert.equal(cierreDeRubro(celda(o, 'materiales'), 'materiales').texto, 'queda $ 13,23 M · 70 % consumido')
  assert.equal(cierreDeRubro(celda(o, 'subcontratos'), 'subcontratos').texto, 'no previsto en la cotización · $ 2,08 M consumidos')
})

test('una ausencia declarada no se lee como error: «otros» sin movimiento y las horas sin previsión', () => {
  const o = obra('q', 'qp', {}, { mano_obra: 12e6, horas_valorizadas: 718 }, { MO: 11e6, OTR: 0.23e6 })
  assert.equal(cierreDeRubro(celda(o, 'otros'), 'otros').texto, 'sin movimiento')
  assert.equal(cierreDeRubro(celda(o, 'horas'), 'horas').texto, 'la cotización no previó horas')
  const sinOtros = obra('s', 'qp', {}, { otros: 1e6 }, { MO: 11e6 })
  assert.equal(cierreDeRubro(celda(sinOtros, 'otros'), 'otros').texto, 'consumo sin presupuesto de este rubro')
})

test('qué contiene cada rubro (Resumen): definición, presupuestado en las obras que lo tienen, consumido y de qué está hecho', () => {
  const a = obra('a', 'me', {}, { materiales: 5e6, otros: 1e6 }, { MO: 1e6, MAT: 4e6, SUB: 0, OTR: 0.5e6 },
    [{ rubro: 'materiales', monto: 5e6, n: 3, detalle: [{ grupo: 'Hierro y malla', n: 2, monto: 4e6 }, { grupo: 'Cemento, cal y áridos', n: 1, monto: 1e6 }] },
      { rubro: 'otros', monto: 1e6, n: 1, detalle: [{ grupo: 'Alquiler y traslado de equipos', n: 1, monto: 1e6 }] }])
  const b = obra('b', 'me', {}, { materiales: 2e6 }, { MO: 2e6, MAT: null }, [{ rubro: 'materiales', monto: 2e6, n: 1, detalle: [{ grupo: 'Hierro y malla', n: 1, monto: 2e6 }] }])
  const c = contenidoPorRubro([a, b])
  assert.deepEqual(c.map((x) => x.rubro), ['manoObra', 'materiales', 'subcontratos', 'otros'])
  const mat = c[1]
  assert.equal(mat.presupuestado, 4e6, 'sólo la obra que lo cotizó')
  assert.equal(mat.obrasConPresupuesto, 1)
  assert.deepEqual(mat.sinEsteRubro, [{ nombre: 'b', motivo: 'sin presupuesto de este rubro' }])
  assert.equal(mat.consumido, 7e6)
  assert.deepEqual(mat.gruposConsumo[0], { nombre: 'Hierro y malla', monto: 6e6, n: 3, obras: 2 })
  assert.equal(c[3].consumido, 1e6)
  assert.match(c[3].definicion, /combustible/)
})

// ─── Lo contratado contra lo gastado (dueño, 17/09/2026: «más claridad de lo contratado vs lo que se va gastando») ───

test('Contrato: lo contratado es baseDelContrato (la cifra de la ficha) y se compara sólo con lo gastado en esas mismas obras', () => {
  // Instalación Eléctrica: vale $ 40 M, lleva $ 20 M facturados. El precio es 40, no 20.
  const a = obra('a', 'me', { contratado: 40e6, origen: 'oc-pesos' }, { mano_obra: 5e6, materiales: 15e6 })
  // Una obra SIN precio en ninguna fuente (baseDelContrato → null): queda afuera.
  const b = obra('b', 'me', { contratado: null }, { materiales: 12e6 })
  // Quattropani: U$S 63.000 valuados al TC de hoy; el contrato desglosado manda.
  const q = obra('q', 'qp', { contratado: 139e6, contratado_usd: 63000, tipo_cambio: 1510, origen: 'contrato', contrato_total: 139e6 }, { mano_obra: 30e6 })
  const r = contraContrato([a, b, q])
  assert.equal(r.conPrecio, 2)
  assert.equal(r.contratado, 179e6, '40 + 139; b no tiene precio y no entra')
  assert.equal(r.gastado, 50e6, '20 de a + 30 de q; los 12 de b no entran porque b no tiene precio')
  assert.equal(r.queda, 129e6)
  assert.equal(r.pct, 50e6 / 179e6)
  assert.deepEqual(r.sinPrecio, [{ id: 'b', nombre: 'b', ausencia: 'sin precio', gasto: 12e6 }])
  assert.equal(r.gastadoSinPrecio, 12e6, 'lo que gastó la obra sin precio se dice aparte, no se mezcla')
  assert.equal(q.precioEnDolares, true)
  assert.equal(a.precioEnDolares, false)
})

test('Contrato: sin ninguna obra con precio no hay cuenta — null, nunca $ 0 ni 0 %', () => {
  const b = obra('b', 'me', { contratado: null }, { materiales: 12e6 })
  const r = contraContrato([b])
  assert.equal(r.conPrecio, 0)
  assert.equal(r.contratado, null)
  assert.equal(r.gastado, null)
  assert.equal(r.queda, null)
  assert.equal(r.pct, null)
  assert.equal(r.gastadoSinPrecio, 12e6)
})

test('Contrato: una obra con precio y sin gasto queda todo; con más gasto que precio está excedida (queda negativo)', () => {
  const quieta = obra('a', 'me', { contratado: 10e6, origen: 'oc-pesos' }, null)
  assert.deepEqual([contraContrato([quieta]).gastado, contraContrato([quieta]).queda, contraContrato([quieta]).pct], [null, 10e6, null], 'sin movimiento: el % no existe')
  const pasada = obra('p', 'me', { contratado: 10e6, origen: 'oc-pesos' }, { materiales: 12e6 })
  assert.equal(contraContrato([pasada]).queda, -2e6)
})

test('Contrato por cliente: mismo orden que la lista de presupuestado (del que más gastó al que menos), el gasto por rubro es sólo de las obras con precio', () => {
  const a = obra('a', 'me', { contratado: 40e6, origen: 'oc-pesos' }, { mano_obra: 5e6, materiales: 15e6 })
  const b = obra('b', 'me', { contratado: null }, { materiales: 12e6 })
  const q = obra('q', 'qp', { contratado: 139e6, contratado_usd: 63000, tipo_cambio: 1510, origen: 'contrato', contrato_total: 139e6 }, { mano_obra: 30e6 })
  const f = contratoPorCliente([q, a, b])
  assert.deepEqual(f.map((c) => c.clienteId), ['me', 'qp'], 'me gastó 32 (20 + 12), qp 30')
  const me = f[0]
  assert.equal(me.obras, 2)
  assert.equal(me.conPrecio, 1)
  assert.equal(me.contratado, 40e6)
  assert.equal(me.gastado, 20e6)
  assert.equal(me.queda, 20e6)
  assert.equal(me.manoObra, 5e6)
  assert.equal(me.materiales, 15e6, 'los 12 de b no están en la barra: b no tiene precio')
  assert.equal(me.subcontratos, null)
  assert.equal(me.enDolares, 0)
  assert.equal(me.obraPrincipal, 'a')
  assert.equal(f[1].enDolares, 1)
  assert.equal(f[1].contratado, 139e6)
})

test('la tabla por rubro del Resumen: «otros» es columna propia, y la fila Empresa suma exactamente la cabecera', () => {
  const q = obra('q', 'qp', {}, { mano_obra: 30e6, materiales: 37e6, subcontratos: 3e6, otros: 0.2e6 }, { MO: 39e6, MAT: 44e6, SUB: null, OTR: 0.23e6 },
    [{ rubro: 'otros', monto: 0.2e6, n: 2, detalle: [{ grupo: 'Combustible de obra', n: 2, monto: 0.2e6 }] }])
  const p = obra('p', 'me', {}, { materiales: 3e6, otros: 1e6 }, { MAT: 4e6, OTR: 0.5e6 },
    [{ rubro: 'otros', monto: 1e6, n: 1, detalle: [{ grupo: 'Alquiler y traslado de equipos', n: 1, monto: 1e6 }] }])
  const s = obra('s', 'me', {}, { materiales: 2e6 })
  const clientes = resumenPorCliente([q, p, s], new Map())
  const t = tablaPorRubro([q, p, s], clientes)
  assert.deepEqual(t.filas.map((f) => f.clienteId), clientes.map((c) => c.clienteId), 'el mismo orden que la lista por cliente')
  const me = t.filas.find((f) => f.clienteId === 'me')!
  assert.equal(me.porRubro.otros.presupuestado, 0.5e6)
  assert.equal(me.porRubro.otros.consumido, 1e6)
  assert.equal(me.porRubro.otros.contenido[0].nombre, 'Alquiler y traslado de equipos', 'la columna dice qué contiene')
  assert.equal(me.porRubro.subcontratos.consumido, null, 'sin movimiento: null, nunca 0')
  const r = cifrasResumen([q, p, s], new Map())
  assert.equal(t.empresa.consumido, r.consumoTotal, 'la fila Empresa es el consumido de la cabecera')
  assert.equal(t.empresa.presupuestado, r.presupuestado, 'y su presupuestado')
  assert.equal(t.empresa.porRubro.otros.consumido, 1.2e6)
  // Los cuatro rubros de la Empresa suman el consumido total: nada queda afuera ni se cuenta dos veces.
  const suma = (['manoObra', 'materiales', 'subcontratos', 'otros'] as const).reduce((a, k) => a + (t.empresa.porRubro[k].consumido ?? 0), 0)
  assert.equal(suma, r.consumoTotal)
})
