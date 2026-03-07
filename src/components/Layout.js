// components/Layout.js
import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { buildChatWsUrl } from '../utils/ws';
import {
    Users,
    UserX,
    LogOut,
    Menu,
    X,
    User,
    Shield,
    MessageCircle
} from 'lucide-react';

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const { user, logout } = useAuth();
    const location = useLocation();
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const shouldReconnectRef = useRef(false);

    const navItems = [
        { path: '/chats', label: 'Chats', icon: MessageCircle },
        { path: '/contacts', label: 'Contacts', icon: Users },
        { path: '/blocked', label: 'Blocked Users', icon: UserX },
    ];

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || !user?.id) {
            return;
        }

        shouldReconnectRef.current = true;

        const connect = () => {
            if (!shouldReconnectRef.current) {
                return;
            }

            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }

            const ws = new WebSocket(buildChatWsUrl(token));
            let pingInterval = null;

            ws.onopen = () => {
                pingInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'PING' }));
                    }
                }, 25000);
            };

            ws.onclose = () => {
                if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                }

                wsRef.current = null;

                if (!shouldReconnectRef.current) {
                    return;
                }

                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, 3000);
            };

            ws.onerror = () => {
                // reconnect handled by onclose
            };

            wsRef.current = ws;
        };

        connect();

        return () => {
            shouldReconnectRef.current = false;

            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }

            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user?.id]);

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Mobile sidebar */}
            {isSidebarOpen && (
                <div className="fixed inset-0 z-40 lg:hidden">
                    <div
                        className="fixed inset-0 bg-gray-600 bg-opacity-75"
                        onClick={() => setIsSidebarOpen(false)}
                    ></div>
                    <div className="fixed inset-y-0 left-0 flex max-w-xs w-full bg-white shadow-xl">
                        <div className="flex-1 flex flex-col pt-5 pb-4">
                            <div className="flex items-center justify-between px-4">
                                <h2 className="text-xl font-semibold text-gray-800">Chat Support</h2>
                                <button
                                    onClick={() => setIsSidebarOpen(false)}
                                    className="p-2 rounded-md text-gray-400 hover:text-gray-500"
                                >
                                    <X className="h-6 w-6" />
                                </button>
                            </div>
                            <div className="mt-8 flex-1 px-2 space-y-1">
                                {navItems.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                                                location.pathname === item.path
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                            onClick={() => setIsSidebarOpen(false)}
                                        >
                                            <Icon className="mr-3 h-5 w-5" />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Desktop sidebar */}
            <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
                <div className="flex flex-col flex-1 bg-white border-r">
                    <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
                        <div className="flex items-center flex-shrink-0 px-4">
                            <Shield className="h-8 w-8 text-blue-600 mr-2" />
                            <h1 className="text-xl font-bold text-gray-900">Chat Support</h1>
                        </div>
                        <nav className="mt-8 flex-1 px-4 space-y-2">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            location.pathname === item.path
                                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                                        }`}
                                    >
                                        <Icon className="mr-3 h-5 w-5" />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    {/* User profile */}
                    <div className="flex-shrink-0 flex border-t p-4">
                        <Link
                            to="/profile"
                            className="flex items-center hover:bg-gray-50 rounded-lg p-2 transition"
                        >
                            <div className="flex-shrink-0">
                                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                    <User className="h-6 w-6 text-blue-600" />
                                </div>
                            </div>
                            <div className="ml-3">
                                <p className="text-sm font-medium text-gray-900">
                                    {user?.name || 'User'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {user?.phone || 'Phone number'}
                                </p>
                            </div>
                        </Link>

                        <button
                            onClick={logout}
                            className="ml-auto p-2 text-gray-400 hover:text-gray-500"
                            title="Logout"
                        >
                            <LogOut className="h-5 w-5" />
                        </button>
                    </div>

                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 lg:pl-64 flex flex-col">
                {/* Top bar */}
                <div className="sticky top-0 z-10 lg:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-white border-b">
                    <button
                        type="button"
                        className="p-3 text-gray-500 hover:text-gray-900"
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                </div>

                {/* Page content */}
                <main className="flex-1 p-4 md:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default Layout;
