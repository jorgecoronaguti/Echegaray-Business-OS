// QUIÉN PUEDE ESCRIBIR DESDE EL TELÉFONO.
//
// ═══ ESTO NO ES EL GUARDA: ES LA AFFORDANCE ═══
//
// Quien decide de verdad son las policies de Postgres: `obra_ejecucion_insert` y
// `obra_restriccion_write` exigen `current_rol() in (direccion, administracion, jefe_obra)` ADEMÁS
// de ver la obra. Aunque alguien llame la acción directamente, la base la rechaza.
//
// Lo que esta función evita es lo otro: ofrecerle a un operario una primaria amarilla que va a
// rebotar contra un `42501 permission denied`. Un botón que no puede funcionar es peor que no
// tenerlo — enseña que la pantalla miente.
//
// Si mañana se decide que el rol `campo` carga su propio parte, el cambio es de MIGRACIÓN (la
// policy) y de acá; los dos, no uno solo.

const ESCRIBEN_EN_OBRA = ['direccion', 'administracion', 'jefe_obra']

export function puedeCargarParte(rol: string | null | undefined): boolean {
  return ESCRIBEN_EN_OBRA.includes((rol ?? '').trim())
}
