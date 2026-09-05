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

test('una obra sin cronograma no tiene 0 % de avance: la barra sólo sale con fracción real', () => {
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
