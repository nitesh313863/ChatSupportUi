// pages/profile/ProfilePage.js
import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { User, Phone, Shield, Loader } from 'lucide-react';

const ProfilePage = () => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/user/get/my/details');
            setProfile(res.data);
        } catch (err) {
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader className="h-6 w-6 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="max-w-xl mx-auto bg-white shadow rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">
                My Profile
            </h2>

            <div className="space-y-4">
                <div className="flex items-center">
                    <User className="h-5 w-5 text-gray-500 mr-3" />
                    <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="font-medium">{profile.name}</p>
                    </div>
                </div>

                <div className="flex items-center">
                    <Phone className="h-5 w-5 text-gray-500 mr-3" />
                    <div>
                        <p className="text-sm text-gray-500">Phone</p>
                        <p className="font-medium">{profile.phone}</p>
                    </div>
                </div>

                <div className="flex items-center">
                    <Shield className="h-5 w-5 text-gray-500 mr-3" />
                    <div>
                        <p className="text-sm text-gray-500">Status</p>
                        <p className="font-medium capitalize">
                            {profile.status.toLowerCase()}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
