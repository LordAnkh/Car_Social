const API_BASE = 'http://localhost:5000/api';

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

  signup: async (email: string, password: string): Promise<SignupResponse> => {
    const response = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Signup failed');
    }

    return data;
  },
};

export interface Post {
  _id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  description: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
  likes: string[];
  likesCount: number;
  comments: Comment[];
  commentsCount: number;
}

export interface Comment {
  commentId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  text: string;
  createdAt: string;
}

export interface GetPostsResponse {
  posts: Post[];
}

export const postService = {
  createPost: async (
    token: string,
    description: string,
    image: string
  ): Promise<CreatePostResponse> => {
    const response = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ description, image }),
    });

    if (!response.ok) {
      throw new Error('Failed to create post');
    }

    return response.json();
  },

  getAllPosts: async (): Promise<GetPostsResponse> => {
    const response = await fetch(`${API_BASE}/posts`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch posts');
    }

    return response.json();
  },

  getUserPosts: async (userId: string): Promise<GetPostsResponse> => {
    const response = await fetch(`${API_BASE}/posts/user/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user posts');
    }

    return response.json();
  },
};
