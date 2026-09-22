import Link from 'next/link'
import { leerParque } from '@/features/herramientas/services/datos'
import { MarcoTelefono, FilaTelefono, primarioTelefono } from '@/features/herramientas/components/campo/MarcoTelefono'
import { SinBaseTelefono } from '@/features/herramientas/components/campo/SinBaseTelefono'
import { IcoAviso, IcoBuscar, IcoEscanear, IcoFlecha, IcoObra, IcoTaller } from '@/features/herramientas/components/iconos'
import { AZUL, V } from '@/features/herramientas/components/estilo'
import { conLugar, lugaresParaElegir, resolverLugar } from '@/features/herramientas/logica/lugar'
import { activosEn, conProblema } from '@/features/herramientas/logica/parque'

// M01 · INICIO DE CAMPO — caminos por objetivo, y «Escanear» abajo, al alcance del pulgar.
//
// Desvíos: sin «Control físico» ni «Verificar el rodado» (etapa 2). Se agrega «Dar de alta una
// herramienta» (M14 no tenía entrada propia más que el QR desconocido). Permisos iguales para todos:
// cualquiera mueve entre cualquier lugar.
export const dynamic = 'force-dynamic'

export default async function InicioHerramientasCampo({ searchParams }: { searchParams: Promise<{ en?: string }> }) {
  const { en } = await searchParams
  const lectura = await leerParque()
  if (lectura.estado !== 'ok') return <SinBaseTelefono lectura={lectura} />
  const p = lectura.parque
  const lugar = resolverLugar(p, lectura.obras, en)

  if (!lugar) {
    const lugares = lugaresParaElegir(p, lectura.obras)
    return (
      <MarcoTelefono titulo="Herramientas" volver="/campo" pie={<Link href="/campo/herramientas/escanear" prefetch={false} style={primarioTelefono}><IcoEscanear tam={17} />Escanear</Link>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-.01em' }}>¿Dónde estás?</h1>
          <div style={{ fontSize: '13px', color: V.apagado }}>Elegí la obra o el Taller. Se puede escanear sin elegir.</div>
        </div>
        <div data-testid="elegir-lugar">
          {lugares.map((l, i) => (
            <FilaTelefono key={l.clave} href={conLugar('/campo/herramientas', l.clave)} titulo={l.rotulo}
              bajada={`${l.cuenta} ${l.cuenta === 1 ? 'activo' : 'activos'}`} ultima={i === lugares.length - 1} testid="lugar" />
          ))}
        </div>
        <FilaTelefono href="/campo/herramientas/buscar" icono={<IcoBuscar tam={18} color={AZUL} />} titulo="Buscar una herramienta" bajada="en todo el parque" ultima />
      </MarcoTelefono>
    )
  }

  const aca = lugar.ubicacionId ? activosEn(p, lugar.ubicacionId) : []
  const prob = aca.filter(conProblema).length
  return (
    <MarcoTelefono
      titulo={<span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>Herramientas</span>}
      volver="/campo"
      derecha={<Link href="/campo/herramientas" prefetch={false} style={{ textDecoration: 'underline' }}>Cambiar lugar</Link>}
      pie={<Link href={conLugar('/campo/herramientas/escanear', lugar.clave)} prefetch={false} className="min-h-[52px]" style={primarioTelefono} data-testid="escanear"><IcoEscanear tam={17} />Escanear</Link>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-.01em' }} data-testid="lugar-actual">{lugar.rotulo}</h1>
        <div style={{ fontSize: '13px', color: V.apagado }}>
          {aca.length} {aca.length === 1 ? 'activo' : 'activos'} acá{prob ? ` · ${prob} con problema` : ''}
        </div>
      </div>
      <div>
        <FilaTelefono href={conLugar('/campo/herramientas/buscar', lugar.clave)} icono={<IcoBuscar tam={18} color={AZUL} />} titulo="Buscar una herramienta" bajada="por nombre o código" testid="ir-buscar" />
        <FilaTelefono href={conLugar('/campo/herramientas/lugar', lugar.clave)} icono={lugar.esObra ? <IcoObra tam={18} color={V.pos} /> : <IcoTaller tam={18} color={V.warn} />}
          titulo={lugar.esObra ? 'Qué hay en esta obra' : 'Qué hay acá'} bajada={`${aca.length} ${aca.length === 1 ? 'activo' : 'activos'}`} testid="ir-lugar" />
        <FilaTelefono href={conLugar('/campo/herramientas/lugar', lugar.clave)} icono={<IcoFlecha tam={18} color={V.tinta} />} titulo="Mover herramientas" bajada="una o varias" testid="ir-mover" />
        <FilaTelefono href={conLugar('/campo/herramientas/buscar?para=reportar', lugar.clave)} icono={<IcoAviso tam={18} color={V.warn} />} titulo="Reportar un problema" bajada="no mueve nada de lugar" testid="ir-reportar" />
        <FilaTelefono href={conLugar('/campo/herramientas/alta', lugar.clave)} icono={<IcoTaller tam={18} color={V.apagado} />} titulo="Dar de alta una herramienta" bajada="tres datos y una foto" ultima testid="ir-alta" />
      </div>
      <div style={{ fontSize: '12.5px', color: V.apagado, lineHeight: 1.5 }}>Ves todo el parque y podés moverlo entre cualquier lugar.</div>
    </MarcoTelefono>
  )
}
