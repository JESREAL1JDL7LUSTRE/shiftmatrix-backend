import type { Access, Where } from 'payload'

/** Resolves tenantId regardless of whether it is a populated object or raw string */
export function resolveTenantId(user: NonNullable<any>): string {
  return typeof user.tenantId === 'object' ? user.tenantId?.id : user.tenantId
}

export const isSuperAdmin: Access = ({ req: { user } }) => {
  if (!user) return false
  return user.role === 'superadmin'
}

export const tenantAdmins: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'superadmin') return true
  
  if (user.role === 'admin') {
    return {
      tenantId: {
        equals: typeof user.tenantId === 'object' ? user.tenantId?.id : user.tenantId,
      },
    } as Where
  }
  return false
}

export const tenantUsers: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'superadmin') return true
  
  return {
    tenantId: {
      equals: typeof user.tenantId === 'object' ? user.tenantId?.id : user.tenantId,
    },
  } as Where
}

export const tenantReadAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'superadmin') return true
  
  return {
    id: {
      equals: typeof user.tenantId === 'object' ? user.tenantId?.id : user.tenantId,
    },
  } as Where
}

export const isSelfOrTenantAdmin: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'superadmin') return true
  
  if (user.role === 'admin') {
    return {
      tenantId: {
        equals: typeof user.tenantId === 'object' ? user.tenantId?.id : user.tenantId,
      },
    } as Where
  }

  // If worker or supervisor, they can only access their own record
  return {
    id: {
      equals: user.id,
    },
  } as Where
}

export const anyUser: Access = ({ req: { user } }) => {
  if (!user) return false
  return true
}

/**
 * Factory: "Admin/superadmin sees full tenant, worker sees only their own records."
 * Use fieldName to specify which field links the record to the user (e.g. 'staffId', 'workerId').
 *
 * Replaces the duplicated inline access functions in TimeLogs.ts and Unavailabilities.ts.
 */
export const workerOwnsViaField = (fieldName: string): Access =>
  ({ req: { user } }) => {
    if (!user) return false
    if (user.role === 'superadmin') return true
    if (user.role === 'admin') {
      return { tenantId: { equals: resolveTenantId(user) } } as Where
    }
    return { [fieldName]: { equals: user.id } } as Where
  }
