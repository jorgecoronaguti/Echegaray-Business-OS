// El handler se prueba con el pipeline INYECTADO — nada de red, nada de IA, nada de Postgres real.
// Lo que se prueba: (1) el progreso se publica EN ORDEN hasta LISTO, nunca se deduce al final;
// (2) un fallo del pipeline deja la fila en ERROR con su motivo, nunca varada en LEYENDO;
// (3) un cómputo sin precios da importes null, nunca cero (regla de oro 1 de este repo);
// (4) cada corrida —termine bien, mal o cancelada— deja su medición guardada;
// (5) el trabajo late mientras vive y DEJA de latir cuando termina;
// (6) una cancelación del dueño no la pisa ni un LISTO ni un ERROR que llegó después.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearHandler, computoPorPaso, etapaDeProgreso, resumirMedicion, topeUsdDeEntorno } from './cotizacion_plano.mjs'

/** Un `query` falso que entiende sólo las sentencias que este handler y sus dependencias
 *  (`bytesPorHash`, `persistir`, `cascadaDe`) de verdad emiten. Cualquier otra tira error: así un
 *  cambio que agregue una consulta nueva sin actualizar el test falla RUIDOSO, no en silencio. */
function crearQueryFalso({ estado = 'LEYENDO' } = {}) {
  const llamados = []
  const fila = { estado }
  const query = async (sql, params = []) => {
    llamados.push({ sql, params })
    // Lo que consulta `cancelado()` entre unidades de trabajo: el estado VIVO de la fila. `fila` es
    // mutable a propósito — así un test puede cancelar A MITAD de la corrida, que es cuando pasa.
    if (sql.includes('select estado from public.cotizacion_lectura')) return { rows: [{ estado: fila.estado }] }
    if (sql.includes('from orq.xsas_adjunto')) {
      const hashes = params[1] ?? []
      return { rows: hashes.map((h) => ({ hash: h, nombre: 'B-01.pdf', contenido_b64: 'UExBTk8=' })) }
    }
    if (sql.includes('select mensaje from public.cotizacion_lectura')) return { rows: [{ mensaje: 'Quattropani' }] }
    if (sql.startsWith('update public.cotizacion_lectura')) return { rows: [] }
    if (sql.includes('insert into public.cotizaciones')) return { rows: [{ id: 'cot-123' }] }
    if (sql.includes('from public.parametro_comercial')) return { rows: [{ id: 'param-1' }] }
    if (sql.includes('from public.cotizacion_cascada')) return { rows: [{ costo_directo: null, venta_sin_iva: null }] }
    throw new Error(`query no mockeada en el test: ${sql.slice(0, 90)}`)
  }
  return { query, llamados, fila }
}

/** Extrae {columna: valor} de un `update ... set col = $2, ... where id = $1` a partir de los
 *  parámetros posicionales — sin ejecutar SQL de verdad. */
function columnasSeteadas(sql, params) {
  const obj = {}
  for (const m of sql.matchAll(/(\w+)\s*=\s*\$(\d+)/g)) obj[m[1]] = params[Number(m[2]) - 1]
  return obj
}

const laminaFalsa = { archivo: 'B-01.pdf', lamina: { codigo: 'B-01' }, elementos: [], proyecto: { propietario: null, nombre: 'Quattropani' }, medicion: {} }

/** Los updates de PROGRESO — el latido (`set actualizado = now()`, sin columnas) se excluye: no es
 *  una publicación de estado, es la prueba de que el proceso sigue vivo. */
function updatesDeProgreso(llamados) {
  return llamados
    .filter((l) => l.sql.startsWith('update public.cotizacion_lectura set') && !l.sql.startsWith('update public.cotizacion_lectura set actualizado = now()'))
    .map((l) => columnasSeteadas(l.sql, l.params))
}

const latidos = (llamados) => llamados.filter((l) => l.sql.startsWith('update public.cotizacion_lectura set actualizado = now()'))

const resultadoPipelineFalso = () => ({
  documentos: { planos: { legibles: [{ name: 'B-01.pdf', porQueNoLegible: null }], noLegibles: [] } },
  laminas: [laminaFalsa],
  computo: { items: [] },
  mapeo: { mapeos: [] },
  composiciones: new Map(),
  soloAdjuntos: true,
})

const ctxFalso = { logger: { warn() {}, info() {} }, config: {} }
const tareaFalsa = (over = {}) => ({ inputs: { lectura_id: 'lec-1', actor_id: 'actor-1', hashes: ['a'.repeat(64)], ...over } })

test('el progreso se publica en orden, hasta LISTO', async () => {
  const { query, llamados } = crearQueryFalso()
  const handler = crearHandler({ query, correr: async () => resultadoPipelineFalso(), crearGoogle: async () => null })

  const { result } = await handler(tareaFalsa(), ctxFalso)
  assert.equal(result.ok, true)
  assert.equal(result.presupuesto_id, 'cot-123')

  const updates = updatesDeProgreso(llamados)
  assert.ok(updates.length >= 5, `tienen que ser varias escrituras de progreso, no una sola al final (fueron ${updates.length})`)

  const estados = updates.map((u) => u.estado).filter(Boolean)
  assert.deepEqual(estados, ['LEYENDO', 'LISTO'], 'LEYENDO primero, LISTO al final — nunca al revés ni salteado')

  const etapas = updates.map((u) => u.etapa)
  assert.equal(etapas[0], 'buscando los adjuntos que se subieron', 'la primera etapa se publica ANTES de tocar el pipeline')
  // Cada etapa intermedia es un texto distinto: si dos updates seguidos publicaran la misma frase,
  // la pantalla no tendría cómo distinguir «no avanzó» de «avanzó pero repite etapa».
  const intermedias = etapas.slice(0, -1).filter(Boolean)
  assert.equal(new Set(intermedias).size, intermedias.length, 'las etapas intermedias no se repiten')

  const final = updates.at(-1)
  assert.equal(final.estado, 'LISTO')
  assert.equal(final.error, null)
  assert.equal(final.presupuesto_id, 'cot-123')
})

test('un fallo del pipeline deja la fila en ERROR con su motivo — nunca varada en LEYENDO', async () => {
  const { query, llamados } = crearQueryFalso()
  const handler = crearHandler({ query, correr: async () => { throw new Error('el modelo no devolvió JSON interpretable') }, crearGoogle: async () => null })

  const { result } = await handler(tareaFalsa({ lectura_id: 'lec-2' }), ctxFalso)
  assert.equal(result.ok, false)

  const updates = updatesDeProgreso(llamados)
  const final = updates.at(-1)
  assert.equal(final.estado, 'ERROR')
  assert.match(final.error, /el modelo no devolvió JSON interpretable/)
  assert.ok(!updates.some((u) => u.estado === 'LISTO'), 'un fallo nunca puede terminar en LISTO')
  assert.ok(!updates.some((u) => u.estado === 'LEYENDO' && updates.indexOf(u) === updates.length - 1), 'no puede quedar LEYENDO como estado final')
})

test('sin ningún plano legible entre los adjuntos, también es ERROR y no un cuelgue', async () => {
  const { query, llamados } = crearQueryFalso()
  const sinLegibles = async () => ({ ...resultadoPipelineFalso(), documentos: { planos: { legibles: [], noLegibles: [{ name: 'plano.dwg', porQueNoLegible: 'DWG no lo puede abrir el OS' }] } } })
  const handler = crearHandler({ query, correr: sinLegibles, crearGoogle: async () => null })

  const { result } = await handler(tareaFalsa({ lectura_id: 'lec-3' }), ctxFalso)
  assert.equal(result.ok, false)
  const updates = updatesDeProgreso(llamados)
  assert.equal(updates.at(-1).estado, 'ERROR')
  assert.match(updates.at(-1).error, /plano.*abrir/)
})

test('un cómputo sin precios da importes null, nunca cero', () => {
  const cot = {
    partidas: [{
      costoUnitario: null,
      subtotal: null,
      lineas: [{ elemento: 'B1', nombre: 'Base B1', cantidad: 4, unidad: 'un', criterio: 'sección citada del plano' }],
    }],
    candidatas: [{ elemento: 'X1', computo: { id: 'X1', nombre: 'Elemento sin partida', cantidad: { valor: 2 }, unidad: 'un' } }],
  }
  const { grupos } = computoPorPaso(cot)

  const bases = grupos.find((g) => g.pasoId === 'p2') // "B1" -> rol BASE -> paso 2
  assert.ok(bases, 'la línea de B1 tiene que caer en el paso de bases')
  assert.equal(bases.items[0].p, null, 'sin costoUnitario, el precio unitario es null')
  assert.equal(bases.items[0].imp, null, 'sin costoUnitario, el importe es null — NUNCA 0')
  assert.equal(bases.subtotal, null, 'un grupo sin ningún importe no puede sumar 0')

  const sinPaso = grupos.find((g) => g.pasoId === 'p7') // sin regla de rol -> el barrido
  assert.ok(sinPaso, 'una candidata sin partida también tiene que aparecer, no desaparecer del cómputo')
  assert.equal(sinPaso.items[0].p, null)
  assert.equal(sinPaso.items[0].imp, null)
  assert.match(sinPaso.items[0].nota, /sin partida/)
})

test('un cómputo CON precio suma el importe por línea, y el subtotal cierra con la partida', () => {
  const cot = {
    partidas: [{
      costoUnitario: 1000,
      lineas: [
        { elemento: 'C1', nombre: 'Columna C1', cantidad: 3, unidad: 'un', criterio: 'sección 30x30' },
        { elemento: 'C2', nombre: 'Columna C2', cantidad: 2, unidad: 'un', criterio: 'sección 30x30' },
      ],
    }],
    candidatas: [],
  }
  const { grupos } = computoPorPaso(cot)
  const columnas = grupos.find((g) => g.pasoId === 'p5') // "Columna" -> rol COLUMNA -> paso 5
  assert.ok(columnas)
  assert.equal(columnas.items[0].imp, 3000)
  assert.equal(columnas.items[1].imp, 2000)
  assert.equal(columnas.subtotal, 5000, 'el subtotal del grupo tiene que cerrar con la suma de sus importes')
})

// ═══ LA MEDICIÓN DE LA CORRIDA ══════════════════════════════════════════════════════════════════

const IA_FALSA = {
  llamadas: 3,
  deCache: 1,
  usos: [
    { modelo: 'vision-a', tokensIn: 1000, tokensOut: 200, usd: 0.0125, ms: 4200 },
    { modelo: 'vision-a', tokensIn: 900, tokensOut: 150, usd: 0.0111, ms: 3900 },
  ],
}

test('resumirMedicion: sin ninguna llamada, el costo es null — NUNCA 0', () => {
  const m = resumirMedicion({ ia: { llamadas: 0, deCache: 0, usos: [] }, ms: 1234 })
  assert.equal(m.ia.usd, null, 'una corrida que no llegó a llamar al modelo no gastó "cero": no se sabe')
  assert.equal(m.ia.tokensIn, null)
  assert.equal(m.ia.msIa, null)
  assert.equal(m.ms, 1234, 'el tiempo SÍ se conoce siempre')
  assert.equal(m.cancelada, false)
})

test('resumirMedicion: los totales se derivan de los usos reales, no se declaran', () => {
  const m = resumirMedicion({ ia: IA_FALSA, metricas: { laminas: 2 }, ms: 9876.4, progreso: { fase: 'vistas', hecho: 7, total: 12 } })
  assert.equal(m.ia.usd, 0.0236, 'suma de los usd de cada uso, redondeada a 6 decimales')
  assert.equal(m.ia.tokensIn, 1900)
  assert.equal(m.ia.tokensOut, 350)
  assert.equal(m.ia.msIa, 8100)
  assert.equal(m.ia.llamadas, 3, 'llamadas lo declara el pipeline: 3 llamadas con 1 servida del caché deja 2 usos')
  assert.equal(m.ia.deCache, 1)
  assert.equal(m.ms, 9876, 'el tiempo total se redondea a milisegundos enteros')
  assert.deepEqual(m.metricas, { laminas: 2 })
  assert.deepEqual(m.progreso, { fase: 'vistas', hecho: 7, total: 12 })
})

test('la corrida LISTA guarda su medición — cuánto tardó, cuánto costó y cuánto salió del caché', async () => {
  const { query, llamados } = crearQueryFalso()
  let t = 1_000
  const handler = crearHandler({
    query, crearGoogle: async () => null, ahora: () => t,
    correr: async () => { t += 214_000; return { ...resultadoPipelineFalso(), ia: IA_FALSA, metricas: { laminas: 1 } } },
  })

  const { result } = await handler(tareaFalsa({ lectura_id: 'lec-med' }), ctxFalso)
  assert.equal(result.ok, true)

  const final = updatesDeProgreso(llamados).at(-1)
  assert.equal(final.estado, 'LISTO')
  const medicion = JSON.parse(final.medicion)
  assert.equal(medicion.ms, 214_000, 'sin esto no hay contra qué comparar ninguna mejora de velocidad')
  assert.equal(medicion.ia.llamadas, 3)
  assert.equal(medicion.ia.deCache, 1)
  assert.equal(medicion.ia.usd, 0.0236)
  assert.equal(medicion.metricas.laminas, 1)
})

test('una corrida que FALLA a los cuatro minutos también deja su medición — es la que hay que mirar', async () => {
  const { query, llamados } = crearQueryFalso()
  let t = 0
  const handler = crearHandler({
    query, crearGoogle: async () => null, ahora: () => t,
    correr: async () => { t += 241_000; throw new Error('el modelo no devolvió JSON interpretable') },
  })

  await handler(tareaFalsa({ lectura_id: 'lec-err' }), ctxFalso)
  const final = updatesDeProgreso(llamados).at(-1)
  assert.equal(final.estado, 'ERROR')
  const medicion = JSON.parse(final.medicion)
  assert.equal(medicion.ms, 241_000, 'la corrida que falló tiene que decir CUÁNTO tardó en fallar')
  assert.equal(medicion.ia.usd, null, 'el pipeline murió sin devolver su uso: no se inventa un costo')
})

// ═══ EL PROGRESO FINO DEL TRAMO LENTO ═══════════════════════════════════════════════════════════

test('etapaDeProgreso: la cuenta real, y sin total no se inventa uno', () => {
  assert.equal(etapaDeProgreso({ fase: 'laminas', hecho: 2, total: 5 }), 'leyendo lámina 2 de 5')
  assert.equal(etapaDeProgreso({ fase: 'vistas', hecho: 7, total: 12 }), 'midiendo vista 7 de 12')
  assert.equal(etapaDeProgreso({ fase: 'laminas', hecho: 3, total: 5, que: 'B-01.pdf' }), 'leyendo lámina 3 de 5 · B-01.pdf')
  assert.equal(etapaDeProgreso({ fase: 'laminas', hecho: 3 }), 'leyendo lámina 3', 'sin total no aparece un "de N" fabricado')
  assert.equal(etapaDeProgreso({ fase: 'otra', hecho: 1, total: 2 }), 'procesando 1 de 2', 'una fase que este handler no conoce no miente la unidad')
})

test('el pipeline recibe onProgreso/cancelado/topeUsd, y cada unidad terminada escribe UNA etapa', async () => {
  const { query, llamados } = crearQueryFalso()
  let recibido = null
  const handler = crearHandler({
    query, crearGoogle: async () => null, topeUsd: 4.5,
    correr: async (args) => {
      recibido = args
      await args.onProgreso({ fase: 'laminas', hecho: 1, total: 3 })
      await args.onProgreso({ fase: 'laminas', hecho: 1, total: 3 }) // repetida: no debe escribir de nuevo
      await args.onProgreso({ fase: 'laminas', hecho: 2, total: 3 })
      await args.onProgreso({ fase: 'vistas', hecho: 5, total: 9, que: 'corte A-A' })
      return resultadoPipelineFalso()
    },
  })

  await handler(tareaFalsa({ lectura_id: 'lec-prog' }), ctxFalso)

  assert.equal(typeof recibido.onProgreso, 'function')
  assert.equal(typeof recibido.cancelado, 'function')
  assert.equal(recibido.topeUsd, 4.5)

  const etapas = updatesDeProgreso(llamados).map((u) => u.etapa).filter(Boolean)
  assert.ok(etapas.includes('leyendo lámina 1 de 3'), 'el texto en pantalla cambia durante el tramo lento')
  assert.ok(etapas.includes('leyendo lámina 2 de 3'))
  assert.ok(etapas.includes('midiendo vista 5 de 9 · corte A-A'))
  assert.equal(etapas.filter((e) => e === 'leyendo lámina 1 de 3').length, 1, 'un progreso repetido no genera otra escritura')
})

test('si publicar el progreso falla, la corrida NO se cae — ya pagó sus llamadas de visión', async () => {
  const { query } = crearQueryFalso()
  // Falla SÓLO la escritura del progreso fino — el resto de la base contesta normal. Ése es el
  // caso real: un hipo de conexión en medio del tramo largo, no la base entera caída.
  const queryQueFallaEnElProgreso = async (sql, params) => {
    if (params?.includes?.('leyendo lámina 1 de 2')) throw new Error('conexión perdida escribiendo el progreso')
    return query(sql, params)
  }
  const handler = crearHandler({
    query: queryQueFallaEnElProgreso, crearGoogle: async () => null,
    correr: async (args) => { await args.onProgreso({ fase: 'laminas', hecho: 1, total: 2 }); return resultadoPipelineFalso() },
  })
  const { result } = await handler(tareaFalsa({ lectura_id: 'lec-prog2' }), ctxFalso)
  assert.equal(result.ok, true, 'un progreso no publicado es un aviso perdido, no una lectura perdida')
})

// ═══ EL LATIDO Y EL VENCIMIENTO ═════════════════════════════════════════════════════════════════

test('mientras corre, el trabajo late — y cuando termina, DEJA de latir', async () => {
  const { query, llamados } = crearQueryFalso()
  const handler = crearHandler({
    query, crearGoogle: async () => null, msLatido: 5,
    correr: async () => { await new Promise((r) => setTimeout(r, 60)); return resultadoPipelineFalso() },
  })

  await handler(tareaFalsa({ lectura_id: 'lec-lat' }), ctxFalso)
  const durante = latidos(llamados).length
  assert.ok(durante >= 2, `un trabajo vivo tiene que latir para no vencer (latidos: ${durante})`)
  assert.match(latidos(llamados)[0].sql, /estado = 'LEYENDO'/, 'el latido no revive una fila cancelada ni terminada')

  await new Promise((r) => setTimeout(r, 40))
  assert.equal(latidos(llamados).length, durante, 'un intervalo que sigue latiendo después de terminar mantiene viva una fila muerta')
})

// ═══ CANCELAR ═══════════════════════════════════════════════════════════════════════════════════

test('cancelado a mitad de corrida: termina en CANCELADO y NO se pisa con LISTO', async () => {
  const { query, llamados, fila } = crearQueryFalso()
  const handler = crearHandler({
    query, crearGoogle: async () => null,
    correr: async (args) => {
      fila.estado = 'CANCELADO'                       // el dueño aprieta "Cancelar" mientras corre
      assert.equal(await args.cancelado(), true, 'el pipeline tiene que poder VER la cancelación')
      return resultadoPipelineFalso()                 // hoy el pipeline todavía la ignora y termina
    },
  })

  const { result } = await handler(tareaFalsa({ lectura_id: 'lec-can' }), ctxFalso)
  assert.equal(result.motivo, 'cancelada')
  const updates = updatesDeProgreso(llamados)
  assert.equal(updates.at(-1).estado, 'CANCELADO')
  assert.ok(!updates.some((u) => u.estado === 'LISTO'), 'un trabajo cancelado no puede terminar en LISTO')
  assert.equal(JSON.parse(updates.at(-1).medicion).cancelada, true, 'lo que se gastó antes de frenar también se mide')
})

test('un error posterior a la cancelación no la pisa — el UPDATE lleva su freno en el SQL', async () => {
  const { query, llamados, fila } = crearQueryFalso()
  const handler = crearHandler({
    query, crearGoogle: async () => null,
    correr: async () => { fila.estado = 'CANCELADO'; throw new Error('timeout del modelo') },
  })

  await handler(tareaFalsa({ lectura_id: 'lec-can2' }), ctxFalso)
  const errores = llamados.filter((l) => l.sql.startsWith('update public.cotizacion_lectura set estado') && l.params.includes('ERROR'))
  assert.equal(errores.length, 1)
  assert.match(errores[0].sql, /and estado <> 'CANCELADO'/, "sin este freno, la decisión del dueño de frenar se convierte en 'falló'")
})

test('topeUsdDeEntorno: sin valor no hay tope, y un valor ilegible tampoco fabrica uno', () => {
  assert.equal(topeUsdDeEntorno({}), null)
  assert.equal(topeUsdDeEntorno({ COTIZACION_TOPE_USD: '' }), null)
  assert.equal(topeUsdDeEntorno({ COTIZACION_TOPE_USD: 'tres dólares' }), null, 'un tope ilegible NO puede volverse 0 y abortar toda corrida')
  assert.equal(topeUsdDeEntorno({ COTIZACION_TOPE_USD: '0' }), null)
  assert.equal(topeUsdDeEntorno({ COTIZACION_TOPE_USD: '2,5' }), 2.5, 'el worker corre en es_AR: la coma decimal se entiende')
  assert.equal(topeUsdDeEntorno({ COTIZACION_TOPE_USD: '12' }), 12)
})

test('cancelada mientras esperaba en la cola: el worker ni la empieza', async () => {
  const { query, llamados } = crearQueryFalso({ estado: 'CANCELADO' })
  let corrio = false
  const handler = crearHandler({ query, crearGoogle: async () => null, correr: async () => { corrio = true; return resultadoPipelineFalso() } })

  const { result } = await handler(tareaFalsa({ lectura_id: 'lec-cola' }), ctxFalso)
  assert.equal(result.motivo, 'cancelada')
  assert.equal(corrio, false, 'leer un plano que ya fue cancelado es pagar llamadas de visión por nada')
  assert.equal(updatesDeProgreso(llamados).length, 0, 'una fila cancelada no vuelve a LEYENDO')
})

test('la cancelación que entra JUSTO entre la comprobación y el arranque tampoco se pisa', async () => {
  const { query, llamados, fila } = crearQueryFalso({ estado: 'ENCOLADO' })
  // El POST de cancelar entra en el instante exacto entre el `select estado` y el `update` de
  // arranque. Es una carrera de milisegundos que en producción pasa sola: sin el freno en el SQL,
  // el worker deja la fila en LEYENDO y la lee entera.
  const queryConCarrera = async (sql, params) => {
    const r = await query(sql, params)
    if (sql.includes('select estado from public.cotizacion_lectura')) fila.estado = 'CANCELADO'
    return r
  }
  const handler = crearHandler({ query: queryConCarrera, crearGoogle: async () => null, correr: async () => resultadoPipelineFalso() })

  await handler(tareaFalsa({ lectura_id: 'lec-carrera' }), ctxFalso)
  const arranque = llamados.find((l) => l.sql.startsWith('update public.cotizacion_lectura set') && l.params.includes('LEYENDO'))
  assert.ok(arranque, 'el arranque tiene que existir: en el momento del update la fila todavía se leía viva')
  assert.match(arranque.sql, /and estado <> 'CANCELADO'/, 'sin el freno, el UPDATE de arranque resucita una fila ya cancelada')
})
