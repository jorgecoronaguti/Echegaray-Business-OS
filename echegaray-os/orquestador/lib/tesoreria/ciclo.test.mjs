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

const publicados = []
const publicar = async (t) => { publicados.push(t) }

test('con la cuenta en descubierto, el ciclo NI ABRE el navegador y recomienda cancelar la línea', async () => {
  publicados.length = 0
  let releveIntentado = false
  const r = await correrCiclo({
    google: googleFake({ caja: -5000000 }),
    relevar: async () => { releveIntentado = true; return { estado: 'ok', paginas: [], bloqueos: [] } },
    publicar, ahora: HOY,
  }, { publicarSiempre: true, dias: 30 })

  assert.equal(r.estado, 'ok')
  assert.equal(r.sin_excedente, true)
  assert.equal(releveIntentado, false, 'no tiene sentido mirar el mercado si cancelar la línea gana siempre')
  assert.equal(r.recomendacion_estructural.tipo, 'aplicar_a_deuda')
  assert.equal(publicados.length, 1)
  assert.match(publicados[0], /NO HAY EXCEDENTE INVERTIBLE/)
  assert.match(publicados[0], /REQUIERE APROBACIÓN HUMANA/)
  // El paso del mercado tiene que quedar registrado como omitido, no ausente.
  assert.ok(r.traza.some((p) => p.paso === 'mercado' && p.estado === 'omitido'))
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
    politica: { reserva_minima: 1000000, caja_restringida: 0 },
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
  assert.match(publicados[0], /TESORERÍA · PROPUESTA DE INVERSIÓN/)
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
    politica: { reserva_minima: 1000000, caja_restringida: 0 }, dias: 60,
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

test('resumirCorrida produce la foto comparable entre corridas', () => {
  const r = resumirCorrida({
    posicion: { en_descubierto: false },
    excedente: { ventanas: [{ bloque: 'C', monto_maximo: 5000000 }, { bloque: 'F', monto_maximo: 0 }] },
    comparacion: { rankings: [{ ranking: [{ instrumento: 'X', rendimiento_neto_periodo: 0.05 }] }] },
    sesionRequerida: false,
  })
  assert.deepEqual(r, { en_descubierto: false, excedente: 5000000, mejor_tasa: 0.05, mejor_instrumento: 'X', sesion_requerida: false })
})
