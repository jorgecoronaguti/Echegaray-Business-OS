import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Disciplina } from '../../documentos'
import type { Categoria, Papel } from '../../papeles'

// LOS PAPELES DEL CLIENTE, LEÍDOS DEL ESPEJO — no de Drive.
//
// ═══ POR QUÉ NO SE LLAMA A GOOGLE ACÁ (26/08/2026) ═══
//
// Esta pantalla leía Drive en vivo con la cuenta de servicio, cuya credencial es un ARCHIVO en el
// disco de la VM. El portal corre en Vercel, donde no hay disco: los cinco clientes veían «No
// pudimos leer la carpeta ahora» y no había un solo enlace de descarga. Ahora
// `orquestador/scripts/documentos-espejo.mjs` corre en la VM, deja los papeles en Storage y escribe
// `public.documento_cliente`; acá sólo se lee. El portal ya no necesita Google para nada.
//
// EL RECORTE POR PERMISO NO ESTÁ ACÁ. Se traen los papeles del CLIENTE y el filtro por
// `puede_ver_obra`, alcance de obra y `visible_portal` lo aplica `papelesVisibles`, que es puro y
// tiene test. Un portero sin test es un portero que nadie volvió a mirar.

const CAMPOS = 'id, obra_id, titulo, categoria, disciplina, revision, hojas, fecha, bytes, visible_portal'

type FilaDocumento = {
  id: string
  obra_id: string | null
  titulo: string
  categoria: string
  disciplina: string | null
  revision: string | null
  hojas: number | null
  fecha: string | null
  bytes: number | null
  visible_portal: boolean
}

/**
 * Los papeles de OBRA de este cliente: su cotización, su contrato, sus planos, sus certificados.
 *
 * ═══ LAS FACTURAS Y LOS RECIBOS NO ENTRAN (26/08/2026) ═══
 *
 * «No mezclar recibos en la sección Documentos del portal de clientes.» Y tiene razón por una
 * distinción que no es de orden sino de uso: Documentos contesta «qué me están construyendo» y se
 * mira una vez por etapa; Facturas contesta «qué me cobraron y qué pagué» y se mira todos los meses.
 * Con los recibos mezclados, veintitrés PDF de estado de cuenta enterraban la cotización y el
 * contrato, que son los dos papeles que el cliente busca acá.
 *
 * No se pierden ni se duplican: la pantalla de Facturas los lee de esta MISMA tabla por su
 * categoría. Un papel, un lugar.
 */
export async function papelesDelCliente(clienteId: string): Promise<Papel[]> {
  const { data } = await createAdminClient()
    .from('documento_cliente')
    .select(CAMPOS)
    .eq('cliente_id', clienteId)
    .not('categoria', 'in', '("factura","recibo")')
    .order('fecha', { ascending: false })

  return ((data ?? []) as FilaDocumento[]).map((f) => ({
    id: String(f.id),
    obraId: f.obra_id ?? null,
    titulo: String(f.titulo),
    categoria: f.categoria as Categoria,
    disciplina: (f.disciplina as Disciplina | null) ?? null,
    revision: f.revision ?? null,
    // NULL no es 0: nadie contó las hojas de ese plano, y la pantalla escribe «hojas sin contar».
    hojas: f.hojas == null ? null : Number(f.hojas),
    fecha: f.fecha ?? null,
    bytes: f.bytes == null ? null : Number(f.bytes),
    visiblePortal: f.visible_portal === true,
  }))
}

export type CorridaDelEspejo = { al: Date | null; error: string | null }

/**
 * CUÁNDO PASÓ EL ESPEJO POR CADA CARPETA.
 *
 * Sin esto, una obra sin papeles y una obra cuya carpeta el espejo nunca abrió se ven IGUAL, y la
 * pantalla escribiría «sin documentos» sobre una carpeta llena. Son dos estados distintos y el
 * cliente tiene que poder distinguirlos: uno se resuelve solo, el otro hay que reclamarlo.
 */
export async function corridasDelEspejo(ambitos: string[]): Promise<Map<string, CorridaDelEspejo>> {
  if (!ambitos.length) return new Map()
  const { data } = await createAdminClient()
    .from('documento_espejo_corrida')
    .select('ambito, corrida_at, error')
    .in('ambito', ambitos)

  type Fila = { ambito: string; corrida_at: string | null; error: string | null }
  return new Map(((data ?? []) as Fila[]).map((f) => [
    String(f.ambito),
    { al: f.corrida_at ? new Date(f.corrida_at) : null, error: f.error ?? null },
  ]))
}

/** Un papel, con lo justo para decidir si se puede entregar. Lo usa la ruta de descarga. */
export type PapelParaDescargar = Papel & { clienteId: string; storagePath: string; mime: string | null }

export async function papelParaDescargar(papelId: string): Promise<PapelParaDescargar | null> {
  const { data } = await createAdminClient()
    .from('documento_cliente')
    .select(`${CAMPOS}, cliente_id, storage_path, mime`)
    .eq('id', papelId)
    .maybeSingle()
  if (!data) return null

  const f = data as unknown as FilaDocumento & { cliente_id: string; storage_path: string; mime: string | null }
  return {
    id: String(f.id),
    clienteId: String(f.cliente_id),
    obraId: f.obra_id ?? null,
    titulo: String(f.titulo),
    categoria: f.categoria as Categoria,
    disciplina: (f.disciplina as Disciplina | null) ?? null,
    revision: f.revision ?? null,
    hojas: f.hojas == null ? null : Number(f.hojas),
    fecha: f.fecha ?? null,
    bytes: f.bytes == null ? null : Number(f.bytes),
    visiblePortal: f.visible_portal === true,
    storagePath: String(f.storage_path),
    mime: f.mime ?? null,
  }
}

/**
 * LAS OBRAS DEL REGISTRO CANÓNICO QUE DECLARAN ESTA CARPETA DE DRIVE.
 *
 * Es el puente que necesita la pantalla de una obra TERMINADA, que sigue apoyada en `public.obras`
 * (uuid) mientras el espejo escribe contra `obra_canonica` (texto). No es un mapeo inventado por
 * nombre —«MAMPOSTERÍA» y «Galpones, Mampostería, Cancha de Padel» son la misma obra en dos
 * registros y ningún nombre lo prueba—: es la MISMA CARPETA DE DRIVE, que es un hecho.
 *
 * Devuelve una lista y no un id porque dos obras canónicas comparten carpeta en el Drive real
 * («BSA - Planta» y «BSA - Adicional»).
 */
export async function obrasCanonicasDeCarpeta(carpetaDrive: string | null): Promise<string[]> {
  if (!carpetaDrive) return []
  const { data } = await createAdminClient()
    .from('obra_canonica').select('id').eq('drive_carpeta_id', carpetaDrive)
  return ((data ?? []) as { id: string }[]).map((o) => String(o.id))
}
