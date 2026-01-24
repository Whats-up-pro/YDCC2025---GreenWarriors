import axios from 'axios';
import { getApiBaseUrl } from './api';

const API_BASE_URL = getApiBaseUrl();

export interface Post {
  id: number;
  user: {
    id: number;
    name: string;
    avatar_url?: string;
    bio?: string;
    created_at: string;
  };
  image_url: string;
  caption?: string;
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
  created_at: string;
}

export interface Comment {
  id: number;
  user: {
    id: number;
    name: string;
    avatar_url?: string;
    bio?: string;
    created_at: string;
  };
  content: string;
  created_at: string;
}

export interface PostListResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface UserProfile {
  id: number;
  name: string;
  avatar_url?: string;
  bio?: string;
  created_at: string;
}

// Get API key from localStorage or use default
const getApiKey = (): string => {
  return localStorage.getItem('api_key') || 'your_secure_api_key_here';
};

// Convert relative image URL to absolute (exported for use in components)
export const getImageUrl = (imageUrl: string): string => {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http')) return imageUrl;
  return `${API_BASE_URL}${imageUrl}`;
};

export const communityService = {
  async getPosts(page: number = 1, limit: number = 20): Promise<PostListResponse> {
    // #region agent log
    const requestUrl = `${API_BASE_URL}/api/v1/community/posts`;
    fetch('http://127.0.0.1:7243/ingest/fed2e526-a826-4abb-b2e7-94241249afd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'communityService.ts:65',message:'getPosts entry',data:{apiBaseUrl:API_BASE_URL,requestUrl,page,limit,origin:window.location.origin},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,C'})}).catch(()=>{});
    // #endregion
    try {
      const response = await axios.get<PostListResponse>(
        requestUrl,
        {
          params: { page, limit },
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fed2e526-a826-4abb-b2e7-94241249afd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'communityService.ts:76',message:'getPosts success',data:{status:response.status,postsCount:response.data?.posts?.length,total:response.data?.total},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return response.data;
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fed2e526-a826-4abb-b2e7-94241249afd2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'communityService.ts:79',message:'getPosts error',data:{errorMessage:error.message,errorCode:error.code,responseStatus:error.response?.status,responseData:error.response?.data,requestUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D,E'})}).catch(()=>{});
      // #endregion
      console.error('Failed to fetch posts:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch posts');
    }
  },

  async createPost(image: File, caption?: string): Promise<Post> {
    try {
      const formData = new FormData();
      formData.append('image', image);
      if (caption) {
        formData.append('caption', caption);
      }

      const response = await axios.post<Post>(
        `${API_BASE_URL}/api/v1/community/posts`,
        formData,
        {
          headers: {
            'X-API-Key': getApiKey(),
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to create post:', error);
      throw new Error(error.response?.data?.detail || 'Failed to create post');
    }
  },

  async getPost(postId: number): Promise<Post> {
    try {
      const response = await axios.get<Post>(
        `${API_BASE_URL}/api/v1/community/posts/${postId}`,
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch post:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch post');
    }
  },

  async likePost(postId: number): Promise<{ post_id: number; is_liked: boolean; likes_count: number }> {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/v1/community/posts/${postId}/like`,
        {},
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to toggle like:', error);
      throw new Error(error.response?.data?.detail || 'Failed to toggle like');
    }
  },

  async getComments(postId: number): Promise<Comment[]> {
    try {
      const response = await axios.get<Comment[]>(
        `${API_BASE_URL}/api/v1/community/posts/${postId}/comments`,
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch comments:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch comments');
    }
  },

  async addComment(postId: number, content: string): Promise<Comment> {
    try {
      const response = await axios.post<Comment>(
        `${API_BASE_URL}/api/v1/community/posts/${postId}/comments`,
        { content },
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to add comment:', error);
      throw new Error(error.response?.data?.detail || 'Failed to add comment');
    }
  },

  async getUserProfile(userId: number): Promise<UserProfile> {
    try {
      const response = await axios.get<UserProfile>(
        `${API_BASE_URL}/api/v1/community/users/${userId}`,
        {
          headers: {
            'X-API-Key': getApiKey(),
          },
        }
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch user profile:', error);
      throw new Error(error.response?.data?.detail || 'Failed to fetch user profile');
    }
  },
};
