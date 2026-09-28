import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clavesDeOrdenDeUsuarios } from './nombre.ts'
import { plantelActivo, type LineaDelCuadro } from '../../features/administracion/services/retribucionDelPlantel.ts'
import { pagoDeNomina } from '../../features/analiticas/services/nominaPagada.ts'
import { pagoDeLaLinea } from '../../features/administracion/services/pagoDeLaQuincena.ts'
import { quincenaDe } from '../../features/administracion/services/quincena.ts'
import { armarParque } from '../../features/herramientas/logica/parque.ts'
import { personasDelLibro } from '../../features/herramientas/logica/movimientos.ts'
import { mov } from '../../features/herramientas/logica/fixture.test-util.ts'

// CADA LISTA QUE ORDENA PERSONAS, UN TEST (dueño, 28/09/2026: «se ha roto el orden por apellido del
// personal en toda la app»). El bug no estaba en `compararPorApellido`: estaba en cada lista que
// ordenaba por el nombre PARA MOSTRAR («Emiliano Maldonado», nombre de pila primero). Por eso se
// prueba lista por lista. Cuando se puede, con la función real; cuando la lista vive en un servicio
// que habla con Supabase o en una acción de servidor, leyendo la fuente: no es elegante, pero se pone
// roja si alguien vuelve a escribir `a.nombre.localeCompare(...)`.
//
// El fixture distingue los dos órdenes: por legajo es Aballay, Corona, Maldonado; por lo que se
// muestra sería Diego, Emiliano, Jorge (Aballay, Maldonado, Corona).

const LEGAJO = { m: 'MALDONADO BATISTA EMILIANO MIGUEL', a: 'ABALLAY DIEGO', c: 'CORONA GUTIERREZ JORGE' } as const
const MOSTRAR = { m: 'Emiliano Maldonado', a: 'Diego Aballay', c: 'Jorge Corona' } as const
const POR_APELLIDO = ['Diego Aballay', 'Jorge Corona', 'Emiliano Maldonado']
const clave = (id: keyof typeof LEGAJO) => LEGAJO[id].toLocaleLowerCase('es-AR')

const fuente = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

test('usuarios (entrar como, responsables, herramientas): la clave sale del legajo por persona_id', () => {
  const filas = [
    { id: 'u-m', nombre: MOSTRAR.m, persona_id: 'p-m' },
    { id: 'u-a', nombre: MOSTRAR.a, persona_id: 'p-a' },
    { id: 'u-c', nombre: MOSTRAR.c, persona_id: 'p-c' },
    { id: 'u-sin', nombre: 'Bruno Contador', persona_id: null },
  ]
  const legajos = new Map([['p-m', LEGAJO.m], ['p-a', LEGAJO.a], ['p-c', LEGAJO.c]])
  const claves = clavesDeOrdenDeUsuarios(filas, legajos)
  const orden = [...claves].sort(([, x], [, y]) => x.localeCompare(y, 'es')).map(([id]) => id)
  // «bruno contador» (sin persona: se ordena por su nombre de cuenta) cae entre Aballay y Corona.
  assert.deepEqual(orden, ['u-a', 'u-sin', 'u-c', 'u-m'])
  // Persona que la sesión no ve por RLS: sin legajo, el nombre para mostrar, nunca una fila sin clave.
  assert.equal(clavesDeOrdenDeUsuarios([{ id: 'u', nombre: 'Ana Pérez', persona_id: 'oculta' }], new Map()).get('u'), 'ana perez')
})

test('Personal › retribución del plantel (plantelActivo): por legajo, no por lo que se muestra', () => {
  const linea = (id: keyof typeof LEGAJO): LineaDelCuadro => ({
    personaId: id, nombre: MOSTRAR[id], nombreOrden: clave(id), modalidad: 'hora', horas: 80, valorHora: 6000,
    netoMensual: null, cobra: null, sinTarifa: false, sinNeto: false, sueldo: null, sinDesglose: false,
    pago: pagoDeLaLinea({ banco: 1, negro: 1 }),
  })
  const plantel = plantelActivo([{
    quincena: quincenaDe('2026-09-01'),
    cuadros: [{ grupo: 'obreros', lineas: [linea('m'), linea('a'), linea('c')] }],
    estados: {},
  }])
  assert.deepEqual(plantel.map((p) => p.nombre), POR_APELLIDO)
})

test('Analíticas › nómina pagada: a igual importe, desempata el apellido', () => {
  const ids = ['m', 'a', 'c'] as const
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [{ id: 'q', desde: '2026-04-01', estado: 'cerrada' }],
    lineas: ids.map((id) => ({ liquidacion_id: 'q', persona_id: id, cobra: '100000' })),
    recibos: [],
    personas: ids.map((id) => ({ id, nombre_completo: LEGAJO[id], nombre_para_mostrar: MOSTRAR[id] })),
  })
  assert.deepEqual((r.porPersona.get('2026-04') ?? []).map((p) => p.nombre), POR_APELLIDO)
})

const movDe = (id: string, usuario_id: string) =>
  mov({ id, activo_id: 'x', destino_id: 't', fecha_hora: '2026-09-21T10:00:00-03:00', usuario_id })

test('Herramientas › movimientos: el filtro de personas va por apellido', () => {
  const p = armarParque({
    activos: [], ubicaciones: [], obras: [], incidencias: [],
    movimientos: [
      movDe('1', 'u-m'), movDe('2', 'u-a'), movDe('3', 'u-c'), movDe('4', 'u-a'),
    ],
    nombres: { 'u-m': MOSTRAR.m, 'u-a': MOSTRAR.a, 'u-c': MOSTRAR.c },
    ordenUsuarios: { 'u-m': clave('m'), 'u-a': clave('a'), 'u-c': clave('c') },
  })
  assert.deepEqual(personasDelLibro(p), [
    { v: 'u:u-a', t: MOSTRAR.a }, { v: 'u:u-c', t: MOSTRAR.c }, { v: 'u:u-m', t: MOSTRAR.m },
  ])
})

// ═══ Las que viven en servicios con Supabase o en acciones de servidor: se lee la fuente. ═══

const ORDENA_POR_LO_MOSTRADO = /\(?\b[ab]\.nombre\b(\s*\?\?[^)]*)?\)?\.localeCompare\(/

test('Dirección › entrar como: ordena por ordenDeUsuarios, no por el nombre de la cuenta', () => {
  const s = fuente('../../features/auth/services/entrarComo.ts')
  assert.doesNotMatch(s, ORDENA_POR_LO_MOSTRADO)
  assert.match(s, /ordenDeUsuarios\(admin\)/)
  assert.match(s, /const clave = \(c: CuentaEntrable\) => porApellido\.get\(c\.id\)/)
  assert.match(s, /\.sort\(\(a, b\) => clave\(a\)\.localeCompare\(clave\(b\), 'es'\)\)/)
})

test('Clientes › responsables: ordena por ordenDeUsuarios, no por el nombre para mostrar', () => {
  const s = fuente('../../features/clientes/services/clientesService.ts')
  const cuerpo = s.slice(s.indexOf('export async function getResponsables'), s.indexOf('export async function getDocumentosCliente'))
  assert.ok(cuerpo.length > 0, 'getResponsables no está donde se la busca')
  assert.doesNotMatch(cuerpo, ORDENA_POR_LO_MOSTRADO)
  assert.match(cuerpo, /ordenDeUsuarios\(supabase\)/)
  assert.match(cuerpo, /responsables\.sort\(\(a, b\) => clave\(a\)\.localeCompare\(clave\(b\), 'es'\)\)/)
})

test('Administración › usuarios: ordena por el legajo de la persona vinculada', () => {
  const s = fuente('../../features/usuarios/services/usuariosService.ts')
  assert.doesNotMatch(s, ORDENA_POR_LO_MOSTRADO)
  assert.match(s, /ordenPersona = new Map\([^\n]*claveDeOrden\(/)
  assert.match(s, /return claveDeUsuario\(a\)\.localeCompare\(claveDeUsuario\(b\), 'es'\)/)
})

test('Obra › parte guardado: la cuadrilla se ordena por claveDeOrden del legajo', () => {
  const s = fuente('../../features/obras/services/parteGuardadoActions.ts')
  assert.doesNotMatch(s, /\.sort\(\(a, b\) => a\.nombre\.localeCompare\(/)
  assert.match(s, /claves\.set\(p\.id, claveDeOrden\(p\)\)/)
  assert.match(s, /\.sort\(\(a, b\) => \(claves\.get\(a\.persona_id\)/)
})

test('Herramientas › movimientos (página): usa personasDelLibro, no un sort propio por el nombre', () => {
  const s = fuente('../../app/(main)/herramientas/movimientos/page.tsx')
  assert.match(s, /personas = personasDelLibro\(p\)/)
  assert.doesNotMatch(s, /personas = [^\n]*\.sort\(/)
})

test('Herramientas › datos: el parque lleva la clave de orden de los usuarios', () => {
  const s = fuente('../../features/herramientas/services/datos.ts')
  assert.match(s, /ordenDeUsuariosPlano\(supabase\)/)
  assert.match(s, /\n\s+ordenUsuarios,\n/)
  // Y cruza al cliente: `Marco` re-arma el parque del lado del navegador con `datosPlanos`.
  assert.match(fuente('../../features/herramientas/components/Marco.tsx'), /ordenUsuarios: p\.ordenUsuarios/)
})
