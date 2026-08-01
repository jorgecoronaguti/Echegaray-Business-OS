// LA BARRERA TRANSACCIONAL — los tests que la rompen a propósito.
//
// Si alguno de estos se pone rojo, el agente puede hacer clic en "Comprar". No hay bug más grave en
// todo este subsistema, y por eso los casos están escritos como ataques, no como ejemplos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluarElemento, evaluarNavegacion, contieneVerboProhibido, normalizar, registroBloqueo,
  esNavegacionInformativa, rutaExacta,
} from './balanz-denylist.mjs'

const DIR = dirname(fileURLToPath(import.meta.url))

test('bloquea los verbos del pedido, en cualquier capitalización y con acento', () => {
  for (const t of ['Comprar', 'COMPRÁ', 'vender', 'Suscribir', 'Rescatar', 'Transferir',
    'Confirmar', 'Aceptar', 'Operar', 'Enviar orden', 'Invertir', 'Renovar', 'Licitar',
    'Firmar', 'Autorizar', 'Continuar operación', 'Confirmar operación']) {
    const v = evaluarElemento({ texto: t })
    assert.equal(v.permitido, false, `"${t}" no fue bloqueado`)
  }
})

test('bloquea por aria-label aunque el texto visible sea inocente', () => {
  // El ataque real: un botón con una flecha y la intención escondida en el atributo.
  const v = evaluarElemento({ texto: '→', ariaLabel: 'Confirmar compra de FCI' })
  assert.equal(v.permitido, false)
  assert.equal(v.campo, 'ariaLabel')
})

test('bloquea por href aunque el texto diga "Ver más"', () => {
  const v = evaluarElemento({ texto: 'Ver más', href: '/mercado/comprar?especie=AL30' })
  assert.equal(v.permitido, false)
  assert.match(v.motivo, /ruta transaccional/)
})

test('bloquea por el texto del elemento PADRE: un "Continuar" dentro de un modal de compra', () => {
  const v = evaluarElemento({ texto: 'Continuar', textoPadre: 'Confirmá tu suscripción al fondo' })
  assert.equal(v.permitido, false)
})

test('bloquea todo formulario y todo submit', () => {
  assert.equal(evaluarElemento({ tag: 'FORM', texto: 'buscar' }).permitido, false)
  assert.equal(evaluarElemento({ rol: 'button', tipo: 'submit', texto: 'Siguiente' }).permitido, false)
})

test('FALLA CERRADA: un elemento sin nada evaluable no se toca', () => {
  const v = evaluarElemento({})
  assert.equal(v.permitido, false)
  assert.match(v.motivo, /ante la duda no se toca/)
})

test('permite lo genuinamente informativo', () => {
  for (const el of [
    { texto: 'Rendimientos históricos', href: '/fondos/detalle/123' },
    { texto: 'Ver prospecto', href: '/documentos/prospecto.pdf' },
    { texto: 'Cotizaciones', href: '/mercado/cotizacion' },
  ]) {
    assert.equal(evaluarElemento(el).permitido, true, `"${el.texto}" fue bloqueado de más`)
  }
})

test('la raíz se ancla al COMIENZO de la palabra, no en cualquier posición', () => {
  // Sin el ancla, `compr` bloquearía "descompresión" y el agente no podría navegar nada.
  assert.equal(contieneVerboProhibido('Descompresión de datos'), null)
  assert.equal(contieneVerboProhibido('Comprar ahora'), 'compr')
  assert.equal(contieneVerboProhibido('Comprá ahora'), 'compr')
})

test('la navegación directa a una URL transaccional se bloquea', () => {
  assert.equal(evaluarNavegacion('https://clientes.balanz.com/operar/fci').permitido, false)
  assert.equal(evaluarNavegacion('https://clientes.balanz.com/fondos').permitido, true)
  assert.equal(evaluarNavegacion('').permitido, false)
})

test('el registro de bloqueo NO guarda la pantalla, sólo lo mínimo para auditar', () => {
  const el = { tag: 'BUTTON', rol: 'button', texto: 'Comprar', href: '/comprar', ariaLabel: 'Comprar 5.000.000' }
  const r = registroBloqueo(el, evaluarElemento(el))
  assert.equal(r.elemento.href, undefined, 'no debe guardar el destino')
  assert.equal(r.elemento.ariaLabel, undefined, 'no debe guardar el aria-label con montos')
  assert.ok(r.elemento.texto.length <= 80)
  assert.ok(r.motivo)
})

test('normalizar saca tildes y colapsa espacios', () => {
  assert.equal(normalizar('  SUSCRIPCIÓN   Ahora '), 'suscripcion ahora')
})

// ── EL CONTROL SOBRE EL CONTROL ────────────────────────────────────────────────
// Que la barrera funcione no sirve si el navegador la puentea. Este test lee el archivo del
// navegador y verifica que no exista un camino de clic que no pase por acá.

test('NINGÚN archivo tiene un clic o un goto que saltee la barrera', () => {
  // El test miraba sólo `balanz-navegador.mjs`, y el explorador tiene su propio `goto`: el invariante
  // no estaba cubierto donde podía romperse. Ahora se revisan TODOS los archivos que manejan la
  // página, y cada `goto` tiene que estar acompañado de su `evaluarNavegacion` en el mismo archivo.
  const archivos = [
    join(DIR, 'balanz-navegador.mjs'),
    join(DIR, '..', '..', 'scripts', 'balanz-explorar.mjs'),
  ]
  let clics = 0
  for (const f of archivos) {
    const src = readFileSync(f, 'utf8')
    clics += [...src.matchAll(/\.(click|tap|fill|press|selectOption|check)\(/g)].length
    const gotos = [...src.matchAll(/\.goto\(/g)].length
    if (gotos > 0) {
      assert.match(src, /evaluarNavegacion|navegarSeguro/, `${f} navega sin consultar la barrera`)
    }
  }
  assert.equal(clics, 1, 'sólo puede existir UN clic en todo el subsistema: el de clicSeguro')
  const nav = readFileSync(join(DIR, 'balanz-navegador.mjs'), 'utf8')
  assert.match(nav, /evaluarElemento/, 'el navegador no llama a la barrera')
  assert.match(nav, /evaluarNavegacion/, 'el navegador no evalúa las navegaciones')
})

test('el navegador NO extrae cookies, tokens ni contraseñas', () => {
  const src = readFileSync(join(DIR, 'balanz-navegador.mjs'), 'utf8')
  for (const prohibido of ['cookies()', 'storageState', 'localStorage', 'sessionStorage', 'password:']) {
    assert.equal(src.includes(prohibido), false, `el navegador usa ${prohibido}`)
  }
})

// ════════════════════════════════════════════════════════════════════════════
// CAUCIONES — leer la pantalla sin habilitar la operación
// ════════════════════════════════════════════════════════════════════════════

test('la ruta informativa de cauciones se permite, por coincidencia EXACTA', () => {
  assert.equal(evaluarNavegacion('https://clientes.balanz.com/mercado/cauciones').permitido, true)
  assert.equal(evaluarNavegacion('/mercado/cauciones').permitido, true)
  assert.equal(evaluarNavegacion('/mercado/cauciones/').permitido, true, 'la barra final no cambia la ruta')
  assert.equal(esNavegacionInformativa('/mercado/cauciones'), true)
})

test('NINGUNA variante operativa entra por la allowlist', () => {
  for (const u of [
    '/mercado/caucionar',
    '/mercado/cauciones/operar',
    '/mercado/cauciones/nueva',
    '/mercado/cauciones-operar',
    '/mercado/caucionesx',
    '/operar/cauciones',
  ]) {
    assert.equal(evaluarNavegacion(u).permitido, false, `${u} entró por la allowlist`)
    assert.equal(esNavegacionInformativa(u), false, `${u} matcheó la allowlist`)
  }
})

test('la allowlist es de la RUTA, no del query: ?accion=caucionar sigue bloqueado', () => {
  const v = evaluarNavegacion('/mercado/cauciones?accion=caucionar&monto=5000000')
  assert.equal(v.permitido, false)
  assert.equal(v.campo, 'query')
})

test('dentro de la pantalla informativa, el botón "Caucionar" sigue bloqueado', () => {
  // La excepción vale para NAVEGAR. `evaluarElemento` no consulta la allowlist nunca.
  assert.equal(evaluarElemento({ texto: 'Caucionar', href: '/mercado/cauciones' }).permitido, false)
  assert.equal(evaluarElemento({ texto: 'Tomar caución', ariaLabel: 'Caucionar 5.000.000' }).permitido, false)
  assert.equal(evaluarElemento({ tag: 'FORM', action: '/mercado/cauciones' }).permitido, false, 'un formulario es una orden en potencia')
  assert.equal(evaluarElemento({ rol: 'button', tipo: 'submit', texto: 'Confirmar plazo' }).permitido, false)
})

test('el modal de confirmación de una caución está bloqueado por su contexto', () => {
  const v = evaluarElemento({ texto: 'Aceptar', tituloModal: 'Confirmá tu caución a 7 días' })
  assert.equal(v.permitido, false)
})

test('a cauciones se ENTRA navegando, no clickeando — y eso es deliberado', () => {
  // Un link cuyo href contiene "caucion" queda bloqueado a nivel ELEMENTO, incluso apuntando a una
  // ruta de la allowlist. No es un descuido: hacer clic es la operación riesgosa, y exceptuar
  // elementos por su href abriría la puerta a un botón "Caucionar" con href informativo.
  assert.equal(evaluarElemento({ texto: 'Ver tasas', href: '/mercado/cauciones/tasas' }).permitido, false)
  // El camino habilitado es la navegación directa por URL, que sí consulta la allowlist.
  assert.equal(evaluarNavegacion('/mercado/cauciones/tasas').permitido, true)
})

test('rutaExacta normaliza y no se deja engañar por el host ni la barra final', () => {
  assert.equal(rutaExacta('https://clientes.balanz.com/mercado/cauciones/'), '/mercado/cauciones')
  assert.equal(rutaExacta('/mercado/cauciones?x=1#y'), '/mercado/cauciones')
  assert.equal(rutaExacta(''), null)
})

// ════════════════════════════════════════════════════════════════════════════
// DOMINIO — no se lee ni se toca nada fuera de Balanz
// ════════════════════════════════════════════════════════════════════════════

test('el dominio se compara por SUFIJO DE HOST, no por includes', async () => {
  const { esDominioBalanz, dominioDe } = await import('./balanz-navegador.mjs')
  for (const ok of [
    'https://clientes.balanz.com/fondos',
    'https://balanz.com',
    'https://www.balanz.com.ar/mercado',
  ]) assert.equal(esDominioBalanz(ok), true, `${ok} debería pasar`)

  // Los tres que un `includes('balanz.com')` habría dejado entrar.
  for (const no of [
    'https://balanz.com.evil.io/fondos',
    'https://notbalanz.com/fondos',
    'https://evil.io/?r=balanz.com',
    'https://balanz.com.ar.phish.net/',
    'no-es-una-url',
    '',
  ]) assert.equal(esDominioBalanz(no), false, `${no} NO debería pasar`)

  assert.equal(dominioDe('https://clientes.balanz.com/x'), 'clientes.balanz.com')
  assert.equal(dominioDe('/mercado/cauciones'), 'clientes.balanz.com', 'una ruta propia es del propio sitio')
  // Un string suelto NO es una URL relativa: resolvía a clientes.balanz.com y pasaba como si fuera
  // de Balanz. Lo que no es ni ruta ni URL absoluta no tiene host.
  assert.equal(dominioDe('roto'), null)
  assert.equal(dominioDe('no-es-una-url'), null)
  assert.equal(dominioDe(''), null)
  assert.equal(esDominioBalanz('no-es-una-url'), false)
})

// ════════════════════════════════════════════════════════════════════════════
// HALLAZGOS DE LA AUDITORÍA — el voseo, el host y las URLs de los elementos
// ════════════════════════════════════════════════════════════════════════════

test('las CTA en VOSEO caen: es como escribe un bróker argentino', () => {
  // La auditoría lo ejecutó sobre HEAD: nueve CTA transaccionales pasaban. `Comprá` caía sólo por
  // casualidad, porque el sustantivo "compra" estaba en la lista. El repo ya había aprendido esto en
  // el ruteo del chat —el voseo rompe los verbos, hay que usar RAÍCES— y no se había traído acá.
  for (const t of [
    'Comprá', 'Vendé', 'Suscribí', 'Suscribite', 'Invertí', 'Operá', 'Confirmá', 'Rescatá',
    'Caucioná', 'Aceptá', 'Adherí', 'Licitá', 'Renová', 'Transferí', 'Firmá', 'Autorizá',
    'Aplicá tus fondos', 'Constituí tu plazo fijo', 'Sí, quiero', 'Estoy de acuerdo',
    'COMPRÁ AHORA', 'vendé todo', 'Adquirí', 'Liquidá',
  ]) {
    assert.equal(evaluarElemento({ texto: t, href: '#' }).permitido, false, `"${t}" pasó la barrera`)
  }
})

test('la raíz se ancla al comienzo de la palabra: no bloquea de más', () => {
  for (const el of [
    { texto: 'Ver ficha', href: '/fondos/detalle/1' },
    { texto: 'Rendimientos históricos', href: '/fondos/123' },
    { texto: 'Descargar prospecto', href: '/documentos/prospecto.pdf' },
    { texto: 'Cotizaciones', href: '/mercado/cotizacion' },
    { texto: 'Descompresión de datos', href: '/x' },
  ]) assert.equal(evaluarElemento(el).permitido, true, `"${el.texto}" se bloqueó de más`)
})

test('el chequeo de raíces corre también sobre el href del ELEMENTO, no sólo al navegar', () => {
  // Asimetría que encontró la auditoría: `/plazo-fijo/constituir` pasaba por clic y caía por
  // navegación. El clic es el lado peligroso.
  for (const href of ['/plazo-fijo/constituir', '/inversiones/nueva', '/fci/aplicar', '/cuenta/liquidar']) {
    assert.equal(evaluarElemento({ texto: 'Continuar', href }).permitido, false, `${href} pasó por clic`)
  }
})

test('fuera del dominio de Balanz NO se navega — ni a una ruta de la allowlist', async () => {
  // La guarda estaba en `verificarSesion`, que corre DESPUÉS del `page.goto`: la pestaña autenticada
  // del dueño ya había navegado al host ajeno cuando saltaba el error.
  for (const u of [
    'https://evil.example.com/mercado/cauciones',
    'https://clientes.balanz.com.evil.io/mercado/cauciones',
    '//evil.com/mercado/cauciones',
    'https://notbalanz.com/fondos',
  ]) {
    const v = evaluarNavegacion(u)
    assert.equal(v.permitido, false, `${u} entró`)
    assert.equal(v.campo, 'host')
  }
  assert.equal(evaluarNavegacion('https://clientes.balanz.com/mercado/cauciones').permitido, true)
  assert.equal(evaluarNavegacion('/mercado/cauciones').permitido, true, 'una ruta relativa es del propio sitio')
})

test('las excepciones informativas no abren la puerta: cada una es una PALABRA, no un comodín', () => {
  // El precio de las raíces: `pag` atrapa "página", `liquid` atrapa "liquidez". La segunda auditoría
  // midió 12 de 46 etiquetas informativas bloqueadas, incluidas "Tasas de caución", que es justo lo
  // que este agente viene a leer. Las excepciones se nombran de a una y no aflojan la raíz.
  for (const t of [
    'Página siguiente', 'Pág. 2', 'Ordenar por rendimiento', 'Liquidez', 'Liquidez inmediata',
    'Ventajas', 'Mis operaciones', 'Historial de operaciones', 'Extracto de cuenta',
    'Tasas de caución', 'Ingresos brutos', 'Cobranzas', 'Comparar fondos',
  ]) assert.equal(evaluarElemento({ texto: t, href: '/fondos' }).permitido, true, `"${t}" se bloqueó de más`)

  // Y las formas transaccionales de las MISMAS raíces siguen cayendo.
  for (const t of ['Pagá ahora', 'Pagar', 'Liquidá', 'Vendé', 'Ordená la compra', 'Caucioná', 'Depositá', 'Retirá']) {
    assert.equal(evaluarElemento({ texto: t, href: '#' }).permitido, false, `"${t}" pasó`)
  }
})

test('paginar y ordenar una tabla no es operar: el query de presentación no bloquea', () => {
  for (const u of ['/fondos?pagina=2', '/fondos/renta-fija?page=2', '/mercado/letras?orden=tir',
    '/fondos/liquidez', 'https://clientes.balanz.com/fondos?orden=tna&limit=50']) {
    assert.equal(evaluarNavegacion(u).permitido, true, `${u} se bloqueó de más`)
  }
  // Pero un query que SÍ acciona sigue cayendo, y la ruta se evalúa entera.
  assert.equal(evaluarNavegacion('/mercado/cauciones?accion=caucionar').permitido, false)
  assert.equal(evaluarNavegacion('/fondos/suscribir?pagina=2').permitido, false)
})
