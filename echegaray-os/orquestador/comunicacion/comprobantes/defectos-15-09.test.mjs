// EL 504 DE GOOGLE DEL 15/09/2026 — ocho comprobantes leídos y tirados por una falla que no era nuestra.
//
// ═══ LO QUE PASÓ, A LAS 14:44 ═══
//
// El dueño mandó 8 fotos al canal `compras`. La visión leyó las 8, `circuito.mjs` armó el fajo
// (dc2d0273, persistido con sus ítems y sus claves), `escribirFajo` reservó las 8 claves en
// `comunicacion.comprobantes_cargados` con `fila` en null, y `cargar-comprobantes-compras.mjs` murió
// en `lectorDeEncabezados(...).encabezado('Compras')` con un HTTP 504 — ANTES de escribir una celda.
//
// Consecuencias, las tres:
//   1. El bot contestó «Terminé, pero no cargué ninguno de los 8 … Revisá Compras antes de
//      reintentar» sobre un Sheet que NO se había tocado.
//   2. El evento del inbox quedó `procesado`, así que nadie lo volvió a intentar.
//   3. Las 8 reservas quedaron huérfanas: re-encolar el evento contestaba «ya estaban cargados» y no
//      escribía nada. Hubo que soltarlas a mano.
//
// Cada test de acá abajo muere si se saca la línea que lo arregla. La mutación que mata a cada uno
// está escrita arriba del test: sin eso, un test verde no prueba que el control pueda dar rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { escribirFajo, correrCargador, seReintentaTalCual, RUTA_CARGADOR } from './escritura.mjs'
import { reintentarFajos, crearReintentoDeFajos } from './reintento.mjs'
import { repoMemoria } from './dobles.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { esperaDeReintentoMin } from '../../lib/comprobantes/reintento.mjs'
import { textoTanda } from '../../lib/comprobantes/parte.mjs'
import { resultadoDeExcepcion, FASE } from '../../scripts/cargar-comprobantes-compras.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const SIN_HIELO = () => null
const MARCA = '##ORQ-JSON##'

const item = (o = {}) => ({
  clave: o.clave ?? 'c:30712345678|0113-00010489',
  comprobante: {
    proveedor: 'Combustibles Barcelo', cuit: '30712345678', tipo: 'A', numero: '0113-00010489',
    fecha: '05/01/2026', total: 36460.30, iva: 5981, obra: 'Estrella', esNotaCredito: false,
    ...(o.comprobante ?? {}),
  },
})

/** Un fajo CONFIRMADO, que es como lo recibe `escribirFajo` en producción. */
async function conFajo({ items = [item()], username = 'rodrigo' } = {}) {
  const repo = repoMemoria()
  const f = await repo.abrirFajo(null, {
    userId: 'u_rodrigo', username, channelId: 'c_compras', rootPostId: 'p_raiz', postId: 'p_raiz', items,
  })
  await repo.cerrarFajo(null, { id: f.id, estado: ESTADO.CONFIRMADO })
  return { repo, fajo: repo._fajos.get(f.id) }
}

/** El 504 tal como lo emite el cargador cuando muere leyendo (`resultadoDeExcepcion`). */
const CAIDO_LEYENDO = { ok: false, motivo: 'excepcion', fase: 'lectura', transitorio: true, escritas: 0, detalle: 'google api 504: Gateway Timeout' }
/** El mismo 504, pero a mitad de escritura: no se sabe qué quedó en la pestaña. */
const CAIDO_ESCRIBIENDO = { ok: false, motivo: 'excepcion', fase: 'escritura', transitorio: true, escritas: null, detalle: 'google api 504: Gateway Timeout' }

/** Un `spawn` de mentira que devuelve la línea JSON que se le diga, una por corrida. */
function spawnQueDice(salidas) {
  const corridas = []
  const impl = () => {
    const datos = salidas[Math.min(corridas.length, salidas.length - 1)]
    corridas.push(datos)
    return {
      stdout: { on: (ev, cb) => { if (ev === 'data') cb(`cargando…\n${MARCA}${JSON.stringify(datos)}\n`) } },
      stderr: { on: () => {} },
      on: (ev, cb) => { if (ev === 'close') setImmediate(() => cb(0)) },
    }
  }
  impl.corridas = corridas
  return impl
}

// ── 1. LA FASE: qué significa que el cargador se haya muerto ────────────────────────────────

test('el contrato JSON del cargador dice la FASE, y sólo «lectura» habilita repetir la corrida', () => {
  // MUTACIÓN QUE LO MATA: devolver `escritas: 0` también en fase escritura, o sacar `fase` del
  // emisor. Las dos convierten «se cortó a mitad de escribir» en «se puede repetir» — que es como
  // se duplica un gasto en el Flujo de Fondos.
  const e = Object.assign(new Error('google api 504: Gateway Timeout'), { status: 504 })
  const leyendo = resultadoDeExcepcion(e, FASE.LECTURA)
  assert.deepEqual(
    { fase: leyendo.fase, transitorio: leyendo.transitorio, escritas: leyendo.escritas },
    { fase: 'lectura', transitorio: true, escritas: 0 })
  assert.equal(seReintentaTalCual({ ok: false, datos: leyendo }), true)

  const escribiendo = resultadoDeExcepcion(e, FASE.ESCRITURA)
  assert.equal(escribiendo.escritas, null, 'a mitad de escritura NO se afirma que no se escribió')
  assert.equal(seReintentaTalCual({ ok: false, datos: escribiendo }), false)

  // Un error que no cambia por esperar tampoco se repite, aunque haya muerto leyendo.
  const rotulo = resultadoDeExcepcion(new Error('falta el rótulo «Obra» en Compras'), FASE.LECTURA)
  assert.equal(rotulo.transitorio, false)
  assert.equal(seReintentaTalCual({ ok: false, datos: rotulo }), false)
})

test('el cargador y la escritura hablan por la MISMA marca de línea', () => {
  // Si alguien cambia la marca de un lado, el bot deja de leer el resultado y todo lo de arriba se
  // vuelve decorativo: el JSON existiría y nadie lo miraría.
  const script = fs.readFileSync(RUTA_CARGADOR, 'utf8')
  const escritura = fs.readFileSync(path.join(AQUI, 'escritura.mjs'), 'utf8')
  assert.ok(script.includes(`'${MARCA}'`), 'el cargador ya no emite con esta marca')
  assert.ok(escritura.includes(`'${MARCA}'`), 'la escritura ya no lee esta marca')
})

// ── 2. EL REINTENTO EN PROCESO ──────────────────────────────────────────────────────────────

test('504 LEYENDO: `correrCargador` repite la misma corrida y carga cuando Google vuelve', async () => {
  // MUTACIÓN QUE LO MATA: devolver el primer resultado sin mirar `seReintentaTalCual` (el bucle
  // viejo, de una sola corrida). Entonces `corridas` queda en 1 y `r.ok` en false.
  const spawnImpl = spawnQueDice([CAIDO_LEYENDO, { ok: true, escritas: 1, fase: 'verificacion', filas: [{ i: 0, fila: 964 }] }])
  const esperas = []
  const r = await correrCargador({
    fajo: [], spawnImpl, env: {}, esperas: [5000, 15000], esperar: async (ms) => { esperas.push(ms) },
  })
  assert.equal(r.ok, true, 'la segunda corrida entró')
  assert.equal(spawnImpl.corridas.length, 2)
  assert.deepEqual(esperas, [5000], 'esperó antes de repetir, y sólo una vez')
  assert.equal(r.intentos, 2)
})

test('504 ESCRIBIENDO: NO se repite la corrida — repetirla es cómo se duplica un gasto', async () => {
  // MUTACIÓN QUE LO MATA: sacar la condición `escritas === 0` de `seReintentaTalCual`.
  const spawnImpl = spawnQueDice([CAIDO_ESCRIBIENDO])
  const r = await correrCargador({ fajo: [], spawnImpl, env: {}, esperas: [5000, 15000], esperar: async () => {} })
  assert.equal(r.ok, false)
  assert.equal(spawnImpl.corridas.length, 1, 'una sola corrida: no se repite lo que pudo haber escrito')
})

test('el cargador que sigue sin contestar después de todas las esperas se rinde y no gira para siempre', async () => {
  const spawnImpl = spawnQueDice([CAIDO_LEYENDO])
  const r = await correrCargador({ fajo: [], spawnImpl, env: {}, esperas: [1, 1], esperar: async () => {} })
  assert.equal(r.ok, false)
  assert.equal(spawnImpl.corridas.length, 3, 'la corrida original más las dos esperas')
})

// ── 3. EL FAJO NO SE TIRA: queda en `reintento` y las reservas se sueltan ───────────────────

test('504 LEYENDO: el fajo queda en `reintento`, las reservas se SUELTAN y no se dice «revisá Compras»', async () => {
  // ESTE ES EL DEFECTO DEL 15/09 ENTERO.
  // MUTACIÓN QUE LO MATA: sacar el bloque `if (seguroQueNo && seReintentaTalCual(r))` de
  // `escribirFajo`. Vuelve el «Terminé, pero no cargué ninguno … Revisá Compras» y las 8 reservas
  // huérfanas.
  const { repo, fajo } = await conFajo({ items: [item(), item({ clave: 'c:30712345678|0113-00010490', comprobante: { numero: '0113-00010490' } })] })
  const r = await escribirFajo({
    port: null, repo, congelado: SIN_HIELO,
    correr: async () => ({ ok: false, datos: CAIDO_LEYENDO, intentos: 3 }),
  }, fajo)

  assert.equal(r.estado, ESTADO.REINTENTO)
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.REINTENTO, 'el fajo espera con sus lecturas adentro')
  assert.equal(repo._fajos.get(fajo.id).intentos, 1)
  assert.ok(repo._fajos.get(fajo.id).proximo_intento_at instanceof Date, 'tiene turno')
  assert.equal(repo._cargados.size, 0, 'NINGUNA reserva huérfana: no se escribió nada')
  assert.match(r.texto, /reintento solo/i)
  assert.doesNotMatch(r.texto, /Revis[áa] Compras/i, 'no se manda a revisar un Sheet que no se tocó')
  assert.doesNotMatch(r.texto, /no cargué ninguno/i)
})

test('sin la migración aplicada, el 504 cae al camino de siempre y NO se pierde el fajo', async () => {
  // El deploy y la migración no siempre caen juntos: `programarReintento` lanza (columna o check
  // ausentes) y el fajo se reabre con su error, como antes. Lo que no puede pasar nunca es que
  // quede en un estado que la base no acepta.
  const { repo, fajo } = await conFajo()
  repo.programarReintento = async () => { throw new Error('column "proximo_intento_at" does not exist') }
  const r = await escribirFajo({
    port: null, repo, congelado: SIN_HIELO, correr: async () => ({ ok: false, datos: CAIDO_LEYENDO }),
  }, fajo)
  assert.equal(r.estado, ESTADO.ERROR)
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.ABIERTO, 'reabierto, no perdido')
  assert.equal(repo._cargados.size, 0, 'las reservas igual se sueltan')
})

test('un error que NO es de Google sigue avisando y no se reintenta solo', async () => {
  // MUTACIÓN QUE LO MATA: reintentar ante cualquier `ok:false`. Un rótulo que falta no se arregla
  // esperando, y el dueño se quedaría esperando un aviso que nunca llega.
  const { repo, fajo } = await conFajo()
  const r = await escribirFajo({
    port: null, repo, congelado: SIN_HIELO,
    correr: async () => ({ ok: false, datos: { ok: false, motivo: 'excepcion', fase: 'lectura', transitorio: false, escritas: 0, detalle: 'falta el rótulo «Obra»' } }),
  }, fajo)
  assert.equal(r.estado, ESTADO.ERROR)
  assert.notEqual(repo._fajos.get(fajo.id).estado, ESTADO.REINTENTO)
  assert.match(r.texto, /rótulo/)
})

test('el mensaje de la tanda deja de decir «no cargué ninguno» cuando en realidad los leyó', () => {
  // MUTACIÓN QUE LO MATA: sacar la rama `reintentando` de `textoTanda`.
  const t = textoTanda({ recibidos: 8, cargados: 0, reintentando: 8, avisos: [] })
  assert.match(t, /Le[íi] los 8 comprobantes/)
  assert.match(t, /reintento solo/i)
  assert.doesNotMatch(t, /no cargué ninguno/i)
})

// ── 4. LAS RESERVAS NUNCA SON UNA CÁRCEL ───────────────────────────────────────────────────

test('re-encolar el evento con las reservas HUÉRFANAS vuelve a escribir, no contesta «ya estaban»', async () => {
  // LA TERCERA CONSECUENCIA DEL 15/09. Las 8 claves quedaron reservadas sin fila; re-encolar el
  // evento contestaba «ya estaban cargados» sin escribir una línea, y hubo que soltarlas a mano.
  // MUTACIÓN QUE LO MATA: volver `reservarClaves` a `registrarCargados` a secas.
  const { repo, fajo } = await conFajo()
  // La corrida anterior, hace media hora, dejó la reserva colgada.
  repo.en('2026-09-15T14:44:00Z')
  await repo.reservarClaves(null, [{ clave: item().clave, fajoId: 'fajo_viejo' }])
  assert.equal(repo._cargados.get(item().clave).fila, null)
  repo.en('2026-09-15T15:20:00Z')

  let corrio = false
  const r = await escribirFajo({
    port: null, repo, congelado: SIN_HIELO,
    correr: async () => { corrio = true; return { ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 964 }] } } },
  }, fajo)
  assert.equal(corrio, true, 'la reserva rancia no puede bloquear el gasto para siempre')
  assert.equal(r.estado, ESTADO.CARGADO)
  assert.match(r.texto, /964/)
  assert.doesNotMatch(r.texto, /ya estaban/i)
  assert.equal(repo._cargados.get(item().clave).fila, 964)
})

test('una reserva FRESCA sin fila no se roba: otra corrida la puede estar usando', async () => {
  // El contrapeso del test de arriba. MUTACIÓN QUE LO MATA: rescatar sin mirar la edad — dos
  // corridas escribirían el mismo comprobante a la vez.
  const { repo, fajo } = await conFajo()
  repo.en('2026-09-15T15:19:00Z')
  await repo.reservarClaves(null, [{ clave: item().clave, fajoId: 'fajo_en_vuelo' }])
  repo.en('2026-09-15T15:20:00Z')
  let corrio = false
  const r = await escribirFajo({
    port: null, repo, congelado: SIN_HIELO, correr: async () => { corrio = true; return { ok: true, datos: { ok: true, escritas: 1, filas: [{ i: 0, fila: 964 }] } } },
  }, fajo)
  assert.equal(corrio, false, 'no se corre el cargador sobre claves que otro tiene tomadas')
  // Y JAMÁS se contesta «ya estaban cargados» sin una sola fila que lo respalde: eso fue lo que el
  // bot dijo el 15/09 con Compras intacta.
  assert.doesNotMatch(r.texto, /ya estaban/i)
  assert.equal(r.estado, ESTADO.REINTENTO, 'espera su turno y se vuelve a intentar')
})

test('una reserva CON FILA sigue siendo la barrera del duplicado', async () => {
  // La idempotencia no se aflojó: lo que está cargado, está cargado.
  const { repo, fajo } = await conFajo()
  repo.en('2026-09-15T14:00:00Z')
  await repo.registrarCargados(null, [{ clave: item().clave, fila: 900 }])
  repo.en('2026-09-15T18:00:00Z')
  let corrio = false
  const r = await escribirFajo({
    port: null, repo, congelado: SIN_HIELO, correr: async () => { corrio = true; return { ok: true, datos: {} } },
  }, fajo)
  assert.equal(corrio, false)
  assert.equal(r.estado, ESTADO.CARGADO)
  assert.match(r.texto, /ya estaban cargados \(fila 900/)
})

// ── 5. EL BARRIDO QUE LO TERMINA DE CARGAR Y AVISA EN EL HILO ──────────────────────────────

/** Un `port` que sólo sabe decir que no: el barrido usa el repo, no SQL suelto. */
const portMudo = { query: async () => ({ rows: [], rowCount: 0 }) }

test('el barrido toma el fajo en `reintento`, lo carga y contesta EN EL HILO original', async () => {
  // MUTACIÓN QUE LO MATA: publicar sin `rootPostId`, o no publicar. El dueño se quedaría con el
  // «lo reintento solo» y sin saber nunca que entró.
  const { repo, fajo } = await conFajo()
  await repo.programarReintento(null, { id: fajo.id, error: 'google api 504', esperaMin: 1 })
  repo.en(new Date(Date.now() + 5 * 60_000))

  const publicados = []
  const salida = await reintentarFajos({
    port: portMudo, repo, publicar: async (p) => { publicados.push(p); return { id: 'p_respuesta' } },
    escribir: async (f) => {
      assert.equal(f.estado, ESTADO.CONFIRMADO, 'se toma con compare-and-set antes de escribir')
      await repo.cerrarFajo(null, { id: f.id, estado: ESTADO.CARGADO, filas: [{ clave: item().clave, fila: 964 }] })
      return { estado: ESTADO.CARGADO, texto: 'Cargué 1 comprobante en **Compras** — fila 964.', filas: [{ fila: 964 }] }
    },
  })
  assert.equal(salida.cargados, 1)
  assert.equal(publicados.length, 1)
  assert.equal(publicados[0].rootPostId, 'p_raiz', 'la respuesta va al hilo del post original')
  assert.equal(publicados[0].channelId, 'c_compras')
  assert.match(publicados[0].texto, /Reintento 2/)
  assert.match(publicados[0].texto, /964/)
})

test('DOS barridos seguidos no cargan el mismo fajo dos veces', async () => {
  // MUTACIÓN QUE LO MATA: sacar el compare-and-set de `tomarParaReintentar` (leer y escribir sin
  // condición de estado). Dos workers cargarían el mismo fajo y el gasto entraría dos veces.
  const { repo, fajo } = await conFajo()
  await repo.programarReintento(null, { id: fajo.id, esperaMin: 0 })
  let escrituras = 0
  const escribir = async (f) => {
    escrituras++
    await repo.cerrarFajo(null, { id: f.id, estado: ESTADO.CARGADO, filas: [] })
    return { estado: ESTADO.CARGADO, texto: 'ok', filas: [{ fila: 964 }] }
  }
  await reintentarFajos({ port: portMudo, repo, publicar: async () => ({ id: 'x' }), escribir })
  await reintentarFajos({ port: portMudo, repo, publicar: async () => ({ id: 'x' }), escribir })
  assert.equal(escrituras, 1)
})

test('el fajo que todavía no tiene turno no se toca', async () => {
  const { repo, fajo } = await conFajo()
  await repo.programarReintento(null, { id: fajo.id, esperaMin: 30 })
  const salida = await reintentarFajos({ port: portMudo, repo, escribir: async () => { throw new Error('no debería escribir') } })
  assert.equal(salida.encontrados, 0)
})

test('si Google sigue caído, el barrido NO repite el aviso: reprograma y se calla', async () => {
  const { repo, fajo } = await conFajo()
  await repo.programarReintento(null, { id: fajo.id, esperaMin: 0 })
  const publicados = []
  const salida = await reintentarFajos({
    port: portMudo, repo, publicar: async (p) => { publicados.push(p); return { id: 'x' } },
    escribir: async (f) => {
      await repo.programarReintento(null, { id: f.id, error: 'google api 504', esperaMin: 2 })
      return { estado: ESTADO.REINTENTO, reintento: { intentos: 2 }, texto: 'sigue sin contestar' }
    },
  })
  assert.equal(salida.reprogramados, 1)
  assert.equal(publicados.length, 0, 'decirle lo mismo cada minuto es ruido, no información')
})

test('cuando se agota el cupo se dice que me rendí, con cuánto se esperó', async () => {
  const { repo, fajo } = await conFajo()
  await repo.programarReintento(null, { id: fajo.id, esperaMin: 0 })
  const publicados = []
  const salida = await reintentarFajos({
    port: portMudo, repo, maxIntentos: 2, publicar: async (p) => { publicados.push(p); return { id: 'x' } },
    escribir: async (f) => {
      await repo.programarReintento(null, { id: f.id, error: 'google api 504', esperaMin: 2 })
      return { estado: ESTADO.REINTENTO, reintento: { intentos: 2 }, texto: 'sigue sin contestar' }
    },
  })
  assert.equal(salida.rendidos, 1)
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.ERROR)
  assert.match(publicados[0].texto, /Me rendí después de 2 intentos/)
})

test('el fajo que se tomó para reintentar y NADIE terminó vuelve a la cola', async () => {
  // El agujero que abre el propio reintento: `tomarParaReintentar` deja el fajo en `confirmado`, y
  // si el worker muere ahí (systemd, el latido, la VM saturada) ninguna cola lo mira — el vigía de
  // mudos sólo barre `abierto`. Sería el mismo defecto con otro disfraz: plata adentro de un fajo
  // que no está en ninguna cola.
  // MUTACIÓN QUE LO MATA: sacar `rescatarConfirmadosColgados` del barrido.
  const { repo, fajo } = await conFajo()
  await repo.programarReintento(null, { id: fajo.id, esperaMin: 0 })
  await repo.tomarParaReintentar(null, { id: fajo.id })   // …y acá muere el worker
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.CONFIRMADO)

  repo.en(new Date(repo._ahora.getTime() + 20 * 60_000))
  let escrituras = 0
  const salida = await reintentarFajos({
    port: portMudo, repo, publicar: async () => ({ id: 'x' }),
    escribir: async (f) => {
      escrituras++
      await repo.cerrarFajo(null, { id: f.id, estado: ESTADO.CARGADO, filas: [] })
      return { estado: ESTADO.CARGADO, texto: 'cargué 1', filas: [{ fila: 964 }] }
    },
  })
  assert.equal(escrituras, 1, 'el fajo colgado volvió a la cola y se terminó de cargar')
  assert.equal(salida.cargados, 1)
})

test('un `confirmado` RECIÉN tomado por el flujo normal no se lo roba el barrido', async () => {
  // El contrapeso: alguien acaba de apretar Confirmar y `escribirFajo` está corriendo. Robarlo sería
  // escribir el mismo gasto dos veces.
  const { repo, fajo } = await conFajo()
  repo._fajos.get(fajo.id).ultimo_at = repo._ahora
  const salida = await reintentarFajos({ port: portMudo, repo, escribir: async () => { throw new Error('no debería escribir') } })
  assert.equal(salida.encontrados, 0)
  assert.equal(repo._fajos.get(fajo.id).estado, ESTADO.CONFIRMADO)
})

test('la espera crece y tiene techo: 1, 2, 4, 8, 16, 30, 30 minutos', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(esperaDeReintentoMin), [1, 2, 4, 8, 16, 30, 30])
})

test('el barrido tiene su propio intervalo y nunca propaga un error', async () => {
  let t = 0
  const reintentar = crearReintentoDeFajos({
    port: portMudo, repo: { fajosParaReintentar: async () => { throw new Error('base caída') } },
    intervaloMs: 60_000, ahora: () => t,
  })
  assert.deepEqual(await reintentar(), { encontrados: 0, cargados: 0, reprogramados: 0, rendidos: 0, fallidos: 0, avisados: 0 })
  assert.equal(await reintentar(), null, 'dentro del intervalo no vuelve a barrer')
  t += 60_001
  assert.ok(await reintentar() !== null)
})

// ── 6. LO QUE EL DOBLE NO PUEDE PROBAR, Y CÓMO SE TAPA ─────────────────────────────────────
//
// Todo lo de arriba corre contra `repoMemoria`. Es rápido y no necesita Postgres, pero un doble que
// se aparte de la tabla dejaría estos tests en verde mientras producción hace otra cosa. Los dos
// tests que siguen no reemplazan una prueba contra Postgres —eso pide `PG_TEST_URL` y queda
// declarado como límite—, pero sí ponen en rojo las dos formas en que esto se rompe de verdad:
// que el doble y la tabla dejen de tener las mismas funciones, y que una consulta pierda la
// condición que la hace segura.

test('el doble implementa TODO lo que el repositorio real expone (salvo lo declarado)', async () => {
  const real = await import('./repositorio.mjs')
  // Lo que el doble no finge a propósito: son consultas de apoyo (informativas o de catálogo) que
  // ningún test de escritura ejercita. Si alguien suma una función NUEVA al repositorio y no al
  // doble, este test se pone rojo y hay que decidirlo — no pasar de largo.
  const NO_DOBLADAS = ['acumuladoDeLaTanda', 'candidatasArca', 'fajosSinAviso', 'nombresPorCuit', 'reservasRancias', 'rescatarReservasRancias', 'tablasListas']
  const faltan = Object.keys(real)
    .filter((k) => typeof real[k] === 'function' && !NO_DOBLADAS.includes(k))
    .filter((k) => typeof repoMemoria()[k] !== 'function')
  assert.deepEqual(faltan, [], 'el doble se quedó atrás del repositorio real')
})

test('las consultas del reintento llevan puesta la condición que las hace seguras', async () => {
  // MUTACIÓN QUE LO MATA: sacar `and estado = $5` de `programarReintento`, `and fila is null` del
  // rescate de reservas, o `intentos > 0` del rescate de colgados. Cualquiera de las tres convierte
  // una operación condicional en un pisotón — y con plata adentro.
  const real = await import('./repositorio.mjs')
  const sql = []
  const port = { query: async (q) => { sql.push(q.replace(/\s+/g, ' ')); return { rows: [], rowCount: 0 } } }

  await real.programarReintento(port, { id: 'x', esperaMin: 1 })
  assert.match(sql.at(-1), /where id = \$1 and estado = \$5/, 'compare-and-set desde `confirmado`')
  assert.match(sql.at(-1), /intentos = coalesce\(intentos, 0\) \+ 1/)

  await real.tomarParaReintentar(port, { id: 'x' })
  assert.match(sql.at(-1), /where id = \$1 and estado = \$3/, 'dos workers no pueden tomar el mismo fajo')

  await real.rescatarReservasRancias(port, ['c:1'], { minutos: 15 })
  assert.match(sql.at(-1), /and fila is null/, 'jamás se toca una reserva que ya tiene fila')
  assert.match(sql.at(-1), /creado_at < now\(\) - make_interval/)

  await real.rescatarConfirmadosColgados(port, {})
  assert.match(sql.at(-1), /coalesce\(intentos, 0\) > 0/, 'sólo los que ya pasaron por el reintento')
  assert.match(sql.at(-1), /ultimo_at < now\(\) - make_interval/)

  await real.soltarReservas(port, ['c:1'])
  assert.match(sql.at(-1), /delete from .* where clave = any\(\$1\) and fila is null/)
})

test('la migración declara el estado nuevo y no reparte un solo grant', () => {
  // El código anda antes y después de aplicarla, pero si se aplica a medias —columnas sí, check no—
  // `programarReintento` fallaría en producción por el check y nadie lo sabría hasta el próximo 504.
  const sql = fs.readFileSync(path.join(AQUI, '../../../supabase/migrations/20260915T2330_fajo_reintentable.sql'), 'utf8')
  assert.match(sql, /add column if not exists intentos/)
  assert.match(sql, /add column if not exists proximo_intento_at/)
  assert.match(sql, /check \(estado in \([^)]*'reintento'\)\)/)
  assert.doesNotMatch(sql, /grant\s+.*\b(authenticated|anon)\b/i, 'el schema comunicacion no se expone a la web')
})
