/**
 * Authentication Manager
 * Handles token storage, refresh, and auto-login
 */

class AuthManager {
    constructor() {
        this.accessToken = localStorage.getItem('accessToken');
        this.refreshToken = localStorage.getItem('refreshToken');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
        this.refreshTimeout = null;

        // Auto-refresh tokens before they expire
        if (this.accessToken) {
            this.scheduleTokenRefresh();
        }
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.accessToken;
    }

    /**
     * Get current user
     */
    getUser() {
        return this.user;
    }

    /**
     * Get access token
     */
    getAccessToken() {
        return this.accessToken;
    }

    /**
     * Login
     */
    async login(username, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }

        const data = await response.json();
        this.setTokens(data.accessToken, data.refreshToken, data.user);
        return data.user;
    }

    /**
     * Logout
     */
    async logout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken }),
            });
        } catch (error) {
            console.error('Logout error:', error);
        }

        this.clearTokens();
        window.location.href = '/login.html';
    }

    /**
     * Set tokens and user
     */
    setTokens(accessToken, refreshToken, user) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.user = user;

        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));

        this.scheduleTokenRefresh();
    }

    /**
     * Clear tokens
     */
    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;

        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');

        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
    }

    /**
     * Refresh access token
     */
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken }),
            });

            if (!response.ok) {
                throw new Error('Token refresh failed');
            }

            const data = await response.json();
            this.setTokens(data.accessToken, data.refreshToken, this.user);

            return data.accessToken;
        } catch (error) {
            console.error('Token refresh error:', error);
            this.clearTokens();
            window.location.href = '/login.html';
            throw error;
        }
    }

    /**
     * Schedule token refresh (refresh 5 minutes before expiry)
     */
    scheduleTokenRefresh() {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }

        // Access tokens expire in 1 hour, refresh after 55 minutes
        const refreshIn = 55 * 60 * 1000; // 55 minutes

        this.refreshTimeout = setTimeout(() => {
            this.refreshAccessToken().catch(console.error);
        }, refreshIn);
    }

    /**
     * Make authenticated API request with auto-retry on token expiry
     */
    async fetch(url, options = {}) {
        // Add auth header
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.accessToken}`,
        };

        let response = await fetch(url, { ...options, headers });

        // If token expired, refresh and retry
        if (response.status === 401) {
            try {
                await this.refreshAccessToken();

                // Retry with new token
                headers.Authorization = `Bearer ${this.accessToken}`;
                response = await fetch(url, { ...options, headers });
            } catch (error) {
                // Refresh failed, redirect to login
                this.clearTokens();
                window.location.href = '/login.html';
                throw error;
            }
        }

        return response;
    }

    /**
     * Check if current page requires authentication
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/login.html';
            return false;
        }
        return true;
    }

    /**
     * Check if user has required role
     */
    hasRole(...roles) {
        return this.user && roles.includes(this.user.role);
    }

    /**
     * Block access for API users on web UI
     */
    blockApiUsers() {
        if (this.user && this.user.role === 'api') {
            alert('API users cannot access the web interface. Please use the API endpoints.');
            this.logout();
            return false;
        }
        return true;
    }
}

// Create global auth instance
window.auth = new AuthManager();
