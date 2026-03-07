// pages/auth/LoginPage.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { LogIn, Smartphone, Lock, Eye, EyeOff } from 'lucide-react';

const LoginPage = () => {
    const [formData, setFormData] = useState({
        phone: '',
        password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const { login } = useAuth();
    const navigate = useNavigate();

    const validateForm = () => {
        const newErrors = {};

        if (!formData.phone.trim()) {
            newErrors.phone = 'Phone number is required';
        } else if (!/^\d{10}$/.test(formData.phone)) {
            newErrors.phone = 'Please enter a valid 10-digit phone number';
        }

        if (!formData.password) {
            newErrors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) return;

        setLoading(true);
        const result = await login(formData.phone, formData.password);
        setLoading(false);

        if (result.success) {
            toast.success('Login successful!');
            navigate('/contacts');
        } else {
            toast.error(result.error);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
                <div className="text-center">
                    <div className="flex justify-center">
                        <div className="bg-blue-100 p-3 rounded-full">
                            <LogIn className="h-10 w-10 text-blue-600" />
                        </div>
                    </div>
                    <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                        Welcome Back
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Sign in to your account to continue
                    </p>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        {/* Phone Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Phone Number
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Smartphone className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className={`appearance-none relative block w-full px-3 py-3 pl-10 border ${
                                        errors.phone ? 'border-red-300' : 'border-gray-300'
                                    } placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                                    placeholder="Enter 10-digit phone number"
                                    disabled={loading}
                                />
                            </div>
                            {errors.phone && (
                                <p className="mt-1 text-sm text-red-600">{errors.phone}</p>
                            )}
                        </div>

                        {/* Password Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className={`appearance-none relative block w-full px-3 py-3 pl-10 border ${
                                        errors.password ? 'border-red-300' : 'border-gray-300'
                                    } placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm`}
                                    placeholder="Enter your password"
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-500" />
                                    ) : (
                                        <Eye className="h-5 w-5 text-gray-400 hover:text-gray-500" />
                                    )}
                                </button>
                            </div>
                            {errors.password && (
                                <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                            )}
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </div>

                    <div className="text-center">
                        <p className="text-sm text-gray-600">
                            Don't have an account?{' '}
                            <Link
                                to="/register"
                                className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
                            >
                                Sign up here
                            </Link>
                        </p>
                    </div>
                </form>

            </div>
        </div>
    );
};

export default LoginPage;