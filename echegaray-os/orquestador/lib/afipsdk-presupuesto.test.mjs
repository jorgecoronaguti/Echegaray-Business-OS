// EL GUARDIÁN QUE EL TIMER PROMETÍA DESDE EL 31/07 Y NO EXISTÍA.
//
// El comentario de `echegaray-arca-sync.timer` decía "el script le pregunta a la API cuánto queda
// antes de gastar, y se niega si no alcanza (ver orquestador/lib/afipsdk-presupuesto.mjs)". Ese
// archivo no estaba. La única defensa real era el propio comentario que decía no depender de sí mismo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ventanaDe, contarEnVentana, decidir, presupuesto, registrarConsumo, leerUso, credencialAceptada,
  leerSonda, parsearCredenciales, leerCredenciales, proyectoDeRespuesta, cuotaDeProyecto, cuotaDelProveedor,
} from './afipsdk-presupuesto.mjs'

const tmp = async (nombre) => join(await mkdtemp(join(tmpdir(), 'afipsdk-')), nombre)

/** Una respuesta de fetch de mentira. Los tokens de los tests son inventados, nunca los reales. */
const respuesta = (status, cuerpo = '') => ({
  status,
  text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
  json: async () => (typeof cuerpo === 'string' ? JSON.parse(cuerpo) : cuerpo),
})

/**
 * EL PROYECTO, con los nombres de campo EXACTOS que devolvió producción el 13/08. Los valores son
 * inventados; los nombres no, y son lo único que este fixture tiene que proteger.
 */
const PROYECTO = {
  id: 'proyecto-de-prueba',
  name: 'Echegaray OS',
  status: 'active',
  subscription_status: 'active',
  subscription_current_period_start: '2026-08-10T20:19:23+00:00',
  subscription_current_period_end: '2026-09-10T20:19:23+00:00',
  automation_billing_plan: 'free',
  automation_limit: 10,
  current_period_automation_usage: 0,
  pdf_limit: 100,
  current_period_pdf_usage: 0,
  request_limit: 1000,
  current_period_request_usage: 0,
  access_token: 'token-de-prueba',
  features: { pdf: true, automation: true },
}

/**
 * LA FORMA REAL: `GET /api/v1/projects` devuelve MEMBRESÍAS, no proyectos. El `id` de afuera es el de
 * la membresía —otro UUID de 36 caracteres— y el proyecto va anidado. Comparar contra el de afuera no
 * matchea nunca y no falla ruidosamente: el sync se cae al contador local diciendo "¿varios
 * proyectos?" con uno solo. Es lo que pasó, y por eso este fixture existe.
 */
const MEMBRESIAS = [{
  id: 'membresia-de-prueba-no-es-el-proyecto',
  role: 'owner',
  created_at: '2026-07-10T17:19:00+00:00',
  project: PROYECTO,
}]

// ── EL CONTEO ────────────────────────────────────────────────────────────────────────────────────

test('la ventana es el mes calendario y no arrastra el gasto del mes anterior', () => {
  assert.equal(ventanaDe('2026-08-07'), '2026-08')
  const registro = {
    eventos: [
      { fecha: '2026-07-27', cantidad: 2 }, { fecha: '2026-08-03', cantidad: 2 }, { fecha: '2026-08-07', cantidad: 1 },
    ],
  }
  assert.equal(contarEnVentana(registro, '2026-08'), 3)
  assert.equal(contarEnVentana(registro, '2026-07'), 2)
  assert.equal(contarEnVentana({}, '2026-08'), 0)
})

// ── LA DECISIÓN ──────────────────────────────────────────────────────────────────────────────────

test('SE NIEGA cuando lo que queda no alcanza — y dice cuánto queda', () => {
  // Plan free 10, reserva 2 para el dueño: con 8 gastadas no queda nada para una corrida de 2.
  const d = decidir({ usadas: 8, pedido: 2, limite: 10, reserva: 2 })
  assert.equal(d.ok, false)
  assert.equal(d.disponible, 0)
  assert.match(d.motivo, /necesito 2 automatización\(es\) y quedan 0/)
})

test('LA RESERVA DEL DUEÑO NO SE GASTA SOLA: con 6 usadas de 10 todavía entra una corrida, con 7 no', () => {
  // 10 − 2 de reserva = 8 disponibles para el timer. Sin reserva, el agente puede dejar al dueño sin
  // poder bajar sus comprobantes justo el día que los necesita, y no hay forma de conseguir más.
  assert.equal(decidir({ usadas: 6, pedido: 2, limite: 10, reserva: 2 }).ok, true)
  assert.equal(decidir({ usadas: 7, pedido: 2, limite: 10, reserva: 2 }).ok, false)
})

test('FALLA CERRADO si el límite no se entiende: no hay tope implícito', () => {
  // Interpretar un límite vacío como "no hay tope" gasta el plan entero en una corrida.
  for (const limite of [0, -1, NaN, null, 'diez']) {
    const d = decidir({ usadas: 0, pedido: 2, limite })
    assert.equal(d.ok, false, `límite ${String(limite)} tendría que bloquear`)
    assert.match(d.motivo, /no declarado o inválido/)
  }
  // No pasar el parámetro es otra cosa: ahí manda el límite declarado del plan (10), que es el que
  // el dueño escribió en el timer. "No me dijeron" ≠ "me dijeron cualquier cosa".
  assert.equal(decidir({ usadas: 0, pedido: 2 }).ok, true)
})

// ── EL ARCHIVO ───────────────────────────────────────────────────────────────────────────────────

test('el contador persiste entre corridas y el presupuesto lo mira', async () => {
  const archivo = await tmp('uso.json')
  await registrarConsumo({ cantidad: 1, fecha: '2026-08-03', detalle: 'R', archivo })
  await registrarConsumo({ cantidad: 1, fecha: '2026-08-03', detalle: 'E', archivo })
  const p = await presupuesto({ pedido: 2, hoy: '2026-08-07', archivo, limite: 10, reserva: 2 })
  assert.equal(p.usadas, 2)
  assert.equal(p.ok, true)
  assert.equal(p.ventana, '2026-08')
  // Y una corrida que ya gastó todo el margen se niega la próxima vez.
  await registrarConsumo({ cantidad: 6, fecha: '2026-08-07', archivo })
  assert.equal((await presupuesto({ pedido: 2, hoy: '2026-08-07', archivo, limite: 10, reserva: 2 })).ok, false)
})

test('la primera corrida no explota, pero un registro ILEGIBLE sí', async () => {
  // ENOENT es legítimo (nunca se gastó nada). Un JSON roto NO: leerlo como "cero gastadas" sería
  // inventar saldo justo cuando no se sabe.
  const nuevo = await tmp('no-existe.json')
  assert.deepEqual(await leerUso(nuevo), { eventos: [] })
  const roto = await tmp('roto.json')
  await writeFile(roto, '{ esto no es json', 'utf8')
  await assert.rejects(() => leerUso(roto), /no puedo leer el registro de uso/)
})

test('la bitácora se poda: no crece para siempre', async () => {
  const archivo = await tmp('podado.json')
  await writeFile(archivo, JSON.stringify({ eventos: Array.from({ length: 500 }, () => ({ fecha: '2026-01-01', cantidad: 1 })) }), 'utf8')
  await registrarConsumo({ cantidad: 1, fecha: '2026-08-07', archivo })
  assert.equal(JSON.parse(await readFile(archivo, 'utf8')).eventos.length, 400)
})

// ── LA CREDENCIAL ────────────────────────────────────────────────────────────────────────────────
//
// EL DEFECTO QUE ESTOS TESTS CIERRAN (03–13/08): la sonda probaba `GET /api/v1/automations` con el
// ACCESS_TOKEN. Ese verbo sobre ese endpoint devuelve 401 SIEMPRE —con token sano o podrido— y el
// sync lo leyó como "la credencial no sirve" durante diez días. Medido el 13/08 con las credenciales
// reales: GET → 401, POST con cuerpo vacío → 400 de validación de campos. El token estaba perfecto.

test('LA SONDA USA LA MISMA CERRADURA QUE LA DESCARGA: POST, no GET, y con cuerpo que no crea nada', async () => {
  // Un GET acá es el bug entero. Y el cuerpo tiene que ser inválido a propósito: sin `automation`,
  // el servidor rechaza en validación y NO crea automatización, así que la sonda no gasta cuota.
  let visto = null
  await credencialAceptada({
    token: 'token-de-prueba',
    fetchImpl: async (url, opts) => { visto = { url, opts }; return respuesta(400, '{}') },
  })
  assert.equal(visto.opts.method, 'POST')
  assert.equal(visto.url, 'https://app.afipsdk.com/api/v1/automations')
  assert.deepEqual(JSON.parse(visto.opts.body), {}, 'el cuerpo no puede nombrar ninguna automatización')
  assert.equal(visto.opts.headers.Authorization, 'Bearer token-de-prueba')
})

test('400 de validación = LA CREDENCIAL SIRVE: pasó autenticación y murió en el cuerpo', async () => {
  // La respuesta real del 13/08 con el token bueno.
  const cuerpo = '{"statusCode":400,"data_errors":{"automation":"El campo Automatización es obligatorio"}}'
  const r = await credencialAceptada({ token: 'token-de-prueba', fetchImpl: async () => respuesta(400, cuerpo) })
  assert.equal(r.ok, true)
  assert.equal(r.verificada, true)
  assert.match(r.motivo, /PASÓ autenticación/)
  assert.match(r.motivo, /El campo Automatización es obligatorio/, 'tiene que citar lo que contestó el servidor')
})

test('401 BLOQUEA — y el mensaje dice qué se probó, contra qué endpoint y qué respondió', async () => {
  // El mensaje viejo decía "hay que renovar el ACCESS_TOKEN" ante CUALQUIER 401 y mandó al dueño tres
  // veces a renovar un token sano. Ahora el 401 llega por la misma llamada que hace la descarga, así
  // que sí prueba algo — y el texto tiene que mostrar la prueba, no la conclusión sola.
  const r = await credencialAceptada({
    token: 'token-de-prueba',
    fetchImpl: async () => respuesta(401, '{"message":"El token proporcionado es invalido."}'),
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 401)
  assert.equal(r.verificada, true)
  assert.match(r.motivo, /POST https:\/\/app\.afipsdk\.com\/api\/v1\/automations/, 'tiene que decir qué probó')
  assert.match(r.motivo, /token proporcionado es invalido/, 'tiene que decir qué respondió')
  assert.match(r.motivo, /misma llamada que hace la descarga real/, 'tiene que decir por qué este 401 sí prueba')
})

test('un 500 es NO SÉ, no ES MALA: no aborta y queda declarado como no verificado', async () => {
  const err500 = await credencialAceptada({ token: 'token-de-prueba', fetchImpl: async () => respuesta(500, 'Internal Server Error') })
  assert.equal(err500.ok, true, 'un 500 no puede abortar el sync como si fuera credencial inválida')
  assert.equal(err500.verificada, false, 'y tampoco puede pasar por credencial verificada')
  assert.match(err500.motivo, /NO SÉ/)

  const cae = await credencialAceptada({ token: 'token-de-prueba', fetchImpl: async () => { throw new Error('ETIMEDOUT') } })
  assert.equal(cae.ok, true)
  assert.equal(cae.verificada, false)
})

test('un 401 sigue bloqueando aunque el cuerpo no se pueda leer', async () => {
  // No poder leer el eco no cambia el status: la lectura sale del 401, no de la prosa.
  const r = await credencialAceptada({
    token: 'token-de-prueba',
    fetchImpl: async () => ({ status: 401, text: async () => { throw new Error('stream roto') } }),
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 401)
})

test('sin token no se sondea nada: se dice que falta', async () => {
  const r = await credencialAceptada({ token: null, fetchImpl: async () => { throw new Error('no debería llamarse') } })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /no hay ACCESS_TOKEN/)
})

test('la lectura de la sonda es pura y cubre los cuatro casos', () => {
  assert.deepEqual(
    [401, 400, 200, 503].map((s) => leerSonda({ status: s }).ok),
    [false, true, true, true],
  )
  assert.deepEqual(
    [401, 400, 200, 503].map((s) => leerSonda({ status: s }).verificada),
    [true, true, true, false],
  )
  // Un 2xx autentica pero rompe el contrato esperado: se sigue, y se avisa.
  assert.match(leerSonda({ status: 201 }).motivo, /el contrato cambió/)
})

// ── LOS DOS TOKENS SON DE PUERTAS DISTINTAS ──────────────────────────────────────────────────────

test('el archivo de credenciales da las TRES claves, y los comentarios no son claves', async () => {
  const archivo = await tmp('cred.txt')
  await writeFile(archivo, [
    '# ACCESS_TOKEN = token del PROYECTO (lo usan las automations).',
    'ACCESS_TOKEN=aaa',
    '# Token de CUENTA (dashboard) y refresh.',
    'ACCOUNT_TOKEN=bbb',
    'REFRESH_TOKEN=ccc',
    'PROJECT_ID=ddd',
    '',
  ].join('\n'), 'utf8')
  assert.deepEqual(await leerCredenciales(archivo), { accessToken: 'aaa', accountToken: 'bbb', projectId: 'ddd' })
  // Un archivo que no está no explota: devuelve las tres en null y quien llama decide.
  assert.deepEqual(await leerCredenciales(await tmp('no-existe.txt')), { accessToken: null, accountToken: null, projectId: null })
  // Una línea comentada NUNCA se toma como valor: el archivo real tiene un comentario que empieza
  // con "# ACCESS_TOKEN =" y leerlo como clave devolvería la descripción en vez del token.
  assert.equal(parsearCredenciales('# ACCESS_TOKEN = esto es prosa\n').accessToken, null)
})

// ── LA CUOTA REAL DEL PROVEEDOR ──────────────────────────────────────────────────────────────────

test('LA FORMA DE PRODUCCIÓN: array de MEMBRESÍAS con el proyecto anidado, y el id que manda es el de adentro', async () => {
  // El defecto que este test cierra: se comparaba el PROJECT_ID contra `entrada.id`, que es el id de la
  // MEMBRESÍA. Los dos son UUID de 36 caracteres, así que no matcheaba nunca y el sync se caía al
  // contador local informando "¿varios proyectos y sin PROJECT_ID?" — con un solo proyecto.
  let visto = null
  const p = await presupuesto({
    pedido: 2,
    accountToken: 'account-de-prueba',
    projectId: 'proyecto-de-prueba',
    fetchImpl: async (url, opts) => { visto = { url, opts }; return respuesta(200, MEMBRESIAS) },
    archivo: await tmp('no-se-usa.json'),
  })
  assert.equal(p.fuente, 'proveedor', 'con la forma real NO puede caer al contador local')
  assert.equal(p.ok, true)
  assert.equal(p.usadas, 0)
  assert.equal(p.disponible, 8, '10 del proveedor − 2 de reserva − 0 usadas')
  assert.equal(p.ventana, '2026-08-10→2026-09-10', 'el período del proveedor va del 10 al 10, NO es el mes calendario')
  assert.match(p.motivo, /cuota REAL de AfipSDK/)
  assert.match(p.motivo, /suscripción active/)
  assert.match(p.motivo, /plan free/)
  assert.doesNotMatch(p.motivo, /token-de-prueba/, 'el proyecto trae access_token: no puede salir en ningún mensaje')
  // Y se le pregunta al PANEL con el ACCOUNT_TOKEN, no a automations con el ACCESS_TOKEN.
  assert.equal(visto.url, 'https://app.afipsdk.com/api/v1/projects')
  assert.equal(visto.opts.method, 'GET')
  assert.equal(visto.opts.headers.Authorization, 'Bearer account-de-prueba')
})

test('el id de la MEMBRESÍA nunca puede hacerse pasar por el del proyecto', () => {
  // Si alguien vuelve a comparar contra `entrada.id`, esto se pone rojo.
  assert.equal(proyectoDeRespuesta(MEMBRESIAS, { projectId: 'proyecto-de-prueba' })?.id, 'proyecto-de-prueba')
  const conOtro = [MEMBRESIAS[0], { id: 'otra-membresia', role: 'owner', project: { ...PROYECTO, id: 'otro-proyecto' } }]
  assert.equal(proyectoDeRespuesta(conOtro, { projectId: 'membresia-de-prueba-no-es-el-proyecto' }), null,
    'buscar por el id de la membresía no puede devolver un proyecto')
  assert.equal(proyectoDeRespuesta(conOtro, { projectId: 'otro-proyecto' })?.name, PROYECTO.name)
})

test('con la cuota del proveedor agotada NO se descarga, aunque el contador local diga que sobra', async () => {
  // Es el caso que el contador local no puede ver: cuota gastada desde la web de AfipSDK u otra máquina.
  const agotado = [{ ...MEMBRESIAS[0], project: { ...PROYECTO, current_period_automation_usage: 9 } }]
  const p = await presupuesto({
    pedido: 2,
    accountToken: 'account-de-prueba',
    projectId: 'proyecto-de-prueba',
    fetchImpl: async () => respuesta(200, agotado),
    archivo: await tmp('local-vacio.json'),
  })
  assert.equal(p.fuente, 'proveedor')
  assert.equal(p.ok, false)
  assert.match(p.motivo, /necesito 2 automatización\(es\) y quedan 0/)
})

test('un PROJECT_ID viejo con un solo proyecto NO tira la corrida abajo, pero avisa', async () => {
  // El único proyecto de la cuenta es el que factura: su cuota manda igual. Lo que no se puede es
  // callarlo, porque casi siempre significa que la credencial guardada quedó vieja.
  const r = await cuotaDelProveedor({
    accountToken: 'account-de-prueba',
    projectId: 'un-project-id-viejo',
    fetchImpl: async () => respuesta(200, MEMBRESIAS),
  })
  assert.equal(r.ok, true)
  assert.equal(r.limite, 10)
  assert.match(r.motivo, /el PROJECT_ID guardado no coincide/)
})

test('si el panel no contesta se CAE al contador local Y SE DECLARA que es aproximado', async () => {
  const archivo = await tmp('uso-local.json')
  await registrarConsumo({ cantidad: 1, fecha: '2026-08-11', archivo })
  const p = await presupuesto({
    pedido: 2,
    hoy: '2026-08-13',
    accountToken: 'account-de-prueba',
    fetchImpl: async () => respuesta(503, 'Service Unavailable'),
    archivo,
    limite: 10,
    reserva: 2,
  })
  assert.equal(p.fuente, 'local')
  assert.equal(p.usadas, 1)
  assert.equal(p.ok, true)
  assert.match(p.motivo, /CONTADOR LOCAL APROXIMADO/, 'una estimación no se puede presentar como el dato real')
  assert.match(p.motivo, /el panel respondió 503/, 'tiene que decir por qué cayó al plan B')
})

test('un ACCOUNT_TOKEN rechazado se distingue del ACCESS_TOKEN: son credenciales distintas', async () => {
  const r = await cuotaDelProveedor({ accountToken: 'account-de-prueba', fetchImpl: async () => respuesta(401, '') })
  assert.equal(r.ok, false)
  assert.match(r.motivo, /ACCOUNT_TOKEN/)
  assert.doesNotMatch(r.motivo, /ACCESS_TOKEN/, 'confundir las dos credenciales es el bug original')
  // Sin ACCOUNT_TOKEN no se inventa una consulta.
  assert.equal((await cuotaDelProveedor({ accountToken: null })).ok, false)
})

test('la respuesta del panel se lee tolerante a la forma, pero NO se adivina el proyecto', () => {
  // La forma real es MEMBRESIAS. Las otras no las devuelve hoy el panel, pero tolerarlas no cuesta y
  // el contrato no está documentado en ningún lado: docs.afipsdk.com no tiene una página del panel.
  const formas = [MEMBRESIAS, { data: MEMBRESIAS }, [PROYECTO], { data: [PROYECTO] }, { projects: [PROYECTO] }, PROYECTO, { data: PROYECTO }]
  for (const json of formas) {
    assert.equal(proyectoDeRespuesta(json)?.id, PROYECTO.id, `forma no soportada: ${JSON.stringify(json).slice(0, 40)}`)
  }
  // Con varios proyectos y sin PROJECT_ID no se elige uno: adivinar el proyecto es adivinar la cuota.
  const otro = { ...PROYECTO, id: 'otro', automation_limit: 999 }
  assert.equal(proyectoDeRespuesta([PROYECTO, otro]), null)
  assert.equal(proyectoDeRespuesta([PROYECTO, otro], { projectId: 'otro' }).automation_limit, 999)
  // Y un proyecto sin las cifras no se completa con defaults.
  assert.equal(cuotaDeProyecto({ automation_limit: 10 }), null)
  assert.equal(cuotaDeProyecto({ automation_limit: 10, current_period_automation_usage: 'muchas' }), null)
  assert.equal(cuotaDeProyecto(PROYECTO).limite, 10)
  // El período sale del nombre LARGO, que es el real. Sin él, etiqueta genérica en vez de fecha falsa.
  assert.equal(cuotaDeProyecto(PROYECTO).ventana, '2026-08-10→2026-09-10')
  assert.equal(cuotaDeProyecto({ automation_limit: 10, current_period_automation_usage: 0 }).ventana, 'período del proveedor')
})
