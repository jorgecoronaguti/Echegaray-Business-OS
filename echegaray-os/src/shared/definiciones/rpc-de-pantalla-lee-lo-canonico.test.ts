// LA RPC DE UNA PANTALLA ES UN CONSUMIDOR, NUNCA UNA SEGUNDA DEFINICIÓN.
//
// ═══ EL AGUJERO QUE ESTE TEST TAPA ═══
//
// `canonico-definiciones.test.ts` declara su propio punto ciego: *«no ve una consulta concatenada,
// ni un `rpc()` cuyo cuerpo vive en SQL»*. Mientras las pantallas leían con `from('vista')` desde
// TypeScript, el barrido estático las alcanzaba. Las RPC de «una consulta por pantalla» mueven esas
// lecturas a un cuerpo SQL dentro de una migración — o sea, JUSTO al lugar donde el control no
// llega. Sin este test, el hito de performance habría comprado velocidad pagando con el control que
// impide que «lo contratado» vuelva a tener cinco definiciones.
//
// ═══ QUÉ EXIGE ═══
//
//   1 · La RPC lee SÓLO relaciones declaradas acá. Una relación nueva en su cuerpo es una decisión
//       que alguien tiene que escribir en este archivo y defender; no se cuela.
//   2 · Ninguna de las fuentes RETIRADAS aparece en el cuerpo. `obra_panel.monto_contratado` —el
//       campo del formulario que la migración 20260910T2110 sacó de la cartera— es el caso testigo:
//       está a un `jsonb_build_object` de volver, y volvería sin que nada se pusiera rojo.
//   3 · El cuerpo no AGREGA: nada de `sum(`, `avg(` ni aritmética sobre las columnas económicas. Un
//       `sum()` acá adentro sería una definición nueva del número con nombre de optimización, y la
//       pantalla y el Sheet podrían discrepar sin que ningún test lo notara. Lo que suma es la
//       vista; la RPC transporta.
//
// ═══ LO QUE NO PUEDE VER ═══
//
// Lee el ARCHIVO de migración, no la base. Una función editada a mano en producción se le escapa —
// para eso está `aplicar-migracion.mjs --estado`, que delata los archivos que cambiaron después de
// aplicarse. Y no juzga las VISTAS: si `obra_cuenta` cambiara de criterio, es correcto que la RPC
// lo siga, porque es su consumidor.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * CADA RPC DE PANTALLA, CON LAS RELACIONES QUE TIENE PERMITIDO LEER.
 *
 * La lista no es documentación: es el permiso. Agregar una relación acá obliga a mirar si esa
 * fuente es la canónica del concepto que la pantalla dibuja.
 */
const RPC_DE_PANTALLA: { archivo: string; funcion: string; lee: string[] }[] = [
  {
    archivo: 'supabase/migrations/20260911T1030_una_vista_cara_se_recorre_una_vez_por_viaje.sql',
    funcion: 'pantalla_clientes',
    lee: [
      'perfiles',              // quién mira: decide qué columnas se dibujan
      'cliente_panel',         // el maestro (ya SIN economía desde 20260910T2110)
      'obra_panel',            // las obras y su avance
      'certificados',          // las fechas del circuito certificar → facturar → cobrar
      'cliente_orden',         // los papeles del cliente (OC, OP, retenciones, facturas)
      'obra_economia_cartera', // canónica del PRECIO de una obra
      'obra_cuenta',           // la fila de la pestaña OBRAS: cobrado, por cobrar, vencido, próximo
      'cliente_documento',     // quién tiene el contrato CARGADO (un papel, no un monto)
      'cliente_economia',      // canónica de lo contratado/cobrado DEL CLIENTE
    ],
  },
  {
    // 20260911T0130 reemplazó a 20260911T0020: la campanita dejó de transportar 737 filas por
    // navegación y cuenta en la base con `comprobante_cumple_filtro()`, el lado SQL de PREDICADO.
    // Auditar la versión vieja sería auditar lo que ya no corre.
    archivo: 'supabase/migrations/20260911T1030_una_vista_cara_se_recorre_una_vez_por_viaje.sql',
    funcion: 'campanita_atencion',
    lee: [
      'perfiles',                       // decide qué chips existen para este rol
      'proveedores',                    // los CUIT: «sin CUIT» es la misma decisión que `!p.cuit`
      'comprobante_compra',             // las tres columnas que PREDICADO mira, ya contadas
      'proveedor_nombre_pendiente',
      'imputacion_pendiente',
      'correccion_asistencia_bandeja',
    ],
  },
  {
    // LAS DOS VIVEN EN EL MISMO ARCHIVO desde 20260911T0040: las de 0010/0030 ya estaban aplicadas
    // y un archivo de la cadena que cambia después de aplicarse rompe el ledger, así que se
    // reemplazaron con `create or replace`. Auditar la versión VIEJA sería auditar lo que ya no
    // corre — por eso el barrido apunta a 0040 y no a los archivos originales.
    archivo: 'supabase/migrations/20260911T0940_la_ficha_del_cliente_recibe_el_desglose_del_contrato.sql',
    funcion: 'pantalla_cliente',
    lee: [
      'cliente_panel',          // la ficha, y el slug → cliente_id
      'perfiles',               // quién mira, y los responsables posibles
      'cliente_contacto',
      'obra_panel',             // sus obras (y el recorte de los certificados)
      'obra_economia_cartera',  // canónica del PRECIO de una obra
      'obra_cuenta',            // lo cobrado por trabajo, la misma vista que /clientes
      'cliente_economia',       // canónica de lo contratado/cobrado DEL CLIENTE
      'cliente_orden',          // los papeles
      'cliente_documento',      // los vínculos a Drive
      'drive_index',            // los archivos: se cruzan en TypeScript, no con un join
      'cliente_nota',
      'clientes',               // las fechas de alta/edición, que cliente_panel no publica
      'certificados',
      'cotizacion_cascada',     // los presupuestos vigentes del cliente
    ],
  },
]

/** Fuentes retiradas: si alguna aparece en el cuerpo de una RPC, volvió una definición muerta. */
const RETIRADAS = [
  { patron: /monto_contratado/, porque: 'es el campo del formulario de la obra; el precio sale de obra_economia_cartera' },
  { patron: /contratado_de_obra\s*\(/, porque: 'lee el campo del formulario con un portero adentro' },
  { patron: /certificado_cliente/, porque: 'lo facturado del cliente sale de cliente_economia, no de la tabla cruda' },
  { patron: /cliente_panel\.(contratado|costo_real|vencido|saldo)/, porque: 'cliente_panel dejó de publicar economía (20260910T2110)' },
]

/**
 * Agregaciones: la RPC transporta filas, no fabrica números.
 *
 * `count(` NO está en la lista, y es una decisión: contar cuántas filas cumplen un `where` no
 * inventa un número, sólo evita traerlas. Lo que sí sería una definición nueva es SUMAR importes —un
 * `sum(imp_total)` acá adentro podría discrepar con el Sheet sin que nada lo notara—. Quien cuida
 * que el `where` de un `count` sea el criterio canónico es el test de paridad de cada RPC
 * (`orquestador/lib/campanita-rpc.pg.test.mjs` compara los seis filtros contra `PREDICADO`).
 */
const AGREGA = /\b(sum|avg|min|max)\s*\(/i

/** `from public.x` / `join public.x` → las relaciones que el cuerpo lee. */
function relacionesQueLee(sql: string): Set<string> {
  const encontradas = new Set<string>()
  for (const m of sql.matchAll(/\b(?:from|join)\s+public\.([a-z_][a-z0-9_]*)/gi)) {
    encontradas.add(m[1].toLowerCase())
  }
  return encontradas
}

/**
 * EL CUERPO DE UNA FUNCIÓN, sin los comentarios `--` que explican por qué está.
 *
 * Se recorta a SU función y no al archivo entero: desde 20260911T0040 dos RPC conviven en la misma
 * migración, y auditar el archivo completo daría la UNIÓN de lo que leen las dos —o sea, permitiría
 * que `pantalla_clientes()` leyera `drive_index` sólo porque la ficha lo declara—. Un permiso que
 * se contagia entre funciones no es un permiso.
 */
function cuerpoDe(sql: string, funcion: string): string {
  const abre = new RegExp(`create or replace function public\\.${funcion}\\s*\\(`, 'i')
  const i = sql.search(abre)
  if (i < 0) return ''
  const j = sql.indexOf('$$;', i)
  return sql.slice(i, j < 0 ? sql.length : j)
    .split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
}

for (const rpc of RPC_DE_PANTALLA) {
  const sql = cuerpoDe(readFileSync(RAIZ + rpc.archivo, 'utf8'), rpc.funcion)

  test(`${rpc.funcion}() sólo lee las relaciones que tiene declaradas`, () => {
    assert.ok(sql.length > 0, `no encontré el cuerpo de ${rpc.funcion} en ${rpc.archivo}`)
    const lee = relacionesQueLee(sql)
    assert.ok(lee.size > 0, 'el barrido no encontró ninguna relación: el patrón dejó de mirar')
    const deMas = [...lee].filter((r) => !rpc.lee.includes(r))
    assert.deepEqual(deMas, [], `la RPC lee relaciones no declaradas: ${deMas.join(', ')}`)
    // Y AL REVÉS: una relación declarada que ya no se lee es un permiso que quedó suelto. Un
    // permiso que mira al aire es exactamente cómo una prohibición deja de cuidar lo que decía.
    const sobran = rpc.lee.filter((r) => !lee.has(r))
    assert.deepEqual(sobran, [], `declaradas pero no leídas: ${sobran.join(', ')}`)
  })

  test(`${rpc.funcion}() no resucita ninguna fuente retirada`, () => {
    for (const { patron, porque } of RETIRADAS) {
      assert.equal(patron.test(sql), false, `«${patron.source}» volvió al cuerpo de la RPC: ${porque}`)
    }
  })

  test(`${rpc.funcion}() transporta, no agrega`, () => {
    assert.equal(AGREGA.test(sql), false,
      'la RPC agrega con sum/avg/min/max: eso es una definición nueva del número, y la definición '
      + 'vive en la vista')
  })
}
