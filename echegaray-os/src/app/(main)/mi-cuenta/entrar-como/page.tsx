// ENTRAR COMO — Dirección elige a quién, y ve lo que ya hizo.
//
// ═══ QUÉ DECIDE ESTA PANTALLA ═══
//
// «Ver como» es una lente de dibujo. Esto abre la SESIÓN REAL de otra cuenta: lo que se ve son sus
// permisos de verdad (RLS incluida), y lo que se haga queda a su nombre. Por eso la pantalla dice, arriba
// de la lista, las dos cosas que hay que saber antes de tocar «Entrar», y abajo muestra el registro:
// cada entrada queda en `auditoria_entrar_como` y se cierra al volver.
//
// EL CONTROL DE ACCESO DE LA PANTALLA NO ES EL CONTROL DE ACCESO: `/entrar-como` vuelve a preguntar
// contra `perfiles` quién llama. Acá se esconde la lista a quien no es Dirección para no ofrecer un
// botón que va a rebotar.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilReal, getUsuarioActual } from '@/features/auth/services/authService'
import { cuentasEntrables, type GrupoEntrable } from '@/features/auth/services/entrarComo'
import { ListaEntrarComo } from '@/features/auth/components/ListaEntrarComo'
import { ROL_LABEL, type Rol } from '@/features/auth/types'
import { MiCuentaShell } from '@/features/mi-cuenta/components/MiCuentaShell'
import { Aviso, Nulo, Num, Tabla, THead, Th, Tr, Td } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

function cuando(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

type Huella = { id: string; direccion_id: string; objetivo_id: string; objetivo_rol: string | null; entro_en: string; volvio_en: string | null }

export default async function EntrarComoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return <MiCuentaShell titulo="Entrar como"><Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso></MiCuentaShell>
  const { data: perfil } = await getPerfilReal(supabase, user.id)

  if (perfil?.rol !== 'direccion') {
    return (
      <MiCuentaShell titulo="Entrar como" descripcion="Sólo Dirección puede entrar a la aplicación como otra cuenta.">
        <Aviso tono="info" testid="entrar-como-sin-permiso">No tenés permiso para ver esta pantalla.</Aviso>
      </MiCuentaShell>
    )
  }

  let grupos: GrupoEntrable[] = []
  let errorLista: string | null = null
  try {
    grupos = await cuentasEntrables(createAdminClient(), user.id)
  } catch (e) {
    errorLista = e instanceof Error ? e.message : 'No pude leer las cuentas.'
  }

  // EL REGISTRO, leído con la sesión: la policy deja ver a Dirección todas las entradas. Los nombres
  // salen de `perfiles` en una segunda lectura; una cuenta borrada se muestra por su id, no se esconde.
  const { data: huellas, error: hErr } = await supabase
    .from('auditoria_entrar_como')
    .select('id, direccion_id, objetivo_id, objetivo_rol, entro_en, volvio_en')
    .order('entro_en', { ascending: false })
    .limit(20)
  const ids = Array.from(new Set((huellas ?? []).flatMap((h) => [h.direccion_id as string, h.objetivo_id as string])))
  const { data: nombres } = ids.length
    ? await supabase.from('perfiles').select('id, nombre').in('id', ids)
    : { data: [] as { id: string; nombre: string | null }[] }
  const nombreDe = new Map((nombres ?? []).map((n) => [n.id as string, (n.nombre as string | null) ?? null]))
  const sinTabla = hErr?.code === '42P01'

  return (
    <MiCuentaShell
      titulo="Entrar como"
      descripcion="Abrí la sesión real de otra cuenta para ver exactamente lo que ve, con sus permisos. Lo que hagas adentro queda a su nombre y cada entrada queda registrada."
    >
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
        <section className="min-w-0">
          {errorLista
            ? <Aviso tono="neg" titulo="No pude leer las cuentas">{errorLista}</Aviso>
            : <ListaEntrarComo grupos={grupos} />}
        </section>

        <section className="min-w-0">
          <h2 className="mb-2 text-[11px] font-medium tracking-[0.04em] text-faint">Registro de entradas</h2>
          {sinTabla ? (
            <Aviso tono="warn" titulo="El registro todavía no está en la base" testid="registro-sin-migracion">
              Falta aplicar la migración <code className="font-mono">20260923T2600_entrar_como_deja_huella.sql</code>.
              Hasta entonces no se puede entrar como nadie: sin registro no hay entrada.
            </Aviso>
          ) : hErr ? (
            <Aviso tono="neg">{hErr.message}</Aviso>
          ) : (huellas ?? []).length === 0 ? (
            <p className="text-[12.5px] text-muted" data-testid="registro-vacio">Nadie entró todavía como otra cuenta.</p>
          ) : (
            <Tabla testid="registro-entrar-como" minWidth={480}>
              <THead>
                <Th>Quién</Th>
                <Th>Como quién</Th>
                <Th num className="w-[130px]">Entró</Th>
                <Th num className="w-[130px]">Volvió</Th>
              </THead>
              <tbody>
                {(huellas as Huella[]).map((h) => (
                  <Tr key={h.id}>
                    <Td>{nombreDe.get(h.direccion_id) ?? <Nulo>{h.direccion_id.slice(0, 8)}</Nulo>}</Td>
                    <Td>
                      {nombreDe.get(h.objetivo_id) ?? <Nulo>{h.objetivo_id.slice(0, 8)}</Nulo>}
                      {h.objetivo_rol && <span className="text-faint"> · {ROL_LABEL[h.objetivo_rol as Rol] ?? h.objetivo_rol}</span>}
                    </Td>
                    <Td num><Num>{cuando(h.entro_en) ?? ''}</Num></Td>
                    <Td num>{h.volvio_en ? <Num>{cuando(h.volvio_en) ?? ''}</Num> : <span className="text-[11.5px] text-warn">sin volver</span>}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </section>
      </div>
    </MiCuentaShell>
  )
}
