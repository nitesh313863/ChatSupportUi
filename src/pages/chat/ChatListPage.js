import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import {
    CheckCheck,
    Loader,
    MessageCircle,
    MoreVertical,
    Plus,
    Search,
    User,
    Check
} from 'lucide-react';
import PrivateChatPage from './PrivateChatPage';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'favourites', label: 'Favourites' },
    { key: 'groups', label: 'Groups' },
];

const formatChatTime = (rawTime) => {
    if (!rawTime) return '';
    const date = new Date(rawTime);
    const now = new Date();

    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    }

    return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
};

const ChatListPage = () => {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');
    const navigate = useNavigate();
    const menuRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const { logout } = useAuth();
    const { roomId } = useParams();

    // Get current user ID from localStorage (adjust if stored differently)
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const currentUserId = Number(user?.id);

    const loadChats = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/chat/rooms/get/all');
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

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!menuOpen) return;
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen]);

    useEffect(() => {
        const handleWsEvent = (event) => {
            const payload = event.detail;
            if (!payload || !payload.type) return;

            if (payload.type === 'UNREAD_COUNT' && payload.roomId != null) {
                setChats((prev) =>
                    prev.map((chat) =>
                        chat.roomId === payload.roomId
                            ? { ...chat, unreadCount: payload.unreadCount ?? chat.unreadCount }
                            : chat
                    )
                );
                return;
            }

            if (payload.type === 'MESSAGE' && payload.roomId != null) {
                setChats((prev) =>
                    prev.map((chat) =>
                        chat.roomId === payload.roomId
                            ? {
                                ...chat,
                                lastMessage: payload.content ?? chat.lastMessage,
                                lastMessageTime: payload.sentAt ?? chat.lastMessageTime,
                                lastMessageSender: payload.senderName ?? chat.lastMessageSender,
                            }
                            : chat
                    )
                );
            }
        };

        window.addEventListener('chat-ws-event', handleWsEvent);
        return () => window.removeEventListener('chat-ws-event', handleWsEvent);
    }, []);

    // Compute counts for filter badges
    const totalUnreadMessages = useMemo(
        () => chats.reduce((sum, chat) => sum + (Number(chat.unreadCount) || 0), 0),
        [chats]
    );

    const totalGroups = useMemo(
        () => chats.filter((chat) => chat.isGroup).length,
        [chats]
    );

    const totalFavourites = useMemo(
        () => chats.filter((chat) => chat.isFavourite).length,
        [chats]
    );

    const filteredChats = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();

        return [...chats]
            .filter((chat) => {
                if (activeFilter === 'unread') {
                    return Number(chat.unreadCount) > 0;
                }
                if (activeFilter === 'groups') {
                    return chat.isGroup === true;
                }
                if (activeFilter === 'favourites') {
                    return chat.isFavourite === true;
                }
                return true; // 'all'
            })
            .filter((chat) => {
                if (!normalizedSearch) return true;
                const name = String(chat.name || '').toLowerCase();
                const lastMessage = String(chat.lastMessage || '').toLowerCase();
                return name.includes(normalizedSearch) || lastMessage.includes(normalizedSearch);
            })
            .sort((a, b) => {
                const aTime = new Date(a.lastMessageTime || 0).getTime();
                const bTime = new Date(b.lastMessageTime || 0).getTime();
                return bTime - aTime;
            });
    }, [activeFilter, chats, searchTerm]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-[#0b141a]">
                <Loader className="h-8 w-8 animate-spin text-[#25d366]" />
            </div>
        );
    }

    return (
        <div className="chat-list-root h-full w-full bg-[#111b21] lg:grid lg:grid-cols-[410px_1fr]">
            <section className={`${roomId ? 'hidden lg:flex' : 'flex'} h-full bg-[#f0f2f5] border-r border-black/10 flex-col`}>
                <div className="px-5 py-4 bg-[#f7f7f7] border-b border-black/10 flex items-center justify-between">
                    <h1 className="text-[28px] leading-none font-semibold text-[#111b21]">Chats</h1>
                    <div ref={menuRef} className="flex items-center gap-2 text-[#54656f] relative">
                        <button
                            className="h-9 w-9 rounded-full hover:bg-black/5 flex items-center justify-center"
                            onClick={() => { /* create new chat placeholder */ }}
                            title="New chat"
                        >
                            <Plus className="h-5 w-5" />
                        </button>

                        <button
                            className="h-9 w-9 rounded-full hover:bg-black/5 flex items-center justify-center"
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
                            aria-haspopup="true"
                            aria-expanded={menuOpen}
                            title="More"
                        >
                            <MoreVertical className="h-5 w-5" />
                        </button>

                        {menuOpen && (
                            <div className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg z-50 overflow-hidden">
                                <button
                                    onClick={() => { setMenuOpen(false); logout(); }}
                                    className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-[#111b21]"
                                >
                                    Logout
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-4 py-3 border-b border-black/10 bg-[#f0f2f5]">
                    <div className="rounded-full bg-[#ffffff] px-4 py-2 flex items-center gap-3 border border-black/10">
                        <Search className="h-4 w-4 text-[#667781]" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search or start a new chat"
                            className="bg-transparent outline-none text-sm text-[#111b21] w-full placeholder:text-[#667781]"
                        />
                    </div>
                    <div className="mt-3 flex items-center gap-2 overflow-x-auto">
                        {FILTERS.map((filter) => {
                            const isActive = activeFilter === filter.key;
                            let label = filter.label;
                            if (filter.key === 'unread' && totalUnreadMessages > 0) {
                                label = `Unread ${totalUnreadMessages}`;
                            } else if (filter.key === 'groups' && totalGroups > 0) {
                                label = `Groups ${totalGroups}`;
                            } else if (filter.key === 'favourites' && totalFavourites > 0) {
                                label = `Favourites ${totalFavourites}`;
                            }
                            return (
                                <button
                                    key={filter.key}
                                    onClick={() => setActiveFilter(filter.key)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
                                        isActive
                                            ? 'bg-[#d9fdd3] text-[#0f5132]'
                                            : 'bg-white text-[#41525d] border border-black/10 hover:bg-black/[0.03]'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-[#ffffff]">
                    {filteredChats.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-[#667781] px-6 text-center">
                            <MessageCircle className="h-12 w-12 mb-4 opacity-60" />
                            <p>No chat found</p>
                        </div>
                    )}

                    {filteredChats.map((chat) => {
                        const hasUnread = Number(chat.unreadCount) > 0;
                        const timeLabel = formatChatTime(chat.lastMessageTime);
                        const isGroup = chat.isGroup;
                        const lastMessageSender = chat.lastMessageSender || '';
                        const location = chat.location; // if available

                        return (
                            <button
                                key={chat.roomId}
                                onClick={() =>
                                    navigate(`/chats/${chat.roomId}`, {
                                        state: {
                                            roomName: chat.name,
                                            otherUserId: chat.otherUserId,
                                            isGroup: chat.isGroup,
                                        }
                                    })
                                }
                                className="w-full px-4 py-3 flex items-center gap-3 border-b border-black/5 hover:bg-[#f5f6f6] text-left"
                            >
                                <div className="h-12 w-12 rounded-full bg-[#dfe5e7] flex items-center justify-center shrink-0">
                                    <User className="h-6 w-6 text-[#54656f]" />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-medium text-[#111b21] truncate">
                                            {chat.name}
                                            {chat.participantCount && (
                                                <span className="ml-1 text-xs text-[#667781]">
                                                    {chat.participantCount}
                                                </span>
                                            )}
                                        </p>
                                        <p className={`text-xs ${hasUnread ? 'text-[#25d366]' : 'text-[#667781]'}`}>
                                            {timeLabel}
                                        </p>
                                    </div>

                                    <div className="mt-1 flex items-center justify-between gap-2">
                                        <p className="text-sm text-[#667781] truncate flex items-center gap-1">
                                            {/* Show read receipts only for private chats where last message was sent by current user */}
                                            {!isGroup && chat.lastMessageSender === currentUserId && (
                                                chat.lastMessageRead ? (
                                                    <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                                                ) : chat.lastMessageDelivered ? (
                                                    <CheckCheck className="h-3.5 w-3.5 text-[#8696a0]" />
                                                ) : (
                                                    <Check className="h-3.5 w-3.5 text-[#8696a0]" />
                                                )
                                            )}
                                            <span>
                                                {isGroup && lastMessageSender && `${lastMessageSender}: `}
                                                {chat.lastMessage || 'No messages yet'}
                                            </span>
                                        </p>
                                        {hasUnread && (
                                            <span className="min-w-5 h-5 rounded-full bg-[#25d366] text-white text-[11px] font-semibold flex items-center justify-center px-1">
                                                {chat.unreadCount}
                                            </span>
                                        )}
                                    </div>

                                    {/* Location line if present (like in your image) */}
                                    {location && (
                                        <p className="text-xs text-[#667781] mt-1 truncate">
                                            {location}
                                        </p>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className={`${roomId ? 'flex' : 'hidden lg:flex'} h-full items-center justify-center bg-[#0b141a] relative overflow-hidden`}>
                {roomId ? (
                    <PrivateChatPage />
                ) : (
                    <>
                        <div
                            className="absolute inset-0 opacity-20"
                            style={{
                                backgroundImage:
                                    'radial-gradient(circle at 25px 25px, rgba(255,255,255,0.08) 2px, transparent 0)',
                                backgroundSize: '50px 50px'
                            }}
                        />
                        <div className="relative z-10 text-center text-[#d1d7db] max-w-sm px-8">
                            <div className="h-20 w-20 rounded-full bg-[#202c33] flex items-center justify-center mx-auto mb-5">
                                <MessageCircle className="h-10 w-10 text-[#25d366]" />
                            </div>
                            <h3 className="text-2xl font-semibold mb-2">WhatsApp-style Chat View</h3>
                            <p className="text-sm text-[#8696a0]">
                                Select a chat to start messaging in real-time with delivery, read receipts, and live presence.
                            </p>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
};

export default ChatListPage;