import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import BottomNav from '../../components/BottomNav';
import { friendService, profileService, UserSearchResult, FriendRequest, Friend, getVisibility, setVisibility, FeedVisibility } from '../../services/api';
import './Friends.css';

export default function Friends() {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibility, setVis] = useState<FeedVisibility>(getVisibility());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchUsers(searchQuery.trim());
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [requestsRes, friendsRes] = await Promise.all([
        friendService.getIncomingRequests(),
        friendService.getFriends(),
      ]);
      setPendingRequests(requestsRes.requests);
      setFriends(friendsRes.friends);
    } catch (err) {
      console.error('Failed to load friends data:', err);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    try {
      setSearching(true);
      const res = await friendService.searchUsers(query);
      setSearchResults(res.users);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (receiverId: string) => {
    try {
      await friendService.sendRequest(receiverId);
      // Update search result status locally
      setSearchResults(prev =>
        prev.map(u => u._id === receiverId ? { ...u, friendStatus: 'pending_sent' as const } : u)
      );
    } catch (err: any) {
      console.error('Failed to send request:', err);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await friendService.acceptRequest(requestId);
      await loadData();
      // Refresh search results if active
      if (searchQuery.trim().length >= 2) {
        searchUsers(searchQuery.trim());
      }
    } catch (err) {
      console.error('Failed to accept request:', err);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await friendService.rejectRequest(requestId);
      setPendingRequests(prev => prev.filter(r => r._id !== requestId));
    } catch (err) {
      console.error('Failed to reject request:', err);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    try {
      await friendService.removeFriend(friendId);
      setFriends(prev => prev.filter(f => f.id !== friendId));
    } catch (err) {
      console.error('Failed to remove friend:', err);
    }
  };

  const handleProfilePicChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPic(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await profileService.uploadPicture(base64);
        updateUser({ profilePictureUrl: res.profilePictureUrl });
        setUploadingPic(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to upload profile picture:', err);
      setUploadingPic(false);
    }
  };

  const handleToggleVisibility = () => {
    const next: FeedVisibility = visibility === 'public' ? 'friends' : 'public';
    setVis(next);
    setVisibility(next);
  };
  
  const getInitial = (name?: string, email?: string) => {
    return (name || email || '?')[0].toUpperCase();
  };

  const renderSearchResult = (user: UserSearchResult) => (
    <div key={user._id} className="user-card">
      <div className="user-card-info">
        <div className="user-card-avatar">{getInitial(user.name, user.email)}</div>
        <div className="user-card-details">
          <p className="user-card-name">{user.name || 'No Name'}</p>
          <p className="user-card-email">{user.email}</p>
        </div>
      </div>
      <div className="user-card-actions">
        {user.friendStatus === null && (
          <button className="btn-add" onClick={() => handleSendRequest(user._id)}>Add Friend</button>
        )}
        {user.friendStatus === 'pending_sent' && (
          <button className="btn-pending" disabled>Pending</button>
        )}
        {user.friendStatus === 'pending_received' && (
          <button className="btn-accept" onClick={() => {
            const req = pendingRequests.find(r => r.senderId === user._id);
            if (req) handleAcceptRequest(req._id);
          }}>Accept</button>
        )}
        {user.friendStatus === 'accepted' && (
          <button className="btn-friends" disabled>Friends</button>
        )}
      </div>
    </div>
  );

  const renderRequest = (request: FriendRequest) => (
    <div key={request._id} className="user-card">
      <div className="user-card-info">
        <div className="user-card-avatar">{getInitial(request.senderName, request.senderEmail)}</div>
        <div className="user-card-details">
          <p className="user-card-name">{request.senderName || 'No Name'}</p>
          <p className="user-card-email">{request.senderEmail}</p>
        </div>
      </div>
      <div className="user-card-actions">
        <button className="btn-accept" onClick={() => handleAcceptRequest(request._id)}>Accept</button>
        <button className="btn-reject" onClick={() => handleRejectRequest(request._id)}>Reject</button>
      </div>
    </div>
  );

  const renderFriend = (friend: Friend) => (
    <div key={friend.id} className="user-card">
      <div className="user-card-info">
        <div className="user-card-avatar">{getInitial(friend.name, friend.email)}</div>
        <div className="user-card-details">
          <p className="user-card-name">{friend.name || 'No Name'}</p>
          <p className="user-card-email">{friend.email}</p>
        </div>
      </div>
      <div className="user-card-actions">
        <button className="btn-remove" onClick={() => handleRemoveFriend(friend.id)}>Remove</button>
      </div>
    </div>
  );

  return (
    <div className="friends-page">
      <div className="friends-title">
        <h1>Friends</h1>
      </div>

      <div className="profile-pic-card">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleProfilePicChange}
        />
        <div className="profile-pic-row" onClick={() => fileInputRef.current?.click()}>
          {user?.profilePictureUrl ? (
            <img className="profile-pic-preview" src={user.profilePictureUrl} alt="Profile" />
          ) : (
            <div className="profile-pic-placeholder">
              {(user?.name || user?.email || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="profile-pic-info">
            <p className="profile-pic-name">{user?.name || user?.email || 'Guest'}</p>
            <p className="profile-pic-hint">{uploadingPic ? 'Uploading...' : 'Tap to change profile picture'}</p>
          </div>
        </div>
      </div>

      <div className="visibility-toggle-card">
        <div className="visibility-toggle-row">
          <div className="visibility-info">
            <p className="visibility-label">Feed Visibility</p>
            <p className="visibility-desc">
              {visibility === 'public' ? 'Showing all trips' : 'Showing only friend & anonymous trips'}
            </p>
          </div>
          <button
            className={`toggle-btn ${visibility === 'friends' ? 'toggle-active' : ''}`}
            onClick={handleToggleVisibility}
          >
            <span className="toggle-knob" />
          </button>
        </div>
        <div className="visibility-labels">
          <span className={visibility === 'public' ? 'vis-active' : ''}>Public</span>
          <span className={visibility === 'friends' ? 'vis-active' : ''}>Friends Only</span>
        </div>
      </div>

      <div className="friends-body">
        <div className="search-container">
          <input
            className="search-input"
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery.trim().length >= 2 && (
            <div className="search-results">
              {searching && <p className="search-hint">Searching...</p>}
              {!searching && searchResults.length === 0 && (
                <p className="search-hint">No users found</p>
              )}
              {!searching && searchResults.map(renderSearchResult)}
            </div>
          )}
        </div>

        {loading ? (
          <p className="friends-loading">Loading...</p>
        ) : (
          <>
            {pendingRequests.length > 0 && (
              <>
                <h2 className="section-header">Friend Requests ({pendingRequests.length})</h2>
                <div className="requests-list">
                  {pendingRequests.map(renderRequest)}
                </div>
              </>
            )}

            <h2 className="section-header">My Friends ({friends.length})</h2>
            {friends.length === 0 ? (
              <p className="friends-empty">No friends yet. Search for users to add!</p>
            ) : (
              <div className="friends-list">
                {friends.map(renderFriend)}
              </div>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
