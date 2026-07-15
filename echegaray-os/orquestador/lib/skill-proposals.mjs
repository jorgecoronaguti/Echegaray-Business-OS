// PRP-016 F3 / PRP-018 F4 — AUTO-OPTIMIZACIÓN con freno. Cuando el dueño corrige/reconfirma
// un HECHO de la empresa MÁS DE UNA VEZ (recurrencia, clase B del CLAUDE.md — no una
// observación aislada clase A), el OS PROPONE revisar la skill del dominio en el Backlog
// Autónomo (tipo gap_skill). NO muta la skill: la propuesta queda para tu visto bueno /
// el knowledge-manager. Idempotente: no duplica una propuesta abierta del mismo dominio.
import { query } from './db.mjs'

// Mapa laxo dominio del hecho → skill candidata a revisar. Es orientativo: el
// knowledge-manager afina. No define fuente de verdad, solo a dónde apunta la revisión.
const AREA_A_SKILL = {
  obra: 'direccion-obra',
  presupuesto: 'costos-presupuestacion',
  costos: 'costos-presupuestacion',
  finanzas: 'finanzas-tesoreria-construccion',
  caja: 'finanzas-tesoreria-construccion',
  impuestos: 'impuestos-construccion',
  fiscal: 'impuestos-construccion',
  laboral: 'derecho-laboral-construccion',
  legal: 'derecho-construccion-contratos',
  compras: 'compras-abastecimiento-subcontratacion',
  seguridad: 'seguridad-higiene-art',
  calidad: 'calidad-obra',
  contabilidad: 'contabilidad-constructoras',
}

/** Propone (idempotente) revisar la skill del dominio si el hecho ya se confirmó ≥2 veces.
 *  Devuelve {propuesto:boolean, motivo}. Nunca lanza (defensivo: no romper el aprendizaje). */
export async function proposeSkillImprovement({ area, afirmacion, veces }) {
  try {
    if (!veces || veces < 2) return { propuesto: false, motivo: 'sin recurrencia (clase A, no amerita)' }
    const dominio = String(area || 'general').toLowerCase()
    const skill = AREA_A_SKILL[dominio] || null
    // Título ESTABLE por dominio (sin el conteo) para que la propuesta deduplique; el
    // conteo y el hecho van en la evidencia, que se refresca en cada recurrencia.
    const titulo = `Revisar skill de ${dominio}${skill ? ` (${skill})` : ''}: correcciones recurrentes del dueño`
    // Idempotencia: si ya hay una propuesta abierta con este título, subimos su señal
    // (updated_at) en vez de duplicar. backlog_autonomo no tiene unique sobre titulo.
    const evidencia = `El dueño corrigió/reconfirmó ${veces}× un hecho de "${dominio}": "${String(afirmacion || '').slice(0, 240)}". Recurrencia ⇒ la skill del dominio podría estar desactualizada o incompleta.`
    const { rows: existe } = await query(
      `select id from public.backlog_autonomo where tipo='gap_skill' and estado='abierto' and titulo=$1 limit 1`,
      [titulo],
    )
    if (existe.length) {
      await query(
        `update public.backlog_autonomo set evidencia=$2, impacto=$3, updated_at=now() where id=$1`,
        [existe[0].id, evidencia, veces >= 3 ? 'alta' : 'media'],
      )
      return { propuesto: false, motivo: 'ya propuesto (evidencia refrescada)' }
    }
    await query(
      `insert into public.backlog_autonomo
         (tipo, titulo, evidencia, fuente, confianza, impacto, urgencia, esfuerzo, recomendacion, nivel_autonomia_permitido, estado)
       values ('gap_skill', $1, $2, 'aprendizaje del chat (correcciones del dueño)', 'observado', $3, 'media', 'bajo', $4, 'D', 'abierto')`,
      [
        titulo,
        evidencia,
        veces >= 3 ? 'alta' : 'media',
        `Revisar y, con aprobación, actualizar la skill ${skill || 'del dominio'} para incorporar este criterio; verificar que no contradiga fuentes vigentes.`,
      ],
    )
    return { propuesto: true, motivo: `gap_skill propuesto para ${dominio}` }
  } catch (e) {
    return { propuesto: false, motivo: `error: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}
