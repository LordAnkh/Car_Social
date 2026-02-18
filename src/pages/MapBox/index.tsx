// Home.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './MapBox.css';
import { useAuth } from '../../context/AuthContext';
import { tripService, Trip, GpsPoint, Photo } from '../../services/api';

import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = (process.env.REACT_APP_MAPBOX_TOKEN || '') as string;

type FeedItem = { type: 'trip'; data: Trip };

/** Map renderer (expects gpsPoints already loaded) */
function DatasetMap({
  gpsPoints,
  datasetId,
  photoPoints,
}: {
  gpsPoints: GpsPoint[];
  datasetId: string;
  photoPoints: Photo[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    if (!mapboxgl.accessToken) setTokenError(true);
  }, []);

  useEffect(() => {
    if (tokenError) return;
    if (!mapRef.current) return;
    if (!gpsPoints || gpsPoints.length === 0) return;

    const container = mapRef.current;
    const coordinates = gpsPoints.map(p => [p.longitude, p.latitude]) as [number, number][];

    // Create once
    if (!mapInstance.current) {
      const map = new mapboxgl.Map({
        container,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [gpsPoints[0].longitude, gpsPoints[0].latitude],
        zoom: 13,
      });

      mapInstance.current = map;
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');

      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch {}
      });

      map.on('load', () => {
        upsertRoute(map, datasetId, coordinates);
        upsertMarkersAndFit(map, gpsPoints, coordinates, markersRef, photoPoints);
      });
    } else {
      const map = mapInstance.current;

      const apply = () => {
        upsertRoute(map, datasetId, coordinates);
        upsertMarkersAndFit(map, gpsPoints, coordinates, markersRef, photoPoints);
        requestAnimationFrame(() => {
          try {
            map.resize();
          } catch {}
        });
      };

      if (!map.isStyleLoaded()) map.once('load', apply);
      else apply();
    }

    // Keep size correct if parent changes
    const ro = new ResizeObserver(() => {
      const map = mapInstance.current;
      if (!map) return;
      try {
        map.resize();
      } catch {}
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
    };
  }, [gpsPoints, datasetId, tokenError, photoPoints]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  if (tokenError) {
    return (
      <div className="dataset-map mapbox-error">
        <div className="mapbox-error-inner">
          <p className="mapbox-error-title">Mapbox token missing</p>
          <p className="mapbox-error-text">
            Add <code>REACT_APP_MAPBOX_TOKEN</code> to <code>.env</code> and restart.
          </p>
        </div>
      </div>
    );
  }

  if (!gpsPoints || gpsPoints.length === 0) {
    return (
      <div className="dataset-map mapbox-empty">
        <p>No GPS points for this trip.</p>
      </div>
    );
  }

  return <div ref={mapRef} className="dataset-map" />;
}

function upsertRoute(map: mapboxgl.Map, datasetId: string, coordinates: [number, number][]) {
  const sourceId = `route-${datasetId}`;
  const layerId = `route-line-${datasetId}`;

  const feature = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  };

  const src = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
  if (src) src.setData(feature as any);
  else map.addSource(sourceId, { type: 'geojson', data: feature as any });

  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#667eea',
        'line-width': 4,
        'line-opacity': 0.85,
      },
    });
  }
}

function upsertMarkersAndFit(
  map: mapboxgl.Map,
  gpsPoints: GpsPoint[],
  coordinates: [number, number][],
  markersRef: React.MutableRefObject<mapboxgl.Marker[]>,
  photoPoints: Photo[]
) {
  // clear markers
  markersRef.current.forEach(m => m.remove());
  markersRef.current = [];

  // Start marker
  const start = gpsPoints[0];
  const startEl = document.createElement('div');
  startEl.className = 'map-marker map-marker-start';

  const startMarker = new mapboxgl.Marker({ element: startEl })
    .setLngLat([start.longitude, start.latitude])
    .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('Start'))
    .addTo(map);

  markersRef.current.push(startMarker);

  // End marker
  if (gpsPoints.length > 1) {
    const end = gpsPoints[gpsPoints.length - 1];
    const endEl = document.createElement('div');
    endEl.className = 'map-marker map-marker-end';

    const endMarker = new mapboxgl.Marker({ element: endEl })
      .setLngLat([end.longitude, end.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('End'))
      .addTo(map);

    markersRef.current.push(endMarker);
  }

  // Photo markers
  const photosWithLoc = (photoPoints || []).filter(
    p =>
      p.location &&
      Number.isFinite(p.location.latitude) &&
      Number.isFinite(p.location.longitude)
  );

  photosWithLoc.forEach((p, idx) => {
    const el = document.createElement('div');
    el.className = 'map-marker map-marker-photo';
    el.textContent = `${idx + 1}`;

    const popupHtml = `
      <div style="max-width:220px">
        <div style="font-weight:600; margin-bottom:6px;">Photo ${idx + 1}</div>
        <img src="${p.url}" alt="photo" style="width:100%; border-radius:8px; display:block; margin-bottom:6px;" />
        <div style="font-size:12px; opacity:0.8;">${new Date(p.timestamp).toLocaleString()}</div>
      </div>
    `;

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([p.location!.longitude, p.location!.latitude])
      .setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(popupHtml))
      .addTo(map);

    markersRef.current.push(marker);
  });

  // Fit bounds: route + photo locations
  const bounds = new mapboxgl.LngLatBounds();
  coordinates.forEach(c => bounds.extend(c));
  photosWithLoc.forEach(p => bounds.extend([p.location!.longitude, p.location!.latitude]));

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 40, duration: 0 });
  }
}

/** Map slide wrapper that AUTO-loads gpsPoints + photos when shown */
function TripMapSlide({
  tripId,
  gpsPoints,
  isGpsLoading,
  photos,
  isPhotosLoading,
  loadGpsForTrip,
  loadPhotosForTrip,
}: {
  tripId: string;
  gpsPoints: GpsPoint[];
  isGpsLoading: boolean;

  photos: Photo[];
  isPhotosLoading: boolean;

  loadGpsForTrip: (tripId: string) => void;
  loadPhotosForTrip: (tripId: string) => void;
}) {
  useEffect(() => {
    if (!isGpsLoading && gpsPoints.length === 0) loadGpsForTrip(tripId);
    if (!isPhotosLoading && photos.length === 0) loadPhotosForTrip(tripId);
  }, [
    tripId,
    isGpsLoading,
    gpsPoints.length,
    isPhotosLoading,
    photos.length,
    loadGpsForTrip,
    loadPhotosForTrip,
  ]);

  if (isGpsLoading || isPhotosLoading) {
    return (
      <div className="carousel-image carousel-loading">
        <p>Loading route + photos...</p>
      </div>
    );
  }

  if (gpsPoints.length === 0) {
    return (
      <div className="carousel-image carousel-loading">
        <p>No GPS points found for this trip.</p>
      </div>
    );
  }

  return <DatasetMap gpsPoints={gpsPoints} datasetId={tripId} photoPoints={photos} />;
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

  const [loadedGps, setLoadedGps] = useState<{ [key: string]: GpsPoint[] }>({});
  const [loadingGps, setLoadingGps] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchAllContent();
  }, []);

  const fetchAllContent = async () => {
    try {
      setLoading(true);
      const datasetsResponse = await tripService.getAllTrips();

      const combinedFeed: FeedItem[] = datasetsResponse.datasets.map(dataset => ({
        type: 'trip',
        data: dataset,
      }));

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

  const loadPhotosForDataset = async (tripId: string) => {
    if (loadedPhotos[tripId] || loadingPhotos[tripId]) return;

    setLoadingPhotos(prev => ({ ...prev, [tripId]: true }));
    try {
      const res = await tripService.getTripPhotos(tripId);
      setLoadedPhotos(prev => ({ ...prev, [tripId]: res.photos || [] }));
    } catch (err) {
      console.error('Failed to load photos for trip', tripId, err);
      setLoadedPhotos(prev => ({ ...prev, [tripId]: [] }));
    } finally {
      setLoadingPhotos(prev => ({ ...prev, [tripId]: false }));
    }
  };

  const loadGpsForTrip = async (tripId: string) => {
    if (loadedGps[tripId] || loadingGps[tripId]) return;

    setLoadingGps(prev => ({ ...prev, [tripId]: true }));
    try {
      const res = await tripService.getTripPoints(tripId);
      setLoadedGps(prev => ({ ...prev, [tripId]: res.gpsPoints || [] }));
    } catch (err) {
      console.error('Failed to load gps points for trip', tripId, err);
      setLoadedGps(prev => ({ ...prev, [tripId]: [] }));
    } finally {
      setLoadingGps(prev => ({ ...prev, [tripId]: false }));
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
    if (nextIndex === 0) {
      loadGpsForTrip(tripId);
      loadPhotosForDataset(tripId);
    }
    if (nextIndex > 0) loadPhotosForDataset(tripId);
    setCurrentPhotoIndex(prev => ({ ...prev, [tripId]: nextIndex }));
  };

  const handlePrevSlide = (tripId: string, totalSlides: number) => {
    const prevIndex = ((currentPhotoIndex[tripId] || 0) - 1 + totalSlides) % totalSlides;
    if (prevIndex === 0) {
      loadGpsForTrip(tripId);
      loadPhotosForDataset(tripId);
    }
    if (prevIndex > 0) loadPhotosForDataset(tripId);
    setCurrentPhotoIndex(prev => ({ ...prev, [tripId]: prevIndex }));
  };

  const renderDataset = (dataset: Trip) => {
    const slideIndex = currentPhotoIndex[dataset._id] || 0;
    const totalSlides = dataset.photoCount + 1;
    const isMapSlide = slideIndex === 0;

    const gpsPoints = loadedGps[dataset._id] || [];
    const isGpsLoading = loadingGps[dataset._id] || false;

    const photos = loadedPhotos[dataset._id] || [];
    const isPhotosLoading = loadingPhotos[dataset._id] || false;

    const currentPhoto = isMapSlide ? null : photos[slideIndex - 1];

    return (
      <div key={dataset._id} className="post-card dataset-card">
        <div className="post-header">
          <div className="post-user-info">
            <div className="user-avatar dataset-avatar">
              {(dataset.userName || dataset.userEmail || '📍')[0].toUpperCase()}
            </div>
            <div className="user-details">
              <p className="user-name">{dataset.userName || dataset.userEmail || 'Anonymous'}</p>
              <p className="post-time">
                {dataset.title} • {formatDate(dataset.createdAt)}
              </p>
            </div>
          </div>

          <div className="dataset-badge">
            <span className="badge-text">
              📸 {dataset.photoCount} {dataset.photoCount === 1 ? 'Photo' : 'Photos'}
            </span>
            <span className="badge-text">📊 {dataset.totalPoints} GPS Points</span>
          </div>
        </div>

        <div className="dataset-carousel">
          {isMapSlide ? (
            <TripMapSlide
              tripId={dataset._id}
              gpsPoints={gpsPoints}
              isGpsLoading={isGpsLoading}
              photos={photos}
              isPhotosLoading={isPhotosLoading}
              loadGpsForTrip={loadGpsForTrip}
              loadPhotosForTrip={loadPhotosForDataset}
            />
          ) : isPhotosLoading || !currentPhoto ? (
            <div className="carousel-image carousel-loading">
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
                  if (idx === 0) {
                    loadGpsForTrip(dataset._id);
                    loadPhotosForDataset(dataset._id);
                  } else {
                    loadPhotosForDataset(dataset._id);
                  }
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
            <p className="dataset-photo-info">🗺️ Route Map • {gpsPoints.length} GPS points loaded</p>
          ) : currentPhoto ? (
            <p className="dataset-photo-info">
              📸 Photo {slideIndex} of {dataset.photoCount}
              {currentPhoto.location && (
                <span className="photo-accuracy">
                  {' '}
                  • Accuracy: ±{currentPhoto.location.accuracy.toFixed(0)}m
                </span>
              )}
            </p>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="mapbox-page">
      {user && (
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      )}

      <div className="mapbox-title">
        <h1>Hello, {user?.name || user?.email || 'Guest'}!</h1>
      </div>

      <div className="mapbox-body">
        {loading && <p className="loading">Loading content...</p>}
        {error && <p className="error">{error}</p>}

        {!loading && !error && feedItems.length === 0 && (
          <div className="no-posts">
            <p>No content yet. Be the first to share!</p>
          </div>
        )}

        {!loading && !error && feedItems.map(item => renderDataset(item.data))}
      </div>
    </div>
  );
}
