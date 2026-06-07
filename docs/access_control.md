# Access Control & Multi-Tenancy (RLS)

ShiftMatrix strictly enforces Row-Level Security (RLS) at the **Application Layer** using Payload CMS Access Control functions, located in `src/access/tenant.ts`.

> **Note**: We DO NOT use Native Postgres RLS via the NeonDB dashboard. Enabling Native RLS without writing explicit raw SQL policies will lock the database and break the application. Payload natively intercepts all API calls and injects the necessary scoping filters.

## Roles

1. **Superadmin**: Full access to the entire database across all tenants. Usually reserved for system developers.
2. **Admin**: A hospital administrator. Can manage users, shifts, and wards *only within their assigned Tenant*.
3. **Worker**: A standard staff member. Can only view their own user profile, their own shifts, and read-only access to specific system entities.

## Access Control Functions

### `isSuperAdmin`
Returns `true` if the user has the `superadmin` role. Used for global configuration and Tenant creation.

### `tenantUsers`
Restricts read access so users can only query records that match their `tenantId`.
```typescript
// If the user is an admin or worker, return a query constraint:
return {
  tenantId: { equals: user.tenantId }
}
```
*Applied to: Certifications, Wards, Shifts, TimeLogs.*

### `tenantReadAccess`
A specialized version of `tenantUsers` specifically for the `Tenants` collection. Because the `Tenants` collection does not have a `tenantId` field (its `id` IS the tenant ID), it filters by `id`.
```typescript
return {
  id: { equals: user.tenantId }
}
```

### `isSelfOrTenantAdmin`
Used heavily on the `Users` collection. 
- **Admins** can query any user in their tenant.
- **Workers** can only query their own user record.
```typescript
if (user.role === 'admin') return { tenantId: { equals: user.tenantId } }
return { id: { equals: user.id } }
```

## Security Implementation
By mapping these functions to the `access` object of every Payload collection, Payload automatically generates secure GraphQL and REST API endpoints. Even if a malicious user attempts to query `GET /api/shifts?limit=1000`, Payload will dynamically append `AND tenantId = X` to the database query.
