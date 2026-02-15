const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:5000/api'
  : 'https://az318test.uk/api';


export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface SignupResponse {
  message: string;
}

export interface CreatePostResponse {
  message?: string;
}

export const authService = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    return data;
  },

  signup: async (email: string, password: string, name?: string): Promise<SignupResponse> => {
    const response = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Signup failed');
    }

    return data;
  },
};



export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  accuracy: number;
  timestamp: string;
}

export interface Photo {
  _id: string;
  photoKey: string;
  url: string;
  filename: string;
  size: number;
  timestamp: string;
  location?: {
    latitude: number;
    longitude: number;
    altitude: number;
    accuracy: number;
  };
}

export interface Trip {
  _id: string;
  gpsPoints: GpsPoint[];
  photoKeys: string[];
  totalPhotoSize: number;
  photoCount: number;
  totalPoints: number;
  timestamp: string;
  createdAt: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  title: string;
  description: string;
}

export interface GetTripsResponse {
  datasets: Trip[];
}

export const tripService = {
  getAllTrips: async (): Promise<GetTripsResponse> => {
    const response = await fetch(`${API_BASE}/trips`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trips');
    }

    return response.json();
  },

  getTripPoints: async (tripId: string): Promise<{ gpsPoints: GpsPoint[] }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/points`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trip GPS points');
    }

    return response.json();
  },

  getTripPhotos: async (tripId: string): Promise<{ photos: Photo[] }> => {
    const response = await fetch(`${API_BASE}/trips/${tripId}/photos`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trip photos');
    }

    return response.json();
  },
};
