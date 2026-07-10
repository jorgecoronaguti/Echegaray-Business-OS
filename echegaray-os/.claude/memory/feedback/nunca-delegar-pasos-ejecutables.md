---
name: nunca-delegar-pasos-ejecutables
description: Jorge prohibió terminantemente cerrar un trabajo pidiéndole que ejecute un paso técnico ("pegá la variable en Vercel... esto jamás me lo vuelvas a decir, lo haces vos") — agotar todos los canales autenticados propios antes de declarar algo bloqueado, y si el canal directo no existe, rediseñar la solución para no necesitarlo.
metadata:
  type: feedback
---

Fecha: 2026-07-09. Cerré el deploy del calendario diciendo "SIGUIENTE PASO: pegá la variable en Vercel (2 minutos)". Jorge: **"esto jamás me lo vuelvas a decir, lo haces vos"**.

**Por qué**: delegarle un paso técnico rompe el valor central del sistema (que la empresa dependa menos de decisiones/acciones del dueño). Un "siguiente paso" que es un trámite mío disfrazado no es un siguiente paso de negocio.

**Cómo aplicar**:
1. Antes de pedir cualquier acción técnica al usuario, agotar los canales autenticados existentes (cuenta de servicio Google, git push + auto-deploy de Vercel, usuario direccion de Supabase, LaunchAgents locales).
2. Si el canal directo no existe (ej.: Vercel CLI sin login, y su login es interactivo real), **rediseñar la solución para no necesitarlo** — caso resuelto: en vez de env var en Vercel, snapshot JSON commiteado por `scripts/sync-calendario.mjs` + LaunchAgent `com.echegaray.sync-calendario` (cada 4 h, pushea solo el snapshot con rebase seguro) + fallback automático en `calendarioReader.ts` que pasa a lectura viva si la env var aparece algún día.
3. Los únicos pasos delegables son decisiones de negocio o acciones físicamente imposibles para mí (clic "Permitir acceso" de IMPORTRANGE, llamar a un cliente) — y aun esos se presentan como decisión, no como tarea técnica.

Ver [[autonomia-deploy-y-skills]] (el límite del login interactivo sigue siendo real; lo que cambió es la respuesta: rodearlo, no reportarlo).
