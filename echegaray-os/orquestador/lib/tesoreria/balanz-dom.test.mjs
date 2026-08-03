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
import {
  clicSeguro, navegarSeguro, auditarControles, verificarSesion, marcasDeLogin,
  leerTablaCotizaciones, leerTarjetasDeFondos, llegoADestino, cargarTodo, buscarPestanaAutenticada,
} from './balanz-navegador.mjs'
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
  assert.ok(r.vueltas.vueltas < 5, `paró sola en ${r.vueltas.vueltas} vueltas, no agotó el tope`)
  assert.equal(r.vueltas.completo, true, 'paró porque terminó, no porque se quedó sin vueltas')
})

test('una carga que se queda sin vueltas se declara TRUNCADA, no completa', opts, async () => {
  // En el relevamiento real, corporativos y cedears llegaron al tope con 320 filas cada uno: puede
  // haber más. Informar 320 como si fueran todas es contestar de menos sin decirlo.
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.setContent(`
      <section id="sc" style="height:320px;overflow-y:scroll">
        <table><tbody id="tb"><tr><td>1</td></tr></tbody></table>
        <div id="relleno" style="height:900px"></div>
      </section>
      <script>
        // Crece SIEMPRE, y de a mucho: es una lista infinita, nunca se termina de cargar.
        let alto = 900
        document.getElementById('sc').addEventListener('scroll', () => {
          document.getElementById('tb').insertAdjacentHTML('beforeend', '<tr><td>x</td></tr>')
          alto += 900
          document.getElementById('relleno').style.height = alto + 'px'
        })
      </script>`)
    const r = await cargarTodo(page, 4)
    assert.equal(r.vueltas, 4, 'agotó el tope')
    assert.equal(r.completo, false, 'y tiene que declararse incompleta')
  } finally { await browser.close() }
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

// ════════════════════════════════════════════════════════════════════════════
// EL DOM REAL DE BALANZ — reproducido tal como se leyó con sesión el 02/08/2026
// ════════════════════════════════════════════════════════════════════════════

/**
 * La tabla de cotizaciones, con sus tres rarezas verificadas contra el sitio:
 * columna sin encabezado al principio (el ícono de "seguir"), ticker y nombre en la MISMA celda
 * separados por un salto, y última columna sin encabezado con el libro de puntas — que trae los
 * botones "Vender" y "Comprar" adentro.
 */
const TABLA_REAL = `
<table>
 <thead><tr>
   <th></th><th>Ticker</th><th>Plazo</th><th>Hora</th><th>Precio</th>
   <th>Var(%)</th><th>Var</th><th>TIR</th><th>Volumen</th><th></th>
 </tr></thead>
 <tbody>
   <tr>
     <td><span>☆</span></td>
     <td>AE38<br>BONO REP. ARGENTINA USD STEP UP 2038</td>
     <td>24hs</td><td>31/07/2026</td><td>1.250,00</td><td>0,00%</td><td>0,00</td>
     <td>9.3%</td><td>6.918.918.474</td>
     <td>99 × 1.180,00 <button>Vender</button> 1.265,00 × 4000 <button>Comprar</button></td>
   </tr>
 </tbody>
</table>`

/** La tarjeta de un fondo: pares etiqueta→valor, sin una sola tabla ni encabezado semántico. */
const TARJETA_REAL = `
<div class="row fondo-item border-bottom mx-0 ng-star-inserted">
  <div class="col-4"><div class="d-flex flex-column gap-3 w-100"><div>
    <div class="text-color-primary-alt-dark text-size-6 fw-semibold cursor-pointer"> Money Market Pesos </div>
  </div><div class="text-size-4 text-color-base">Fondo que busca un rendimiento diario estable.</div></div></div>
  <div class="col-3"><div><div class="fondo-head-detail d-flex">
    <div class="fw-semibold text-size-4"> Detalle del fondo </div>
    <div class="d-flex"><div class="fondo-badge me-1 text-color-base"> Inmediato </div>
    <div class="badge-moneda-custom px-2"> ARS </div></div></div>
    <div class="d-flex"><div><div class="text-size-2 text-color-base">Perfíl</div>
    <div class="fw-semibold text-size-4"> Conservador </div></div>
    <div><div class="text-size-2 text-color-base">Tipo</div>
    <div class="fw-semibold text-size-4"> Mercado de Dinero </div></div>
    <div><div class="text-size-2 text-color-base">Horizonte</div>
    <div class="fw-semibold text-size-4"> Corto plazo </div></div></div></div></div>
  <div class="col-3"><div><div class="fondo-head-detail d-flex">
    <div class="fw-semibold text-size-4"> Variaciones </div>
    <div class="text-size-2"> TNA: <span class="fw-semibold exchange-upper"> +17,81% </span></div></div>
    <div class="d-flex"><div><div class="text-size-2 text-color-base">Diaria</div>
    <div class="fw-semibold text-size-4 exchange-upper"> 0,05% </div></div>
    <div><div class="text-size-2 text-color-base">Anual</div>
    <div class="fw-semibold text-size-4 exchange-upper"> 28,17% </div></div></div></div></div>
  <div class="col-2"><button>Suscribir</button></div>
</div>`

test('la tabla real se normaliza: ticker y nombre se parten, el libro de puntas se descarta', opts, async () => {
  // Sin esto, `mapearColumnas` no encontraba columna de nombre —la tabla NO tiene una— y
  // `extraerDeTabla` devolvía CERO instrumentos con un motivo que el ciclo no mira. Cinco pantallas
  // de cotizaciones enteras leídas como si estuvieran vacías.
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.setContent(TABLA_REAL)
    const t = await page.evaluate(leerTablaCotizaciones)
    assert.deepEqual(t.cabecera, ['Ticker', 'Nombre', 'Plazo', 'Hora', 'Precio', 'Var(%)', 'Var', 'TIR', 'Volumen'])
    assert.equal(t.filas.length, 1)
    assert.equal(t.filas[0][0], 'AE38')
    assert.equal(t.filas[0][1], 'BONO REP. ARGENTINA USD STEP UP 2038')
    assert.equal(t.filas[0][7], '9.3%')
    // El libro de puntas queda AFUERA: su texto mete "Vender" y "Comprar" en el dato guardado.
    assert.ok(!t.filas[0].some((c) => /vender|comprar/i.test(c)), 'un verbo transaccional entró al dato')
  } finally { await browser.close() }
})

test('la tarjeta real se lee por ETIQUETA: hay CERO tablas y CERO encabezados en esa pantalla', opts, async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.setContent(TARJETA_REAL)
    // La constatación que rompió el diseño anterior: la pantalla de fondos no tiene NADA semántico.
    assert.equal(await page.locator('table').count(), 0)
    assert.equal(await page.locator('h1,h2,h3,h4,h5,h6,[role=heading]').count(), 0)
    assert.equal(await page.locator('[role=tab],[role=table],li').count(), 0)

    const [f] = await page.evaluate(leerTarjetasDeFondos)
    assert.equal(f.nombre, 'Money Market Pesos')
    assert.equal(f.plazo_rescate_texto, 'Inmediato')
    assert.equal(f.moneda_texto, 'ARS')
    assert.equal(f.tipo, 'Mercado de Dinero')
    assert.equal(f.perfil, 'Conservador')
    assert.match(f.tna_texto, /TNA:\s*\+?17,81%/)
    assert.equal(f.variaciones.anual, '28,17%')
  } finally { await browser.close() }
})

test('cargarTodo scrollea el CONTENEDOR, no la ventana — que en Balanz no scrollea', opts, async () => {
  // ═══ EL DEFECTO ═══
  // En la app real `document.body.scrollHeight` y `window.innerHeight` valen los dos 788: el body no
  // scrollea nunca. El contenido vive en un `section.content.overflow-y-scroll` propio. La versión
  // anterior movía la ventana, medía el body, no veía cambio y devolvía 0 en la primera vuelta.
  // Costo medido con la sesión abierta: bonos 20→189 filas, cedears 20→260, cauciones 20→164.
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.setContent(`
      <section id="sc" style="height:300px;overflow-y:scroll">
        <table><tbody id="tb"><tr><td>1</td></tr></tbody></table>
        <div style="height:1200px"></div>
      </section>
      <script>
        document.getElementById('sc').addEventListener('scroll', () => {
          const tb = document.getElementById('tb')
          if (tb.children.length < 40) {
            for (let i = 0; i < 10; i += 1) tb.insertAdjacentHTML('beforeend', '<tr><td>x</td></tr>')
          }
        })
      </script>`)
    assert.equal(await page.locator('tbody tr').count(), 1, 'arranca con una fila')
    await cargarTodo(page)
    const filas = await page.locator('tbody tr').count()
    assert.ok(filas >= 40, `el scroll interno no disparó la carga: quedaron ${filas} filas`)
  } finally { await browser.close() }
})

test('una ruta que no existe redirige a /app/home SIN error, y eso no es llegar', () => {
  // Balanz no devuelve 404: manda a la portada, que es autenticada y legítima, así que
  // `verificarSesion` la aprueba. Verificado con sesión: /on, /etf y /lecaps terminan las tres ahí.
  // Sin esta guarda el relevamiento se traía el ticker de la portada como si fuera el listado pedido.
  assert.equal(llegoADestino('https://clientes.balanz.com/app/cotizaciones/on', 'https://clientes.balanz.com/app/home'), false)
  assert.equal(llegoADestino('/app/cotizaciones/bonos', 'https://clientes.balanz.com/app/cotizaciones/bonos'), true)
  // El query no cambia la ruta, y una subruta del destino sí es haber llegado.
  assert.equal(llegoADestino('/app/cotizaciones/corporativos?all=1', 'https://clientes.balanz.com/app/cotizaciones/corporativos?all=1'), true)
  assert.equal(llegoADestino('/app/cotizaciones/fondos', 'https://clientes.balanz.com/app/cotizaciones/fondos/detalle/1'), true)
})

test('la sesión vive en la pestaña: se busca la autenticada, no se abre una nueva', () => {
  // Balanz guarda la sesión en `sessionStorage` —0 cookies en todo el contexto—, y `sessionStorage`
  // no se comparte entre pestañas. `ctx.newPage()` nacía deslogueada SIEMPRE: el explorador devolvía
  // SESSION_REQUIRED con la sesión del dueño abierta y andando al lado.
  const pagina = (u) => ({ url: () => u })
  assert.equal(buscarPestanaAutenticada([]), null)
  assert.equal(buscarPestanaAutenticada([pagina('https://clientes.balanz.com/auth/login')]), null,
    'la pestaña en el login no sirve como pestaña autenticada')
  assert.equal(buscarPestanaAutenticada([pagina('chrome://intro/')]), null)
  const buena = pagina('https://clientes.balanz.com/app/cotizaciones/fondos')
  assert.equal(buscarPestanaAutenticada([pagina('chrome://intro/'), pagina('https://otro.com/x'), buena]), buena)
})

test('el control de destino corre DESPUÉS de que la SPA rutea, no antes', opts, async () => {
  // ═══ EL DEFECTO, Y POR QUÉ NO ALCANZABA CON MOVER LA LÍNEA ═══
  //
  // `navegarSeguro` verificaba sesión y destino en el `domcontentloaded`, y `relevar` esperaba 1200 ms
  // DESPUÉS y recién ahí leía: se controlaba una pantalla y se guardaba otra. La corrección movió la
  // espera antes de los dos controles — pero no había ningún test que se pusiera rojo al revertirla,
  // que es lo único que la sostiene. Este lo hace: la página redirige por router a los 600 ms.
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.route('**/*', (route) => {
      const u = route.request().url()
      if (/\/app\/home/.test(u)) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Portada</h1><div>TAMAR 2,50%</div>' })
      }
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<h1>Bonos</h1><script>setTimeout(() => { location.replace('/app/home') }, 600)</script>`,
      })
    })
    const bloqueos = []
    const r = await navegarSeguro(page, 'https://clientes.balanz.com/app/cotizaciones/bonos', bloqueos)
    assert.equal(r.navegado, false, 'la SPA redirigió a la portada: NO se llegó al destino')
    assert.match(r.motivo, /la ruta no existe|redirigió/)
    assert.match(page.url(), /app\/home/, 'y la prueba es que la URL final es otra')
  } finally { await browser.close() }
})

test('cargarTodo no se conforma con UNA lectura estable: espera la tanda lenta', opts, async () => {
  // El arreglo exigió dos lecturas iguales en vez de una, porque un lote que tarda 800 ms en llegar
  // hacía que la pantalla se declarara completa con 20 filas de 189. Los dos tests anteriores usaban
  // una lista que se estabiliza para siempre y otra que nunca se estabiliza: ninguno cubría ESTE
  // caso, y revertir a un solo `return` no ponía nada rojo.
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.setContent(`
      <section id="sc" style="height:320px;overflow-y:scroll">
        <table><tbody id="tb"><tr><td>1</td></tr></tbody></table>
        <div id="relleno" style="height:1200px"></div>
      </section>
      <script>
        // La segunda tanda llega 800 ms DESPUÉS del scroll: más tarde que la espera de una vuelta.
        let tandas = 0
        document.getElementById('sc').addEventListener('scroll', () => {
          if (tandas >= 2) return
          tandas += 1
          setTimeout(() => {
            const tb = document.getElementById('tb')
            for (let i = 0; i < 10; i += 1) tb.insertAdjacentHTML('beforeend', '<tr><td>x</td></tr>')
            document.getElementById('relleno').style.height = (1200 + tandas * 800) + 'px'
          }, 800)
        })
      </script>`)
    const r = await cargarTodo(page, 10)
    const filas = await page.locator('tbody tr').count()
    assert.ok(filas >= 21, `se cortó antes de la tanda lenta: quedaron ${filas} filas`)
    assert.equal(r.completo, true)
  } finally { await browser.close() }
})
