#!/usr/bin/env node
// Test de REGRESIÓN de la auditoría de overrides de engine. Hermético (solo lee
// archivos fuente). Garantiza que ninguna tarea de RAZONAMIENTO pueda forzar
// claude-cli, y que el Builder sí lo fije deliberadamente. exit 0 = OK, 1 = falla.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ORQ = path.resolve(HERE, '..')
const REPO = path.resolve(ORQ, '..')

let ok = 0
let fail = 0
function check(nombre, cond) {
  if (cond) ok++
  else { fail++; console.error(`FALLA: ${nombre}`) }
}
const read = (p) => readFileSync(p, 'utf8')

// Handlers de RAZONAMIENTO: NO deben tener fallback literal a claude-cli.
for (const h of ['direction', 'specialist', 'consolidate', 'plan']) {
  const src = read(path.join(ORQ, 'handlers', `${h}.mjs`))
  check(`${h}.mjs no fuerza claude-cli`, !src.includes("|| 'claude-cli'"))
  check(`${h}.mjs resuelve por ruta + AI_ENGINE_DEFAULT`, src.includes('AI_ENGINE_DEFAULT'))
}

// Builder: code_change SÍ fija claude-cli deliberadamente (Nivel dev, filesystem).
{
  const src = read(path.join(ORQ, 'handlers', 'code_change.mjs'))
  check("code_change.mjs fija claude-cli (Builder deliberado)", src.includes("|| 'claude-cli'"))
}

// Web: la acción de Dirección NO debe mandar engine (ni claude-cli).
{
  const src = read(path.join(REPO, 'src/features/direccion/services/actions.ts'))
  check("actions.ts no envía p_engine: 'claude-cli'", !src.includes("p_engine: 'claude-cli'"))
  check('actions.ts no envía ningún p_engine (UI sin conocimiento de engine)', !/p_engine\s*:/.test(src))
}

// RPC: la migración correctiva default-ea p_engine a null y endurece claude-cli.
{
  const src = read(path.join(REPO, 'supabase/migrations/20260714140000_orq_submit_objective_engine_null.sql'))
  check('RPC: p_engine default null', /p_engine\s+text\s+default\s+null/i.test(src))
  check("RPC: endurece 'claude-cli' (nullif)", src.includes("nullif(p_engine, 'claude-cli')"))
}

console.log(`engine-overrides.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
