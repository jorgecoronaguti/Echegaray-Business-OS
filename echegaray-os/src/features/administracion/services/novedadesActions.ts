'use server'

// LA CAMPANITA DE LA BARRA DE APLICACIÓN — pantalla 00, y con fuente.
//
// ═══ EL PUNTO ROJO TIENE QUE MEDIR ALGO ═══
//
// `AppHeader` no la dibujaba, y el motivo escrito era correcto: *"el punto rojo del mockup afirma
// «tenés algo pendiente». No hay ninguna fuente de novedades que lo respalde"*. La fuente sí
// existía, sólo que con otro nombre: `chipsDeAtencion` es lo que la home de Administración publica
// desde el 23/08 —proveedores sin CUIT, nombres sin resolver, compras sin imputar / sin resolver /
// duplicadas, textos sin imputar, correcciones de asistencia sin resolver—, cada uno con el filtro
// donde se arregla y filtrado por lo que el rol puede abrir.
//
// La campanita NO inventa una bandeja nueva: publica ESA misma lista en todas las pantallas. Por eso
// el número de la campanita y el de la banda de `/administracion` no pueden discrepar.
//
// ═══ TRES ESTADOS, NO DOS ═══
//
// «hay novedades» · «no hay» · «NO PUDE MIRAR». El tercero es el que se pierde siempre: si las siete
// lecturas fallan, una campanita apagada se ve idéntica a un área sin pendientes. `atencionNoLeida`
// ya distingue eso y viaja hasta el desplegable, que lo dice con todas las letras.
//
// ═══ Y NO CUELGA DEL PRIMER PINTADO ═══
//
// El layout de `(main)` se volvió síncrono en agosto porque esperar dos lecturas antes de devolver
// una etiqueta dejaba la pantalla anterior congelada 95 s. Esto no vuelve atrás: la campanita se
// dibuja sin número y pide el suyo DESPUÉS de hidratar. Mientras no llegó, no dibuja punto y no
// afirma nada — el desplegable dice en qué estado está.

import { createClient } from '@/lib/supabase/server'
import type { Rol } from '@/features/auth/types'
import { armarConteosDeAtencion, chipsDeAtencion, atencionNoLeida, type ChipAtencion } from './homeAdministracion'

export type Novedades =
  | { ok: true; chips: ChipAtencion[]; noLeida: boolean }
  | { ok: false; error: string }

export async function getNovedades(): Promise<Novedades> {
  try {
    const supabase = await createClient()
    // ═══ UN VIAJE, NO SEIS (10/09/2026) ═══
    //
    // La campanita se dibuja en TODAS las pantallas, así que sus lecturas no eran el costo de una
    // pantalla sino un impuesto por navegación: el perfil más las cinco señales, seis viajes que
    // llegaban justo encima de la ola del render y le disputaban el pool de PostgREST a la pantalla
    // que el usuario está mirando. Medido con `PERF_TRAZA=1` en la ola de `/obras`, con veinte
    // consultas simultáneas: `proveedores` 4.125 ms y `comprobante_compra` 6.388 ms — no son caras,
    // llegaron cuando ya no quedaba backend caliente libre.
    //
    // El rol viene en el mismo JSON. Antes salía de `getPerfilActual`, que en el render del
    // `page.tsx` está memorizado por request pero acá NO: esto es una server action aparte, con su
    // propio request, así que era un viaje entero.
    const { data, error } = await supabase.rpc('campanita_atencion')
    if (error) return { ok: false, error: error.message }
    const j = (data ?? {}) as { perfil?: { rol?: Rol | null } | null }
    const conteos = armarConteosDeAtencion(data)
    const rol = j.perfil?.rol ?? null
    return { ok: true, chips: chipsDeAtencion(conteos, rol), noLeida: atencionNoLeida(conteos) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No pude leer las novedades.' }
  }
}
