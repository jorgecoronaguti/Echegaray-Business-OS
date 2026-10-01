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
