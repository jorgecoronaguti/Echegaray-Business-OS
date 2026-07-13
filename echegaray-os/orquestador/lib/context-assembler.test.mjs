#!/usr/bin/env node
// Test del Context Assembler (lib/context-assembler.mjs). Hermético: usa archivos
// temporales, sin red ni DB. exit 0 = OK, exit 1 = falla.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assembleReasoningSystem, ROLE_FRAMING, GOVERNANCE_KERNEL } from './context-assembler.mjs'

let ok = 0
let fail = 0
function check(nombre, cond) {
  if (cond) ok++
  else { fail++; console.error(`FALLA: ${nombre}`) }
}

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), 'ctxasm-'))
  try {
    // Estructura: <root>/CLAUDE.md y <root>/skills/dominio-x/SKILL.md
    await writeFile(path.join(root, 'CLAUDE.md'), 'DOC ESTRATEGICO COMPLETO XYZZY', 'utf8')
    const skillDir = path.join(root, 'skills', 'dominio-x')
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, 'SKILL.md'), 'CRITERIO DE DOMINIO ABC123', 'utf8')

    // 1. Director: kernel de gobernanza, sin skill
    {
      const { system, skillLoaded, governance } = await assembleReasoningSystem({
        rootPath: root, config: { GOVERNANCE_FULL: false }, roleFraming: ROLE_FRAMING.director,
      })
      check('director: incluye el kernel de gobernanza', system.includes(GOVERNANCE_KERNEL.slice(0, 40)))
      check('director: incluye el encuadre de rol', system.includes('DIRECTOR GENERAL IA'))
      check('director: sin skill cargada', skillLoaded === false)
      check('director: gobernanza = kernel', governance === 'kernel')
      check('director: NO filtra el doc completo', !system.includes('XYZZY'))
    }

    // 2. Especialista: kernel + SKILL.md inyectada
    {
      const { system, skillLoaded } = await assembleReasoningSystem({
        rootPath: root, config: { GOVERNANCE_FULL: false },
        roleFraming: ROLE_FRAMING.specialist, contextRef: 'skills/dominio-x',
      })
      check('especialista: SKILL.md inyectada en el system', system.includes('CRITERIO DE DOMINIO ABC123'))
      check('especialista: skillLoaded true', skillLoaded === true)
      check('especialista: mantiene el kernel', system.includes(GOVERNANCE_KERNEL.slice(0, 40)))
    }

    // 3. Skill inexistente: deja constancia, no rompe, no inventa
    {
      const { system, skillLoaded } = await assembleReasoningSystem({
        rootPath: root, config: { GOVERNANCE_FULL: false },
        roleFraming: ROLE_FRAMING.specialist, contextRef: 'skills/no-existe',
      })
      check('skill ausente: no rompe', typeof system === 'string')
      check('skill ausente: skillLoaded false', skillLoaded === false)
      check('skill ausente: deja constancia explícita', system.includes('no se pudo leer la skill'))
    }

    // 4. GOVERNANCE_FULL: inyecta el CLAUDE.md completo
    {
      const { system, governance } = await assembleReasoningSystem({
        rootPath: root, config: { GOVERNANCE_FULL: true }, roleFraming: ROLE_FRAMING.director,
      })
      check('full: inyecta el CLAUDE.md completo', system.includes('XYZZY'))
      check('full: governance = full', governance === 'full')
    }

    // 5. Multi-skill por skillNames + skillsDir (vía "según la tarea", robusta al cwd)
    {
      const skillsBase = path.join(root, 'skills')
      const dirY = path.join(skillsBase, 'dominio-y')
      await mkdir(dirY, { recursive: true })
      await writeFile(path.join(dirY, 'SKILL.md'), 'CRITERIO Y DEF456', 'utf8')
      const { system, skillLoaded, skillsLoaded } = await assembleReasoningSystem({
        rootPath: root, config: { GOVERNANCE_FULL: false }, roleFraming: ROLE_FRAMING.specialist,
        skillNames: ['dominio-x', 'dominio-y'], skillsDir: skillsBase,
      })
      check('multi: carga la 1ra skill', system.includes('ABC123'))
      check('multi: carga la 2da skill', system.includes('DEF456'))
      check('multi: skillsLoaded lista ambas', skillsLoaded.length === 2 && skillsLoaded.includes('dominio-y'))
      check('multi: skillLoaded true', skillLoaded === true)
    }

    // 6. skillNames con una ausente: carga las presentes, deja constancia de la faltante
    {
      const skillsBase = path.join(root, 'skills')
      const { system, skillLoaded, skillsLoaded } = await assembleReasoningSystem({
        rootPath: root, config: { GOVERNANCE_FULL: false }, roleFraming: ROLE_FRAMING.specialist,
        skillNames: ['dominio-x', 'no-existe'], skillsDir: skillsBase,
      })
      check('multi-parcial: carga la presente', system.includes('ABC123'))
      check('multi-parcial: skillLoaded true (al menos una)', skillLoaded === true)
      check('multi-parcial: skillsLoaded solo la presente', skillsLoaded.length === 1 && skillsLoaded[0] === 'dominio-x')
      check('multi-parcial: deja constancia de la faltante', system.includes('no-existe'))
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }

  console.log(`context-assembler.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('context-assembler.test abortó:', e); process.exit(1) })
