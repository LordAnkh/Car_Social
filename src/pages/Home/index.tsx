import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import './Home.css';
import { useAuth } from '../../context/AuthContext';
import BottomNav from '../../components/BottomNav';
import { tripService, Trip, GpsPoint, Photo } from '../../services/api';

type FeedItem =
  | { type: 'trip'; data: Trip };

function DatasetMap({ gpsPoints, datasetId }: { gpsPoints: GpsPoint[]; datasetId: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || gpsPoints.length === 0) return;

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

    const polyline = L.polyline(coords, {
      color: '#667eea',
      weight: 4,
      opacity: 0.8,
    }).addTo(map);

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
  const [loadedPhotos, setLoadedPhotos] = useState<{ [key: string]: Photo[] }>({});
  const [loadingPhotos, setLoadingPhotos] = useState<{ [key: string]: boolean }>({});
  const [loadedPoints, setLoadedPoints] = useState<{ [key: string]: GpsPoint[] }>({});
  const [loadingPoints, setLoadingPoints] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchAllContent();
  }, []);

  const fetchAllContent = async () => {
    try {
      setLoading(true);
      const tripsResponse = await tripService.getAllTrips();

      const combinedFeed: FeedItem[] = tripsResponse.datasets.map(trip => ({
        type: 'trip' as const,
        data: trip,
      }));

      combinedFeed.sort((a, b) => {
        const dateA = new Date(a.data.createdAt).getTime();
        const dateB = new Date(b.data.createdAt).getTime();
        return dateB - dateA;
      });

      setFeedItems(combinedFeed);
      setError('');

      // Pre-load GPS points for visible trips (map is default slide)
      combinedFeed.forEach(item => {
        loadPointsForTrip(item.data._id);
      });
    } catch (err: any) {
      setError('Failed to load content');
      console.error('Error fetching content:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPointsForTrip = async (tripId: string) => {
    if (loadedPoints[tripId] || loadingPoints[tripId]) return;
    setLoadingPoints(prev => ({ ...prev, [tripId]: true }));
    try {
      const res = await tripService.getTripPoints(tripId);
      setLoadedPoints(prev => ({ ...prev, [tripId]: res.gpsPoints }));
    } catch (err) {
      console.error('Failed to load points for trip', tripId, err);
    } finally {
      setLoadingPoints(prev => ({ ...prev, [tripId]: false }));
    }
  };

  const loadPhotosForTrip = async (tripId: string) => {
    if (loadedPhotos[tripId] || loadingPhotos[tripId]) return;
    setLoadingPhotos(prev => ({ ...prev, [tripId]: true }));
    try {
      const res = await tripService.getTripPhotos(tripId);
      setLoadedPhotos(prev => ({ ...prev, [tripId]: res.photos }));
    } catch (err) {
      console.error('Failed to load photos for trip', tripId, err);
    } finally {
      setLoadingPhotos(prev => ({ ...prev, [tripId]: false }));
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

  const handleNextSlide = (tripId: string, totalSlides: number) => {
    const nextIndex = ((currentPhotoIndex[tripId] || 0) + 1) % totalSlides;
    if (nextIndex === 0) loadPointsForTrip(tripId);
    else loadPhotosForTrip(tripId);
    setCurrentPhotoIndex(prev => ({ ...prev, [tripId]: nextIndex }));
  };

  const handlePrevSlide = (tripId: string, totalSlides: number) => {
    const prevIndex = ((currentPhotoIndex[tripId] || 0) - 1 + totalSlides) % totalSlides;
    if (prevIndex === 0) loadPointsForTrip(tripId);
    else loadPhotosForTrip(tripId);
    setCurrentPhotoIndex(prev => ({ ...prev, [tripId]: prevIndex }));
  };

  const renderTrip = (trip: Trip) => {
    const slideIndex = currentPhotoIndex[trip._id] || 0;
    const totalSlides = trip.photoCount + 1; // +1 for map slide
    const isMapSlide = slideIndex === 0;
    const photos = loadedPhotos[trip._id];
    const currentPhoto = isMapSlide ? null : photos ? photos[slideIndex - 1] : null;
    const isPhotoLoading = loadingPhotos[trip._id];
    const points = loadedPoints[trip._id];
    const isPointsLoading = loadingPoints[trip._id];

    return (
      <div key={trip._id} className="post-card dataset-card">
        <div className="post-header">
          <div className="post-user-info">
            <div className="user-avatar dataset-avatar">📍</div>
            <div className="user-details">
              <p className="user-name">{trip.title || 'GPS Tracking Session'}</p>
              <p className="post-time">{formatDate(trip.createdAt)}</p>
            </div>
          </div>
          <div className="dataset-badge">
            <span className="badge-text">
              📸 {trip.photoCount} {trip.photoCount === 1 ? 'Photo' : 'Photos'}
            </span>
            <span className="badge-text">
              📊 {trip.totalPoints} GPS Points
            </span>
          </div>
        </div>

        <div className="dataset-carousel">
          {isMapSlide ? (
            isPointsLoading || !points ? (
              <div className="carousel-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                <p>Loading map...</p>
              </div>
            ) : (
              <DatasetMap gpsPoints={points} datasetId={trip._id} />
            )
          ) : isPhotoLoading || !currentPhoto ? (
            <div className="carousel-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <p>Loading photos...</p>
            </div>
          ) : (
            <div className="carousel-image">
              <img src={currentPhoto.url} alt={`Slide ${slideIndex}`} />
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
            onClick={() => handlePrevSlide(trip._id, totalSlides)}
            aria-label="Previous slide"
          >
            ‹
          </button>
          <button
            className="carousel-btn carousel-btn-next"
            onClick={() => handleNextSlide(trip._id, totalSlides)}
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
                  if (idx === 0) loadPointsForTrip(trip._id);
                  else loadPhotosForTrip(trip._id);
                  setCurrentPhotoIndex(prev => ({ ...prev, [trip._id]: idx }));
                }}
                title={idx === 0 ? 'Route Map' : `Photo ${idx}`}
              />
            ))}
          </div>
        </div>

        <div className="post-content">
          {isMapSlide ? (
            <p className="dataset-photo-info">
              🗺️ Route Map • {trip.totalPoints} GPS points tracked
            </p>
          ) : currentPhoto ? (
            <p className="dataset-photo-info">
              📸 Photo {slideIndex} of {trip.photoCount}
              {currentPhoto.location && (
                <span className="photo-accuracy">
                  {' '}• Accuracy: ±{currentPhoto.location.accuracy.toFixed(0)}m
                </span>
              )}
            </p>
          ) : (
            <p className="dataset-photo-info">📸 Loading photo {slideIndex}...</p>
          )}
          <div className="dataset-stats">
            <span className="stat-item">
              🕒 {isMapSlide || !currentPhoto
                ? new Date(trip.createdAt).toLocaleString()
                : new Date(currentPhoto.timestamp).toLocaleString()
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

        {!loading && !error && feedItems.map((item) => {
          if (item.type === 'trip') {
            return renderTrip(item.data);
          }
          return null;
        })}
      </div>

      <BottomNav />
    </div>
  );
}
