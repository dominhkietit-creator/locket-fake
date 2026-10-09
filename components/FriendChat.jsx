import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { supabase } from '../app/supabase';
import { Send, MessageCircle, User, Users, Sparkles, Camera } from 'lucide-react-native';

export default function FriendChat({ user, initialFriendId = null, initialFriendName = null }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [profiles, setProfiles] = useState({});
  const profilesRef = useRef({});
  profilesRef.current = profiles;

  // activeRecipientId: null means "Locket Lounge (Group)", or specific friend uuid
  const [activeRecipientId, setActiveRecipientId] = useState(initialFriendId);
  const [activeRecipientName, setActiveRecipientName] = useState(initialFriendName);

  // Sync when initial props change
  useEffect(() => {
    if (initialFriendId) {
      setActiveRecipientId(initialFriendId);
      if (initialFriendName) {
        setActiveRecipientName(initialFriendName);
      }
    }
  }, [initialFriendId, initialFriendName]);

  // Fetch all conversation contacts: combining accepted friends and all users with message history
  const fetchConversations = useCallback(async () => {
    if (!user || !user.id) return;
    try {
      // 1. Lấy danh sách bạn bè đã kết bạn
      const { data: friendsData } = await supabase
        .from('friends')
        .select('*')
        .eq('status', 'accepted')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      // 2. Lấy danh sách tin nhắn gửi hoặc nhận của người dùng
      const { data: userMessages } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, text, created_at')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('id', { ascending: false });

      // 3. Tập hợp tất cả các User ID liên quan
      const contactIdsSet = new Set();
      const lastMessageMap = {};

      (userMessages || []).forEach((m) => {
        const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        if (otherId && otherId !== user.id) {
          contactIdsSet.add(otherId);
          if (!lastMessageMap[otherId]) {
            lastMessageMap[otherId] = m.text;
          }
        }
      });

      (friendsData || []).forEach((f) => {
        const otherId = f.user_id === user.id ? f.friend_id : f.user_id;
        if (otherId && otherId !== user.id) {
          contactIdsSet.add(otherId);
        }
      });

      if (initialFriendId && initialFriendId !== user.id) {
        contactIdsSet.add(initialFriendId);
      }

      const contactIds = Array.from(contactIdsSet).filter(Boolean);

      if (contactIds.length > 0) {
        const { data: profData, error: profError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', contactIds);

        if (!profError && profData) {
          const formattedContacts = profData.map((p) => ({
            ...p,
            lastMessage: lastMessageMap[p.id] || null,
          }));

          setConversations(formattedContacts);

          const profMap = {};
          profData.forEach((p) => {
            profMap[p.id] = p;
          });
          setProfiles((curr) => ({ ...curr, ...profMap }));

          // Tự động mở cuộc trò chuyện gần nhất nếu chưa có ai được chọn
          setActiveRecipientId((currId) => {
            if (currId) return currId;
            if (initialFriendId) return initialFriendId;
            if (formattedContacts.length > 0) {
              setActiveRecipientName(formattedContacts[0].username);
              return formattedContacts[0].id;
            }
            return null;
          });
        }
      } else {
        setConversations([]);
      }
    } catch (err) {
      console.warn('Chat conversations fetch error:', err.message);
    }
  }, [user?.id, initialFriendId]);

  // Fetch messages for active conversation (chỉ hiện loading xoay ở lần đầu vào chat)
  const fetchMessages = useCallback(async (isInitial = false) => {
    if (!user || !user.id) return;
    if (isInitial) {
      setLoading(true);
    }

    try {
      let query = supabase.from('messages').select('*');

      if (activeRecipientId) {
        // Direct chat giữa user và activeRecipientId
        query = query.or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${activeRecipientId}),and(sender_id.eq.${activeRecipientId},receiver_id.eq.${user.id})`
        );
      } else {
        // Chat phòng chung Locket Lounge (receiver_id is null)
        query = query.is('receiver_id', null);
      }

      // Order newest first for inverted FlatList
      const { data, error } = await query.order('id', { ascending: false }).limit(100);

      if (error) throw error;

      setMessages(data || []);

      // Fetch profiles cho người gửi chưa có trong cache
      const senderIds = [...new Set((data || []).map((m) => m.sender_id))];
      const missingSenderIds = senderIds.filter((id) => !profilesRef.current[id] && id !== user.id);

      if (missingSenderIds.length > 0) {
        const { data: missingProfiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', missingSenderIds);

        if (missingProfiles) {
          const newMap = {};
          missingProfiles.forEach((p) => {
            newMap[p.id] = p;
          });
          setProfiles((curr) => ({ ...curr, ...newMap }));
        }
      }
    } catch (err) {
      console.warn('Chat messages fetch error:', err.message);
    } finally {
      if (isInitial) {
        setLoading(false);
      }
    }
  }, [user?.id, activeRecipientId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    fetchMessages(true);
  }, [fetchMessages]);

  // Supabase Realtime channel subscription on 'messages' table
  useEffect(() => {
    if (!user?.id) return;

    const chatChannel = supabase
      .channel(`public:messages-channel-${activeRecipientId || 'lounge'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const newMsg = payload.new;

          // Check if message belongs to current chat conversation
          const isCurrentConvo = activeRecipientId
            ? (newMsg.sender_id === user.id && newMsg.receiver_id === activeRecipientId) ||
              (newMsg.sender_id === activeRecipientId && newMsg.receiver_id === user.id)
            : newMsg.receiver_id === null;

          if (isCurrentConvo) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [newMsg, ...prev];
            });

            // Fetch profile if missing
            if (newMsg.sender_id && !profilesRef.current[newMsg.sender_id] && newMsg.sender_id !== user.id) {
              supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .eq('id', newMsg.sender_id)
                .single()
                .then(({ data }) => {
                  if (data) {
                    setProfiles((curr) => ({ ...curr, [data.id]: data }));
                  }
                });
            }
          }

          // Cập nhật lại danh sách hội thoại ngầm mà không làm reload màn hình
          if (newMsg.sender_id === user.id || newMsg.receiver_id === user.id) {
            fetchConversations();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chatChannel);
    };
  }, [user?.id, activeRecipientId, fetchConversations]);

  // Send message
  const handleSendMessage = async (e) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    const textToSend = inputText.trim();
    if (!textToSend) return;

    if (!user || !user.id) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Vui lòng đăng nhập để gửi tin nhắn.');
      } else {
        Alert.alert('Sign in required', 'Please log in to send messages.');
      }
      return;
    }

    setSending(true);
    setInputText('');

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            sender_id: user.id,
            receiver_id: activeRecipientId || null,
            text: textToSend,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Optimistically hiển thị tin nhắn ngay lập tức mà không reload trang hay xoay spinner
      if (data) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.id)) return prev;
          return [data, ...prev];
        });
      }
    } catch (err) {
      console.error('Send message error:', err);
      setInputText(textToSend); // Khôi phục lại chữ nếu lỗi
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Lỗi: ' + (err.message || 'Không thể gửi tin nhắn.'));
      } else {
        Alert.alert('Error', err.message || 'Could not send message.');
      }
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageItem = ({ item }) => {
    const isMe = item.sender_id === user?.id;
    const sender = profiles[item.sender_id] || { username: 'Friend', avatar_url: null };

    return (
      <View
        style={[
          styles.messageRow,
          isMe ? styles.messageRowMe : styles.messageRowOther,
        ]}
      >
        {/* Recipient avatar for incoming messages */}
        {!isMe && (
          <View style={styles.senderAvatarContainer}>
            {sender.avatar_url ? (
              <Image source={{ uri: sender.avatar_url }} style={styles.senderAvatar} />
            ) : (
              <View style={styles.senderAvatarPlaceholder}>
                <User size={12} color="#FFCC00" />
              </View>
            )}
          </View>
        )}

        {/* Message bubble: Blue (#0A84FF) for sender, dark gray (#2C2C2E) for recipient */}
        <View
          style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleOther,
          ]}
        >
          {!isMe && (
            <Text style={styles.bubbleSenderName}>
              {sender.username || 'Friend'}
            </Text>
          )}
          {/* Hiển thị tin nhắn Trả Lời Ảnh Locket */}
          {item.text && item.text.startsWith('📷 [Trả lời') ? (
            <View style={styles.quoteWrapper}>
              <View
                style={[
                  styles.quoteBox,
                  isMe ? styles.quoteBoxMe : styles.quoteBoxOther,
                ]}
              >
                <Camera size={12} color={isMe ? '#FFFFFF' : '#FFCC00'} />
                <Text
                  style={[
                    styles.quoteLabel,
                    isMe ? styles.quoteLabelMe : styles.quoteLabelOther,
                  ]}
                  numberOfLines={2}
                >
                  {item.text.split(']:')[0].replace('📷 [', '')}
                </Text>
              </View>
              <Text
                style={[
                  styles.bubbleText,
                  isMe ? styles.bubbleTextMe : styles.bubbleTextOther,
                ]}
              >
                {item.text.includes(']:')
                  ? item.text.split(']:')[1].trim()
                  : item.text}
              </Text>
            </View>
          ) : (
            <Text
              style={[
                styles.bubbleText,
                isMe ? styles.bubbleTextMe : styles.bubbleTextOther,
              ]}
            >
              {item.text}
            </Text>
          )}
          <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeOther]}>
            {formatMessageTime(item.created_at)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={styles.container}
    >
      {/* Channels & Friends Selector Bar */}
      <View style={styles.selectorBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectorBarContent}
        >
          <TouchableOpacity
            style={[
              styles.channelTab,
              activeRecipientId === null && styles.channelTabActive,
            ]}
            onPress={() => {
              setActiveRecipientId(null);
              setActiveRecipientName(null);
            }}
            activeOpacity={0.7}
          >
            <Users size={16} color={activeRecipientId === null ? '#000' : '#8E8E93'} />
            <Text
              style={[
                styles.channelTabText,
                activeRecipientId === null && styles.channelTabTextActive,
              ]}
            >
              Locket Lounge
            </Text>
          </TouchableOpacity>

          {conversations.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[
                styles.channelTab,
                activeRecipientId === f.id && styles.channelTabActive,
              ]}
              onPress={() => {
                setActiveRecipientId(f.id);
                setActiveRecipientName(f.username);
              }}
              activeOpacity={0.7}
            >
              {f.avatar_url ? (
                <Image source={{ uri: f.avatar_url }} style={styles.tabAvatar} />
              ) : (
                <User size={16} color={activeRecipientId === f.id ? '#000' : '#8E8E93'} />
              )}
              <Text
                style={[
                  styles.channelTabText,
                  activeRecipientId === f.id && styles.channelTabTextActive,
                ]}
                numberOfLines={1}
              >
                {f.username || 'Friend'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Active Conversation Title Header */}
      <View style={styles.convoHeader}>
        <Text style={styles.convoTitle}>
          {activeRecipientId ? `Chat với ${activeRecipientName || 'Bạn bè'}` : '💬 Locket Lounge (Kênh chung)'}
        </Text>
        <Text style={styles.convoSubtitle}>
          {activeRecipientId ? 'Nhắn tin trực tiếp Realtime' : 'Trò chuyện công khai giữa các thành viên'}
        </Text>
      </View>

      {/* Inverted FlatList for Messages */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color="#FFCC00" size="large" />
          <Text style={styles.loadingText}>Đang tải lịch sử tin nhắn...</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessageItem}
          inverted={true}
          contentContainerStyle={styles.messagesList}
          ListEmptyComponent={
            <View style={styles.emptyMessages}>
              <View style={styles.emptyIconBox}>
                <MessageCircle size={36} color="#FFCC00" />
              </View>
              <Text style={styles.emptyTitle}>Chưa có tin nhắn nào</Text>
              <Text style={styles.emptySubtitle}>
                {activeRecipientId
                  ? `Bắt đầu cuộc trò chuyện với ${activeRecipientName || 'bạn bè'} ngay bây giờ!`
                  : 'Phòng chat chung Locket Lounge chưa có tin nhắn. Bạn hãy chọn bạn bè ở thanh trên hoặc nhắn tin vào đây!'}
              </Text>
            </View>
          }
        />
      )}

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.inputField}
          placeholder={
            activeRecipientId
              ? `Nhắn tin cho ${activeRecipientName || 'bạn bè'}...`
              : 'Nhắn tin vào Locket Lounge...'
          }
          placeholderTextColor="#666"
          value={inputText}
          onChangeText={setInputText}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={(e) => {
            e?.preventDefault?.();
            handleSendMessage(e);
          }}
          onKeyPress={(e) => {
            if (e.nativeEvent?.key === 'Enter') {
              e.preventDefault?.();
              handleSendMessage(e);
            }
          }}
        />

        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={(e) => {
            e?.preventDefault?.();
            handleSendMessage(e);
          }}
          disabled={!inputText.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Send size={18} color="#000" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  selectorBarWrapper: {
    backgroundColor: '#141416',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  selectorBarContent: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  tabAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  channelTab: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  channelTabActive: {
    backgroundColor: '#FFCC00',
    borderColor: '#FFCC00',
  },
  channelTabText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  channelTabTextActive: {
    color: '#000000',
    fontWeight: '700',
  },
  convoHeader: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: '#0D0D0E',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  convoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  convoSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 10,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  senderAvatarContainer: {
    marginRight: 8,
    marginBottom: 2,
  },
  senderAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFCC00',
  },
  senderAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bubble styling: Blue for sender, dark gray for recipient
  bubble: {
    maxWidth: '75%',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  bubbleMe: {
    backgroundColor: '#0A84FF', // Blue for sender
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#2C2C2E', // Dark gray for recipient
    borderBottomLeftRadius: 4,
  },
  bubbleSenderName: {
    color: '#FFCC00',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: '#FFFFFF',
  },
  bubbleTextOther: {
    color: '#FFFFFF',
  },
  bubbleTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  bubbleTimeMe: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  bubbleTimeOther: {
    color: '#8E8E93',
  },
  emptyMessages: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    transform: [{ scaleY: -1 }], // Counteract inverted FlatList
  },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#141416',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  inputField: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginRight: 10,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFCC00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#3A3A3C',
    opacity: 0.6,
  },
  quoteWrapper: {
    width: '100%',
  },
  quoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 6,
    gap: 6,
  },
  quoteBoxMe: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFFFFF',
  },
  quoteBoxOther: {
    backgroundColor: 'rgba(255, 204, 0, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFCC00',
  },
  quoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },
  quoteLabelMe: {
    color: '#FFFFFF',
  },
  quoteLabelOther: {
    color: '#FFCC00',
  },
});
