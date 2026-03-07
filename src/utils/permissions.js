export const ROLES = {
    SUPERADMIN: 'superadmin',
    ADMIN: 'admin',
    OWNER: 'owner',
    STAFF: 'staff',
};

const ADMIN_LEVEL_ROLES = [ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.OWNER];

export const canAccessAdmin = (role) => ADMIN_LEVEL_ROLES.includes(role);
export const canEditInventory = (role) => ADMIN_LEVEL_ROLES.includes(role);
export const canVoidTransaction = (role) => ADMIN_LEVEL_ROLES.includes(role);
export const canManagePayroll = (role) => ADMIN_LEVEL_ROLES.includes(role);
export const canViewReports = (role) => ADMIN_LEVEL_ROLES.includes(role);
export const canManageStaff = (role) => role === ROLES.SUPERADMIN || role === ROLES.OWNER;
export const canViewFinancials = (role) => [ROLES.SUPERADMIN, ROLES.OWNER].includes(role);
export const canDeleteData = (role) => role === ROLES.SUPERADMIN;
export const canClockIn = (role) => role === ROLES.STAFF;
