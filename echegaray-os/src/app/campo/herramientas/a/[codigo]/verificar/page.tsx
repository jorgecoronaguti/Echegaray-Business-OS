import { leerOperadores, leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { CodigoDesconocido } from '@/features/herramientas/components/campo/CodigoDesconocido'
import { VerificarTelefono } from '@/features/herramientas/components/campo/VerificarTelefono'
import { normalizarCodigo } from '@/features/herramientas/logica/codigo'
import { conLugar } from '@/features/herramientas/logica/lugar'
import { operadorDe } from '@/features/herramientas/logica/historial'
import {
  seVerifica, textoVerificacion, ultimaLectura, ultimaVerificacion, verificacionDe,
} from '@/features/herramientas/logica/verificacion'

// M10 · VERIFICAR RODADO · M13 · MÁQUINA QUE SE OPERA — se llega desde la ficha (M03) y el inicio (M01).
export const dynamic = 'force-dynamic'

export default async function VerificarCampo({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ en?: string }> }) {
  const [{ codigo }, { en }] = await Promise.all([params, searchParams])
  let crudo = codigo
  try { crudo = decodeURIComponent(codigo) } catch { /* tal cual */ }
  const c = normalizarCodigo(crudo) ?? crudo
  const ficha = conLugar(`/campo/herramientas/a/${encodeURIComponent(c)}`, en)
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} volver={ficha} />
  const p = lectura.parque
  const a = p.activos.find((x) => x.codigo === c)
  if (!a) return <CodigoDesconocido codigo={c} en={en ?? null} />
  // Los rodados del parque ya llevan la patente en el nombre («Toyota Hilux NMN898»).
  const titulo = a.patente && !a.nombre.includes(a.patente) ? `${a.nombre} ${a.patente}` : a.nombre

  const aviso = (texto: string) => (
    <MarcoTelefono titulo={titulo} volver={ficha}>
      <div style={{ fontSize: '14px', lineHeight: 1.5 }} data-testid="no-se-verifica">{texto}</div>
    </MarcoTelefono>
  )
  if (a.estado === 'baja') return aviso(`${a.nombre} está dado de baja: no se verifica.`)
  if (!seVerifica(a)) return aviso('La verificación de uso es para rodados y equipos que se operan con gente, no para herramientas.')
  if (!p.lecturas) {
    return aviso('Falta aplicar la migración 20260922T1200 de la verificación de uso: todavía no se puede registrar. El resto del módulo anda igual.')
  }

  const ult = ultimaVerificacion(p, a.id)
  const quien = ult ? operadorDe(p, ult) : null
  const operadores = a.clase === 'equipo' ? await leerOperadores() : []
  return (
    <MarcoTelefono titulo={titulo} volver={ficha}>
      <VerificarTelefono
        activo={{ id: a.id, clase: a.clase, estado: a.estado, estado_desde: a.estado_desde }}
        anterior={ultimaLectura(p, a.id)}
        ultima={ult ? `${textoVerificacion(verificacionDe(p, a.id))}${quien ? ` · ${quien}` : ''}` : null}
        operadores={operadores}
        yo={lectura.yo.nombre}
        volverA={ficha}
      />
    </MarcoTelefono>
  )
}
