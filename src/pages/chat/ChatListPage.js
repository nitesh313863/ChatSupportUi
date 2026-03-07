import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import {
    MessageCircle,
    Loader,
    User
} from 'lucide-react';

const ChatListPage = () => {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    /* ================= LOAD CHAT LIST ================= */
    const loadChats = async () => {
        try {
            setLoading(true);
            const res = await api.get('/chat/rooms/get/all');

            // ResponseModel → data
            setChats(res.data || []);
        } catch (err) {
            toast.error('Failed to load chats');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadChats();
    }, []);

    /* ================= UI ================= */
    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="h-full bg-white rounded-lg shadow overflow-hidden">

            {/* HEADER */}
            <div className="px-4 py-3 border-b flex items-center">
                <MessageCircle className="h-5 w-5 text-blue-600 mr-2" />
                <h2 className="text-lg font-semibold">Chats</h2>
            </div>

            {/* CHAT LIST */}
            <div className="divide-y overflow-y-auto h-full">
                {chats.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        No chats found
                    </div>
                )}

                {chats.map(chat => (
                    <div
                        key={chat.roomId}
                        onClick={() =>
                            navigate(`/chat/${chat.roomId}`, {
                                state: {
                                    roomName: chat.name,
                                    otherUserId: chat.otherUserId
                                }
                            })
                        }

                        className="flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 transition"
                    >
                        {/* AVATAR */}
                        <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-6 w-6 text-blue-600" />
                        </div>

                        {/* CONTENT */}
                        <div className="ml-3 flex-1">
                            <div className="flex justify-between items-center">
                                <p className="font-medium text-gray-900">
                                    {chat.name}
                                </p>
                                <div className="flex items-center gap-2">
                                    {chat.unreadCount > 0 && (
                                        <span className="min-w-[20px] h-5 px-1 rounded-full bg-green-600 text-white text-[11px] font-semibold flex items-center justify-center">
                                            {chat.unreadCount}
                                        </span>
                                    )}
                                    {chat.lastMessageTime && (
                                        <p className="text-xs text-gray-400">
                                            {new Date(chat.lastMessageTime).toLocaleTimeString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 truncate">
                                {chat.lastMessage || 'No messages yet'}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ChatListPage;
