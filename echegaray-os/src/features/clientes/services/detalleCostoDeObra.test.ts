import test from 'node:test'
import assert from 'node:assert/strict'
import {
  armarDetalleCosto, avisoDeCotejo, cierraConLaCelda, esRubroSinObra, leerRubro, subtituloDelDetalle, sumaDeFilas,
} from './detalleCostoDeObra.ts'
import { armarCostosPorObra, tituloMateriales, tituloSubcontratos } from './costosDeObra.ts'
import { porVencerDeMateriales, textoPorVencer } from './porVencer.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE EL PANEL NO CIERRE CON LA CELDA y nadie lo diga: la suma de las filas se compara contra el
//      número de la celda, al centavo, y un `null` de un lado con un número del otro NO cierra.
//  2 · QUE LO POR VENCER SE SUME A LO A LA FECHA (dueño, 15/09/2026: «has inventado costos»): las filas
//      traen a_la_fecha y por_vencer aparte, y a_la_fecha + por_vencer = total.
//  3 · QUE UN `rubro` TIPEADO EN LA URL abra algo: sólo los cuatro conocidos, y «sin obra» sólo dos.
//  4 · QUE UNA QUINCENA SIN TARIFA sume al total de mano de obra: `falta_dato` no se valoriza.
//  5 · QUE LA CELDA ESCRIBA «por vencer» CUANDO NO HAY NADA por vencer, o que lo esconda cuando lo hay.

/** OB-0011 PISOS INDUSTRIALES, subcontratos, medido contra la base el 15/09/2026 con la 20260915T2320
 *  ensayada: Pedro Tello, la 880 pagada y las cuotas 881–883 y 956–961 pendientes con vencimiento
 *  posterior al corte. */
const SUBCONTRATOS_OB11 = {
  obra_id: 'pisos-industriales', rubro: 'subcontratos', corte: '2026-09-15',
  total: '3020000.00', por_vencer: '12864000.00', n: 10,
  filas: [
    { fila: 880, sheet_id: 876, fecha: '2026-08-27', fecha_prevista: '2026-09-11', estado: 'Pagado', proveedor: 'PEDRO TELLO', comprobante: '0001-00000080', concepto: 'Piso industrial', total: 1800000, a_la_fecha: 1800000, por_vencer: 0 },
    { fila: 881, sheet_id: 877, fecha: '2026-08-27', fecha_prevista: '2026-09-18', estado: 'Pendiente', proveedor: 'PEDRO TELLO', comprobante: null, concepto: null, total: 2700000, a_la_fecha: '538181.82', por_vencer: '2161818.18' },
    { fila: 882, sheet_id: 878, fecha: '2026-08-27', fecha_prevista: '2026-09-25', estado: 'Pendiente', proveedor: 'PEDRO TELLO', comprobante: null, concepto: null, total: 2700000, a_la_fecha: 340909.09, por_vencer: 2359090.91 },
    { fila: 883, sheet_id: 879, fecha: '2026-08-27', fecha_prevista: '2026-10-02', estado: 'Pendiente', proveedor: 'PEDRO TELLO', comprobante: null, concepto: null, total: 2700000, a_la_fecha: 340909.09, por_vencer: 2359090.91 },
    ...[956, 957, 958, 959, 960].map((fila) => ({ fila, sheet_id: fila - 4, fecha: '2026-09-11', fecha_prevista: '2026-10-23', estado: 'Pendiente', proveedor: 'PEDRO TELLO', comprobante: null, concepto: 'Cuota', total: 997333.33, a_la_fecha: 0, por_vencer: 997333.33 })),
    { fila: 961, sheet_id: 957, fecha: '2026-09-11', fecha_prevista: '2026-10-23', estado: 'Pendiente', proveedor: 'PEDRO TELLO', comprobante: null, concepto: 'Cuota', total: 997333.35, a_la_fecha: 0, por_vencer: 997333.35 },
  ],
}

test('el rubro de la URL se valida: los cuatro conocidos abren, cualquier otra cosa no', () => {
  assert.equal(leerRubro('materiales'), 'materiales')
  assert.equal(leerRubro('mo'), 'mo')
  assert.equal(leerRubro('hh'), 'hh')
  assert.equal(leerRubro('mano_obra'), null, 'el nombre SQL no es el de la URL')
  // OTROS NO ABRE PANEL TODAVÍA (18/09/2026): `detalle_costo_de_obra` (20260915T2320) no conoce el rubro y
  // contestaría `null`; la celda va sin enlace. Cuando la RPC lo publique, se agrega a `RUBROS` y este caso cambia.
  assert.equal(leerRubro('otros'), null, 'la URL no puede abrir un detalle que la base no publica')
  assert.equal(leerRubro(''), null)
  assert.equal(leerRubro(undefined), null)
  assert.equal(leerRubro("'; drop table x; --"), null)
  // LA FILA SIN OBRA NO TIENE HORAS: sólo materiales y subcontratos.
  assert.equal(esRubroSinObra('subcontratos'), true)
  assert.equal(esRubroSinObra('mo'), false)
  assert.equal(esRubroSinObra('hh'), false)
})

test('subcontratos: las filas conservan a la fecha y por vencer aparte, y cierran con la celda', () => {
  const d = armarDetalleCosto(SUBCONTRATOS_OB11)
  assert.ok(d && d.rubro === 'subcontratos')
  assert.equal(d.n, 10)
  assert.equal(d.filas.length, 10)
  assert.equal(d.total, 3020000)
  assert.equal(d.porVencer, 12864000)
  // LA SUMA SE HACE ACÁ, no se lee del total: es el control del panel contra su lista.
  assert.equal(Math.round((sumaDeFilas(d) ?? 0) * 100) / 100, 3020000)
  assert.ok(cierraConLaCelda(sumaDeFilas(d), 3020000), 'el panel tiene que cerrar con la celda')
  assert.ok(!cierraConLaCelda(sumaDeFilas(d), 20084000), 'con lo por vencer sumado NO cierra: eso era el costo inventado')
  // POR COMPROBANTE: a la fecha + por vencer = total, y un numeric que llega como texto sigue siendo número.
  for (const f of d.filas) assert.ok(Math.abs(f.aLaFecha + f.porVencer - f.total) < 0.005, `la fila ${f.fila} no cierra`)
  assert.equal(d.filas[1].aLaFecha, 538181.82)
  assert.equal(d.filas[1].porVencer, 2161818.18)
  assert.equal(d.filas[1].fila, 881)
  assert.equal(d.filas[1].fechaPrevista, '2026-09-18')
})

test('un null de un lado y un número del otro NO cierran; dos nulls sí', () => {
  assert.equal(cierraConLaCelda(null, null), true)
  assert.equal(cierraConLaCelda(null, 10), false)
  assert.equal(cierraConLaCelda(10, null), false)
  assert.equal(cierraConLaCelda(1505981.5803, 1505981.58), true, 'medio centavo de redondeo del numeric')
  assert.equal(cierraConLaCelda(1505981.59, 1505981.58), false)
})

test('una respuesta sin a_la_fecha (RPC vieja) toma el comprobante entero, no un cero', () => {
  const d = armarDetalleCosto({ rubro: 'materiales', n: 1, filas: [{ fila: 1, total: '1500.5' }] })
  assert.ok(d && d.rubro === 'materiales')
  assert.equal(d.filas[0].aLaFecha, 1500.5)
  assert.equal(d.filas[0].porVencer, 0)
})

test('mano de obra: una quincena falta_dato no suma al total, y el panel lo cuenta aparte', () => {
  const d = armarDetalleCosto({
    rubro: 'mano_obra', corte: '2026-09-15', total: '296428.98', n: 3, horas: 36, horas_sin_tarifa: 40, puede_ver_tarifas: true,
    filas: [
      { persona_id: 'a', nombre: 'AGUERO CRISTIAN DOMINGO', quincena_desde: '2026-09-01', quincena_hasta: '2026-09-15', horas: 36, blanco: '172075.89', negro: '124353.09', total: '296428.98', estado: 'estimado', origen: 'blanco: estimado…', sellado: false },
      { persona_id: 'b', nombre: 'SIN TARIFA', quincena_desde: '2026-09-01', quincena_hasta: '2026-09-15', horas: 40, blanco: null, negro: null, total: null, estado: 'falta_dato', origen: 'negro: sin tarifa (FALTA_DATO)', sellado: false },
      { persona_id: null, quincena_desde: null, horas: 8 },
    ],
  })
  assert.ok(d && d.rubro === 'mo')
  assert.equal(d.filas.length, 2, 'una fila sin quincena no es una fila')
  assert.equal(d.total, 296428.98)
  assert.equal(sumaDeFilas(d), 296428.98)
  assert.equal(d.horasSinTarifa, 40)
  assert.equal(d.filas[1].estado, 'falta_dato')
  assert.equal(d.puedeVerTarifas, true)
})

test('hh: una persona por fila, y la suma es la de la celda', () => {
  const d = armarDetalleCosto({
    rubro: 'hh', corte: '2026-09-15', total: '193.00', n: 2, desde: '2026-09-08', hasta: '2026-09-15',
    filas: [
      { persona_id: 'x', nombre: 'OCHOA EDUARDO ARIEL', hh: 58, dias: 6, primera: '2026-09-08', ultima: '2026-09-15', horas_app: null },
      { persona_id: 'y', nombre: 'OTRO', hh: '135', dias: 6, primera: '2026-09-08', ultima: '2026-09-15' },
    ],
  })
  assert.ok(d && d.rubro === 'hh')
  assert.equal(d.total, 193)
  assert.equal(sumaDeFilas(d), 193)
  assert.equal(d.filas[0].dias, 6)
  assert.equal(d.desde, '2026-09-08')
})

test('el subtítulo del panel nombra lo por vencer, y calla cuando no hay nada por vencer', () => {
  const d = armarDetalleCosto(SUBCONTRATOS_OB11)
  assert.ok(d)
  assert.equal(
    subtituloDelDetalle('subcontratos', d),
    'Subcontratos a la fecha · $3.020.000 · por vencer $12.864.000 · 10 comprobantes',
  )
  // SIN NADA POR VENCER NO SE ESCRIBE «por vencer $0».
  const pagado = armarDetalleCosto({
    ...SUBCONTRATOS_OB11, total: '1800000.00', por_vencer: 0, n: 1, filas: [SUBCONTRATOS_OB11.filas[0]],
  })
  assert.ok(pagado)
  assert.equal(subtituloDelDetalle('subcontratos', pagado), 'Subcontratos a la fecha · $1.800.000 · 1 comprobante')
  // SIN DETALLE, EL NOMBRE DE LA COLUMNA Y NADA MÁS: no se inventa un cero.
  assert.equal(subtituloDelDetalle('mo', null), 'Mano de obra a la fecha')
})

test('hh de la caché: el pie dice de cuándo es el desglose, y no acusa un descuadre que no existe', () => {
  // EL CASO MEDIDO EL 15/09/2026: el panel decía 195 h y la columna HH 186 h. No había defecto de
  // cálculo —`hh_de_obra` sirve hasta 10 minutos de `ficha_cliente_cache` y la columna se calcula en
  // vivo—, y pintarlo en ámbar habría mandado a buscar un descuadre inexistente.
  const ahora = new Date('2026-09-15T18:04:00Z')
  const conCache = armarDetalleCosto({
    rubro: 'hh', corte: '2026-09-15', total: '195.00', n: 1, cache_calculado_en: '2026-09-15T18:00:00Z',
    filas: [{ persona_id: 'x', nombre: 'OCHOA EDUARDO ARIEL', hh: 195, dias: 20, primera: '2026-08-16', ultima: '2026-09-15' }],
  })
  assert.ok(conCache && conCache.rubro === 'hh')
  assert.equal(conCache.cacheCalculadoEn, '2026-09-15T18:00:00Z')
  const deCache = avisoDeCotejo(conCache, sumaDeFilas(conCache), 186, ahora)
  assert.deepEqual(deCache, { texto: 'Desglose con datos de hace 4 min; la columna ya dice 186 h.', problema: false })

  // EN VIVO Y SIN CERRAR SÍ ES UN PROBLEMA, y se sigue diciendo con las dos cifras.
  const enVivo = armarDetalleCosto({ ...vistaHH(195), cache_calculado_en: null })
  assert.ok(enVivo)
  const descuadre = avisoDeCotejo(enVivo, sumaDeFilas(enVivo), 186, ahora)
  assert.equal(descuadre?.problema, true)
  assert.match(descuadre?.texto ?? '', /^No cierra con la celda: la celda dice 186 h y estas filas suman 195 h\.$/)

  // Y CUANDO CIERRA NO SE ESCRIBE NADA, venga de donde venga.
  assert.equal(avisoDeCotejo(conCache, 195, 195, ahora), null)
  assert.equal(avisoDeCotejo(enVivo, 195, 195, ahora), null)

  // LA CACHÉ NO TAPA EL DESCUADRE DE LA PLATA: materiales no tiene caché, y un peso de diferencia es ámbar.
  const materiales = armarDetalleCosto(SUBCONTRATOS_OB11)
  assert.ok(materiales)
  assert.equal(avisoDeCotejo(materiales, sumaDeFilas(materiales), 20084000, ahora)?.problema, true)
})

/** Un detalle de HH de una sola persona con las horas que se le pidan. */
function vistaHH(horas: number) {
  return {
    rubro: 'hh', corte: '2026-09-15', total: String(horas), n: 1,
    filas: [{ persona_id: 'x', nombre: 'OCHOA EDUARDO ARIEL', hh: horas, dias: 20, primera: '2026-08-16', ultima: '2026-09-15' }],
  }
}

test('sin permiso o con un rubro desconocido el detalle es null, no vacío', () => {
  assert.equal(armarDetalleCosto(null), null)
  assert.equal(armarDetalleCosto({ rubro: 'otro', filas: [] }), null)
  // Y CERO FILAS NO ES NULL: la celda existe y no tiene nada adentro.
  const vacio = armarDetalleCosto({ rubro: 'materiales', total: 0, por_vencer: 0, n: 0, filas: [] })
  assert.ok(vacio && vacio.rubro === 'materiales' && vacio.filas.length === 0)
})

test('la celda escribe «+ $ X por vencer» sólo cuando hay algo por vencer, y el title lo dice', () => {
  assert.equal(textoPorVencer(12864000), '+ $12.864.000 por vencer')
  assert.equal(textoPorVencer(0), null)
  assert.equal(textoPorVencer(null), null)
  assert.equal(textoPorVencer(undefined), null)
  const [c] = armarCostosPorObra([{
    obra_id: 'pisos-industriales', materiales: 2834378.35, subcontratos: 3020000, n_comprobantes: 11, n_subcontratos: 10,
    materiales_por_vencer: 485.64, subcontratos_por_vencer: 12864000, comprometido_futuro: 12864485.64,
    puede_ver_tarifas: true, corte: '2026-09-15',
    subcontratos_detalle: [{ proveedor: 'PEDRO TELLO', comprobante: null, fecha: '2026-08-27', total: 2700000, a_la_fecha: 538181.82, por_vencer: 2161818.18, motivo: 'proveedor' }],
  }])!.values()
  assert.equal(c.materialesPorVencer, 485.64)
  assert.equal(c.subcontratosPorVencer, 12864000)
  assert.match(tituloSubcontratos(c)!, /\+ \$12\.864\.000 por vencer, que no entra/)
  assert.match(tituloMateriales(c)!, /\+ \$486 por vencer, que no entra/)
  assert.equal(porVencerDeMateriales(c), 485.64)
  // UNA RESPUESTA VIEJA (sólo comprometido_futuro) lo atribuye a materiales; una nueva con sólo subcontratos, no.
  assert.equal(porVencerDeMateriales({ ...c, materialesPorVencer: null, subcontratosPorVencer: null, comprometidoFuturo: 10 }), 10)
  assert.equal(porVencerDeMateriales({ ...c, materialesPorVencer: null, subcontratosPorVencer: 10, comprometidoFuturo: 10 }), null)
  // EL TITLE DE SUBCONTRATOS NOMBRA LO QUE ENTRA A LA FECHA DE CADA COMPROBANTE, no su total.
  assert.match(tituloSubcontratos(c)!, /PEDRO TELLO · 27\/08 · \$538\.182/)
  assert.doesNotMatch(tituloSubcontratos(c)!, /comprometido a futuro/)
})
