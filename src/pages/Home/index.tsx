import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import { useAuth } from '../../context/AuthContext.tsx';
import BottomNav from '../../components/BottomNav/index.tsx';
import { postService, Post } from '../../services/api.ts';

export default function Homepage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await postService.getAllPosts();
      setPosts(response.posts);
      setError('');
    } catch (err: any) {
      setError('Failed to load posts');
      console.error('Error fetching posts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="home">
      {user && (
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      )}

      <div className="home-title">
        <h1>Hello, {user?.name || user?.email || 'Guest'}!</h1>
      </div>

      <div className="home-body">
        {loading && <p className="loading">Loading posts...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && posts.length === 0 && (
          <div className="no-posts">
            <p>No posts yet. Be the first to share!</p>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <div className="posts-feed">
            {posts.map((post) => (
              <div key={post._id} className="post-card">
                <div className="post-header">
                  <div className="post-user-info">
                    <div className="user-avatar">
                      {(post.userName || post.userEmail)[0].toUpperCase()}
                    </div>
                    <div className="user-details">
                      <p className="user-name">{post.userName || post.userEmail}</p>
                      <p className="post-time">{formatDate(post.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="post-image">
                  <img src={post.imageUrl} alt={post.description} />
                </div>

                <div className="post-content">
                  <p className="post-description">{post.description}</p>
                  <div className="post-stats">
                    <span className="post-likes">❤️ {post.likesCount}</span>
                    <span className="post-comments">💬 {post.commentsCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
