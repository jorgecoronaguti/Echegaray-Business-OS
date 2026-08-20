import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getAsignacionesPropias, getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { Dato, Fila, Nada } from '@/features/empleado/components/Filas'
import { getMiLegajo } from '@/features/empleado/services/empleadoService'
import { legible } from '@/features/empleado/services/fecha'

// «MI LEGAJO» — identidad, situación laboral e historial de asignaciones.
//
// ═══ PERSONA ≠ USUARIO, Y ACÁ SE VE ═══
//
// El legajo pertenece a la PERSONA y no se duplica en el usuario. Nada de esta pantalla se edita:
// lo administra la empresa. Lo que falta se ve como «sin cargar» —no como un guión— porque un guión
// no distingue «no tiene» de «nadie lo cargó», y la persona necesita saber cuál de las dos es para
// saber si tiene que avisar.
//
// LA RETRIBUCIÓN PACTADA NO ESTÁ, y no es un olvido: no sale por la API para nadie —tampoco para
// Administración— y lo que se cobra se lee en el recibo, que es el documento que vale.

export const dynamic = 'force-dynamic'

const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null)

export default async function MiLegajoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Mi legajo" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
        <SinVinculo que="tu legajo" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const [legajo, asignaciones] = await Promise.all([getMiLegajo(supabase), getAsignacionesPropias(supabase)])
  const l = legajo.data

  return (
    <PantallaEmpleado titulo="Mi legajo" volver={{ href: '/mi-informacion', label: 'Mi información' }}>
      {legajo.error && <Aviso tono="neg" titulo="No se pudo leer tu legajo." testid="legajo-error">{legajo.error}</Aviso>}

      {l && (
        <>
          <Seccion titulo="IDENTIDAD">
            <div data-testid="identidad">
              <Dato rotulo="Nombre" valor={l.nombre_completo} />
              <Dato rotulo="DNI" valor={l.dni} />
              <Dato rotulo="CUIL" valor={l.cuil} />
              <Dato rotulo="Nacimiento" valor={dmy(l.fecha_nacimiento)} />
              <Dato rotulo="Nacionalidad" valor={l.nacionalidad} />
              <Dato rotulo="Teléfono" valor={l.telefono} />
              <Dato rotulo="Email" valor={l.email} />
              <Dato rotulo="Domicilio" valor={l.domicilio} />
              <Dato
                rotulo="En una emergencia"
                valor={l.contacto_emergencia ? `${l.contacto_emergencia}${l.contacto_emergencia_telefono ? ` · ${l.contacto_emergencia_telefono}` : ''}` : null}
              />
            </div>
          </Seccion>

          <Seccion titulo="SITUACIÓN LABORAL">
            <div data-testid="situacion-laboral">
              <Dato rotulo="Legajo" valor={l.legajo} />
              <Dato rotulo="Categoría" valor={legible(l.categoria)} />
              <Dato rotulo="Especialidad" valor={legible(l.especialidad)} />
              <Dato rotulo="Puesto" valor={legible(l.puesto)} />
              <Dato rotulo="Convenio" valor={l.convenio_colectivo} />
              <Dato rotulo="ART" valor={l.art} />
              <Dato rotulo="Obra social" valor={l.obra_social} />
              <Dato rotulo="Ingreso" valor={dmy(l.fecha_ingreso)} />
              <Dato
                rotulo="Estado"
                valor={
                  <Estado tono={l.en_la_empresa ? 'pos' : 'nulo'} clave={l.en_la_empresa ? 'activo' : 'baja'}>
                    {l.en_la_empresa ? 'En la empresa' : l.fecha_egreso ? `Baja el ${dmy(l.fecha_egreso)}` : 'Fuera de la empresa'}
                  </Estado>
                }
              />
            </div>
          </Seccion>
        </>
      )}

      <Seccion titulo="MIS ASIGNACIONES">
        {asignaciones.data && asignaciones.data.length > 0 ? (
          <div data-testid="asignaciones">
            {asignaciones.data.map((a) => (
              <Fila
                key={a.id}
                testid="asignacion"
                titulo={a.obra ?? a.obra_id ?? 'obra sin nombre'}
                detalle={`${a.rol}${a.cuadrilla ? ` · cuadrilla ${a.cuadrilla}` : ''} · ${dmy(a.desde) ?? 'sin fecha de inicio'}${a.hasta ? ` a ${dmy(a.hasta)}` : ''}`}
                senal={<Estado tono={a.vigente ? 'curso' : 'nulo'} clave={a.vigente ? 'vigente' : 'cerrada'}>{a.vigente ? 'vigente' : 'cerrada'}</Estado>}
              />
            ))}
          </div>
        ) : (
          <Nada testid="sin-asignaciones">
            Todavía no hay ninguna asignación cargada a tu nombre. Las carga Administración desde Personal.
          </Nada>
        )}
      </Seccion>

      <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
        Los datos los administra la empresa. Si algo está mal o falta, avisale a Administración y lo
        corrigen ahí: desde acá no se editan.
      </p>
    </PantallaEmpleado>
  )
}
