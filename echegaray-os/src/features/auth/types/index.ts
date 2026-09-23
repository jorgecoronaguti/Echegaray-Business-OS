// LOS TIPOS DE IDENTIDAD VIVEN EN `shared/auth`, NO ACÁ (auditoría externa del 23/09/2026, hito 3).
//
// Medido con rg: 37 de los 78 imports que otras features hacen a `auth` eran a estos dos módulos —el
// Rol, el Perfil y las reglas de permiso—. Eso no es una feature importando de otra: es media app
// dependiendo de un dominio para saber qué puede ver cada uno. Un concepto que cruzan todos los
// dominios es `shared/`, por definición.
//
// Este archivo queda como puerta: las 24 importaciones que ya existen no se tocan, y lo nuevo apunta
// directo a `@/shared/auth/identidad`. La regla de ESLint marca en `warn` los imports cruzados que
// queden entre features.
export * from '../../../shared/auth/identidad.ts'
