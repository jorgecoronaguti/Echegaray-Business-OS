// 01 OBRAS · CARTERA — encontrar y abrir una obra. Nada más que eso.
//
// El dueño (20/08), textual: *"Quiero una vista ejecutiva MUY limpia de todas las obras. NO
// desplegar actividades. NO convertir esto en dashboard. NO meter todos los dominios."*
//
// ═══ ESTA PÁGINA DECIDE QUÉ SE LEE; EL DISEÑO DECIDE CÓMO SE VE (23/09/2026) ═══
//
// El dibujo entero está en `components/CarteraObras.tsx`, porte literal de `erp-obras/01.html` y
// `M01.html`. Acá queda lo que una pantalla no puede delegar —qué consultas salen, con qué permiso,
// y qué se hace con lo que no se pudo leer—, que es exactamente lo que el diseño no puede saber.
//
// FUENTE: la vista `obra_panel`, leída por `getCartera` con las columnas que esta tabla dibuja y no
// con `select('*')` (ver el servicio). NO se lee `public.obras` legacy —era la tabla con 4 obras
// pausadas que hacía que la web dijera "0 obras activas" mientras cuatro obras facturaban $287M—.
//
// LAS SEÑALES DE HOY YA NO SE DIBUJAN (el diseño no tiene columna HOY ni HH): sólo se leen los
// impedimentos, que son lo que cuenta el chip «Con problema».

import { createClient } from '@/lib/supabase/server'
import { getCartera } from '@/features/obras/services/obrasService'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { RecordarVista } from '@/features/obras/components/RecordarVista'
import { CarteraObras, type FilaCartera } from '@/features/obras/components/CarteraObras'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { getSenalesCartera } from '@/features/obras/services/senalesCarteraService'
import { EstadoError } from '@/shared/components/estado'

export const dynamic = 'force-dynamic'

export default async function ObrasPage({
  searchParams,
  vistaInicial = 'tabla',
}: {
  searchParams: Promise<{ archivadas?: string }>
  /** `/obras/gantt` monta esta misma página abierta en el Gantt: un solo encabezado, dos cuerpos. */
  vistaInicial?: 'tabla' | 'gantt'
}) {
  const { archivadas: verArchivadas } = await searchParams
  const conArchivadas = verArchivadas === '1'

  const supabase = await createClient()
  // EL DÍA LO FIJA EL SERVIDOR: ni el plazo ni las señales de hoy pueden depender del reloj del
  // navegador que las mira.
  const hoyIso = new Date().toISOString().slice(0, 10)
  // LAS LECTURAS SALEN JUNTAS: contra Vercel una cascada se paga cara (iad1 ↔ São Paulo). Si una
  // señal falla, la cartera se dibuja igual y el pie dice qué no se pudo mirar.
  const [perfil, { data, error }, senales, codigos] = await Promise.all([
    getPerfilActual(supabase),
    getCartera(supabase),
    getSenalesCartera(supabase, hoyIso),
    // El código interno (`OB-0012`) se lee aparte: si falla, la cartera muestra el nombre solo.
    codigosDeObra(supabase, null),
  ])
  if (error) return <EstadoError mensaje={error} que="la cartera de obras" />

  // El nivel del usuario decide si se DIBUJA la primaria. Falla al nivel MENOS privilegiado.
  const esAdmin = esAdministracion(perfil.data?.rol ?? null)
  const todas = data ?? []

  // ARCHIVADA = `cerrada`. La obra terminada sale de la cartera; la `pausada` NO — sigue siendo un
  // compromiso abierto aunque hoy no avance, y esconderla sería esconder trabajo pendiente.
  const archivadas = todas.filter((o) => o.estado === 'cerrada')
  const visibles = conArchivadas ? todas : todas.filter((o) => o.estado !== 'cerrada')

  const filas: FilaCartera[] = visibles.map((o) => ({
    obra_id: o.obra_id,
    nombre: o.nombre,
    codigo: codigos.get(o.obra_id) ?? null,
    // CLIENTES ES SÓLO DE ADMINISTRACIÓN (dueño, 24/09/2026): para el resto el nombre va sin enlace.
    cliente_slug: veEconomia(perfil.data?.rol ?? null) ? o.cliente_slug : null,
    obra_padre_id: o.obra_padre_id ?? null,
    cliente_nombre: o.cliente_nombre,
    cliente_texto: o.cliente_texto,
    estado: o.estado,
    etapa: o.etapa,
    avance_pct: o.avance_pct,
    fecha_inicio_plan: o.fecha_inicio_plan,
    fecha_fin_plan: o.fecha_fin_plan,
    // EL ATRASO DE LA CARTERA SALE DE ACÁ (ver `services/carteraCanon.ts`): fin proyectado al
    // ritmo medido contra el fin comprometido. No de `desvio_plazo_dias`, que compara el plan
    // contra su propia línea base y daba 0 en las once obras vivas.
    forecast_fin: o.forecast_fin,
    impedimentos: senales.impedimentos ? (senales.impedimentos.get(o.obra_id) ?? 0) : null,
  }))

  return (
    <>
      {/* GUARDA CÓMO QUEDÓ ESTA VISTA: sólo se guarda lo que alguien está mirando de verdad. */}
      <RecordarVista />
      <CarteraObras
        obras={filas}
        archivadas={archivadas.length}
        conArchivadas={conArchivadas}
        esAdmin={esAdmin}
        sinDato={senales.sinDato
          .filter((s) => s.senal === 'los impedimentos abiertos')
          .map((s) => `No pude leer ${s.senal}: ${s.error}`)}
        hoyIso={hoyIso}
        vistaInicial={vistaInicial}
      />
    </>
  )
}
