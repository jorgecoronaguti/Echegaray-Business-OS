// LAS ACCIONES DE LA CABECERA en Operación (09) y Documentos (14): las dibuja `CabeceraDeObra` a la
// derecha del nombre. Una sola primaria amarilla por pantalla.
//
//   09  «Nuevo impedimento» amarilla, sólo en la sub Impedimentos (10 · 11 · 12 no dibujan botón).
//       Es un enlace a `?nuevo=1`: el alta se abre en la solapa sin estado compartido entre servidor
//       y cliente.
//   14  «Vincular documento» · «Vincular carpeta» en texto 12,5 tinta suave (enlaces a
//       `?vincular=archivo|carpeta`, que abren el formulario en la solapa) y «Abrir carpeta» amarilla
//       con la flecha, que sólo existe cuando hay carpeta declarada: un botón a ningún lado es peor
//       que ningún botón.
//
// Sin `'use client'`: los monta la página (Server Component).

import Link from 'next/link'
import { C, ESTILO_PRIMARIA } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'

const PRIMARIA: React.CSSProperties = { ...ESTILO_PRIMARIA, height: '32px', padding: '0 14px', fontSize: '13px', color: C.grafito }

export function NuevoImpedimento({ obraId }: { obraId: string }) {
  return (
    <Link href={`/obras/${obraId}?vista=operacion&sub=impedimentos&nuevo=1`} prefetch={false}
      data-testid="cabecera-nuevo-impedimento" style={PRIMARIA}>
      Nuevo impedimento
    </Link>
  )
}

export function AccionesDocumentos({ obraId, carpetaDriveId }: { obraId: string; carpetaDriveId: string | null }) {
  const texto: React.CSSProperties = { fontSize: '12.5px', color: C.tintaSuave, whiteSpace: 'nowrap' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }} data-testid="acciones-documentos">
      <Link href={`/obras/${obraId}?vista=documentos&vincular=archivo`} prefetch={false} data-testid="vincular-archivo" style={texto}>
        Vincular documento
      </Link>
      <Link href={`/obras/${obraId}?vista=documentos&vincular=carpeta`} prefetch={false} data-testid="vincular-carpeta" style={texto}>
        Vincular carpeta
      </Link>
      {carpetaDriveId && (
        <a href={`https://drive.google.com/drive/folders/${carpetaDriveId}`} target="_blank" rel="noreferrer"
          data-testid="abrir-carpeta-obra" style={{ ...PRIMARIA, gap: '7px' }}>
          <Ico d={P.flecha} s={13} />Abrir carpeta
        </a>
      )}
    </div>
  )
}
