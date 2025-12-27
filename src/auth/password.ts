/**
 * Password Hashing Utilities
 * Secure password hashing and comparison using bcrypt
 */

import bcrypt from 'bcrypt';
import config from '../config/index.js';
import logger from '../utils/Logger.js';

/**
 * Hash a plain text password using bcrypt
 * @param password Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
    try {
        const hash = await bcrypt.hash(password, config.bcrypt.saltRounds);
        return hash;
    } catch (error) {
        logger.error('Error hashing password:', error);
        throw new Error('Failed to hash password');
    }
}

/**
 * Compare a plain text password with a hashed password
 * @param password Plain text password
 * @param hashedPassword Hashed password from database
 * @returns True if passwords match, false otherwise
 */
export async function comparePassword(
    password: string,
    hashedPassword: string
): Promise<boolean> {
    try {
        const isMatch = await bcrypt.compare(password, hashedPassword);
        return isMatch;
    } catch (error) {
        logger.error('Error comparing password:', error);
        throw new Error('Failed to compare password');
    }
}

/**
 * Validate password strength
 * @param password Plain text password
 * @returns Object with isValid flag and error messages
 */
export function validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // Minimum length
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    // Maximum length (prevent DoS attacks)
    if (password.length > 128) {
        errors.push('Password must not exceed 128 characters');
    }

    // Must contain at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    // Must contain at least one lowercase letter
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    // Must contain at least one number
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    // Optional: Special character requirement (uncomment if needed)
    // if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    //     errors.push('Password must contain at least one special character');
    // }

    return {
        isValid: errors.length === 0,
        errors,
    };
}

/**
 * Generate a random password
 * @param length Password length (default: 16)
 * @returns Random password meeting strength requirements
 */
export function generateRandomPassword(length: number = 16): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const allChars = uppercase + lowercase + numbers + special;

    let password = '';

    // Ensure at least one of each required type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password
        .split('')
        .sort(() => Math.random() - 0.5)
        .join('');
}
