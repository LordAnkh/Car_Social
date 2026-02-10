import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';
import { useAuth } from '../../context/AuthContext.tsx';
import BottomNav from '../../components/BottomNav/index.tsx';
import { postService, Post, gpsDatasetService, GpsDataset } from '../../services/api.ts';

type FeedItem =
  | { type: 'post'; data: Post }
  | { type: 'dataset'; data: GpsDataset };

export default function Homepage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    fetchAllContent();
  }, []);

  const fetchAllContent = async () => {
    try {
      setLoading(true);
      const [postsResponse, datasetsResponse] = await Promise.all([
        postService.getAllPosts(),
        gpsDatasetService.getAllDatasets(),
      ]);

      // Combine posts and datasets into a single feed
      const combinedFeed: FeedItem[] = [
        ...postsResponse.posts.map(post => ({ type: 'post' as const, data: post })),
        ...datasetsResponse.datasets.map(dataset => ({ type: 'dataset' as const, data: dataset })),
      ];

      // Sort by creation date (newest first)
      combinedFeed.sort((a, b) => {
        const dateA = new Date(a.data.createdAt).getTime();
        const dateB = new Date(b.data.createdAt).getTime();
        return dateB - dateA;
      });

      setFeedItems(combinedFeed);
      setError('');
    } catch (err: any) {
      setError('Failed to load content');
      console.error('Error fetching content:', err);
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

  const handleNextPhoto = (datasetId: string, totalPhotos: number) => {
    setCurrentPhotoIndex(prev => ({
      ...prev,
      [datasetId]: ((prev[datasetId] || 0) + 1) % totalPhotos,
    }));
  };

  const handlePrevPhoto = (datasetId: string, totalPhotos: number) => {
    setCurrentPhotoIndex(prev => ({
      ...prev,
      [datasetId]: ((prev[datasetId] || 0) - 1 + totalPhotos) % totalPhotos,
    }));
  };

  const renderPost = (post: Post) => (
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
  );

  const renderDataset = (dataset: GpsDataset) => {
    const photoIndex = currentPhotoIndex[dataset._id] || 0;
    const currentPhoto = dataset.photos[photoIndex];

    return (
      <div key={dataset._id} className="post-card dataset-card">
        <div className="post-header">
          <div className="post-user-info">
            <div className="user-avatar dataset-avatar">
              📍
            </div>
            <div className="user-details">
              <p className="user-name">{dataset.title}</p>
              <p className="post-time">{formatDate(dataset.createdAt)}</p>
            </div>
          </div>
          <div className="dataset-badge">
            <span className="badge-text">
              📸 {dataset.photoCount} {dataset.photoCount === 1 ? 'Photo' : 'Photos'}
            </span>
            <span className="badge-text">
              📊 {dataset.totalPoints} GPS Points
            </span>
          </div>
        </div>

        <div className="dataset-carousel">
          <div className="carousel-image">
            <img src={currentPhoto.base64} alt={`Photo ${photoIndex + 1}`} />
            {currentPhoto.location && (
              <div className="photo-location-overlay">
                <span className="location-pin">📍</span>
                <span className="location-coords">
                  {currentPhoto.location.latitude.toFixed(6)}, {currentPhoto.location.longitude.toFixed(6)}
                </span>
              </div>
            )}
          </div>

          {dataset.photos.length > 1 && (
            <>
              <button
                className="carousel-btn carousel-btn-prev"
                onClick={() => handlePrevPhoto(dataset._id, dataset.photos.length)}
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                className="carousel-btn carousel-btn-next"
                onClick={() => handleNextPhoto(dataset._id, dataset.photos.length)}
                aria-label="Next photo"
              >
                ›
              </button>
              <div className="carousel-indicators">
                {dataset.photos.map((_, idx) => (
                  <span
                    key={idx}
                    className={`indicator ${idx === photoIndex ? 'active' : ''}`}
                    onClick={() => setCurrentPhotoIndex(prev => ({ ...prev, [dataset._id]: idx }))}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="post-content">
          <p className="post-description">{dataset.description}</p>
          <p className="dataset-photo-info">
            📸 Photo {photoIndex + 1} of {dataset.photos.length}
            {currentPhoto.location && (
              <span className="photo-accuracy">
                {' '}• Accuracy: ±{currentPhoto.location.accuracy.toFixed(0)}m
              </span>
            )}
          </p>
          <div className="dataset-stats">
            <span className="stat-item">
              🕒 {new Date(currentPhoto.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
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
        {loading && <p className="loading">Loading content...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && feedItems.length === 0 && (
          <div className="no-posts">
            <p>No content yet. Be the first to share!</p>
          </div>
        )}

        {!loading && !error && feedItems.length > 0 && (
          <div className="posts-feed">
            {feedItems.map((item) =>
              item.type === 'post' ? renderPost(item.data) : renderDataset(item.data)
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
