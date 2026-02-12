// Home.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './MapBox.css';
import { useAuth } from '../../context/AuthContext.tsx';
import BottomNav from '../../components/BottomNav/index.tsx';
import { gpsDatasetService, GpsDataset, GpsPoint, Photo } from '../../services/api.ts';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mapboxgl = require('mapbox-gl');
require('mapbox-gl/dist/mapbox-gl.css');

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN as string;

type FeedItem =
  | { type: 'dataset'; data: GpsDataset };

function DatasetMap({
  gpsPoints,
  datasetId,
}: {
  gpsPoints: GpsPoint[];
  datasetId: string;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || gpsPoints.length === 0) return;

    // Cleanup previous map instance
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [gpsPoints[0].longitude, gpsPoints[0].latitude],
      zoom: 13,
    });

    mapInstance.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', () => {
      const coordinates = gpsPoints.map(p => [p.longitude, p.latitude]) as [number, number][];

      const sourceId = `route-${datasetId}`;
      const layerId = `route-line-${datasetId}`;

      // Route line (polyline equivalent)
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates,
            },
          },
        });
      }

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#667eea',
            'line-width': 4,
            'line-opacity': 0.8,
          },
        });
      }

      // Start marker
      const start = gpsPoints[0];
      const startEl = document.createElement('div');
      startEl.className = 'map-marker map-marker-start';
      new mapboxgl.Marker({ element: startEl })
        .setLngLat([start.longitude, start.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('Start'))
        .addTo(map);

      // End marker
      if (gpsPoints.length > 1) {
        const end = gpsPoints[gpsPoints.length - 1];
        const endEl = document.createElement('div');
        endEl.className = 'map-marker map-marker-end';
        new mapboxgl.Marker({ element: endEl })
          .setLngLat([end.longitude, end.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('End'))
          .addTo(map);
      }

      // Fit bounds
      const bounds = new mapboxgl.LngLatBounds();
      coordinates.forEach(c => bounds.extend(c));
      map.fitBounds(bounds, { padding: 30, duration: 0 });
    });

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
  const [loadedPhotos, setLoadedPhotos] = useState<{ [key: string]: Photo[] }>({});
  const [loadingPhotos, setLoadingPhotos] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchAllContent();
  }, []);

  const fetchAllContent = async () => {
    try {
      setLoading(true);
      const [datasetsResponse] = await Promise.all([
        gpsDatasetService.getAllDatasets(),
      ]);

      const combinedFeed: FeedItem[] = [
        ...datasetsResponse.datasets.map(dataset => ({ type: 'dataset' as const, data: dataset })),
      ];

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

  const loadPhotosForDataset = async (datasetId: string) => {
    if (loadedPhotos[datasetId] || loadingPhotos[datasetId]) return;
    setLoadingPhotos(prev => ({ ...prev, [datasetId]: true }));
    try {
      const res = await gpsDatasetService.getDatasetPhotos(datasetId);
      setLoadedPhotos(prev => ({ ...prev, [datasetId]: res.photos }));
    } catch (err) {
      console.error('Failed to load photos for dataset', datasetId, err);
    } finally {
      setLoadingPhotos(prev => ({ ...prev, [datasetId]: false }));
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
    const nextIndex = ((currentPhotoIndex[datasetId] || 0) + 1) % totalSlides;
    if (nextIndex > 0) loadPhotosForDataset(datasetId);
    setCurrentPhotoIndex(prev => ({ ...prev, [datasetId]: nextIndex }));
  };

  const handlePrevSlide = (datasetId: string, totalSlides: number) => {
    const prevIndex = ((currentPhotoIndex[datasetId] || 0) - 1 + totalSlides) % totalSlides;
    if (prevIndex > 0) loadPhotosForDataset(datasetId);
    setCurrentPhotoIndex(prev => ({ ...prev, [datasetId]: prevIndex }));
  };

  const renderDataset = (dataset: GpsDataset) => {
    const slideIndex = currentPhotoIndex[dataset._id] || 0;
    const totalSlides = dataset.photoCount + 1; // +1 for map slide
    const isMapSlide = slideIndex === 0;
    const photos = loadedPhotos[dataset._id];
    const currentPhoto = isMapSlide ? null : photos ? photos[slideIndex - 1] : null;
    const isPhotoLoading = loadingPhotos[dataset._id];

    return (
      <div key={dataset._id} className="post-card dataset-card">
        <div className="post-header">
          <div className="post-user-info">
            <div className="user-avatar dataset-avatar">
              {(dataset.userName || dataset.userEmail || '📍')[0].toUpperCase()}
            </div>
            <div className="user-details">
              <p className="user-name">{dataset.userName || dataset.userEmail || 'Anonymous'}</p>
              <p className="post-time">{dataset.title} • {formatDate(dataset.createdAt)}</p>
            </div>
          </div>
          <div className="dataset-badge">
            <span className="badge-text">📸 {dataset.photoCount} {dataset.photoCount === 1 ? 'Photo' : 'Photos'}</span>
            <span className="badge-text">📊 {dataset.totalPoints} GPS Points</span>
          </div>
        </div>

        <div className="dataset-carousel">
          {isMapSlide ? (
            <DatasetMap gpsPoints={dataset.gpsPoints} datasetId={dataset._id} />
          ) : isPhotoLoading || !currentPhoto ? (
            <div className="carousel-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <p>Loading photos...</p>
            </div>
          ) : (
            <div className="carousel-image">
              <img src={currentPhoto.base64} alt={`Slide ${slideIndex}`} />
              {currentPhoto.location && (
                <div className="photo-location-overlay">
                  <span className="location-pin">📍</span>
                  <span className="location-coords">
                    {currentPhoto.location.latitude.toFixed(6)}, {currentPhoto.location.longitude.toFixed(6)}
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
                onClick={() => {
                  if (idx > 0) loadPhotosForDataset(dataset._id);
                  setCurrentPhotoIndex(prev => ({ ...prev, [dataset._id]: idx }));
                }}
                title={idx === 0 ? 'Route Map' : `Photo ${idx}`}
              />
            ))}
          </div>
        </div>

        <div className="post-content">
          <p className="post-description">{dataset.description}</p>
          {isMapSlide ? (
            <p className="dataset-photo-info">🗺️ Route Map • {dataset.totalPoints} GPS points tracked</p>
          ) : currentPhoto ? (
            <p className="dataset-photo-info">
              📸 Photo {slideIndex} of {dataset.photoCount}
              {currentPhoto.location && (
                <span className="photo-accuracy"> • Accuracy: ±{currentPhoto.location.accuracy.toFixed(0)}m</span>
              )}
            </p>
          ) : (
            <p className="dataset-photo-info">📸 Loading photo {slideIndex}...</p>
          )}
          <div className="dataset-stats">
            <span className="stat-item">
              🕒 {isMapSlide || !currentPhoto
                ? new Date(dataset.createdAt).toLocaleString()
                : new Date(currentPhoto.timestamp).toLocaleString()}
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

      
      </div>

      <BottomNav />
    </div>
  );
}
