#!/usr/bin/env node
// SEED DE LA INTELIGENCIA ORGANIZACIONAL — se llena desde lo que YA EXISTE, nunca de invención.
//
// Fuentes reales que usa:
//   · frameworks  ← las carpetas de .claude/skills/ (el criterio profesional que ya se carga al chat)
//   · KPIs        ← las capacidades determinísticas ya registradas en el OS
//   · checklists  ← los controles que ya corren solos (control_administrativo)
//   · aprendizajes← public.post_mortems (los reales, con su clase A–E)
//
// Lo que NO hace: sembrar playbooks, reglas ni objetivos ficticios. Un catálogo con contenido
// inventado es peor que uno vacío, porque el OS lo citaría como criterio de la empresa. Las tablas
// de playbooks/reglas/objetivos quedan vacías a propósito y se llenan con casos reales.
//
// Idempotente: se puede correr las veces que haga falta (upsert por clave).
import { query, closePool } from '../lib/db.mjs'
import { sincronizarCatalogo } from './xsas-skills-sync.mjs'

// Los frameworks del catálogo (las skills) los sincroniza `xsas-skills-sync.mjs`, que lee el
// frontmatter de cada SKILL.md y deja la tabla igual al disco. Antes se hacía acá con un mapa
// propio de áreas y sólo entraban las 26 que ese mapa nombraba: las otras 18 no existían para el
// OS. Dos escritores de la misma tabla con criterios distintos es la trampa de las dos
// definiciones — ahora hay uno solo y este seed lo llama.

// KPIs: la capacidad que YA los calcula. `base_contable` sólo se declara donde es inequívoca por el
// dominio; donde no lo es queda NULL y el KPI nace en 'borrador' — mezclar devengado con percibido
// es la regla de oro que más plata cuesta romper, así que no se adivina.
const KPIS = [
  ['caja_disponible', 'Caja disponible', 'administracion_finanzas', 'percibido', '$', 'sube_mejor', 'briefing_caja',
    'Si baja del piso de cobertura, se prioriza pago y se acelera cobranza.'],
  ['cobranzas_vencidas', 'Cobranzas vencidas', 'administracion_finanzas', 'percibido', '$', 'baja_mejor', 'reclamo_cobranza',
    'Dispara el reclamo al cliente, escalando por antigüedad.'],
  ['obligaciones_vencidas', 'Obligaciones vencidas', 'contabilidad_legales', 'devengado', '$', 'baja_mejor', 'obligaciones',
    'Define qué se paga primero cuando la caja no alcanza.'],
  ['posicion_iva', 'Posición de IVA', 'contabilidad_legales', 'devengado', '$', 'rango', 'os_iva',
    'Anticipa el pago del mes y evita la omisión de la declaración.'],
  ['costo_real_obra', 'Costo real por obra', 'obras', 'devengado', '$', 'baja_mejor', 'costos_obras',
    'Comparado contra el presupuesto, decide si la obra sigue, se renegocia o se corta.'],
  ['margen_obra', 'Margen por obra', 'obras', 'devengado', '%', 'sube_mejor', 'salud_obra',
    'Margen real vs esperado: si cae, se revisa alcance, adicionales y productividad.'],
  ['gasto_sin_imputar', 'Gasto sin imputar a obra', 'compras', 'devengado', '$', 'baja_mejor', 'compras_proveedores',
    'Todo peso sin obra distorsiona el margen: obliga a imputar antes de cerrar el mes.'],
  ['jornales_quincena', 'Jornales por quincena', 'personas', 'percibido', '$', 'rango', 'jornales_quincena',
    'Es el pago quincenal real; contra las HH de obra mide productividad.'],
  ['no_conformidades_abiertas', 'No conformidades abiertas', 'calidad', 'n/a', 'cantidad', 'baja_mejor', 'no_conformidades',
    'Su reincidencia decide si hay que cambiar un procedimiento o un proveedor.'],
]

async function seedKpis() {
  for (const [clave, nombre, area, base, unidad, dir, cap, decision] of KPIS) {
    await query(
      `insert into public.knowledge_kpis (clave, nombre, area, base_contable, unidad, direccion, capacidad_os, decision_asociada, estado)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'vigente')
       on conflict (clave) do update set nombre=excluded.nombre, area=excluded.area,
         base_contable=excluded.base_contable, capacidad_os=excluded.capacidad_os,
         decision_asociada=excluded.decision_asociada, updated_at=now()`,
      [clave, nombre, area, base, unidad, dir, cap, decision],
    )
  }
  return KPIS.length
}

// Checklists: los controles que YA corren solos. No se inventan puntos: los del cierre
// administrativo son los que la capacidad control_administrativo ya verifica.
const CHECKLISTS = [
  ['cierre_administrativo_mes', 'Cierre administrativo del mes', 'administracion_finanzas', 'mensual', 'control_administrativo',
    [
      { punto: 'Comprobantes de ARCA conciliados contra Compras', evidencia_requerida: 'comprobante_sin_registrar en cero o justificado' },
      { punto: 'Obligaciones del mes con fecha de vencimiento cargada', evidencia_requerida: 'obligacion_resumen sin fechas nulas' },
      { punto: 'Cobranzas vencidas revisadas y reclamadas', evidencia_requerida: 'reclamo enviado o fecha de pago confirmada' },
      { punto: 'Saldos de caja actualizados en el ledger', evidencia_requerida: 'última fila de la pestaña Caja del mes' },
      { punto: 'Gasto imputado a obra', evidencia_requerida: 'gasto_sin_imputar medido y explicado' },
    ]],
]

async function seedChecklists() {
  for (const [clave, nombre, area, frec, cap, items] of CHECKLISTS) {
    await query(
      `insert into public.knowledge_checklists (clave, nombre, area, frecuencia, capacidad_os, items_json, estado)
       values ($1,$2,$3,$4,$5,$6,'vigente')
       on conflict (clave) do update set items_json=excluded.items_json, capacidad_os=excluded.capacidad_os, updated_at=now()`,
      [clave, nombre, area, frec, cap, JSON.stringify(items)],
    )
  }
  return CHECKLISTS.length
}

// Reuniones: la cadencia mínima. Cada una declara qué capacidades del OS se corren ANTES, para que
// la reunión se use para decidir y no para leer números que se podían haber visto solos.
const REUNIONES = [
  ['weekly_business_review', 'Weekly Business Review', 'gestion_general', 'semanal', 60,
    ['estado_empresa', 'briefing_caja', 'costos_obras'],
    ['Acuerdos de la semana anterior', 'Estado por área', 'Desvíos', 'Decisiones', 'Compromisos con responsable y fecha']],
  ['weekly_finance_review', 'Revisión semanal de Finanzas', 'administracion_finanzas', 'semanal', 45,
    ['briefing_caja', 'operating_review', 'reclamo_cobranza'],
    ['Posición de caja', 'Cobranzas vencidas', 'Obligaciones por vencer', 'Prioridad de pagos', 'Decisiones']],
  ['review_obra', 'Revisión por obra', 'obras', 'quincenal', 45,
    ['salud_obra', 'costos_obras', 'avance_fisico'],
    ['Avance físico vs económico', 'Costo real vs presupuesto', 'HH', 'Adicionales', 'Riesgos de plazo', 'Decisiones']],
  ['monthly_close', 'Cierre administrativo mensual', 'administracion_finanzas', 'mensual', 90,
    ['control_administrativo', 'os_iva', 'pyl'],
    ['Checklist de cierre', 'Conciliaciones pendientes', 'Posición fiscal', 'P&L del mes', 'Decisiones']],
]

async function seedReuniones() {
  for (const [clave, nombre, area, frec, dur, entradas, agenda] of REUNIONES) {
    await query(
      `insert into public.operating_meeting_templates (clave, nombre, area, frecuencia, duracion_minutos, entradas_json, agenda_json)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (clave) do update set entradas_json=excluded.entradas_json, agenda_json=excluded.agenda_json, updated_at=now()`,
      [clave, nombre, area, frec, dur, JSON.stringify(entradas), JSON.stringify(agenda)],
    )
  }
  return REUNIONES.length
}

// Aprendizajes: SÓLO desde los post-mortems reales. Clase 'A' (observación aislada) porque la
// captura autónoma nunca supera A/B: promoverlo a regla exige que una persona lo valide.
async function seedLecciones() {
  const { rows } = await query(
    `select id::text, obra_id, aprendizajes, causas_desvio from public.post_mortems
      where aprendizajes is not null`)
  let n = 0
  for (const r of rows) {
    const ya = await query(
      `select 1 from public.organizational_lessons where origen_tabla='post_mortems' and origen_id=$1`, [r.id])
    if (ya.rows.length) continue
    await query(
      `insert into public.organizational_lessons (area, titulo, situacion, aprendizaje, clase, origen_tabla, origen_id)
       values ('obras', $1, $2, $3, 'A', 'post_mortems', $4)`,
      [`Post mortem${r.obra_id ? ` — obra ${r.obra_id}` : ''}`, String(r.causas_desvio ?? '').slice(0, 2000),
        String(r.aprendizajes).slice(0, 4000), r.id],
    )
    n++
  }
  return n
}

async function main() {
  const fw = await sincronizarCatalogo()
  const kpis = await seedKpis()
  const chk = await seedChecklists()
  const reu = await seedReuniones()
  const lec = await seedLecciones()

  console.log('SEED DE INTELIGENCIA ORGANIZACIONAL')
  console.log(`  frameworks   : ${fw.total} desde .claude/skills (${fw.nuevas.length} nuevas, ${fw.actualizadas.length} actualizadas, ${fw.sinCambio} sin cambio)`)
  console.log(`  KPIs         : ${kpis} con base contable declarada y decisión asociada`)
  console.log(`  checklists   : ${chk} (los que ya corren solos)`)
  console.log(`  reuniones    : ${reu}`)
  console.log(`  aprendizajes : ${lec} nuevos desde post_mortems reales (clase A)`)
  console.log('')
  console.log('  playbooks, reglas de decisión y objetivos quedan VACÍOS a propósito:')
  console.log('  se llenan con casos reales, no con contenido inventado.')

  const { rows } = await query(
    `select a.nombre, count(b.*)::int n from public.area_canonica a
       left join public.biblioteca_completa b on b.area = a.clave
      group by a.nombre, a.orden order by a.orden`)
  console.log('\n  Biblioteca completa por área:')
  for (const r of rows) console.log(`    ${String(r.nombre).padEnd(28)} ${r.n}`)
}

main().catch((e) => { console.error('FALLÓ:', e.message); process.exitCode = 1 }).finally(() => closePool().catch(() => {}))
