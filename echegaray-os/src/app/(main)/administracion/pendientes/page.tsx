// PENDIENTES DE IMPUTACIÓN — los textos que nadie clasificó, con lo que hace falta para clasificarlos.
//
// ═══ LO PRIMERO QUE SE VE ES EL TRABAJO, NO UN MAESTRO ═══
//
// La primera línea de contenido es la cola: cuántos textos esperan una decisión. El inventario de
// las cuatro fuentes —845 compras, 17 pedidos, 149 herramientas, 53 movimientos— queda debajo de la
// cola y en letra chica, porque no es lo que hay que hacer: es el contexto de lo que hay que hacer.
//
// ═══ LOS CINCO NÚMEROS DE CADA FUENTE, Y POR QUÉ NO ALCANZA CON DOS ═══
//
// El encargo llegó con «Compras 533/845». Esas 312 filas de diferencia NO son trabajo pendiente:
// son filas que alguien YA declaró costo de estructura (Administración, Taller, F931, UOCRA…).
// Confundirlas con pendientes manda a resolver algo resuelto, y peor, invita a imputarle a una obra
// costo que es de la empresa. Por eso cada fuente separa a-una-obra · estructura · pendientes ·
// sin-texto · total: sin eso, la pantalla contestaría «faltan 312» a una pregunta cuya respuesta
// real es «falta 1».
//
// ═══ LO QUE ESTA PANTALLA NO HACE ═══
//
// No propone obras por parecido de nombre. «Sugerido» sale vacío salvo que exista evidencia —un
// juicio humano previo sobre el MISMO texto, o un proveedor que nunca compró para otra obra—, y
// cuando sale, dice por qué. Hoy, con los datos reales, no sale nunca: no hay evidencia para el
// único texto pendiente. Eso es el comportamiento correcto, no una falta.

import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { resolverImputacion } from '@/features/obras/services/actionsImputacion'
import { Aviso } from '@/shared/components/ds'
import { PantallaV2, TitularDeCola } from '@/shared/components/v2/segundoNivel'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { PendientesTrabajo } from '@/features/administracion/components/PendientesTrabajo'
import {
  getObrasParaImputar, getPendientesDeImputacion,
} from '@/features/administracion/services/imputacionService'

export const dynamic = 'force-dynamic'

/**
 * EL MARCO. `PantallaV2` y no `PageShell`: el encabezado del shell dibuja un `h1` de 22px y esta
 * pantalla abre con el número grande del artboard (`33:56-66`). El sello de «acá hubo datos» —lo
 * que le da al `error.tsx` la hora del último dato bueno— viaja en `PantallaV2`.
 *
 * LA BARRA DEL ÁREA SE QUEDA, y no es una excepción al «tres niveles nunca»: el artboard 33 la
 * dibuja y no tiene miga. Ésta es una SECCIÓN de Administración —la absorbió «Trabajo»—, no una
 * pantalla de segundo nivel como Correcciones de asistencia.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <PantallaV2>
      <div style={{ padding: '0 20px' }}>
        <NavAdministracion />
      </div>
      {children}
    </PantallaV2>
  )
}

export default async function PendientesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()

  // LAS TRES LECTURAS ARRANCAN JUNTAS, INCLUIDA LA DEL PERFIL.
  //
  // Antes el perfil se esperaba SOLO y recién después salían los datos: ~200 ms de ida y vuelta
  // puestos en serie delante de todo lo demás. Se pueden solapar porque LA PUERTA NO ES LA
  // CERRADURA — las cuatro fuentes filtran por `ve_obra_texto()` en la base y `resolverImputacion`
  // vuelve a preguntar quién llama—, así que arrancar la lectura antes de saber el rol no muestra
  // de más: a quien no le corresponde, la base le devuelve lo suyo y esta página ni lo dibuja.
  const [perfil, pendientes, obras] = await Promise.all([
    getPerfilActual(supabase),
    getPendientesDeImputacion(supabase),
    getObrasParaImputar(supabase),
  ])

  if (!esAdministracion(perfil.data?.rol ?? null)) {
    return (
      <Marco>
        <div style={{ padding: '16px 20px' }}>
          <Aviso tono="info">Esta pantalla es de Administración.</Aviso>
        </div>
      </Marco>
    )
  }

  if (pendientes.error || !pendientes.data) {
    return (
      <Marco>
        <div style={{ padding: '16px 20px' }} data-testid="pendientes-error">
          <Aviso tono="neg" titulo="No pude leer las fuentes">{pendientes.error}</Aviso>
        </div>
      </Marco>
    )
  }

  const { grupos, resumen } = pendientes.data
  // Una obra cerrada no recibe costo nuevo: ofrecerla es ofrecer imputar contra un cierre.
  const elegibles = (obras.data ?? []).filter((o) => o.estado !== 'cerrada')
  const clasificadas = resumen.reduce((a, r) => a + r.obra + r.estructura, 0)
  const totalFilas = resumen.reduce((a, r) => a + r.total, 0)
  const mil = (n: number) => n.toLocaleString('es-AR')

  return (
    <Marco>
      {/* LA CIFRA ES LO QUE HAY QUE HACER, Y ES EL ÚNICO COLOR DE LA PANTALLA. Cuenta TEXTOS, no
          filas: dos filas que dicen lo mismo se resuelven de una sola vez, y contarlas por separado
          haría parecer la cola más larga de lo que es. */}
      <TitularDeCola
        testid="titular-pendientes"
        numero={grupos.length}
        titulo={grupos.length === 1 ? 'texto espera una decisión' : 'textos esperan una decisión'}
        resumen={`${mil(clasificadas)} de ${mil(totalFilas)} filas ya están clasificadas`}
        tono={grupos.length ? 'warn' : 'pos'}
        derecha="Un texto resuelto escribe una fila en el diccionario de obras y vale para todas las filas que digan lo mismo — hoy y mañana."
      />

      <div style={{ padding: '0 20px 24px' }}>
      <PendientesTrabajo
        grupos={grupos}
        resumen={resumen}
        obras={elegibles}
        resolver={resolverImputacion}
        claveInicial={sp.c ?? null}
      />
      </div>
    </Marco>
  )
}
