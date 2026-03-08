// utils/api.js
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8086/api';

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
api.interceptors.response.use(
    (response) => response.data,
    (error) => {
        if (error.response) {
            switch (error.response.status) {
                case 401:
                    localStorage.clear();
                    window.location.href = '/login';
                    toast.error('Session expired. Please login again.');
                    break;
                case 400:
                    toast.error('Invalid request');
                    break;
                case 403:
                    toast.error('forbidding');
                    break;
                case 404:
                    toast.error('Data not present');
                    break;
                case 500:
                    toast.error('Server error. Please try again later.');
                    break;
                default:
                    toast.error(error.response.data?.message || 'Something went wrong');
            }
        } else if (error.request) {
            toast.error('Network error. Please check your connection.');
        } else {
            toast.error('An error occurred');
        }
        return Promise.reject(error);
    }
);

export default api;
