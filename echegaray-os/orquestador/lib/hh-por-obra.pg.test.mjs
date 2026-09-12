// LAS HORAS DE CADA OBRA EN LA FICHA DEL CLIENTE — CONTRA LOS DATOS REALES.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE LA FICHA PUBLIQUE UNA SUMA DISTINTA DE LA TABLA. `hh_obra` LEE `obra_plan_vs_real` y no
//      vuelve a sumar `registros_hh`; este test compara las dos puntas obra por obra contra la suma
//      directa. Es el control que hace imposible que nazca una TERCERA definición de HH real en
//      silencio — el 19/08/2026 se retiró `obra_hh_resumen` por ser la segunda.
//  2 · QUE «N registros» CUENTE FILAS QUE LA SUMA NO SUMÓ. El filtro de `tipo_hora` tiene que ser el
//      mismo en las dos: «677 h en 102 registros» es mentira si 9 de esos registros son ausencias.
//  3 · QUE EL DESGLOSE CONTRADIGA AL NÚMERO QUE LO ABRIÓ. La Σ de las quincenas de `hh_de_obra` tiene
//      que ser EXACTAMENTE el acumulado de la obra. Si alguna vez no cierra, hay horas que una de las
//      dos caras no ve.
//  4 · QUE UN ROL SIN PERMISO RECIBA MEDIA SUMA. La RLS de `registros_hh` muestra al rol de campo
//      SÓLO SUS horas: sin la guarda de `es_administracion()`, la ficha le dibujaría la suma de sus
//      propias horas como si fuera la de la obra. Un número creíble y falso es peor que ninguno.
//  5 · QUE LA MIGRACIÓN ESTÉ EN EL REPO Y NO EN LA BASE. Otra migración de la misma función aplicada
//      después borra la clave sin que nada se ponga rojo. El primer caso mira la función DESPLEGADA.
//
// ═══ NO CREA NI BORRA NADA ═══
//
// Ni DDL ni escrituras: cada DDL contra esta base dispara una recarga del esquema de PostgREST
// (~1,5 s de consultas de catálogo que frenan a todos) y el 11/09/2026 hubo 148 en un día. Se lee la
// base como está, dentro de una transacción que termina en ROLLBACK por el `set_config` de rol.
//
// LOS NÚMEROS NO SE CLAVAN: el timer de JORNALES importa horas cada hora y un test con «551» clavado
// se pone rojo sin que ninguna regla se haya roto. Se comparan DOS LECTURAS de la misma base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

const FILTRO = "tipo_hora in ('normal', 'extra_50', 'extra_100')"

test('las HH de la ficha del cliente son las de la cara canónica, obra por obra', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  try {
    await c.query('begin')

    // ── LA FUNCIÓN DESPLEGADA TIENE LA CLAVE ─────────────────────────────────────────────────────
    const def = (await uno(`select pg_get_functiondef('public.pantalla_cliente(text,text)'::regprocedure) d`)).d
    // `assert.ok` Y NO `assert.match`: un `match` fallido imprime el cuerpo ENTERO de la función
    // —9.000 caracteres— en la salida del test, y esa salida se paga en cada corrida de la suite.
    assert.ok(def.includes("'hh_obra'"),
      'la función desplegada no publica `hh_obra`: falta aplicar 20260911T2400 (o otra migración de '
      + 'pantalla_cliente se aplicó después y la borró)')
    assert.ok(def.includes('obra_plan_vs_real'),
      '`hh_obra` dejó de leer la cara canónica: si suma registros_hh por su cuenta, es una segunda '
      + 'definición de HH real')

    // ── LA SESIÓN DE PRUEBA: DIRECCIÓN, que es quien usa el CRM ──────────────────────────────────
    const direccion = await uno(`select id from perfiles where rol='direccion' and es_prueba = false limit 1`)
    assert.ok(direccion, 'no hay ningún perfil de dirección: sin él no se puede leer la ficha')
    await q(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])
    assert.equal((await uno(`select es_administracion() x`)).x, true)

    const clientes = await q(`select slug from public.clientes where slug is not null order by slug`)
    assert.ok(clientes.length >= 4, 'la base de prueba no tiene los clientes reales')

    await t.test('hh_obra coincide con sum(horas) directo, y cuenta las MISMAS filas', async () => {
      let conHoras = 0
      for (const { slug } of clientes) {
        const j = (await uno(`select public.pantalla_cliente($1,'obras') j`, [slug])).j
        assert.ok(Array.isArray(j.hh_obra), `«${slug}» no trajo hh_obra como lista`)
        // LA SUMA DIRECTA, con el MISMO filtro, para las obras de este cliente.
        const directo = new Map((await q(`
          select r.obra_canonica_id id, sum(r.horas)::float hh, count(*)::int n,
                 count(distinct r.persona_id)::int personas,
                 min(r.fecha)::text d0, max(r.fecha)::text d1
            from public.registros_hh r
           where r.${FILTRO}
             and r.obra_canonica_id in (
               select o.obra_id from public.obra_panel o
                where o.cliente_id = (select cliente_id from public.cliente_panel where slug = $1))
           group by 1`, [slug])).map((r) => [r.id, r]))

        for (const fila of j.hh_obra) {
          const d = directo.get(fila.obra_id)
          // Una obra puede venir por su `hh_plan` sin tener ni una hora: ahí `hh_real` es null.
          if (fila.hh_real == null) {
            assert.equal(d, undefined, `«${fila.obra_id}» dice no tener horas y la tabla tiene ${d?.hh}`)
            continue
          }
          assert.ok(d, `«${fila.obra_id}» publica ${fila.hh_real} h y la tabla no tiene ninguna`)
          assert.equal(Number(fila.hh_real), d.hh, `«${fila.obra_id}»: la ficha y la tabla no coinciden`)
          assert.equal(fila.registros, d.n, `«${fila.obra_id}»: los registros no son los que se sumaron`)
          assert.equal(fila.personas, d.personas, `«${fila.obra_id}»: las personas no cierran`)
          assert.equal(fila.inicio_real, d.d0, `«${fila.obra_id}»: el inicio no es la primera fecha con horas`)
          assert.equal(fila.ultima_fecha, d.d1, `«${fila.obra_id}»: la última carga no es la última fecha`)
          conHoras += 1
        }
        // Y NINGUNA OBRA CON HORAS SE QUEDA AFUERA: es el defecto opuesto y el más fácil de no ver.
        for (const id of directo.keys()) {
          assert.ok(j.hh_obra.some((f) => f.obra_id === id),
            `«${id}» tiene horas cargadas y la ficha de «${slug}» no las publica`)
        }
      }
      assert.ok(conHoras >= 5, `sólo ${conHoras} obras con horas: el cruce no probó casi nada`)
    })

    await t.test('viaja en Obras y en Actividad —que fecha el inicio— y en ninguna otra cara', async () => {
      for (const cara of ['obras', 'actividad']) {
        const j = (await uno(`select public.pantalla_cliente('messina',$1) j`, [cara])).j
        assert.ok(j.hh_obra.length > 0, `la cara «${cara}» tiene que traer las horas de las obras`)
      }
      // El resto de las caras no las dibuja: arrastrarlas sería peso para nada.
      for (const cara of ['documentos', 'cobranzas', 'cuenta', 'presupuestos']) {
        const j = (await uno(`select public.pantalla_cliente('messina',$1) j`, [cara])).j
        assert.deepEqual(j.hh_obra, [], `la cara «${cara}» no dibuja horas y no tiene que transportarlas`)
      }
      // Y la cara `null` —todas— las trae: es la que usa cualquier consumidor que no recorta.
      const todas = (await uno(`select public.pantalla_cliente('messina', null) j`)).j
      assert.ok(todas.hh_obra.length > 0)
    })

    await t.test('un rol que no es Administración recibe null, NUNCA media suma', async () => {
      const otro = await uno(`
        select id, rol from perfiles
         where rol is not null and rol not in ('direccion','administracion','jefe_obra') limit 1`)
      if (!otro) {
        // Que hoy no exista un perfil de campo no convierte la guarda en verdadera: se prueba sobre
        // la función, que es donde vive.
        assert.ok(def.includes('when not (select public.es_administracion()) then null::jsonb'),
          'sin un perfil de campo para probar, al menos la guarda tiene que estar escrita')
        return
      }
      await q(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: otro.id, role: 'authenticated' })])
      const j = (await uno(`select public.pantalla_cliente('messina','obras') j`)).j
      assert.equal(j.hh_obra, null,
        `el rol «${otro.rol}» recibió horas: la RLS le muestra sólo las propias y eso se dibujaría `
        + 'como la suma de la obra')
      await q(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])
    })

    await t.test('el desglose por quincena cierra con el acumulado que lo abre', async () => {
      // LA OBRA CON MÁS HORAS de la base, sea cual sea: el caso más duro y el que más días tiene.
      const mayor = await uno(`
        select obra_canonica_id id, sum(horas)::float hh from public.registros_hh
         where ${FILTRO} and obra_canonica_id is not null group by 1 order by 2 desc limit 1`)
      assert.ok(mayor, 'no hay ninguna obra con horas cargadas')

      const d = (await uno(`select public.hh_de_obra($1) j`, [mayor.id])).j
      assert.ok(d, `hh_de_obra no devolvió el desglose de «${mayor.id}»`)
      const sumaPeriodos = d.periodos.reduce((a, p) => a + Number(p.hh ?? 0), 0)
      assert.equal(sumaPeriodos, mayor.hh,
        'la Σ de las quincenas del desglose no es el acumulado de la obra: hay horas que una de las '
        + 'dos caras no ve')
      assert.equal(d.registros, (await uno(
        `select count(*)::int n from public.registros_hh where obra_canonica_id=$1 and ${FILTRO}`,
        [mayor.id])).n)

      // LA VENTANA ES LA ÚLTIMA QUINCENA CON TRABAJO, y sus celdas suman lo que ese período declara.
      const ventana = d.periodos.find((p) => p.desde === d.ventana)
      assert.ok(ventana, 'la ventana que se dibuja no está en el índice de quincenas')
      // LA ÚLTIMA QUINCENA *CON TRABAJO*, y no la última del índice: la obra más grande de la base
      // tiene una quincena posterior con SÓLO ausencias, y abrir ahí mostraría una grilla vacía de
      // una obra con 13.000 horas.
      const conTrabajo = d.periodos.filter((x) => x.hh != null)
      assert.equal(d.ventana, conTrabajo.at(-1).desde,
        'al abrir se muestra la última quincena CON HORAS TRABAJADAS')
      const sumaCeldas = d.celdas.reduce((a, x) => a + Number(x.horas ?? 0), 0)
      assert.equal(sumaCeldas, Number(ventana.hh),
        'las celdas de la grilla no suman lo que su quincena declara')

      // LAS AUSENCIAS SE VEN Y NO SUMAN: si la base tiene alguna en la ventana, tiene que viajar
      // marcada y con `horas` en null.
      const marcadas = d.celdas.filter((x) => x.ausencia || x.licencia)
      for (const m of marcadas) {
        const real = await uno(`
          select sum(horas) filter (where ${FILTRO})::float hh from public.registros_hh
           where obra_canonica_id=$1 and fecha=$2
             and persona_id is not distinct from $3::uuid`, [mayor.id, m.fecha, m.persona_id])
        assert.equal(m.horas == null ? null : Number(m.horas), real.hh,
          `la celda marcada del ${m.fecha} no dice lo que la base tiene`)
      }
    })

    await t.test('una obra que no existe no devuelve un desglose vacío: devuelve null', async () => {
      assert.equal((await uno(`select public.hh_de_obra('zz-no-existe') j`)).j, null)
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
