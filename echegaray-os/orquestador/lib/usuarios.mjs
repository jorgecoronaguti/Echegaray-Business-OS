// PRP-022 — USUARIOS Y ROLES. Resuelve quién es (por email del login Google) y qué puede
// hacer (rol → capacidades). La lista blanca vive en public.usuarios_os. El mapa de
// capacidades vive en código (versionado, auditable). La ENFORCEMENT se aplica en el canal
// cuando el login por usuario esté cableado; hoy esto es la base resoluble y testeable.
import { query } from './db.mjs'

// Capacidades por ROL. '*' = todo. El super_admin (Dirección) ve y hace todo, incluido
// aprobar Nivel E y ver caja/fiscal sensible. El 'usuario' (operativo, ej. HyS, Ingeniería)
// ve lo operativo de obra pero NO lo financiero sensible ni aprueba operaciones externas.
export const ROL_CAPS = {
  super_admin: ['*'],
  usuario: [
    'ayuda', 'memoria', 'obras_read', 'avance_fisico', 'cuadro_obra',
    'briefing_operativo', 'aprender', 'preguntar',
  ],
}

// Capacidades sensibles que un 'usuario' NO tiene (se listan explícitas para claridad y
// para que la enforcement sea evidente): caja/plata, fiscal/deuda, costo de API, aprobar
// operaciones (Nivel E), gestión de otros usuarios.
export const CAPS_SENSIBLES = ['caja', 'proyeccion_caja', 'priorizar_caja', 'fiscal', 'costo_api', 'aprobar_operacion', 'gestion_usuarios']

// Capacidades del CLASIFICADOR (advise.*) que son financieras/fiscales/contables: un
// 'usuario' NO accede a ellas por el CAMINO GENERAL (razonamiento libre). Cierra el hueco
// de que un pedido sensible que esquiva las detecciones determinísticas caiga al modelo sin
// filtro. Las vistas permitidas al usuario (cuadro de obra, avance, briefing) responden por
// su propia detección ANTES de llegar acá, así que gatear finance/tax/accounting es seguro.
export const CAPS_CLASIFICADOR_SENSIBLES = ['advise.finance', 'advise.tax', 'advise.accounting']
export function capClasificadorSensible(capability) {
  return CAPS_CLASIFICADOR_SENSIBLES.includes(capability)
}

/** ¿El rol tiene la capacidad? super_admin siempre; usuario según ROL_CAPS. */
export function puede(rol, cap) {
  const caps = ROL_CAPS[rol]
  if (!caps) return false
  if (caps.includes('*')) return true
  return caps.includes(cap)
}

/** Resuelve el usuario por email (del JWT de Google). Devuelve {autorizado, rol, nombre}. */
export async function resolveUsuario(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return { autorizado: false, rol: null, nombre: null }
  try {
    const { rows } = await query(
      `select nombre, rol from public.usuarios_os where lower(email) = $1 and activo = true limit 1`, [e])
    if (!rows.length) return { autorizado: false, rol: null, nombre: null }
    return { autorizado: true, rol: rows[0].rol, nombre: rows[0].nombre }
  } catch {
    return { autorizado: false, rol: null, nombre: null }
  }
}
