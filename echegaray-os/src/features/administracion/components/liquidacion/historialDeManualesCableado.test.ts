// EL PUNTO ÁMBAR TIENE QUE ESTAR CABLEADO EN CADA CELDA QUE LO DIBUJA.
//
// Defecto que atrapa: se agrega una celda con `<MarcaDeOrigen origen={…} />` sin decir QUÉ celda es, y ese punto
// vuelve a ser un título mudo mientras el de la columna de al lado ya es un log: el dueño ve dos puntos iguales que
// se comportan distinto. Es un test de código fuente a propósito: sin navegador (que corre la sesión principal) es lo
// único que impide que el cableado se pierda en silencio.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const leer = (rel: string) => readFileSync(join(AQUI, rel), 'utf8')

test('todo <MarcaDeOrigen> de una celda de Liquidación declara cuál es (celda=)', () => {
  for (const archivo of ['cuadro/CeldasBlancoNegro.tsx', 'cuadro/CeldasDelEspejo.tsx', 'CeldasDeLiquidacion.tsx']) {
    const usos = [...leer(archivo).matchAll(/<MarcaDeOrigen\b[^>]*>/g)].map((m) => m[0])
      // `Manual` es el atajo viejo sin celda (nadie lo usa); no es una celda de la tabla.
      .filter((u) => !u.includes('origen="manual"'))
    assert.ok(usos.length > 0, `${archivo}: no encontré usos`)
    for (const u of usos) assert.match(u, /celda=/, `${archivo}: ${u} no dice qué celda es`)
  }
})

test('las dos pantallas de Liquidación leen el log UNA vez y lo reparten por contexto', () => {
  for (const archivo of ['BloqueLiquidacion.tsx', 'solapas/quincena.tsx']) {
    const s = leer(archivo)
    assert.match(s, /leerHistorialDeLaQuincena\(supabase, quincena\)/, `${archivo}: no lee el historial`)
    assert.match(s, /<ProveedorDeHistorial lectura=/, `${archivo}: no envuelve la pantalla`)
    assert.match(s, /<\/ProveedorDeHistorial>/, `${archivo}: no cierra el proveedor`)
  }
})

test('el panel se cierra con Escape y clic afuera, es un botón con aria-expanded y no se corta con el scroll de la tabla', () => {
  const s = leer('HistorialDeManuales.tsx')
  assert.match(s, /<button[\s\S]*?type="button"/)
  assert.match(s, /aria-expanded=\{abierto\}/)
  assert.match(s, /e\.key !== 'Escape'/)
  assert.match(s, /addEventListener\('pointerdown'/)
  assert.match(s, /createPortal\(/, 'sin portal, el overflow de la celda lo corta')
  assert.match(s, /position: 'fixed'/)
})

test('con el log activo el punto NO conserva el title nativo (dos globos sobre el mismo punto)', () => {
  const s = leer('CeldasDeLiquidacion.tsx')
  assert.match(s, /title=\{conLog \? undefined :/)
})

test('la acción manda el sello de autor sólo si la base tiene la columna', () => {
  const s = readFileSync(join(AQUI, '../../services/liquidacionActions.ts'), 'utf8')
  assert.match(s, /if \(hayMarca\) Object\.assign\(cambios, selloDeAutor\(/)
  assert.match(s, /pedir\(`\$\{columna\}, formulas, escribio_en`\)/)
})

test('el cuadro de «Pagado en efectivo» es UNO: la celda manual no deja el title nativo que lo tapaba', () => {
  const todo = leer('cuadro/CeldasBlancoNegro.tsx')
  const desde = todo.indexOf('export function CeldaPagado')
  const s = todo.slice(desde, todo.indexOf('export function CeldaSaldo'))
  assert.ok(desde > 0 && s.length > 0, 'no encontré CeldaPagado')
  assert.equal([...s.matchAll(/title=\{l\.manual\[campo\] \? undefined : titulo\}/g)].length, 2, 'las dos ramas de CeldaPagado')
  assert.doesNotMatch(s, /<div data-testid=\{testid\} title=\{titulo\}[ >]/, 'quedó un title fijo sobre la celda de pagado')
})

test('el cuadro de pago en efectivo se abre por teclado y por toque, y explica qué es el punto', () => {
  const s = leer('HistorialDeManuales.tsx')
  assert.match(s, /onFocus=\{\(e\) => \{ if \(e\.currentTarget\.matches\(':focus-visible'\)\)/, 'foco con teclado abre')
  assert.match(s, /onClick=/, 'Enter o toque fijan el cuadro')
  assert.match(s, /reservaAbajo:\s*window\.matchMedia\(ES_TELEFONO\)\.matches \? ALTO_BARRA : 0/, 'la barra inferior del teléfono no lo tapa')
  assert.match(s, /reservaArriba: ALTO_CABECERA/, 'la cabecera de la app no lo tapa')
  assert.match(s, /preferirCostado: !window\.matchMedia\(ES_TELEFONO\)\.matches/, 'en PC se abre al costado')
  assert.match(leer('DetalleDePagoEnEfectivo.tsx'), /detalle\.leyendaDelPunto/, 'el punto amarillo se explica dentro del cuadro')
})

test('la celda de Pagado entrega persona, importe y cuenta al cuadro (sin eso el título sale vacío)', () => {
  for (const archivo of ['CeldasDeLiquidacion.tsx', 'cuadro/CeldasBlancoNegro.tsx']) {
    assert.match(leer(archivo), /persona: (nombre|fila\.nombre)/, `${archivo}: no pasa de quién es la celda`)
  }
  assert.match(leer('cuadro/CeldasDelEspejo.tsx'), /nombre=\{fila\.nombre\}/)
})

test('TODA celda con punto amarillo usa el mismo cuadro y el lenguaje nuevo (sin «valor previo», «registro» ni «log» a la vista)', () => {
  const s = leer('HistorialDeManuales.tsx')
  assert.doesNotMatch(s, /CuerpoDelHistorial|EntradaDeHistorial/, 'quedó el cuerpo genérico viejo')
  assert.match(s, /campo: celda\.campo/, 'el título sale de la celda que es')
  const texto = leer('DetalleDePagoEnEfectivo.tsx') + readFileSync(join(AQUI, '../../services/detalleDePagoEnEfectivo.ts'), 'utf8')
  const visibles = [...texto.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]).join('\n')
  assert.doesNotMatch(visibles, /valor previo|anterior al registro|según el registro|\bal log\b/i)
})

test('en el teléfono el área táctil del punto no se extiende hacia los costados (llegaba bajo «Pagar»)', () => {
  const s = leer('HistorialDeManuales.tsx')
  assert.match(s, /max-md:-mx-1 max-md:-my-3 max-md:px-1 max-md:py-3/)
  assert.doesNotMatch(s, /max-md:-m-2\.5|max-md:p-2\.5/, 'volvió el área táctil de 10 px por lado')
})

test('las celdas con punto entregan quién, cuánto y cuenta (el título del cuadro depende de eso)', () => {
  for (const archivo of ['cuadro/CeldasBlancoNegro.tsx', 'cuadro/PanelDeLaPersona.tsx', 'cuadro/CeldasDelEspejo.tsx']) {
    const usos = [...leer(archivo).matchAll(/celda=\{\{[^}]*\}\}/g)].map((m) => m[0])
    assert.ok(usos.length > 0, archivo)
    for (const u of usos) assert.match(u, /persona:/, `${archivo}: ${u} no dice de quién es`)
  }
})

// LA NOTA EDITABLE (dueño, 02/10/2026: «en el lugar que dice "nota" … si le hago click dejame escribir una nota»).
test('el «Sin nota» de cada renglón es un botón que abre el campo, y el cuadro le pasa con qué avisar que se escribe', () => {
  const d = leer('DetalleDePagoEnEfectivo.tsx')
  assert.match(d, /<SinNota n=\{n\}/, 'el lugar de «Sin nota» es el que se toca')
  assert.match(d, /<LineaDeNota n=\{n\} boton=\{boton\} \/>/)
  assert.doesNotMatch(d, /<span className="flex-none text-\[11px\] text-faint">Sin nota<\/span>/, 'volvió el «Sin nota» mudo')
  const n = leer('NotaDeAnotacion.tsx')
  assert.match(n, /<button[\s\S]*?type="button"[\s\S]*?onClick=\{n\.abrir\}/, 'botón nativo: Enter y Espacio lo abren')
  assert.match(n, /maxLength=\{LARGO_MAXIMO_DE_NOTA\}/)
  assert.match(n, /onBlur=\{\(\) => void n\.guardar\(\)\}/, 'salir del campo guarda')
  assert.match(n, /e\.key === 'Enter'/)
  assert.match(n, /e\.key === 'Escape'\) \{\s+\/\/[^\n]*\n\s+e\.preventDefault\(\)/, 'Escape cancela sin cerrar el cuadro')
  assert.match(n, /role="status"/, 'guardar, no cambiar o fallar dicen algo')
  assert.match(n, /'Sin cambios'/)
  assert.match(n, /max-md:-my-3\.5 max-md:py-3\.5/, '44 px de área táctil en el teléfono')
  assert.match(n, /max-md:h-11/)
})

test('mientras se escribe el cuadro no se cierra por clic afuera, por Escape del campo ni por perder el hover', () => {
  const s = leer('HistorialDeManuales.tsx')
  assert.match(s, /panel\.current\?\.contains\(t\) \|\| editando\.current\) return/)
  assert.match(s, /e\.key !== 'Escape' \|\| e\.defaultPrevented/)
  assert.match(s, /editando\.current = si; if \(si\) setFijo\(true\)/)
  assert.match(s, /<DetalleDePagoEnEfectivo detalle=\{detalle\} alEditar=\{alEditar\} \/>/)
})

test('la acción de la nota valida con zod y pregunta el permiso en el servidor antes de llamar a la base', () => {
  const s = readFileSync(join(AQUI, '../../services/notaDeAnotacionActions.ts'), 'utf8')
  assert.match(s, /^'use server'/)
  const valida = s.indexOf('pedidoDeNota.safeParse(entrada)')
  const permiso = s.indexOf('permisoDeLiquidacion(perfil?.rol, errPerfil)')
  const rpc = s.indexOf(".rpc('liquidacion_nota_guardar'")
  assert.ok(valida > 0 && permiso > valida && rpc > permiso, 'orden: validar, permiso, base')
  assert.match(s, /faltaLaMigracion\(error\) \? MENSAJE_SIN_MIGRACION/, 'sin la migración avisa, no rompe')
})
