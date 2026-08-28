// LOS PERMISOS DE LA PUERTA. El defecto que atrapan: que un rol herede lo que no le toca.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  permisosDeRol, actorDeMattermost, PERMISOS_POR_ROL,
  TOOLS_AUTORIZADAS_A_ESCRIBIR, escribeAfuera, autorizadaAEscribir,
} from './xsas-permisos.mjs'

test('un rol desconocido NO hereda los permisos del vecino: se queda sin ninguno', () => {
  assert.deepEqual(permisosDeRol('gerente-de-nada'), [])
  assert.deepEqual(permisosDeRol(null), [])
  assert.deepEqual(permisosDeRol(''), [])
})

test('campo no lee por el chat lo que la web le cierra', () => {
  assert.deepEqual(permisosDeRol('campo'), [])
})

// El 27/08/2026 el dueño autorizó `drive.write`. Este test decía «nadie escribe» y era correcto
// hasta ese día; lo que protegía —que la escritura no se cuele por descuido de configuración— sigue
// protegido, pero por la regla nueva: escribe UN rol, y sólo por tools nombradas.
test('la escritura la tiene UN solo rol, y no es un rol operativo', () => {
  const conEscritura = Object.entries(PERMISOS_POR_ROL)
    .filter(([, caps]) => caps.some((c) => escribeAfuera(c)))
    .map(([rol]) => rol)
  assert.deepEqual(conEscritura, ['direccion'])
  for (const rol of ['administracion', 'jefe_obra', 'campo']) {
    assert.equal(permisosDeRol(rol).some(escribeAfuera), false, `${rol} no puede escribir afuera`)
  }
})

test('una capability de escritura sólo vale para una tool NOMBRADA — fail-closed', () => {
  assert.equal(autorizadaAEscribir('slides.crear'), true)
  assert.equal(autorizadaAEscribir('imagen.generar'), true)
  assert.equal(autorizadaAEscribir('una.tool.nueva'), false)
  assert.equal(autorizadaAEscribir(null), false)
  assert.equal(autorizadaAEscribir(undefined), false)
})

test('la lista de tools que escriben es corta y explícita: crecer es una decisión, no un accidente', () => {
  // `plano.cotizar` entró el 27/08/2026: declaraba `drive.read` y hace INSERT en `public.cotizaciones`,
  // `cotizacion_partida` y `public.computo`. La capability describía de dónde LEE en vez de qué DEJA,
  // y por eso ni las cerraduras ni la firma se enteraban. Este test es el lugar donde ese cambio
  // queda dicho: la lista no crece sola.
  // `tesoreria.analisis_inversion` entró el 27/08/2026 al cierre: no escribe una fila, abre el
  // navegador contra Balanz con la sesión de la empresa. Manda el efecto, no la letra.
  assert.deepEqual([...TOOLS_AUTORIZADAS_A_ESCRIBIR],
    ['slides.crear', 'imagen.generar', 'cotizacion.registrar', 'plano.cotizar', 'tesoreria.analisis_inversion'])
})

test('lo que NO escribe afuera no queda marcado como escritura', () => {
  assert.equal(escribeAfuera('drive.read'), false)
  assert.equal(escribeAfuera('os.read'), false)
  assert.equal(escribeAfuera('tasks.read'), false)
  assert.equal(escribeAfuera(null), false)
})

// ═══ LA REGLA REEMPLAZÓ A LA LISTA (27/08/2026, auditoría) ═══
//
// `CAPACIDADES_DE_ESCRITURA` era una lista blanca de una sola entrada y el agujero apareció en el
// primer intento: `cotizacion.registrar` declaraba `drive.read` y hacía un INSERT. Una lista tiene
// el mismo defecto que cualquier defensa por enumeración — alcanza hasta que aparece la que nadie
// enumeró. Ahora es el SUFIJO, que cubre también las que todavía no existen.
test('cualquier capability que termine en un verbo de escritura cuenta como escritura', () => {
  for (const c of ['drive.write', 'os.write', 'tasks.write', 'appsheet.write', 'calendar.write',
    'drive.delete', 'calendar.delete', 'mail.send', 'mail.modify', 'mail.trash', 'mail.draft']) {
    assert.equal(escribeAfuera(c), true, `${c} escribe y no está siendo tratada como tal`)
  }
})

test('una capability inventada que escriba queda cerrada sola', () => {
  assert.equal(escribeAfuera('loquesea.write'), true)
  assert.equal(autorizadaAEscribir('tool.inventada'), false)
})

test('la lista devuelta es una copia: mutarla no le agrega permisos a un rol', () => {
  const p = permisosDeRol('jefe_obra')
  p.push('drive.write')
  assert.equal(permisosDeRol('jefe_obra').includes('drive.write'), false)
})

test('sin identidad registrada en Mattermost no hay permisos, y el actor igual existe', async () => {
  const a = await actorDeMattermost({ query: async () => ({ rows: [] }) }, { userId: 'u-x', username: 'nadie' })
  assert.deepEqual(a.permisos, [])
  assert.equal(a.rol, 'desconocido')
  assert.equal(a.id, 'mm:u-x')
})

test('SI LA BASE NO CONTESTA, NO SE DAN PERMISOS DE MÁS', async () => {
  const a = await actorDeMattermost({ query: async () => { throw new Error('base caída') } }, { userId: 'u-jorge' })
  assert.deepEqual(a.permisos, [])
})

test('con perfil, los permisos salen del rol de `perfiles`', async () => {
  const port = { query: async () => ({ rows: [{ rol: 'jefe_obra', nombre: 'Rodrigo' }] }) }
  const a = await actorDeMattermost(port, { userId: 'u-rodrigo' })
  assert.equal(a.rol, 'jefe_obra')
  assert.deepEqual(a.permisos, ['drive.read', 'os.read'])
  assert.equal(a.nombre, 'Rodrigo')
})

// ═══ EL CONTROL QUE LA REGLA DEL SUFIJO NO PUEDE HACER ═══
//
// Ninguna regla sobre el NOMBRE de la capability puede detectar una tool que escribe declarando una
// capability de lectura — que es exactamente el agujero que encontró la auditoría del 27/08. Lo
// único que lo detecta es una lista de las tools que se sabe que escriben, contrastada contra el
// registro REAL. Si mañana alguien le pone `drive.read` a una de éstas, este test se pone rojo.
//
// Agregar una tool acá cuando se descubre que escribe es la mitad del trabajo; la otra mitad es
// darle una capability de escritura, y este test no deja hacer sólo la primera.
const ESCRIBEN_DE_VERDAD = [
  'cotizacion.registrar',   // INSERT en public.cotizaciones
  'imagen.generar',         // sube el archivo al Drive de la empresa
  'slides.crear',           // crea la presentación en el Drive
]

test('TODA tool que escribe declara una capability de escritura, contra el registro real', async () => {
  const { toolsDelNucleo } = await import('./xsas-resolutores.mjs')
  const { mapa } = await toolsDelNucleo({ google: {}, refrescar: true })
  const mal = []
  for (const clave of ESCRIBEN_DE_VERDAD) {
    const t = mapa.get(clave)
    if (!t) continue // no está registrada en esta combinación; otro test cubre el registro
    if (!escribeAfuera(t.capability)) mal.push(`${clave} declara «${t.capability}» y escribe`)
  }
  assert.deepEqual(mal, [], mal.join(' · '))
})

test('ninguna tool con capability de escritura queda alcanzable sin estar autorizada', async () => {
  const { toolsDelNucleo } = await import('./xsas-resolutores.mjs')
  const { mapa } = await toolsDelNucleo({ google: {}, refrescar: true })
  const alcanzables = []
  for (const [clave, t] of mapa) {
    if (!escribeAfuera(t.capability)) continue
    // ¿algún rol tiene esa capability? Si nadie la tiene, la tool está cerrada por el otro lado.
    const algunRol = Object.values(PERMISOS_POR_ROL).some((caps) => caps.includes(t.capability))
    if (algunRol && !autorizadaAEscribir(clave)) alcanzables.push(`${clave} (${t.capability})`)
  }
  assert.deepEqual(alcanzables, [], `escriben, algún rol las alcanza, y no están en la lista: ${alcanzables.join(' · ')}`)
})
