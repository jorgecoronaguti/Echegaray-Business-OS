// MI CUENTA · PERFIL — lo que cada uno gestiona de sí mismo.
//
// ═══ PERSONA ≠ USUARIO, Y ESTA PANTALLA ES LA FRONTERA ═══
//
// El empleado ve LO SUYO y nunca entra al módulo administrativo Personas. Lo que se edita acá es la
// CUENTA: cómo me llamo en el sistema, a qué teléfono me buscan, mi foto. Lo que se ve pero no se
// toca es lo que la empresa decide sobre mí: mi cargo, mi legajo, mi nivel de usuario y mis obras.
//
// Esos campos van en `surface-quiet` con la nota «lo define Administración». Deshabilitar un campo
// sin decir por qué produce el mismo llamado telefónico que no mostrarlo; el rótulo es la mitad útil
// del control.
//
// LA CERRADURA NO ES ESTA PANTALLA. `20260820T3000` concede el UPDATE de `perfiles` sólo sobre
// `nombre`, `telefono` y `avatar_url`: `rol` y `persona_id` los rechaza Postgres aunque el pedido
// llegue por curl. Acá simplemente no se ofrece lo que la base no permite.

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { ROL_LABEL, type Rol } from '@/features/auth/types'
import { areasDe, AREA_LABEL } from '@/features/auth/types/areas'
import {
  getDocumentosPropios, getHorasPropias, getLegajoPropio, getPerfilPropio,
} from '@/features/mi-cuenta/services/miCuentaService'
import { resumenDeAlerta } from '@/features/mi-cuenta/services/documentos'
import { hh, resumen } from '@/features/mi-cuenta/services/horas'
import { ventanaDe } from '@/features/mi-cuenta/services/periodo'
import { MiCuentaShell } from '@/features/mi-cuenta/components/MiCuentaShell'
import { FormaPerfil } from '@/features/mi-cuenta/components/FormaPerfil'
import { PieMovil } from '@/features/mi-cuenta/components/PieMovil'
import { Aviso, Nulo } from '@/shared/components/ds'

export const dynamic = 'force-dynamic'

export default async function MiCuentaPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) {
    return (
      <MiCuentaShell titulo="Mi cuenta" volver={false}>
        <Aviso tono="neg">Tu sesión venció. Volvé a entrar.</Aviso>
      </MiCuentaShell>
    )
  }

  const [perfil, legajo] = await Promise.all([
    getPerfilPropio(supabase, user.id),
    // El legajo se lee para UNA cosa: rotular el campo «Legajo vinculado» con el nombre de la
    // persona en vez de con un uuid. Si la cuenta no está vinculada, devuelve null y el campo lo
    // dice — no se dibuja un legajo que no existe.
    getLegajoPropio(supabase),
  ])

  if (perfil.error) {
    return (
      <MiCuentaShell titulo="Mi cuenta" volver={false}>
        <Aviso tono="neg" titulo="No pude leer tu perfil">{perfil.error}</Aviso>
      </MiCuentaShell>
    )
  }

  const rol = (perfil.data?.rol ?? null) as Rol | null
  const areas = areasDe(rol)

  // ═══ LAS SEÑALES DEL PIE DEL TELÉFONO ═══
  //
  // Sólo se dibujan en mobile, y se leen siempre porque decidir en el servidor qué pantalla es un
  // teléfono es adivinar por el `user-agent` — que falla, y falla del lado peor: escondiendo un
  // «apto médico vencido». Son dos consultas a vistas ya acotadas a una persona; sin vínculo
  // devuelven vacío sin tocar una fila.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const v = ventanaDe('mes', hoy)
  const [docs, horas] = perfil.data?.persona_id
    ? await Promise.all([getDocumentosPropios(supabase), getHorasPropias(supabase, v.desde, v.hasta)])
    : [{ data: [], error: null }, { data: [], error: null }]
  const delMes = resumen(horas.data ?? [], v.desde, v.hasta)

  return (
    <MiCuentaShell
      titulo="Mi cuenta"
      volver={false}
      descripcion="Tus datos y tu acceso. El nivel de usuario y las obras asignadas los define Administración: acá se ven, no se cambian."
    >
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <FormaPerfil
          nombre={perfil.data?.nombre ?? ''}
          email={user.email ?? null}
          telefono={perfil.data?.telefono ?? null}
          avatarUrl={perfil.data?.avatar_url ?? null}
          cargo={rol ? ROL_LABEL[rol] : null}
          legajoNombre={legajo.data?.nombre_completo ?? null}
          legajoAlta={legajo.data?.fecha_ingreso ?? null}
          vinculoDisponible={perfil.data?.vinculoDisponible ?? true}
        />

        <section className="min-w-0">
          <h2 className="text-[11px] font-medium tracking-[0.04em] text-faint">Tu nivel y tus obras</h2>
          <div className="mt-3 space-y-2.5">
            <Fila rotulo="Nivel de usuario">
              {rol ? <span className="font-medium">{ROL_LABEL[rol]}</span> : <Nulo>sin nivel asignado</Nulo>}
            </Fila>
            <Fila rotulo="Áreas">{areas.map((a) => AREA_LABEL[a]).join(' · ')}</Fila>
            {/* LAS OBRAS CON ACCESO NO SE AFIRMAN ACÁ. Quién ve qué obra sale de `usuario_obra` y de
                los predicados de la RLS; escribir «todas las obras» sin haberlo consultado sería
                afirmar un permiso que la base podría estar negando. Se dice dónde se consulta. */}
            <Fila rotulo="Obras con acceso">
              <Nulo>lo define Administración en Usuarios</Nulo>
            </Fila>
          </div>
          <p className="mt-3 max-w-[460px] text-[11.5px] leading-relaxed text-faint">
            Lo define Administración en Usuarios. Si necesitás otra obra, se pide ahí: cambiarlo desde
            acá sería cambiarse a sí mismo lo que puede ver.
          </p>
        </section>
      </div>

      <PieMovil
        alertaDocumentos={resumenDeAlerta(docs.data ?? [], hoy)}
        horasDelPeriodo={delMes.dias > 0 ? `${hh(delMes.trabajadas)} HH este mes · ${delMes.dias} días` : null}
      />
    </MiCuentaShell>
  )
}

function Fila({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-[150px] shrink-0 text-[12.5px] text-muted">{rotulo}</span>
      <span className="min-w-0 flex-1 text-[13px] text-ink">{children}</span>
    </div>
  )
}
