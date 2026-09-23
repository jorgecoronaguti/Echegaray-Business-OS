// LA VERIFICACIÓN EN DOS PASOS, DEL LADO DE LA PUERTA.
//
// Supabase pone en el JWT el claim `aal`: `aal1` = entró con contraseña; `aal2` = además pasó el
// segundo factor. Lo que el JWT NO dice es si la cuenta TIENE un segundo factor, y ésa es la pregunta
// del middleware: una sesión `aal1` de alguien con TOTP activado tiene que ir a poner el código antes
// de ver cualquier pantalla. Si no, activar los dos pasos sería decorativo —el que tiene la contraseña
// entra igual con sólo no pasar por la pantalla del código—.
//
// La respuesta («esta cuenta exige dos pasos») se pregunta al servidor de Auth UNA vez y viaja en una
// cookie firmada, con la misma técnica y vencimiento que el rol cacheado (`rol-cache.ts`): 5 minutos
// como mucho de atraso entre activar el factor y que la puerta lo exija. Quien activa o quita el factor
// desde Mi cuenta reescribe la cookie en el mismo acto, así que en la práctica el atraso es cero.
//
// LA COOKIE NO ES LA CERRADURA. Borrarla cuesta un viaje a Auth y se vuelve a sellar; alterarla no
// verifica la firma. Y una sesión `aal2` no pasa por acá: ya probó lo que había que probar.

import { leerRol, sellarRol } from './rol-cache.ts'

export const COOKIE_MFA = 'os_mfa'
export const RUTA_DOS_PASOS = '/login/dos-pasos'

export type ExigeDosPasos = 'si' | 'no'

export const sellarExigeDosPasos = (uid: string, valor: ExigeDosPasos, secreto: string) =>
  sellarRol({ uid, rol: valor }, secreto)

export async function leerExigeDosPasos(cookie: string | undefined | null, uid: string, secreto: string): Promise<ExigeDosPasos | null> {
  const v = await leerRol(cookie, { uid }, secreto)
  return v === 'si' || v === 'no' ? v : null
}

/** ¿Hay que mandar esta sesión a poner el código? Pura: el middleware la aplica, el test la mira. */
export function necesitaSegundoPaso(aal: string | null | undefined, exige: ExigeDosPasos | null): boolean {
  return exige === 'si' && aal !== 'aal2'
}

/** Un código TOTP son seis dígitos; se normaliza lo que la gente pega con espacios. */
export function codigoTotp(v: unknown): string | null {
  const s = String(v ?? '').replace(/\s+/g, '')
  return /^\d{6}$/.test(s) ? s : null
}
