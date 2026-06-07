# Access Control

ShiftMatrix uses a **multi-tenant access control** model built on Payload CMS's `Access` type. All access policies are defined in `src/access/tenant.ts` and imported by collection definitions.

---

## Multi-Tenant Isolation Guarantee

Every collection that contains tenant-specific data has `tenantId` as a required field. Access policies always filter by `tenantId === req.user.tenantId`, ensuring:

- A **worker** can only read their own tenant's data
- An **admin** can read and write within their tenant only
- A **superadmin** has cross-tenant access (system administration only)
- There is **no API path** that returns data from a different tenant to a non-superadmin

This is enforced at the Payload CMS level — the access functions run before any DB query, and if a policy returns a `where` constraint, Payload automatically adds it to every query.

---

## Role Hierarchy

```
superadmin  ──► cross-tenant read/write (system admin)
   │
admin       ──► full read/write within own tenant
   │
worker      ──► read-only within own tenant (own records only for some collections)
```

The `role` field is set on the `User` document. It is populated in `req.user` by Payload's JWT middleware on every authenticated request.

---

## Exported Functions from `tenant.ts`

### `resolveTenantId(user)`

```typescript
export function resolveTenantId(user: User): string
```

Extracts the tenant ID from a user document. Handles both the case where `tenantId` is a string (scalar) and where it has been populated as a full object.

**Usage:** Internal utility. Call this inside access functions or services when you need the tenant ID as a string regardless of how Payload populated the relationship.

```typescript
const tenantId = resolveTenantId(req.user)
// Always returns a string, never an object
```

---

### `isSuperAdmin`

```typescript
export const isSuperAdmin: Access
```

Grants access **only** to users with `role === 'superadmin'`.

**Use for:** Cross-tenant operations (creating/deleting tenants, managing certifications).

```typescript
// In Certifications.ts
access: {
  create: isSuperAdmin,
  update: isSuperAdmin,
  delete: isSuperAdmin,
}
```

---

### `tenantAdmins`

```typescript
export const tenantAdmins: Access
```

Grants access to users with `role === 'admin'` or `role === 'superadmin'`, filtered to the requester's tenant.

**Use for:** Write operations on tenant-owned data (creating shifts, approving unavailabilities, managing wards).

```typescript
// In Shifts.ts
access: {
  create: tenantAdmins,
  update: tenantAdmins,
  delete: tenantAdmins,
}
```

**Implementation pattern:**

```typescript
export const tenantAdmins: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'superadmin') return true
  if (user.role === 'admin') {
    return { tenantId: { equals: resolveTenantId(user) } }
  }
  return false
}
```

---

### `tenantUsers`

```typescript
export const tenantUsers: Access
```

Grants read access to **all authenticated users** within the same tenant.

**Use for:** Reading shared resources that all staff need to see (shifts, wards, notifications).

```typescript
// In Shifts.ts
access: {
  read: tenantUsers,
}
```

**Implementation pattern:**

```typescript
export const tenantUsers: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'superadmin') return true
  return { tenantId: { equals: resolveTenantId(user) } }
}
```

---

### `tenantReadAccess`

```typescript
export const tenantReadAccess: Access
```

Specifically for reading the `Tenants` collection itself. Users can read their own tenant document (needed to load tenant settings like `maxWeeklyHours`).

**Use for:** The `read` operation on the `Tenants` collection only.

```typescript
// In Tenants.ts
access: {
  read: tenantReadAccess,
}
```

---

### `isSelfOrTenantAdmin`

```typescript
export const isSelfOrTenantAdmin: Access
```

Grants access if:
- The requesting user IS the document owner (`req.user.id === doc.id`), OR
- The requesting user is an `admin` or `superadmin` in the same tenant

**Use for:** The `Users` collection — workers can read/update their own profile; admins can read/update any user in the tenant.

```typescript
// In Users.ts
access: {
  read: isSelfOrTenantAdmin,
  update: isSelfOrTenantAdmin,
}
```

---

### `anyUser`

```typescript
export const anyUser: Access
```

Grants access to **any authenticated user** (all roles), without tenant filtering.

**Use for:** Creating operations where the user is providing data about themselves (e.g., creating a `TimeLog` via `clockInEndpoint` — the endpoint enforces role constraints itself).

> ⚠️ Use sparingly. Prefer `tenantUsers` for read operations. `anyUser` should only be used when the endpoint handler is responsible for its own authorization logic.

---

### `workerOwnsViaField(fieldName)`

```typescript
export function workerOwnsViaField(fieldName: string): Access
```

**Factory function** — returns an `Access` policy that grants read access only when the document's `fieldName` matches the requesting user's ID.

**Use for:** Collections where workers should see only their own records.

```typescript
// In TimeLogs.ts
access: {
  read: workerOwnsViaField('staffId'),
  //          ↑ TimeLogs has a 'staffId' relationship to Users
}

// In Unavailabilities.ts
access: {
  read: workerOwnsViaField('workerId'),
  //          ↑ Unavailabilities has a 'workerId' relationship to Users
}
```

**How it works:**

```typescript
export function workerOwnsViaField(fieldName: string): Access {
  return ({ req: { user } }) => {
    if (!user) return false
    // Admins and superadmins bypass the field check
    if (user.role === 'admin' || user.role === 'superadmin') {
      return { tenantId: { equals: resolveTenantId(user) } }
    }
    // Workers can only see records where fieldName === their own ID
    return { [fieldName]: { equals: user.id } }
  }
}
```

**Extending to a new collection:** If you add a collection where workers should only see their own data, use `workerOwnsViaField('yourFieldName')` in the `read` access policy. No modification to `tenant.ts` is needed.

---

## Access Policy Quick Reference

| Policy | Superadmin | Admin | Worker | Unauthenticated |
|---|---|---|---|---|
| `isSuperAdmin` | ✅ | ❌ | ❌ | ❌ |
| `tenantAdmins` | ✅ | ✅ (own tenant) | ❌ | ❌ |
| `tenantUsers` | ✅ | ✅ (own tenant) | ✅ (own tenant) | ❌ |
| `tenantReadAccess` | ✅ | ✅ (own tenant) | ✅ (own tenant) | ❌ |
| `isSelfOrTenantAdmin` | ✅ | ✅ (own tenant) | ✅ (own record only) | ❌ |
| `anyUser` | ✅ | ✅ | ✅ | ❌ |
| `workerOwnsViaField` | ✅ | ✅ (own tenant) | ✅ (own records) | ❌ |

---

## Access Control Per Collection (Summary)

| Collection | read | create | update | delete |
|---|---|---|---|---|
| `users` | `isSelfOrTenantAdmin` | `tenantAdmins` | `isSelfOrTenantAdmin` | `tenantAdmins` |
| `tenants` | `tenantReadAccess` | `isSuperAdmin` | `isSuperAdmin` | `isSuperAdmin` |
| `wards` | `tenantUsers` | `tenantAdmins` | `tenantAdmins` | `tenantAdmins` |
| `shifts` | `tenantUsers` | `tenantAdmins` | `tenantAdmins` | `tenantAdmins` |
| `time-logs` | `workerOwnsViaField('staffId')` | `anyUser` | `tenantAdmins` | `tenantAdmins` |
| `unavailabilities` | `workerOwnsViaField('workerId')` | `anyUser` | `tenantAdmins` | `tenantAdmins` |
| `scheduling-runs` | `tenantAdmins` | Internal | Internal | `isSuperAdmin` |
| `notifications` | `tenantUsers` | `tenantAdmins` | `tenantUsers` | `tenantAdmins` |
| `certifications` | `tenantUsers` | `isSuperAdmin` | `isSuperAdmin` | `isSuperAdmin` |

---

## Adding a New Collection with Access Control

1. Decide which data ownership model applies:
   - Tenant-wide shared data → use `tenantUsers` for read, `tenantAdmins` for writes
   - Worker's own data → use `workerOwnsViaField('yourFieldName')` for read

2. Import the needed policies in your collection file:
   ```typescript
   import {
     tenantAdmins,
     tenantUsers,
     workerOwnsViaField,
   } from '@/access/tenant'
   ```

3. Apply to the collection's `access` property:
   ```typescript
   export const MyCollection: CollectionConfig = {
     slug: 'my-collection',
     access: {
       read: workerOwnsViaField('ownerId'),
       create: tenantAdmins,
       update: tenantAdmins,
       delete: isSuperAdmin,
     },
     // ...
   }
   ```

4. Write an integration test in `tests/int/collections.int.spec.ts` to verify the isolation.
