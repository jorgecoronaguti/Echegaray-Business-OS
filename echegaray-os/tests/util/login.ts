// DÓNDE ATERRIZA EL LOGIN — UNA SOLA VEZ, PARA TODOS LOS SPECS.
//
// ═══ POR QUÉ EXISTE (18/08/2026) ═══
//
// Cinco specs tenían tipeada su propia versión de `waitForURL(/\/(dashboard|flujo-caja)/)`. El
// 17/08 se retiró `/dashboard` del sistema y el login pasó a aterrizar en `/obras`: los cinco
// quedaron esperando una URL que ya no existe y fallaron por timeout — nueve tests en rojo que no
// tenían nada roto. El contrato estaba copiado en cinco lugares, así que cambiarlo costaba cinco
// ediciones y nadie las hizo.
//
// No es "editar un test para que pase": es que el contrato cambió —la pantalla de aterrizaje es
// otra— y ahora está escrito UNA vez. Si mañana vuelve a cambiar, se cambia acá.
import type { Page } from '@playwright/test'

/** La pantalla donde cae una sesión recién abierta. `redirect('/obras')` en features/auth. */
export const ATERRIZAJE = /\/(obras|clientes|flujo-caja)/

export async function entrarComo(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(ATERRIZAJE, { timeout: 20000 })
}
