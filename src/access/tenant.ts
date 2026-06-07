import type { Access, Where } from 'payload'

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
