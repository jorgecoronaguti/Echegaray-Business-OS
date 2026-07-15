# Roadmap PRP-019 a PRP-024 — Plataforma + Obras + Caja

> Creado 2026-07-15. Ordena los 6 PRP nuevos por dependencia y prioridad del dueño.
> Regla transversal: techo Nivel A–D autónomo; Nivel E (mail, pago, evento externo) SIEMPRE con aprobación. No fabricar dato; activar cada capacidad cuando su dato tenga confianza.

## Los 6 PRP

| PRP | Qué | Depende de | Acción del dueño |
|---|---|---|---|
| **022** | Gestión de usuarios y roles (multiusuario) | — (opcional 024 para login Google) | organigrama real (personas × rol) |
| **023** | Memoria total del OS | 016 (vivo), 022 para ligar a persona | — (F1–F2 sin bloqueo) |
| **024** | Cuentas Google — acceso total (Drive/Gmail/Calendar) | — | **F0: domain-wide delegation en Workspace Admin** |
| **019** | Ficha de obra individual `/obras/[id]` | 017 (vivo), 022 (permisos) | — |
| **020** | Sistema macro de obras (cartera) | 017/019 | estado real de obras pausadas; recursos/pipeline para F4–F5 |
| **021** | Caja — de detección a gestión | 018 (vivo), 024 (Gmail), 022 | saldo bancario real + identificar deuda $37,7M |

## Orden recomendado (lo que pediste arrancar primero)

**Ola 1 — Plataforma (habilita todo lo demás):**
1. **PRP-022 usuarios** — sin identidad por persona no hay trazabilidad ni permisos; es prerrequisito de obras/caja compartidas.
2. **PRP-024 Google (F0 primero)** — el desbloqueo en Workspace Admin es tuyo y habilita Gmail/Calendar/Drive pleno; conviene lanzarlo YA en paralelo porque depende de vos.
3. **PRP-023 memoria total** — F1–F2 no dependen de nadie; da recuperación unificada y frena la repetición de hallazgos.

**Ola 2 — Obras (hace visible y usable lo ya construido):**
4. **PRP-019 ficha de obra** — reúne cuadro económico + avance físico + caja por obra en una pantalla.
5. **PRP-020 macro de obras** — la cartera completa, agrega lo de la ficha.

**Ola 3 — Caja (mayor $ inmediato, necesita 024 para reclamos):**
6. **PRP-021 caja gestión** — priorización + proyección (sin bloqueo) → reclamos por Gmail (tras 024) → conciliación.

## Bloqueantes del dueño (lanzar cuanto antes, corren en paralelo)
- **PRP-024 F0**: autorizar domain-wide delegation del SA en Google Workspace Admin (scopes Drive/Gmail/Calendar). Sin esto no hay Gmail/Calendar ni Drive nativo.
- **Auto-reload de créditos Anthropic** (ya lo hiciste una vez): sin crédito, el razonamiento se cae.
- **Datos**: saldo bancario real, las 2 obligaciones de $37,7M, estado real de obras pausadas.

## Notas
- Adicionales (lifecycle detección→cobranza) quedó despriorizado por el dueño; cuando se retome, será PRP-025 y alimenta la ficha (019 F4) y el macro.
- Todo lo construido en la sesión 2026-07-15 (PRP-016/017/018) es la base viva que estos 6 reutilizan — no se reconstruye.
