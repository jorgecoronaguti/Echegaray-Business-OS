import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO «26 · CLIENTE FICHA v2», VERIFICADO CONTRA EL FUENTE ═══
//
// LOS DEFECTOS CAROS QUE ATRAPA:
//
//  · LA VUELTA DEL SLAB. Esta ficha se coronó primero con una barra grafito y después con un slab
//    blanco con avatar; el v2 no tiene ninguna cabecera de color, tiene una miga y un nombre.
//  · QUE «RESUMEN» VUELVA. Repetía la tabla de Obras con los presupuestos apilados debajo: dos
//    caras con otro nombre, y dos caminos para la misma información.
//  · QUE EL COSTADO SE VUELVA UNA CARA. La identidad y los contactos no pueden quedar detrás de una
//    solapa: ése fue el caso del 19/08 («¿tiene el contrato cargado y a quién llamo?»).
//  · PUBLICAR UN CERO POR UNA AUSENCIA. Sin monto cargado no es contratado $ 0, y sin presupuestos
//    cerrados no es 0 % de conversión.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (a: string) => readFileSync(join(DIR, a), 'utf8')
const pagina = () => readFileSync(join(DIR, '../../../app/(main)/clientes/[cliente]/page.tsx'), 'utf8')

const sinComentarios = (texto: string) => texto
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  })
  .join('\n')

const codigoPagina = () => sinComentarios(pagina())
const codigoListas = () => sinComentarios(fuente('ListasClienteV2.tsx'))

test('la ficha abre con la miga y el nombre, no con un slab ni con PageShell', () => {
  const src = codigoPagina()
  assert.match(src, /<Migas/)
  assert.match(src, /<TituloDeFicha/)
  assert.doesNotMatch(src, /CabeceraCliente|BarraContexto|<PageShell/)
  assert.doesNotMatch(src, /TiraMetricas/, 'las cifras del v2 no van en celdas con borde')
})

test('el cuerpo no vuelve a los bloques con marco', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, /<Bloque\b/, 'el v2 tiene caras y un costado, no bloques apilados')
  assert.doesNotMatch(codigoListas(), /ListaCanon|TarjetaTabla/)
})

test('la identidad y los contactos viven en el COSTADO, no en una cara', () => {
  const src = codigoPagina()
  const costado = src.indexOf('<CostadoDeFicha')
  assert.ok(costado > 0)
  assert.ok(src.indexOf('<BloqueInformacion') > costado, 'la identidad tiene que estar dentro del costado')
  assert.ok(src.indexOf('<BloqueContactos') > costado, 'los contactos tienen que estar dentro del costado')
})

test('el alta de obra es la única acción amarilla y ya no vive escondida arriba de la tabla', () => {
  const src = codigoPagina()
  assert.equal((src.match(/<AccionPrimaria/g) ?? []).length, 1)
  assert.match(src, /testid="nueva-obra"/)
  assert.match(src, /data-testid="alta-obra"/)
})

test('sin monto cargado la cifra lo dice, y nunca escribe $ 0', () => {
  assert.match(codigoPagina(), /falta: enCurso\.length \? 'sin monto cargado' : 'sin obra en curso'/)
})

test('una obra sin cronograma no tiene 0 % de avance: lo dice con palabras', () => {
  const src = codigoListas()
  assert.match(src, /o\.avance_pct != null/)
  assert.match(src, /'sin avance cargado'/)
  assert.match(src, /'sin cronograma'/)
})

test('un presupuesto sin cascada cerrada no vale $ 0', () => {
  assert.match(codigoListas(), /p\.total == null \? 'sin valorizar'/)
})

test('el verbo del presupuesto viaja como objeto y no como función', () => {
  // Una arrow creada en un Server Component y pasada como prop compila, pasa `build` y revienta en
  // producción con React #419 dejando la pantalla en blanco.
  assert.match(codigoListas(), /accion\?: \{ texto: string; href: string \}/)
  assert.doesNotMatch(codigoListas(), /verbo: \(/)
})

test('el costo real no se dibuja en la ficha del cliente', () => {
  // La ficha del cliente es la cara COMERCIAL de la relación; el costo vive en la obra, que es donde
  // se decide sobre él. El mockup 26 no lo trae.
  assert.doesNotMatch(codigoListas(), /costo_real/)
})

test('el resumen del portal no se afirma cuando no se leyó', () => {
  assert.match(codigoPagina(), /solapa === 'accesos'/)
  assert.match(codigoPagina(), /Se lee al abrir la cara/)
})


// ═══ ACCIONES DE FILA (handoff CRM / Administración v4) ═════════════════════════════════════════

test('el menú de la fila NO es un popover flotante: expande dentro de la fila', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // El popover se dibujaba en `position:absolute` sobre la tabla: tapa la fila de abajo, se recorta
  // contra el borde de la tarjeta, y —lo que importa— no tiene dónde poner el error de la base. «El
  // contacto tiene un acceso al portal: revocalo primero» no entra en 180px, y al cerrarse el menú
  // se va con ella.
  const acciones = sinComentarios(fuente('AccionesContacto.tsx'))
  assert.doesNotMatch(acciones, /MenuContextual/, 'volvió el popover')
  assert.match(acciones, /colSpan=\{columnas\}/, 'la línea ya no ocupa la fila entera')
})

test('sólo hay UNA línea de acciones abierta, y su estado viaja en la URL', () => {
  // Con `useState` en la tabla —que es de servidor— habría que volverla de cliente, y ahí
  // `editar(c.id)` cruza la frontera: el React #419 que deja la pantalla en blanco en producción y
  // compila sin una queja. Con un parámetro, «uno a la vez» sale gratis.
  const src = codigoPagina()
  assert.match(src, /accContacto/)
  assert.match(src, /accDoc/)
  const contactos = sinComentarios(fuente('BloqueContactos.tsx'))
  assert.match(contactos, /menu=\{menuAbierto === c\.id\}/)
  assert.doesNotMatch(contactos, /'use client'/, 'la tabla de contactos se volvió de cliente')
})

test('el error de la FUENTE se muestra al lado de la acción, no en un toast', () => {
  const boton = sinComentarios(fuente('BotonDeFila.tsx'))
  assert.match(boton, /setError\(r\.error\)/, 'el error dejó de ser el de la base')
  assert.doesNotMatch(boton, /toast/i)
})

test('un contacto sin mail lo dice en ÁMBAR: sin mail no se le manda nada', () => {
  // Ni la invitación al portal ni el recordatorio de cobranza. Es la definición de `warn` del
  // sistema —dato faltante que bloquea—, no el gris de una ausencia inocua.
  const contactos = fuente('BloqueContactos.tsx')
  assert.match(contactos, /sin mail cargado/)
  assert.match(contactos, /text-warn" data-testid="contacto-sin-mail"/)
})

test('«Quitar el vínculo» aclara que el archivo sigue en Drive, al lado de la acción', () => {
  // Sin la aclaración, «quitar» sobre un contrato se lee como «destruir»: el que duda no lo
  // aprieta, y el índice se queda con vínculos viejos para siempre.
  const acciones = fuente('AccionesContacto.tsx')
  assert.match(acciones, /Quitar el vínculo/)
  assert.doesNotMatch(acciones, /label="Borrar el documento"/)
  const docs = fuente('BloqueDocumentos.tsx')
  assert.match(docs, /No borra el archivo: vive en Drive y sigue ahí\./)
})

// ── LA GRILLA DE LA FICHA ES LA DEL HANDOFF v4 ──────────────────────────────────────────────────
//
// Contrato: `design_handoff_crm_v4/pantallas/CRM · Clientes · una pantalla.dc.html`.
//
// ═══ EL DEFECTO QUE ATRAPAN ESTOS TESTS ═══
//
// La pasada visual del 05/09/2026 encontró, MIRANDO LA CAPTURA, que en la lista de obras el
// porcentaje de avance se superponía con el monto contratado: «94$246.149.261», con el % tapado.
//
// La causa era estructural: el avance vivía DENTRO de la celda de ESTADO, y todos sus hijos —el
// punto, la palabra, la barra de 70px y el número— tenían `flexShrink: 0`. Nada podía encogerse, así
// que a 390px la celda desbordaba sobre la columna de al lado. Se parcheó con `overflow:hidden`.
//
// LA SOLUCIÓN DEL HANDOFF ES OTRA, y es la que estos tests fijan: AVANCE es su propia pista de 90px
// (`dc.html:113`). Separada, no hay nada que pueda desbordar sobre el importe. El `overflow:hidden`
// se queda igual —defensa barata contra el próximo hijo que no se encoja—, pero ya no es lo que
// sostiene la fila.
//
// Son tests estructurales a propósito: no reemplazan a una captura —no pueden—, pero impiden que la
// separación se revierta sin que nadie se entere, que es donde este defecto se vuelve a colar.

test('Obras dibuja las cinco pistas del handoff, con AVANCE en su propia columna de 90px', () => {
  const src = codigoListas()
  assert.match(src, /minmax\(240px,1\.8fr\)_150px_90px_170px_28px/,
    'la grilla de Obras dejó de ser la del handoff v4')
  assert.match(src, /<RotuloCol derecha>Avance<\/RotuloCol>/)
  // El jefe de obra ocupaba el lugar de AVANCE. El handoff no lo trae: se lee en la obra.
  assert.doesNotMatch(src, /jefe_obra/, 'volvió la columna de jefe de obra donde va el avance')
})

test('el avance NO vuelve a meterse dentro de la celda de estado', () => {
  const src = readFileSync(join(DIR, 'ListasClienteV2.tsx'), 'utf8')
  // La celda ENTERA: sus atributos Y sus hijos. Recortarla en `{o.estado}` dejaba fuera justo lo
  // que hay que vigilar —lo que se dibuja DENTRO de la celda—, y el control no podía dar rojo.
  const desde = src.indexOf('data-testid="estado-obra-cliente"')
  const celda = src.slice(desde, src.indexOf('</span>', src.indexOf('{o.estado}', desde)))
  assert.ok(desde > 0 && celda.length > 0 && celda.length < 400, 'no se pudo aislar la celda de estado')
  assert.doesNotMatch(celda, /avance/,
    'el avance volvió a la celda de estado: a 390 px se superpone con el contratado')
  assert.match(celda, /overflow: 'hidden'/,
    'la celda de estado dejó de recortar')
})

test('el avance no se dibuja con una barra: el handoff pone el número y nada más', () => {
  // La barra de 70px era decoración con `flexShrink: 0` — lo único que de verdad desbordaba. Con
  // AVANCE en su propia pista no hay nada decorativo que esconder a 390 px.
  const src = codigoListas()
  assert.doesNotMatch(src, /width: 70/, 'volvió la barra de avance de 70 px')
  assert.doesNotMatch(src, /max-\[560px\]:hidden/, 'volvió el parche que escondía la barra')
})

test('Presupuestos dibuja las seis pistas del handoff, con REV. y MOTIVO / DESTINO', () => {
  const src = codigoListas()
  assert.match(src, /minmax\(210px,1\.8fr\)_170px_60px_160px_minmax\(150px,1fr\)_28px/,
    'la grilla de Presupuestos dejó de ser la del handoff v4')
  assert.match(src, /<RotuloCol derecha>Rev\.<\/RotuloCol>/)
  assert.match(src, /Motivo \/ destino/)
})

test('un presupuesto perdido no inventa el motivo que la base no guarda', () => {
  // `cotizacion_cascada` no tiene columna de motivo y `cotizacion_evento` tiene 0 filas (05/09/2026):
  // la única respuesta honesta es decir que falta, en apagado —la pérdida ya ocurrió, no bloquea—.
  // Adjudicada y sin convertir SÍ va en ámbar: ahí falta trabajo, no un dato.
  const src = codigoListas()
  assert.match(src, /'sin motivo cargado', color: V\.tenue/)
  assert.match(src, /'sin convertir todavía', color: V\.warn/)
  assert.match(src, /'convertida en obra', color: V\.apagado/)
})

test('Documentos es la tabla del handoff y no la `<table>` del canon viejo', () => {
  // Dos sistemas de tabla en la misma ficha —grilla v2 en Obras, `<table>` del `ds` en Documentos—
  // es parte de lo que se ve como «el diseño y la app no coinciden». Y una `<table>` no sabe decir
  // `minmax()`: la columna del nombre no crecía con la pantalla.
  const docs = sinComentarios(fuente('BloqueDocumentos.tsx'))
  assert.match(docs, /minmax\(250px,2fr\)_180px_150px_110px_28px/)
  assert.match(docs, /<RotuloCol>Archivo<\/RotuloCol>/)
  assert.match(docs, /<RotuloCol>Para qué sirve<\/RotuloCol>/)
  assert.match(docs, /<RotuloCol>Lo colgó<\/RotuloCol>/)
  assert.match(docs, /<RotuloCol derecha>Modificado<\/RotuloCol>/)
  assert.doesNotMatch(docs, /<Tabla |<THead>/, 'volvió la tabla del canon viejo')
})

test('Acceso al portal: el orden de columnas del handoff, y el estado dicho en su columna', () => {
  const acc = sinComentarios(fuente('accesos/TablaAccesos.tsx'))
  assert.match(acc, /minmax\(230px,1\.6fr\)_150px_120px_140px_150px_28px/)
  const orden = ['MAIL HABILITADO', 'OBRAS', 'QUÉ PUEDE', 'ESTADO', 'ÚLTIMO INGRESO']
    .map((r) => acc.indexOf(`>${r}<`))
  assert.ok(orden.every((i) => i > 0), 'falta alguno de los cinco rótulos del handoff')
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b), 'el orden de columnas no es el del handoff')
  // El estado se deducía de un avatar punteado y de una opacidad: ahora es una columna que lo dice.
  assert.match(acc, /'sin entrar', color: C\.warn/)
  assert.match(acc, /'revocado', color: C\.tenue/)
  assert.match(acc, /'activo', color: C\.pos/)
})

test('las tres acciones del acceso viven en el menú de 28px, no dibujadas en la fila', () => {
  const acc = sinComentarios(fuente('accesos/TablaAccesos.tsx'))
  assert.doesNotMatch(acc, /BotonIcono/, 'volvieron los tres botones dibujados en cada fila')
  assert.match(acc, /aria-expanded=\{abierto\}/)
  assert.match(acc, /acciones-acceso-abierto-/)
})

test('la columna de accesos declara el ancho que la tabla del handoff necesita', () => {
  // Con el mínimo anterior de 600px, entre 1500 y 1860px de viewport el panel de alta se quedaba al
  // lado y estrangulaba la tabla a ~620px contra los 958 que pide: las columnas se pisaban.
  assert.match(sinComentarios(fuente('accesos/AccesosPortal.tsx')), /minWidth: 'min\(958px, 100%\)'/)
})
