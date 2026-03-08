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
    const reconnectTimerRef = useRef(null);
    const pingTimerRef = useRef(null);
    const shouldReconnectRef = useRef(false);
    const connectSeqRef = useRef(0);

    const navItems = [
        { path: '/chats', label: 'Chats', icon: MessageCircle },
        { path: '/contacts', label: 'Contacts', icon: Users },
        { path: '/blocked', label: 'Blocked Users', icon: UserX },
    ];

    const isChatExperience =
        location.pathname === '/chats' ||
        location.pathname.startsWith('/chats/') ||
        location.pathname.startsWith('/chat/');

    const isPrivateChatRoute =
        location.pathname.startsWith('/chat/') ||
        location.pathname.startsWith('/chats/');

    useEffect(() => {
        // Private chat page has its own dedicated socket
        if (isPrivateChatRoute || !user?.id) {
            shouldReconnectRef.current = false;

            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (pingTimerRef.current) {
                clearInterval(pingTimerRef.current);
                pingTimerRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            return;
        }

        shouldReconnectRef.current = true;

        const connect = () => {
            const token = localStorage.getItem('token');
            if (!token || !shouldReconnectRef.current) return;

            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }

            const seq = ++connectSeqRef.current;
            const ws = new WebSocket(buildChatWsUrl(token));

            ws.onopen = () => {
                if (seq !== connectSeqRef.current) return;

                ws.send(JSON.stringify({
                    type: 'ROOM_CLOSE',
                    userId: user.id
                }));

                if (pingTimerRef.current) {
                    clearInterval(pingTimerRef.current);
                }

                pingTimerRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'PING' }));
                    }
                }, 25000);
            };

            ws.onmessage = (event) => {
                if (seq !== connectSeqRef.current) return;

                try {
                    const payload = JSON.parse(event.data);
                    
                    if (payload.type === 'USER_ONLINE' || payload.type === 'USER_OFFLINE') {
                        console.log('[WS-PRESENCE-EVENT]', payload);
                    }
                    
                    window.dispatchEvent(new CustomEvent('chat-ws-event', { detail: payload }));
                } catch (error) {
                    console.error('[WS-PARSE-ERROR]', error);
                }
            };

            ws.onclose = () => {
                if (seq !== connectSeqRef.current) return;

                if (pingTimerRef.current) {
                    clearInterval(pingTimerRef.current);
                    pingTimerRef.current = null;
                }

                wsRef.current = null;

                if (!shouldReconnectRef.current) return;

                reconnectTimerRef.current = setTimeout(() => {
                    connect();
                }, 3000);
            };

            ws.onerror = (error) => {
                console.error('[WS-ERROR]', error);
            };

            wsRef.current = ws;
        };

        connect();

        return () => {
            shouldReconnectRef.current = false;

            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (pingTimerRef.current) {
                clearInterval(pingTimerRef.current);
                pingTimerRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [isPrivateChatRoute, user?.id]);

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Mobile sidebar */}
            {isSidebarOpen && !isChatExperience && (
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
            {!isChatExperience && (
                <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
                <div className="flex flex-col flex-1 bg-white border-r">
                    <div className="flex flex-col flex-1 pt-5 pb-4 overflow-y-auto">
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
            )}

            {/* Main content */}
            <div className={`flex-1 flex flex-col ${isChatExperience ? '' : 'lg:pl-64'}`}>
                {/* Top bar */}
                {!isChatExperience && (
                    <div className="sticky top-0 z-10 lg:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-white border-b">
                    <button
                        type="button"
                        className="p-3 text-gray-500 hover:text-gray-900"
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        <Menu className="h-6 w-6" />
                    </button>
                    </div>
                )}

                {/* Page content */}
                <main className={`flex-1 ${isChatExperience ? 'p-0' : 'p-4 md:p-6'}`}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default Layout;
