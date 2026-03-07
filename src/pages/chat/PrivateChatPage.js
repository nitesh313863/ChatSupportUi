import React, {useEffect, useRef, useState, useCallback} from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import {Send, ArrowLeft, Loader, User, Wifi, WifiOff} from 'lucide-react';
import {useParams, useLocation, useNavigate} from 'react-router-dom';

const PrivateChatPage = () => {
    const {roomId} = useParams();
    const navigate = useNavigate();

    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isWsConnected, setIsWsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [typingUserId, setTypingUserId] = useState(null);

    const typingTimeoutRef = useRef(null);
    const connectionRetryRef = useRef(null);
    const typingDebounceRef = useRef(null);
    const shouldReconnectRef = useRef(false);
    const manualCloseRef = useRef(false);
    const messagesRef = useRef([]);
    const presenceOnlineRef = useRef(false);

    const [presence, setPresence] = useState({
        online: false,
        lastSeen: null
    });

    const location = useLocation();
    const roomName = location.state?.roomName || 'Private Chat';

    const wsRef = useRef(null);
    const bottomRef = useRef(null);

    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    const canMarkMessagesAsRead = useCallback(() => {
        return document.visibilityState === 'visible' && document.hasFocus();
    }, []);

    /* ================= NAVIGATE BACK ================= */
    const handleBack = () => {
        navigate(-1);
    };

    /* ================= LOAD CHAT HISTORY ================= */
    const loadMessages = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get(`/chat/rooms/${roomId}/messages`);

            const mapped = (res.data || []).map(m => ({
                messageId: m.messageId,
                roomId: m.roomId,
                senderId: m.senderId,
                content: m.content,
                sentAt: new Date(m.createdAt).getTime(),
                delivered: m.senderId === user.id
                    ? (m.deliveryStatus === 'DELIVERED' || m.deliveryStatus === 'READ')
                    : true,
                read: m.deliveryStatus === 'READ'
            }));

            setMessages(mapped);

            // ✅ READ only when room is opened and unread messages exist
            const hasUnread = mapped.some(
                m => m.senderId !== user.id && !m.read
            );

            if (hasUnread && canMarkMessagesAsRead()) {
                await api.post(`/chat/rooms/${roomId}/read`);
            }

        } catch (err) {
            toast.error('Failed to load messages');
        } finally {
            setLoading(false);
        }
    }, [roomId, user.id, canMarkMessagesAsRead]);

    /* ================= TYPING HANDLER ================= */
    const handleTyping = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.log('[TYPING] WebSocket not ready, state:', wsRef.current?.readyState);
            return;
        }

        try {
            const typingMessage = {
                type: 'TYPING',
                roomId: Number(roomId),
                userId: user.id
            };

            console.log('[TYPING] Sending event:', typingMessage);
            wsRef.current.send(JSON.stringify(typingMessage));
        } catch (error) {
            console.error('[TYPING] Failed to send:', error);
        }
    }, [roomId, user.id]);

    /* ================= WEBSOCKET CONNECTION ================= */
    const connectWebSocket = useCallback(() => {
        if (!shouldReconnectRef.current) {
            return;
        }

        // Close existing connection if any
        if (wsRef.current) {
            manualCloseRef.current = true;
            wsRef.current.close();
            wsRef.current = null;
        }

        // Clear any retry timeout
        if (connectionRetryRef.current) {
            clearTimeout(connectionRetryRef.current);
            connectionRetryRef.current = null;
        }

        setConnectionStatus('connecting');
        console.log('[WS] Connecting...');

        const ws = new WebSocket(
            `ws://localhost:8086/ws/chat?token=${token}`
        );

        // Send periodic pings to keep connection alive
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({type: 'PING'}));
            }
        }, 25000); // Send ping every 25 seconds

        ws.onopen = () => {
            console.log('[WS] Connected successfully');
            setIsWsConnected(true);
            setConnectionStatus('connected');

            // Send initial presence
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN && shouldReconnectRef.current) {
                    ws.send(JSON.stringify({
                        type: 'USER_ONLINE',
                        userId: user.id
                    }));
                }
            }, 100);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[WS EVENT] Received:', data);

                // READ EVENT (blue ticks for sender)
                if (data.type === 'READ') {
                    setMessages(prev =>
                        prev.map(m =>
                            m.messageId === data.messageId && m.senderId === user.id
                                ? {...m, delivered: true, read: true}
                                : m
                        )
                    );
                    return;
                }

                // DELIVERED EVENT (double gray ticks for sender)
                if (data.type === 'DELIVERED') {
                    setMessages(prev =>
                        prev.map(m =>
                            m.messageId === data.messageId && m.senderId === user.id
                                ? {...m, delivered: true}
                                : m
                        )
                    );
                    return;
                }

                // USER ONLINE
                if (data.type === 'USER_ONLINE') {
                    if (data.userId !== user.id) {
                        presenceOnlineRef.current = true;
                        setPresence({
                            online: true,
                            lastSeen: null
                        });
                    }
                    return;
                }

                // USER OFFLINE
                if (data.type === 'USER_OFFLINE') {
                    if (data.userId !== user.id) {
                        presenceOnlineRef.current = false;
                        setPresence({
                            online: false,
                            lastSeen: data.lastSeen
                        });
                    }
                    return;
                }

                // TYPING EVENT
                if (data.type === 'TYPING' && data.roomId === Number(roomId)) {
                    console.log('[TYPING] Received typing event from user:', data.userId);

                    // Only show typing for other users
                    if (data.userId !== user.id) {
                        setTypingUserId(data.userId);
                        setIsTyping(true);

                        // Clear existing timeout
                        if (typingTimeoutRef.current) {
                            clearTimeout(typingTimeoutRef.current);
                        }

                        // Set timeout to clear typing indicator
                        typingTimeoutRef.current = setTimeout(() => {
                            console.log('[TYPING] Clearing indicator');
                            setIsTyping(false);
                            setTypingUserId(null);
                        }, 3000);
                    }
                    return;
                }

                // MESSAGE EVENT
                if (data.type === 'MESSAGE' && data.roomId === Number(roomId)) {
                    const deliveryStatus = data.deliveryStatus || data.status;
                    const isMessageFromCurrentUser = data.senderId === user.id;
                    const isRead = typeof data.read === 'boolean'
                        ? data.read
                        : deliveryStatus === 'READ';
                    const isDeliveredByStatus = deliveryStatus === 'DELIVERED' || deliveryStatus === 'READ';
                    const receiverOnline = typeof data.receiverOnline === 'boolean'
                        ? data.receiverOnline
                        : presenceOnlineRef.current;
                    const newMessage = {
                        messageId: data.messageId,
                        roomId: data.roomId,
                        senderId: data.senderId,
                        content: data.content,
                        sentAt: data.sentAt || Date.now(),
                        receiverId: data.receiverId,
                        delivered: isMessageFromCurrentUser
                            ? (isRead || isDeliveredByStatus || receiverOnline)
                            : true,
                        read: isRead
                    };

                    console.log('[WS] New message received:', newMessage);

                    setMessages(prev => [...prev, newMessage]);

                    // Mark as read only when chat is actually visible and focused
                    if (data.receiverId === user.id && canMarkMessagesAsRead()) {
                        api.post(`/chat/rooms/${roomId}/read`)
                            .then(() => {
                                console.log('[WS] Message marked as read');
                            })
                            .catch(err => {
                                console.error('[WS] Failed to mark as read:', err);
                            });
                    }
                }

            } catch (error) {
                console.error('[WS] Invalid JSON:', event.data, error);
            }
        };

        ws.onerror = (error) => {
            console.error('[WS] Connection error:', error);
            setConnectionStatus('error');
            setIsWsConnected(false);
        };

        ws.onclose = (event) => {
            clearInterval(pingInterval);
            setIsWsConnected(false);
            setConnectionStatus('disconnected');
            wsRef.current = null;

            // Clear typing indicator when disconnected
            setIsTyping(false);
            setTypingUserId(null);

            const wasManualClose = manualCloseRef.current;
            manualCloseRef.current = false;

            if (connectionRetryRef.current) {
                clearTimeout(connectionRetryRef.current);
                connectionRetryRef.current = null;
            }

            if (wasManualClose || !shouldReconnectRef.current) {
                return;
            }

            console.log('[WS] Disconnected, code:', event.code, 'reason:', event.reason);
            connectionRetryRef.current = setTimeout(() => {
                if (shouldReconnectRef.current) {
                    console.log('[WS] Attempting to reconnect...');
                    connectWebSocket();
                }
            }, 3000);
        };

        wsRef.current = ws;
    }, [token, roomId, user.id, canMarkMessagesAsRead]);

    /* ================= SEND MESSAGE ================= */
    const sendMessage = async () => {
        if (!text.trim()) return;

        // Clear typing indicator when sending
        setIsTyping(false);
        setTypingUserId(null);
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        try {
            await api.post('/chat/private/send', {
                roomId: Number(roomId),
                message: text
            });

            setText('');
        } catch (error) {
            toast.error('Failed to send message');
            console.error('Send message error:', error);
        }
    };

    /* ================= DEBOUNCED TYPING ================= */
    const handleInputChange = (e) => {
        const value = e.target.value;
        setText(value);

        // Clear previous debounce timeout
        if (typingDebounceRef.current) {
            clearTimeout(typingDebounceRef.current);
        }

        // Send typing event after 300ms of inactivity
        if (value.trim().length > 0) {
            typingDebounceRef.current = setTimeout(() => {
                if (isWsConnected) {
                    handleTyping();
                }
            }, 300);
        }

        // Clear typing indicator when input is empty
        if (value.trim().length === 0) {
            setIsTyping(false);
        }
    };

    const markRoomAsReadIfActive = useCallback(() => {
        if (!canMarkMessagesAsRead()) {
            return;
        }

        const hasUnread = messagesRef.current.some(
            m => m.senderId !== user.id && !m.read
        );

        if (!hasUnread) {
            return;
        }

        api.post(`/chat/rooms/${roomId}/read`).catch(err => {
            console.error('[READ] Failed to mark room as read on focus:', err);
        });
    }, [roomId, user.id, canMarkMessagesAsRead]);

    /* ================= EFFECTS ================= */
    useEffect(() => {
        presenceOnlineRef.current = presence.online;
    }, [presence.online]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        shouldReconnectRef.current = true;
        manualCloseRef.current = false;
        loadMessages();
        connectWebSocket();

        return () => {
            shouldReconnectRef.current = false;

            // Clean up WebSocket
            if (wsRef.current) {
                manualCloseRef.current = true;
                wsRef.current.close();
                wsRef.current = null;
            }

            // Clean up timeouts
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (typingDebounceRef.current) {
                clearTimeout(typingDebounceRef.current);
            }
            if (connectionRetryRef.current) {
                clearTimeout(connectionRetryRef.current);
                connectionRetryRef.current = null;
            }

            setIsTyping(false);
            setTypingUserId(null);
        };
    }, [loadMessages, connectWebSocket]);

    useEffect(() => {
        const handleAttentionChange = () => {
            markRoomAsReadIfActive();
        };

        window.addEventListener('focus', handleAttentionChange);
        document.addEventListener('visibilitychange', handleAttentionChange);

        return () => {
            window.removeEventListener('focus', handleAttentionChange);
            document.removeEventListener('visibilitychange', handleAttentionChange);
        };
    }, [markRoomAsReadIfActive]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    /* ================= RENDER LOADING ================= */
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-100">
                <Loader className="h-10 w-10 animate-spin text-blue-600 mb-4" />
                <p className="text-gray-600">Loading messages...</p>
            </div>
        );
    }

    /* ================= UI ================= */
    return (
        <div className="flex flex-col h-full bg-gray-100">

            {/* HEADER */}
            <div className="flex items-center px-4 py-3 bg-white border-b shadow-sm">
                <button
                    onClick={handleBack}
                    className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center mr-2"
                >
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                </button>

                <div className="flex items-center flex-1">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="ml-3 flex-1">
                        <div className="flex items-center justify-between">
                            <p className="font-medium text-gray-900">
                                {roomName}
                            </p>
                            <div className="flex items-center text-xs">
                                {isWsConnected ? (
                                    <Wifi className="h-3 w-3 text-green-500 mr-1" />
                                ) : (
                                    <WifiOff className="h-3 w-3 text-red-500 mr-1" />
                                )}
                                <span className={`font-medium ${
                                    isWsConnected ? 'text-green-600' : 'text-red-600'
                                }`}>
                                    {isWsConnected ? 'Online' : 'Offline'}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                                {presence.online
                                    ? 'Online'
                                    : presence.lastSeen
                                        ? `Last seen ${new Date(presence.lastSeen).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}`
                                        : 'Offline'}
                            </p>

                            {isTyping && typingUserId && typingUserId !== user.id && (
                                <span className="text-xs text-blue-600 font-medium animate-pulse">
                                    typing...
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* CONNECTION STATUS BANNER */}
            {!isWsConnected && (
                <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
                    <div className="flex items-center justify-center">
                        <WifiOff className="h-4 w-4 text-yellow-600 mr-2" />
                        <p className="text-sm text-yellow-800">
                            Connecting to chat server...
                        </p>
                    </div>
                </div>
            )}

            {/* MESSAGES CONTAINER */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <div className="text-center p-8">
                            <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-4">
                                <User className="h-8 w-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-700 mb-2">No messages yet</h3>
                            <p className="text-gray-500">Start the conversation by sending a message!</p>
                        </div>
                    </div>
                ) : (
                    messages.map(msg => {
                        const isMine = msg.senderId === user.id;
                        const messageTime = new Date(msg.sentAt);

                        return (
                            <div
                                key={msg.messageId || `${msg.sentAt}-${msg.senderId}`}
                                className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl text-sm shadow ${
                                    isMine
                                        ? 'bg-green-500 text-white rounded-br-none'
                                        : 'bg-white text-gray-900 rounded-bl-none'
                                }`}>
                                    <p className="break-words">{msg.content}</p>

                                    <div className="flex items-center justify-end gap-1 text-[10px] mt-1">
                                        <span className="opacity-70">
                                            {messageTime.toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>

                                        {isMine && (
                                            <span className={`ml-1 text-xs ${
                                                msg.read
                                                    ? 'font-extrabold text-sky-300 bg-sky-500/30 px-1.5 py-0.5 rounded-full shadow-sm'
                                                    : msg.delivered
                                                        ? 'font-bold text-gray-300'
                                                        : 'font-bold text-gray-400'
                                            }`}>
                                                {msg.read ? '\u2713\u2713' : msg.delivered ? '\u2713\u2713' : '\u2713'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* TYPING INDICATOR */}
            {isTyping && typingUserId && typingUserId !== user.id && (
                <div className="px-4 py-2">
                    <div className="flex items-center">
                        <div className="bg-white px-3 py-2 rounded-lg shadow">
                            <div className="flex space-x-1">
                                <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce"></div>
                                <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MESSAGE INPUT */}
            <div className="bg-white border-t px-3 py-3">
                <div className="flex items-center">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={text}
                            onChange={handleInputChange}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            placeholder={isWsConnected ? "Type a message..." : "Connecting..."}
                            disabled={!isWsConnected}
                            className={`w-full px-4 py-3 border rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                                !isWsConnected ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                        />

                        {!isWsConnected && (
                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                <div className="h-2 w-2 rounded-full bg-red-500 animate-ping"></div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={sendMessage}
                        disabled={!text.trim() || !isWsConnected}
                        className={`ml-3 p-3 rounded-full flex items-center justify-center ${
                            text.trim() && isWsConnected
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        } transition-colors`}
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </div>

                {/* CONNECTION STATUS */}
                <div className="mt-2 text-center">
                    <p className="text-xs text-gray-500">
                        {connectionStatus === 'connecting' && 'Connecting to chat...'}
                        {connectionStatus === 'connected' && 'Connected • Messages are secure'}
                        {connectionStatus === 'disconnected' && 'Reconnecting...'}
                        {connectionStatus === 'error' && 'Connection error • Check your internet'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PrivateChatPage;



