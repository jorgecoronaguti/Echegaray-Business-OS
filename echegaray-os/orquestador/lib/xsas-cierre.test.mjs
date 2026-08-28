// LOS CUATRO ESCENARIOS QUE EL DUEÑO PIDIÓ PROBAR ANTES DE CERRAR XSAS (27/08/2026).
//
// No prueban metadata: prueban COMPORTAMIENTO. Que una tool declare `os.write` no dice qué pasa
// cuando un jefe de obra la pide; que exista un briefing determinístico no dice que la pregunta lo
// alcance. Cada bloque de acá abajo nació de un defecto medido contra el gateway vivo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { atender } from './xsas-gateway.mjs'
import { toolsDelNucleo, toolsDeSkill, ordenarPorAfinidad } from './xsas-resolutores.mjs'
import { leerCatalogoDeDisco } from './skill-catalogo.mjs'
import { permisosDeRol, escribeAfuera, autorizadaAEscribir } from './xsas-permisos.mjs'
import { tacharComercial, veComercial, filtrarPorVisibilidad } from './xsas-visibilidad.mjs'

const actor = (rol) => ({ id: `${rol}@ecsas.com.ar`, nombre: rol, rol, permisos: permisosDeRol(rol) })
const pedir = (mensaje, rol, deps) => atender({ canal: 'app', tipo: 'mensaje', mensaje, actor: actor(rol) }, deps)

// Un registro de mentira con UNA tool que dice ser de lectura y escribe. Es el defecto original.
function registroDeMentira({ corridas }) {
  const mapa = new Map([
    ['plano.cotizar', {
      capability: 'os.write',
      schema: {
        name: 'analizar_planos_y_cotizar',
        description: 'Lee los planos de un proyecto y arma la cotización borrador con su cascada de precio.',
        input_schema: { type: 'object', properties: { proyecto: { type: 'string' } }, required: ['proyecto'] },
      },
      async run(a) {
        corridas.push(a)
        return {
          resumen_texto: 'GALPÓN — costo directo $ 30.000.000 · venta sin IVA $ 43.052.628 · 1.200 HH',
          costo_directo: 30000000, venta_sin_iva: 43052628, hh_previstas: 1200,
          elementos: [{ nombre: 'correa', cantidad: 46, unidad: 'u', precio_unitario: 82000 }],
        }
      },
    }],
  ])
  const porArchivo = new Map([['orquestador/lib/tools/plano.mjs', ['plano.cotizar']]])
  return {
    registro: { mapa, porArchivo, porLib: new Map() },
    catalogo: [{ clave: 'costos-presupuestacion', modulos: ['orquestador/lib/tools/plano.mjs'] }],
    // El ruteo y la extracción del argumento no son lo que se prueba acá: se fijan para que el
    // único grado de libertad del test sea el ROL.
    elegir: () => ({ resolucion: 'determinista', skills: ['costos-presupuestacion'], capacidades: ['advise.estimating'], confianza: 'alta', motivo: 'fijado por el test' }),
    ia: {
      pedirTextoONull: async () => '{"proyecto":"Quattropani"}',
      pedirTexto: async () => ({ texto: 'el modelo no debería contestar esto', proveedor: 'x', modelo: 'y', tokens: {}, usd: 0, intentos: 1, ms: 1 }),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A · `plano.cotizar` — autorización, efectos y CAMPOS DEVUELTOS, por los tres roles
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('A · plano.cotizar escribe, así que su capability escribe y está autorizada por nombre', async () => {
  const { mapa } = await toolsDelNucleo({ google: { readSheetValues: async () => [] } })
  const tool = mapa.get('plano.cotizar')
  assert.ok(tool, 'plano.cotizar tiene que estar en el registro')
  assert.equal(tool.capability, 'os.write', 'INSERTA en cotizaciones/cotizacion_partida/computo: no es lectura')
  assert.ok(escribeAfuera(tool.capability), 'la regla del sufijo tiene que verla como escritura')
  assert.ok(autorizadaAEscribir('plano.cotizar'), 'la segunda cerradura tiene que nombrarla')
})

test('A · un jefe de obra NO la corre, y la tool ni se toca', async () => {
  const corridas = []
  const { registro, catalogo, elegir, ia } = registroDeMentira({ corridas })
  const r = await pedir('analizá los planos de Quattropani', 'jefe_obra', { registro, catalogo, elegir, ia })
  assert.deepEqual(corridas, [], 'el cuerpo de la tool NO puede ejecutarse')
  assert.deepEqual(r.acciones.ejecutadas, [], 'no puede figurar como ejecutada')
})

test('A · administración tampoco: escribir la biblioteca comercial es de dirección', async () => {
  const corridas = []
  const { registro, catalogo, elegir, ia } = registroDeMentira({ corridas })
  await pedir('analizá los planos de Quattropani', 'administracion', { registro, catalogo, elegir, ia })
  assert.deepEqual(corridas, [], 'administración no tiene os.write')
})

test('A · dirección sí la corre y recibe la cascada comercial entera', async () => {
  const corridas = []
  const { registro, catalogo, elegir, ia } = registroDeMentira({ corridas })
  const r = await pedir('analizá los planos de Quattropani', 'direccion', { registro, catalogo, elegir, ia })
  assert.equal(corridas.length, 1, 'dirección tiene os.write y comercial.read')
  assert.equal(r.datos.venta_sin_iva, 43052628, 'a dirección no se le tacha nada')
  assert.match(r.respuesta, /43\.052\.628/)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A-bis · PUEDE CALCULAR NO ES PUEDE VER — el tachado es del backend
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('A-bis · el jefe de obra ve el cómputo y NO ve la plata', () => {
  const datos = {
    hh_previstas: 1200,
    costo_directo: 30000000,
    venta_sin_iva: 43052628,
    elementos: [{ nombre: 'correa', cantidad: 46, unidad: 'u', precio_unitario: 82000 }],
  }
  const { datos: tachado, campos } = tacharComercial(datos)
  assert.equal(tachado.hh_previstas, 1200, 'las HH son suyas')
  assert.equal(tachado.elementos[0].cantidad, 46, 'la cantidad es suya')
  assert.equal(tachado.elementos[0].unidad, 'u')
  assert.equal(tachado.elementos[0].nombre, 'correa')
  assert.equal(tachado.costo_directo, '[restringido]')
  assert.equal(tachado.venta_sin_iva, '[restringido]')
  assert.equal(tachado.elementos[0].precio_unitario, '[restringido]')
  assert.ok(campos.includes('venta_sin_iva') && campos.includes('elementos[0].precio_unitario'),
    'las rutas tachadas se declaran, no se borran en silencio')
})

test('A-bis · el importe escrito dentro del texto también se tacha', async () => {
  const corridas = []
  const { registro, catalogo, elegir, ia } = registroDeMentira({ corridas })
  // Se le da os.write a mano para separar las dos preguntas: acá se prueba la VISIBILIDAD, no la
  // autorización. Un rol que pudiera correrla y no pudiera ver plata tiene que recibirla tachada.
  const bruto = { canal: 'app', tipo: 'mensaje', mensaje: 'analizá los planos de Quattropani',
    actor: { id: 'x', rol: 'jefe_obra', permisos: ['drive.read', 'os.read', 'os.write'] } }
  const r = await atender(bruto, { registro, catalogo, elegir, ia })
  assert.equal(corridas.length, 1, 'con os.write la corre')
  assert.ok(!/43\.052\.628/.test(r.respuesta ?? ''), 'el importe NO puede quedar en el texto')
  assert.equal(r.datos.venta_sin_iva, '[restringido]')
  assert.equal(r.datos.hh_previstas, 1200)
  assert.equal(r.estado, 'degradado', 'una respuesta recortada se declara')
  assert.match(r.degradacion, /comercial tachada/)
})

test('A-bis · quién ve plata sale de los permisos, no de una lista aparte', () => {
  assert.ok(veComercial({ rol: 'direccion', permisos: permisosDeRol('direccion') }))
  assert.ok(veComercial({ rol: 'administracion', permisos: permisosDeRol('administracion') }))
  assert.ok(!veComercial({ rol: 'jefe_obra', permisos: permisosDeRol('jefe_obra') }))
  assert.ok(!veComercial({ rol: 'campo', permisos: permisosDeRol('campo') }))
  assert.ok(!veComercial(null), 'sin actor no se ve nada')
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// B · LA CAJA LLEGA A LA CAPACIDAD DETERMINÍSTICA, DICHA DE MUCHAS MANERAS
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('B · las formulaciones reales de la pregunta de caja eligen el briefing determinístico', async () => {
  const catalogo = await leerCatalogoDeDisco({}).catch(() => [])
  const ficha = catalogo.find((f) => f.clave === 'finanzas-tesoreria-construccion')
  assert.ok(ficha, 'la skill de finanzas tiene que estar en el catálogo')
  const { mapa, porArchivo, porLib } = await toolsDelNucleo({ google: { readSheetValues: async () => [] } })
  const claves = toolsDeSkill(ficha, porArchivo, porLib)
  assert.ok(claves.includes('briefing.caja'),
    'la skill cita `lib/cash-briefing.mjs`; el vínculo con su tool tiene que derivarse solo')

  for (const frase of [
    '¿cuánta plata hay en caja hoy?', 'cuanto hay en caja', 'caja hoy', 'liquidez hoy',
    'cómo estamos de caja', 'saldo disponible', 'qué tenemos para pagar',
  ]) {
    const ganadora = ordenarPorAfinidad(frase, claves, (c) => mapa.get(c))[0]
    assert.equal(ganadora, 'briefing.caja', `«${frase}» tiene que ir al briefing y fue a ${ganadora}`)
  }
})

test('B · y las de vencimientos y panorama NO se la llevan puesta', async () => {
  const catalogo = await leerCatalogoDeDisco({}).catch(() => [])
  const { mapa, porArchivo, porLib } = await toolsDelNucleo({ google: { readSheetValues: async () => [] } })
  const claves = toolsDeSkill(catalogo.find((f) => f.clave === 'finanzas-tesoreria-construccion'), porArchivo, porLib)
  assert.equal(ordenarPorAfinidad('qué tengo vencido', claves, (c) => mapa.get(c))[0], 'caja.vencido')
  assert.equal(ordenarPorAfinidad('qué quedó sin conciliar', claves, (c) => mapa.get(c))[0], 'caja.vencido')
})

test('B · el orden no depende del orden: dos corridas dan lo mismo', async () => {
  const catalogo = await leerCatalogoDeDisco({}).catch(() => [])
  const { mapa, porArchivo, porLib } = await toolsDelNucleo({ google: { readSheetValues: async () => [] } })
  const claves = toolsDeSkill(catalogo.find((f) => f.clave === 'finanzas-tesoreria-construccion'), porArchivo, porLib)
  const a = ordenarPorAfinidad('¿cuánta plata hay en caja hoy?', claves, (c) => mapa.get(c))
  const b = ordenarPorAfinidad('¿cuánta plata hay en caja hoy?', [...claves].reverse(), (c) => mapa.get(c))
  assert.equal(a[0], b[0], 'barajar el catálogo no puede cambiar la capacidad elegida')
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// C · EL RAZONADOR EXTERNO CAÍDO NO TUMBA LO DETERMINÍSTICO
// ─────────────────────────────────────────────────────────────────────────────────────────────

const IA_CAIDA = {
  async pedirTexto() {
    const e = new Error('sin proveedor de razonamiento')
    e.clasificacion = { kind: 'sin_credencial' }
    throw e
  },
}

test('C · con el razonador caído, la capacidad determinística contesta igual', async () => {
  const corridas = []
  const mapa = new Map([['briefing.caja', {
    capability: 'drive.read',
    schema: { name: 'briefing_caja', description: 'Saldo de caja hoy, cobranzas del mes y vencimientos.', input_schema: { type: 'object', properties: {} } },
    async run() { corridas.push(1); return { texto: 'CAJA HOY: $ 12.345.678' } },
  }]])
  const registro = { mapa, porArchivo: new Map([['orquestador/lib/tools/briefing.mjs', ['briefing.caja']]]), porLib: new Map() }
  const catalogo = [{ clave: 'finanzas-tesoreria-construccion', modulos: ['orquestador/lib/tools/briefing.mjs'] }]
  const r = await pedir('¿cuánta plata hay en caja hoy?', 'direccion', { registro, catalogo, ia: IA_CAIDA })
  assert.equal(corridas.length, 1, 'el motor tiene que correr sin tocar el modelo')
  assert.equal(r.capacidades.via, 'skill_con_motor')
  assert.match(r.respuesta, /12\.345\.678/)
})

test('C · y lo que SÍ necesitaba el razonador se degrada declarándolo, no rompe', async () => {
  const registro = { mapa: new Map(), porArchivo: new Map(), porLib: new Map() }
  const r = await pedir('explicame la estrategia de la empresa para el año que viene', 'direccion', { registro, catalogo: [], ia: IA_CAIDA })
  assert.equal(r.ok, true, 'no puede tirar un 500')
  assert.equal(r.estado, 'degradado')
  assert.match(r.degradacion, /sin razonador/)
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// D · LA FUENTE INTERNA CAÍDA SE DECLARA — Y EL MODELO NO INVENTA EL SALDO
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('D · si la fuente de caja falla, la respuesta lo dice y NO pasa por el modelo', async () => {
  let leModelo = 0
  const mapa = new Map([['briefing.caja', {
    capability: 'drive.read',
    schema: { name: 'briefing_caja', description: 'Saldo de caja hoy, cobranzas del mes y vencimientos.', input_schema: { type: 'object', properties: {} } },
    // Así fallan las tools del OS: devuelven `{error}`, no lanzan.
    async run() { return { error: 'no pude leer la pestaña Caja del Cash Flow' } },
  }]])
  const registro = { mapa, porArchivo: new Map([['orquestador/lib/tools/briefing.mjs', ['briefing.caja']]]), porLib: new Map() }
  const catalogo = [{ clave: 'finanzas-tesoreria-construccion', modulos: ['orquestador/lib/tools/briefing.mjs'] }]
  const ia = { async pedirTexto() { leModelo += 1; return { texto: 'la caja está en $ 80.000.000', proveedor: 'x', modelo: 'y', tokens: {}, usd: 0, intentos: 1, ms: 1 } } }

  const r = await pedir('¿cuánta plata hay en caja hoy?', 'direccion', { registro, catalogo, ia })
  assert.equal(leModelo, 0, 'una fuente caída NO se tapa mandándole la pregunta al modelo')
  assert.equal(r.estado, 'degradado', 'no puede volver como una respuesta normal')
  assert.match(r.degradacion, /briefing\.caja.*no pudo obtener su dato/)
  assert.match(r.degradacion, /pestaña Caja/, 'tiene que decir QUÉ fuente falló')
  assert.ok(!/80\.000\.000/.test(r.respuesta ?? ''), 'ningún saldo inventado')
})

test('D · caer al modelo con el dominio reconocido es una degradación, no una respuesta', async () => {
  const ia = { async pedirTexto() { return { texto: 'No tengo ese dato cargado.', proveedor: 'x', modelo: 'y', tokens: {}, usd: 0, intentos: 1, ms: 1 } } }
  const registro = { mapa: new Map(), porArchivo: new Map(), porLib: new Map() }
  const catalogo = await leerCatalogoDeDisco({}).catch(() => [])
  const r = await pedir('¿cuánta plata hay en caja hoy?', 'direccion', { registro, catalogo, ia })
  assert.equal(r.capacidades.via, 'modelo')
  assert.equal(r.estado, 'degradado', 'el ruteo reconoció finanzas con confianza alta y no corrió nada')
  assert.match(r.degradacion, /sin dato del OS/)
})

test('A · y al jefe de obra se le dice que NO PUEDE, en vez de improvisar una excusa', async () => {
  const corridas = []
  const { registro, catalogo, elegir, ia } = registroDeMentira({ corridas })
  const r = await pedir('analizá los planos de Quattropani', 'jefe_obra', { registro, catalogo, elegir, ia })
  assert.deepEqual(corridas, [])
  assert.equal(r.capacidades.via, 'sin_permiso', 'no puede contestar el modelo una decisión de autorización')
  assert.equal(r.estado, 'degradado')
  assert.match(r.respuesta, /jefe_obra/)
  assert.match(r.respuesta, /plano\.cotizar/)
  assert.match(r.degradacion, /sin permiso/)
})

test('A-bis · una tool sin texto propio sigue devolviendo null, no una respuesta en blanco', () => {
  const { respuesta } = filtrarPorVisibilidad({
    actor: actor('jefe_obra'), datos: { costo: 1 }, respuesta: null,
  })
  assert.equal(respuesta, null, 'null es «no trae texto»; «» parecería una respuesta vacía')
})

// ─────────────────────────────────────────────────────────────────────────────────────────────
// E · EL CONTEXTO QUE NOMBRA UNA ENTIDAD NO SE CREE SIN FIRMA (auditoría independiente, 27/08)
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('E · sin firma, `contexto.obra` NO viaja: nombrar una obra es nombrar una entidad', async () => {
  const { normalizarPedido } = await import('./xsas-pedido.mjs')
  const p = normalizarPedido({
    canal: 'app', mensaje: '¿cuánto va costando?', actor: actor('jefe_obra'),
    contexto: { obra: 'Quattropani', pantalla: 'obras/detalle' },
  })
  assert.equal(p.contexto.obra, undefined, 'sin `verificado_por` no puede elegir la obra')
  assert.equal(p.contexto.pantalla, 'obras/detalle', 'lo que describe la pantalla sí pasa')
  assert.deepEqual([...p.contextoDescartado], ['obra'], 'y se declara lo que se tiró')
})

test('E · con firma del servidor, el contexto verificado sí viaja', async () => {
  const { normalizarPedido } = await import('./xsas-pedido.mjs')
  const p = normalizarPedido({
    canal: 'app', mensaje: '¿cuánto va costando?', actor: actor('direccion'),
    contexto: { obra: 'Quattropani' }, entidad: { obra_id: 'abc' }, verificado_por: 'app-server',
  })
  assert.equal(p.contexto.obra, 'Quattropani')
  assert.deepEqual([...p.contextoDescartado], [])
})

test('E · el atajo por nombre tampoco alcanza una obra sin firma', async () => {
  const corridas = []
  const mapa = new Map([['obra.cuadro_economico', {
    capability: 'os.read',
    schema: { name: 'cuadro_economico', description: 'Costo y margen de una obra.', input_schema: { type: 'object', properties: { obra: { type: 'string' } }, required: ['obra'] } },
    async run(a) { corridas.push(a); return { resumen_texto: 'costo $ 74.758.214' } },
  }]])
  const registro = { mapa, porArchivo: new Map([['orquestador/lib/tools/obra.mjs', ['obra.cuadro_economico']]]), porLib: new Map() }
  const catalogo = [{ clave: 'costos-presupuestacion', modulos: ['orquestador/lib/tools/obra.mjs'] }]
  const elegir = () => ({ resolucion: 'determinista', skills: ['costos-presupuestacion'], capacidades: [], confianza: 'alta', motivo: 'fijado' })
  const ia = { pedirTextoONull: async () => '{"obra":null}', pedirTexto: async () => ({ texto: 'no', proveedor: 'x', modelo: 'y', tokens: {}, usd: 0, intentos: 1, ms: 1 }) }
  const r = await atender({
    canal: 'app', tipo: 'mensaje', mensaje: '¿cuánto va costando?', actor: actor('jefe_obra'),
    contexto: { obra: 'Quattropani' },
  }, { registro, catalogo, elegir, ia })
  assert.deepEqual(corridas, [], 'sin firma no hay obra con la que correr')
  assert.ok(!/74\.758\.214/.test(r.respuesta ?? ''))
})
