import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO «22 · PROVEEDORES v2», VERIFICADO CONTRA EL FUENTE ═══
//
// Mismo método que `obras/components/canonico-subcontratos.test.ts`: lo que se protege son
// DECISIONES ESCRITAS —qué columnas hay, qué mide cada fila, qué NO se dibuja porque no tiene
// fuente— y no un comportamiento de render. Montar React para leer un estilo que ya está literal en
// el archivo mete un runtime entero entre la afirmación y el hecho.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla real se vea así en un navegador, ni que las acciones
// escriban. Eso es evidencia de otro nivel (Playwright y la lectura del efecto en la base). Acá se
// atrapa la regresión barata: la del refactor que nadie vuelve a mirar.
//
// EL DEFECTO CARO QUE ATRAPA es el que ya costó cuatro entregas del rediseño: volver a dibujar la
// CAJA. El patrón v2 es «sin cajas — filos, tipografía y números tabulares», y el canon de agosto
// que sigue vivo en el repo (`shared/components/canon`) exporta justamente la tarjeta con borde,
// radio y pie de totales. Basta un import distraído para que la pantalla vuelva atrás.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/administracion/proveedores/page.tsx'), 'utf8')

/**
 * El archivo SIN sus comentarios.
 *
 * Media docena de estas comprobaciones preguntan «¿esta pantalla usa X?», y los comentarios de este
 * repo explican POR QUÉ NO se usa X — o sea que nombran justo lo que se está prohibiendo. Sin este
 * filtro, el test se pone rojo por la explicación de la decisión correcta, que es la peor clase de
 * falso positivo: enseña a borrar el comentario.
 *
 * Alcanza con sacar las líneas que son enteramente comentario: en este repo no hay comentarios al
 * final de una línea de código, y quitar `//` con una expresión regular destrozaría cualquier `://`
 * de una ruta.
 */
const codigo = (a: string) => fuente(a)
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const codigoPagina = () => pagina()
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const PANTALLAS = ['TablaProveedores.tsx', 'TablaNombres.tsx', 'PanelProveedor.tsx', 'PanelNombre.tsx',
  'proveedores/patron.tsx', 'proveedores/CabeceraProveedores.tsx', 'proveedores/FiltrosSuaves.tsx',
  'proveedores/LoQuePideTrabajo.tsx']

// ── CRITERIO 1 · LA PRIMERA LÍNEA DE CONTENIDO ES TRABAJO ────────────────────────────────────────

test('el bloque de trabajo se dibuja ANTES que las sub-vistas y que cualquier lista', () => {
  const src = pagina()
  const trabajo = src.indexOf('<LoQuePideTrabajo')
  const cabecera = src.indexOf('<CabeceraProveedores')
  assert.ok(trabajo > 0, 'desapareció la primera línea de trabajo')
  assert.ok(cabecera > 0)
  assert.ok(trabajo < cabecera, 'el maestro volvió a ser lo primero que se ve')
})

// ── CRITERIO 2 · QUÉ BLOQUEA + VERBO, Y EL VERBO FUNCIONA EN EL LUGAR ────────────────────────────

test('la fila sin CUIT trae su verbo y el verbo abre el formulario, no otra pantalla', () => {
  const tabla = fuente('TablaProveedores.tsx')
  assert.match(tabla, /Cargar CUIT →/)
  // El verbo apunta a la MISMA ruta con el panel y el formulario abiertos (`hrefCuitDe`), no a
  // `/administracion/proveedores/<id>`: mandarlo a la ficha es el `Ver → Editar` que el patrón veta.
  assert.match(tabla, /hrefCuitDe\(p\.id\)/)
  assert.doesNotMatch(tabla, /href=\{`\/administracion\/proveedores\/\$\{p\.id\}`\}/)

  const panel = fuente('PanelProveedor.tsx')
  assert.match(panel, /testid="form-cargar-cuit"/, 'el CUIT dejó de poder cargarse en el panel')
  assert.match(panel, /accion=\{editar\}/)
})

test('las señales se alimentan de las LECTURAS, no de un literal', () => {
  // El defecto que atrapa: cablear `{ data: 0, error: null }` para «que no moleste». La señal
  // desaparece y la pantalla se ve igual que la de una empresa al día. `armarSenales` ya prueba la
  // regla; acá se prueba que le llegue el dato de verdad.
  const src = codigoPagina()
  const llamada = src.slice(src.indexOf('armarSenales('), src.indexOf('armarSenales(') + 400)
  assert.match(llamada, /\n\s*sinCuit,/, 'la señal de CUIT dejó de salir del conteo de la base')
  assert.match(llamada, /data: pendientes\.error \? null : cola\.length, error: pendientes\.error/)
  assert.equal(/data:\s*\d+/.test(llamada), false, 'hay un número literal donde iba una lectura')
  assert.match(src, /contarProveedores\(supabase, \{ activo: 'activos', sinCuit: true \}\)/)
})

test('el CTA de vincular nombra lo que falta cuando está apagado', () => {
  const src = fuente('PanelNombre.tsx')
  assert.match(src, /data-testid="vincular-bloqueado"/)
  assert.match(src, /Elegí el proveedor de la lista/)
  assert.match(src, /disabled=\{!elegido \|\| pendiente\}/)
})

test('ningún formulario queda anidado dentro de otro en el panel de la cola', () => {
  // EL DEFECTO, VISTO EN EL NAVEGADOR EL 25/08: «No es proveedor» trae su propio `<form>` y estaba
  // dentro del `<form>` de vincular. `<form>` dentro de `<form>` es HTML inválido: el navegador
  // descarta el interno al parsear, el árbol del servidor deja de coincidir con el del cliente y
  // React rehace la rama —«Hydration failed»—. El botón se ata por `form="…"` y vive afuera.
  const src = codigo('PanelNombre.tsx')
  assert.match(src, /form="form-vincular"/, 'el botón de vincular volvió a depender de estar anidado')
  const cierre = src.indexOf('</form>')
  const boton = src.indexOf('<BotonAccion')
  assert.ok(cierre > 0 && boton > cierre, 'un formulario volvió a quedar dentro del formulario de vincular')
})

test('el error del servidor se muestra siempre, en las dos escrituras de la cola', () => {
  const src = fuente('PanelNombre.tsx')
  assert.match(src, /data-testid="vincular-error"/)
  assert.match(src, /data-testid="form-crear-vincular-error"/)
})

// ── CRITERIO 3 · SIN CAJAS ───────────────────────────────────────────────────────────────────────

test('ninguna pantalla del porte usa la tarjeta, el pie de totales ni un radio de caja', () => {
  for (const a of PANTALLAS) {
    const src = codigo(a)
    for (const prohibido of ['TarjetaTabla', 'PieCanon', 'RADIO_TARJETA', 'TARJETA', 'FranjaCartera', 'PageShell']) {
      assert.equal(src.includes(prohibido), false, `${a} volvió a la caja: usa ${prohibido}`)
    }
    assert.equal(/boxShadow:\s*'0 /.test(src), false, `${a} dibuja una sombra: el v2 no tiene ninguna`)
    assert.equal(/borderRadius:\s*10/.test(src), false, `${a} dibuja el radio de tarjeta`)
  }
  assert.equal(codigoPagina().includes('PageShell'), false)
})

test('los números de las tablas son tabulares: dos filas se comparan de un vistazo', () => {
  for (const a of ['TablaProveedores.tsx', 'TablaNombres.tsx']) {
    const src = fuente(a)
    assert.match(src, /tabular-nums/, `${a} perdió los números tabulares`)
  }
  assert.match(fuente('proveedores/LoQuePideTrabajo.tsx'), /font-mono tabular-nums/)
})

test('el color sólo va en la cifra: el filo ámbar marca el problema y la selección va en el fondo', () => {
  const patron = fuente('proveedores/patron.tsx')
  assert.match(patron, /FILO_BLOQUEA = `inset 2px 0 0 \$\{V\.warn\}`/)
  const tabla = fuente('TablaProveedores.tsx')
  // El defecto que atrapa: colgar el filo ámbar de la selección. Elegir la fila borraría su
  // problema, que es la confusión que el propio mockup declara en `22v2:422`.
  assert.match(tabla, /boxShadow: p\.cuit \? undefined : FILO_BLOQUEA/)
  assert.match(tabla, /background: elegido \? V\.seleccion : undefined/)
})

// ── CRITERIO 5 · ICONOS DE TRAZO 1.6, LOS DEL §11 ────────────────────────────────────────────────

test('los iconos salen del set de trazo 1.6 del §11, no del canon de trazo 2', () => {
  for (const a of PANTALLAS.concat(['proveedores/BuscadorFilo.tsx'])) {
    const src = codigo(a)
    assert.equal(/from '@\/shared\/components\/canon'/.test(src), false,
      `${a} importa iconos/estilos del canon de agosto (trazo 2, caja)`)
    if (src.includes('Icono')) assert.match(src, /from '@\/shared\/components\/iconos'/)
  }
})

test('no se redibuja ningún icono: se usan los que ya existen', () => {
  for (const a of PANTALLAS) {
    assert.equal(codigo(a).includes('<svg'), false, `${a} dibuja un SVG a mano en vez de reusar el §11`)
  }
})

// ── LAS COLUMNAS SON LAS QUE LA BASE PUEDE PROBAR ────────────────────────────────────────────────

test('el rotulo que se suelta en angosto no lleva `display` inline', () => {
  // EL DEFECTO, MEDIDO A 1200px EL 25/08: un estilo inline le gana a cualquier media query, asi que
  // `style={{ display: "grid" }}` anulaba `max-[1249px]:hidden`. Las dos celdas de la FILA se
  // ocultaban bien y sus ROTULOS no, con lo cual «COMPROB.» quedaba dibujado sobre el nombre de la
  // primera fila y «COMPRADO» colgado del borde derecho. Es la misma trampa que ya documenta
  // `EnvoltorioAncho`, y por eso se fija en un test y no en un comentario.
  for (const a of ['TablaProveedores.tsx', 'TablaNombres.tsx']) {
    const src = codigo(a)
    for (const linea of src.split('\n')) {
      if (!linea.includes('SOLO_ANCHO')) continue
      assert.equal(/style=\{\{[^}]*display:/.test(linea), false,
        `${a}: una celda que se suelta en angosto fija su display inline y gana a la media query`)
    }
  }
})

test('el maestro tiene CUATRO columnas: ni RUBRO ni PAPELES ni TIPO', () => {
  const src = codigo('TablaProveedores.tsx')
  for (const c of ['Proveedor', 'CUIT · identidad', 'Comprado', 'Comprob.']) {
    assert.ok(src.includes(`>${c}<`), `falta la columna ${c}`)
  }
  for (const c of ['>Rubro<', '>Papeles<', '>Tipo<', 'RUBRO', 'PAPELES']) {
    assert.equal(src.includes(c), false, `volvió una columna sin fuente: ${c}`)
  }
  // La grilla y el rótulo tienen que tener la MISMA cantidad de columnas: una de más corre la fila
  // entera y es el defecto más caro de sacar una columna.
  const anchas = (src.match(/minmax\([^)]*\)/g) ?? []).filter((_, i) => i < 5)
  assert.equal(anchas.length, 5, 'la grilla ancha dejó de tener cinco columnas')
})

test('COMPRADO no promete una ventana de tiempo que el dato no tiene', () => {
  assert.match(pagina().replace(/\s+/g, ' '), /Lo comprado es histórico, no de los últimos doce meses/)
  for (const a of ['TablaProveedores.tsx', 'PanelProveedor.tsx']) {
    assert.equal(/12 M\b|últimos 12 meses|12 meses/i.test(codigo(a)), false,
      `${a} rotula lo comprado con una ventana de tiempo inventada`)
  }
  assert.match(codigo('PanelProveedor.tsx'), /· histórico/)
})

test('la ficha declara EN PANTALLA por qué no hay detalle comprobante por comprobante', () => {
  const src = fuente('PanelProveedor.tsx')
  assert.match(src, /data-testid="sin-detalle-comprobantes"/)
  assert.match(src, /texto libre y ninguna vista publica esas filas por proveedor/)
})

// ── NULL NUNCA ES CERO ───────────────────────────────────────────────────────────────────────────

test('no pude leerlo, no se le compró y cero son TRES cosas distintas', () => {
  const tabla = fuente('TablaProveedores.tsx')
  assert.match(tabla, /comprado \? 'sin compras' : 'sin leer'/)
  const panel = fuente('PanelProveedor.tsx')
  assert.match(panel, /'no pude leerlo'/)
  assert.match(panel, /'sin compras'/)
})

test('un nombre de la cola sin importe dice «sin importe», no $ 0', () => {
  const src = fuente('TablaNombres.tsx')
  assert.match(src, /Number\(n\.total \?\? 0\) > 0 \? pesos\(n\.total\) : 'sin importe'/)
})

// ── RENDIMIENTO · CERO N+1 ───────────────────────────────────────────────────────────────────────

test('la página lee en UN Promise.all y no dispara una consulta por fila', () => {
  const src = pagina()
  assert.equal((src.match(/await Promise\.all\(/g) ?? []).length, 1,
    'apareció un segundo Promise.all: las lecturas dejaron de salir juntas')
  // El defecto: un `await` dentro de un map/filter/forEach = una consulta por proveedor.
  assert.equal(/\.(map|filter|forEach|reduce)\([^)]*await /.test(src), false,
    'hay un await dentro de un recorrido: eso es una consulta por fila')
  // Lo comprado sale de la lectura única de la cartera, agrupada en memoria.
  assert.match(src, /agruparComprado\(resolucion\.data\)/)
  assert.match(src, /resumirCompras\(resolucion\.data\.filter/)
  assert.equal(src.includes('getCompradoDeLaCartera'), false)
  assert.equal(src.includes('getComprasDelProveedor'), false)
})

test('las lecturas que una sub-vista no usa no se piden', () => {
  const src = pagina()
  assert.match(src, /maestro \? getResolucionCartera\(supabase\) : null/)
  assert.match(src, /maestro \? getSubcontratistas\(supabase\) : null/)
  assert.match(src, /maestro \? null : getNombresResueltos\(supabase\)/)
})

test('sólo el pedazo que necesita interactividad es de cliente', () => {
  // El defecto: marcar la página o la tabla con 'use client' para que ande un radio. La tabla, el
  // panel del proveedor y la cabecera se renderizan en el servidor; el buscador y el panel de la
  // cola —que sí tienen estado— son los únicos de cliente.
  for (const a of ['TablaProveedores.tsx', 'TablaNombres.tsx', 'PanelProveedor.tsx',
    'proveedores/CabeceraProveedores.tsx', 'proveedores/FiltrosSuaves.tsx',
    'proveedores/LoQuePideTrabajo.tsx', 'proveedores/patron.tsx']) {
    assert.equal(fuente(a).startsWith("'use client'"), false, `${a} se volvió de cliente sin necesitarlo`)
  }
  assert.equal(codigoPagina().includes("'use client'"), false)
  for (const a of ['PanelNombre.tsx', 'proveedores/BuscadorFilo.tsx']) {
    assert.ok(fuente(a).startsWith("'use client'"), `${a} necesita estado y dejó de ser de cliente`)
  }
})

// ── LO QUE SE CONSERVÓ AUNQUE EL MOCKUP NO LO DIBUJE ─────────────────────────────────────────────

test('deshacer una resolución sigue existiendo: un vínculo equivocado se saca', () => {
  assert.match(fuente('TablaNombres.tsx'), /testid="deshacer-resolucion"/)
  assert.match(pagina(), /deshacer=\{deshacerResolucion\}/)
})

test('no hay ningún «vincular todo lo parecido»', () => {
  for (const a of PANTALLAS) {
    assert.equal(/similitud|levenshtein|parecid[oa]s/i.test(codigo(a)), false,
      `${a} insinúa un emparejador por similitud`)
  }
})
