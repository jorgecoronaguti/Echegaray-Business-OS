// LO GASTADO POR OBRA EN LA FICHA DEL CLIENTE — CONTRA LOS DATOS REALES.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE «MATERIALES» NO SEAN LAS MISMAS FILAS QUE EL COSTO REAL DE LA OBRA. `costo_obra.materiales`
//      es un DESGLOSE del conjunto que `obra_costo_real` suma entero; este test reconstruye la resta
//      (costo_real − nómina/ARCA/financiero − anuladas − subcontratos) contra la fuente y exige que
//      cierre obra por obra. Si alguna vez no cierra, la ficha del cliente y la de la obra dicen
//      cosas distintas del mismo gasto, que es el defecto que `obra_costo_real` existe para impedir.
//  2 · QUE EL MULTIPLICADOR DE SQL NO SEA EL DE LIQUIDACIÓN. `public.multiplicador_de_costo(fecha)` y
//      `multiplicadorDeCosto(alicuotasVigentes(filas, fecha), 1)` de `costoHora.ts` son DOS
//      implementaciones de la misma regla —la suma de 3.600 registros tiene que cruzar el cable ya
//      agregada— y se separan en el primer cambio si nadie las compara. Se comparan en varias fechas,
//      incluidas las de los bordes de vigencia.
//  3 · QUE «MANO DE OBRA» NO SEA LA DE LA SOLAPA «COSTO A LA OBRA». Para una quincena real se
//      reproduce el camino de la pantalla —`repartirHorasPorObra` sobre las MISMAS filas, con las
//      tarifas vigentes— y se compara contra lo que la clave valoriza en esa ventana.
//  4 · QUE UN PARCIAL SE PUBLIQUE COMO COMPLETO. Las horas de una persona sin tarifa vigente NO pueden
//      estar dentro de `mano_obra`: tienen que salir contadas en `horas_sin_tarifa`. Hoy son TODAS
//      —`costo_hora_alicuota` está vacía—, y el control se escribe igual para que el día que se
//      carguen las alícuotas la frontera siga vigilada.
//  5 · QUE UN ROL SIN PERMISO RECIBA MEDIA SUMA. `costos_obra` deja ver al jefe de obra sólo las
//      compras de SUS obras: sin la guarda de `es_administracion()`, la ficha le dibujaría media suma
//      como si fuera el gasto de la obra.
//  6 · QUE LA MIGRACIÓN ESTÉ EN EL REPO Y NO EN LA BASE. El primer caso mira la función DESPLEGADA.
//
// ═══ POR QUÉ PIDE `ORQ_PG_DDL=1` ═══
//
// Aplica la migración DENTRO de una transacción que termina en ROLLBACK. El rollback deshace los
// objetos, pero el DDL ya disparó `pgrst_ddl_watch`: cada `create` manda a PostgREST a recargar el
// esquema y cada recarga frena ~1,5 s a todo el que esté usando la app. El 11/09/2026 hubo 148
// recargas en un día y el dueño vio la app trabada. Por eso no corre solo:
//
//     ORQ_PG_DDL=1 node --test orquestador/lib/costo-por-obra.pg.test.mjs
//
// LOS NÚMEROS NO SE CLAVAN: el timer de Compras espeja la pestaña cada hora y el de JORNALES importa
// horas; un «$154.248.233» escrito acá se pondría rojo sin que ninguna regla se haya roto. Se
// comparan DOS LECTURAS de la misma base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'
import { alicuotasVigentes, multiplicadorDeCosto } from '../../src/features/administracion/services/costoHora.ts'
import { repartirHorasPorObra } from '../../src/features/administracion/services/costoLecturas.ts'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260912T1300_el_costo_de_la_hora_se_resuelve_una_vez_por_tramo.sql'), 'utf8')

const DDL_PERMITIDO = process.env.ORQ_PG_DDL === '1'
const hayBase = DDL_PERMITIDO
  && await getPool().query('select 1').then(() => true).catch(() => false)

/** El filtro de tipo de hora de la clave, de `hh_obra` y de la solapa: lo mismo en las tres. */
const TRABAJADA = "tipo_hora in ('normal', 'extra_50', 'extra_100')"

test('lo gastado por obra: la ficha del cliente contra las fuentes', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  const uno = async (sql, params) => (await q(sql, params))[0]
  try {
    await c.query('begin')
    await c.query(MIGRACION)

    const direccion = await uno(`select id from perfiles where rol='direccion' and es_prueba = false limit 1`)
    assert.ok(direccion, 'no hay ningún perfil de dirección: sin él no se puede leer la ficha')
    await q(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])
    assert.equal((await uno(`select es_administracion() x`)).x, true)

    await t.test('la función desplegada publica la clave y la lee de donde corresponde', async () => {
      const def = (await uno(`select pg_get_functiondef('public.pantalla_cliente(text,text)'::regprocedure) d`)).d
      // `assert.ok` Y NO `assert.match`: un match fallido imprime el cuerpo ENTERO —18.000
      // caracteres— en la salida del test, y esa salida se paga en cada corrida.
      assert.ok(def.includes("'costo_obra'"), 'la función no publica `costo_obra`')
      assert.ok(def.includes('public.costos_obra'),
        '`materiales` dejó de leer el espejo de Compras: si suma otra tabla, es una segunda definición')
      assert.ok(def.includes('public.multiplicador_de_costo'),
        'la valorización dejó de usar la función del multiplicador: es la regla de Liquidación')
      assert.ok(def.includes('when not (select public.es_administracion()) then null::jsonb'),
        'se fue la guarda de rol: un jefe de obra recibiría media suma de compras')
    })

    // ═══ EL DEFECTO PROPIO DE 20260912T1300: EL TRAMO MAL ELEGIDO ═══
    //
    // La clave dejó de llamar `multiplicador_de_costo` una vez por fila —una función con cláusula SET
    // no se inlinea, y esa llamada costaba 838 de los 987 ms del bloque— y la llama una vez por
    // `desde` DISTINTO, resolviendo después por rango. Es exacto porque el conjunto de alícuotas
    // vigentes sólo cambia en esos días; pero un menor estricto donde va un menor-o-igual, o un
    // `order by` al revés, elige el tramo de al lado y devuelve un número PLAUSIBLE y más barato.
    //
    // ═══ DOS INTENTOS QUE NO SERVÍAN, Y POR QUÉ (12/09/2026) ═══
    //
    //  1 · Comparar «la función por fila» contra «el rango» con las DOS formas escritas ACÁ. Verde
    //      siempre: probaba que la idea es exacta, no que la función desplegada la aplique bien.
    //      Mutar la migración no lo movía porque el test nunca leía su lateral.
    //  2 · Agregarle las fechas de borde a esa comparación. Seguía verde por lo mismo.
    //
    // Lo que sí puede dar rojo es comparar el VALOR QUE LA CLAVE PUBLICA contra la referencia
    // calculada llamando la función por fila. Y para que el borde exista —hoy la tabla tiene UN solo
    // `desde`, 2026-01-01, y el primer registro de horas es del 05/01, así que ninguna fila cae justo
    // sobre un tramo— el test FABRICA el borde: inserta un tramo que arranca en una fecha que sí
    // tiene horas. Es legítimo porque pasa dentro de la transacción que se revierte, sobre filas
    // reales, y construye exactamente la única condición que distingue lo correcto de lo incorrecto.
    await t.test('mano_obra de la clave es la de llamar la función por fila, con un tramo en el borde', async () => {
      const obra = await uno(`
        select r.obra_canonica_id as obra_id, r.fecha::text as fecha, count(*)::int as filas
          from public.registros_hh r
         where ${TRABAJADA} and r.obra_canonica_id is not null
         group by 1, 2 having count(*) >= 2
         order by count(*) desc limit 1`)
      assert.ok(obra, 'ninguna obra tiene dos registros de horas el mismo día: sin eso no hay borde que probar')

      const cli = await uno(`select c.slug from public.clientes c
                              join public.obra_canonica o on o.cliente_id = c.id
                             where o.id = $1`, [obra.obra_id])
      assert.ok(cli?.slug, 'la obra del borde no cuelga de un cliente con slug')

      // EL TRAMO DEL BORDE: arranca EXACTAMENTE en un día con horas y con otro porcentaje, para que
      // elegir el tramo de al lado dé un número distinto. `art` porque ya existe y el UNIQUE es
      // (concepto, desde): esta fila no choca con la del 01/01.
      await q(`insert into public.costo_hora_alicuota (concepto, desde, porcentaje, base, fuente)
               values ('art', $1::date, 40, 'total', 'fila de prueba del borde — transacción revertida')`,
        [obra.fecha])

      // LA REFERENCIA: la misma cuenta de la clave pero llamando la función UNA VEZ POR FILA, que es
      // la forma que 20260912T1000 tenía desplegada y la definición contra la que hay que cerrar.
      const ref = await uno(`
        select sum(r.horas * t.valor_hora * m.v)
                 filter (where t.valor_hora is not null and m.v is not null) as mano_obra
          from public.registros_hh r
          left join lateral (select p.valor_hora from public.persona_tarifa p
                              where p.persona_id = r.persona_id and p.desde <= r.fecha
                              order by p.desde desc limit 1) t on true
          left join lateral (select public.multiplicador_de_costo(r.fecha) as v) m on true
         where ${TRABAJADA} and r.obra_canonica_id = $1`, [obra.obra_id])

      const ficha = await uno(`
        select (x.o ->> 'mano_obra')::numeric as mano_obra
          from jsonb_array_elements(public.pantalla_cliente($1, 'obras') -> 'costo_obra') x(o)
         where x.o ->> 'obra_id' = $2`, [cli.slug, obra.obra_id])
      assert.ok(ficha, `la ficha de «${cli.slug}» no publicó la obra del borde`)

      assert.equal(Number(ficha.mano_obra), Number(ref.mano_obra),
        `con un tramo que arranca el ${obra.fecha} la clave publica ${ficha.mano_obra} y llamar la `
        + `función por fila da ${ref.mano_obra}: el rango eligió otro tramo`)

      // Y QUE EL BORDE HAYA CAMBIADO ALGO. Si el tramo insertado no mueve el multiplicador de ese
      // día, la igualdad de arriba es verde por casualidad y no prueba nada.
      const b = await uno(`select public.multiplicador_de_costo($1::date) as dentro,
                                  public.multiplicador_de_costo($1::date - 1) as antes`, [obra.fecha])
      assert.notEqual(Number(b.dentro), Number(b.antes),
        'el tramo de prueba no movió el multiplicador: el control no puede dar rojo')
    })

    await t.test('el multiplicador de SQL es el de costoHora.ts, fecha por fecha', async () => {
      const filas = (await q(`select concepto, desde::text, porcentaje::float, base, coalesce(fuente,'') fuente
                                from public.costo_hora_alicuota`))
        .map((f) => ({ ...f, porcentaje: Number(f.porcentaje) }))
      // LAS FECHAS QUE IMPORTAN SON LOS BORDES: el día anterior a cada `desde`, el `desde` mismo y
      // hoy. Un `distinct on` mal ordenado da el mismo número en el medio y falla en el borde.
      const fechas = new Set(['2025-12-31', new Date().toISOString().slice(0, 10)])
      for (const f of filas) {
        fechas.add(f.desde)
        const d = new Date(`${f.desde}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() - 1)
        fechas.add(d.toISOString().slice(0, 10))
      }
      for (const fecha of fechas) {
        const sql = (await uno(`select public.multiplicador_de_costo($1::date) m`, [fecha])).m
        const ts = multiplicadorDeCosto(alicuotasVigentes(filas, fecha), 1).valor
        // NULL TIENE QUE SER NULL EN LAS DOS: un 1 en cualquiera de los dos lados afirmaría que la
        // hora cuesta lo que cobra, que es falso por un 52 % según el handoff §5.
        if (ts === null) {
          assert.equal(sql, null, `al ${fecha} SQL dio multiplicador y TypeScript no`)
          continue
        }
        assert.ok(Math.abs(Number(sql) - ts) < 1e-9,
          `al ${fecha} el multiplicador de SQL (${sql}) no es el de costoHora.ts (${ts})`)
      }
      assert.ok(fechas.size >= 2, 'el cruce del multiplicador no probó ninguna fecha')
    })

    const clientes = await q(`select slug from public.clientes where slug is not null order by slug`)
    assert.ok(clientes.length >= 4, 'la base de prueba no tiene los clientes reales')

    await t.test('materiales es el costo real MENOS lo que no es material, obra por obra', async () => {
      let conCompras = 0
      for (const { slug } of clientes) {
        const j = (await uno(`select public.pantalla_cliente($1,'obras') j`, [slug])).j
        assert.ok(Array.isArray(j.costo_obra), `«${slug}» no trajo costo_obra como lista`)
        // LA LECTURA INDEPENDIENTE: el conjunto que suma `obra_costo_real` (costos_obra puenteado por
        // obra_alias) con la resta declarada, escrita de otra forma que en la función.
        const directo = new Map((await q(`
          select a.obra_id id,
                 sum(c.total)::float                                               crudo,
                 sum(c.total) filter (where s.anulada is true)::float              anuladas,
                 sum(c.total) filter (where c.area in ('personas','contabilidad_legales','administracion_finanzas')
                                        and coalesce(s.anulada,false) = false)::float fuera,
                 sum(c.total) filter (where s.familia_material = 'Subcontratos y mano de obra'
                                        and coalesce(s.anulada,false) = false
                                        and c.area not in ('personas','contabilidad_legales','administracion_finanzas'))::float sub,
                 count(*) filter (where coalesce(s.anulada,false) = false
                                    and coalesce(s.familia_material,'') <> 'Subcontratos y mano de obra'
                                    and c.area not in ('personas','contabilidad_legales','administracion_finanzas'))::int n
            from public.costos_obra c
            join public.obra_alias a on a.alias = public.norm_obra(c.obra_texto)
                                    and a.clasificacion in ('obra','mantenimiento')
            left join public.compra_sheet s on c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
           where a.obra_id in (select o.obra_id from public.obra_panel o
                                where o.cliente_id = (select cliente_id from public.cliente_panel where slug = $1))
           group by 1`, [slug])).map((r) => [r.id, r]))

        for (const fila of j.costo_obra) {
          const d = directo.get(fila.obra_id)
          if (fila.materiales == null) {
            assert.ok(!d || d.n === 0,
              `«${fila.obra_id}» dice no tener compras y la fuente tiene ${d?.n}`)
            continue
          }
          assert.ok(d, `«${fila.obra_id}» publica materiales y la fuente no tiene ninguna compra`)
          const esperado = d.crudo - (d.anuladas ?? 0) - (d.fuera ?? 0) - (d.sub ?? 0)
          assert.ok(Math.abs(Number(fila.materiales) - esperado) < 0.01,
            `«${fila.obra_id}»: materiales ${fila.materiales} no es el costo real desglosado (${esperado})`)
          assert.equal(fila.n_comprobantes, d.n,
            `«${fila.obra_id}»: los comprobantes no son los que se sumaron`)
          // EL SUBCONTRATO NO DESAPARECE: si la fuente tiene filas de ese rubro, la clave las publica.
          if (d.sub) {
            assert.ok(Math.abs(Number(fila.subcontratos) - d.sub) < 0.01,
              `«${fila.obra_id}»: los subcontratos salieron de materiales y no viajan aparte`)
          }
          conCompras += 1
        }
        // Y NINGUNA OBRA CON COMPRAS SE QUEDA AFUERA: el defecto opuesto, y el más fácil de no ver.
        for (const [id, d] of directo) {
          if (!d.n) continue
          assert.ok(j.costo_obra.some((f) => f.obra_id === id),
            `«${id}» tiene ${d.n} comprobantes y la ficha de «${slug}» no los publica`)
        }
      }
      assert.ok(conCompras >= 4, `sólo ${conCompras} obras con compras: el cruce no probó casi nada`)
    })

    await t.test('mano de obra: la misma cuenta que la solapa «Costo a la obra» de una quincena', async () => {
      // LA QUINCENA ES LA ÚLTIMA CON HORAS TRABAJADAS, no una fija: con una fecha clavada este caso
      // dejaría de probar nada el día que la base avance.
      const v = await uno(`select max(fecha)::text hasta from public.registros_hh where ${TRABAJADA}`)
      assert.ok(v?.hasta, 'no hay horas cargadas: este caso no probó nada')
      const dia = Number(v.hasta.slice(8, 10))
      const desde = dia <= 15 ? `${v.hasta.slice(0, 8)}01` : `${v.hasta.slice(0, 8)}16`

      // EL CAMINO DE LA PANTALLA, con sus propias funciones y sus propias lecturas.
      const tarifas = new Map()
      for (const r of await q(`select persona_id, valor_hora from public.persona_tarifa
                                where desde <= $1::date order by desde asc`, [v.hasta])) {
        if (r.valor_hora != null) tarifas.set(String(r.persona_id), Number(r.valor_hora))
      }
      const filas = await q(`select obra_id, obra_canonica_id, persona_id, horas, tipo_hora
                               from public.registros_hh where fecha between $1::date and $2::date`,
      [desde, v.hasta])
      const porObra = new Map(repartirHorasPorObra(filas, tarifas, () => '').map((x) => [x.obraId, x]))
      const alic = (await q(`select concepto, desde::text, porcentaje::float, base, coalesce(fuente,'') fuente
                               from public.costo_hora_alicuota`)).map((f) => ({ ...f, porcentaje: Number(f.porcentaje) }))
      const mult = multiplicadorDeCosto(alicuotasVigentes(alic, v.hasta), 1).valor

      // LA MISMA VENTANA, POR EL CAMINO DE LA CLAVE: el cuerpo de la función recortado a la quincena.
      const deLaClave = await q(`
        select r.obra_canonica_id obra_id,
               sum(r.horas * t.valor_hora * m.v) filter (where t.valor_hora is not null and m.v is not null)::float costo,
               sum(r.horas)                      filter (where t.valor_hora is not null and m.v is not null)::float h_ok,
               sum(r.horas)                      filter (where t.valor_hora is null or m.v is null)::float h_no
          from public.registros_hh r
          left join lateral (select p.valor_hora from public.persona_tarifa p
                              where p.persona_id = r.persona_id and p.desde <= r.fecha
                              order by p.desde desc limit 1) t on true
          left join lateral (select public.multiplicador_de_costo(r.fecha) v) m on true
         where r.fecha between $1::date and $2::date and r.${TRABAJADA}
         group by 1`, [desde, v.hasta])
      assert.ok(deLaClave.length > 0, `la quincena ${desde}→${v.hasta} no tiene horas: no probó nada`)

      for (const f of deLaClave) {
        const p = porObra.get(f.obra_id ?? null)
        assert.ok(p, `«${f.obra_id}» tiene horas por la clave y la solapa no las reparte`)
        // LAS HORAS, PRIMERO: si el filtro de tipo de hora se separa, todo lo demás es casualidad.
        const hs = (f.h_ok ?? 0) + (f.h_no ?? 0)
        assert.ok(Math.abs(hs - p.horas) < 0.01,
          `«${f.obra_id}»: ${hs} h por la clave contra ${p.horas} de la solapa`)
        // EL COSTO: la solapa publica `null` cuando alguien no tiene tarifa (todo o nada por obra) y
        // la clave publica el parcial con sus horas afuera. Cuando NO falta nadie, los dos números
        // tienen que ser EXACTAMENTE el mismo.
        if (p.bolsillo != null && mult != null) {
          assert.ok(Math.abs(Number(f.costo) - p.bolsillo * mult) < 0.01,
            `«${f.obra_id}»: la clave valoriza ${f.costo} y la solapa ${p.bolsillo * mult}`)
          assert.ok(!f.h_no, `«${f.obra_id}»: la solapa no ve horas sin tarifa y la clave sí`)
        } else {
          // UN PARCIAL NO SE PUBLICA COMO COMPLETO: lo que no se pudo valorizar sale contado.
          assert.ok(f.h_no > 0,
            `«${f.obra_id}»: falta una tarifa o el multiplicador y la clave no declaró ninguna hora afuera`)
        }
      }
    })

    await t.test('costo_obra viaja SÓLO en la cara Obras, y ninguna otra lo arrastra', async () => {
      const conCostos = (await uno(`select public.pantalla_cliente('la-estrella','obras') j`)).j
      assert.ok(conCostos.costo_obra.length > 0, 'la cara Obras tiene que traer el costo de las obras')
      for (const cara of ['documentos', 'cobranzas', 'cuenta', 'presupuestos', 'actividad']) {
        const j = (await uno(`select public.pantalla_cliente('la-estrella',$1) j`, [cara])).j
        assert.deepEqual(j.costo_obra, [], `la cara «${cara}» no dibuja costos y no tiene que transportarlos`)
      }
      // Y LA CARA `null` —todas— lo trae: es la que usa cualquier consumidor que no recorta.
      assert.ok((await uno(`select public.pantalla_cliente('la-estrella', null) j`)).j.costo_obra.length > 0)
    })

    await t.test('un rol que no es Administración recibe null, NUNCA media suma', async () => {
      const otro = await uno(`
        select id, rol from perfiles
         where rol is not null and rol not in ('direccion','administracion','jefe_obra') limit 1`)
      if (!otro) return   // la guarda ya se verificó sobre la función en el primer caso
      await q(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: otro.id, role: 'authenticated' })])
      const j = (await uno(`select public.pantalla_cliente('la-estrella','obras') j`)).j
      assert.equal(j.costo_obra, null,
        `el rol «${otro.rol}» recibió costos: la RLS de costos_obra le muestra sólo sus obras`)
      await q(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
