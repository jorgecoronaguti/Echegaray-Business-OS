// XSAS — LA INTELIGENCIA DEL ECHEGARAY BUSINESS OS, DICHA EN UN SOLO LUGAR.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// XSAS no es un sistema nuevo: es el NOMBRE de lo que el OS ya tiene, y este módulo es el único
// lugar que lo sabe entero. Sus piezas existen desde antes y siguen donde están —no se movió ni se
// rebautizó un solo archivo—:
//
//   · los 25 agentes y sus permisos      `orq.agents` · `orq.agent_capabilities`
//   · el Work Fabric y sus trabajos      `orq.tasks`
//   · el aprendizaje de la empresa       `public.conocimiento_empresa`
//   · la puerta hacia el modelo          `orquestador/lib/ia/`
//   · el estado del razonador            `public.os_runtime` vía `estado-cerebro.mjs`
//   · las herramientas                   `orquestador/lib/tools/`
//   · el método de dominio               `.claude/skills/`
//
// ═══ POR QUÉ HACE FALTA QUE ESTO EXISTA ═══
//
// Cada pieza sabía de sí misma y ninguna sabía del conjunto. Para contestar «¿en qué estado está la
// inteligencia del OS?» había que abrir cinco cosas distintas y sumarlas de memoria — y una
// afirmación que hay que reconstruir a mano cada vez no se puede verificar ni monitorear.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO ═══
//
// **NO GASTA UN TOKEN.** XSAS se describe a sí mismo con SQL y lectura de disco, nunca preguntándole
// a un modelo. Es el punto entero: si describir el estado de la inteligencia necesitara la
// inteligencia, no habría forma de saber que está caída. Por eso también sirve como sonda: contesta
// igual con el proveedor apagado, y ahí es cuando más importa que conteste.
//
// Y NO DUPLICA LA BASE: no guarda copia de nada. Lee las fuentes canónicas y compone. Un dato que
// aparezca acá y no esté en su tabla es un defecto de este archivo, no un dato nuevo.

import { readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cerebroDisponible } from './estado-cerebro.mjs'
import { CAPACIDAD, modeloPara } from './ia/capacidad.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')

/**
 * LOS TRES NIVELES DE OPERACIÓN. Son estados del OS entero, no del proveedor.
 *
 * `FULL`     el razonador contesta: XSAS puede levantar razonamiento cuando los datos no alcanzan.
 * `NO_LLM`   no hay razonador. TODO lo determinístico sigue andando —cálculos, SQL, reglas,
 *            permisos, timers, generadores del Sheet, el portal— y lo que necesita lenguaje espera.
 * `DEGRADED` hay razonador pero algo del conjunto no está (la base no contesta, no hay agentes).
 *
 * No hay un nivel «LOCAL»: hoy no hay modelo local y declarar un estado que nada puede alcanzar
 * sería una promesa. Cuando exista, entra acá.
 */
export const NIVEL = Object.freeze({ FULL: 'FULL', DEGRADED: 'DEGRADED', NO_LLM: 'NO_LLM' })

/** Los dos agentes del BUILDER: construyen el propio OS y por eso pueden razonar con Claude Code.
 *  Cualquier otro que lo haga es una dependencia del negocio con la cuota de una herramienta de
 *  desarrollo — lo verifica `verificar-independencia-ia.mjs`, control 8. */
export const AGENTES_DEL_BUILDER = Object.freeze(['implementer', 'software-architect'])

/** Cuenta archivos de un directorio que cumplan un filtro. Ausente = 0, nunca una excepción: el
 *  estado de XSAS tiene que poder leerse en una VM donde falte una carpeta. */
function contar(ruta, filtro) {
  try {
    if (!existsSync(ruta)) return 0
    return readdirSync(ruta, { withFileTypes: true }).filter(filtro).length
  } catch {
    return 0
  }
}

/** Las herramientas que el OS le puede prestar a un agente. Viven en disco, no en la base. */
export function herramientasDelOs() {
  return contar(join(RAIZ, 'orquestador', 'lib', 'tools'),
    (e) => e.isFile() && e.name.endsWith('.mjs') && !e.name.includes('.test.'))
}

/** El método de dominio: una carpeta por skill. */
export function skillsDelOs() {
  return contar(join(RAIZ, '.claude', 'skills'), (e) => e.isDirectory())
}

/**
 * LOS CIRCUITOS PLAN → REAL QUE HOY ESTÁN VIVOS.
 *
 * ═══ POR QUÉ ESTÁ ACÁ Y NO EN UN MÓDULO NUEVO ═══
 *
 * Ninguno de estos circuitos se construyó hoy: finanzas ya congelaba cada predicción del motor en
 * `finanzas_caja_negra` para medirla después, y obra ya tenía una tabla de rendimientos. Lo que
 * faltaba era que XSAS SUPIERA que existen y pudiera decir si están alimentándose o secos — un
 * circuito de aprendizaje que dejó de recibir hechos no avisa: simplemente deja de aprender, y por
 * fuera se ve igual que uno sano.
 *
 * Cada entrada trae de dónde sale su cuenta, así que discutir el número lleva a una tabla.
 */
export const CIRCUITOS = Object.freeze([
  { dominio: 'obra', mide: 'HH y rendimiento planificados contra los ejecutados',
    sql: "select count(*)::int n, max(actualizado_en)::text ultimo from public.rendimiento_historico where fuente = 'ejecucion-real'" },
  { dominio: 'finanzas', mide: 'lo que el motor de tesorería predijo contra la caja real',
    sql: 'select count(*)::int n, max(registrado_en)::text ultimo from public.finanzas_caja_negra' },
  { dominio: 'presupuesto', mide: 'las horas cotizadas contra las que costó hacerlo',
    sql: 'select count(*)::int n, max(actualizado_en)::text ultimo from public.rendimiento_historico where hs_unitarias_plan is not null' },
])

/** Corre los circuitos. Uno que no se puede leer se declara así, nunca como «cero hechos». */
export async function circuitosDeAprendizaje(query) {
  const out = []
  for (const c of CIRCUITOS) {
    try {
      const { rows } = await query(c.sql)
      out.push({ dominio: c.dominio, mide: c.mide, hechos: rows[0]?.n ?? 0, ultimo: rows[0]?.ultimo ?? null })
    } catch (e) {
      out.push({ dominio: c.dominio, mide: c.mide, hechos: null, noSePudoLeer: String(e?.message ?? e).slice(0, 80) })
    }
  }
  return out
}

/**
 * NÚCLEO PURO: el nivel de operación a partir de lo que se pudo leer.
 *
 * Se decide acá —y no en la consulta— para poder probarlo sin base. El orden importa: sin razonador
 * el nivel es NO_LLM aunque todo lo demás esté sano, porque es la diferencia que cambia lo que el OS
 * puede hacer. `DEGRADED` queda para cuando el razonador está pero el conjunto no.
 */
export function nivelDeOperacion({ razonador, base, agentes }) {
  if (!razonador) return NIVEL.NO_LLM
  if (!base || !agentes) return NIVEL.DEGRADED
  return NIVEL.FULL
}

/**
 * EL ESTADO DE XSAS, COMPLETO Y SIN GASTAR UN TOKEN.
 *
 * Lo que no se pudo leer se declara como `null` y baja el nivel a DEGRADED: un control que no pudo
 * mirar no dice «está bien». Nunca lanza — este módulo tiene que poder contestar justo cuando algo
 * se rompió, que es cuando se lo consulta.
 */
export async function estadoDeXsas() {
  const motor = await cerebroDisponible()

  let base = null
  let agentes = null
  let conocimiento = null
  let empresa = null
  let trabajos = null
  let costo = null
  // POR QUÉ NO SE PUDO LEER, cuando no se pudo. Un `catch` mudo deja el estado en `null` sin decir
  // si la base está caída o si la consulta está mal escrita — y son dos emergencias distintas.
  // Este archivo se estrenó con ese defecto: `array_length` sobre una columna `text` tiraba, el
  // catch se lo tragaba, y el cuadro publicaba «no se pudo leer la base» con la base sana.
  let porQueNo = null
  try {
    const { query } = await import('./db.mjs')
    // Los agentes CON sus permisos: la identidad y lo que cada uno puede tocar son del OS, no del
    // proveedor. Es el invariante del mandato y por eso viaja en el estado.
    const a = await query(`
      select a.slug, a.role, a.default_engine, a.enabled,
             -- allowed_tools es TEXT, no un array: se cuenta por coma. Vacío o nulo = 0.
             coalesce(array_length(string_to_array(nullif(btrim(a.allowed_tools), ''), ','), 1), 0) as herramientas,
             coalesce(array_agg(c.capability_slug) filter (where c.capability_slug is not null), '{}') as capacidades
        from orq.agents a
        left join orq.agent_capabilities c on c.agent_id = a.id
       group by a.slug, a.role, a.default_engine, a.enabled, a.allowed_tools
       order by a.slug`)
    agentes = {
      total: a.rowCount,
      habilitados: a.rows.filter((r) => r.enabled !== false).length,
      // El negocio y el Builder se cuentan aparte a propósito: son dos poblaciones con cuotas y
      // riesgos distintos, y mezclarlas esconde justamente lo que el mandato vigila.
      deNegocio: a.rows.filter((r) => !AGENTES_DEL_BUILDER.includes(r.slug)).length,
      delBuilder: a.rows.filter((r) => AGENTES_DEL_BUILDER.includes(r.slug)).length,
      conClaudeCode: a.rows.filter((r) => String(r.default_engine ?? '').includes('claude-cli')).length,
      lista: a.rows.map((r) => ({
        slug: r.slug, rol: r.role, motor: r.default_engine, habilitado: r.enabled !== false,
        herramientas: Number(r.herramientas), capacidades: r.capacidades,
      })),
    }
    base = true

    // EL APRENDIZAJE, POR NIVEL DE CERTEZA. `conocimiento_empresa` ya distingue lo confirmado de lo
    // que todavía es una observación: se publica esa distinción, no un total que las mezcle.
    const k = await query(`
      select area, count(*)::int n,
             count(*) filter (where veces_confirmado >= 2)::int confirmadas,
             count(*) filter (where vigente is false)::int retiradas
        from public.conocimiento_empresa group by area order by n desc`)
    // POR NATURALEZA, que es la distinción que gobierna todo lo demás: un hecho medido y una
    // hipótesis de un modelo no son la misma clase de cosa y el total que las suma no dice nada.
    const kt = await query(`
      select tipo, count(*)::int n from public.conocimiento_empresa
       where vigente is not false group by tipo`)
    conocimiento = {
      afirmaciones: k.rows.reduce((s, r) => s + r.n, 0),
      confirmadas: k.rows.reduce((s, r) => s + r.confirmadas, 0),
      retiradas: k.rows.reduce((s, r) => s + r.retiradas, 0),
      porArea: k.rows.map((r) => ({ area: r.area, afirmaciones: r.n, confirmadas: r.confirmadas })),
      porTipo: Object.fromEntries(kt.rows.map((r) => [r.tipo, r.n])),
    }

    // ═══ CUÁNTO CUESTA LA INTELIGENCIA, Y DE QUIÉN ES EL GASTO ═══
    //
    // La pregunta que el dueño pidió poder contestar: «¿qué funciones/agentes están consumiendo IA
    // y cuánto?». Hasta hoy no se podía: 346 de 365 llamadas no decían qué agente las pidió, porque
    // el camino viejo no lo registra. Lo que falta se DICE —`sinAtribuir`— en vez de repartirlo.
    const c = await query(`
      select coalesce(agente, '(sin atribuir)') agente,
             coalesce(funcion, '(sin atribuir)') funcion,
             count(*)::int llamadas,
             sum(usd) usd,
             count(*) filter (where ok is false)::int fallidas,
             count(*) filter (where usd is null)::int sin_precio
        from orq.chat_cost
       where ts > now() - interval '30 days'
       group by 1, 2 order by sum(usd) desc nulls last limit 10`)
    const tot = await query(`
      select count(*)::int llamadas, sum(usd) usd,
             count(*) filter (where agente is null)::int sin_atribuir,
             sum(usd) filter (where agente is null) usd_sin_atribuir
        from orq.chat_cost where ts > now() - interval '30 days'`)
    const T = tot.rows[0] ?? {}
    costo = {
      ventana: '30 días',
      llamadas: T.llamadas ?? 0,
      usd: T.usd == null ? null : Number(T.usd),
      // Lo que se gastó SIN saber quién lo pidió. Es la medida de cuánto falta migrar a la puerta.
      sinAtribuir: T.sin_atribuir ?? 0,
      usdSinAtribuir: T.usd_sin_atribuir == null ? null : Number(T.usd_sin_atribuir),
      porAgente: c.rows.map((r) => ({
        agente: r.agente, funcion: r.funcion, llamadas: r.llamadas,
        usd: r.usd == null ? null : Number(r.usd), fallidas: r.fallidas, sinPrecio: r.sin_precio,
      })),
    }

    // ═══ LO QUE XSAS SABE DE ECHEGARAY ═══
    //
    // No es una copia: se cuenta sobre las vistas que componen las fuentes canónicas. Sirve para
    // contestar «¿de cuánto de la empresa tiene estado real?» sin abrir siete tablas.
    const e1 = await query(`
      select count(*)::int obras,
             count(*) filter (where estado = 'activa')::int activas,
             count(distinct cliente_id)::int clientes,
             count(*) filter (where avance_ponderado_pct is not null)::int con_avance
        from public.xsas_obra`)
    const e2 = await query(`
      select count(*)::int actividades,
             count(*) filter (where plan_hh is not null or plan_cantidad is not null)::int con_plan,
             count(*) filter (where hh_real is not null or cantidad_real is not null)::int con_real,
             count(*) filter (where (plan_hh is not null and hh_real is not null))::int comparables,
             count(*) filter (where tarea_tipo_id is not null)::int con_tarea_tipo
        from public.xsas_actividad`)
    // El aprendizaje de obra, por estado. `REFERENCIA` es la tabla con la que se venía cotizando;
    // el resto es lo que la ejecución enseñó.
    const e3 = await query(`
      select estado, count(*)::int n from public.rendimiento_historico group by estado`)
    empresa = {
      ...e1.rows[0],
      ...e2.rows[0],
      rendimientos: Object.fromEntries(e3.rows.map((r) => [r.estado, r.n])),
      circuitos: await circuitosDeAprendizaje(query),
    }

    const t = await query(`select state, count(*)::int n from orq.tasks group by 1`)
    const por = Object.fromEntries(t.rows.map((r) => [r.state, r.n]))
    trabajos = {
      porEstado: por,
      // «Activo» es lo que el Work Fabric todavía tiene entre manos. `dead_letter` NO entra: está
      // detenido esperando a una persona, y contarlo como activo diría que el OS está trabajando en
      // algo que en realidad está trabado.
      activos: (por.ready ?? 0) + (por.running ?? 0) + (por.retrying ?? 0) + (por.leased ?? 0),
      trabados: por.dead_letter ?? 0,
      completados: por.succeeded ?? 0,
    }
  } catch (e) {
    // La base no contestó. Se dice CON EL MOTIVO, y no se rellena con ceros: cero agentes y «no
    // pude preguntar» son cosas distintas y sólo una de las dos es una emergencia.
    base = false
    porQueNo = String(e?.message ?? e).slice(0, 200)
  }

  const nivel = nivelDeOperacion({ razonador: motor.disponible, base, agentes: agentes?.total > 0 })

  return {
    nombre: 'XSAS',
    de: 'Echegaray Business OS',
    nivel,
    // EL MOTOR ES INFRAESTRUCTURA, Y SE DICE ASÍ. Cambiarlo no cambia nada de lo de arriba.
    motor: {
      disponible: motor.disponible,
      sinCreditoDesde: motor.desde ?? null,
      puerta: 'orquestador/lib/ia',
      porCapacidad: {
        [CAPACIDAD.SIMPLE]: modeloPara(CAPACIDAD.SIMPLE),
        [CAPACIDAD.NORMAL]: modeloPara(CAPACIDAD.NORMAL),
        [CAPACIDAD.COMPLEX]: modeloPara(CAPACIDAD.COMPLEX),
      },
    },
    agentes,
    noSePudoLeer: porQueNo,
    conocimiento,
    empresa,
    trabajos,
    costo,
    herramientas: herramientasDelOs(),
    skills: skillsDelOs(),
    // Lo que sigue andando en cada nivel. No es decorativo: es la respuesta a «¿qué pierdo si se
    // cae el proveedor?», y está acá para que nadie tenga que deducirla.
    sinRazonador: [
      'el portal del cliente y toda la web',
      'los cálculos, el SQL y las reglas de negocio',
      'los permisos, la RLS y el aislamiento por obra',
      'los timers, los generadores del Sheet y los sincronizadores',
      'el Work Fabric para trabajos que no razonan',
      'el ciclo de obra: plan contra real y el rendimiento que aprende de la ejecución',
    ],
    leido_en: new Date().toISOString(),
  }
}

/** El estado en una línea, para un log o un healthcheck. */
export function resumirEstado(e) {
  const partes = [
    `XSAS ${e.nivel}`,
    `motor ${e.motor.disponible ? 'ok' : 'CAÍDO'}`,
    e.agentes ? `${e.agentes.deNegocio} agentes de negocio` : 'agentes: no se pudo leer',
    `${e.herramientas} herramientas`,
    `${e.skills} skills`,
    e.conocimiento ? `${e.conocimiento.afirmaciones} afirmaciones (${e.conocimiento.confirmadas} confirmadas)` : 'conocimiento: no se pudo leer',
    e.trabajos ? `${e.trabajos.activos} trabajos activos` : 'trabajos: no se pudo leer',
  ]
  return partes.join(' · ')
}
