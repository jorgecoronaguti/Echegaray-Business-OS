import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { SIN_PRECIO_EN_OBRAS } from '../services/economiaObras.ts'

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
  // 08/09/2026: el contratado pasó a leerse de la pestaña OBRAS (`obra_economia_cartera`), así que
  // la ausencia dejó de ser «sin monto cargado» y pasó a decir DÓNDE falta el dato. El literal se
  // afirma por la constante y no copiado: mientras vivió escrito dos veces —acá y en el servicio—
  // cambiarlo en un lado dejaba la otra copia sin corregir, que es como este test se puso rojo.
  assert.match(codigoPagina(), /falta: enCurso\.length \? SIN_PRECIO_EN_OBRAS : 'sin trabajo en curso'/)
  assert.ok(SIN_PRECIO_EN_OBRAS.length > 0, 'el servicio dejó de exportar la frase de la ausencia')
  // Y NADIE LA VUELVE A ESCRIBIR A MANO: dos copias del mismo literal es cómo nace una que no
  // recibe la corrección de la otra.
  assert.doesNotMatch(codigoPagina(), new RegExp(`'${SIN_PRECIO_EN_OBRAS}'`))
  assert.doesNotMatch(codigoListas(), new RegExp(`'${SIN_PRECIO_EN_OBRAS}'`))
  // LO QUE NO PUEDE VOLVER: publicar un cero por una ausencia. La cifra sólo se dibuja con número.
  assert.match(codigoPagina(), /valor: contratadoEnCurso !== null \? money\(contratadoEnCurso\) : null/)
  // Y LA CIFRA SALE DE LA MISMA REGLA QUE LA CARTERA (auditor, 11/09/2026). Hasta hoy leía
  // `cliente_economia.contratado_en_curso`, que sólo conoce el precio de OBRAS, y publicaba
  // $ 95,3 M de Quattropani mientras la lista decía $ 139,4 M (con los materiales del contrato).
  // La regla es UNA función —`baseContractualDe`, sobre `obra_economia_cartera`— y las dos
  // pantallas la llaman; una suma escrita a mano acá sería la cuarta definición que ya se pagó.
  assert.match(codigoPagina(), /basesEnCurso = enCurso\.map\(\(o\) => baseContractualDe\(economia\?\.get\(o\.obra_id\)\)\)/)
  // O suma completa o nada: con un trabajo sin base, la ficha dice «sin precio», igual que la lista.
  assert.match(codigoPagina(), /basesEnCurso\.every\(\(v\): v is number => v !== null\)/)
  // Y la tabla de Trabajos compara NETO con neto y publica el avance, no el total con IVA.
  assert.match(codigoListas(), /cobrado\.por\.get\(o\.obra_id\)\?\.neto != null/)
  assert.match(codigoListas(), />Cobrado neto</)
  assert.doesNotMatch(codigoPagina(), /economiaCliente\?\.contratado_en_curso/)
  assert.match(codigoListas(), /const contratado = baseContractualDe\(e\)/)
  // EL RESPALDO AL CAMPO DEL FORMULARIO NO VUELVE: era la otra definición.
  assert.doesNotMatch(codigoPagina(), /monto_contratado/)
  assert.doesNotMatch(codigoListas(), /o\.monto_contratado/)
})

// ═══ EL AVANCE FÍSICO SALIÓ DE LA FICHA DEL CLIENTE (dueño, 10/09/2026 17:15) ═══
//
// «Administración es un CRM y Obra un ERP: no mezcles cosas con obras.» Cuánto lleva ejecutado un
// trabajo se mide contra el cronograma y se decide con el jefe de obra: es la pregunta del ERP. En
// su pista va lo COBRADO, que es la relación con el cliente y lo que esta ficha no tenía.

test('la ficha no dibuja el avance de obra, y en su lugar publica lo cobrado', () => {
  const src = codigoListas()
  assert.doesNotMatch(src, /avance_pct|avanceDeObra|'sin cronograma'/,
    'el avance volvió al CRM: se mide contra el plan, y el plan vive en el ERP')
  // NETO CONTRA NETO (auditor final, 11/09/2026): el contrato de al lado es neto; el cobro también.
  assert.match(src, /<RotuloCol derecha>Cobrado neto<\/RotuloCol>/)
  // VACÍO NO ES CERO: mientras Cobranzas anote el cobro contra el cliente, la celda calla.
  assert.match(src, /cobrado\?\.disponible && cobrado\.por\.get\(o\.obra_id\)\?\.neto != null/)
})

test('el trabajo se abre en el CRM y el ERP no se repite debajo de cada fila', () => {
  const src = codigoListas()
  assert.match(src, /href=\{hrefTrabajo \? hrefTrabajo\(o\.obra_id\) : `\/obras\/\$\{o\.obra_id\}`\}/)
  // El enlace al ERP colgaba de CADA trabajo y nombraba el módulo del que hay que separarse en toda
  // la pantalla (dueño, 10/09/2026 18:12). Existe UNA vez: dentro del detalle del trabajo.
  assert.doesNotMatch(src, /Ver en Obras →/)
  // Y la página tiene que pasarle el destino: sin eso la fila cae al ERP por el respaldo.
  assert.match(codigoPagina(), /hrefTrabajo=\{hrefTrabajo\}/)
  assert.match(codigoPagina(), /const hrefTrabajo = \(obraId: string\) => url\(\{ trabajo: obraId \}\)/)
})

test('el detalle del trabajo se lee sólo si es de ESTE cliente', () => {
  // Una URL tipeada a mano no puede pedir los papeles de la obra de otro. No es la cerradura —la
  // RLS decide— es no hacerle la pregunta.
  assert.match(codigoPagina(), /todas\.some\(\(o\) => o\.obra_id === q\.trabajo\)/)
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

test('el resumen del portal no se afirma cuando no se leyó, y tampoco pone un placeholder', () => {
  // Decía «Se lee al abrir la cara», que le explica al dueño una decisión interna del renderizado
  // justo donde esperaba un dato (10/09/2026 18:10). Ahora, fuera de esa cara, no se escribe nada:
  // el verbo «Gestionar accesos →» es la puerta, y no afirma ningún número.
  const src = codigoPagina()
  assert.match(src, /\{solapa === 'accesos' && \(/)
  assert.doesNotMatch(src, /Se lee al abrir la cara/)
  assert.match(src, /Gestionar accesos →/)
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

test('la acción de fila viaja ATADA, nunca envuelta en una arrow', () => {
  // ═══ EL DEFECTO QUE ATRAPA, MEDIDO EN LA APP VIVA EL 05/09/2026 ═══
  //
  // Con `ejecutar={() => borrar(contactoId)}` abrir el `···` de un contacto —o de un documento—
  // cambiaba la ficha entera por la pantalla de error: «Functions cannot be passed directly to
  // Client Components unless you explicitly expose it by marking it with "use server"». `BotonDeFila`
  // es de cliente y la arrow se crea en un componente de servidor: no se puede serializar.
  //
  // Probado por mutación contra el servidor corriendo: con la arrow, el botón «Quitar el vínculo» no
  // existe en la página (0 nodos) porque la página es el error; con `.bind`, existe (1).
  //
  // Compila, pasa el lint y pasa el `build`. Sólo se ve abriendo el menú.
  const acciones = sinComentarios(fuente('AccionesContacto.tsx'))
  assert.doesNotMatch(acciones, /ejecutar=\{\s*\(\)\s*=>/,
    'la acción volvió a cruzar la frontera como arrow: la ficha se cae al abrir el menú')
  assert.match(acciones, /ejecutar=\{borrar\.bind\(null, contactoId\)\}/)
  assert.match(acciones, /ejecutar=\{desvincular\.bind\(null, driveFileId\)\}/)
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

// 08/09/2026 — LA GRILLA DE OBRAS DEJA DE SER UNA SOLA. Decisión del dueño: «en la pestaña OBRAS
// del Sheet están los montos contratados y el costeo de mano de obra y materiales; agregarlos en
// Clientes». Entran Costo MO · Costo mat. · Margen, y con ocho columnas la plantilla única del
// handoff v4 ya no existe: se dibujan tres anchos.
//
//   sin corte  las ocho columnas. Es la plantilla del ancho entero Y la que corre cuando ninguna
//              media query alcanza (ver abajo).
//   ≤1199px    sale la economía de OBRAS. Es DETALLE: se suelta antes que la identidad y antes que
//              el contratado, nunca al revés.
//   ≤559px     queda OBRA · ESTADO · CONTRATADO — la pregunta de un teléfono, y el nombre nunca se
//              suelta. AVANCE conserva su pista propia hasta ahí (el defecto del 05/09: vivía
//              dentro de ESTADO y a 390px se superponía con el importe).
//
// LO QUE ESTE TEST VIGILA DE VERDAD no son las cadenas: es que cada ancho tenga TANTAS CELDAS COMO
// PISTAS. Una celda de más cae en una fila implícita y desalinea la tabla entera —el mismo defecto
// que `grilla-v2-en-telefono` persigue en la cartera—, y agregar una columna sin su celda escondida
// es exactamente cómo se cuela.
//
// 09/09/2026 — Y LA PLANTILLA SIN PREFIJO TIENE QUE SER LA ENTERA. La grilla estaba escrita
// mobile-first: sin prefijo declaraba TRES pistas contra ocho celdas, y los anchos los agregaban
// dos variantes `min` de ancho (escritas acá sin sus corchetes a propósito: ver
// `cortes-por-ancho-llegan-al-css.test.ts`). Mientras los cortes por ancho no llegaron al CSS emitido
// (`cortes-por-ancho-llegan-al-css.test.ts`), esa plantilla de tres pistas fue la que corrió a
// 1440px en producción: cinco celdas en filas implícitas, dibujadas encima de la fila siguiente
// porque el encabezado y la fila llevan alto fijo. Escrita de ancho entero hacia abajo, el peor
// caso de una media query que no llega es una tabla apretada, no una tabla superpuesta.

/** Las plantillas declaradas en `COLS_OBRAS`, por corte (`''` = la base, sin prefijo). */
function plantillasDeObras(): Map<string, string[]> {
  const bloque = codigoListas().slice(codigoListas().indexOf('const COLS_OBRAS'))
  const m = new Map<string, string[]>()
  for (const [, prefijo, cuerpo] of bloque.slice(0, bloque.indexOf('\n\n')).matchAll(
    /((?:min|max)-\[(?:\d+)px\]:)?grid-cols-\[([^\]]+)\]/g,
  )) {
    m.set(prefijo ?? '', cuerpo.split('_'))
  }
  return m
}

/** Los hijos DIRECTOS del encabezado de Obras: una celda por columna, en el orden en que se dibujan. */
function celdasDelEncabezado(): string[] {
  const src = codigoListas()
  // «Trabajo» desde el 10/09/2026: el CRM lista lo que el cliente encargó, no la unidad de
  // ejecución del ERP.
  const desde = src.indexOf('<RotuloCol>Trabajo</RotuloCol>')
  assert.ok(desde > 0, 'no se pudo encontrar el encabezado de Trabajos')
  const hasta = src.indexOf('</div>', desde)
  return src.slice(desde, hasta).split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('<RotuloCol') || l.startsWith('<span'))
}

test('Obras dibuja sus tres anchos, y cada ancho tiene tantas celdas como pistas', () => {
  const plantillas = plantillasDeObras()
  assert.deepEqual(
    [...plantillas.keys()].sort(),
    ['', 'max-[1199px]:', 'max-[559px]:'],
    'la grilla de Obras dejó de declarar sus tres anchos, o volvió a escribirse mobile-first',
  )
  const pistas = (corte: string) => (plantillas.get(corte) ?? []).length

  const celdas = celdasDelEncabezado()
  const escondidas = (clase: string) => celdas.filter((c) => c.includes(clase)).length

  // LA PLANTILLA SIN PREFIJO ES LA QUE CORRE CUANDO NINGUNA MEDIA QUERY LLEGA: tiene que poder
  // dibujar TODAS las celdas. Con menos pistas que celdas, las sobrantes caen en filas implícitas
  // y se superponen con la fila de abajo (09/09/2026, medido en producción a 1440px).
  assert.equal(celdas.length, pistas(''),
    'el encabezado de Obras no dibuja una celda por cada pista del ancho entero')
  assert.equal(celdas.length - escondidas('SOLO_ANCHO_ECO'), pistas('max-[1199px]:'),
    'las celdas que sobreviven a 1199px no son las pistas declaradas para ese ancho')
  assert.equal(
    celdas.length - escondidas('SOLO_ANCHO_ECO') - escondidas('SOLO_ANCHO}') - escondidas('SOLO_ANCHO`'),
    pistas('max-[559px]:'),
    'las celdas que sobreviven en el teléfono no son las pistas declaradas para el teléfono',
  )
})

test('en el teléfono sobreviven la OBRA y el CONTRATADO; lo que se suelta es el detalle', () => {
  const src = codigoListas()
  // AVANCE tiene pista propia desde 560 — nunca vuelve adentro de ESTADO — y la economía de OBRAS
  // sólo aparece con ancho de escritorio.
  assert.match(src, /<RotuloCol derecha>Cobrado neto<\/RotuloCol>/)
  // ═══ COSTO MO Y COSTO MAT. SALIERON DE ESTA TABLA (10/09/2026, DISENO-FICHA-CLIENTE-v3 §3.1) ═══
  //
  // Este archivo ya declaraba que la ficha del cliente es la cara COMERCIAL de la relación y que el
  // costo vive en la obra; con las dos columnas de costo puestas no había ancho para las dos que
  // contestan la pregunta comercial —con qué papel nos lo encargó (OC) y qué ordenó pagar (OP)—.
  // Si alguien las devuelve, este caso lo dice.
  for (const rotulo of ['Costo MO', 'Costo mat.']) {
    assert.ok(!src.includes(`>${rotulo}<`), `«${rotulo}» es COSTO: vive en la obra, no en el cliente`)
  }
  // ═══ Y MARGEN TAMPOCO (dueño, 10/09/2026: «quitá esa columna Margen, no es útil») ═══
  //
  // Se retiró de `/clientes` a las 15:33 y de acá en el mismo día: es el MISMO concepto sobre los
  // mismos números, y dejarlo en una sola de las dos pantallas del módulo Clientes es volver a
  // tener dos verdades del mismo cliente — que es el defecto que `CarteraHome` ya costó una vez.
  // El margen de una obra vive en `features/obras` (`obra_economia`, `planVsReal`), medido contra
  // el costo REAL y no contra un contratado que en cuatro de las cinco obras de Messina es la suma
  // viva de Cobranzas.
  assert.ok(!src.includes('>Margen<'), 'el rótulo Margen volvió a la ficha del cliente')
  // ═══ Y LOS NÚMEROS DE LAS OC ESTÁN, DEBAJO DEL NOMBRE (dueño, 10/09/2026 16:20) ═══
  // «Adentro de cada cliente también». Mismo componente que la lista de `/clientes`: dos rótulos
  // parecidos del mismo papel se separan en cuanto uno aprende algo — ya pasó con las dos tablas
  // de cartera que decían distinto del mismo cliente.
  assert.match(src, /<OrdenesDeLaObra ordenes=\{papelesDeLaObra\?\.oc \?\? \[\]\}/)
  assert.doesNotMatch(src, /margen-obra-cliente|margenPct|pctTexto|margenDeLaFila/)
  // ═══ LAS COLUMNAS «OC c/IVA» Y «OP c/IVA» SE FUERON DE ESTA TABLA (dueño, 11/09/2026 18:42) ═══
  //
  // «Esas columnas OC/OP quitarlas de todo el CRM porque deben estar en la sección Órdenes, que
  // tiene que ser órdenes de compra y de pago.» Los importes no se borraron: se leen enteros en esa
  // solapa, con tipo, número, fecha, importe y obra. Lo que se fue es el TOTAL repetido en una celda
  // de 140px, y en su lugar va el acumulado de HH. Los NÚMEROS de las OC siguen pegados al nombre
  // (arriba), que es lo que el dueño pidió el 10/09 y volvió a pedir el 11/09 18:45.
  for (const rotulo of ['OC c/IVA', 'OP c/IVA']) {
    assert.ok(!src.includes(`>${rotulo}<`),
      `«${rotulo}» volvió a la tabla de trabajos: su casa es la solapa Órdenes de compra y de pago`)
  }
  assert.doesNotMatch(src, /data-testid="oc-obra-cliente"|data-testid="op-obra-cliente"/,
    'volvieron las celdas con el total de OC/OP en la fila de la obra')
  assert.doesNotMatch(src, /TotalDePapeles/,
    'el total de papeles se dibuja en la solapa Órdenes; acá repetía la mitad de cada papel')
  // Ni Obra ni Contratado llevan clase de escondido: son las dos que no se negocian.
  const celdas = celdasDelEncabezado()
  for (const fija of ['Trabajo', 'Contratado']) {
    const celda = celdas.find((c) => c.includes(`>${fija}<`))
    assert.ok(celda, `el encabezado dejó de tener la columna ${fija}`)
    assert.doesNotMatch(celda, /SOLO_ANCHO/, `${fija} se soltó en el teléfono: la fila deja de decir qué y por cuánto`)
  }
  // El jefe de obra ocupaba el lugar donde hoy va COBRADO. No vuelve: se lee en la obra.
  assert.doesNotMatch(src, /jefe_obra/, 'volvió la columna de jefe de obra donde va el avance')
})

test('el avance NO vuelve a meterse dentro de la celda de estado', () => {
  const src = readFileSync(join(DIR, 'ListasClienteV2.tsx'), 'utf8')
  // La celda ENTERA: sus atributos Y sus hijos. Recortarla en el estado dejaba fuera justo lo
  // que hay que vigilar —lo que se dibuja DENTRO de la celda—, y el control no podía dar rojo.
  const desde = src.indexOf('data-testid="estado-obra-cliente"')
  const celda = src.slice(desde, src.indexOf('</span>', src.indexOf('PALABRA_ESTADO[o.estado]', desde)))
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
  // Las pistas del handoff, con `minmax(0,…)` para que cedan en vez de desbordar la columna de la
  // ficha, y SIN prefijo: es la plantilla que corre cuando ninguna media query llega, y tiene que
  // poder dibujar las seis celdas (mismo defecto que arrastraba Obras — 09/09/2026).
  assert.match(
    src,
    /\n {2}= 'gap-\[28px\] grid-cols-\[minmax\(210px,1\.8fr\)_minmax\(0,170px\)_minmax\(0,60px\)_minmax\(0,160px\)_minmax\(150px,1fr\)_minmax\(0,28px\)\]'/,
    'la grilla de Presupuestos dejó de ser la del handoff v4, o volvió a escribirse mobile-first')
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
  assert.match(docs, /<RotuloCol>Modificado<\/RotuloCol>/)
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

// ═══ LA COLUMNA DEL IMPORTE NO CAMBIA DE PREGUNTA SEGÚN QUIÉN MIRE (06/09/2026) ═══
//
// Defecto que atrapa: la ficha contestaba con la ETAPA de la obra en el lugar del CONTRATADO cuando
// `veEconomia` era false, y mutaba el rótulo a «Etapa». Dos tablas distintas con el mismo nombre.
// El handoff decide que el rótulo es fijo (`dc.html:112`) y la celda dice `sin permiso`.
test('la columna del importe se llama siempre CONTRATADO: el rótulo no muta con el permiso', () => {
  const src = codigoListas()
  assert.match(src, /<RotuloCol derecha>Contratado<\/RotuloCol>/,
    'el rótulo del importe dejó de ser el del handoff')
  assert.doesNotMatch(src, /veEconomia \? 'Contratado'/,
    'el rótulo volvió a mutar: la misma columna se llama distinto según quién mire')
  assert.doesNotMatch(src, /ETAPA_LABEL/,
    'volvió la etapa de la obra a la columna del importe')
})

test('sin permiso económico la celda del importe dice el literal del zip, y NADA más', () => {
  const src = readFileSync(join(DIR, 'ListasClienteV2.tsx'), 'utf8')
  // La rama ENTERA del ternario, no una línea suelta: lo que hay que vigilar es qué se dibuja
  // adentro. Recortarla en el literal dejaría el control incapaz de ver un monto filtrado al lado.
  const desde = src.indexOf('{veEconomia')
  const cierre = src.indexOf('data-testid="contratado-sin-permiso"', desde)
  const ramaSinPermiso = src.slice(cierre, src.indexOf('</span>', cierre))
  assert.ok(desde > 0 && cierre > desde && ramaSinPermiso.length > 0 && ramaSinPermiso.length < 400,
    'no se pudo aislar la rama sin permiso de la celda del importe')
  assert.match(ramaSinPermiso, /sin permiso/,
    'la celda cerrada dejó de usar el literal del handoff')
  // ESTO CAMBIA LA PALABRA, NO EL PERMISO. Quien no ve economía no puede ver el número por ningún
  // camino: ni el monto, ni un derivado, ni la etapa que lo reemplazaba. El corte de verdad es el
  // GRANT por columna sobre `obra_canonica.monto_contratado`, que mide
  // `orquestador/lib/columnas-comerciales-cerradas.test.mjs` contra el catálogo de Postgres.
  for (const filtrado of ['monto_contratado', 'plata(', 'o.etapa']) {
    assert.ok(!ramaSinPermiso.includes(filtrado),
      `la rama sin permiso dibuja \`${filtrado}\`: se rebajó el filtro, no se cambió la palabra`)
  }
})

// ═══ MOVER UNA FILA DE GRUPO NO PUEDE CAMBIAR UNA CIFRA DE PLATA (11/09/2026) ═══
//
// EL DEFECTO QUE ATRAPA, medido en el navegador: cuando el adicional pasó a viajar al grupo de su
// obra mayor, «BSA - Adicional» —cerrada y sin precio— entró al grupo «en curso» de Messina y la
// regla de «o suma completa o nada» volvió `null` el CONTRATADO EN CURSO: la cifra pasó de
// $ 159.758.209 a «sin precio en OBRAS» sin que ninguna obra hubiera cambiado de precio.
//
// La separación es la que arregla eso: `enCursoConAdicionales` es el GRUPO que se dibuja y `enCurso`
// el universo ECONÓMICO que se suma. Si alguien vuelve a sumar el grupo, esto se pone rojo.
test('la cifra del cliente suma las obras EN EJECUCIÓN, no el grupo que se dibuja', () => {
  const src = codigoPagina()
  assert.match(src, /const enCurso = todas\.filter\(\(o\) => o\.estado === 'activa'\)/,
    'el universo económico dejó de ser «las obras activas»')
  assert.match(src, /obras=\{enCursoConAdicionales\}/,
    'la tabla dejó de recibir el grupo con los adicionales, o el grupo volvió a ser el que se suma')
  assert.match(src, /basesEnCurso = enCurso\.map\(\(o\) => baseContractualDe\(economia\?\.get\(o\.obra_id\)\)\)/)
})

// ═══ LA CARA DOCUMENTOS ES UNA JERARQUÍA, NO CINCO BLOQUES (dueño, 11/09/2026 17:50) ═══
//
// «El CRM dice documentos de drive (0) y está pésimo eso, arreglar» · «no se entiende nada realmente
// la UX de esa sección documentos». Eran cinco bloques de primer nivel con el mismo peso visual y el
// mismo PDF podía estar en tres. Lo que estos dos tests atrapan es la vuelta atrás: que el rótulo
// «Documentos de Drive · N» —el que decía 0 con 226 archivos abajo— vuelva a escribirse, y que el
// número de la solapa vuelva a contar una cosa distinta de la que se dibuja.
test('la cara Documentos no vuelve a escribir «Documentos de Drive»', () => {
  const src = codigoPagina()
  assert.doesNotMatch(src, /Documentos de Drive/,
    'volvió el rótulo que publicaba un conteo que no era el de lo que se ve')
  assert.doesNotMatch(src, /<PapelesPorTipo/,
    'los papeles del OS volvieron a su propio bloque: van ADENTRO de la obra a la que pertenecen')
  assert.doesNotMatch(src, /<ArchivosDeDrive/,
    'volvió el índice completo de la carpeta del cliente como bloque de primer nivel')
  assert.match(src, /<CaraDeDocumentos/)
})

test('el N de la solapa es lo que se dibuja adentro, no un conteo aparte', () => {
  const src = codigoPagina()
  assert.match(src, /documentos: ficha\.nDocumentos/,
    'el contador de la solapa dejó de salir de la RPC, que lo cuenta sobre las mismas cuatro fuentes')
  assert.doesNotMatch(src, /ficha\.nDocumentos \+ nPapeles/,
    'volvió la suma que contaba dos veces los papeles con PDF y ninguna vez los de las obras')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// INICIO Y HH — LAS DOS COLUMNAS QUE EL CRM NO TENÍA (dueño, 11/09/2026)
//
// «Necesito saber las hs que se van sumando en cada obra dentro de cada cliente» · «no tengo idea de
// cuándo empezó cada obra en el CRM, no sé cuánto llevan hs totales, un desastre» · «el acumulado HH
// por cliente por obra, lo quiero exhibido en una columna al lado de OC/OP».
//
// LO QUE ESTOS CASOS VIGILAN, Y NO PUEDEN VIGILAR `horasDeObra.test.ts` NI LA CAPTURA: que las
// celdas sigan DELEGANDO en ese módulo. El día que alguien escriba el formato adentro de la celda
// —un `toLocaleString` ahí mismo, un `?? 0`—, los tests del módulo seguirían verdes y la pantalla
// publicaría un cero por una ausencia.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('la tabla de trabajos dibuja INICIO y HH, y cada una se suelta con su pista', () => {
  const celdas = celdasDelEncabezado()
  const i = celdas.findIndex((c) => c.includes('>Inicio<'))
  const h = celdas.findIndex((c) => c.includes('>HH<'))
  assert.ok(i > 0, 'se fue la columna Inicio: el CRM no puede decir cuándo arrancó el trabajo')
  assert.ok(h > 0, 'se fue la columna HH: es lo que el dueño pidió ver')
  // EL ORDEN QUE PIDIÓ EL DUEÑO: el inicio detrás del estado —qué, cómo va, desde cuándo— y las HH
  // EN EL LUGAR DE LAS OC, a la derecha del contratado.
  assert.ok(celdas.findIndex((c) => c.includes('>Estado<')) < i, 'Inicio va detrás del estado')
  assert.ok(celdas.findIndex((c) => c.includes('>Contratado<')) < h,
    'las HH van donde estaban las OC: a la derecha del contratado')
  // INICIO se suelta a 1199 con su pista; HH sobrevive hasta el teléfono, donde se va con el resto.
  assert.match(celdas[i], /SOLO_ANCHO_ECO/, 'Inicio tiene que esconderse donde desaparece su pista')
  assert.match(celdas[h], /SOLO_ANCHO}/, 'HH se suelta sólo en el teléfono, con el cobrado')
})

test('las dos celdas nuevas no formatean nada por su cuenta: delegan en horasDeObra', () => {
  const src = codigoListas()
  const celda = (testid: string) => {
    const desde = src.indexOf(`data-testid="${testid}"`)
    assert.ok(desde > 0, `no está la celda ${testid}`)
    return src.slice(desde, src.indexOf('</span>', desde))
  }
  const hh = celda('hh-obra-cliente')
  assert.match(hh, /textoHH\(hhDeLaObra\)/, 'la celda de HH dejó de leer el texto de su módulo')
  assert.match(hh, /tituloHH\(hhDeLaObra\)/)
  // EL NÚMERO SALE DE LA OBRA DE LA FILA, NUNCA CONSOLIDADO: un adicional publica SUS horas y su
  // obra mayor no las suma — el jornal se cargó contra una sola de las dos y sumarlo haría que el
  // mismo día de trabajo apareciera dos veces en la misma tabla.
  assert.match(src, /const hhDeLaObra = horas\?\.get\(o\.obra_id\) \?\? null/)
  assert.doesNotMatch(hh, /consolidar/, 'las HH de un adicional no se suman a su obra mayor')
  for (const celdaNueva of [hh, celda('inicio-obra-cliente')]) {
    assert.doesNotMatch(celdaNueva, /toLocaleString|\?\? 0|Math\.round/,
      'el formato y los huecos los decide horasDeObra.ts, con sus tests')
  }
})

test('«no puedo leer las horas» se dibuja VACÍO, y «no tiene ninguna» se dibuja «—»', () => {
  // Son dos hechos opuestos y la única forma de confundirlos es dibujarlos igual. La RPC manda
  // `null` cuando la cara no las transporta o cuando el rol no las ve enteras (la RLS de
  // `registros_hh` le muestra SÓLO SUS horas: media suma parece una suma), y «—» lo escribe
  // `textoHH` cuando la base contestó que no hay ninguna.
  const src = codigoListas()
  for (const testid of ['hh-obra-cliente', 'inicio-obra-cliente']) {
    const desde = src.indexOf(`data-testid="${testid}"`)
    const celda = src.slice(desde, src.indexOf('</span>', desde))
    assert.match(celda, /horas === null \?/,
      `${testid} tiene que callar cuando no se pudieron leer, en vez de afirmar una ausencia`)
  }
})

test('el número de HH abre el desglose, y no es un <a> adentro del <a> de la fila', () => {
  const listas = codigoListas()
  assert.match(listas, /<CeldaHH/, 'la celda de HH dejó de poder abrir el desglose')
  // SIN COMENTARIOS: el archivo EXPLICA por qué no es un `<Link>`, y esa frase hacía que el control
  // se pusiera rojo contra su propia documentación.
  const celda = sinComentarios(readFileSync(join(DIR, 'CeldaHH.tsx'), 'utf8'))
  // UN `<a>` ADENTRO DE OTRO `<a>` ES HTML INVÁLIDO: el navegador desarma el anidado y la fila queda
  // con zonas que navegan a cualquier lado. Es la misma razón por la que `OrdenesDeLaObra` usa
  // `<button>`, y la que hace que este control tenga que cortar el evento.
  assert.doesNotMatch(celda, /<Link|<a\s/, 'la celda de HH volvió a ser un ancla dentro de la fila')
  assert.match(celda, /e\.preventDefault\(\); e\.stopPropagation\(\)/,
    'sin cortar el evento, tocar el número navega TAMBIÉN al detalle del trabajo')
  assert.match(celda, /if \(!href\)/, 'sin horas no puede haber puerta a una pantalla vacía')
})

test('las horas llegan a las dos tablas de la ficha: en curso y terminados', () => {
  const src = codigoPagina()
  assert.equal((src.match(/horas=\{ficha\.horasPorObra\}/g) ?? []).length, 2,
    'los trabajos terminados también llevan sus horas: son la historia de lo que costó cada uno')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// OC Y OP NO SE LEEN EN NINGUNA OTRA PARTE DEL CRM (dueño, 11/09/2026 18:42)
//
// «Esas columnas OC/OP quitarlas de TODO el CRM porque deben estar en la sección Órdenes, que tiene
// que ser órdenes de compra y de pago.» Ya no están en la tabla de trabajos (más arriba) ni en las
// cifras del titular, que era su tercer lugar: ahí quedaban al lado de un contratado NETO invitando
// a una resta que no significa nada, y eran una lectura MÁS de los mismos papeles.
//
// LO QUE ESTE PAR VIGILA es que el dato no se pierda al sacarlo: si el pie de la solapa se va, los
// dos totales no quedan en ninguna parte del CRM, que es peor que tenerlos repetidos.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('el titular de la ficha no publica los totales de OC ni de OP', () => {
  const src = codigoPagina()
  for (const rotulo of ['OC recibidas', 'OP recibidas']) {
    assert.ok(!src.includes(rotulo),
      `«${rotulo}» volvió a las cifras del titular: su casa es la solapa Órdenes de compra y de pago`)
  }
  // Y las dos que quedan son las que contestan «qué le vendimos»: ni conteos que ya viven en su
  // lugar (contactos, documentos) ni ventanas incompatibles (facturado/cobrado a 90 días).
  assert.match(src, /rotulo: 'Trabajos'/)
  assert.match(src, /rotulo: 'Contratado en curso'/)
})

test('los dos totales viven en la solapa Órdenes, sumados de lo que esa cara dibuja', () => {
  const src = sinComentarios(fuente('OrdenesDelCliente.tsx'))
  assert.match(src, /data-testid="total-ordenes-cliente"/,
    'sin el pie, los totales de OC y OP no quedan en ninguna parte del CRM')
  // LA MISMA FUNCIÓN QUE LOS ENCABEZADOS DE CADA GRUPO: con una suma propia, el total de abajo y
  // los parciales de arriba podrían decir distinto sobre los mismos papeles.
  assert.match(src, /resumen\(ordenes, 'oc', veEconomia\)/)
  assert.match(src, /resumen\(ordenes, 'op', veEconomia\)/)
})
