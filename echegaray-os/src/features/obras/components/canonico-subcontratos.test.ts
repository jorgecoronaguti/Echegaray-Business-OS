import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ EL CANÓNICO 10 (SUBCONTRATISTAS) Y EL 05 (REGISTRAR AVANCE), VERIFICADOS CONTRA EL FUENTE ═══
//
// Mismo método que `shared/components/ds/conformidad-visual.test.ts`: lo que se protege son
// DECISIONES ESCRITAS —qué columnas tiene la tabla, dónde vive la comparación, quién es dueño de la
// guarda de contenedor—, no un comportamiento de render. Montar React para leer un `className` o un
// `<Th>` que ya está literal en el archivo mete un runtime entero entre la afirmación y el hecho.
//
// LO QUE ESTE TEST NO PRUEBA: que la pantalla real se vea así, ni que el panel embebido funcione en
// el navegador. Eso es evidencia de otro nivel (captura o Playwright). Acá se atrapa la regresión
// barata: la que se cuela en un refactor y nadie vuelve a mirar.

const DIR = dirname(fileURLToPath(import.meta.url))
const fuente = (archivo: string) => readFileSync(join(DIR, archivo), 'utf8')
const pagina = (ruta: string) => readFileSync(join(DIR, '../../../app/(main)/obras', ruta), 'utf8')

test('07 · la tabla lleva las SEIS columnas del diseño ERP Obras y la plata sólo con permiso', () => {
  const src = fuente('TablaSubcontratos.tsx')
  for (const col of ['Paquete', 'Subcontratista', 'Actividades', 'Papeles']) {
    assert.match(src, new RegExp(`<div[^>]*>${col}</div>`), `falta la columna ${col}`)
  }
  // Contratado y Certificado existen SÓLO con `economia`: no se dibujan en gris, no se dibujan.
  assert.match(src, /\{economia && <div style=\{\{ textAlign: 'right' \}\}>Contratado<\/div>\}/)
  assert.match(src, /\{economia && <div style=\{\{ textAlign: 'right' \}\}>Certificado<\/div>\}/)
  // Las dos grillas —con y sin plata— tienen que ser distintas: la misma grilla con dos columnas
  // menos deja dos huecos donde iba la plata.
  assert.match(src, /GRID_CON = 'minmax\(0,1\.2fr\) minmax\(0,1fr\) 108px 132px 132px 116px'/)
  assert.match(src, /GRID_SIN = 'minmax\(0,1\.2fr\) minmax\(0,1fr\) 108px 116px'/)
})

test('07 · un paquete sin precio dice «sin precio cargado» en faint, nunca $ 0', () => {
  const src = fuente('TablaSubcontratos.tsx')
  assert.match(src, /sin precio cargado/)
  // Ningún literal «$ 0» dibujado: la ausencia se escribe con palabras.
  assert.equal(/['>]\$ 0['<]/.test(src), false)
})

test('07 · el diseño no lleva buscador ni chips: la tabla es la pantalla', () => {
  const src = fuente('WorkspaceSubcontratos.tsx')
  assert.equal(/placeholder="Buscar paquete o proveedor"/.test(src), false, 'volvió el buscador que el diseño 07 no dibuja')
  assert.equal(/testid="filtros-subcontratos"/.test(src), false, 'volvieron los chips que el diseño 07 no dibuja')
  // Lo que sí dibuja: «qué lo frena» y la nota de gente propia, literales.
  assert.match(src, /qué lo frena/)
  assert.match(src, /Con gente propia: /)
  assert.match(src, /sin análisis de costo/)
})

test('propio vs subcontrato vive DENTRO del panel, no debajo de la lista', () => {
  const workspace = fuente('WorkspaceSubcontratos.tsx')
  const panel = fuente('PanelSubcontrato.tsx')

  assert.equal(/ComparadorPropioSubcontrato/.test(workspace), false,
    'la comparación volvió a la columna izquierda, lejos del paquete que compara')
  assert.match(workspace, /comparacion=\{comparacion \?\? \[\]\}/)
  assert.match(panel, /data-testid="comparador-propio-subcontrato"/)
})

test('sin el costo propio el veredicto dice que falta un dato — no «conviene subcontratar»', () => {
  const src = fuente('PanelSubcontrato.tsx')

  // El análisis de costo por actividad no existe en el modelo: el lado propio llega en `null`.
  // Comparar contra ese `null` tratado como cero daría SIEMPRE «conviene subcontratar», que es la
  // recomendación fabricada que esta pantalla no puede dar.
  assert.match(src, /convieneSub = sub == null \|\| propio == null \? null :/)
  assert.match(src, /Falta un dato para comparar/)

  // Y sin valor no se dibuja la barra: una pista vacía al lado de una llena ya afirma «cuesta 0».
  const lado = src.slice(src.indexOf('function Lado('))
  assert.match(lado, /\{valor != null && \(\s*\n\s*<div className="mt-1 h-2/)
})

test('la alerta de documentación es una tarjeta que LLEVA a los papeles', () => {
  const src = fuente('PanelSubcontrato.tsx')

  // La flecha del mockup no es decoración: sin destino sería un botón falso, que es el defecto que
  // ya costó una pantalla entera.
  const tarjeta = src.slice(src.indexOf('data-testid="bloqueo-inicio"') - 400,
    src.indexOf('data-testid="bloqueo-inicio"') + 400)
  assert.match(tarjeta, /onClick=\{\(\) => setSolapa\('documentos'\)\}/)
})

test('«Certificar avance» sigue siendo la primaria del pie del panel', () => {
  const src = fuente('PanelSubcontrato.tsx')
  assert.match(src, /data-testid="certificar-avance"[\s\S]{0,240}bg-marca/)
})

test('05 · el formulario de avance es UNO SOLO: la página y el panel comparten definición', () => {
  const form = fuente('FormAvance.tsx')

  assert.match(form, /export function FormAvanceEmbebido\(datos: DatosFormAvance\)/)
  assert.match(form, /<FormAvance \{\.\.\.datos\} variante="panel" \/>/)

  // En el panel el título de la tarea ya está arriba: repetirlo empuja el número grande fuera de
  // la vista, que es lo único que el bloque tiene que mostrar primero.
  assert.match(form, /\{!enPanel && \(/)
  assert.match(form, /enPanel \? 'grid gap-5' : 'grid gap-6 lg:grid-cols-\[1fr_300px\]'/)
})

test('05 · la guarda de contenedor vive en el componente, no en la página', () => {
  const form = fuente('FormAvance.tsx')
  const page = pagina('[obra]/avance/[actividad]/page.tsx')

  // El defecto que atrapa: dejar la guarda en la página. El mismo formulario se embebe en el panel
  // lateral; escrita afuera, cada embebedor tiene que acordarse de repetirla — y el primero que se
  // olvide muestra un formulario que el trigger de la base va a rebotar ya completado.
  assert.match(form, /data-testid="es-contenedor"/)
  assert.equal(/nodo\.es_contenedor \?/.test(page), false,
    'la guarda de contenedor volvió a decidirse en la página')
})
