// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//   · QUE LA FICHA TRAIGA COMPRAS DE OTRO. La vista `proveedor_compra` vincula por los DÍGITOS del
//     CUIT (la pestaña lo guarda con guiones, el maestro sin) y cae al nombre SÓLO si la compra no
//     trae CUIT. Comparar el CUIT crudo dejaba 0 de 578 vinculadas (medido 14/09/2026); caer al
//     nombre con CUIT presente colgaría de un proveedor la compra de un homónimo.
//   · QUE EL PAPEL SE UNA CON UNA REGLA PROPIA. El servicio usa `papelesDeCadaFila`, la de Compras:
//     el adjunto que se abre desde la ficha es el MISMO `id` que abre Compras, y uno suelto o de otra
//     clave no se cuelga.
//   · QUE «NO PUDE LEER LOS PAPELES» SE DIBUJE COMO «SIN COMPROBANTE».
//   · QUE EL BUSCADOR NO ENCUENTRE «12345» EN «0003-00012345».
//   · QUE LOS CHIPS CUENTEN LO FILTRADO, o que las compras sin fecha desaparezcan detrás del año.
//   · QUE SE OFREZCA VINCULAR SOBRE UNA COMPRA SIN CLAVE, que `vincularAdjunto` rechaza.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  accionDeFila, aniosDe, coincideNumero, coincideTexto, comoComprobantes, contarEstados,
  contarPapeles, delAnio, estadoDe, filtrarComprobantes, filtrosDeURL, obraDe, SIN_FECHA, SIN_OBRA,
  TODOS_LOS_ANIOS, totalVisible,
} from './comprobantesProveedor.ts'
import {
  getComprasConPapel, TOPE_COMPRAS_PROVEEDOR, type CompraDelProveedor,
} from './comprobantesProveedorService.ts'
import { papelesDeCadaFila } from './comprasSheet.ts'
import type { Adjunto } from './comprasSheetService.ts'

const PROVEEDOR = '79efaade-121a-4377-8da7-bcb514508d20'
const RAIZ = new URL('../../../..', import.meta.url).pathname

function compra(c: Partial<CompraDelProveedor> = {}): CompraDelProveedor {
  return {
    proveedor_id: PROVEEDOR, via: 'cuit', fila: 900, clave: 'c:30716236338|0003-00012345',
    fecha: '2026-08-20', tipo: 'FA', comprobante: '0003-00012345', concepto: 'Cemento',
    obra_texto: 'Quattropani', total: 100, estado: 'Pagado', estado_pago: null,
    saldo_pendiente: null, anulada: false, ...c,
  }
}

function adjunto(a: Partial<Adjunto> = {}): Adjunto {
  return {
    id: 'a-1', compra_clave: 'c:30716236338|0003-00012345', fila_compras: 900,
    storage_path: 'x/a-1.jpg', nombre: 'factura.jpg', media_type: 'image/jpeg', bytes: 10,
    origen: 'mattermost', vinculado_por: 'registro', confianza: null, subido_at: null, ...a,
  }
}

interface Consulta { tabla: string; filtros: [string, unknown][]; limite?: number }

/** Un PostgREST falso: cada `from()` anota qué se pidió y responde lo que el test le dio. */
function baseFalsa(r: {
  compras?: unknown[]; errorCompras?: string; adjuntos?: unknown[]; errorAdjuntos?: string
}) {
  const consultas: Consulta[] = []
  const cliente = {
    from: (tabla: string) => ({
      select: () => {
        const c: Consulta = { tabla, filtros: [] }
        consultas.push(c)
        const esCompras = tabla === 'proveedor_compra'
        // La obra canónica de cada fila se prueba en `obraDeLaCompraDelProveedor.test.ts`; acá esas
        // tablas vuelven vacías para que estos casos sigan probando UNA cosa: qué se le pide a la
        // vista y qué papel se le cuelga a cada compra.
        const esObra = tabla === 'compra_obra_asignada' || tabla === 'obra_canonica'
        const respuesta = () => (esObra
          ? { data: [], error: null }
          : esCompras
            ? (r.errorCompras ? { data: null, error: { message: r.errorCompras } } : { data: r.compras ?? [], error: null })
            : (r.errorAdjuntos ? { data: null, error: { message: r.errorAdjuntos } } : { data: r.adjuntos ?? [], error: null }))
        const q = {
          eq: (col: string, val: unknown) => { c.filtros.push([col, val]); return q },
          in: (col: string, val: unknown) => { c.filtros.push([col, val]); return q },
          order: () => q,
          limit: (n: number) => { c.limite = n; return q },
          then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(respuesta()).then(ok, ko),
        }
        return q
      },
    }),
  } as unknown as SupabaseClient
  return { cliente, consultas }
}

// ── la vista ──────────────────────────────────────────────────────────────────────────────────────

const migracion = () => {
  const dir = join(RAIZ, 'supabase/migrations')
  const archivo = readdirSync(dir).find((a) => a.endsWith('_las_compras_de_un_proveedor_con_su_papel.sql'))
  assert.ok(archivo, 'falta la migración de proveedor_compra')
  return readFileSync(join(dir, archivo), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
}

test('la vista compara los DÍGITOS del CUIT, no el texto con guiones', () => {
  assert.match(migracion(), /pc\.cuit\s*=\s*regexp_replace\(cs\.cuit,\s*'\\D',\s*'',\s*'g'\)/)
})

test('la vista cae al nombre resuelto SÓLO cuando la compra no trae CUIT', () => {
  const sql = migracion()
  assert.match(sql, /left join public\.proveedor_nombre_resuelto r\s+on cs\.cuit is null/)
  assert.match(sql, /r\.estado = 'vinculado'/)
  // El CUIT gana: si hubiera los dos, manda el del CUIT.
  assert.match(sql, /coalesce\(pc\.id, r\.proveedor_id\) as proveedor_id/)
})

test('la vista no afloja la cerradura: security_invoker, portero y grant de lectura', () => {
  const sql = migracion()
  assert.match(sql, /with \(security_invoker = true\)/)
  assert.match(sql, /\(select public\.es_administracion\(\)\)/)
  assert.match(sql, /grant select on public\.proveedor_compra to authenticated;/)
  assert.doesNotMatch(sql, /grant (insert|update|delete)/i)
})

// ── el servicio ───────────────────────────────────────────────────────────────────────────────────

test('pide SÓLO las compras de este proveedor, y los papeles con la consulta de Compras', async () => {
  const { cliente, consultas } = baseFalsa({ compras: [compra()], adjuntos: [adjunto()] })
  await getComprasConPapel(cliente, PROVEEDOR)
  const deCompras = consultas.find((c) => c.tabla === 'proveedor_compra')
  assert.deepEqual(deCompras?.filtros, [['proveedor_id', PROVEEDOR]])
  assert.equal(deCompras?.limite, TOPE_COMPRAS_PROVEEDOR + 1)
  const dePapeles = consultas.find((c) => c.tabla === 'compra_adjunto')
  // Sin filtro, igual que `getComprasSheet`: un `in.(claves)` largo se corta en la URL.
  assert.deepEqual(dePapeles?.filtros, [])
})

test('el papel de cada compra es el MISMO que le pone Compras, y uno suelto o ajeno no se cuelga', async () => {
  const propio = adjunto({ id: 'propio' })
  const ajeno = adjunto({ id: 'ajeno', compra_clave: 'c:20111111112|0001-1' })
  const suelto = adjunto({ id: 'suelto', compra_clave: null })
  const conPapel = compra()
  const sinPapel = compra({ fila: 901, clave: 'c:30716236338|0003-9', comprobante: '0003-9' })
  const { cliente } = baseFalsa({ compras: [conPapel, sinPapel], adjuntos: [propio, ajeno, suelto] })

  const r = await getComprasConPapel(cliente, PROVEEDOR)
  const enCompras = papelesDeCadaFila([conPapel, sinPapel], [propio, ajeno, suelto])
  assert.deepEqual(r.data?.filas.map((f) => f.adjuntos.map((a) => a.id)), enCompras.map((f) => f.adjuntos.map((a) => a.id)))
  assert.deepEqual(r.data?.filas.map((f) => f.adjuntos.map((a) => a.id)), [['propio'], []])
  assert.deepEqual(r.data?.filas.map((f) => f.tiene_adjunto), [true, false])
})

test('si los papeles no se pudieron leer, se dice: no se afirma «sin comprobante»', async () => {
  const { cliente } = baseFalsa({ compras: [compra()], errorAdjuntos: 'permission denied' })
  const r = await getComprasConPapel(cliente, PROVEEDOR)
  assert.equal(r.error, null)
  assert.equal(r.data?.papelesSinLeer, true)
})

test('un error de la vista es un error, no una lista vacía', async () => {
  const { cliente } = baseFalsa({ errorCompras: 'relation "proveedor_compra" does not exist' })
  const r = await getComprasConPapel(cliente, PROVEEDOR)
  assert.equal(r.data, null)
  assert.match(r.error ?? '', /does not exist/)
})

test('un id que no es uuid no llega a Postgres', async () => {
  const { cliente, consultas } = baseFalsa({ compras: [compra()] })
  const r = await getComprasConPapel(cliente, 'nuevo')
  assert.equal(consultas.length, 0)
  assert.equal(r.error, 'Ese proveedor no existe.')
})

test('el tope se dice y no se dibuja la fila de más', async () => {
  const muchas = Array.from({ length: TOPE_COMPRAS_PROVEEDOR + 1 }, (_, i) => compra({ fila: i, clave: null }))
  const { cliente } = baseFalsa({ compras: muchas })
  const r = await getComprasConPapel(cliente, PROVEEDOR)
  assert.equal(r.data?.truncado, true)
  assert.equal(r.data?.filas.length, TOPE_COMPRAS_PROVEEDOR)
})

// ── las reglas puras ──────────────────────────────────────────────────────────────────────────────

const SIN_FILTRO = { anio: 2026, papel: 'todos', estado: 'todos', obra: null, texto: null } as const

test('los filtros de la URL pasan por Zod y lo inválido vuelve al default', () => {
  assert.deepEqual(filtrosDeURL({}, 2026), SIN_FILTRO)
  assert.deepEqual(filtrosDeURL({ anio: 'hola', papel: 'x', estado: 'z', q: '   ' }, 2026), SIN_FILTRO)
  assert.deepEqual(
    filtrosDeURL({ anio: '2025', papel: 'sin', estado: 'pendiente', obra: ' Galpón 9 ', q: ' 12345 ' }, 2026),
    { anio: 2025, papel: 'sin', estado: 'pendiente', obra: 'Galpón 9', texto: '12345' },
  )
  assert.equal(filtrosDeURL({ anio: SIN_FECHA }, 2026).anio, SIN_FECHA)
  assert.equal(filtrosDeURL({ anio: TODOS_LOS_ANIOS }, 2026).anio, TODOS_LOS_ANIOS)
})

// EL DEFECTO: el campo escribe `?q=` (`BuscadorFilo` tiene `name="q"` y `urlDeBusqueda` siempre
// escribe `q`) y esta función leía `sp.n`. El dueño tipeaba y no pasaba NADA.
test('el buscador lee el parámetro que el buscador escribe, y también el viejo', () => {
  assert.equal(filtrosDeURL({ q: '3501' }, 2026).texto, '3501')
  assert.equal(filtrosDeURL({ n: '3501' }, 2026).texto, '3501')
})

test('el número se busca por sus dígitos y sin ceros: 3501, 6-3501 y 00003501', () => {
  assert.equal(coincideNumero('0003-00012345', '12345'), true)
  // ANTES DABA false: el dueño tipea el punto de venta y el número, que es como está impreso.
  assert.equal(coincideNumero('0003-00012345', '3-12345'), true)
  assert.equal(coincideNumero('0006-00003501', '3501'), true)
  assert.equal(coincideNumero('0006-00003501', '00003501'), true)
  assert.equal(coincideNumero('0006-00003501', '6-3501'), true)
  assert.equal(coincideNumero('0006-00003501', '3501-6'), false)
  assert.equal(coincideNumero('A 0003 00012345', '0003-00012345'), true)
  assert.equal(coincideNumero(null, '1'), false)
  assert.equal(coincideNumero('RECIBO X', 'recibo'), true)
})

test('un solo campo busca por concepto, obra, fecha e importe — sin tildes ni mayúsculas', () => {
  const c = {
    fecha: '2026-09-09', comprobante: '0006-00003501', tiene_adjunto: false,
    concepto: 'Cemento a granel', obra_texto: 'Galpón 9', total: 111530.45, estado: 'Pendiente',
  }
  assert.equal(coincideTexto(c, 'cemento'), true)
  assert.equal(coincideTexto(c, 'GALPON'), true)
  assert.equal(coincideTexto(c, '09/09'), true)
  assert.equal(coincideTexto(c, '09/09/2026'), true)
  assert.equal(coincideTexto(c, '9/9'), true)
  assert.equal(coincideTexto(c, '111.530'), true)
  assert.equal(coincideTexto(c, '111530'), true)
  // LA COLUMNA REDONDEA: $ 49.523,70 se dibuja «$ 49.524». Tipear lo que la fila MUESTRA tiene que
  // encontrar esa fila — medido en el navegador el 22/09/2026, donde antes no la encontraba.
  assert.equal(coincideTexto({ ...c, total: 49523.7 }, '49.524'), true)
  assert.equal(coincideTexto({ ...c, total: 49523.7 }, '49523'), true)
  assert.equal(coincideTexto(c, '3501'), true)
  assert.equal(coincideTexto(c, 'pendiente'), true)
  assert.equal(coincideTexto(c, 'ladrillos'), false)
  // Sin búsqueda no se filtra nada: un `includes('')` mal puesto vacía la pantalla.
  assert.equal(coincideTexto(c, null), true)
})

test('con / sin comprobante recorta, y los chips cuentan el año entero', () => {
  const filas = [
    { fecha: '2026-01-02', comprobante: '1', tiene_adjunto: true },
    { fecha: '2026-01-03', comprobante: '2', tiene_adjunto: false },
    { fecha: '2026-01-04', comprobante: '3', tiene_adjunto: false },
  ]
  assert.equal(filtrarComprobantes(filas, { ...SIN_FILTRO, papel: 'con' }).length, 1)
  assert.equal(filtrarComprobantes(filas, { ...SIN_FILTRO, papel: 'sin' }).length, 2)
  assert.deepEqual(contarPapeles(filas), { todos: 3, con: 1, sin: 2 })
})

test('Pendiente y Pagado salen de la columna Estado, verbatim: lo demás no se reparte', () => {
  const fila = (estado: string | null, tipo = 'FA') => ({
    fecha: '2026-03-01', comprobante: '1', tiene_adjunto: false, estado, tipo, total: 10,
  })
  const filas = [fila('Pendiente'), fila('Pagado'), fila('Proyectado'), fila(null), fila('Pagado', 'N C')]
  assert.deepEqual(contarEstados(filas), { todos: 5, pendiente: 1, pagado: 2, otro: 2 })
  assert.equal(filtrarComprobantes(filas, { ...SIN_FILTRO, estado: 'pendiente' }).length, 1)
  assert.equal(filtrarComprobantes(filas, { ...SIN_FILTRO, estado: 'pagado' }).length, 2)
  // Una NC no se clasifica por ser NC: lleva el estado que la pestaña le escribió.
  assert.equal(estadoDe('N C'), 'otro')
})

test('la obra recorta la lista, y lo no imputado tiene su propio corte', () => {
  const fila = (obra: string | null) => ({
    fecha: '2026-03-01', comprobante: '1', tiene_adjunto: false, obra_texto: obra, total: 10,
  })
  const filas = [fila('Galpón 9'), fila('galpon 9'), fila('Quattropani'), fila(null), fila('  ')]
  assert.equal(filtrarComprobantes(filas, { ...SIN_FILTRO, obra: 'Galpón 9' }).length, 2)
  assert.equal(filtrarComprobantes(filas, { ...SIN_FILTRO, obra: SIN_OBRA }).length, 2)
  assert.equal(filtrarComprobantes(filas, { ...SIN_FILTRO, obra: null }).length, 5)
  assert.equal(obraDe({ obra_texto: '  ' }), SIN_OBRA)
})

test('lo que se ve suma con la MISMA regla que la cara «Obras»: las anuladas no suman, y se dice', () => {
  const fila = (total: number | null, anulada = false) => ({
    fecha: '2026-03-01', comprobante: '1', tiene_adjunto: false, total, anulada,
  })
  // La NC resta: es una fila más, con importe negativo.
  assert.deepEqual(totalVisible([fila(100), fila(-30), fila(999, true), fila(null)]),
    { total: 70, anuladas: 1, sinImporte: 1 })
})

test('las compras sin fecha no desaparecen: tienen su propia opción, al final', () => {
  const filas = [{ fecha: '2025-12-31' }, { fecha: null }, { fecha: '2026-02-01' }]
  assert.deepEqual(aniosDe(filas, 2026), [2026, 2025, SIN_FECHA, TODOS_LOS_ANIOS])
  assert.deepEqual(aniosDe([{ fecha: '2024-01-01' }], 2026), [2026, 2024, TODOS_LOS_ANIOS])
  assert.equal(delAnio(filas, SIN_FECHA).length, 1)
  assert.equal(delAnio(filas, 2026).length, 1)
  // «todos los años» existe porque el monto de una obra es histórico: sin él no puede cerrar.
  assert.equal(delAnio(filas, TODOS_LOS_ANIOS).length, 3)
})

test('las cifras de la ficha salen de las mismas filas que la lista, sin las anuladas', () => {
  const filas = [compra({ fila: 1 }), compra({ fila: 2, anulada: true, total: 999 }), compra({ fila: 3, total: null })]
  const r = comoComprobantes(filas)
  assert.deepEqual(r.map((f) => f.id), ['1', '3'])
  assert.equal(r[0].total, 100)
  assert.equal(r[1].total, null)
})

test('sin clave no se ofrece vincular; con papel se ve', () => {
  assert.equal(accionDeFila({ clave: 'c:1|2', tiene_adjunto: true }), 'ver')
  assert.equal(accionDeFila({ clave: 'c:1|2', tiene_adjunto: false }), 'vincular')
  assert.equal(accionDeFila({ clave: null, tiene_adjunto: false }), 'sin-numero')
})
