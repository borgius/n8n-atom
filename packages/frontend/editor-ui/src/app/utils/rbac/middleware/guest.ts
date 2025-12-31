import type { RouterMiddleware } from '@/app/types/router';
import { VIEWS } from '@/app/constants';
import type { GuestPermissionOptions } from '@/app/types/rbac';

// AUTH REMOVED: Guest middleware now always redirects to homepage
// since authentication is disabled, there's no need for login/signup pages
export const guestMiddleware: RouterMiddleware<GuestPermissionOptions> = async (
	to,
	_from,
	next,
) => {
	// Always redirect guest-only pages (signin, signup) to homepage
	const redirect = (to.query.redirect as string) ?? '';

	// Allow local path redirects
	if (redirect.startsWith('/')) {
		return next(redirect);
	}

	try {
		// Only allow origin domain redirects
		const url = new URL(redirect);
		if (url.origin === window.location.origin) {
			return next(redirect);
		}
	} catch {
		// Intentionally fall through to redirect to homepage
		// if the redirect is an invalid URL
	}

	return next({ name: VIEWS.HOMEPAGE });
};
