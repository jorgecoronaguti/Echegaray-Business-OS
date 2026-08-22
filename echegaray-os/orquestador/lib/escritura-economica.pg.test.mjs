// LA ESCRITURA ECONÓMICA, EL CATÁLOGO DE DRIVE Y LA BITÁCORA — §25, §26, §29-fundación.
//
// Los tres defectos se midieron contra la base antes de escribir una línea, y los tres tests de
// abajo se ponen ROJOS si se revierte su migración:
//
// 1 · §25 — `personas.retribucion_pactada`, `obras.monto_contratado` y
//     `obra_canonica.monto_contratado` tenían `attacl` NULL con el GRANT de tabla incluyendo `w`.
//     El jefe de obra —que `es_administracion()` incluye— NO PODÍA LEERLOS Y SÍ PISARLOS. Se prueba
//     asumiendo el rol, no leyendo el catálogo: un `has_column_privilege` verificaría el mismo
//     GRANT que la migración escribió, que es validar un control con la información que produce.
// 2 · §26 — `drive_index` era `using (true)`: 3.593 nombres y rutas de `administracion`,
//     `archivo-fiscal` y `libro-sueldos` para cualquier sesión. Se prueba con el rol `campo` real,
//     que tiene persona vinculada y 52 documentos de legajo.
// 3 · §29 — no existía dónde registrar QUÉ cambió. Se prueba que la fila aparece con autor y que
//     la retribución NO viaja en claro.
//
// Las migraciones se aplican DENTRO de la transacción y todo termina en ROLLBACK: la base no queda
// tocada. Sin base, se salta — no se inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACIONES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')
const ARCHIVOS = [
  '20260821T5000_leer_la_plata_estaba_cerrado_escribirla_no.sql',
  '20260821T5100_el_catalogo_de_drive_deja_de_ser_publico.sql',
  '20260821T5200_cada_cambio_deja_quien_y_cuando.sql',
]

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)
const jwt = (id) => JSON.stringify({ sub: id, role: 'authenticated' })

test('escritura económica, drive_index y bitácora — contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  /** Asume un usuario del OS: claims + rol de Postgres. Sin `set local role` los GRANT de columna
   *  no se evalúan (la conexión es dueña de las tablas) y el test daría verde con el agujero puesto. */
  const como = async (id) => {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [jwt(id)])
    await c.query('set local role authenticated')
  }
  /** Volver al dueño SIN un `rollback to savepoint`. La primera versión de este test soltaba el rol
   *  volviendo al savepoint, y así descartaba las escrituras que después decía verificar: los tres
   *  chequeos de efecto daban rojo contra un código correcto. Releer el efecto exige que el efecto
   *  siga existiendo. */
  const volver = async () => {
    await c.query('reset role')
    await c.query(`select set_config('request.jwt.claims', '', true)`)
  }
  /** La sonda que DEBE fallar va en su propio savepoint: el error aborta la transacción entera. */
  const rechaza = async (sql, params, re, mensaje) => {
    await c.query('savepoint sonda')
    await assert.rejects(() => c.query(sql, params), re, mensaje)
    await c.query('rollback to savepoint sonda')
  }

  try {
    await c.query('begin')
    for (const a of ARCHIVOS) await c.query(await readFile(join(MIGRACIONES, a), 'utf8'))

    const dir = await uno(`select id from perfiles where rol='direccion' limit 1`)
    const jefe = await uno(`select id from perfiles where rol='jefe_obra' limit 1`)
    // El cuarto rol real del OS es `campo`, no `empleado` (CHECK de `perfiles`), y sólo uno tiene
    // persona vinculada — sin persona no hay legajo propio que ver.
    const campo = await uno(
      `select id, persona_id from perfiles where rol='campo' and persona_id is not null limit 1`)

    const OBRA = 'zz-test-escritura-economica'
    await c.query(`insert into obra_canonica (id, nombre, monto_contratado) values ($1,'ZZ Test', 1000)`, [OBRA])
    const per = await uno(
      `insert into personas (nombre_completo, puesto, retribucion_pactada)
       values ('ZZ TEST PERSONA', 'oficial', 3910) returning id`)

    // ── §25 ───────────────────────────────────────────────────────────────────────────────────
    await t.test('el jefe de obra no puede pisar la retribución, y sigue escribiendo el resto',
      { skip: !jefe && 'sin perfil jefe_obra' }, async () => {
        await c.query('savepoint como_jefe')
        await como(jefe.id)

        await rechaza(`update personas set retribucion_pactada = 1 where id = $1`, [per.id],
          /permission denied|permiso/i, 'el jefe pisó retribucion_pactada por PostgREST')
        await rechaza(`select fijar_retribucion($1, 1)`, [per.id],
          /Dirección o Administración/i, 'el RPC dejó pasar a quien no ve economía')

        // LA TRAMPA YA PAGADA: un regrant mal hecho deja la columna no sensible sin escribir y la
        // web guarda en silencio contra un default. Se verifica que lo operativo SIGUE andando.
        const tocadas = await c.query(`update personas set puesto='capataz' where id=$1`, [per.id])
        assert.equal(tocadas.rowCount, 1, 'el jefe dejó de poder editar el puesto')
        assert.equal((await uno(`select puesto from personas where id=$1`, [per.id])).puesto, 'capataz')

        await rechaza(`update obra_canonica set monto_contratado = 1 where id = $1`, [OBRA],
          /permission denied|permiso/i, 'el jefe pisó monto_contratado por PostgREST')
        const obraTocada = await c.query(`update obra_canonica set nombre='ZZ Renombrada' where id=$1`, [OBRA])
        assert.equal(obraTocada.rowCount, 1, 'el jefe dejó de poder editar la obra')

        await c.query('rollback to savepoint como_jefe')
      })

    await t.test('dirección fija los dos montos por RPC y el efecto se relee',
      { skip: !dir && 'sin perfil direccion' }, async () => {
        await como(dir.id)

        const r = await uno(`select fijar_retribucion($1, 4200) as v`, [per.id])
        assert.equal(Number(r.v), 4200, 'el RPC no devolvió lo que escribió')
        await rechaza(`select fijar_retribucion($1, -1)`, [per.id],
          /no puede ser negativa/i, 'entró una retribución negativa')

        const m = await uno(`select fijar_monto_contratado($1, 7500000) as v`, [OBRA])
        assert.equal(Number(m.v), 7500000)
        await rechaza(`select fijar_monto_contratado($1, -1)`, [OBRA],
          /no puede ser negativo/i, 'entró un monto contratado negativo')

        await volver()
        // SE RELEE EL EFECTO, no el 204: el valor sale de la tabla, fuera del rol que lo escribió.
        assert.equal(Number((await uno(`select retribucion_pactada r from personas where id=$1`, [per.id])).r), 4200)
        assert.equal(Number((await uno(`select monto_contratado m from obra_canonica where id=$1`, [OBRA])).m), 7500000)
      })

    await t.test('campo no escribe el legajo de nadie', { skip: !campo && 'sin perfil campo' }, async () => {
      await c.query('savepoint como_campo')
      await como(campo.id)
      await rechaza(`update personas set retribucion_pactada = 1 where id = $1`, [per.id],
        /permission denied|permiso/i, 'campo llegó a la columna de plata')
      // El puesto sí está en su GRANT: lo que lo frena es la RLS, y frenar por RLS son CERO FILAS,
      // no un error. Si esto devolviera 1, `personas_update` se habría ensanchado sin que nadie mire.
      const tocadas = await c.query(`update personas set puesto='ZZ' where id=$1`, [per.id])
      assert.equal(tocadas.rowCount, 0, 'campo editó el legajo de otra persona')
      await c.query('rollback to savepoint como_campo')
    })

    // ── §26 ───────────────────────────────────────────────────────────────────────────────────
    await t.test('drive_index: campo ve su legajo y no el archivo fiscal',
      { skip: !campo && 'sin perfil campo con persona' }, async () => {
        const propios = await uno(
          `select count(*)::int n from documentacion_legajo where persona_id=$1 and drive_file_id is not null`,
          [campo.persona_id])
        assert.ok(propios.n > 0, 'la persona de prueba no tiene documentos de legajo indexados')

        await c.query('savepoint como_campo2')
        await como(campo.id)
        const total = await uno(`select count(*)::int n from drive_index`)
        assert.equal(total.n, propios.n,
          `campo vio ${total.n} filas del catálogo y sólo le corresponden sus ${propios.n} de legajo`)
        const fiscal = await uno(`select count(*)::int n from drive_index where path like 'archivo-fiscal/%'`)
        assert.equal(fiscal.n, 0, 'campo listó archivo-fiscal/')
        const sueldos = await uno(`select count(*)::int n from drive_index where path like 'libro-sueldos/%'`)
        assert.equal(sueldos.n, 0, 'campo listó libro-sueldos/')
        // La puerta de atrás: la vista definer salteaba la policy.
        await rechaza(`select count(*) from v_drive_busqueda_documentos`, [],
          /permission denied|permiso/i, 'la vista definer sigue abierta para authenticated')
        await c.query('rollback to savepoint como_campo2')
      })

    await t.test('drive_index: dirección ve el catálogo entero',
      { skip: !dir && 'sin perfil direccion' }, async () => {
        const todo = Number((await uno(`select count(*)::int n from drive_index`)).n)
        await c.query('savepoint como_dir2')
        await como(dir.id)
        const visto = Number((await uno(`select count(*)::int n from drive_index`)).n)
        await c.query('rollback to savepoint como_dir2')
        assert.equal(visto, todo, 'dirección perdió filas del catálogo')
      })

    // El `service_role` NO pasa por esta policy: `drive_index_srv` es `for all to service_role
    // using (true)` y los ~12 consumidores del orquestador entran por ahí. No se testea acá porque
    // testearlo probaría el bypass, no la policy — y el bypass es deliberado.

    // ── §29 ───────────────────────────────────────────────────────────────────────────────────
    await t.test('la bitácora registra quién cambió qué, y tapa la plata',
      { skip: !dir && 'sin perfil direccion' }, async () => {
        await como(dir.id)
        await c.query(`update personas set categoria='OFICIAL ESPECIALIZADO' where id=$1`, [per.id])
        await q(`select fijar_retribucion($1, 5555)`, [per.id])
        await q(`select fijar_monto_contratado($1, 9999999)`, [OBRA])
        // Nadie escribe la bitácora a mano: si esto entrara, un auditado podría fabricar su rastro.
        await rechaza(`insert into entidad_cambio (entidad, entidad_id, campo) values ('x','y','z')`, [],
          /permission denied|permiso/i, 'la bitácora es escribible por PostgREST')
        await volver()

        const filas = await q(
          `select campo, antes, despues, autor::text from entidad_cambio
            where entidad='personas' and entidad_id=$1::text order by campo`, [per.id])
        const cat = filas.find((f) => f.campo === 'categoria')
        assert.ok(cat, 'un cambio de categoría no dejó rastro')
        assert.equal(cat.despues, 'OFICIAL ESPECIALIZADO')
        assert.equal(cat.autor, dir.id, 'la bitácora no guardó quién')

        const ret = filas.find((f) => f.campo === 'retribucion_pactada')
        assert.ok(ret, 'un cambio de retribución no dejó rastro')
        assert.equal(ret.despues, '•••', 'la retribución nueva viaja en claro por la bitácora')
        assert.equal(ret.antes, '•••', 'la retribución vieja viaja en claro por la bitácora')
        const enClaro = JSON.stringify(filas)
        for (const n of ['5555', '4200', '3910']) {
          assert.ok(!enClaro.includes(n), `el monto ${n} aparece en claro en entidad_cambio`)
        }

        const obraFilas = await q(
          `select campo, antes, despues from entidad_cambio where entidad='obra_canonica' and entidad_id=$1`,
          [OBRA])
        assert.ok(obraFilas.length > 0, 'un cambio de monto contratado no dejó rastro')
        assert.equal(obraFilas[0].campo, 'monto_contratado')
        assert.equal(obraFilas[0].despues, '•••')
      })

    await t.test('la bitácora la lee administración y nadie más',
      { skip: !campo && 'sin perfil campo' }, async () => {
        await c.query('savepoint como_campo3')
        await como(campo.id)
        const n = await uno(`select count(*)::int n from entidad_cambio`)
        assert.equal(n.n, 0, 'campo leyó la bitácora de cambios')
        await c.query('rollback to savepoint como_campo3')
        if (jefe) {
          await c.query('savepoint como_jefe3')
          await como(jefe.id)
          const m = await uno(`select count(*)::int n from entidad_cambio where entidad='personas'`)
          assert.ok(m.n > 0, 'el jefe de obra dejó de ver la bitácora que la Ficha 360 necesita')
          await c.query('rollback to savepoint como_jefe3')
        }
      })
  } finally {
    await c.query('rollback')
    c.release()
    await getPool().end()
  }
})
