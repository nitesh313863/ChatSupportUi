const resolveWsBaseUrl = () => {
    const configuredWsUrl = process.env.REACT_APP_WS_URL;
    if (configuredWsUrl) {
        return configuredWsUrl.replace(/\/+$/, '');
    }

    const configuredApiUrl = process.env.REACT_APP_API_URL;
    if (configuredApiUrl) {
        try {
            const apiUrl = new URL(configuredApiUrl);
            const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${apiUrl.host}`;
        } catch (error) {
            // ignore invalid URL and fallback to browser location
        }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostName = window.location.hostname || 'localhost';
    const configuredPort = process.env.REACT_APP_WS_PORT || '8086';
    return `${protocol}//${hostName}:${configuredPort}`;
};

export const buildChatWsUrl = (token) => {
    const baseUrl = resolveWsBaseUrl();
    return `${baseUrl}/ws/chat?token=${encodeURIComponent(token)}`;
};
