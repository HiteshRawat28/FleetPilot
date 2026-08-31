# TransitOps Supabase contract

## P0 status

- `config.toml` was generated from the Supabase CLI 2.116.0 template and reduced to the local services required by TransitOps.
- `migrations/20260831000000_initial_contract.sql` defines the enums, tables, normalized identifiers, constraints, concurrency indexes, update triggers, and deny-by-default RLS posture.
- `seed.sql` contains deterministic operational demo data without credentials.
- Lifecycle RPC signatures are frozen in `src/contracts/commands.ts`; their SQL implementations belong to P2-C1.
- Role grants and RLS policies belong to P1-C1 after the role matrix is approved.

## Expected local workflow

The Supabase CLI can run through `npx`, but a Docker-compatible runtime is not currently available, so database commands are documented but not yet verified end to end:

```powershell
npx supabase start
npx supabase db reset --local
npx supabase db lint --local
npx supabase gen types typescript --local
```

Run commands explicitly against `--local` or `--linked`; do not rely on differing command defaults. Never run `db reset --linked` against a non-throwaway environment.

After the local stack is available:

1. Reset locally so migrations and seed data run from an empty database.
2. Run the database linter.
3. Generate database types and compare them with `src/contracts/database.types.ts`.
4. Add P1 role grants/policies and allowed/denied tests before client access is enabled.
5. Use `db push --dry-run` before applying migrations to a linked development project.

## Security boundary

- P0 revokes table access from `anon` and `authenticated`; this is intentional.
- P1 must grant only the operations supported by the approved role matrix and add RLS policies.
- Prefer security-invoker functions. Any security-definer helper must live outside exposed schemas, set `search_path = ''`, and schema-qualify every object.
- Revoke function execution by default and grant each RPC explicitly to the required role.
- Never place a service-role key in browser code, tracked configuration, seed files, or test fixtures.
