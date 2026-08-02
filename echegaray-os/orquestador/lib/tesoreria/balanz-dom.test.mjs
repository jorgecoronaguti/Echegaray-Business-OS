// LA BARRERA Y EL EXTRACTOR CONTRA UN DOM DE VERDAD — Chromium real, no strings.
//
// ═══ QUÉ PRUEBA ESTO, Y QUÉ NO ═══
//
// SÍ prueba: que `clicSeguro`, `navegarSeguro`, `auditarControles` y el extractor funcionan sobre un
// navegador real, con lazy loading, paginación, modales, formularios y atributos ARIA — o sea, sobre
// las cosas que un DOM tiene y un string no.
//
// NO prueba: que el DOM de Balanz sea así. La página de abajo la escribí yo imitando un bróker
// argentino; sin la sesión del dueño no hay pantalla real que mirar. Es la diferencia entre "el
// mecanismo funciona" y "los selectores aciertan", y sólo lo primero se puede afirmar hoy. La segunda
// mitad se cierra con `orquestador/scripts/balanz-explorar.mjs` cuando haya sesión.
//
// Se saltea si Chromium no está instalado.

import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarElemento } from './balanz-denylist.mjs'
import { clicSeguro, navegarSeguro, auditarControles, verificarSesion, marcasDeLogin } from './balanz-navegador.mjs'
import { extraerDeTabla, mapearColumnas } from './instrumentos.mjs'

// NO ALCANZA CON QUE PLAYWRIGHT IMPORTE: en este servidor el binario de Chromium existe y no arranca
// sin sus librerías de sistema (van en `LD_LIBRARY_PATH=/home/jorge/.local/lib/pw-libs`, instaladas
// sin root). Chequear sólo el import dejaba la suite entera ROJA para cualquiera que no las tuviera —
// y un test de entorno que se disfraza de test de producto es la peor clase de falso rojo.
let chromium = null
let motivoSalteo = null
try { ({ chromium } = await import('playwright')) } catch { motivoSalteo = 'playwright no está instalado' }
if (chromium) {
  try { const b = await chromium.launch(); await b.close() } catch (e) {
    motivoSalteo = `Chromium no arranca (${String(e?.message ?? e).split('\n')[0].slice(0, 80)}). Probá con LD_LIBRARY_PATH=/home/jorge/.local/lib/pw-libs`
    chromium = null
  }
}
const salta = !chromium
const opts = { skip: salta ? motivoSalteo : false }

/** Una pantalla informativa de bróker, con todas las trampas que importan. */
const PAGINA = `
<h1>Fondos Comunes de Inversión</h1>
<nav role="tablist">
  <button role="tab">Pesos</button><button role="tab">Dólares</button>
</nav>
<table aria-label="Listado de fondos">
  <thead><tr>
    <th>Fondo</th><th>Moneda</th><th>TNA</th><th>Liquidez</th><th>Valor cuotaparte</th><th></th>
  </tr></thead>
  <tbody>
    <tr>
      <td>Balanz Money Market</td><td>ARS</td><td>58,20%</td><td>T+0</td><td>1.234,56</td>
      <td><a href="/fondos/detalle/1">Ver ficha</a>
          <button aria-label="Suscribir Balanz Money Market">→</button></td>
    </tr>
    <tr>
      <td>Balanz Renta Fija</td><td>ARS</td><td>71,40%</td><td>T+1</td><td>2.981,10</td>
      <td><a href="/fondos/detalle/2">Ver ficha</a>
          <button class="btn-primary">Invertir</button></td>
    </tr>
    <tr>
      <td>Balanz Ahorro USD</td><td>U$S</td><td>4,10%</td><td>T+1</td><td>1,0521</td>
      <td><a href="/fondos/detalle/3">Ver ficha</a></td>
    </tr>
  </tbody>
</table>
<div id="lazy"></div>
<nav aria-label="Paginación"><button>1</button><button>2</button></nav>
<form action="/fondos/suscribir" id="alta">
  <input name="monto" /><button type="submit">Continuar</button>
</form>
<div role="dialog" id="modal" style="display:none">
  <p>Confirmá tu suscripción al fondo</p><button>Siguiente</button>
</div>
<a href="/documentos/prospecto.pdf">Descargar prospecto</a>
<script>
  // LAZY LOADING: dos filas más aparecen recién cuando se baja hasta el final.
  let cargado = false
  addEventListener('scroll', () => {
    if (cargado || (innerHeight + scrollY) < document.body.offsetHeight - 5) return
    cargado = true
    const tb = document.querySelector('tbody')
    tb.insertAdjacentHTML('beforeend',
      '<tr><td>Balanz Performance</td><td>ARS</td><td>84,00%</td><td>T+2</td><td>512,30</td><td></td></tr>' +
      '<tr><td>Balanz Capital</td><td>ARS</td><td>66,10%</td><td>T+1</td><td>905,44</td><td></td></tr>')
  })
  document.getElementById('lazy').style.height = '2000px'
</script>`

async function conPagina(fn) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(`<!doctype html><meta charset="utf-8">${PAGINA}`)
  try { return await fn(page) } finally { await browser.close() }
}

/** Se pasa como FUNCIÓN, no como string: un string con cuerpo de bloque devolvía undefined. */
function leerTabla() {
  const t = document.querySelector('table')
  return {
    cabecera: [...t.querySelectorAll('th')].map((h) => h.innerText.trim()),
    filas: [...t.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.innerText.trim())),
  }
}

test('un submit sin role="button" también cae — y todo lo que vive dentro del form', opts, async () => {
  // Defecto real encontrado con el DOM de verdad: la regla exigía `role="button"` y un
  // `<button type="submit">` normal no lo declara. El botón "Continuar" del formulario de
  // suscripción quedaba PERMITIDO. En un bróker, ese botón es la orden.
  const { extraerAtributos } = await import('./balanz-navegador.mjs')
  const el = await conPagina((page) => page.locator('#alta button[type=submit]').evaluate(extraerAtributos))
  const v = evaluarElemento(el)
  assert.equal(v.permitido, false)
  assert.equal(v.coincidencia, 'submit')
  const input = await conPagina((page) => page.locator('#alta input').evaluate(extraerAtributos))
  assert.equal(input.dentroDeFormulario, true)
  assert.equal(evaluarElemento(input).permitido, false, 'un input dentro del form tampoco se toca')
})

test('la barrera clasifica los controles de una pantalla real', opts, async () => {
  const r = await conPagina((page) => auditarControles(page))
  assert.ok(r.total >= 8, `se esperaban varios controles, hubo ${r.total}`)
  const motivos = r.bloqueados.map((b) => b.motivo).join(' | ')
  // Los cuatro peligros de la pantalla tienen que estar bloqueados.
  assert.match(motivos, /suscrib/i, 'el botón con aria-label "Suscribir" tiene que caer')
  assert.match(motivos, /invert/i, 'el botón "Invertir" tiene que caer')
  assert.match(motivos, /formulario|submit/i, 'el formulario y su submit tienen que caer')
  assert.ok(r.permitidos >= 3, 'los links a fichas y al prospecto tienen que quedar permitidos')
})

test('clicSeguro NO hace clic en "Invertir" — y el DOM lo demuestra', opts, async () => {
  const clicado = await conPagina(async (page) => {
    await page.evaluate('window.__clics = 0; document.querySelectorAll("button").forEach(b => b.addEventListener("click", () => window.__clics++))')
    const bloqueos = []
    const r = await clicSeguro(page, 'button.btn-primary', bloqueos)
    return { r, bloqueos, clics: await page.evaluate('window.__clics') }
  })
  assert.equal(clicado.r.clicado, false)
  assert.equal(clicado.r.bloqueado, true)
  assert.equal(clicado.clics, 0, 'el DOM registró un clic: la barrera no lo frenó')
  assert.equal(clicado.bloqueos.length, 1)
})

test('clicSeguro SÍ hace clic en un link informativo', opts, async () => {
  const r = await conPagina(async (page) => {
    await page.evaluate('window.__ok = 0; document.querySelector("a[href*=prospecto]").addEventListener("click", (e) => { e.preventDefault(); window.__ok++ })')
    const res = await clicSeguro(page, 'a[href*=prospecto]', [])
    return { res, ok: await page.evaluate('window.__ok') }
  })
  assert.equal(r.res.clicado, true)
  assert.equal(r.ok, 1)
})

test('el modal de confirmación queda bloqueado por su contenido, no por su clase', opts, async () => {
  const v = await conPagina(async (page) => {
    await page.evaluate('document.getElementById("modal").style.display = "block"')
    const { extraerAtributos } = await import('./balanz-navegador.mjs')
    const el = await page.locator('#modal button').evaluate(extraerAtributos)
    return evaluarElemento(el)
  })
  // El botón dice "Siguiente" — inofensivo por sí solo. Lo que lo delata es el modal que lo contiene.
  assert.equal(v.permitido, false)
  assert.match(v.motivo, /suscrib|confirm/i, `motivo real: ${v.motivo}`)
  assert.ok(['textoPadre', 'tituloModal'].includes(v.campo), `lo delata el contenedor, no el botón — cayó por ${v.campo}`)
})

test('el CONTENEDOR no es la página entera: un link inofensivo no se bloquea por otro botón lejano', opts, async () => {
  // Defecto real encontrado con el DOM de verdad: `parentElement.innerText` de un elemento de primer
  // nivel es TODA la página. El link al prospecto caía porque en algún lado de la pantalla decía
  // "Invertir". Un agente que bloquea todo no es prudente, es inútil.
  const { extraerAtributos } = await import('./balanz-navegador.mjs')
  const el = await conPagina((page) => page.locator('a[href*=prospecto]').evaluate(extraerAtributos))
  assert.equal(el.textoPadre, '', 'el body no puede viajar como "texto del padre"')
  assert.equal(evaluarElemento(el).permitido, true)
})

test('el extractor lee la tabla por ENCABEZADO y tipifica la tasa como TNA', opts, async () => {
  const tabla = await conPagina((page) => page.evaluate(leerTabla))
  const { idx, faltan } = mapearColumnas(tabla.cabecera)
  assert.equal(idx.nombre, 0)
  assert.equal(idx.tna, 2)
  assert.ok(faltan.includes('tea'), 'lo que no está se declara faltante')

  const { instrumentos } = extraerDeTabla(tabla, { observadoEn: new Date().toISOString() })
  assert.equal(instrumentos.length, 3)
  const mm = instrumentos[0]
  assert.equal(mm.nombre, 'Balanz Money Market')
  assert.equal(mm.categoria, 'money_market')
  assert.equal(mm.tasa.tipo, 'tna', 'la columna dice TNA: la tasa es una TNA, no una TEA')
  assert.ok(Math.abs(mm.tasa.valor - 0.582) < 1e-9)
  assert.equal(mm.plazo_rescate_dias, 0)
  assert.equal(mm.precio, 1234.56, 'el precio en formato es-AR')
  assert.equal(instrumentos[2].moneda, 'USD', 'U$S se reconoce como dólares')
})

test('las filas que carga el lazy loading también se extraen', opts, async () => {
  const tabla = await conPagina(async (page) => {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
    await page.waitForTimeout(300)
    return page.evaluate(leerTabla)
  })
  const { instrumentos } = extraerDeTabla(tabla, {})
  assert.equal(instrumentos.length, 5, 'sin bajar la página se perdían dos fondos')
  assert.ok(instrumentos.some((i) => i.nombre === 'Balanz Performance'))
})

test('un cambio de orden de columnas NO rompe la extracción', opts, async () => {
  // Es el motivo de leer por encabezado: el bróker reordena y el extractor sigue acertando.
  const reordenada = {
    cabecera: ['Moneda', 'Fondo', 'Liquidez', 'TNA'],
    filas: [['ARS', 'Balanz Money Market', 'T+0', '58,20%']],
  }
  const { instrumentos } = extraerDeTabla(reordenada, {})
  assert.equal(instrumentos[0].nombre, 'Balanz Money Market')
  assert.ok(Math.abs(instrumentos[0].tasa.valor - 0.582) < 1e-9)
})

test('una columna genérica de "Rendimiento" entra como HISTÓRICA y queda fuera del ranking', opts, () => {
  const { instrumentos } = extraerDeTabla({
    cabecera: ['Fondo', 'Rendimiento'], filas: [['Balanz Money Market', '3,10%']],
  }, {})
  assert.equal(instrumentos[0].tasa.tipo, 'rendimiento_historico')
  assert.equal(instrumentos[0].tasa.naturaleza, 'historica')
})

test('verificarSesion detecta el login por lo que se VE, sin tocar cookies', opts, async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    // `setContent` deja la URL en about:blank: host vacío, que NO es "otro dominio" sino "todavía no
    // hay página". El chequeo de sesión sigue corriendo igual.
    await page.setContent('<form><input type="password" /></form>')
    await assert.rejects(() => verificarSesion(page), /SESSION_REQUIRED/)
    await page.setContent(PAGINA)
    assert.equal(await verificarSesion(page), true)
  } finally { await browser.close() }
})

test('una pantalla de OTRO dominio no se lee ni se toca', opts, async () => {
  // El Chrome dedicado puede tener otras pestañas, y una redirección puede llevar a un tercero. Leer
  // y clasificar controles de una pantalla que no es Balanz no sólo es inútil: si esa pantalla fuera
  // hostil, estaría dictando lo que el agente cree ver.
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>otra cosa</h1>' }))
    await page.goto('https://example.com/fondos')
    await assert.rejects(() => verificarSesion(page), /no en Balanz/)
  } finally { await browser.close() }
})

test('navegarSeguro no navega a una ruta transaccional ni con el navegador abierto', opts, async () => {
  const r = await conPagina(async (page) => {
    const bloqueos = []
    const res = await navegarSeguro(page, 'https://clientes.balanz.com/fondos/suscribir', bloqueos)
    return { res, bloqueos, url: page.url() }
  })
  assert.equal(r.res.navegado, false)
  assert.equal(r.bloqueos.length, 1)
  assert.ok(!r.url.includes('balanz.com'), 'la página no se movió')
})

test('el mapeo de estructura devuelve datos — un string habría devuelto undefined', opts, async () => {
  // Verificado contra Chromium: `page.evaluate('() => { ... }')` Y `page.evaluate('() => ({...})')`
  // devuelven AMBOS `undefined`. Sólo una función real funciona. El explorador —el script con el que
  // se valida el extractor contra Balanz— usaba strings: habría mapeado cero tablas y cero controles
  // sin fallar, y la pantalla habría parecido vacía.
  const { estructuraDePagina, controlesDePagina, cargarTodo } = await import('./balanz-navegador.mjs')
  const r = await conPagina(async (page) => ({
    est: await page.evaluate(estructuraDePagina),
    ctrl: await controlesDePagina(page),
  }))
  assert.ok(r.est, 'la estructura no puede ser undefined')
  assert.equal(r.est.encabezados[0].texto, 'Fondos Comunes de Inversión')
  assert.equal(r.est.tablas.length, 1)
  assert.deepEqual(r.est.tablas[0].cabecera.slice(0, 3), ['Fondo', 'Moneda', 'TNA'])
  assert.equal(r.est.tablas[0].filas, 3)
  assert.deepEqual(r.est.tabs, ['Pesos', 'Dólares'])
  assert.ok(r.est.paginacion >= 1)
  assert.ok(r.ctrl.length >= 8, `controles: ${r.ctrl.length}`)
  assert.ok(r.ctrl.every((c) => typeof c === 'object' && 'tag' in c), 'cada control tiene que traer sus atributos')
  void cargarTodo
})

test('cargarTodo dispara el lazy loading y para cuando la altura deja de crecer', opts, async () => {
  const { estructuraDePagina, cargarTodo } = await import('./balanz-navegador.mjs')
  const r = await conPagina(async (page) => {
    const vueltas = await cargarTodo(page, 5)
    return { vueltas, est: await page.evaluate(estructuraDePagina) }
  })
  assert.equal(r.est.tablas[0].filas, 5, 'las dos filas diferidas tienen que estar')
  assert.ok(r.vueltas < 5, `paró sola en ${r.vueltas} vueltas, no agotó el tope`)
})

/**
 * EL LOGIN REAL DE BALANZ. Es el texto visible que devolvió el sitio el 2026-08-02 (versión 2.35.1),
 * leído por CDP desde el Chrome dedicado, sin sesión iniciada. Se conserva textual a propósito: lo
 * que hace peligrosa a esta pantalla es lo que NO tiene.
 */
const LOGIN_REAL = `
<div>
  <h1>Ingresá y comenzá a invertir</h1>
  <form>
    <label>Usuario</label>
    <input type="text" />
    <button type="button">Olvidé o bloqueé mi usuario o contraseña</button>
    <button type="submit">Continuar</button>
  </form>
  <button>Abrir cuenta de inversión</button>
  <p>Si ya abriste una cuenta y es la primera vez que ingresas tenes que Crear/Activar usuario</p>
  <footer>
    <p>© 2026 Balanz Todos los derechos reservados. Versión 2.35.1</p>
    <p>No compartas tus datos de acceso o Código de Operación por mensajes, redes sociales, teléfono o email.</p>
  </footer>
</div>`

test('el login REAL de Balanz no tiene campo de contraseña — y aun así se detecta', opts, async () => {
  // ═══ EL DEFECTO QUE ESTE TEST FIJA ═══
  //
  // El ingreso de Balanz es en DOS PASOS: el primero pide sólo el usuario. `input[type=password]`
  // devuelve CERO. Con lo cual, hasta este cambio, la única señal viva era la URL — y si el bróker
  // sirviera el login como overlay sobre `/fondos`, `verificarSesion` lo habría dado por autenticado,
  // `relevar` habría devuelto `estado:'ok'` con el texto del login, y el ciclo habría informado
  // "el mercado no tiene nada" en vez de "no pude ver el mercado".
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.setContent(LOGIN_REAL) // URL about:blank: NO hay /login del que agarrarse
    assert.equal(await page.locator('input[type=password]').count(), 0,
      'si Balanz agrega el campo de contraseña al primer paso, este test dejó de probar lo que importa')
    await assert.rejects(() => verificarSesion(page), /SESSION_REQUIRED/)
    await assert.rejects(() => verificarSesion(page), /es el ingreso de Balanz/)
  } finally { await browser.close() }
})

test('una pantalla informativa con UNA frase de seguridad no se confunde con el login', opts, async () => {
  // El otro lado del mismo control: con una sola marca no alcanza. Un pie de página autenticado puede
  // repetir la recomendación de seguridad, y un agente que se declara desconectado para siempre por
  // eso es tan inútil como uno que no detecta nada.
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    // La advertencia de seguridad ENTERA, tal como la escribe Balanz. Es la leyenda que un bróker
    // repite en todas sus pantallas: no puede valer ni una marca, porque si valiera dos —y contiene
    // dos frases— un pie de página autenticado dejaría al agente desconectado para siempre.
    const AVISO = 'No compartas tus datos de acceso o Código de Operación por mensajes, redes sociales, teléfono o email.'
    await page.setContent(`${PAGINA}<footer>${AVISO}</footer>`)
    assert.equal(await verificarSesion(page), true)
    assert.equal(marcasDeLogin(AVISO).length, 0, 'la advertencia de seguridad no es una marca de login')
    assert.equal(marcasDeLogin('Ingresá y comenzá a invertir').length, 1)
    assert.ok(marcasDeLogin(LOGIN_REAL.replace(/<[^>]+>/g, ' ')).length >= 2,
      'el login real tiene que disparar al menos dos marcas')
  } finally { await browser.close() }
})
