// «TU CUENTA TODAVÍA NO ESTÁ VINCULADA A UN LEGAJO» — la ausencia explicada.
//
// ═══ POR QUÉ ESTE COMPONENTE ES LO MÁS IMPORTANTE DE MI LEGAJO ═══
//
// Un usuario sin `persona_id` recibe CERO FILAS de las cuatro vistas `mi_*`. Sin este cartel, Mis
// horas mostraría «0,00 HH» y Mi legajo una ficha vacía — o sea, le diría a un oficial que trabajó
// 20 días que no trabajó ninguno. Cero por falta de vínculo es indistinguible de cero real, y ésa
// es exactamente la diferencia que el OS existe para no borrar.
//
// El texto dice QUIÉN lo arregla y DÓNDE. Un aviso que describe un problema sin decir a quién
// pedírselo termina en un llamado telefónico o, peor, en que la persona asuma que el sistema está
// roto y vuelva a la planilla.

import { Aviso } from '@/shared/components/ds'
import { MIGRACION } from '../services/miCuentaService'

export function SinVinculo({ que, disponible = true }: { que: string; disponible?: boolean }) {
  // ═══ DOS AUSENCIAS QUE SE PARECEN Y NO SON LA MISMA ═══
  //
  // «Administración no te vinculó» se arregla pidiéndoselo a Administración. «Esta base no sabe
  // vincular todavía» NO: hasta que se aplique la migración, Administración no tiene dónde hacerlo.
  // Confundirlas manda a la persona a pedir algo que nadie le puede dar, y el que atiende no
  // entiende qué le están pidiendo.
  if (!disponible) {
    return (
      <Aviso tono="warn" titulo="Esta capacidad todavía no está aplicada en la base" testid="sin-capacidad">
        No puedo mostrarte {que} porque falta correr la migración <code className="font-mono">{MIGRACION}</code>.
        No es un problema de tu cuenta ni algo que Administración pueda resolver desde Usuarios: la
        migración está escrita y todavía no se aplicó.
      </Aviso>
    )
  }
  return (
    <Aviso tono="info" titulo="Tu cuenta todavía no está vinculada a un legajo" testid="sin-vinculo">
      Por eso no puedo mostrarte {que}. No es que no tengas nada cargado: es que esta cuenta no está
      asociada a ninguna persona del plantel. Lo vincula Administración desde Usuarios, y a partir de
      ahí esta pantalla se llena sola.
    </Aviso>
  )
}
