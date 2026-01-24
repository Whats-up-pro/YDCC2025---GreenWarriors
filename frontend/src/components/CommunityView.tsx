import { useState, useEffect, useRef } from 'react';

// Types
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

// Mock data với sample images (placeholder URLs)
const MOCK_POSTS: Post[] = [
  {
    id: 1,
    user: {
      id: 1,
      name: 'Nguyễn Văn A',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 giờ trước
    },
    image_url: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop',
    caption: 'Tôm của tôi đang phát triển rất tốt! Ao nuôi sạch, nước trong. Chia sẻ kinh nghiệm với mọi người.',
    likes_count: 12,
    comments_count: 3,
    is_liked: false,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 2,
    user: {
      id: 2,
      name: 'Trần Thị B',
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 giờ trước
    },
    image_url: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=600&fit=crop',
    caption: 'Phát hiện một số đốm trắng trên tôm. Đã cách ly và xử lý. Mọi người có kinh nghiệm gì không?',
    likes_count: 8,
    comments_count: 5,
    is_liked: true,
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 3,
    user: {
      id: 3,
      name: 'Lê Văn C',
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 ngày trước
    },
    image_url: 'https://images.unsplash.com/photo-1574781330856-0e43e8b1d0a1?w=800&h=600&fit=crop',
    caption: 'Thu hoạch thành công! Năng suất cao hơn năm ngoái 20%. Cảm ơn cộng đồng đã chia sẻ nhiều kiến thức hữu ích.',
    likes_count: 25,
    comments_count: 8,
    is_liked: false,
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Mock comments cho mỗi post
const MOCK_COMMENTS: Record<number, Comment[]> = {
  1: [
    {
      id: 1,
      user: { id: 4, name: 'Phạm Văn D', created_at: new Date().toISOString() },
      content: 'Tuyệt vời! Bạn dùng loại thức ăn gì vậy?',
      created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 2,
      user: { id: 5, name: 'Hoàng Thị E', created_at: new Date().toISOString() },
      content: 'Ao của bạn trông rất sạch. Chúc mừng!',
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
  ],
  2: [
    {
      id: 3,
      user: { id: 6, name: 'Võ Văn F', created_at: new Date().toISOString() },
      content: 'Bạn nên kiểm tra độ pH và độ mặn của nước.',
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

let nextPostId = 4;
let nextCommentId = 4;

export const CommunityView = () => {
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const commentModalRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showComments || showCreateModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showComments, showCreateModal]);

  // Auto-focus comment input when modal opens
  useEffect(() => {
    if (showComments && commentInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        commentInputRef.current?.focus();
        commentModalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [showComments]);

  // Load comments when opening comments modal
  useEffect(() => {
    if (selectedPost && showComments) {
      setComments(MOCK_COMMENTS[selectedPost.id] || []);
    }
  }, [selectedPost, showComments]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreatePost = () => {
    if (!selectedImage || !imagePreview) return;

    setPosting(true);
    
    // Simulate delay
    setTimeout(() => {
      const newPost: Post = {
        id: nextPostId++,
        user: {
          id: 999,
          name: 'Bạn',
          created_at: new Date().toISOString(),
        },
        image_url: imagePreview,
        caption: caption.trim() || undefined,
        likes_count: 0,
        comments_count: 0,
        is_liked: false,
        created_at: new Date().toISOString(),
      };

      setPosts((prev) => [newPost, ...prev]);
      setShowCreateModal(false);
      setSelectedImage(null);
      setImagePreview(null);
      setCaption('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setPosting(false);
    }, 500);
  };

  const handleLike = (post: Post) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              is_liked: !p.is_liked,
              likes_count: p.is_liked ? p.likes_count - 1 : p.likes_count + 1,
            }
          : p
      )
    );
    if (selectedPost?.id === post.id) {
      setSelectedPost({
        ...selectedPost,
        is_liked: !selectedPost.is_liked,
        likes_count: selectedPost.is_liked
          ? selectedPost.likes_count - 1
          : selectedPost.likes_count + 1,
      });
    }
  };

  const handleOpenComments = (post: Post) => {
    setSelectedPost(post);
    setShowComments(true);
    setComments(MOCK_COMMENTS[post.id] || []);
  };

  const handleAddComment = () => {
    if (!newComment.trim() || !selectedPost || commenting) return;

    setCommenting(true);

    // Simulate delay
    setTimeout(() => {
      const newCommentObj: Comment = {
        id: nextCommentId++,
        user: {
          id: 999,
          name: 'Bạn',
          created_at: new Date().toISOString(),
        },
        content: newComment.trim(),
        created_at: new Date().toISOString(),
      };

      setComments((prev) => [...prev, newCommentObj]);
      
      // Update comment count in posts
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id ? { ...p, comments_count: p.comments_count + 1 } : p
        )
      );
      
      if (selectedPost) {
        setSelectedPost({ ...selectedPost, comments_count: selectedPost.comments_count + 1 });
      }

      // Save to mock comments
      if (!MOCK_COMMENTS[selectedPost.id]) {
        MOCK_COMMENTS[selectedPost.id] = [];
      }
      MOCK_COMMENTS[selectedPost.id].push(newCommentObj);

      setNewComment('');
      setCommenting(false);
    }, 300);
  };

  return (
    <div className="p-4 safe-bottom">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl lg:text-2xl font-bold text-[var(--color-text)]">Cộng đồng nuôi tôm</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-accent"
          aria-label="Tạo bài viết mới"
        >
          <span className="flex items-center gap-2">
            <span>➕</span>
            <span className="hidden sm:inline">Đăng bài</span>
          </span>
        </button>
      </div>

      {/* Posts Feed */}
      {posts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center gradient-primary rounded-3xl shadow-primary">
            <span className="text-4xl">👥</span>
          </div>
          <p className="text-lg font-semibold text-[var(--color-text)]">Chưa có bài viết nào</p>
          <p className="text-sm mt-2 text-[var(--color-text-secondary)]">
            Hãy là người đầu tiên chia sẻ kinh nghiệm!
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary mt-4"
          >
            Đăng bài đầu tiên
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.id} className="card-modern p-4 lg:p-6">
              {/* User Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full gradient-primary flex items-center justify-center text-white font-semibold text-lg">
                  {post.user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[var(--color-text)]">{post.user.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{formatDate(post.created_at)}</p>
                </div>
              </div>

              {/* Caption */}
              {post.caption && (
                <p className="text-sm lg:text-base text-[var(--color-text)] mb-4 whitespace-pre-wrap">
                  {post.caption}
                </p>
              )}

              {/* Image */}
              <div className="mb-4 rounded-xl overflow-hidden">
                <img
                  src={post.image_url}
                  alt={post.caption || 'Bài viết cộng đồng'}
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-4 pt-3 border-t border-[var(--color-border-light)]">
                <button
                  onClick={() => handleLike(post)}
                  className={`flex items-center gap-2 transition-colors ${
                    post.is_liked ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'
                  }`}
                  aria-label={post.is_liked ? 'Bỏ thích' : 'Thích'}
                >
                  <span className="text-xl">{post.is_liked ? '❤️' : '🤍'}</span>
                  <span className="font-medium">{post.likes_count}</span>
                </button>
                <button
                  onClick={() => handleOpenComments(post)}
                  className="flex items-center gap-2 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary-dark)]"
                  aria-label="Xem bình luận"
                >
                  <span className="text-xl">💬</span>
                  <span className="font-medium">{post.comments_count}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Post Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-[var(--color-text)]">Đăng bài mới</h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSelectedImage(null);
                    setImagePreview(null);
                    setCaption('');
                  }}
                  className="text-2xl text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                  aria-label="Đóng"
                >
                  ×
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />

              {imagePreview ? (
                <div className="space-y-4">
                  <div className="rounded-xl overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-auto"
                    />
                  </div>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Viết mô tả cho bài viết..."
                    className="input w-full min-h-[100px] resize-none"
                    maxLength={2000}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setSelectedImage(null);
                        setImagePreview(null);
                        setCaption('');
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      className="btn btn-secondary flex-1"
                    >
                      Chọn lại
                    </button>
                    <button
                      onClick={handleCreatePost}
                      disabled={posting}
                      className="btn btn-accent flex-1"
                    >
                      {posting ? 'Đang đăng...' : 'Đăng bài'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-12 border-2 border-dashed border-[var(--color-border)] rounded-xl hover:border-[var(--color-primary-dark)] transition-colors"
                >
                  <div className="text-center">
                    <span className="text-4xl mb-2 block">📷</span>
                    <p className="text-[var(--color-text-secondary)]">Chọn ảnh để đăng</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comments Modal */}
      {showComments && selectedPost && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          onClick={(e) => {
            // Close modal when clicking outside
            if (e.target === e.currentTarget) {
              setShowComments(false);
              setSelectedPost(null);
              setComments([]);
              setNewComment('');
            }
          }}
        >
          <div 
            ref={commentModalRef}
            className="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col sm:m-4 animate-slide-up"
          >
            <div className="p-4 border-b border-[var(--color-border-light)] flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--color-text)]">Bình luận</h3>
              <button
                onClick={() => {
                  setShowComments(false);
                  setSelectedPost(null);
                  setComments([]);
                  setNewComment('');
                }}
                className="text-2xl text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Post Image */}
              <div className="rounded-xl overflow-hidden mb-4">
                <img
                  src={selectedPost.image_url}
                  alt={selectedPost.caption || 'Bài viết'}
                  className="w-full h-auto"
                />
              </div>

              {/* Comments List */}
              {comments.length === 0 ? (
                <div className="text-center py-8 text-[var(--color-text-secondary)]">
                  <p>Chưa có bình luận nào</p>
                  <p className="text-sm mt-1">Hãy là người đầu tiên bình luận!</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {comment.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="bg-[var(--color-primary-light)] rounded-xl p-3">
                        <p className="font-semibold text-sm text-[var(--color-text)] mb-1">
                          {comment.user.name}
                        </p>
                        <p className="text-sm text-[var(--color-text)] whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1 ml-1">
                        {formatDate(comment.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Comment Form */}
            <div className="p-4 border-t border-[var(--color-border-light)]">
              <div className="flex gap-2">
                <input
                  ref={commentInputRef}
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Viết bình luận..."
                  className="input flex-1"
                  maxLength={1000}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || commenting}
                  className="btn btn-primary"
                >
                  {commenting ? '...' : 'Gửi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
