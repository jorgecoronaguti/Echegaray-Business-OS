// EL CICLO COMPLETO — sin Google, sin Postgres, sin Chrome y sin Mattermost.
//
// El ciclo recibe sus dependencias por parámetro justamente para esto: se puede correr entero contra
// dobles y verificar el COMPORTAMIENTO (qué publica, qué omite, qué corta), que es lo que importa.
// Un ciclo que sólo se puede probar en producción no se prueba nunca.

import test from 'node:test'
import assert from 'node:assert/strict'
import { correrCiclo, resumirCorrida, RUTAS_INFORMATIVAS } from './ciclo.mjs'
import { evaluarNavegacion } from './balanz-denylist.mjs'

const HOY = new Date('2026-08-01T10:00:00Z')

/** Doble del cliente Google: devuelve lo que el calendario y el briefing esperan leer. */
function googleFake({ caja = 20000000, egresoDia5 = 0 } = {}) {
  const filas = {
    'Caja!A1:H200': [
      ['Fecha del saldo', 'Cuenta', 'Saldo en pesos'],
      ['01/08/2026', 'Santander', String(caja).replace('.', ',')],
    ],
    'Cheques Emitidos!A1:L997': egresoDia5
      ? [['FISICO', '', '', '', 'Proveedor X', String(egresoDia5), '', '', '05/08/2026', '', 'NO', '']]
      : [],
    'Cobranzas!A5:R2000': [],
    'Compras!A3:BZ3': [[]],
    'Compras!A4:AK': [],
  }
  return {
    readSheetValues: async (_id, rango) => filas[rango] ?? [],
  }
}

/** Una política de reserva APROBADA, con la forma exacta que devuelve `tesoreria.politicas`. */
const RESERVA_APROBADA = {
  valor: { monto: 1000000, metodo: 'piso_mas_egresos', version: 1 },
  aprobada_por: 'jorge', vigente_desde: '2026-08-01T00:00:00Z', aprobada_en: '2026-08-01T00:00:00Z',
}
const RESTRINGIDA_CERO = { monto: 0, fuente: 'declaración del dueño', declarada_en: '2026-08-01T00:00:00Z' }

const publicados = []
const publicar = async (t) => { publicados.push(t) }

test('sin excedente el mercado SE RELEVA IGUAL, y la recomendación estructural sigue saliendo', async () => {
  // ═══ CAMBIO DE CRITERIO, 03/08/2026 — declarado, no silencioso ═══
  //
  // Antes, sin ventanas con monto el ciclo devolvía `mercado: omitido — sin excedente` y terminaba sin
  // mirar Balanz. El razonamiento ("si cancelar la línea gana siempre, no hay nada que mirar") es
  // correcto para DECIDIR y desastroso como compuerta: el excedente se calculaba mal —restaba todo lo
  // que sale y no sumaba una cobranza— y por lo tanto daba cero siempre, así que el agente no miró el
  // mercado NUNCA. Un defecto de la mitad de caja apagaba la otra mitad entera.
  //
  // Ahora el relevamiento no depende del excedente. La recomendación de aplicar a la deuda sigue
  // saliendo —eso no cambió— y va JUNTO a la tabla comparativa, no en lugar de ella.
  publicados.length = 0
  let releveIntentado = false
  const r = await correrCiclo({
    google: googleFake({ caja: -5000000 }),
    relevar: async () => { releveIntentado = true; return { estado: 'ok', paginas: [], bloqueos: [], observado_en: HOY.toISOString() } },
    publicar, ahora: HOY,
  }, { publicarSiempre: true, dias: 30 })

  assert.equal(r.estado, 'ok')
  assert.equal(r.sin_excedente, true)
  assert.equal(releveIntentado, true, 'el mercado se releva SIEMPRE: no puede depender del excedente')
  assert.equal(r.recomendacion_estructural.tipo, 'aplicar_a_deuda')
  assert.ok(publicados.some((t) => /NO HAY EXCEDENTE INVERTIBLE/.test(t)))
  assert.ok(publicados.some((t) => /REQUIERE APROBACIÓN HUMANA/.test(t)))
  // Y la tabla comparativa se publica igual: saber contra qué se compara es información aunque hoy no
  // haya un peso para colocar.
  assert.ok(publicados.some((t) => /ALTERNATIVAS A \d+ DÍAS/.test(t)), 'falta la tabla comparativa')
  assert.ok(r.traza.some((p) => p.paso === 'tabla_instrumentos'))
})

test('sin sesión de Balanz, el ciclo NO intenta entrar: avisa y para', async () => {
  publicados.length = 0
  const r = await correrCiclo({
    google: googleFake({ caja: 50000000 }),
    relevar: async () => ({ estado: 'session_required', motivo: 'no hay Chrome escuchando en 127.0.0.1:9222' }),
    publicar, ahora: HOY,
  }, { politica: { reserva_minima: 1000000 }, dias: 30 })

  assert.equal(r.estado, 'session_required')
  assert.match(publicados[0], /NO PUDE VER EL MERCADO/)
  assert.match(publicados[0], /NUNCA intenta iniciarla/)
  // El análisis de caja se hizo igual: no se pierde el trabajo por no ver el mercado.
  assert.equal(r.posicion.estado, 'ok')
  assert.ok(r.excedente)
})

test('con excedente y una alternativa que gana, produce una propuesta validada', async () => {
  publicados.length = 0
  const r = await correrCiclo({
    google: googleFake({ caja: 50000000 }),
    relevar: async () => ({ estado: 'ok', paginas: [], bloqueos: [], observado_en: HOY.toISOString() }),
    publicar, ahora: HOY,
  }, {
    filaReserva: RESERVA_APROBADA, filaRestringida: RESTRINGIDA_CERO,
    extractorValidado: true, mercadoFresco: true,
    dias: 60,
    publicarSiempre: true,
    instrumentos: [{
      nombre: 'Lecap S31O5', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
      tasa: { tipo: 'tea', valor: 1.3, naturaleza: 'contractual' },
      costos: { comision: 0.001 }, emisor: 'Tesoro Nacional', evidencia: 'dato',
    }],
  })

  assert.equal(r.estado, 'ok')
  assert.ok(r.recomendaciones.length >= 1, `sin propuestas: ${JSON.stringify(r.sin_propuesta)}`)
  assert.equal(r.publicado, true)
  // El primer mensaje ahora es el excedente POR PLAZO: es la mitad que decide y va antes que todo.
  assert.match(publicados[0], /TESORERÍA · EXCEDENTE POR PLAZO/)
  assert.ok(publicados.some((t) => /TESORERÍA · PROPUESTA DE INVERSIÓN/.test(t)))
  // Toda propuesta publicada pasó por la validación independiente.
  assert.ok(r.validaciones.every((v) => v.aprobada || !r.recomendaciones.some((x) => x.id === v.id)))
})

test('sin cambio material, NO publica aunque haya propuesta', async () => {
  publicados.length = 0
  const comun = {
    google: googleFake({ caja: 50000000 }),
    relevar: async () => ({ estado: 'ok', paginas: [], bloqueos: [], observado_en: HOY.toISOString() }),
    publicar, ahora: HOY,
  }
  const opts = {
    filaReserva: RESERVA_APROBADA, filaRestringida: RESTRINGIDA_CERO, extractorValidado: true, mercadoFresco: true, dias: 60,
    instrumentos: [{
      nombre: 'Lecap S31O5', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
      tasa: { tipo: 'tea', valor: 1.3, naturaleza: 'contractual' },
      costos: { comision: 0.001 }, emisor: 'Tesoro', evidencia: 'dato',
    }],
  }
  const primera = await correrCiclo(comun, opts)
  const n = publicados.length
  const segunda = await correrCiclo(comun, { ...opts, anterior: primera.resumen })
  assert.equal(segunda.publicado, false)
  assert.match(segunda.motivo_publicacion, /sin cambios materiales/)
  assert.equal(publicados.length, n, 'publicó de nuevo lo mismo')
})

test('el lock impide dos corridas simultáneas: la segunda se omite, no se encola', async () => {
  let tomado = false
  const query = async (sql) => {
    if (sql.includes('pg_try_advisory_lock')) {
      const ok = !tomado; tomado = true
      return { rows: [{ ok }] }
    }
    return { rows: [] }
  }
  const deps = { google: googleFake(), publicar, ahora: HOY, query }
  const a = await correrCiclo(deps, { dias: 7 })
  const b = await correrCiclo(deps, { dias: 7 })
  assert.notEqual(a.estado, 'omitida')
  assert.equal(b.estado, 'omitida')
  assert.match(b.motivo, /ya hay una corrida en curso/)
})

test('si el Sheet no se puede leer, el ciclo devuelve sin_dato — nunca ceros', async () => {
  const r = await correrCiclo({
    google: { readSheetValues: async () => { throw new Error('403 sin permiso') } },
    publicar, ahora: HOY,
  }, { dias: 7 })
  // El calendario degrada a vacío por diseño: lo que no puede pasar es que invente un excedente.
  assert.ok(['sin_dato', 'ok'].includes(r.estado))
  if (r.estado === 'ok') assert.equal(r.sin_excedente, true, 'sin datos no puede haber excedente')
})

test('TODAS las rutas por defecto del relevamiento pasan la barrera', () => {
  for (const ruta of RUTAS_INFORMATIVAS) {
    assert.equal(evaluarNavegacion(`https://clientes.balanz.com${ruta}`).permitido, true, `${ruta} está bloqueada por la barrera`)
  }
})

/** Una corrida con excedente que llega hasta el paso de cobertura, con las páginas que se le pasen. */
const corridaConPaginas = (paginas) => correrCiclo({
  google: googleFake({ caja: 50000000 }),
  query: null,
  relevar: async () => ({ estado: 'ok', paginas, bloqueos: [], observado_en: HOY.toISOString() }),
  publicar,
  ahora: HOY,
}, {
  dias: 30, filaReserva: RESERVA_APROBADA, filaRestringida: RESTRINGIDA_CERO, extractorValidado: true,
})
const pagina = (url, completo) => ({ url: `https://clientes.balanz.com${url}`, estado: 'ok', texto: '', tabla: null, tarjetas: [], relevamiento_completo: completo, controles: { barrido_completo: true } })

test('una pantalla FUERA del universo truncada no deja el mercado "parcial"', async () => {
  // ═══ EL DEFECTO ═══
  //
  // Con el tope de 15 vueltas, cedears y corporativos cortaban en 320 filas y eso dejaba
  // `cobertura_mercado: parcial`, que BLOQUEA la accionabilidad. Subir el tope a 120 las completa
  // —medido sobre la sesión viva: corporativos 793 filas en 41 vueltas, cedears 1.078 en 113— pero
  // cedears usa 113 de 120 y tarda 11,5 minutos: el próximo lote de CEDEARs vuelve a truncar.
  // Y ninguna de las dos aporta un solo instrumento apto para tesorería (0 de 320 y 0 de 787,
  // medido en el ledger): el agente no puede quedarse sin recomendar por no terminar de leer eso.
  const r = await corridaConPaginas([
    pagina('/app/cotizaciones/cauciones', true),
    pagina('/app/cotizaciones/cedears', false),
    pagina('/app/cotizaciones/corporativos?all=1', false),
  ])
  const cobertura = r.traza.find((p) => p.paso === 'cobertura_mercado')
  assert.equal(cobertura.estado, 'ok', `el mercado quedó "${cobertura.estado}": ${cobertura.detalle}`)
  assert.ok(!r.accionabilidad.bloqueos.some((b) => /truncado/.test(b)),
    `la accionabilidad no puede bloquearse por eso: ${JSON.stringify(r.accionabilidad.bloqueos)}`)
  // Y NO desaparece en silencio: lo excluido se declara con su motivo.
  const universo = r.traza.find((p) => p.paso === 'universo_mercado')
  assert.equal(universo.estado, 'acotado')
  assert.match(universo.detalle, /decisión declarada/)
  assert.match(universo.detalle, /cedears/)
})

test('una pantalla DEL universo truncada sigue siendo un defecto que bloquea', async () => {
  // El riesgo del arreglo de arriba es perdonar de más. Letras SÍ produce instrumentos de tesorería:
  // si esa queda cortada, el agente está eligiendo sobre un universo mutilado y tiene que decirlo.
  const r = await corridaConPaginas([
    pagina('/app/cotizaciones/cauciones', true),
    pagina('/app/cotizaciones/letras', false),
  ])
  const cobertura = r.traza.find((p) => p.paso === 'cobertura_mercado')
  assert.equal(cobertura.estado, 'parcial')
  assert.match(cobertura.detalle, /letras/)
  assert.ok(r.accionabilidad.bloqueos.some((b) => /truncado/.test(b)))
})

test('resumirCorrida produce la foto comparable entre corridas', () => {
  const r = resumirCorrida({
    posicion: { en_descubierto: false },
    excedente: { ventanas: [{ bloque: 'C', monto_maximo: 5000000 }, { bloque: 'F', monto_maximo: 0 }] },
    comparacion: { rankings: [{ ranking: [{ instrumento: 'X', rendimiento_neto_periodo: 0.05 }] }] },
    sesionRequerida: false,
  })
  assert.deepEqual(r, { en_descubierto: false, excedente: 5000000, mejor_tasa: 0.05, mejor_instrumento: 'X', sesion_requerida: false })
})

test('`publicado` es lo que se ENVIÓ, no lo que se decidió enviar', async () => {
  // ═══ EL DEFECTO, ENCONTRADO EN LA PRIMERA CORRIDA PRODUCTIVA ═══
  //
  // El ledger escribía `publicado: publicar.publicar` —la DECISIÓN— sin mirar si había algo que
  // mandar. Con 0 propuestas publicables (el caso normal mientras falte la reserva mínima) `textos`
  // viene vacío, no sale un solo mensaje, y la corrida quedaba registrada como publicada. Verificado
  // contra Mattermost: `publicado=true` en el ledger y el último post del canal era de 7 minutos
  // antes. El registro que existe para responder "¿se le avisó al dueño?" contestaba que sí.
  //
  // 03/08: el escenario cambió pero el defecto es el mismo. Ahora el ciclo publica SIEMPRE el
  // excedente por plazo, así que "no hay nada que mandar" ya no se alcanza por falta de propuestas.
  // Se alcanza igual sin publicador: la DECISIÓN de publicar sigue en true y no sale un solo mensaje.
  // Si alguien vuelve a escribir `publicado: publicar.publicar`, este test se pone rojo.
  publicados.length = 0
  const r = await correrCiclo({
    google: googleFake({ caja: 50000000 }),
    query: null,
    relevar: async () => ({ estado: 'ok', paginas: [], bloqueos: [], observado_en: HOY.toISOString() }),
    publicar: null,
    ahora: HOY,
  }, {
    publicarSiempre: true, dias: 30,
    filaReserva: RESERVA_APROBADA, filaRestringida: RESTRINGIDA_CERO, extractorValidado: true,
  })
  assert.equal(publicados.length, 0, 'no debería haber salido ningún mensaje')
  assert.equal(r.motivo_publicacion, 'forzado', 'la DECISIÓN de publicar era sí')
  assert.equal(r.publicado, false, 'y el ledger no puede decir que publicó')
  assert.equal(r.mensajes_enviados, 0)
  const paso = r.traza.find((p) => p.paso === 'publicacion')
  assert.equal(paso.estado, 'omitido')
})

// ════════════════════════════════════════════════════════════════════════════
// LAS DOS DECISIONES, EN EL CICLO COMPLETO
// ════════════════════════════════════════════════════════════════════════════

/** Un Sheet con la cuenta corriente EN ROJO y efectivo aparte: el caso real que rompía el motor. */
function googleConDescubierto({ ctaCte = -40000000, efectivo = 100000000 } = {}) {
  const n = (x) => String(x).replace('.', ',')
  const filas = {
    'Caja!A1:H200': [
      ['Fecha del saldo', 'Cuenta', 'Saldo en pesos'],
      ['01/08/2026', 'Santander · cta cte ARS', n(ctaCte)],
      ['01/08/2026', 'Caja en pesos', n(efectivo)],
    ],
    'Cheques Emitidos!A1:L997': [],
    'Cobranzas!A5:R2000': [],
    'Compras!A3:BZ3': [[]],
    'Compras!A4:AK': [],
  }
  return { readSheetValues: async (_id, rango) => filas[rango] ?? [] }
}

test('DEFECTO · con descubierto abierto sale la propuesta de CANCELAR, no cuatro tablas y cero propuestas', async () => {
  // ═══ LO QUE EL DUEÑO RECHAZÓ TRES VECES ═══
  //
  // Con la cuenta corriente en rojo, la vara de cada ventana pasaba a ser el CFT del acuerdo (62,78%)
  // y ningún instrumento del mercado lo supera: todos excluidos. Y la propuesta de cancelar tampoco
  // salía, porque sólo se emitía cuando NINGUNA ventana tenía monto. Resultado publicado: cuatro
  // tablas y cero propuestas, sin una línea que dijera por qué.
  publicados.length = 0
  const r = await correrCiclo({
    google: googleConDescubierto(),
    relevar: async () => ({ estado: 'ok', paginas: [], bloqueos: [], observado_en: HOY.toISOString() }),
    publicar, ahora: HOY,
  }, {
    publicarSiempre: true, dias: 30,
    filaReserva: RESERVA_APROBADA, filaRestringida: RESTRINGIDA_CERO,
    extractorValidado: true, mercadoFresco: true,
    instrumentos: [{
      nombre: 'FCI Money Market Pesos', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 0,
      tasa: { tipo: 'tea', valor: 0.35, naturaleza: 'indicativa' },
      costos: { comision: 0 }, emisor: 'Balanz', evidencia: 'dato',
    }],
  })

  assert.equal(r.estado, 'ok')
  assert.equal(r.excedente.deuda_cancelable.monto, 40_000_000, 'la cuenta corriente está en rojo')
  // El escenario tiene descubierto Y ventanas con monto a la vez: es el que rompía el motor.
  assert.equal(r.sin_excedente, false, 'hay ventanas con monto, así que la vieja compuerta no aplica')

  // 1 · LA CANCELACIÓN SE PROPONE AUNQUE HAYA VENTANAS CON MONTO.
  //     Antes salía sólo con `sinVentanas`, o sea nunca en este caso.
  assert.equal(r.cancelacion.hay_propuesta, true)
  assert.equal(r.cancelacion.monto_a_cancelar, 40_000_000)
  assert.equal(r.recomendacion_estructural?.tipo, 'aplicar_a_deuda',
    'con saldo deudor la propuesta de cancelar sale siempre, no sólo cuando no hay excedente')
  assert.ok(publicados.some((t) => /Cancelar descubierto antes de evaluar/.test(t)))

  // 2 · EL EXCEDENTE QUE SE OFRECE COLOCAR ES EL NETO DE LA DEUDA.
  //     Sin esto el motor proponía inmovilizar $54,3M teniendo $40M de rojo: plata ya comprometida.
  const bruto = r.excedente.ventanas.find((v) => v.bloque === 'C').monto_maximo
  const colocacionC = r.decision.colocaciones.find((c) => c.bloque === 'C')
  assert.equal(colocacionC.excedente, bruto - 40_000_000)
  assert.ok(colocacionC.hay_propuesta, 'sobre el remanente sí hay una colocación que conviene')
  assert.equal(colocacionC.vara.periodo, 0, 'y la vara del remanente no es el CFT')
  //     La derivación publicada tiene que seguir cerrando en el número nuevo, no en el viejo.
  const tablaC = r.tabla_instrumentos.tablas.find((t) => t.bloque === 'C')
  assert.equal(tablaC.monto_a_colocar, bruto - 40_000_000)
  assert.equal(tablaC.derivacion.monto_maximo, bruto - 40_000_000)
  assert.equal(tablaC.derivacion.chequeo.coincide, true, 'los términos siguen sumando el piso del recorrido')
  assert.ok(tablaC.derivacion.cierre.some((t) => /descubierto que se cancela primero/.test(t.concepto)),
    'el descuento aparece como término del cuadro, no como una resta invisible')

  // 3 · Y NINGÚN BLOQUE QUEDA SIN CAUSA DECLARADA.
  assert.ok(r.decision.sin_propuesta.length > 0)
  assert.equal(r.decision.sin_propuesta.filter((s) => !s.codigo || !s.motivo).length, 0,
    'un bloque sin propuesta y sin código es indistinguible de un bloque que el sistema no supo analizar')
  assert.ok(publicados.some((t) => /POR QUÉ NO HAY PROPUESTA EN CADA BLOQUE/.test(t)))
})

test('DEFECTO · sin descubierto, un instrumento que rinde MENOS que el 62,78% igual se propone', async () => {
  // Un 35% anual sobre plata que iba a quedarse parada es ganancia pura. Medirlo contra el costo de
  // estar corto lo rechazaba, y con él a todo el universo: cero propuestas, siempre.
  publicados.length = 0
  const r = await correrCiclo({
    google: googleFake({ caja: 50000000 }),
    relevar: async () => ({ estado: 'ok', paginas: [], bloqueos: [], observado_en: HOY.toISOString() }),
    publicar, ahora: HOY,
  }, {
    publicarSiempre: true, dias: 60,
    filaReserva: RESERVA_APROBADA, filaRestringida: RESTRINGIDA_CERO,
    extractorValidado: true, mercadoFresco: true,
    instrumentos: [{
      nombre: 'Caución pesos 35%', moneda: 'ARS', plazo_rescate_dias: 0, liquidacion_dias: 1,
      tasa: { tipo: 'tea', valor: 0.35, naturaleza: 'contractual' },
      costos: { comision: 0.001 }, emisor: 'BYMA', evidencia: 'dato',
    }],
  })

  assert.equal(r.estado, 'ok')
  assert.equal(r.cancelacion.hay_propuesta, false, 'no hay rojo que cancelar en este escenario')
  assert.ok(0.35 < 0.6278, 'el instrumento rinde menos que el descubierto, a propósito')
  assert.ok(r.recomendaciones.length >= 1, `sin propuestas: ${JSON.stringify(r.decision.sin_propuesta)}`)
  const prop = r.decision.colocaciones.find((c) => c.hay_propuesta)
  assert.ok(prop, 'el núcleo de decisión tiene que proponer la colocación')
  assert.equal(prop.vara.periodo, 0, 'la vara es cero neto, no el CFT del descubierto')
  // Y el neto publicado no finge estar completo: IIBB y Ganancias siguen siendo DESCONOCIDO.
  assert.equal(prop.propuestas[0].neto_declarado.es_techo, true)
  assert.ok(prop.propuestas[0].neto_declarado.no_contempla.length === 2)
})
