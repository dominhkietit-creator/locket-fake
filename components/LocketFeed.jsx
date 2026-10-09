import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { supabase } from '../app/supabase';
import {
  User,
  Heart,
  Flame,
  Smile,
  RefreshCw,
  MessageCircle,
  Send,
  Sparkles,
  Camera,
  Trash2,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');
const POST_IMAGE_SIZE = Math.min(width - 32, 380);

const EMOJI_OPTIONS = ['❤️', '😂', '😮', '🔥'];

export default function LocketFeed({ user, onOpenChatWithUser }) {
  const [posts, setPosts] = useState([]);
  const [profiles, setProfiles] = useState({}); // { [userId]: { username, avatar_url } }
  const [reactions, setReactions] = useState([]); // Array of { id, post_id, user_id, emoji }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Trạng thái Trả lời bằng tin nhắn cho từng bài đăng
  const [replyTexts, setReplyTexts] = useState({}); // { [postId]: string }
  const [sendingReplyId, setSendingReplyId] = useState(null);

  // Fetch all posts, associated profiles, and reactions
  const fetchFeedData = useCallback(async () => {
    try {
      // 1. Fetch posts sorted newest first
      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .order('id', { ascending: false });

      if (postsError) throw postsError;

      const loadedPosts = postsData || [];
      setPosts(loadedPosts);

      if (loadedPosts.length === 0) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 2. Fetch profiles for user_ids in posts
      const userIds = [...new Set(loadedPosts.map((p) => p.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);

        if (!profilesError && profilesData) {
          const profileMap = {};
          profilesData.forEach((prof) => {
            profileMap[prof.id] = prof;
          });
          setProfiles(profileMap);
        }
      }

      // 3. Fetch reactions for these posts
      const postIds = loadedPosts.map((p) => p.id);
      const { data: reactionsData, error: reactionsError } = await supabase
        .from('reactions')
        .select('*')
        .in('post_id', postIds);

      if (!reactionsError && reactionsData) {
        setReactions(reactionsData);
      }
    } catch (err) {
      console.warn('Feed fetch error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedData();

    // 4. Setup Supabase Realtime subscription on 'reactions' table
    const reactionsChannel = supabase
      .channel('public:reactions-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reactions' },
        (payload) => {
          setReactions((prev) => {
            if (prev.some((r) => r.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'reactions' },
        (payload) => {
          setReactions((prev) => prev.filter((r) => r.id !== payload.old.id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'reactions' },
        (payload) => {
          setReactions((prev) =>
            prev.map((r) => (r.id === payload.new.id ? payload.new : r))
          );
        }
      )
      .subscribe();

    // 5. Also listen for new posts in realtime
    const postsChannel = supabase
      .channel('public:posts-channel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          setPosts((prev) => {
            if (prev.some((p) => p.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
          // Fetch author profile if missing
          if (payload.new.user_id) {
            supabase
              .from('profiles')
              .select('id, username, avatar_url')
              .eq('id', payload.new.user_id)
              .single()
              .then(({ data }) => {
                if (data) {
                  setProfiles((curr) => ({ ...curr, [data.id]: data }));
                }
              });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'posts' },
        (payload) => {
          setPosts((prev) => prev.filter((p) => p.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reactionsChannel);
      supabase.removeChannel(postsChannel);
    };
  }, [fetchFeedData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeedData();
  };

  // Toggle reaction: tap emoji to add or remove
  const handleToggleReaction = async (postId, emoji) => {
    if (!user || !user.id) {
      Alert.alert('Chưa đăng nhập', 'Vui lòng đăng nhập để thả cảm xúc.');
      return;
    }

    try {
      const existing = reactions.find(
        (r) => r.post_id === postId && r.user_id === user.id && r.emoji === emoji
      );

      if (existing) {
        setReactions((prev) => prev.filter((r) => r.id !== existing.id));
        const { error } = await supabase.from('reactions').delete().eq('id', existing.id);
        if (error) {
          setReactions((prev) => [...prev, existing]);
          throw error;
        }
      } else {
        const tempId = -Date.now();
        const optimisticReaction = {
          id: tempId,
          post_id: postId,
          user_id: user.id,
          emoji,
        };
        setReactions((prev) => [...prev, optimisticReaction]);

        const { data, error } = await supabase
          .from('reactions')
          .insert([
            {
              post_id: postId,
              user_id: user.id,
              emoji,
            },
          ])
          .select()
          .single();

        if (error) {
          setReactions((prev) => prev.filter((r) => r.id !== tempId));
          throw error;
        }

        if (data) {
          setReactions((prev) =>
            prev.map((r) => (r.id === tempId ? data : r))
          );
        }
      }
    } catch (err) {
      console.warn('Reaction toggle error:', err.message);
    }
  };

  // Gửi tin nhắn trả lời bài đăng của bạn bè (Reply to post via messaging)
  const handleSendPostReply = async (post, author, e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const rawText = (replyTexts[post.id] || '').trim();
    if (!rawText) return;

    if (!user || !user.id) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Vui lòng đăng nhập để gửi tin nhắn trả lời.');
      } else {
        Alert.alert('Chưa đăng nhập', 'Vui lòng đăng nhập để gửi tin nhắn trả lời.');
      }
      return;
    }

    setSendingReplyId(post.id);

    try {
      const postSnippet = post.caption ? `"${post.caption}"` : 'ảnh khoảnh khắc';
      const formattedMessage = `📷 [Trả lời ${postSnippet}]: ${rawText}`;

      // Xóa nội dung trong ô input ngay lập tức mà không làm gián đoạn hay reload trang
      setReplyTexts((prev) => ({ ...prev, [post.id]: '' }));

      // Gửi tin nhắn vào bảng messages tới đúng tác giả của bài đăng
      const { error } = await supabase.from('messages').insert([
        {
          sender_id: user.id,
          receiver_id: post.user_id,
          text: formattedMessage,
        },
      ]);

      if (error) throw error;
    } catch (err) {
      console.error('Send post reply error:', err);
      setReplyTexts((prev) => ({ ...prev, [post.id]: rawText }));
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Lỗi: ' + (err.message || 'Không thể gửi tin nhắn.'));
      } else {
        Alert.alert('Lỗi', err.message || 'Không thể gửi tin nhắn.');
      }
    } finally {
      setSendingReplyId(null);
    }
  };

  // Xóa bài đăng của chính mình
  const handleDeletePost = (post) => {
    const executeDelete = async () => {
      // Optimistically xóa khỏi danh sách bài viết hiển thị
      setPosts((prev) => prev.filter((p) => p.id !== post.id));

      try {
        const { error } = await supabase
          .from('posts')
          .delete()
          .eq('id', post.id);

        if (error) throw error;

        // Xóa file ảnh trong storage locket-images nếu có
        if (post.image_url && post.image_url.includes('locket-images/')) {
          const parts = post.image_url.split('locket-images/');
          if (parts[1]) {
            await supabase.storage
              .from('locket-images')
              .remove([decodeURIComponent(parts[1])]);
          }
        }
      } catch (err) {
        console.error('Delete post error:', err);
        Alert.alert('Lỗi', err.message || 'Không thể xóa bài đăng.');
        fetchFeedData(); // rollback
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Bạn có chắc chắn muốn xóa bài đăng này không? Ảnh sẽ bị xóa vĩnh viễn khỏi Locket.'
      );
      if (confirmed) {
        executeDelete();
      }
    } else {
      Alert.alert(
        'Xóa bài đăng',
        'Bạn có chắc chắn muốn xóa bài đăng này không? Ảnh sẽ bị xóa vĩnh viễn khỏi Locket.',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Xóa ngay',
            style: 'destructive',
            onPress: executeDelete,
          },
        ]
      );
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Vừa xong';
    const date = new Date(timestamp);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 60) return 'Vừa xong';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
    return `${Math.floor(diffSec / 86400)} ngày trước`;
  };

  const renderPost = ({ item }) => {
    const author = profiles[item.user_id] || {
      username: 'Bạn bè',
      avatar_url: null,
    };
    const isMe = user?.id === item.user_id;

    // Lọc reactions cho bài đăng này
    const postReactions = reactions.filter((r) => r.post_id === item.id);

    return (
      <View style={styles.postCard}>
        {/* Post Author Header */}
        <View style={styles.postHeader}>
          <View style={styles.authorInfo}>
            {author.avatar_url ? (
              <Image source={{ uri: author.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <User size={16} color="#FFCC00" />
              </View>
            )}
            <View>
              <Text style={styles.authorName}>
                {isMe ? 'Bạn' : author.username || 'Bạn bè'}
              </Text>
              <Text style={styles.postTime}>{formatTime(item.created_at)}</Text>
            </View>
          </View>

          {/* Nút Xóa bài đăng của chính mình HOẶC Chat với bạn bè */}
          {isMe ? (
            <TouchableOpacity
              style={styles.deletePostBtn}
              onPress={() => handleDeletePost(item)}
              activeOpacity={0.7}
              title="Xóa bài đăng này"
            >
              <Trash2 size={16} color="#FF453A" />
            </TouchableOpacity>
          ) : (
            onOpenChatWithUser && (
              <TouchableOpacity
                style={styles.chatShortcutBtn}
                onPress={() => onOpenChatWithUser(item.user_id, author.username)}
                activeOpacity={0.7}
                title="Nhắn tin với bạn này"
              >
                <MessageCircle size={18} color="#FFCC00" />
              </TouchableOpacity>
            )
          )}
        </View>

        {/* 1:1 Widget-Style Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: item.image_url }}
            style={styles.postImage}
            resizeMode="cover"
          />

          {item.caption ? (
            <View style={styles.captionOverlay}>
              <Text style={styles.captionText}>{item.caption}</Text>
            </View>
          ) : null}
        </View>

        {/* Floating Quick Reaction Bar */}
        <View style={styles.reactionBar}>
          {EMOJI_OPTIONS.map((emoji) => {
            const count = postReactions.filter((r) => r.emoji === emoji).length;
            const hasReacted = postReactions.some(
              (r) => r.emoji === emoji && r.user_id === user?.id
            );

            return (
              <TouchableOpacity
                key={emoji}
                style={[
                  styles.reactionButton,
                  hasReacted && styles.reactionButtonActive,
                ]}
                onPress={() => handleToggleReaction(item.id, emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 0 && (
                  <Text
                    style={[
                      styles.reactionCount,
                      hasReacted && styles.reactionCountActive,
                    ]}
                  >
                    {count}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tính năng Trả lời bài đăng qua tin nhắn (Reply to post via messaging) */}
        {!isMe && (
          <View style={styles.replyBox}>
            <View style={styles.replyInputContainer}>
              <MessageCircle size={16} color="#8E8E93" style={styles.replyIcon} />
              <TextInput
                style={styles.replyInput}
                placeholder={`Nhắn tin trả lời ${author.username || 'bạn'}...`}
                placeholderTextColor="#666"
                value={replyTexts[item.id] || ''}
                onChangeText={(text) =>
                  setReplyTexts((prev) => ({ ...prev, [item.id]: text }))
                }
                returnKeyType="send"
                onSubmitEditing={(e) => {
                  e?.preventDefault?.();
                  handleSendPostReply(item, author, e);
                }}
                onKeyPress={(e) => {
                  if (e.nativeEvent?.key === 'Enter') {
                    e.preventDefault?.();
                    handleSendPostReply(item, author, e);
                  }
                }}
              />
              <TouchableOpacity
                style={[
                  styles.replySendBtn,
                  (!replyTexts[item.id]?.trim() || sendingReplyId === item.id) &&
                    styles.replySendBtnDisabled,
                ]}
                onPress={(e) => {
                  e?.preventDefault?.();
                  handleSendPostReply(item, author, e);
                }}
                disabled={!replyTexts[item.id]?.trim() || sendingReplyId === item.id}
                activeOpacity={0.8}
              >
                {sendingReplyId === item.id ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Send size={15} color="#000" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color="#FFCC00" size="large" />
        <Text style={styles.loadingText}>Đang tải khoảnh khắc Locket...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderPost}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FFCC00"
            colors={['#FFCC00']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <Smile size={44} color="#FFCC00" />
            </View>
            <Text style={styles.emptyTitle}>Chưa có bài đăng Locket nào</Text>
            <Text style={styles.emptySubtitle}>
              Hãy là người đầu tiên chụp và gửi khoảnh khắc lên widget của bạn bè!
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  postCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 36,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#FFCC00',
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#3A3A3C',
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  postTime: {
    fontSize: 12,
    color: '#8E8E93',
  },
  chatShortcutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deletePostBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  captionOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  reactionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingHorizontal: 4,
    backgroundColor: '#141416',
    borderRadius: 22,
    paddingVertical: 6,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: 'transparent',
    gap: 4,
  },
  reactionButtonActive: {
    backgroundColor: 'rgba(255, 204, 0, 0.2)',
    borderWidth: 1,
    borderColor: '#FFCC00',
  },
  reactionEmoji: {
    fontSize: 20,
  },
  reactionCount: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '700',
  },
  reactionCountActive: {
    color: '#FFCC00',
  },
  replyBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  replyInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0E',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  replyIcon: {
    marginRight: 8,
  },
  replyInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  replySendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  replySendBtnDisabled: {
    backgroundColor: '#3A3A3C',
    opacity: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
});
