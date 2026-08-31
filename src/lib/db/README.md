# Database client boundary

- Seat A may construct browser/server clients after the application dependency and auth strategy are established.
- Browser code may use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is reserved for trusted administrative/server tooling and must never enter a client bundle.
- Use `Database` from `src/contracts/database.types.ts` when constructing typed clients.
- Use `RPC_NAMES`, `RpcArgsByName`, and `RpcResultByName` for lifecycle calls; do not duplicate string names or invent response shapes in features.
- Database functions do not exist in P0. P2-C1 must implement them with the exact frozen signatures from `src/contracts/commands.ts`.
