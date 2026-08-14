// EL INTERRUPTOR DE LAS TARJETAS, ENCENDIDO SÓLO PARA EL TEST QUE LO NECESITA. SÓLO PARA TESTS.
//
// ═══ EL DEFECTO: 1.700 LÍNEAS DE TEST CORRIENDO EN UNA CONFIGURACIÓN QUE NO ES PRODUCCIÓN (14/08) ═══
//
// `flujo.test.mjs` (872 líneas), `accion.test.mjs` (788), `fajo.test.mjs` y `mensaje.test.mjs`
// arrancaban con `process.env.ORQ_COMPROBANTES_BOTONES = '1'` en la primera línea del ARCHIVO. Eso no
// enciende los botones para los tests de botones: los enciende para **todos** los tests del archivo.
// Producción corre sin esa variable desde el 13/08.
//
// Medido: de los 171 tests de esos cuatro archivos, **sólo 24 dependen de los botones**. Los otros 147
// —la lectura de la foto, la conciliación con ARCA, la barrera de duplicados, la idempotencia, el
// agrupado en fajo, la carga automática— corrían en una configuración que nadie ejecuta. Verdes sobre
// algo que no es lo desplegado.
//
// ═══ POR QUÉ NO SE BORRÓ EL CAMINO CON BOTONES ═══
//
// Porque no es código muerto: es la VUELTA ATRÁS de una decisión de producto de hace un día. El propio
// `botonesActivos()` lee la variable en cada llamada, y no al importar el módulo, justamente para que
// se pueda volver sin desplegar. Borrarlo dejaría al dueño sin marcha atrás si mañana decide que
// prefería las tarjetas; y un interruptor con una sola posición probada es un interruptor que se
// descubre roto el día que hace falta.
//
// Lo que se arregla es el ALCANCE: la variable se enciende por TEST y se restaura al terminar, así los
// 147 corren en la configuración real y los 24 siguen probando la mecánica de atrás.

import test from 'node:test'

/**
 * `test()` con las tarjetas ENCENDIDAS sólo durante ese test.
 *
 * Se restaura con `t.after` y no con un `finally`: si el cuerpo lanza, el hook corre igual, y una
 * variable de entorno que queda pegada por un test que falló contamina todos los que siguen — que es
 * la versión sutil del mismo defecto que se está arreglando.
 *
 * Los tests de nivel superior de `node --test` corren de a uno por archivo (concurrencia 1), así que
 * encender y apagar una variable de proceso es seguro acá y NO lo sería adentro de un `describe`
 * concurrente. Si algún día se paraleliza, esto deja de valer y hay que partir los archivos.
 *
 * @param {string} nombre
 * @param {Function} fn  el cuerpo del test; recibe el contexto igual que `test`
 */
export function testConBotones(nombre, fn) {
  return test(nombre, async (t) => {
    const antes = process.env.ORQ_COMPROBANTES_BOTONES
    process.env.ORQ_COMPROBANTES_BOTONES = '1'
    t.after(() => {
      if (antes === undefined) delete process.env.ORQ_COMPROBANTES_BOTONES
      else process.env.ORQ_COMPROBANTES_BOTONES = antes
    })
    return fn(t)
  })
}
