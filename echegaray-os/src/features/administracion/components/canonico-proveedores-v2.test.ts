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
// EL VOCABULARIO DEL v2 VIVE EN `shared/components/v2` DESDE EL PORTE DE LAS OTRAS SECCIONES: las
// ocho abren con el mismo bloque de trabajo y la misma cabecera, y tenerlo bajo `proveedores/` hacía
// que Clientes importara una carpeta de otro dominio para dibujar su propia pantalla. Este test
// sigue siendo el guardián de las decisiones — lo único que cambió es dónde están los archivos.
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

/** Dónde vive el vocabulario compartido del v2, relativo a esta carpeta. */
const V2 = '../../../shared/components/v2/'

// `TrabajoDeSeccion.tsx` salió de esta lista el 08/09/2026: el dueño retiró el bloque «Lo que pide
// trabajo» de toda la plataforma y el archivo se borró. Las reglas del v2 que lo nombraban siguen
// vigentes para las pantallas que sí se dibujan.
const PANTALLAS = ['TablaProveedores.tsx', 'TablaNombres.tsx', 'PanelProveedor.tsx', 'PanelNombre.tsx',
  V2 + 'patron.tsx', V2 + 'CabeceraSeccion.tsx', V2 + 'FiltrosSuaves.tsx']

// ── CRITERIO 1 · LA PRIMERA LÍNEA DE CONTENIDO ES TRABAJO ────────────────────────────────────────

test('la banda de señales NO vuelve: lo que falta se lee en la fila y en su recorte', () => {
  // ═══ ESTO ERA EL CRITERIO 1 DEL PATRÓN v2, Y LA v4 LO REVIERTE ═══
  //
  // Hasta el handoff CRM / Administración v4 la pantalla abría con «Lo que pide trabajo» ANTES de
  // las sub-vistas. La v4 lo saca de las pantallas de área: la banda repetía en un renglón lo que
  // la fila ya marca en ámbar con su verbo y lo que el recorte «Sin CUIT» ya aísla de un clic, y
  // empujaba la lista —a lo que se entra— fuera de la primera pantalla.
  //
  // El defecto que atrapa este test es que la banda vuelva por inercia al portar otra pantalla, o
  // que se saque la banda SIN dejar las dos formas de leer lo que falta. Las tres aserciones tienen
  // que valer juntas: sin el recorte, sacar la banda esconde el trabajo en vez de acercarlo.
  const src = pagina()
  assert.equal(src.includes('<TrabajoDeSeccion'), false, 'volvió la banda de señales')
  assert.ok(src.indexOf('<CabeceraSeccion') > 0, 'la pantalla abre por sus sub-vistas')
  assert.match(src, /etiqueta: 'Sin CUIT'/, 'se fue la banda y no quedó el recorte que la reemplaza')
  assert.match(src, /titulo: 'Nombres sin resolver'/, 'la cola de nombres perdió su sub-vista')
})

// ── CRITERIO 2 · QUÉ BLOQUEA + VERBO, Y EL VERBO FUNCIONA EN EL LUGAR ────────────────────────────

test('la fila sin CUIT trae su verbo y el verbo abre el formulario, no otra pantalla', () => {
  // ═══ EL CONTRATO CAMBIÓ CON EL HANDOFF v4 (05/09/2026) ═══
  //
  // El v2 dibujaba una SEXTA columna sólo para el verbo «Cargar CUIT →». El v4 la borra: sus cinco
  // columnas son PROVEEDOR · CUIT · TIPO · COMPRADO · ÚLTIMA COMPRA y no hay ninguna de acciones.
  // El criterio 2 —la fila que reclama algo trae su verbo, y el verbo funciona en el lugar— no se
  // pierde: LA CELDA QUE RECLAMA ES EL VERBO. La ausencia en ámbar es el enlace, así que el destino
  // sigue siendo `hrefCuitDe` y sigue sin navegar a la ficha.
  //
  // Lo que este test protege ahora es lo que se puede perder: que la ausencia deje de ser accionable
  // y quede como un texto muerto, obligando a abrir la ficha para cargar un CUIT.
  const tabla = codigo('TablaProveedores.tsx')
  assert.match(tabla, /data-testid="fila-cargar-cuit"/, 'la ausencia dejó de ser accionable')
  assert.match(tabla, /data-testid="celda-sin-cuit"/)
  // El verbo apunta a la MISMA ruta con el panel y el formulario abiertos (`hrefCuitDe`), no a
  // `/administracion/proveedores/<id>`: mandarlo a la ficha es el `Ver → Editar` que el patrón veta.
  assert.match(tabla, /hrefCuitDe\(p\.id\)/)
  assert.doesNotMatch(tabla, /href=\{`\/administracion\/proveedores\/\$\{p\.id\}`\}/)
  // Y el enlace tiene que estar SOBRE la capa que cubre la fila entera: el nombre se estira con un
  // `after:inset-0`, y sin `relative z-10` el clic del verbo lo intercepta el enlace de la fila.
  assert.match(tabla, /relative z-10/, 'el verbo quedó debajo de la capa del nombre')

  const panel = fuente('PanelProveedor.tsx')
  assert.match(panel, /testid="form-cargar-cuit"/, 'el CUIT dejó de poder cargarse en el panel')
  assert.match(panel, /accion=\{editar\}/)
})

test('el recorte de «Sin CUIT» se alimenta de la LECTURA, no de un literal', () => {
  // El defecto que atrapa: cablear un número «para que no moleste». El contador se ve igual que el
  // de una empresa al día. Antes esto vigilaba la llamada a `armarSenales`, que se fue con la
  // banda; lo que quedó vigilando es la lectura que hoy alimenta el recorte y su contador.
  const src = codigoPagina()
  assert.match(src, /contarProveedores\(supabase, \{ activo: 'activos', sinCuit: true \}\)/)
  assert.match(src, /cuenta: pendientes\.error \? null : cola\.length/, 'el contador de la cola se cableó')
})

test('TODOS los recortes dicen su población, no sólo el que reemplazó a la banda', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Sacar la banda de señales y dejar los recortes mudos. «Sin CUIT 14» tenía su número desde el
  // primer día; «Activos», «Archivados», «Todos» y «Subcontratistas» eran cuatro palabras sin
  // tamaño, así que la única forma de saber cuántos proveedores archivados hay era hacer clic y
  // contar filas a ojo. El handoff v4 pone el número al lado de cada recorte porque es lo que
  // reemplaza al renglón de señales que se retiró.
  const src = codigoPagina()
  assert.match(src, /cuenta: POBLACION\[a\]/, 'los tres cortes de estado quedaron mudos')
  assert.match(src, /activos: nActivos\?\.data \?\? null/)
  assert.match(src, /archivados: nArchivados\?\.data \?\? null/)
  assert.match(src, /todos: nTodos\?\.data \?\? null/)
})

test('«Todos» se lee de la base y NO se calcula como activos + archivados', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // La suma es gratis y miente cuando uno de los dos sumandos falla: con `archivados` en error,
  // «Todos 36» publicaría una cartera de 36 donde hay 43. Un total más chico que el real es la
  // clase de error que nadie ve, porque la lista que abre debajo también viene recortada.
  const src = codigoPagina()
  assert.match(src, /contarProveedores\(supabase, \{ activo: 'todos' \}\)/)
  assert.doesNotMatch(src, /nActivos.*\+.*nArchivados/)
})

test('un conteo que falló NO dibuja un 0: el recorte se queda sin número', () => {
  // `null` viaja hasta `FiltrosSuaves`, que sólo dibuja la cifra si no es nula. Un 0 diría «no hay
  // ninguno archivado» — una afirmación sobre la cartera que un error de lectura no habilita.
  assert.match(codigo(V2 + 'FiltrosSuaves.tsx'), /o\.cuenta != null &&/)
  assert.match(codigoPagina(), /number \| null/)
})

test('el conteo de subcontratistas se hace sobre la lista LEÍDA, no sobre la ya recortada', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Contar sobre `porFiltro` —la lista después de aplicar «Sin CUIT» y el propio «Subcontratistas»—
  // haría que el número se derrumbara a 1 apenas se hace clic en el recorte, y a 0 combinándolo con
  // «Sin CUIT»: el contador diría que hay menos subcontratistas porque se los está mirando.
  const src = codigoPagina()
  assert.match(src, /cuenta: todos\.filter\(\(p\) => subs\.has\(p\.id\)\)\.length/)
  assert.doesNotMatch(src, /cuenta: porFiltro\.filter/)
  assert.doesNotMatch(src, /cuenta: lista\.filter/)
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
})

test('el color sólo va en la cifra: el filo ámbar marca el problema y la selección va en el fondo', () => {
  const patron = fuente(V2 + 'patron.tsx')
  assert.match(patron, /FILO_BLOQUEA = `inset 2px 0 0 \$\{V\.warn\}`/)
  const tabla = fuente('TablaProveedores.tsx')
  // El defecto que atrapa: colgar el filo ámbar de la selección. Elegir la fila borraría su
  // problema, que es la confusión que el propio mockup declara en `22v2:422`.
  assert.match(tabla, /boxShadow: p\.cuit \? undefined : FILO_BLOQUEA/)
  assert.match(tabla, /background: elegido \? V\.seleccion : undefined/)
})

// ── CRITERIO 5 · ICONOS DE TRAZO 1.6, LOS DEL §11 ────────────────────────────────────────────────

test('los iconos salen del set de trazo 1.6 del §11, no del canon de trazo 2', () => {
  for (const a of PANTALLAS.concat([V2 + 'BuscadorFilo.tsx'])) {
    const src = codigo(a)
    assert.equal(/from '@\/shared\/components\/canon'/.test(src), false,
      `${a} importa iconos/estilos del canon de agosto (trazo 2, caja)`)
    // Se mira un NOMBRE de icono concreto (`IconoProveedor`), no la palabra «Icono»: un componente
    // que RECIBE el icono por prop —`TrabajoDeSeccion`, que las ocho secciones llenan con el suyo—
    // no importa ninguno, y exigirle el import lo obligaría a elegir uno por todas.
    if (/Icono[A-Z]/.test(src)) assert.match(src, /from '@\/shared\/components\/iconos'/)
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

test('el maestro tiene las CINCO columnas del handoff v4, con su grilla literal', () => {
  // ═══ EL CONTRATO CAMBIÓ, Y ÉSTE ES EL VALOR NUEVO ═══
  //
  // Hasta el 05/09/2026 este test exigía CUATRO columnas —PROVEEDOR · CUIT · COMPRADO · COMPROB.—
  // y prohibía TIPO por no tener fuente. `Administración v4 · Pantallas.dc.html`, bloque
  // «2 · PROVEEDORES», dibuja CINCO: PROVEEDOR · CUIT · TIPO · COMPRADO · ÚLTIMA COMPRA. No es
  // «editar un test para que pase»: el diseño manda, y la prohibición cambia de forma en vez de
  // desaparecer — TIPO se dibuja, pero sólo puede decir lo que la base prueba («Subcontratista») y
  // el rubro, que no tiene columna en `proveedores`, sale como la ausencia «sin rubro».
  //
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Que la grilla y los rótulos dejen de tener la MISMA cantidad de pistas. Una columna de más o de
  // menos corre la fila entera respecto de su cabecera, y es el defecto más caro de agregar o sacar
  // una columna: la pantalla sigue dibujándose, con cada dato bajo el rótulo equivocado.
  const src = codigo('TablaProveedores.tsx')
  for (const c of ['Proveedor', 'CUIT', 'Tipo', 'Comprado', 'Última compra']) {
    assert.ok(src.includes(`>${c}<`), `falta la columna ${c}`)
  }
  // PAPELES sigue sin fuente y sigue sin dibujarse. «Comprob.» se fue con el v4.
  for (const c of ['>Rubro<', '>Papeles<', 'PAPELES', '>Comprob.<']) {
    assert.equal(src.includes(c), false, `volvió una columna sin fuente: ${c}`)
  }
  // LA GRILLA, CARÁCTER POR CARÁCTER contra el mockup (`Administración v4 · Pantallas.dc.html:152`).
  assert.ok(
    src.includes('grid-cols-[minmax(240px,1.6fr)_160px_130px_160px_minmax(120px,1fr)]'),
    'la grilla ancha dejó de ser la del handoff v4',
  )
  // Cinco pistas declaradas y cinco celdas dibujadas por fila. Se cuentan sobre el bloque de la
  // fila, no sobre el archivo, para que un `<span>` del encabezado no infle el número.
  const cuerpo = src.slice(src.indexOf('{proveedores.map('))
  const celdas = ['IconoProveedor', 'formatearCuit', 'tipo-proveedor', 'pesos(c.total)', 'ultima-compra']
  for (const c of celdas) assert.ok(cuerpo.includes(c), `la fila perdió la celda ${c}`)
})

test('TIPO no inventa un rubro: sale de la deducción o de una persona, nunca del nombre', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Que alguien llene la columna deduciendo el rubro del NOMBRE —«Corralón» ⇒ Materiales,
  // «Transporte» ⇒ Fletes—. Esa inferencia acierta lo suficiente como para que nadie revise las
  // veces que falla, y se apoya justo en el texto que este mismo módulo declara que NO identifica a
  // un proveedor. Desde el 06/09/2026 el rubro SÍ tiene fuente (`20260906T1800`), pero la fuente
  // son sus COMPRAS: la tabla no puede volver a mirar el nombre.
  const tabla = codigo('TablaProveedores.tsx')
  assert.match(tabla, /const rubro = rubroDe\(p\)/,
    'la tabla dejó de pedir el rubro a la única función que resuelve la precedencia')
  assert.match(tabla, /subcontratistas \? rubro\.texto : 'sin leer'/)
  // Ningún rubro escrito a mano en esta tabla: el vocabulario vive en `rubro-proveedor.mjs` y el
  // valor de cada fila viene de la base. Un literal acá es un rubro fabricado en la pantalla.
  assert.equal(/'(Materiales|Fletes|Combustible|Equipos|Servicios de obra|Seguridad e higiene)'/.test(tabla),
    false, 'la columna TIPO volvió a escribir un rubro a mano')
  // Y una lectura que falló no dice «sin rubro»: dice «sin leer». Un control que no pudo mirar no
  // afirma que no está.
  assert.match(tabla, /: 'sin leer'/)
})

test('lo DEDUCIDO no se dibuja como lo DECIDIDO, y muestra su cuenta', () => {
  // Regla de oro 2: nunca presentar una estimación como un hecho. Un rubro deducido de 3 compras y
  // uno que una persona declaró no pueden verse iguales, y el que mira tiene que poder ver la
  // cuenta sin salir de la fila.
  const tabla = codigo('TablaProveedores.tsx')
  assert.match(tabla, /color: esSub \|\| rubro\.declarado \? V\.tintaSuave : V\.tenue/,
    'el rubro deducido se dibuja igual de firme que el declarado')
  assert.match(tabla, /title=\{esSub[\s\S]{0,220}rubro\.evidencia/,
    'la deducción dejó de mostrar la cuenta que la produjo')

  // Y LA PRECEDENCIA SE DECIDE EN UN SOLO LUGAR: lo declarado gana, lo deducido va después, y la
  // ausencia se dice. Dos pantallas resolviéndolo por su cuenta muestran cosas distintas del mismo
  // proveedor — que es lo que «realidad única» existe para impedir.
  const tipos = codigo('../types/index.ts')
  assert.match(tipos, /if \(p\.rubro\) return \{ texto: p\.rubro, declarado: true/)
  assert.match(tipos, /texto: 'sin rubro', declarado: false, evidencia: null/)
})

test('el rubro se puede CORREGIR desde la ficha, y la corrección se puede deshacer', () => {
  // Sin esta puerta la deducción sería una afirmación que nadie puede contradecir. Y sin la opción
  // vacía, la primera corrección equivocada quedaría clavada para siempre: el vacío devuelve el
  // mando a la deducción, que sigue viva debajo.
  const campos = codigo('proveedores/CamposProveedor.tsx')
  assert.match(campos, /name="rubro"/, 'la ficha no deja corregir el rubro')
  assert.match(campos, /<option value="">Dejar que lo deduzca el OS<\/option>/,
    'la corrección quedó sin vuelta atrás')
  assert.match(campos, /\(RUBROS as string\[\]\)\.map/,
    'la ficha escribió su propia lista de rubros en vez de usar la que la base impone')

  // EL AUTOR SALE DE LA SESIÓN, NO DEL FORMULARIO. Si viajara en el form, cualquiera podría firmar
  // la decisión con el nombre de otro — y un rubro declarado sin autor es uno deducido con otro
  // nombre. La base además lo exige con un CHECK.
  const acciones = codigo('../services/proveedoresActions.ts')
  assert.match(acciones, /rubro_declarado_por: rubro \? quien : null/)
  assert.match(acciones, /sesion\?\.user\?\.email/)
  // Y LA ACCIÓN NO TOCA `rubro_deducido` NI PARA LIMPIARLO: la deducción tiene que seguir debajo.
  assert.equal(acciones.includes('rubro_deducido'), false,
    'la pantalla escribe la deducción: la distinción entre lo probado y lo supuesto se pierde')
})

test('ÚLTIMA COMPRA muestra la fecha real, y nunca la de otra cosa', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Que la columna se rellene con la fecha de otra cosa: `updated_at` del proveedor, la fecha de
  // alta, la de la última fila leída. Cualquiera de esas compila, se ve plausible en pantalla y
  // manda a un jefe de compras a llamar a un proveedor al que no se le compra hace ocho meses.
  //
  // Hasta el 05/09 esta celda decía «sin leer» en el 100% de las filas porque la vista no publicaba
  // la fecha. La migración `20260905T1600` la trajo (33 de 33 nombres vinculados la tienen), así que
  // la prohibición no desapareció: cambió de forma. Ahora se exige que la fecha venga del agrupado
  // de compras y de ningún otro lado.
  const tabla = codigo('TablaProveedores.tsx')
  assert.match(tabla, /fechaCortaConAnio\(c\.ultima\)/)
  assert.equal(/updated_at|actualizado_en|creado_en|fecha_alta/.test(tabla), false,
    'la fecha de la última compra salió de otra columna')
  // LAS TRES AUSENCIAS SIGUEN SIENDO TRES. Sin cartera leída «sin leer»; con cartera pero sin
  // ninguna compra de este proveedor, el «—» del mockup; con compras pero ninguna fechada, «sin
  // fecha» — que no es ninguna de las otras dos.
  assert.match(tabla, /'sin fecha'\s*\)\s*:\s*comprado \? '—' : 'sin leer'/)
  // El motivo del borde va en la celda, no sólo en un comentario que el usuario no ve, y sólo
  // cuando ES el borde: un `title` en una fila que muestra su fecha es ruido.
  assert.match(tabla, /title=\{c && !c\.ultima \? SIN_FECHA : undefined\}/)
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

// ── LOS PAPELES DEL PROVEEDOR (06/09/2026) ───────────────────────────────────────────────────────
//
// El canónico v2 declaraba PAPELES «sin fuente: ninguna tabla vincula un archivo con un proveedor».
// Dejó de ser cierto y lo que se protege ahora es lo contrario: que el bloque esté, que salga de la
// vista derivada y que no vuelva a pedir N firmas contra un bucket privado.

test('el papel del proveedor se dibuja, y antes que el diagnóstico de nombres', () => {
  const panel = codigo('PanelProveedor.tsx')
  assert.match(panel, /<PapelesDelProveedor estado=\{papeles\} \/>/)
  assert.ok(
    panel.indexOf('<PapelesDelProveedor') < panel.indexOf('Nombres de Compras vinculados'),
    'el diagnóstico de la canonicalización quedó antes que lo que la persona vino a buscar',
  )
})

test('el panel NO previsualiza: una firma por clic, no una por papel al abrir', () => {
  const src = codigo('proveedores/PapelesDelProveedor.tsx')
  // El defecto que esto evita está medido: un proveedor tiene 15 papeles y el bucket es privado.
  // Previsualizarlos son 15 URLs firmadas apenas se abre el panel, pedidas por adelantado para
  // archivos que quizá nadie mire.
  assert.equal(/useEffect/.test(src), false, 'el bloque pide firmas al montar')
  assert.equal(/<img/.test(src), false, 'el bloque dibuja miniaturas')
  // La firma la da la server action con el cliente del USUARIO. Armar la URL del bucket acá sería
  // saltear la policy que decide quién puede ver una factura.
  assert.match(src, /urlDelAdjunto\(p\.adjunto_id\)/)
  assert.equal(/object\/public|createSignedUrl|storage\.from/.test(src), false)
  assert.match(src, /window\.open\(r\.dato, '_blank', 'noopener'\)/)
})

test('las cuatro ausencias del papel se dicen con palabras, nunca con un cero ni un guión', () => {
  const src = fuente('proveedores/PapelesDelProveedor.tsx')
  for (const t of ['papeles-sin-leer', 'sin-papeles-proveedor']) assert.match(src, new RegExp(`data-testid="${t}"`))
  for (const k of ['sin-compras', 'sin-archivo', 'no-se-sabe']) assert.match(src, new RegExp(`'${k}':`))
  assert.match(src, /esta ficha no puede afirmar que no tenga ninguno/)
  // Un importe o una fecha que faltan se nombran; el mockup pone «—» en su tabla ancha y acá, en un
  // panel de 372px, un guión suelto no se distingue de un dato en blanco.
  assert.match(src, /'sin fecha'/)
  assert.match(src, /'sin importe'/)
  assert.equal(/>—</.test(src), false, 'un guión mudo volvió al panel')
})

test('los papeles se leen UNA vez por panel abierto, nunca uno por fila de la cartera', () => {
  const pag = codigoPagina()
  assert.equal((pag.match(/getPapelesDelProveedor/g) ?? []).length, 2, 'hay más de una lectura de papeles')
  // Va en la tanda paralela: encadenarla después de resolver la ficha agrega un viaje a cada clic.
  assert.match(pag, /sp\.p \? getPapelesDelProveedor\(supabase, sp\.p\) : null/)
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
    V2 + 'CabeceraSeccion.tsx', V2 + 'FiltrosSuaves.tsx', V2 + 'patron.tsx']) {
    assert.equal(fuente(a).startsWith("'use client'"), false, `${a} se volvió de cliente sin necesitarlo`)
  }
  assert.equal(codigoPagina().includes("'use client'"), false)
  for (const a of ['PanelNombre.tsx', V2 + 'BuscadorFilo.tsx']) {
    assert.ok(fuente(a).startsWith("'use client'"), `${a} necesita estado y dejó de ser de cliente`)
  }
})

// ── LAS DOS UNIDADES BASE QUE CORRÍAN LA PANTALLA ENTERA ─────────────────────────────────────────
//
// Medido contra el `.dc.html` a 1520x900 el 25/08/2026. Ninguna de las dos era un bloque mal
// maquetado: eran dos defaults distintos entre el mockup y Tailwind, y cada uno movía POCOS píxeles
// por elemento que se acumulaban hacia abajo. Se arreglan arriba, una sola vez, y se fijan acá
// porque un refactor los borra sin que nadie note nada hasta comparar de nuevo.

test('el interlineado del mockup se declara UNA vez y no envuelve la barra ajena', () => {
  // ANTES: cada bloque de texto era 4-5px más alto que el del zip («Lo que pide trabajo» 24 contra
  // 20, la solapa de nivel 3 24 contra 20) y eso corría el encabezado de la tabla 25px. El `.dc.html`
  // no declara `line-height` en ningún lado —corre con `normal`— y el preflight de Tailwind pone 1.5.
  const src = codigoPagina()
  assert.match(src, /lineHeight: 'normal'/, 'la pantalla volvió a heredar el interlineado 1.5 de Tailwind')
  // Y NO puede envolver a `NavAdministracion`: esa barra es de la sección, no de esta pantalla.
  const nav = src.indexOf('<NavAdministracion')
  const lh = src.indexOf("lineHeight: 'normal'")
  assert.ok(lh > nav, 'el interlineado envuelve la barra de áreas, que no es de esta pantalla')
})

test('el alto y el ancho se miden como el mockup: el borde va POR AFUERA', () => {
  // ANTES: el panel medía 396px contra los 421px del zip —el padding de 24 y el borde de 1 se los
  // comía desde adentro `border-box`— y esos 25px se los llevaba la lista. Las filas, 40 contra 41.
  //
  // EL 372 SE FUE A 344 EL 06/09/2026 (el handoff v4 no escribe 372 en ningún lienzo; ver el
  // porqué en `patron.tsx`). Lo que este test protege NO es el número: es que el ancho se declare
  // junto a `box-content`, que es lo único que hacía aparecer los 25px. Por eso el ancho queda
  // abierto y lo que se exige es que los dos viajen pegados — si alguien pone el `w-[…]` sin el
  // `box-content`, esto se pone rojo igual, que es el defecto de origen.
  const patron = codigo(V2 + 'patron.tsx')
  assert.match(patron, /export const CAJA_CONTENIDO = 'box-content'/)
  assert.match(patron, /lg:box-content lg:w-\[\d+px\]/, 'el panel volvió a medir su padding por dentro')
  // Y el hueco que la cabecera reserva TIENE QUE SEGUIR AL PANEL: 344 + 24 de margen + 24 de
  // sangría = 392. Desfasarlos deja el buscador gobernando una tabla que ya no está debajo.
  assert.match(patron, /lg:w-\[344px\]/, 'el panel dejó de medir los 344 del canvas v4')
  assert.match(codigo(V2 + 'CabeceraSeccion.tsx'), /lg:w-\[392px\]/,
    'el hueco de la cabecera se desfasó del panel: 344 + 24 + 24 = 392')
  assert.match(patron, /boxSizing: 'content-box'/, 'el encabezado de columnas perdió su filo por afuera')
  for (const a of ['TablaProveedores.tsx', 'TablaNombres.tsx']) {
    assert.match(codigo(a), /CAJA_CONTENIDO/, `${a}: sus filas volvieron a comerse el filo desde adentro`)
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
