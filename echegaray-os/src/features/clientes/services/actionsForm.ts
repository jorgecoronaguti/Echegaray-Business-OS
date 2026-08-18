'use server'

// LOS DOS VÍNCULOS A DRIVE, ADAPTADOS A UN FORMULARIO.
//
// `vincularCarpetaDrive` y `vincularDocumento` reciben la URL suelta porque también las llama el
// sincronizador, que no tiene formularios. Un `<form>` manda un FormData, y una server action no se
// puede atar a un FormData con `bind`. Estos dos adaptadores son el puente — y son adaptadores de
// verdad: no validan, no normalizan y no deciden nada. Toda la lógica (reconocer el id dentro de la
// URL, rechazar lo que no es un id de Drive) sigue viviendo en una sola función.

import { vincularCarpetaDrive, vincularDocumento, type Resultado } from './actions'

export async function vincularCarpetaDriveForm(clienteId: string, form: FormData): Promise<Resultado> {
  return vincularCarpetaDrive(clienteId, String(form.get('url') ?? ''))
}

export async function vincularDocumentoForm(clienteId: string, form: FormData): Promise<Resultado> {
  const rol = String(form.get('rol') ?? '').trim()
  return vincularDocumento(clienteId, String(form.get('url') ?? ''), rol || undefined)
}
