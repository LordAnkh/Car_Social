import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import './Home.css';
import { useAuth } from '../../context/AuthContext.tsx';
import BottomNav from '../../components/BottomNav/index.tsx';
import { postService, Post, gpsDatasetService, GpsDataset, GpsPoint } from '../../services/api.ts';



type FeedItem =
  | { type: 'post'; data: Post }
  | { type: 'dataset'; data: GpsDataset };

function DatasetMap({ gpsPoints, datasetId }: { gpsPoints: GpsPoint[]; datasetId: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || gpsPoints.length === 0) return;

    // Clean up previous map instance
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    });
    mapInstance.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    const coords: L.LatLngExpression[] = gpsPoints.map(p => [p.latitude, p.longitude]);

    // Draw the route polyline
    const polyline = L.polyline(coords, {
      color: '#667eea',
      weight: 4,
      opacity: 0.8,
    }).addTo(map);

    // Add start and end markers
    if (coords.length > 0) {
      L.circleMarker(coords[0], {
        radius: 8,
        fillColor: '#4CAF50',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map).bindPopup('Start');

      if (coords.length > 1) {
        L.circleMarker(coords[coords.length - 1], {
          radius: 8,
          fillColor: '#ff4060',
          color: '#fff',
          weight: 2,
          fillOpacity: 1,
        }).addTo(map).bindPopup('End');
      }
    }

    // Fit map to route bounds
    map.fitBounds(polyline.getBounds(), { padding: [30, 30] });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [gpsPoints, datasetId]);

  return <div ref={mapRef} className="dataset-map" />;
}

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

  const handleNextSlide = (datasetId: string, totalSlides: number) => {
    setCurrentPhotoIndex(prev => ({
      ...prev,
      [datasetId]: ((prev[datasetId] || 0) + 1) % totalSlides,
    }));
  };

  const handlePrevSlide = (datasetId: string, totalSlides: number) => {
    setCurrentPhotoIndex(prev => ({
      ...prev,
      [datasetId]: ((prev[datasetId] || 0) - 1 + totalSlides) % totalSlides,
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
    const slideIndex = currentPhotoIndex[dataset._id] || 0;
    const totalSlides = dataset.photos.length + 1; // +1 for map slide
    const isMapSlide = slideIndex === 0;
    const currentPhoto = isMapSlide ? null : dataset.photos[slideIndex - 1];

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
          {isMapSlide ? (
            <DatasetMap gpsPoints={dataset.gpsPoints} datasetId={dataset._id} />
          ) : (
            <div className="carousel-image">
              <img src={currentPhoto!.base64} alt={`Slide ${slideIndex}`} />
              {currentPhoto!.location && (
                <div className="photo-location-overlay">
                  <span className="location-pin">📍</span>
                  <span className="location-coords">
                    {currentPhoto!.location.latitude.toFixed(6)}, {currentPhoto!.location.longitude.toFixed(6)}
                  </span>
                </div>
              )}
            </div>
          )}

          <button
            className="carousel-btn carousel-btn-prev"
            onClick={() => handlePrevSlide(dataset._id, totalSlides)}
            aria-label="Previous slide"
          >
            ‹
          </button>
          <button
            className="carousel-btn carousel-btn-next"
            onClick={() => handleNextSlide(dataset._id, totalSlides)}
            aria-label="Next slide"
          >
            ›
          </button>
          <div className="carousel-indicators">
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <span
                key={idx}
                className={`indicator ${idx === slideIndex ? 'active' : ''} ${idx === 0 ? 'map-indicator' : ''}`}
                onClick={() => setCurrentPhotoIndex(prev => ({ ...prev, [dataset._id]: idx }))}
                title={idx === 0 ? 'Route Map' : `Photo ${idx}`}
              />
            ))}
          </div>
        </div>

        <div className="post-content">
          <p className="post-description">{dataset.description}</p>
          {isMapSlide ? (
            <p className="dataset-photo-info">
              🗺️ Route Map • {dataset.totalPoints} GPS points tracked
            </p>
          ) : (
            <p className="dataset-photo-info">
              📸 Photo {slideIndex} of {dataset.photos.length}
              {currentPhoto!.location && (
                <span className="photo-accuracy">
                  {' '}• Accuracy: ±{currentPhoto!.location.accuracy.toFixed(0)}m
                </span>
              )}
            </p>
          )}
          <div className="dataset-stats">
            <span className="stat-item">
              🕒 {isMapSlide
                ? new Date(dataset.createdAt).toLocaleString()
                : new Date(currentPhoto!.timestamp).toLocaleString()
              }
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
