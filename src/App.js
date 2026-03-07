// App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Layout from './components/Layout';
import PrivateRoute from './components/PrivateRoute';

import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

import ContactsPage from './pages/contacts/ContactsPage';
import BlockedUsersPage from './pages/contacts/BlockedUsersPage';
import PrivateChatPage from './pages/chat/PrivateChatPage';
import ProfilePage from './pages/profile/ProfilePage';
import ChatListPage from './pages/chat/ChatListPage';
import { AuthProvider } from './context/AuthContext';

function App() {
    return (
        <Router>
            <AuthProvider>
                <div className="min-h-screen bg-gray-50">

                    {/* Toast */}
                    <Toaster
                        position="top-right"
                        toastOptions={{
                            duration: 4000,
                            style: {
                                background: '#363636',
                                color: '#fff',
                            },
                            success: {
                                duration: 3000,
                            },
                        }}
                    />

                    <Routes>

                        {/* ========== PUBLIC ROUTES ========== */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />

                        {/* ========== PROTECTED ROUTES ========== */}
                        <Route element={<PrivateRoute />}>
                            <Route path="/" element={<Layout />}>

                                {/* Default */}
                                <Route index element={<Navigate to="/contacts" replace />} />

                                <Route index element={<Navigate to="/chats" replace />} />

                                <Route path="chats" element={<ChatListPage />} />

                                {/* Contacts */}
                                <Route path="contacts" element={<ContactsPage />} />

                                {/* Blocked Users */}
                                <Route path="blocked" element={<BlockedUsersPage />} />

                                {/*  PRIVATE CHAT */}
                                <Route path="chat/:roomId" element={<PrivateChatPage />} />

                                {/* Profile */}
                                <Route path="profile" element={<ProfilePage />} />

                            </Route>
                        </Route>

                        {/* ========== FALLBACK ========== */}
                        <Route path="*" element={<Navigate to="/login" replace />} />

                    </Routes>
                </div>
            </AuthProvider>
        </Router>
    );
}

export default App;
