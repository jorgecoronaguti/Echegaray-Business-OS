import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El dueño, 08/09/2026: *«cada vez que cambio de sección o de módulo vuelve a hacer reload de toda
// la página, eso no es óptimo y hace todo lento»*.
//
// Medido con Playwright contra el build de producción (`tests/navegacion-sin-reload.spec.ts`), las
// solapas del header y las barras de área NO recargaban: navegaban de cliente en 80–350 ms. Lo que
// recargaba eran los OTROS controles de navegación —los que no son solapas— escritos como `<a href>`
// crudo: «Limpiar filtros» de Compras, «Ver el personal de la obra» del panel, «Ver historial»,
// «Ver el cronograma», los enlaces de un reporte, «Verlas» de las obras archivadas de un cliente.
//
// Un `<a href="/ruta">` dentro de una app con App Router no es un enlace más lento: es el navegador
// TIRANDO el documento —JS, estado de React, caché del router, scroll— y volviéndolo a pedir entero.
// El testigo en el navegador fue `window.__marca`: sobrevive a toda navegación de cliente y
// desaparece en la dura. Con `f-limpiar` desaparecía.
//
// ESTE TEST LEE EL CÓDIGO a propósito, igual que `prefetch-en-listas.test.ts`: el defecto no rompe
// ninguna pantalla —todo funciona, sólo que tira el documento— y no hay valor de retorno que mirar.
// Lo único que lo delata es la etiqueta. Si alguien vuelve a escribir un `<a href>` interno, esto se
// pone rojo sin necesidad de levantar un navegador.
//
// LO QUE SÍ PUEDE SER UN `<a>`: lo que sale de la aplicación (`http…`, `mailto:`), lo que se baja
// (`download`), lo que abre otra pestaña (`target=`), un ancla de la misma página (`#…`), y el
// puente entre el PORTAL DEL CLIENTE y el login del OS, que son dos aplicaciones distintas y
// conviene que el documento se rehaga.
const RAIZ = fileURLToPath(new URL('../../', import.meta.url))

/** Documentado, no silencioso: cada excepción dice por qué. */
const PERMITIDOS: { archivo: string; porque: string }[] = [
  {
    archivo: 'app/portal/login/Formulario.tsx',
    porque: 'el portal del cliente y el OS son dos aplicaciones: el salto rehace el documento a propósito',
  },
]

/**
 * UN COMENTARIO QUE NOMBRA EL DEFECTO NO ES EL DEFECTO (12/09/2026).
 *
 * Este barrido mira el fuente línea por línea, así que acusaba a cualquier comentario que escribiera
 * la etiqueta — y pasó: al reemplazar el `<a href>` del botón «Volver a los trabajos» por `<Link>`,
 * el comentario que explica POR QUÉ va con `<Link>` se convirtió en el nuevo culpable. Un control que
 * no distingue la prosa del código enseña a no explicar, que es lo contrario de lo que pide el repo.
 *
 * Las líneas se VACÍAN en vez de borrarse para que el número de línea del informe siga siendo el del
 * archivo: un culpable con la línea corrida es un culpable que no se encuentra.
 */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, (bloque) => bloque.replace(/[^\n]/g, ' '))
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

function tsx(dir: string): string[] {
  const salida: string[] = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) salida.push(...tsx(ruta))
    else if (nombre.endsWith('.tsx')) salida.push(ruta)
  }
  return salida
}

test('el barrido mira código, no prosa — y sigue cazando el ancla de verdad', () => {
  // LA MUTACIÓN, CORRIDA: si `sinComentarios` se pasara de listo y vaciara código, el control quedaría
  // mudo y ningún test lo diría. Las tres líneas son las tres formas en que esto ya se equivocó.
  const enBloque = '{/* va con <Link> y no con <a href={x}> porque tira el documento */}'
  const enLinea = '// ojo: esto era <a href={x}> hasta ayer'
  const deVerdad = '  <a href={url({ x: 1 })} data-testid="volver">‹ Volver</a>'
  const acusa = (linea: string) => /<a\s+href/.test(sinComentarios(linea))
  assert.equal(acusa(enBloque), false, 'un comentario que nombra la etiqueta no es un ancla')
  assert.equal(acusa(enLinea), false, 'tampoco el de una línea')
  assert.equal(acusa(deVerdad), true, 'SI ESTO ES FALSE EL CONTROL ES DECORATIVO: ya no caza nada')
})

test('ningún enlace interno se escribe como <a href>: eso recarga el documento entero', () => {
  const permitidos = new Set(PERMITIDOS.map((p) => join(RAIZ, p.archivo)))
  const culpables: string[] = []

  for (const archivo of tsx(join(RAIZ, 'app')).concat(tsx(join(RAIZ, 'features')), tsx(join(RAIZ, 'shared')))) {
    if (permitidos.has(archivo)) continue
    const lineas = sinComentarios(readFileSync(archivo, 'utf8')).split('\n')
    lineas.forEach((linea, i) => {
      if (!/<a\s+href/.test(linea)) return
      // Lo que sale de la app, se baja, abre otra pestaña o salta dentro de la misma página.
      if (/https?:|mailto:|tel:|href=["']#|download|target=/.test(linea)) return
      culpables.push(`${archivo.replace(RAIZ, '')}:${i + 1} → ${linea.trim().slice(0, 90)}`)
    })
  }

  assert.deepEqual(
    culpables,
    [],
    `Enlaces internos escritos como <a href>. Cada uno tira el documento y lo vuelve a pedir; van con <Link> de next/link:\n${culpables.join('\n')}`,
  )
})
