/**
 * SSO Token Handler for Project 1
 *
 * Receives JWT tokens from Project 9 and creates Supabase-compatible sessions
 */

/**
 * Extract SSO token from URL parameters
 */
export function extractSSOToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ssoToken = params.get('sso_token');

  if (ssoToken) {
    console.log('[SSO] Token extracted from URL');

    // Clear any old tokens first
    localStorage.removeItem('sso_token');
    localStorage.removeItem('token');

    // Store NEW token in localStorage
    localStorage.setItem('sso_token', ssoToken);
    localStorage.setItem('token', ssoToken);

    // Remove token from URL for security
    params.delete('sso_token');
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, document.title, newUrl);

    return ssoToken;
  }

  // Check if token already stored (but only if it's recent)
  const storedToken = localStorage.getItem('sso_token');
  if (storedToken) {
    console.log('[SSO] Using stored token');
  }
  return storedToken;
}

/**
 * Validate SSO token with Project 9
 */
export async function validateSSOToken(token: string): Promise<any> {
  try {
    console.log('[SSO] Validating token with Project 9...');
    console.log('[SSO] Token preview:', token.substring(0, 50) + '...');

    const response = await fetch('http://localhost:4000/api/test-auth/verify', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[SSO] Validation response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[SSO] Validation failed:', errorData);
      throw new Error(errorData.error || 'Invalid SSO token');
    }

    const data = await response.json();
    console.log('[SSO] Validation successful:', data);
    return data.user;
  } catch (error) {
    console.error('SSO validation error:', error);
    return null;
  }
}

/**
 * Create Supabase-compatible session from SSO token
 */
export function createMockSession(userData: any, token: string): any {
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 86400, // 24 hours
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    refresh_token: token,
    user: {
      id: userData.id,
      email: userData.email,
      user_metadata: {
        full_name: userData.full_name,
        register_no: userData.register_no,
        department: userData.department,
        role: userData.role
      },
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      role: 'authenticated'
    }
  };
}

/**
 * Check if user is authenticated via SSO
 */
export function hasSSOAuth(): boolean {
  return !!localStorage.getItem('sso_token');
}

/**
 * Clear SSO authentication
 */
export function clearSSO(): void {
  localStorage.removeItem('sso_token');
  localStorage.removeItem('token');
}
