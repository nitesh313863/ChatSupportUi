import React, { useEffect, useRef, useState, useCallback } from 'react';
import api from '../../utils/api';
import { buildChatWsUrl } from '../../utils/ws';
import toast from 'react-hot-toast';
import {
    Send,
    ArrowLeft,
    Loader,
    User,
    Wifi,
    WifiOff,
    Paperclip,
    Mic,
    Video,
    Square,
    X,
    Check,
    CheckCheck,
    MoreVertical,
    Phone,
    Search,
    Smile
} from 'lucide-react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

const MEDIA_PLACEHOLDER_TEXTS = new Set(['[Image]', '[Video]', '[Audio]', '[File]']);
const MAX_MEDIA_BASE64_LENGTH = 900000;
const PAGE_SIZE = 20; // messages per page

const PrivateChatPage = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();

    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
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
    const wsConnectSeqRef = useRef(0);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const mediaChunksRef = useRef(null);

    const chatContainerRef = useRef(null);
    const bottomRef = useRef(null);

    const [presence, setPresence] = useState({
        online: false,
        lastSeen: null
    });

    const location = useLocation();
    const roomName = location.state?.roomName || 'Private Chat';
    const [otherUserId, setOtherUserId] = useState(location.state?.otherUserId ?? null);

    const wsRef = useRef(null);
    const otherUserIdRef = useRef(location.state?.otherUserId ?? null);

    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const currentUserId = Number(user?.id);
    const currentRoomId = Number(roomId);

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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            mediaChunksRef.current = [];

            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    mediaChunksRef.current.push(e.data);
                }
            };
            recorder.onstop = async () => {
                const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            mediaStreamRef.current = stream;
            mediaChunksRef.current = [];

            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    mediaChunksRef.current.push(e.data);
                }
            };
            recorder.onstop = async () => {
                const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'video/webm' });
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
                userId: currentUserId
            }));
        }
        navigate(-1);
    };

/* ================= SCROLL HANDLER ================= */
const handleScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    // If scrolled near top and more messages exist, load previous page
    if (container.scrollTop < 100 && hasMore && !loadingMore) {
        console.log('Triggering load more, next page:', page + 1);
        const nextPage = page + 1;
        const oldScrollHeight = container.scrollHeight;
        const oldScrollTop = container.scrollTop;
        loadMessages(nextPage, { oldScrollHeight, oldScrollTop });
    }
}, [hasMore, loadingMore, page]);

/* ================= PAGINATED LOAD MESSAGES ================= */
const loadMessages = useCallback(async (pageNumber = 0, scrollInfo = null) => {
    console.log('loadMessages called with page:', pageNumber, 'scrollInfo:', scrollInfo);
    try {
        if (pageNumber === 0) setLoading(true);
        else setLoadingMore(true);

        const res = await api.get(`/chat/rooms/${roomId}/messages/paginated`, {
            params: { page: pageNumber, size: PAGE_SIZE, sort: 'DESC' } // newest first
        });

        const pageData = res?.data;
        if (!pageData) throw new Error('Invalid API response');

        const mapped = pageData.content.map(m => ({
            messageId: m.messageId,
            roomId: m.roomId,
            senderId: m.senderId,
            content: m.content,
            sentAt: new Date(m.createdAt * 1000).getTime(),
            messageType: m.messageType || 'TEXT',
            mediaBase64: m.mediaBase64 || null,
            mimeType: m.mimeType || null,
            fileName: m.fileName || null,
            delivered: m.deliveryStatus === 'DELIVERED' || m.deliveryStatus === 'READ',
            read: m.deliveryStatus === 'READ'
        }));

        if (pageNumber === 0) {
            // First page: reverse to show oldest at top, newest at bottom
            setMessages(mapped.reverse());
            // Scroll to bottom after first page loads
            setTimeout(() => {
                if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                }
            }, 100);
        } else {
            // Older pages: prepend reversed (oldest first)
            setMessages(prev => [...mapped.reverse(), ...prev]);
        }

        setPage(pageData.pageNumber);
        setHasMore(pageData.hasNext);

        // Infer other user if not known
        const inferredOtherUserId = mapped.find(m => Number(m.senderId) !== currentUserId)?.senderId;
        if (inferredOtherUserId && inferredOtherUserId !== otherUserIdRef.current) {
            otherUserIdRef.current = inferredOtherUserId;
            setOtherUserId(inferredOtherUserId);
        }

        // Restore scroll position after prepending older messages
        if (scrollInfo && chatContainerRef.current) {
            const { oldScrollHeight, oldScrollTop } = scrollInfo;
            setTimeout(() => {
                const newScrollHeight = chatContainerRef.current.scrollHeight;
                chatContainerRef.current.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
            }, 0);
        }

    } catch (err) {
        console.error('LOAD MESSAGES ERROR:', err);
        toast.error('Failed to load messages');
    } finally {
        setLoading(false);
        setLoadingMore(false);
    }
}, [currentUserId, roomId]);
    /* ================= TYPING HANDLER ================= */
    const handleTyping = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.log('[TYPING] WebSocket not ready, state:', wsRef.current?.readyState);
            return;
        }

        try {
            const typingMessage = {
                type: 'TYPING',
                roomId: currentRoomId,
                userId: currentUserId
            };

            console.log('[TYPING] Sending event:', typingMessage);
            wsRef.current.send(JSON.stringify(typingMessage));
        } catch (error) {
            console.error('[TYPING] Failed to send:', error);
        }
    }, [currentRoomId, currentUserId]);

    /* ================= WEBSOCKET CONNECTION ================= */
    const connectWebSocket = useCallback(() => {
        if (!shouldReconnectRef.current) {
            return;
        }

        const authToken = localStorage.getItem('token');
        if (!authToken) {
            setConnectionStatus('error');
            setIsWsConnected(false);
            return;
        }

        if (wsRef.current) {
            manualCloseRef.current = true;
            wsRef.current.close();
            wsRef.current = null;
        }

        if (connectionRetryRef.current) {
            clearTimeout(connectionRetryRef.current);
            connectionRetryRef.current = null;
        }

        setConnectionStatus('connecting');
        console.log('[WS] Connecting...');

        const connectSeq = ++wsConnectSeqRef.current;
        const ws = new WebSocket(buildChatWsUrl(authToken));

        const pingInterval = setInterval(() => {
            if (connectSeq !== wsConnectSeqRef.current) return;
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'PING' }));
                ws.send(JSON.stringify({
                    type: 'ROOM_OPEN',
                    roomId: Number(roomId),
                    userId: currentUserId
                }));
            }
        }, 25000);

        ws.onopen = () => {
            if (connectSeq !== wsConnectSeqRef.current) return;
            console.log('[WS] Connected successfully');
            setIsWsConnected(true);
            setConnectionStatus('connected');

            ws.send(JSON.stringify({
                type: 'ROOM_OPEN',
                roomId: Number(roomId),
                userId: currentUserId
            }));

            if (isChatActive()) {
                api.post(`/chat/rooms/${roomId}/read`).catch(() => {});
            }
        };

        ws.onmessage = (event) => {
            if (connectSeq !== wsConnectSeqRef.current) return;
            try {
                const data = JSON.parse(event.data);
                console.log('[WS EVENT] Received:', data);
                window.dispatchEvent(new CustomEvent('chat-ws-event', { detail: data }));

                // READ EVENT
                if (data.type === 'READ' && data.roomId === Number(roomId)) {
                    const readerId = Number(data.readerId);
                    const senderId = Number(data.senderId);

                    if ((Number.isFinite(readerId) && readerId === currentUserId) ||
                        (Number.isFinite(senderId) && senderId !== currentUserId)) {
                        return;
                    }

                    setMessages(prev =>
                        prev.map(m =>
                            m.messageId === data.messageId && Number(m.senderId) === currentUserId
                                ? { ...m, delivered: true, read: true }
                                : m
                        )
                    );
                    return;
                }

                // DELIVERED EVENT
                if (data.type === 'DELIVERED' && data.roomId === Number(roomId)) {
                    setMessages(prev =>
                        prev.map(m =>
                            m.messageId === data.messageId && Number(m.senderId) === currentUserId
                                ? { ...m, delivered: true }
                                : m
                        )
                    );
                    return;
                }

                // USER ONLINE
                if (data.type === 'USER_ONLINE') {
                    const incomingUserId = Number(data.userId);
                    const trackedOtherUserId = Number(otherUserIdRef.current);

                    if (incomingUserId === currentUserId) return;

                    if (otherUserIdRef.current == null) {
                        otherUserIdRef.current = incomingUserId;
                        setOtherUserId(incomingUserId);
                    }

                    const isForOtherUser = (trackedOtherUserId > 0 && incomingUserId === trackedOtherUserId) ||
                        (data.roomId && Number(data.roomId) === currentRoomId);

                    if (isForOtherUser) {
                        setPresence({ online: true, lastSeen: null });
                    }
                    return;
                }

                // USER OFFLINE
                if (data.type === 'USER_OFFLINE') {
                    const incomingUserId = Number(data.userId);
                    const trackedOtherUserId = Number(otherUserIdRef.current);
                    const lastSeen = (data.lastSeen && data.lastSeen > 0) ? data.lastSeen : null;

                    if (incomingUserId === currentUserId) return;

                    if (otherUserIdRef.current == null) {
                        otherUserIdRef.current = incomingUserId;
                        setOtherUserId(incomingUserId);
                    }

                    const isForOtherUser = (trackedOtherUserId > 0 && incomingUserId === trackedOtherUserId) ||
                        (data.roomId && Number(data.roomId) === currentRoomId);

                    if (isForOtherUser) {
                        setPresence({ online: false, lastSeen });
                    }
                    return;
                }

                // TYPING EVENT
                if (data.type === 'TYPING' && data.roomId === Number(roomId)) {
                    if (Number(data.userId) !== currentUserId) {
                        setTypingUserId(data.userId);
                        setIsTyping(true);

                        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                        typingTimeoutRef.current = setTimeout(() => {
                            setIsTyping(false);
                            setTypingUserId(null);
                        }, 3000);
                    }
                    return;
                }

                // MESSAGE EVENT
                if (data.type === 'MESSAGE' && data.roomId === Number(roomId)) {
                    const inferredOtherUserId = Number(data.senderId) === currentUserId
                        ? Number(data.receiverId)
                        : Number(data.senderId);
                    if (inferredOtherUserId && inferredOtherUserId !== otherUserIdRef.current) {
                        otherUserIdRef.current = inferredOtherUserId;
                        setOtherUserId(inferredOtherUserId);
                    }

                    const deliveryStatus = data.deliveryStatus || data.status;
                    const isOwnMessage = Number(data.senderId) === currentUserId;
                    const isRead = isOwnMessage ? false : (typeof data.read === 'boolean' ? data.read : deliveryStatus === 'READ');
                    const isDelivered = typeof data.delivered === 'boolean' ? data.delivered : (deliveryStatus === 'DELIVERED' || deliveryStatus === 'READ');

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

                    setMessages(prev => [...prev, newMessage]);

                    if (Number(data.receiverId) === currentUserId && isChatActive()) {
                        api.post(`/chat/rooms/${roomId}/read`).catch(() => {});
                    }
                }

            } catch (error) {
                console.error('[WS] Invalid JSON:', event.data, error);
            }
        };

        ws.onerror = (error) => {
            if (connectSeq !== wsConnectSeqRef.current) return;
            console.error('[WS] Connection error:', error);
            setConnectionStatus('error');
            setIsWsConnected(false);
        };

        ws.onclose = (event) => {
            if (connectSeq !== wsConnectSeqRef.current) {
                clearInterval(pingInterval);
                return;
            }

            console.warn('[WS] Closed', { code: event?.code, reason: event?.reason, wasClean: event?.wasClean });
            clearInterval(pingInterval);
            setIsWsConnected(false);
            setConnectionStatus('disconnected');
            wsRef.current = null;

            setIsTyping(false);
            setTypingUserId(null);

            const wasManualClose = manualCloseRef.current;
            manualCloseRef.current = false;

            if (connectionRetryRef.current) {
                clearTimeout(connectionRetryRef.current);
                connectionRetryRef.current = null;
            }

            if (wasManualClose || !shouldReconnectRef.current) return;

            if (event?.code === 1008 || event?.code === 1003 || event?.code === 1002) {
                console.warn('[WS] Closed due to auth/protocol issue. Stopping reconnect.', event);
                shouldReconnectRef.current = false;
                setConnectionStatus('error');
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
    }, [currentRoomId, currentUserId, isChatActive, roomId]);

    /* ================= SEND MESSAGE ================= */
    const sendMessage = async () => {
        if (!text.trim() && !pendingMedia) return;

        setIsTyping(false);
        setTypingUserId(null);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

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

        if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);

        if (value.trim().length > 0) {
            typingDebounceRef.current = setTimeout(() => {
                if (isWsConnected) handleTyping();
            }, 300);
        }

        if (value.trim().length === 0) {
            setIsTyping(false);
        }
    };

    /* ================= EFFECTS ================= */
    useEffect(() => {
        otherUserIdRef.current = otherUserId;
    }, [otherUserId]);

    useEffect(() => {
        if (otherUserIdRef.current != null) return;

        let isMounted = true;

        const resolveOtherUser = async () => {
            try {
                const rooms = await api.get('/chat/rooms/get/all');
                const currentRoom = (rooms.data || []).find(
                    (room) => Number(room.roomId) === currentRoomId
                );

                const resolvedOtherUserId = Number(currentRoom?.otherUserId);
                if (!isMounted || !Number.isFinite(resolvedOtherUserId)) return;

                otherUserIdRef.current = resolvedOtherUserId;
                setOtherUserId(resolvedOtherUserId);

                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'ROOM_OPEN',
                        roomId: currentRoomId,
                        userId: currentUserId
                    }));
                }
            } catch (error) {
                // ignore – fallback to message inference
            }
        };

        resolveOtherUser();

        return () => { isMounted = false; };
    }, [currentRoomId, currentUserId]);

    useEffect(() => {
        const handleVisible = () => {
            if (document.visibilityState === 'visible' && isWsConnected) {
                api.post(`/chat/rooms/${roomId}/read`).catch(() => {});
            }
        };

        document.addEventListener('visibilitychange', handleVisible);
        return () => document.removeEventListener('visibilitychange', handleVisible);
    }, [roomId, isWsConnected]);

    useEffect(() => {
        shouldReconnectRef.current = true;
        manualCloseRef.current = false;

        loadMessages(0); // load first page on mount
        connectWebSocket();

        return () => {
            shouldReconnectRef.current = false;
            wsConnectSeqRef.current += 1;

            if (wsRef.current) {
                if (wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'ROOM_CLOSE',
                        roomId: Number(roomId),
                        userId: currentUserId
                    }));
                }
                manualCloseRef.current = true;
                wsRef.current.close();
                wsRef.current = null;
            }

            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
            if (connectionRetryRef.current) clearTimeout(connectionRetryRef.current);
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
    }, [currentRoomId, currentUserId, loadMessages, connectWebSocket, roomId, stopMediaStream]);

    // Auto-scroll to bottom when new messages arrive (only if user was near bottom)
    useEffect(() => {
        const container = chatContainerRef.current;
        if (!container || messages.length === 0) return;

        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isNearBottom) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
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
                        className="max-h-64 max-w-full rounded-lg object-cover"
                    />
                    {shouldShowCaption && <p className="break-words">{msg.content}</p>}
                </div>
            );
        }

        if (messageType === 'VIDEO' && mediaUrl) {
            return (
                <div className="space-y-2">
                    <video
                        className="max-h-64 max-w-full rounded-lg w-full"
                        controls
                        src={mediaUrl}
                    />
                    {shouldShowCaption && <p className="break-words">{msg.content}</p>}
                </div>
            );
        }

        if (messageType === 'AUDIO' && mediaUrl) {
            return (
                <div className="space-y-2">
                    <audio controls src={mediaUrl} className="w-full max-w-full" />
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
                        className="underline font-medium break-words"
                    >
                        {msg.fileName || 'Download file'}
                    </a>
                    {shouldShowCaption && <p className="break-words">{msg.content}</p>}
                </div>
            );
        }

        return <p className="break-words leading-relaxed">{msg.content}</p>;
    };

    /* ================= RENDER LOADING ================= */
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-[#0b141a]">
                <Loader className="h-10 w-10 animate-spin text-[#25d366] mb-4" />
                <p className="text-[#d1d7db]">Loading chat...</p>
            </div>
        );
    }

    const formatLastSeen = (timestamp) => {
        if (!timestamp) return '';

        const lastSeen = new Date(timestamp);
        const now = new Date();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        const time = lastSeen.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (lastSeen >= today) {
            return `today at ${time}`;
        }

        if (lastSeen >= yesterday && lastSeen < today) {
            return `yesterday at ${time}`;
        }

        return lastSeen.toLocaleDateString([], {
            day: '2-digit',
            month: 'short'
        }) + ` at ${time}`;
    };

    const presenceLabel =
        isTyping && typingUserId && Number(typingUserId) !== currentUserId
            ? 'typing...'
            : presence.online
                ? 'online'
                : presence.lastSeen
                    ? `last seen ${formatLastSeen(presence.lastSeen)}`
                    : 'offline';

    const connectionLabel =
        connectionStatus === 'connecting'
            ? 'Connecting to chat...'
            : connectionStatus === 'connected'
                ? 'Connected | End-to-end style delivery active'
                : connectionStatus === 'disconnected'
                    ? 'Reconnecting...'
                    : 'Connection error | Check internet';

    /* ================= UI ================= */
    return (
        <div className="private-chat flex flex-col h-screen w-full bg-[#efeae2]">
            <header className="px-4 py-3 bg-[#f0f2f5] border-b border-black/10 flex items-center gap-3 shrink-0">
                <button
                    onClick={handleBack}
                    className="h-9 w-9 rounded-full hover:bg-black/5 flex items-center justify-center text-[#54656f] lg:hidden"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="h-10 w-10 rounded-full bg-[#dfe5e7] flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-[#54656f]" />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="font-medium text-[#111b21] truncate">{roomName}</p>
                    <p className={`text-xs truncate ${presenceLabel === 'typing...' ? 'text-[#25d366]' : 'text-[#667781]'}`}>
                        {presenceLabel}
                    </p>
                </div>

                <div className="flex items-center gap-1 text-[#54656f]">
                    <button className="h-9 w-9 rounded-full hover:bg-black/5 flex items-center justify-center">
                        <Phone className="h-4.5 w-4.5" />
                    </button>
                    <button className="h-9 w-9 rounded-full hover:bg-black/5 flex items-center justify-center">
                        <Search className="h-4.5 w-4.5" />
                    </button>
                    <button className="h-9 w-9 rounded-full hover:bg-black/5 flex items-center justify-center">
                        <MoreVertical className="h-4.5 w-4.5" />
                    </button>
                </div>
            </header>

            {!isWsConnected && (
                <div className="bg-[#fff3cd] border-b border-[#ffe69c] px-4 py-1.5 text-xs text-[#664d03] flex items-center gap-2 shrink-0">
                    <WifiOff className="h-3.5 w-3.5" />
                    <span>Connecting to chat server...</span>
                </div>
            )}

            <div className="relative flex-1 overflow-hidden bg-[#efeae2]" style={{
                backgroundImage:
                    'radial-gradient(rgba(84,101,111,0.08) 1px, transparent 1px), radial-gradient(rgba(84,101,111,0.06) 1px, transparent 1px)',
                backgroundPosition: '0 0, 16px 16px',
                backgroundSize: '32px 32px'
            }}>
                <div
                    ref={chatContainerRef}
                    onScroll={handleScroll}
                    className="absolute inset-0 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-4 space-y-2"
                >
                    {loadingMore && (
                        <div className="flex justify-center py-2">
                            <Loader className="h-4 w-4 animate-spin text-[#667781]" />
                        </div>
                    )}

                    {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-[#667781] text-center px-6">
                            <User className="h-12 w-12 mb-3 text-[#8696a0]" />
                            <p>No messages yet</p>
                            <p className="text-xs mt-1">Send a message to start this conversation.</p>
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const isMine = Number(msg.senderId) === currentUserId;
                            const messageTime = new Date(msg.sentAt);

                            return (
                                <div
                                    key={msg.messageId || `${msg.sentAt}-${msg.senderId}`}
                                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`max-w-[82%] md:max-w-[65%] message-bubble px-3 py-2 rounded-lg shadow-sm text-sm overflow-hidden ${
                                        isMine
                                            ? 'mine bg-[#d9fdd3] text-[#111b21] rounded-tr-sm'
                                            : 'their bg-white text-[#111b21] rounded-tl-sm'
                                    }`}>
                                        {renderMessageBody(msg)}

                                        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#667781]">
                                            <span className="msg-time">
                                                {messageTime.toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>

                                            {isMine && (
                                                msg.read ? (
                                                    <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                                                ) : msg.delivered ? (
                                                    <CheckCheck className="h-3.5 w-3.5 text-[#8696a0]" />
                                                ) : (
                                                    <Check className="h-3.5 w-3.5 text-[#8696a0]" />
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={bottomRef} />
                </div>
            </div>

            {isTyping && typingUserId && Number(typingUserId) !== currentUserId && (
                <div className="px-4 py-2 bg-[#f0f2f5] border-t border-black/10 shrink-0">
                    <div className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-[#667781]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#667781] animate-bounce" />
                        <span className="h-1.5 w-1.5 rounded-full bg-[#667781] animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-[#667781] animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <span className="ml-1">typing...</span>
                    </div>
                </div>
            )}

            <div className="bg-[#f0f2f5] border-t border-black/10 px-3 py-3 shrink-0">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                    className="hidden"
                    onChange={handleFilePick}
                />

                {pendingMedia && (
                    <div className="mb-3 p-2 border border-black/10 rounded-lg bg-white">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-[#667781] truncate pr-2">
                                {pendingMedia.fileName}
                            </p>
                            <button
                                type="button"
                                onClick={() => setPendingMedia(null)}
                                className="p-1 rounded hover:bg-black/5"
                            >
                                <X className="h-4 w-4 text-[#54656f]" />
                            </button>
                        </div>
                        {pendingMedia.messageType === 'IMAGE' && (
                            <img
                                src={buildDataUrl(pendingMedia.base64, pendingMedia.mimeType)}
                                alt={pendingMedia.fileName || 'Selected image'}
                                className="mt-2 max-h-40 rounded max-w-full"
                            />
                        )}
                        {pendingMedia.messageType === 'VIDEO' && (
                            <video
                                className="mt-2 max-h-40 rounded w-full max-w-full"
                                controls
                                src={buildDataUrl(pendingMedia.base64, pendingMedia.mimeType)}
                            />
                        )}
                        {pendingMedia.messageType === 'AUDIO' && (
                            <audio
                                className="mt-2 w-full max-w-full"
                                controls
                                src={buildDataUrl(pendingMedia.base64, pendingMedia.mimeType)}
                            />
                        )}
                    </div>
                )}

                <div className="flex items-end gap-2">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!isWsConnected}
                        className={`p-2 rounded-full ${
                            isWsConnected ? 'hover:bg-black/5 text-[#54656f]' : 'text-[#a8b2b8] cursor-not-allowed'
                        }`}
                        title="Attach image/file"
                    >
                        <Paperclip className="h-5 w-5" />
                    </button>

                    <button
                        type="button"
                        onClick={isRecordingAudio ? stopRecording : startAudioRecording}
                        disabled={!isWsConnected || isRecordingVideo}
                        className={`p-2 rounded-full ${
                            isRecordingAudio
                                ? 'bg-red-100 text-red-600'
                                : isWsConnected && !isRecordingVideo
                                    ? 'hover:bg-black/5 text-[#54656f]'
                                    : 'text-[#a8b2b8] cursor-not-allowed'
                        }`}
                        title={isRecordingAudio ? 'Stop audio recording' : 'Record audio'}
                    >
                        {isRecordingAudio ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </button>

                    <button
                        type="button"
                        onClick={isRecordingVideo ? stopRecording : startVideoRecording}
                        disabled={!isWsConnected || isRecordingAudio}
                        className={`p-2 rounded-full ${
                            isRecordingVideo
                                ? 'bg-red-100 text-red-600'
                                : isWsConnected && !isRecordingAudio
                                    ? 'hover:bg-black/5 text-[#54656f]'
                                    : 'text-[#a8b2b8] cursor-not-allowed'
                        }`}
                        title={isRecordingVideo ? 'Stop video recording' : 'Record video'}
                    >
                        {isRecordingVideo ? <Square className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                    </button>

                    <div className="flex-1 bg-white rounded-3xl border border-black/10 px-3 py-1.5 flex items-center gap-2">
                        <button
                            type="button"
                            className="h-8 w-8 rounded-full hover:bg-black/5 text-[#667781] flex items-center justify-center"
                            tabIndex={-1}
                        >
                            <Smile className="h-5 w-5" />
                        </button>

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
                            placeholder={isWsConnected ? 'Type a message' : 'Connecting...'}
                            disabled={!isWsConnected}
                            className={`w-full bg-transparent py-1.5 outline-none text-sm text-[#111b21] placeholder:text-[#667781] ${
                                !isWsConnected ? 'cursor-not-allowed text-[#a8b2b8]' : ''
                            }`}
                        />
                    </div>

                    <button
                        onClick={sendMessage}
                        disabled={(!text.trim() && !pendingMedia) || !isWsConnected}
                        className={`p-3 rounded-full flex items-center justify-center shrink-0 ${
                            (text.trim() || pendingMedia) && isWsConnected
                                ? 'bg-[#25d366] hover:bg-[#20bd5a] text-white'
                                : 'bg-[#dfe5e7] text-[#a8b2b8] cursor-not-allowed'
                        } transition-colors`}
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </div>

                <div className="mt-2 text-center">
                    <p className="text-[11px] text-[#667781]">
                        {isWsConnected ? <Wifi className="inline h-3 w-3 mr-1" /> : <WifiOff className="inline h-3 w-3 mr-1" />}
                        {connectionLabel}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PrivateChatPage;