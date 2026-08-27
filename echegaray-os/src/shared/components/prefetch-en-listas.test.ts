import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El dueño, 25/08/2026: *"todo app.ecsas.com.ar es MUY lento, tenes q optimizar la carga de todas las
// pantallas"*. Instrumentando el middleware apareció el motivo, y no era ninguna consulta: era la
// PRECARGA.
//
// Next precarga solo los `<Link>` que entran en pantalla. En este OS hay dos formas de dibujar
// muchísimos `<Link>` de golpe:
//
//   · las pastillas de filtro, que apuntan a LA MISMA pantalla con otra query;
//   · el nombre de cada fila de una tabla, uno por registro.
//
// Como todos entran en pantalla, abrir UNA lista disparaba un render de servidor COMPLETO por cada
// enlace dibujado — cada uno con sus consultas y su pasada por el middleware. Medido el 25/08 con el
// middleware instrumentado, UNA visita de una persona:
//
//   /documentos ····················· 77 pasadas por el middleware
//   /administracion/proveedores ····· 51
//   /clientes ······················· 14
//   una pantalla sin listas ·········  3
//
// O sea 74 renders de `/documentos` para dibujar `/documentos` una vez: un usuario abriendo una lista
// ocupaba el servidor como setenta. Con `prefetch={false}` en esos enlaces, `/documentos` bajó a 24
// pedidos totales y su tiempo hasta contenido de 4.671 ms a 2.311 ms.
//
// Precargar ahí además no compra NADA: el destino es `force-dynamic`, así que el payload precargado no
// se reusa cuando la persona hace clic.
//
// ESTE TEST LEE EL CÓDIGO, y es a propósito: el defecto no se ve en ninguna pantalla —todo funciona,
// sólo que lento— y no hay valor de retorno que comprobar. Lo único que lo delata es el atributo. Si
// alguien lo saca, esto se pone rojo.
//
// NO ES UNA REGLA CONTRA `prefetch` EN GENERAL. La navegación de verdad —la marca, las áreas del
// header, un botón que lleva a otra pantalla— sigue precargando: son pocos y se usan. La regla es
// para los enlaces que se dibujan UNO POR FILA o UNO POR FILTRO.
//
// ═══ TRES TABLAS FALTAN A PROPÓSITO (25/08/2026) ═══
//
// `TablaProveedores`, `TablaNombres` y `TablaPendientes` tienen el mismo defecto y NO están en la
// lista: los está reescribiendo enteros otro frente en este mismo momento. Tocarlos desde acá sería
// un conflicto que alguien tiene que resolver dos veces a mano, o directamente trabajo perdido en el
// merge. El arreglo es de una línea —`prefetch={false}` en el `<Link>` del nombre de la fila— y le
// corresponde a quien sea dueño de esas pantallas. Cuando entre, se agregan acá y este test las
// cuida igual que a las demás.

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))

/**
 * Cada entrada es un enlace que se dibuja N veces por pantalla. El ancla es el `href` —lo único
 * estable del `<Link>`— y a partir de ahí se lee el bloque de atributos.
 */
const ENLACES_MULTIPLICADOS: { archivo: string; ancla: string; porque: string }[] = [
  // ── LAS PASTILLAS DE FILTRO: apuntan a la misma pantalla con otra query.
  { archivo: 'features/administracion/components/Controles.tsx', ancla: 'href={o.href}', porque: 'FiltrosURL — una pastilla por filtro (documentos, proveedores, clientes)' },
  { archivo: 'shared/components/canon/ChipsCanon.tsx', ancla: 'href={o.href}', porque: 'ChipsCanon — las pastillas del canónico' },

  // ── EL NOMBRE DE CADA FILA: uno por registro de la tabla.
  { archivo: 'features/documentos/components/TablaDocumentos.tsx', ancla: "href={hrefs[d.drive_file_id] ?? '#'}", porque: 'un documento por fila, y son hasta 50' },
  { archivo: 'features/administracion/components/TablaCompras.tsx', ancla: 'href={hrefDe(c.id)}', porque: 'un comprobante por fila' },
  { archivo: 'features/administracion/components/TablaComprasSheet.tsx', ancla: 'href={hrefDe(f.fila)}', porque: 'una fila del Sheet por fila' },
  { archivo: 'features/administracion/components/TablaCuadrillas.tsx', ancla: 'href={hrefDe(c.id)}', porque: 'una cuadrilla por fila' },
  { archivo: 'features/administracion/components/GrillaSemana.tsx', ancla: 'href={`/administracion/personas/${f.persona.persona_id}`}', porque: 'una persona por fila de la semana' },
  { archivo: 'features/administracion/components/PoolSinCuadrilla.tsx', ancla: 'href={`/administracion/personas/${p.id}`}', porque: 'una persona por ficha suelta' },
  { archivo: 'features/clientes/components/TablaClientes.tsx', ancla: 'href={hrefDe(c.cliente_id)}', porque: 'un cliente por fila' },
  { archivo: 'features/clientes/components/TablaClientes.tsx', ancla: 'href={`/obras/${o.obra_id}`}', porque: 'una obra en ejecución por cliente' },
  { archivo: 'features/presupuestos/components/ListaPresupuestos.tsx', ancla: 'href={`/presupuestos/${p.id}`}', porque: 'un presupuesto por fila' },
  { archivo: 'features/presupuestos/components/TablaPartidas.tsx', ancla: 'href={`${base}?partida=${p.partida_id}`}', porque: 'una partida por fila' },
]

/** El bloque de atributos del `<Link>` que contiene ese `href`: del `<Link` anterior al `>` que cierra. */
function atributosDelEnlace(fuente: string, ancla: string): string | null {
  const donde = fuente.indexOf(ancla)
  if (donde < 0) return null
  const abre = fuente.lastIndexOf('<Link', donde)
  if (abre < 0) return null
  // El `>` que cierra la etiqueta: el primero que no está dentro de una llave de JSX.
  let llaves = 0
  for (let i = abre; i < fuente.length; i++) {
    const c = fuente[i]
    if (c === '{') llaves++
    else if (c === '}') llaves--
    else if (c === '>' && llaves === 0) return fuente.slice(abre, i)
  }
  return null
}

for (const { archivo, ancla, porque } of ENLACES_MULTIPLICADOS) {
  test(`no precarga: ${archivo} · ${porque}`, () => {
    const fuente = readFileSync(RAIZ + archivo, 'utf8')
    const atributos = atributosDelEnlace(fuente, ancla)

    // Que el ancla no aparezca NO es un aprobado: significa que el enlace se movió y este test dejó
    // de mirar nada. Se pone rojo y se corrige la lista.
    assert.notEqual(
      atributos, null,
      `no encontré el <Link> con ${ancla} en ${archivo}: el enlace se movió y este test quedó mirando al aire`,
    )
    assert.match(
      atributos as string, /prefetch=\{false\}/,
      `${archivo} dibuja un <Link> por fila/filtro (${porque}) SIN prefetch={false}: cada uno dispara un `
      + 'render de servidor completo del destino. Es lo que hacía que abrir /documentos costara 77 pasadas '
      + 'por el middleware.',
    )
  })
}
