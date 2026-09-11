// UN ADICIONAL CUELGA DE SU OBRA MAYOR — la migración, probada contra los datos REALES.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE LA COLUMNA NAZCA SIN PERMISO. Los GRANT de `obra_canonica` son POR COLUMNA y
//      `obra_panel` es `security_invoker=true`: sin `grant select (obra_padre_id)`, la ficha del
//      cliente responde «permission denied for table obra_canonica» para TODO el mundo. Ya pasó con
//      `fusionada_en`. Acá se mide con `has_column_privilege`, no con la intención de la migración.
//  2 · QUE EL CONTROL DE CICLOS SEA UNA CONSTANTE. Los cuatro caminos por los que un árbol de
//      adicionales se rompe —apuntarse a sí misma, dos niveles, padre fusionado, padre de otro
//      cliente— se INTENTAN de verdad: un trigger que no puede dar rojo no es un control.
//  3 · QUE EL `left join` DE `obra_economia_cartera` DUPLIQUE O RECORTE FILAS. Agregar una columna a
//      la vista canónica del PRECIO es tocar el número que el dueño cruza contra la pestaña OBRAS:
//      se compara fila por fila el `contratado` de antes y de después.
//  4 · QUE LAS DOS RPC DE PANTALLA CAMBIEN ALGO MÁS QUE LA CLAVE NUEVA. Se captura el jsonb ANTES y
//      DESPUÉS en la misma transacción y se compara clave por clave: lo único que puede cambiar es
//      `obra_padre_id`.
//
// La migración se aplica DENTRO de la transacción y todo termina en ROLLBACK: este test no deja
// escrita ninguna relación. Aplicarla es del dueño, desde el árbol principal.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const migracion = (n) => readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations', n), 'utf8')
const MIGRACION = migracion('20260911T2000_obra_adicional_cuelga_de_su_obra_mayor.sql')
// ═══ LA CADENA, NO EL ESLABÓN (11/09/2026, después de aplicar) ═══
//
// 20260911T2100 redefine `pantalla_cliente` SOBRE la versión de 2000. Aplicar 2000 sola contra una
// base que ya tiene las dos la haría RETROCEDER, y el payload perdería `papeles_obra` y
// `carpetas_obra`: el test daría rojo por bajar una versión, no por un defecto. Se aplican las dos,
// en orden, que es lo que corre de verdad.
const LOS_PAPELES = migracion('20260911T2100_los_papeles_de_una_obra_tienen_su_carpeta.sql')

/** Las dos relaciones que el documento de evidencia puede probar. */
const ESPERADAS = [
  ['bsa-adicional', 'messina-bsa'],
  ['messina-adicional-tercer-muro', 'messina-playon-azufre'],
]

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

test('la migración del adicional deja el modelo usable y no toca ningún número', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')

    // EL ANTES, en la misma transacción: es la única referencia válida: la base cambia sola (el
    // tipo de cambio vivo entra en `obra_economia_cartera`) y comparar contra una corrida de ayer
    // daría rojo por algo que no es este cambio.
    const panelAntes = await q('select obra_id from public.obra_panel order by obra_id')
    const carteraAntes = await q(
      'select obra_canonica_id, contratado::text c from public.obra_economia_cartera order by 1')
    const clientesAntes = JSON.parse((await q('select public.pantalla_clientes()::text t'))[0].t)
    const fichaAntes = JSON.parse(
      (await q(`select public.pantalla_cliente('messina', 'obras')::text t`))[0].t)

    await c.query(MIGRACION)
    await c.query(LOS_PAPELES)

    await t.test('las dos relaciones quedan escritas, y ninguna otra obra se vuelve adicional', async () => {
      const filas = await q(
        'select id, obra_padre_id from public.obra_canonica where obra_padre_id is not null order by id')
      assert.deepEqual(filas.map((f) => [f.id, f.obra_padre_id]), ESPERADAS)
    })

    await t.test('la columna nace CON permiso de lectura y SIN permiso de escritura', async () => {
      const p = (await q(`
        select has_column_privilege('authenticated', 'public.obra_canonica', 'obra_padre_id', 'select') lee,
               has_column_privilege('authenticated', 'public.obra_canonica', 'obra_padre_id', 'update') escribe,
               has_column_privilege('service_role',  'public.obra_canonica', 'obra_padre_id', 'update') svc`))[0]
      assert.equal(p.lee, true, 'authenticated no puede LEER la columna: la ficha del cliente se cae entera')
      assert.equal(p.escribe, false, 'authenticated puede ESCRIBIR quién es adicional de quién sin ningún verbo')
      assert.equal(p.svc, true)
    })

    await t.test('`obra_panel` publica el padre y no pierde ni duplica una obra', async () => {
      const despues = await q('select obra_id, obra_padre_id from public.obra_panel order by obra_id')
      assert.deepEqual(despues.map((f) => f.obra_id), panelAntes.map((f) => f.obra_id))
      const hijos = despues.filter((f) => f.obra_padre_id)
      assert.deepEqual(hijos.map((f) => [f.obra_id, f.obra_padre_id]), ESPERADAS)
    })

    await t.test('`obra_economia_cartera` publica el padre y el contratado de cada obra es el MISMO', async () => {
      const despues = await q(
        'select obra_canonica_id, contratado::text c, obra_padre_id from public.obra_economia_cartera order by 1')
      assert.deepEqual(
        despues.map((f) => [f.obra_canonica_id, f.c]),
        carteraAntes.map((f) => [f.obra_canonica_id, f.c]),
        'el left join al padre cambió filas o montos de la vista canónica del precio')
      const muro = despues.find((f) => f.obra_canonica_id === 'messina-adicional-tercer-muro')
      assert.equal(muro?.obra_padre_id, 'messina-playon-azufre')
    })

    await t.test('las dos RPC de pantalla agregan `obra_padre_id` y NADA más', async () => {
      const clientesDespues = JSON.parse((await q('select public.pantalla_clientes()::text t'))[0].t)
      const fichaDespues = JSON.parse(
        (await q(`select public.pantalla_cliente('messina', 'obras')::text t`))[0].t)

      // Misma forma: ninguna clave nueva ni perdida en el jsonb de primer nivel.
      assert.deepEqual(Object.keys(clientesDespues).sort(), Object.keys(clientesAntes).sort())
      assert.deepEqual(Object.keys(fichaDespues).sort(), Object.keys(fichaAntes).sort())

      // Y lo de adentro, idéntico salvo la clave nueva: se le saca `obra_padre_id` a cada fila y
      // tiene que volver a ser el payload anterior.
      //
      // LAS LISTAS SE COMPARAN COMO CONJUNTO, y no es una concesión: `economia_obras` agrega SIN
      // `order by` —ninguna pantalla depende de ese orden, las dos indexan por `obra_id`—, así que
      // el `left join` nuevo puede devolver las mismas filas en otro orden sin que nada cambie para
      // nadie. Lo que este control vigila es el CONTENIDO: si una fila cambia un monto, aparece o
      // desaparece, el conjunto deja de ser el mismo.
      const sinPadre = (v) => JSON.parse(JSON.stringify(v), (k, x) => {
        if (x && typeof x === 'object' && !Array.isArray(x) && 'obra_padre_id' in x) {
          const resto = { ...x }
          delete resto.obra_padre_id
          return resto
        }
        return x
      })
      const comoConjunto = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [
        k, Array.isArray(x) ? x.map((f) => JSON.stringify(f)).sort() : x,
      ]))
      // SE LE SACA A LOS DOS LADOS, y es lo que hace que el control siga midiendo después de que el
      // dueño aplicó la migración: desde entonces el «antes» ya trae `obra_padre_id` en null, y
      // limpiar sólo el «después» daría rojo por una clave que los dos tienen.
      assert.deepEqual(comoConjunto(sinPadre(clientesDespues)), comoConjunto(sinPadre(clientesAntes)))
      assert.deepEqual(comoConjunto(sinPadre(fichaDespues)), comoConjunto(sinPadre(fichaAntes)))

      // Y la clave nueva LLEGA: las tres listas que la dibujan la traen.
      const muro = (l) => l.find((o) => (o.obra_id ?? o.obra_canonica_id) === 'messina-adicional-tercer-muro')
      assert.equal(muro(clientesDespues.obras_activas).obra_padre_id, 'messina-playon-azufre')
      assert.equal(muro(clientesDespues.obras_todas).obra_padre_id, 'messina-playon-azufre')
      assert.equal(muro(clientesDespues.economia_obras).obra_padre_id, 'messina-playon-azufre')
      assert.equal(muro(fichaDespues.obras).obra_padre_id, 'messina-playon-azufre')
      assert.equal(muro(fichaDespues.economia_obras).obra_padre_id, 'messina-playon-azufre')
      // Y la obra MADRE no quedó marcada como adicional de nadie.
      assert.equal(
        fichaDespues.obras.find((o) => o.obra_id === 'messina-playon-azufre').obra_padre_id, null)
    })

    // ═══ LOS CUATRO CAMINOS POR LOS QUE EL ÁRBOL SE ROMPE: SE INTENTAN DE VERDAD ═══
    //
    // El savepoint no es ceremonia: una excepción aborta la transacción entera y los subtests que
    // siguen fallarían por eso y no por lo que miran.
    const rechaza = async (nombre, sql, mensaje) => {
      await t.test(nombre, async () => {
        await c.query('savepoint intento')
        await assert.rejects(() => c.query(sql), mensaje)
        await c.query('rollback to savepoint intento')
      })
    }

    await rechaza('una obra no puede ser adicional de sí misma',
      `update public.obra_canonica set obra_padre_id = 'messina-bsa' where id = 'messina-bsa'`,
      /adicional de sí misma|obra_padre_id_chk/)

    await rechaza('no hay dos niveles: el adicional de un adicional se rechaza',
      `update public.obra_canonica set obra_padre_id = 'messina-adicional-tercer-muro'
        where id = 'limpieza-de-escombros'`,
      /ya es adicional de otra obra/)

    await rechaza('una obra CON adicionales no puede volverse adicional (el ciclo al revés)',
      `update public.obra_canonica set obra_padre_id = 'limpieza-de-escombros'
        where id = 'messina-playon-azufre'`,
      /ya tiene adicionales colgados/)

    await rechaza('el padre no puede ser una obra FUSIONADA: el hijo quedaría debajo de algo invisible',
      `update public.obra_canonica set obra_padre_id = 'bsa-planta' where id = 'limpieza-de-escombros'`,
      /está fusionada/)

    await rechaza('el padre no puede ser de otro cliente',
      `update public.obra_canonica set obra_padre_id = 'quattropani' where id = 'limpieza-de-escombros'`,
      /es de otro cliente/)

    await t.test('colgar un adicional legítimo SÍ se puede (el control no es un «no» a todo)', async () => {
      await c.query('savepoint legitimo')
      await c.query(
        `update public.obra_canonica set obra_padre_id = 'messina-bsa' where id = 'limpieza-de-escombros'`)
      assert.equal(
        (await q(`select obra_padre_id p from public.obra_canonica where id = 'limpieza-de-escombros'`))[0].p,
        'messina-bsa')
      await c.query('rollback to savepoint legitimo')
    })

    await t.test('un jefe de obra puede LEER obra_panel con la columna nueva puesta', async () => {
      // El caso 1 otra vez, pero con la RLS actuando: `obra_panel` es `security_invoker`, así que el
      // permiso se evalúa con el rol de quien pregunta, no con el del dueño de la vista.
      const jefe = (await q(
        `select id from perfiles where rol = 'jefe_obra' and es_prueba = false limit 1`))[0]
      if (!jefe) return // sin perfil de jefe en la base no hay nada que medir; no se inventa uno
      await c.query('savepoint como_jefe')
      await c.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: jefe.id, role: 'authenticated' })])
      await c.query('set local role authenticated')
      const filas = await q('select obra_id, obra_padre_id from public.obra_panel')
      assert.ok(filas.length >= 0)
      await c.query('reset role')
      await c.query('rollback to savepoint como_jefe')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
