// context/AuthContext.js
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const storedUser = localStorage.getItem('user');

            if (token && storedUser) {
                setUser(JSON.parse(storedUser));
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            localStorage.clear();
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);


    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    const login = async (phone, password) => {
        try {
            const response = await api.post('/auth/login', { phone, password });

            const { token, userId, name, phone: userPhone } = response.data;

            const userData = {
                id: userId,
                name,
                phone: userPhone
            };


            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(userData));

            setUser(userData);

            return {
                success: true,
                message: response.data.message
            };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Login failed'
            };
        }
    };




    const register = async (userData) => {
        try {
            await api.post('/auth/register', userData);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || 'Registration failed'
            };
        }
    };

    const logout = () => {
        localStorage.clear();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            login,
            register,
            logout,
            checkAuth,
            isAuthenticated: !!user
        }}>
            {children}
        </AuthContext.Provider>
    );
};