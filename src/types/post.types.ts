// Post and Comment type definitions for the Car Social Media app

export interface Comment {
  commentId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  text: string;
  createdAt: Date;
}

export interface Post {
  _id?: string; // Optional because MongoDB generates this
  userId: string;
  userEmail: string;
  userName?: string;
  description: string;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
  likes: string[];
  likesCount: number;
  comments: Comment[];
  commentsCount: number;
}

export interface CreatePostRequest {
  description: string;
  imageUrl: string;
}

export interface CreatePostResponse {
  message: string;
  post: Post;
}
