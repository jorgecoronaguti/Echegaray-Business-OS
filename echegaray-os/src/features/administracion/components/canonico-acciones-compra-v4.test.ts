// EL PIE DE ACCIONES DE UNA COMPRA, VERIFICADO CONTRA EL HANDOFF v4.
//
// `design_handoff_crm_v4/pantallas/Administración v4 · Pantallas.dc.html:274-277` y el README:
// «Acción primaria única: Vincular comprobante (amarillo, texto grafito). Secundaria en texto:
// Imputar a obra».
//
// Lo que se protege acá NO es el render: es la DECISIÓN de por qué una escribe y la otra no, que es
// la parte que un refactor bienintencionado rompe sin que nada falle hasta que el sync pisa el dato.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const leer = (p: string) => readFileSync(join(aqui, p), 'utf8')
/** Sin comentarios: un test que pasa por lo que dice un comentario no prueba el código. */
const codigo = (p: string) => leer(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const ACC = () => codigo('AccionesCompra.tsx')
const ACT = () => codigo('../services/comprasAdjuntoActions.ts')

test('la primaria tiene el par de color exacto del handoff, y no el ámbar de alerta', () => {
  const s = ACC()
  assert.match(s, /const AMARILLO = '#FDC900'/)
  assert.match(s, /const GRAFITO = '#30302F'/)
  // ATADO AL BOTÓN, NO AL ARCHIVO. Declarar las dos constantes y después pintar el botón de otro
  // color deja las constantes intactas y el test en verde: la primera versión de esta prueba se
  // conformaba con que los literales EXISTIERAN, y una mutación que cambiaba el `background` del
  // botón pasaba sin ponerse roja. Se busca el uso, dentro del bloque del botón.
  const boton = s.slice(s.indexOf('vincular-comprobante'), s.indexOf('Vincular comprobante</button>'))
  assert.match(boton, /background: AMARILLO, color: GRAFITO/)
  assert.match(boton, /height: 30, padding: '0 12px', borderRadius: 6/)
  // `#B54708` es el ámbar de «esto está incompleto». Usarlo en una acción diría que la acción es un
  // problema; y usar el amarillo de acción en una alerta diría que un problema es un botón.
  assert.equal(/#B54708/.test(boton), false, 'la primaria usa el ámbar de alerta')
  assert.match(s, /gap: 16/)
})

test('«Imputar a obra» es un ENLACE, nunca una escritura desde el panel', () => {
  // ═══ EL DEFECTO QUE ATRAPA — y es el caro ═══
  //
  // `compra_sheet` es un ESPEJO de la pestaña Compras: tiene `sincronizado_en` y el dueño la edita a
  // mano. Un `update` de `obra_texto` desde acá compila, devuelve 204 y se ve perfecto en pantalla…
  // hasta el próximo sync, que lo pisa. La pantalla habría afirmado que el gasto quedó imputado
  // cuando no quedó, que es peor que no ofrecer la acción.
  const s = ACC()
  assert.match(s, /<Link[\s\S]{0,200}imputar-a-obra/)
  assert.equal(/obra_texto/.test(s), false, 'el panel escribe la obra, que es un dato del Sheet')
  assert.equal(/from\('compra_sheet'\)|\.update\(/.test(s), false,
    'el panel escribe directo en la tabla espejo en vez de ir por la cola')
})

test('sin clave NO se dibuja el botón: no se ofrece lo que va a rebotar', () => {
  // `vincularAdjunto` exige clave. Medido el 05/09/2026: 236 de las 889 compras sin papel no la
  // tienen (sueldos, impuestos, anticipos). Un botón deshabilitado invita a hacer clic y no explica;
  // esto dice el hecho.
  const s = ACC()
  assert.match(s, /\{clave[\s\S]{0,1200}sin-clave-para-vincular/)
  assert.match(s, /if \(!clave\) return/, 'elegir() puede correr sin clave')
})

test('la búsqueda inversa mira SÓLO los sueltos', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Ofrecer un papel YA vinculado. Elegirlo lo movería de su compra a ésta, y la primera quedaría
  // sin respaldo sin que nadie se entere: un agujero que sólo aparece en una auditoría de IVA.
  const s = ACT()
  const fn = s.slice(s.indexOf('export async function buscarAdjuntosSueltos'))
  assert.match(fn, /\.is\('compra_clave', null\)/)
})

test('lo que se tipea no se convierte en parte de la consulta', () => {
  // `,()*%` son la sintaxis del `or` de PostgREST y su comodín. Es la misma defensa que ya tiene
  // `buscarCompras`, y tiene que estar en las DOS: una sola puerta cerrada no cierra nada.
  const s = ACT()
  const fn = s.slice(s.indexOf('export async function buscarAdjuntosSueltos'))
  assert.match(fn, /replace\(\/\[,\(\)\*%\]\/g, ' '\)/)
})

test('no se ordena por «parecido»: el orden es un hecho, no una corazonada', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Poner primero el candidato que «se parece» al proveedor o a la fecha. Un primer resultado se
  // lee como una recomendación, y el error que este flujo existe para evitar es exactamente colgar
  // el papel de la factura equivocada. Se ordena por el más reciente, que es un dato.
  const s = ACT()
  const fn = s.slice(s.indexOf('export async function buscarAdjuntosSueltos'))
  assert.match(fn, /\.order\('subido_at', \{ ascending: false/)
  assert.equal(/similarity|levenshtein|score|confianza/.test(fn), false,
    'la búsqueda inversa ordena por un parecido que no puede probar')
})

test('un error del servidor se muestra tal cual y no se traga', () => {
  // `vincularAdjunto` distingue «no tenés permiso» de «esa compra está duplicada»: son dos trabajos
  // distintos para quien lo lee. Un `catch` mudo los vuelve el mismo silencio.
  //
  // Y SE MIRA EN `elegir`, QUE ES EL QUE ESCRIBE. La primera versión buscaba la frase en el archivo
  // entero: hay tres llamadas que la usan (abrir, buscar y elegir), así que tragarse el error justo
  // en la ÚNICA que escribe dejaba las otras dos y el test en verde. La mutación que importa es la
  // que no se ponía roja.
  const s = ACC()
  const elegir = s.slice(s.indexOf('function elegir('), s.indexOf('return (\n    <div style={{ paddingTop: 14 }}'))
  assert.match(elegir, /if \(!r\.ok\) \{ setError\(r\.error\); return \}/)
  assert.match(s, /error-vincular-compra/)
})

test('cero resultados se dice, y con la palabra según por qué es cero', () => {
  // Sin esto, buscar y no ver nada se lee como «todavía está buscando» y la persona vuelve a
  // apretar. Y «no hay ninguno suelto» no es lo mismo que «ninguno se llama así».
  const s = ACC()
  assert.match(s, /opciones\?\.length === 0/)
  assert.match(s, /q \? 'Ningún comprobante suelto se llama así\.' : 'No hay ningún comprobante suelto esperando\.'/)
})

test('el bloque «sin papel» ya no manda a otra pantalla', () => {
  // Decía «se puede subir desde Cargar comprobante»: una instrucción en vez de una acción. El
  // handoff pone una acción ahí, y la acción está en el pie.
  const panel = codigo('PanelCompraSheet.tsx')
  assert.equal(/se puede subir desde/.test(panel), false)
  assert.match(panel, /<AccionesCompra clave=\{fila\.clave\} filaCompras=\{fila\.fila\}/)
})

test('cada candidato se puede ABRIR antes de colgarlo', () => {
  // ═══ EL DEFECTO QUE ATRAPA ═══
  //
  // Elegir a ciegas. Medido el 05/09/2026: de los 53 comprobantes sueltos, 7 se llaman
  // `rn_image_picker_lib_temp_<uuid>.jpg` o `image.png` —su nombre no dice nada— y los otros 46
  // tampoco prueban de qué compra son. Un flujo que obliga a decidir por el nombre produce
  // exactamente el error que existe para evitar: el papel colgado de la factura equivocada, que se
  // ve como respaldo y no lo es.
  //
  // `urlDelAdjunto` firma por 10 minutos contra un bucket privado. La cerradura la pone Postgres,
  // no el botón: si quien mira no es Administración, Storage le niega la firma.
  const s = ACC()
  assert.match(s, /urlDelAdjunto\(a\.id\)/)
  assert.match(s, /window\.open\(r\.dato, '_blank', 'noopener,noreferrer'\)/)
  // Y elegir es un acto APARTE de mirar: un solo botón que abriera y colgara a la vez colgaría el
  // papel antes de que nadie lo haya visto.
  assert.match(s, /ver-adjunto-\$\{a\.id\}/)
  assert.match(s, /elegir-adjunto-\$\{a\.id\}/)
})
