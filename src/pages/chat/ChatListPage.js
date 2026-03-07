import React, { useCallback, useEffect, useRef, useState } from 'react';
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
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const shouldReconnectRef = useRef(false);
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    /* ================= LOAD CHAT LIST ================= */
    const loadChats = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        loadChats();
    }, [loadChats]);

    const handleMessageEvent = useCallback((payload) => {
        const currentUserId = Number(user?.id);
        const roomId = Number(payload?.roomId);
        const senderId = Number(payload?.senderId);
        const receiverId = Number(payload?.receiverId);

        if (!currentUserId || !roomId || (!senderId && !receiverId)) {
            return;
        }

        if (senderId !== currentUserId && receiverId !== currentUserId) {
            return;
        }

        const isIncoming = receiverId === currentUserId;
        const fallbackTime = new Date().toISOString();
        const parsedTime = payload?.sentAt ? new Date(payload.sentAt) : null;
        const lastMessageTime = parsedTime && !Number.isNaN(parsedTime.getTime())
            ? parsedTime.toISOString()
            : fallbackTime;
        const lastMessage = payload?.content || '';

        setChats((prev) => {
            const currentIndex = prev.findIndex((chat) => Number(chat.roomId) === roomId);
            const otherUserId = senderId === currentUserId ? receiverId : senderId;

            if (currentIndex === -1) {
                const newChat = {
                    roomId,
                    name: otherUserId ? `User ${otherUserId}` : 'Private Chat',
                    otherUserId: otherUserId || null,
                    lastMessage,
                    lastMessageTime,
                    unreadCount: isIncoming ? 1 : 0
                };
                return [newChat, ...prev];
            }

            const currentChat = prev[currentIndex];
            const updatedChat = {
                ...currentChat,
                otherUserId: currentChat.otherUserId ?? (otherUserId || null),
                lastMessage: lastMessage || currentChat.lastMessage,
                lastMessageTime,
                unreadCount: isIncoming
                    ? Number(currentChat.unreadCount || 0) + 1
                    : Number(currentChat.unreadCount || 0)
            };

            return [
                updatedChat,
                ...prev.filter((_, index) => index !== currentIndex)
            ];
        });
    }, [user?.id]);

    const handleUnreadCountEvent = useCallback((payload) => {
        const roomId = Number(payload?.roomId);
        const unreadCount = Number(payload?.unreadCount);

        if (!roomId || Number.isNaN(unreadCount)) {
            return;
        }

        setChats((prev) =>
            prev.map((chat) =>
                Number(chat.roomId) === roomId
                    ? {...chat, unreadCount: Math.max(0, unreadCount)}
                    : chat
            )
        );
    }, []);

    useEffect(() => {
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

            const ws = new WebSocket(`ws://localhost:8086/ws/chat?token=${token}`);
            let pingInterval = null;

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    type: 'USER_ONLINE',
                    userId: user.id
                }));

                pingInterval = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'PING' }));
                    }
                }, 25000);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'MESSAGE') {
                        handleMessageEvent(data);
                        return;
                    }
                    if (data.type === 'UNREAD_COUNT') {
                        handleUnreadCountEvent(data);
                    }
                } catch (e) {
                    // ignore invalid payloads
                }
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
    }, [token, user?.id, handleMessageEvent, handleUnreadCountEvent]);

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
