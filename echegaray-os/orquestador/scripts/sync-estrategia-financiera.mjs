#!/usr/bin/env node
// SYNC de la ESTRATEGIA FINANCIERA → public.finanzas_estrategia_vigente.
//
// POR QUÉ (25/07). El Financial Engineering produce un documento estratégico de nivel CFO
// (orquestador/lib/estrategia-financiera.mjs): qué problema financiero existe, qué estrategia conviene,
// por qué es superior a las alternativas, cuánto mejora la liquidez futura, qué riesgos quedan. La Web
// (Calendario Financiero) hace de ESA estrategia la protagonista del día — pero la Web no tiene las
// credenciales de Google ni recalcula nada. Este paso corre el motor (que lee las pestañas reales) y
// materializa su salida para que la Web la LEA. Espejo exacto de sync-plan-tesoreria.mjs.
//
// No recalcula un solo peso: estrategiaFinanciera ENSAMBLA lo que planTesoreria/modeloLiquidez ya
// deciden. Barato y sin efectos: sólo lee y calcula. Idempotente: upsert de la fila singleton id=1.
//
//   node orquestador/scripts/sync-estrategia-financiera.mjs
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { estrategiaFinanciera } from '../lib/estrategia-financiera.mjs'

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const estrategia = await estrategiaFinanciera({ google }, {})

  if (estrategia?.estado !== 'ok') {
    // 'sin dato' es un documento válido del contrato (el plan de tesorería no está disponible): se
    // guarda igual para que la Web muestre el "sin dato"/confianza degradada, nunca una pantalla en
    // blanco ni un número inventado.
    console.log(`estrategia financiera: ${estrategia?.estado || 'sin respuesta'} (${estrategia?.motivo || 'no disponible'}) — se guarda el documento tal cual`)
  }

  await query(
    `insert into public.finanzas_estrategia_vigente (id, estrategia, calculado_en, actualizado_en)
     values (1, $1::jsonb, now(), now())
     on conflict (id) do update set
       estrategia = excluded.estrategia,
       calculado_en = excluded.calculado_en,
       actualizado_en = now()`,
    [JSON.stringify(estrategia)],
  )

  if (estrategia?.estado === 'ok') {
    const gob = estrategia.horizonte_gobernante?.titulo || estrategia.horizonte_gobernante?.clave || 's/d'
    const elegida = estrategia.eleccion?.elegida || 'sin estrategia elegida'
    const conf = estrategia.nivel_confianza?.nivel || 's/d'
    console.log(`✓ estrategia materializada · horizonte gobernante: ${gob} · elegida: ${elegida} · confianza: ${conf}`)
  }
}

main().then(() => closePool()).catch(async (e) => { console.error('sync-estrategia-financiera falló:', e?.message ?? e); await closePool(); process.exit(1) })
