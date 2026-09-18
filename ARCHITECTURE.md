# Architecture

Provider data -> normalization -> persistence/cache -> deterministic calculations -> evidence validation -> research UI.

Phase 1 deliberately keeps the AI layer downstream and the real provider path behind an interface. The demo provider is deterministic and visibly marked DEMO. Missing real-provider credentials fail closed instead of substituting fixtures.

The web application is served by Fastify from the Vite build output. PostgreSQL is used for persistent state foundations. Redis/Valkey and workers are reserved for later phases until background-job requirements are implemented end-to-end.
