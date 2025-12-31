import type { RouterMiddleware } from '@/app/types/router';
import type { AuthenticatedPermissionOptions } from '@/app/types/rbac';

// AUTH REMOVED: This middleware now always allows access without authentication
export const authenticatedMiddleware: RouterMiddleware<AuthenticatedPermissionOptions> = async (
	_to,
	_from,
	_next,
	_options,
) => {
	// Authentication check bypassed - all routes are accessible without login
	return;
};
