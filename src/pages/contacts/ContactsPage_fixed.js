import React, {useState, useEffect} from 'react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import {
    Users,
    UserPlus,
    Search,
    Trash2,
    Phone,
    User,
    Shield,
    Loader,
    AlertCircle,
    MoreVertical,
    MessageSquare,
    Eye,
    ShieldAlert,
    Calendar
} from 'lucide-react';
import {useNavigate} from "react-router-dom";

const ContactsPage = () => {
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newContactPhone, setNewContactPhone] = useState('');
    const [addingContact, setAddingContact] = useState(false);
    const [openMenuId, setOpenMenuId] = useState(null);
    const [blockingUserId, setBlockingUserId] = useState(null);
    const [selectedContact, setSelectedContact] = useState(null);
    const navigate=useNavigate()

    useEffect(() => {
        fetchContacts();
    }, []);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => {
            setOpenMenuId(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const fetchContacts = async () => {
        try {
            setLoading(true);
            const response = await api.get('/contacts');
            console.log('Contacts API Response:', response);

            if (response && response.data) {
                const raw = response.data.data ? response.data.data : response.data;
                setContacts((raw || []).map(c => ({ ...c, online: Boolean(c.online) })));
            } else {
                setContacts([]);
            }
        } catch (error) {
            console.error('Failed to fetch contacts:', error);
            setContacts([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleWsEvent = (event) => {
            const data = event.detail;
            if (!data || !data.type) return;

            if (data.type === 'USER_ONLINE' || data.type === 'USER_OFFLINE') {
                const userId = Number(data.userId);
                setContacts(prev => prev.map(c => {
                    // contactId or contact.contactId may be used depending on API
                    const contactUserId = Number(c.contactId ?? c.id ?? c.userId ?? -1);
                    if (!Number.isFinite(contactUserId)) return c;
                    if (contactUserId === userId) {
                        return { ...c, online: data.type === 'USER_ONLINE' };
                    }
                    return c;
                }));
            }
        };

        window.addEventListener('chat-ws-event', handleWsEvent);
        return () => window.removeEventListener('chat-ws-event', handleWsEvent);
    }, []);

    const handleAddContact = async () => {
        if (!newContactPhone.trim()) {
            toast.error('Please enter a phone number');
            return;
        }

        try {
            setAddingContact(true);
            await api.post('/contacts/add', {
                contactPhone: newContactPhone.trim()
            });

            toast.success('Contact added successfully');
            setNewContactPhone('');
            setShowAddModal(false);
            fetchContacts();
        } catch (error) {
            // Error handled by interceptor
        } finally {
            setAddingContact(false);
        }
    };

    const handleDeleteContact = async (contactId) => {
        if (!window.confirm('Are you sure you want to delete this contact?')) {
            return;
        }

        try {
            // Note: You need to implement delete contact endpoint
            // await api.delete(`/contacts/${contactId}`);
            toast.success('Contact deleted successfully');
            setContacts(contacts.filter(contact => contact.id !== contactId));
            setOpenMenuId(null);
        } catch (error) {
            // Error handled by interceptor
        }
    };

    const handleBlockUser = async (contact) => {
        if (!window.confirm(`Are you sure you want to block ${contact.contactName}?`)) {
            return;
        }

        try {
            setBlockingUserId(contact.contactId);
            await api.post('/contacts/block', {
                blockedUserId: contact.contactId
            });

            toast.success('User blocked successfully');
            // Remove from contacts list when blocked
            setContacts(contacts.filter(c => c.id !== contact.id));
            setOpenMenuId(null);
        } catch (error) {
            // Error handled by interceptor
        } finally {
            setBlockingUserId(null);
        }
    };

    const handleViewProfile = (contact) => {
        setSelectedContact(contact);
        toast.success(`Viewing ${contact.contactName}'s profile`);
        setOpenMenuId(null);
    };

    const handleSendMessage = async (contact) => {
        try {
            const res = await api.post('/chat/rooms/private', {
                userId: contact.contactId
            });

            const roomId = res.data; // ResponseModel → data

            navigate(`/chat/${roomId}`, {
                state: {
                    roomName: contact.contactName || 'Private Chat',
                    otherUserId: contact.contactId
                }
            });
        } catch (err) {
            toast.error('Unable to open chat');
        }
    }

    const toggleMenu = (e, contactId) => {
        e.stopPropagation();
        setOpenMenuId(openMenuId === contactId ? null : contactId);
    };

    const filteredContacts = contacts.filter(contact => {
        const searchLower = searchTerm.toLowerCase();
        return (
            (contact.contactName && contact.contactName.toLowerCase().includes(searchLower)) ||
            (contact.contactPhone && contact.contactPhone.includes(searchTerm))
        );
    });

    const formatPhone = (phone) => {
        if (!phone) return 'N/A';
        // Remove any non-digits and format
        const cleaned = phone.toString().replace(/\D/g, '');
        if (cleaned.length === 10) {
            return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
        }
        return phone;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Loader className="h-12 w-12 animate-spin text-blue-600 mx-auto"/>
                    <p className="mt-4 text-gray-600">Loading contacts...</p>
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
                        <Users className="h-7 w-7 text-blue-600"/>
                        My Contacts
                    </h1>
                    <p className="text-gray-600 mt-1">
                        Manage your contact list and connect with friends
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                    <UserPlus className="h-4 w-4 mr-2"/>
                    Add Contact
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400"/>
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg bg-white shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Search contacts by name or phone..."
                />
            </div>

            {/* Contacts List */}
            <div className="bg-white rounded-xl shadow overflow-visible">
            {filteredContacts.length === 0 ? (
                    <div className="text-center py-12">
                        {contacts.length === 0 ? (
                            <>
                                <Users className="h-12 w-12 text-gray-400 mx-auto"/>
                                <h3 className="mt-4 text-sm font-medium text-gray-900">No contacts yet</h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    Get started by adding your first contact.
                                </p>
                                <button
                                    onClick={() => setShowAddModal(true)}
                                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    <UserPlus className="h-4 w-4 mr-2"/>
                                    Add Contact
                                </button>
                            </>
                        ) : (
                            <>
                                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto"/>
                                <h3 className="mt-4 text-sm font-medium text-gray-900">No contacts found</h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    No contacts match "{searchTerm}". Try a different search.
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {filteredContacts.map((contact) => (
                            <div
                                key={contact.id}
                                className="px-6 py-6 hover:bg-gray-50 transition-colors"
                            >
                                {/* Contact Header with Avatar and Basic Info */}
                                <div className="flex flex-col md:flex-row md:items-start gap-6">
                                    {/* Left Column - Contact Details */}
                                    <div className="flex-1">
                                        <div className="flex items-start gap-4">
                                            <div className="flex-shrink-0">
                                                <div
                                                    className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                                                    <User className="h-8 w-8 text-blue-600"/>
                                                </div>
                                            </div>
                                            <div className="flex-1">
                                                <div
                                                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                                    <div>
                                                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                                                    {contact.contactName || 'Unnamed Contact'}
                                                                    {contact.online ? (
                                                                        <span title="Online" className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shadow-md" />
                                                                    ) : (
                                                                        <span title="Offline" className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
                                                                    )}
                                                                </h3>
                                                        <div className="flex items-center mt-2 text-lg text-gray-700">
                                                            <Phone className="h-5 w-5 mr-2"/>
                                                            {formatPhone(contact.contactPhone)}
                                                        </div>
                                                        {contact.addedDate && (
                                                            <div
                                                                className="flex items-center mt-3 text-sm text-gray-500">
                                                                <Calendar className="h-4 w-4 mr-2"/>
                                                                Added
                                                                on {new Date(contact.addedDate).toLocaleDateString()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center space-x-2 mt-2 sm:mt-0">
                                                        {/* Message Button */}
                                                        <button
                                                            onClick={() => handleSendMessage(contact)}
                                                            className="p-3 text-white bg-green-500 hover:bg-green-600 rounded-full transition-colors shadow-sm"
                                                            title="Send message"
                                                        >
                                                            <MessageSquare className="h-5 w-5"/>
                                                        </button>

                                                        {/* Actions Dropdown Menu */}
                                                        <div className="relative">
                                                            <button
                                                                onClick={(e) => toggleMenu(e, contact.id)}
                                                                className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                                                                title="More options"
                                                            >
                                                                <MoreVertical className="h-5 w-5"/>
                                                            </button>
                                                            {/* Dropdown Menu */}
                                                            {openMenuId === contact.id && (
                                                                <div
                                                                    className="absolute right-0 top-full mt-3 w-52 bg-white rounded-xl shadow-2xl z-50 border border-gray-200"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <div className="py-2">
                                                                        {/* View Profile */}
                                                                        <button
                                                                            onClick={() => handleViewProfile(contact)}
                                                                            className="flex items-center w-full px-5 py-3 text-sm text-gray-700 hover:bg-gray-100"
                                                                        >
                                                                            <Eye className="h-4 w-4 mr-3 text-gray-500" />
                                                                            View Profile
                                                                        </button>

                                                                        {/* Block User */}
                                                                        <button
                                                                            onClick={() => handleBlockUser(contact)}
                                                                            disabled={blockingUserId === contact.contactId}
                                                                            className="flex items-center w-full px-5 py-3 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                                                                        >
                                                                            {blockingUserId === contact.contactId ? (
                                                                                <>
                                                                                    <Loader className="h-4 w-4 animate-spin mr-3 text-gray-500" />
                                                                                    Blocking...
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <ShieldAlert className="h-4 w-4 mr-3 text-gray-500" />
                                                                                    Block User
                                                                                </>
                                                                            )}
                                                                        </button>

                                                                        <div className="border-t my-2" />

                                                                        {/* Delete */}
                                                                        <button
                                                                            onClick={() => handleDeleteContact(contact.id)}
                                                                            className="flex items-center w-full px-5 py-3 text-sm text-red-600 hover:bg-red-50"
                                                                        >
                                                                            <Trash2 className="h-4 w-4 mr-3" />
                                                                            Delete Contact
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Overall Statistics - Only shown when no specific contact is selected */}
            {!selectedContact && contacts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <div className="flex items-start gap-4">
                            <Users className="h-8 w-8 text-blue-600"/>
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Contacts</p>
                                <p className="text-2xl font-semibold text-gray-900">{contacts.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                        <div className="flex items-start gap-4">
                            <MessageSquare className="h-8 w-8 text-green-600"/>
                            <div>
                                <p className="text-sm font-medium text-gray-600">Available</p>
                                <p className="text-2xl font-semibold text-gray-900">{contacts.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-xl border border-purple-200">
                        <div className="flex items-start gap-4">
                            <Shield className="h-8 w-8 text-purple-600"/>
                            <div>
                                <p className="text-sm font-medium text-gray-600">Active</p>
                                <p className="text-2xl font-semibold text-gray-900">{contacts.length}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Contact Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            Add New Contact
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Phone Number
                                </label>
                                <input
                                    type="tel"
                                    value={newContactPhone}
                                    onChange={(e) => setNewContactPhone(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Enter 10-digit phone number"
                                    disabled={addingContact}
                                />
                                <p className="mt-1 text-xs text-gray-500">
                                    Enter the phone number of the person you want to add
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button
                                onClick={() => setShowAddModal(false)}
                                disabled={addingContact}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddContact}
                                disabled={addingContact || !newContactPhone.trim()}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                            >
                                {addingContact ? (
                                    <>
                                        <Loader className="h-4 w-4 animate-spin inline mr-2"/>
                                        Adding...
                                    </>
                                ) : (
                                    'Add Contact'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContactsPage;
