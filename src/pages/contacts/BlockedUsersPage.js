// pages/contacts/BlockedUsersPage.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import {
    UserX,
    Users,
    Search,
    Unlock,
    User,
    Phone,
    Loader,
    AlertCircle
} from 'lucide-react';

const BlockedUsersPage = () => {
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [unblockingId, setUnblockingId] = useState(null);

    useEffect(() => {
        fetchBlockedUsers();
    }, []);

    const fetchBlockedUsers = async () => {
        try {
            setLoading(true);

            const response = await api.get('/contacts/my/block/user');

            // Works whether interceptor is used or not
            const success = response?.success ?? response?.data?.success;
            const data = response?.data?.data ?? response?.data;

            if (success) {
                setBlockedUsers(data || []);
            } else {
                setBlockedUsers([]);
                console.error('API returned failure');
            }
        } catch (error) {
            console.error('Failed to fetch blocked users:', error);
            setBlockedUsers([]);
        } finally {
            setLoading(false);
        }
    };

    const handleUnblock = async (userId) => {
        if (!window.confirm('Are you sure you want to unblock this user?')) {
            return;
        }

        try {
            setUnblockingId(userId);
            await api.delete(`/contacts/unblock/${userId}`);
            toast.success('User unblocked successfully');

            setBlockedUsers(prev =>
                prev.filter(user => user.id !== userId)
            );
        } catch (error) {
            console.error('Failed to unblock user:', error);
        } finally {
            setUnblockingId(null);
        }
    };

    const filteredUsers = blockedUsers.filter(user => {
        const searchLower = searchTerm.toLowerCase();
        return (
            user.name?.toLowerCase().includes(searchLower) ||
            user.phone?.includes(searchTerm)
        );
    });

    const formatPhone = (phone) => {
        if (!phone) return '';
        return phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Loader className="h-12 w-12 animate-spin text-red-600 mx-auto" />
                    <p className="mt-4 text-gray-600">Loading blocked users...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <UserX className="h-7 w-7 text-red-600" />
                        Blocked Users
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Manage users you've blocked from contacting you
                    </p>
                </div>
                <Link
                    to="/contacts"
                    className="inline-flex items-center px-4 py-2 border rounded-lg text-gray-700 bg-white hover:bg-gray-50"
                >
                    <Users className="h-4 w-4 mr-2" />
                    Back to Contacts
                </Link>
            </div>

            {/* Stats */}
            <div className="bg-white p-6 rounded-xl shadow border">
                <div className="flex items-center">
                    <UserX className="h-8 w-8 text-red-500" />
                    <div className="ml-4">
                        <p className="text-sm text-gray-600">Total Blocked</p>
                        <p className="text-2xl font-semibold text-gray-900">
                            {blockedUsers.length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500"
                    placeholder="Search blocked users..."
                />
            </div>

            {/* Blocked Users List */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
                {filteredUsers.length === 0 ? (
                    <div className="text-center py-12">
                        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto" />
                        <h3 className="mt-4 text-sm font-medium text-gray-900">
                            {searchTerm ? 'No users found' : 'No blocked users'}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {searchTerm
                                ? `No blocked users match "${searchTerm}".`
                                : "You haven't blocked any users yet."}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {filteredUsers.map(user => (
                            <div
                                key={user.id}
                                className="px-6 py-4 flex justify-between items-center hover:bg-gray-50"
                            >
                                <div className="flex items-center">
                                    <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                                        <User className="h-6 w-6 text-red-600" />
                                    </div>
                                    <div className="ml-4">
                                        <p className="font-medium text-gray-900">
                                            {user.name}
                                        </p>
                                        <p className="text-sm text-gray-500 flex items-center">
                                            <Phone className="h-4 w-4 mr-1" />
                                            {formatPhone(user.phone)}
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleUnblock(user.id)}
                                    disabled={unblockingId === user.id}
                                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
                                >
                                    {unblockingId === user.id ? (
                                        <>
                                            <Loader className="h-3 w-3 animate-spin mr-1" />
                                            Unblocking...
                                        </>
                                    ) : (
                                        <>
                                            <Unlock className="h-3 w-3 mr-1" />
                                            Unblock
                                        </>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Important Note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex">
                    <AlertCircle className="h-5 w-5 text-yellow-400" />
                    <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">
                            Important
                        </h3>
                        <ul className="mt-2 text-sm text-yellow-700 list-disc pl-5 space-y-1">
                            <li>Blocked users cannot contact you</li>
                            <li>Unblocking allows them to contact you again</li>
                            <li>You can re-block users anytime</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BlockedUsersPage;
