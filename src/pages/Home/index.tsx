import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import './Home.css';
import { useAuth } from '../../context/AuthContext';
import { tripService, Trip, GpsPoint, Photo } from '../../services/api';

type FeedItem =
  | { type: 'trip'; data: Trip };

function DatasetMap({ gpsPoints, datasetId, photos, onPhotoMarkerClick }: {
  gpsPoints: GpsPoint[];
  datasetId: string;
  photos?: Photo[];
  onPhotoMarkerClick?: (photoIndex: number) => void;
}) {
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

    // Add photo location markers
    if (photos && photos.length > 0) {
      photos.forEach((photo, idx) => {
        if (!photo.location) return;
        const marker = L.circleMarker(
          [photo.location.latitude, photo.location.longitude],
          {
            radius: 6,
            fillColor: '#9c27b0',
            color: '#fff',
            weight: 2,
            fillOpacity: 0.9,
          }
        ).addTo(map);
        marker.bindPopup(`📷 Photo ${idx + 1}`);
        marker.on('click', () => {
          if (onPhotoMarkerClick) onPhotoMarkerClick(idx);
        });
      });
    }

    map.fitBounds(polyline.getBounds(), { padding: [30, 30] });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [gpsPoints, datasetId, photos, onPhotoMarkerClick]);

  return <div ref={mapRef} className="dataset-map" />;
}

export default function Homepage() {
  const { user } = useAuth();
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<{ [key: string]: number }>({});
  const [loadedPhotos, setLoadedPhotos] = useState<{ [key: string]: Photo[] }>({});
  const [loadingPhotos, setLoadingPhotos] = useState<{ [key: string]: boolean }>({});
  const [loadedPoints, setLoadedPoints] = useState<{ [key: string]: GpsPoint[] }>({});
  const [loadingPoints, setLoadingPoints] = useState<{ [key: string]: boolean }>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editingTrip, setEditingTrip] = useState<{ id: string; title: string; description: string } | null>(null);

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

      // Pre-load GPS points and photos for visible trips
      combinedFeed.forEach(item => {
        loadPointsForTrip(item.data._id);
        loadPhotosForTrip(item.data._id);
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

  const handleHideTrip = (tripId: string) => {
    setFeedItems(prev => prev.filter(item => item.data._id !== tripId));
    setOpenMenu(null);
  };

  const handleDeleteTrip = async (tripId: string) => {
    if (!window.confirm('Are you sure you want to delete this trip? This cannot be undone.')) return;
    try {
      await tripService.deleteTrip(tripId);
      setFeedItems(prev => prev.filter(item => item.data._id !== tripId));
      setOpenMenu(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete trip');
    }
  };

  const handleEditTrip = (trip: Trip) => {
    setEditingTrip({ id: trip._id, title: trip.title || '', description: trip.description || '' });
    setOpenMenu(null);
  };

  const handleSaveEdit = async () => {
    if (!editingTrip) return;
    try {
      await tripService.updateTrip(editingTrip.id, {
        title: editingTrip.title,
        description: editingTrip.description,
      });
      setFeedItems(prev => prev.map(item =>
        item.data._id === editingTrip.id
          ? { ...item, data: { ...item.data, title: editingTrip.title, description: editingTrip.description } }
          : item
      ));
      setEditingTrip(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update trip');
    }
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
            {trip.userProfilePictureUrl ? (
              <img className="user-avatar-img" src={trip.userProfilePictureUrl} alt="" />
            ) : (
              <div className="user-avatar dataset-avatar">
                {(trip.userName || trip.userEmail || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="user-details">
              <p className="user-name">{trip.title || 'GPS Tracking Session'}</p>
              <p className="post-time">{formatDate(trip.createdAt)}</p>
            </div>
          </div>
          <div className="post-settings-wrapper">
            <button
              className="post-settings-btn"
              onClick={() => setOpenMenu(openMenu === trip._id ? null : trip._id)}
            >
              ⋮
            </button>
            {openMenu === trip._id && (
              <div className="post-settings-menu">
                {user && user.id === trip.userId ? (
                  <>
                    <button onClick={() => handleEditTrip(trip)}>Edit Post</button>
                    <button className="delete-option" onClick={() => handleDeleteTrip(trip._id)}>Delete Post</button>
                  </>
                ) : (
                  <button onClick={() => handleHideTrip(trip._id)}>Hide Post</button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="dataset-carousel">
          {isMapSlide ? (
            isPointsLoading || !points ? (
              <div className="carousel-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                <p>Loading map...</p>
              </div>
            ) : (
              <DatasetMap
                gpsPoints={points}
                datasetId={trip._id}
                photos={loadedPhotos[trip._id] || []}
                onPhotoMarkerClick={(photoIdx) => {
                  loadPhotosForTrip(trip._id);
                  setCurrentPhotoIndex(prev => ({ ...prev, [trip._id]: photoIdx + 1 }));
                }}
              />
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
          {trip.description && (
            <p className="post-description">{trip.description}</p>
          )}
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

      <div className="home-title">
        <h1>PinBoard</h1>
        <p className="home-username">{user?.name || user?.email || 'Guest'}</p>
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

      {editingTrip && (
        <div className="edit-modal-overlay" onClick={() => setEditingTrip(null)}>
          <div className="edit-modal" onClick={e => e.stopPropagation()}>
            <h3>Edit Trip</h3>
            <label>Title</label>
            <input
              type="text"
              value={editingTrip.title}
              onChange={e => setEditingTrip({ ...editingTrip, title: e.target.value })}
              placeholder="Trip title"
            />
            <label>Description</label>
            <textarea
              value={editingTrip.description}
              onChange={e => setEditingTrip({ ...editingTrip, description: e.target.value })}
              placeholder="Trip description"
              rows={4}
            />
            <div className="edit-modal-buttons">
              <button className="edit-modal-cancel" onClick={() => setEditingTrip(null)}>Cancel</button>
              <button className="edit-modal-save" onClick={handleSaveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
