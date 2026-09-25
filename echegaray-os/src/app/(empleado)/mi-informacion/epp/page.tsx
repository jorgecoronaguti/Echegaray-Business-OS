// MI EPP Y ROPA DE TRABAJO — lo que la persona tiene, con talle, fecha y constancia. SÓLO LECTURA.
//
// Dueño (vía coordinación, 25/09/2026): «cada uno ve lo suyo». Administración y el jefe lo ven en la solapa
// «EPP y Ropa de Trabajo» del legajo (`/administracion/personas/[id]?v=epp`), donde se entrega y se devuelve;
// el operario no entra a Personal, así que lo suyo vive acá, en «Mi información», en las dos caras (en la PC
// el operario también usa este árbol: el middleware le lleva `/mi-cuenta/*` a `/mi-informacion/*`).
//
// LA PERSONA SALE DE SU PERFIL, NUNCA DE LA URL: no hay parámetro que permita pedir la de otro. La lectura es
// la misma que la del legajo (`leerVestimentaDePersona`), con la sesión de quien mira.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { Dato, Fila, Nada } from '@/features/empleado/components/Filas'
import { leerVestimentaDePersona, type FilaTiene } from '@/features/herramientas/services/vestimentaDePersona'
import { ETIQUETA_EVENTO, ETIQUETA_PERSONAL } from '@/features/herramientas/logica/vestimenta'
import { diaMesAnio } from '@/features/herramientas/components/formato'

export const dynamic = 'force-dynamic'

// Las fechas son momentos (timestamptz): se dicen en la hora de San Juan, como en el legajo.
const dmy = (iso: string | null) => (iso ? diaMesAnio(iso) : null)
const VOLVER = { href: '/mi-informacion', label: 'Mi información' }

/** El enlace a la constancia: 44 px de alto para el pulgar. */
function Constancia({ href, texto = 'constancia' }: { href: string; texto?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" data-testid="mi-epp-constancia"
      className="inline-flex min-h-11 items-center whitespace-nowrap text-[12.5px] text-muted underline underline-offset-2">
      {texto}
    </a>
  )
}

function talleDe(f: FilaTiene): string {
  return f.talle ? `talle ${f.talle}` : f.sinTalle ? 'sin talle' : 'talle único'
}

export default async function MiEppPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)
  const personaId = perfil.data?.persona_id ?? null

  if (!personaId) {
    return (
      <PantallaEmpleado titulo="Mi EPP y ropa" volver={VOLVER}>
        <SinVinculo que="tu EPP y tu ropa de trabajo" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const v = await leerVestimentaDePersona(supabase, personaId)
  if (v.estado !== 'ok') {
    return (
      <PantallaEmpleado titulo="Mi EPP y ropa" volver={VOLVER}>
        <Aviso tono={v.estado === 'error' ? 'neg' : 'info'} titulo="No se pudo leer tu EPP y ropa." testid="mi-epp-error">
          {v.estado === 'error' ? v.mensaje : 'Todavía no está publicado.'}
        </Aviso>
      </PantallaEmpleado>
    )
  }

  const t = v.talles
  return (
    <PantallaEmpleado titulo="Mi EPP y ropa" volver={VOLVER}>
      <Seccion titulo="MIS TALLES">
        <div data-testid="mi-epp-talles">
          <Dato rotulo="Camisa / torso" valor={t?.camisa ?? null} />
          <Dato rotulo="Pantalón" valor={t?.pantalon ?? null} />
          <Dato rotulo="Calzado" valor={t?.calzado ?? null} />
        </div>
      </Seccion>

      {(['epp', 'ropa'] as const).map((clase) => {
        const filas = v.tiene.filter((f) => f.clase === clase)
        const unidades = filas.reduce((s, f) => s + f.cantidad, 0)
        return (
          <Seccion key={clase} titulo={ETIQUETA_PERSONAL[clase].toUpperCase()} extra={filas.length ? `${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}` : undefined}>
            {filas.length === 0 ? (
              <Nada testid={`mi-epp-nada-${clase}`}>{clase === 'epp' ? 'No tenés EPP registrado a tu nombre.' : 'No tenés ropa de trabajo registrada a tu nombre.'}</Nada>
            ) : (
              <div data-testid={`mi-epp-${clase}`}>
                {filas.map((f) => (
                  <Fila
                    key={f.activoId}
                    testid="mi-epp-fila"
                    titulo={f.nombre}
                    detalle={`${talleDe(f)} · ${f.fecha ? `${f.yaLaTenia ? 'ya la tenías' : 'entregado'} el ${dmy(f.fecha)}` : 'sin registro de entrega'}`}
                    senal={`× ${f.cantidad}`}
                    accion={f.respaldo ? <Constancia href={f.respaldo} /> : undefined}
                  />
                ))}
              </div>
            )}
          </Seccion>
        )
      })}

      <Seccion titulo="HISTORIAL">
        {v.historial.length === 0 ? (
          <Nada testid="mi-epp-sin-historial">Sin movimientos registrados.</Nada>
        ) : (
          <div data-testid="mi-epp-historial">
            {v.historial.map((h, i) => (
              <Fila
                key={i}
                titulo={`${ETIQUETA_EVENTO[h.tipo]} · ${h.nombre}`}
                detalle={`${dmy(h.fecha) ?? 'sin fecha'} · × ${h.cantidad}`}
                accion={h.respaldo ? <Constancia href={h.respaldo} /> : undefined}
              />
            ))}
          </div>
        )}
      </Seccion>

      <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
        Lo carga Administración o tu jefe de obra desde tu legajo. Si falta algo o está mal, avisales.
      </p>
    </PantallaEmpleado>
  )
}
