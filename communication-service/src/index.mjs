// PR-3 · Superficie pública del Communication Service.
//
// Punto único de importación para el resto del mundo (y para el wiring del PR-4,
// que enganchará el Work Fabric / Director IA como handlers entrantes). Nadie
// importa los archivos internos directamente: la frontera del servicio es este
// archivo.

// ── core: contrato y motor ──
export {
  SCHEMA_VERSION,
  DIRECCION,
  TIPOS,
  direccionDe,
  claveIdempotencia,
  construirEvento,
  validarEvento,
} from './core/eventos-canonicos.mjs'
export { CommunicationService } from './core/communication-service.mjs'
export { PuertoAdapter, verificarAdapter } from './core/puerto-adapter.mjs'
export { ESTADO, MAX_INTENTOS, backoffMs, decidirProximo } from './core/outbox.mjs'
export { crearLog, crearMetricas, iniciarSpan } from './core/observabilidad.mjs'

// ── channels: adapters de plataforma ──
export { MattermostAdapter } from './channels/mattermost/mattermost-adapter.mjs'
export { MattermostCliente, FakeMattermost, esReintentable } from './channels/mattermost/mattermost-cliente.mjs'

// ── events: persistencia (puerto + implementaciones) ──
export { RepositorioMemoria } from './events/repositorio-memoria.mjs'
export { RepositorioPostgres, crearRepositorioPostgres } from './events/repositorio-postgres.mjs'

// ── integrations: puentes hacia el OS ──
export { deepLink, esEnlazable, RECURSOS } from './integrations/deep-links.mjs'
export { ResolutorIdentidad, IdentidadesMemoria, CONFIANZA } from './integrations/identidad.mjs'
export { RegistroComandos } from './integrations/slash-commands.mjs'
export { configBotOs, botListo } from './integrations/bot-os.mjs'
