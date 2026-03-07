import React, {useEffect, useRef, useState, useCallback} from 'react';
import api from '../../utils/api';
import { buildChatWsUrl } from '../../utils/ws';
import toast from 'react-hot-toast';
import {Send, ArrowLeft, Loader, User, Wifi, WifiOff, Paperclip, Mic, Video, Square, X} from 'lucide-react';
import {useParams, useLocation, useNavigate} from 'react-router-dom';

const MEDIA_PLACEHOLDER_TEXTS = new Set(['[Image]', '[Video]', '[Audio]', '[File]']);
const MAX_MEDIA_BASE64_LENGTH = 900000;

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
    const [pendingMedia, setPendingMedia] = useState(null);
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [isRecordingVideo, setIsRecordingVideo] = useState(false);

    const typingTimeoutRef = useRef(null);
    const connectionRetryRef = useRef(null);
    const typingDebounceRef = useRef(null);
    const shouldReconnectRef = useRef(false);
    const manualCloseRef = useRef(false);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const mediaChunksRef = useRef([]);

    const [presence, setPresence] = useState({
        online: false,
        lastSeen: null
    });

    const location = useLocation();
    const roomName = location.state?.roomName || 'Private Chat';
    const [otherUserId, setOtherUserId] = useState(location.state?.otherUserId ?? null);

    const wsRef = useRef(null);
    const bottomRef = useRef(null);
    const otherUserIdRef = useRef(location.state?.otherUserId ?? null);

    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    const isChatActive = useCallback(() => {
        return document.visibilityState === 'visible';
    }, []);

    const getMessageTypeFromMime = (mimeType = '') => {
        if (mimeType.startsWith('image/')) return 'IMAGE';
        if (mimeType.startsWith('video/')) return 'VIDEO';
        if (mimeType.startsWith('audio/')) return 'AUDIO';
        return 'FILE';
    };

    const buildDataUrl = (base64, mimeType) => {
        if (!base64) return '';
        return `data:${mimeType || 'application/octet-stream'};base64,${base64}`;
    };

    const fileToBase64 = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                const parts = result.split(',');
                resolve(parts.length > 1 ? parts[1] : '');
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });

    const stopMediaStream = useCallback(() => {
        if (!mediaStreamRef.current) return;
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
    }, []);

    const resetRecorder = useCallback(() => {
        mediaRecorderRef.current = null;
        mediaChunksRef.current = [];
        setIsRecordingAudio(false);
        setIsRecordingVideo(false);
        stopMediaStream();
    }, [stopMediaStream]);

    const setPendingMediaFromBlob = useCallback(async (blob, fallbackFileName) => {
        const base64 = await fileToBase64(blob);
        if (!base64) {
            toast.error('Failed to process media');
            return;
        }
        if (base64.length > MAX_MEDIA_BASE64_LENGTH) {
            toast.error('Media too large. Send smaller file.');
            return;
        }

        const mimeType = blob.type || 'application/octet-stream';
        const extension = mimeType.split('/')[1] || 'bin';
        const safeFileName = fallbackFileName || `media-${Date.now()}.${extension}`;
        setPendingMedia({
            base64,
            mimeType,
            fileName: safeFileName,
            messageType: getMessageTypeFromMime(mimeType)
        });
    }, []);

    const handleFilePick = async (event) => {
        try {
            const file = event.target.files?.[0];
            if (!file) return;
            const base64 = await fileToBase64(file);
            if (!base64) {
                toast.error('Failed to process selected file');
                return;
            }
            if (base64.length > MAX_MEDIA_BASE64_LENGTH) {
                toast.error('File too large. Send smaller file.');
                return;
            }

            setPendingMedia({
                base64,
                mimeType: file.type || 'application/octet-stream',
                fileName: file.name || `file-${Date.now()}`,
                messageType: getMessageTypeFromMime(file.type || '')
            });
        } catch (error) {
            toast.error('Failed to attach file');
        } finally {
            event.target.value = '';
        }
    };

    const startAudioRecording = async () => {
        try {
            if (!navigator.mediaDevices || !window.MediaRecorder) {
                toast.error('Audio recording is not supported in this browser');
                return;
            }

            resetRecorder();
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            mediaStreamRef.current = stream;
            mediaChunksRef.current = [];

            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    mediaChunksRef.current.push(e.data);
                }
            };
            recorder.onstop = async () => {
                const blob = new Blob(mediaChunksRef.current, {type: recorder.mimeType || 'audio/webm'});
                await setPendingMediaFromBlob(blob, `voice-${Date.now()}.webm`);
                resetRecorder();
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecordingAudio(true);
            setIsRecordingVideo(false);
            toast.success('Audio recording started');
        } catch (error) {
            resetRecorder();
            toast.error('Unable to start audio recording');
        }
    };

    const startVideoRecording = async () => {
        try {
            if (!navigator.mediaDevices || !window.MediaRecorder) {
                toast.error('Video recording is not supported in this browser');
                return;
            }

            resetRecorder();
            const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
            mediaStreamRef.current = stream;
            mediaChunksRef.current = [];

            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    mediaChunksRef.current.push(e.data);
                }
            };
            recorder.onstop = async () => {
                const blob = new Blob(mediaChunksRef.current, {type: recorder.mimeType || 'video/webm'});
                await setPendingMediaFromBlob(blob, `video-${Date.now()}.webm`);
                resetRecorder();
            };
            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecordingVideo(true);
            setIsRecordingAudio(false);
            toast.success('Video recording started');
        } catch (error) {
            resetRecorder();
            toast.error('Unable to start video recording');
        }
    };

    const stopRecording = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) return;
        if (recorder.state !== 'inactive') {
            recorder.stop();
            toast.success('Recording saved');
        }
    };

    /* ================= NAVIGATE BACK ================= */
    const handleBack = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'ROOM_CLOSE',
                roomId: Number(roomId),
                userId: user.id
            }));
        }
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
                messageType: m.messageType || 'TEXT',
                mediaBase64: m.mediaBase64 || null,
                mimeType: m.mimeType || null,
                fileName: m.fileName || null,
                delivered: m.deliveryStatus === 'DELIVERED' || m.deliveryStatus === 'READ',
                read: m.deliveryStatus === 'READ'
            }));

            const inferredOtherUserId = mapped.find(m => m.senderId !== user.id)?.senderId;
            if (inferredOtherUserId && inferredOtherUserId !== otherUserIdRef.current) {
                otherUserIdRef.current = inferredOtherUserId;
                setOtherUserId(inferredOtherUserId);
            }

            setMessages(mapped);

            // ✅ READ only when room is opened and unread messages exist
            const hasUnread = mapped.some(
                m => m.senderId !== user.id && !m.read
            );

            if (hasUnread && isChatActive()) {
                await api.post(`/chat/rooms/${roomId}/read`);
            }

        } catch (err) {
            toast.error('Failed to load messages');
        } finally {
            setLoading(false);
        }
    }, [roomId, user.id, isChatActive]);

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

        const ws = new WebSocket(buildChatWsUrl(token));

        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'PING' }));
                ws.send(JSON.stringify({
                    type: 'ROOM_OPEN',
                    roomId: Number(roomId),
                    userId: user.id
                }));
            }
        }, 25000);

        ws.onopen = () => {
            console.log('[WS] Connected successfully');
            setIsWsConnected(true);
            setConnectionStatus('connected');

            // Send initial presence
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'ROOM_OPEN',
                        roomId: Number(roomId),
                        userId: user.id
                    }));

                    if (isChatActive()) {
                        setTimeout(() => {
                            api.post(`/chat/rooms/${roomId}/read`).catch(() => {});
                        }, 200);
                    }
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
                    const shouldApplyPresence = otherUserIdRef.current != null
                        ? data.userId === otherUserIdRef.current
                        : data.roomId === Number(roomId);
                    if (shouldApplyPresence) {
                        if (otherUserIdRef.current == null && data.userId !== user.id) {
                            otherUserIdRef.current = data.userId;
                            setOtherUserId(data.userId);
                        }
                        setPresence({
                            online: true,
                            lastSeen: null
                        });
                    }
                    return;
                }

                // USER OFFLINE
                if (data.type === 'USER_OFFLINE') {
                    const shouldApplyPresence = otherUserIdRef.current != null
                        ? data.userId === otherUserIdRef.current
                        : data.roomId === Number(roomId);
                    if (shouldApplyPresence) {
                        if (otherUserIdRef.current == null && data.userId !== user.id) {
                            otherUserIdRef.current = data.userId;
                            setOtherUserId(data.userId);
                        }
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
                    const inferredOtherUserId = data.senderId === user.id ? data.receiverId : data.senderId;
                    if (inferredOtherUserId && inferredOtherUserId !== otherUserIdRef.current) {
                        otherUserIdRef.current = inferredOtherUserId;
                        setOtherUserId(inferredOtherUserId);
                    }

                    const deliveryStatus = data.deliveryStatus || data.status;
                    const isRead = typeof data.read === 'boolean'
                        ? data.read
                        : deliveryStatus === 'READ';
                    const isDelivered = typeof data.delivered === 'boolean'
                        ? data.delivered
                        : deliveryStatus === 'DELIVERED' || deliveryStatus === 'READ';
                    const newMessage = {
                        messageId: data.messageId,
                        roomId: data.roomId,
                        senderId: data.senderId,
                        content: data.content,
                        sentAt: data.sentAt || Date.now(),
                        receiverId: data.receiverId,
                        messageType: data.messageType || 'TEXT',
                        mediaBase64: data.mediaBase64 || null,
                        mimeType: data.mimeType || null,
                        fileName: data.fileName || null,
                        delivered: isDelivered,
                        read: isRead
                    };

                    console.log('[WS] New message received:', newMessage);

                    setMessages(prev => [...prev, newMessage]);

                    // Mark as read if current user is receiver
                    if (data.receiverId === user.id && isChatActive()) {
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

            connectionRetryRef.current = setTimeout(() => {
                if (shouldReconnectRef.current) {
                    console.log('[WS] Attempting to reconnect...');
                    connectWebSocket();
                }
            }, 3000);
        };

        wsRef.current = ws;
    }, [token, roomId, user.id, isChatActive]);

    /* ================= SEND MESSAGE ================= */
    const sendMessage = async () => {
        if (!text.trim() && !pendingMedia) return;

        // Clear typing indicator when sending
        setIsTyping(false);
        setTypingUserId(null);
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        try {
            await api.post('/chat/private/send', {
                roomId: Number(roomId),
                message: text.trim(),
                messageType: pendingMedia ? pendingMedia.messageType : 'TEXT',
                mediaBase64: pendingMedia?.base64 || null,
                fileName: pendingMedia?.fileName || null,
                mimeType: pendingMedia?.mimeType || null
            });

            setText('');
            setPendingMedia(null);
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

    /* ================= EFFECTS ================= */
    useEffect(() => {
        otherUserIdRef.current = otherUserId;
    }, [otherUserId]);

    useEffect(() => {
        const handleVisible = () => {
            if (document.visibilityState === 'visible') {
                api.post(`/chat/rooms/${roomId}/read`).catch(() => {});
            }
        };

        document.addEventListener('visibilitychange', handleVisible);
        return () => {
            document.removeEventListener('visibilitychange', handleVisible);
        };
    }, [roomId]);

    useEffect(() => {
        shouldReconnectRef.current = true;
        manualCloseRef.current = false;

        loadMessages();
        connectWebSocket();

        return () => {
            shouldReconnectRef.current = false;

            // Clean up WebSocket
            if (wsRef.current) {
                if (wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'ROOM_CLOSE',
                        roomId: Number(roomId),
                        userId: user.id
                    }));
                }
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
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            stopMediaStream();

            setIsTyping(false);
            setTypingUserId(null);
            setPendingMedia(null);
            setIsRecordingAudio(false);
            setIsRecordingVideo(false);
        };
    }, [roomId, user.id, loadMessages, connectWebSocket, stopMediaStream]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    const renderMessageBody = (msg) => {
        const messageType = msg.messageType || 'TEXT';
        const hasMedia = Boolean(msg.mediaBase64);
        const mediaUrl = hasMedia ? buildDataUrl(msg.mediaBase64, msg.mimeType) : '';
        const shouldShowCaption = Boolean(msg.content) && !MEDIA_PLACEHOLDER_TEXTS.has(msg.content);

        if (messageType === 'IMAGE' && mediaUrl) {
            return (
                <div className="space-y-2">
                    <img
                        src={mediaUrl}
                        alt={msg.fileName || 'Image'}
                        className="max-h-64 rounded-lg object-cover"
                    />
                    {shouldShowCaption && <p className="break-words">{msg.content}</p>}
                </div>
            );
        }

        if (messageType === 'VIDEO' && mediaUrl) {
            return (
                <div className="space-y-2">
                    <video className="max-h-64 rounded-lg w-full" controls src={mediaUrl} />
                    {shouldShowCaption && <p className="break-words">{msg.content}</p>}
                </div>
            );
        }

        if (messageType === 'AUDIO' && mediaUrl) {
            return (
                <div className="space-y-2">
                    <audio controls src={mediaUrl} className="w-full" />
                    {shouldShowCaption && <p className="break-words">{msg.content}</p>}
                </div>
            );
        }

        if (messageType === 'FILE' && mediaUrl) {
            return (
                <div className="space-y-2">
                    <a
                        href={mediaUrl}
                        download={msg.fileName || 'file'}
                        className="underline font-medium"
                    >
                        {msg.fileName || 'Download file'}
                    </a>
                    {shouldShowCaption && <p className="break-words">{msg.content}</p>}
                </div>
            );
        }

        return <p className="break-words">{msg.content}</p>;
    };

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
                                    {renderMessageBody(msg)}

                                    <div className="flex items-center justify-end gap-1 text-[10px] opacity-80 mt-1">
                                        <span>
                                            {messageTime.toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>

                                        {isMine && (
                                            <span className={`ml-1 font-bold ${
                                                msg.read ? 'text-blue-300' : msg.delivered ? 'text-gray-300' : 'text-gray-400'
                                            }`}>
                                                {msg.read ? '✓✓' : msg.delivered ? '✓✓' : '✓'}
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
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                    className="hidden"
                    onChange={handleFilePick}
                />

                {pendingMedia && (
                    <div className="mb-3 p-2 border rounded-lg bg-gray-50">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-gray-600 truncate pr-2">
                                {pendingMedia.fileName}
                            </p>
                            <button
                                type="button"
                                onClick={() => setPendingMedia(null)}
                                className="p-1 rounded hover:bg-gray-200"
                            >
                                <X className="h-4 w-4 text-gray-600" />
                            </button>
                        </div>
                        {pendingMedia.messageType === 'IMAGE' && (
                            <img
                                src={buildDataUrl(pendingMedia.base64, pendingMedia.mimeType)}
                                alt={pendingMedia.fileName || 'Selected image'}
                                className="mt-2 max-h-40 rounded"
                            />
                        )}
                        {pendingMedia.messageType === 'VIDEO' && (
                            <video
                                className="mt-2 max-h-40 rounded w-full"
                                controls
                                src={buildDataUrl(pendingMedia.base64, pendingMedia.mimeType)}
                            />
                        )}
                        {pendingMedia.messageType === 'AUDIO' && (
                            <audio
                                className="mt-2 w-full"
                                controls
                                src={buildDataUrl(pendingMedia.base64, pendingMedia.mimeType)}
                            />
                        )}
                    </div>
                )}

                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!isWsConnected}
                        className={`p-2 rounded-full mr-2 ${
                            isWsConnected ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'
                        }`}
                        title="Attach image/file"
                    >
                        <Paperclip className="h-5 w-5" />
                    </button>

                    <button
                        type="button"
                        onClick={isRecordingAudio ? stopRecording : startAudioRecording}
                        disabled={!isWsConnected || isRecordingVideo}
                        className={`p-2 rounded-full mr-2 ${
                            isRecordingAudio
                                ? 'bg-red-100 text-red-600'
                                : isWsConnected && !isRecordingVideo
                                    ? 'hover:bg-gray-100 text-gray-600'
                                    : 'text-gray-300 cursor-not-allowed'
                        }`}
                        title={isRecordingAudio ? 'Stop audio recording' : 'Record audio'}
                    >
                        {isRecordingAudio ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </button>

                    <button
                        type="button"
                        onClick={isRecordingVideo ? stopRecording : startVideoRecording}
                        disabled={!isWsConnected || isRecordingAudio}
                        className={`p-2 rounded-full mr-2 ${
                            isRecordingVideo
                                ? 'bg-red-100 text-red-600'
                                : isWsConnected && !isRecordingAudio
                                    ? 'hover:bg-gray-100 text-gray-600'
                                    : 'text-gray-300 cursor-not-allowed'
                        }`}
                        title={isRecordingVideo ? 'Stop video recording' : 'Record video'}
                    >
                        {isRecordingVideo ? <Square className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                    </button>

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
                        disabled={(!text.trim() && !pendingMedia) || !isWsConnected}
                        className={`ml-3 p-3 rounded-full flex items-center justify-center ${
                            (text.trim() || pendingMedia) && isWsConnected
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




