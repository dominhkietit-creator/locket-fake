import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../app/supabase';
import {
  Copy,
  Check,
  UserPlus,
  UserCheck,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  MessageCircle,
} from 'lucide-react-native';

export default function FriendsScreen({ user, onStartChat }) {
  const [friendIdInput, setFriendIdInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [loading, setLoading] = useState(true);

  const [acceptedFriends, setAcceptedFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [friendProfiles, setFriendProfiles] = useState({});

  // Copy User ID to clipboard
  const handleCopyId = async () => {
    if (!user?.id) return;
    await Clipboard.setStringAsync(user.id);
    setCopied(true);
    Alert.alert('Copied!', 'Your User ID has been copied to your clipboard. Send it to your friend!');
    setTimeout(() => setCopied(false), 2500);
  };

  // Fetch all friend relationships and related profiles
  const fetchFriendData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('friends')
        .select('*')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (error) throw error;

      const allRecords = data || [];

      // Partition into accepted, incoming pending, outgoing pending
      const accepted = allRecords.filter((r) => r.status === 'accepted');
      const incoming = allRecords.filter(
        (r) => r.friend_id === user.id && r.status === 'pending'
      );
      const outgoing = allRecords.filter(
        (r) => r.user_id === user.id && r.status === 'pending'
      );

      setAcceptedFriends(accepted);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);

      // Collect foreign user IDs to fetch their profiles
      const foreignIds = [
        ...new Set(
          allRecords.map((r) => (r.user_id === user.id ? r.friend_id : r.user_id))
        ),
      ];

      if (foreignIds.length > 0) {
        const { data: profs, error: profsError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', foreignIds);

        if (!profsError && profs) {
          const map = {};
          profs.forEach((p) => {
            map[p.id] = p;
          });
          setFriendProfiles(map);
        }
      }
    } catch (err) {
      console.warn('Friends fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFriendData();

    // Listen for friends changes in realtime
    const friendsChannel = supabase
      .channel('public:friends-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friends' },
        () => {
          fetchFriendData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(friendsChannel);
    };
  }, [fetchFriendData]);

  // Send friend request
  const handleSendFriendRequest = async () => {
    const targetId = friendIdInput.trim();
    if (!targetId) {
      Alert.alert('Empty ID', 'Please paste or enter a friend\'s User ID.');
      return;
    }

    if (targetId === user?.id) {
      Alert.alert('Invalid ID', 'You cannot add yourself as a friend.');
      return;
    }

    setSendingRequest(true);

    try {
      // 1. Verify user exists in profiles or auth
      const { data: targetProfile, error: targetError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', targetId)
        .single();

      if (targetError && !targetProfile) {
        Alert.alert(
          'User Not Found',
          'No user found with that ID. Please check the ID and try again.'
        );
        setSendingRequest(false);
        return;
      }

      // 2. Check if a connection already exists
      const { data: existing, error: existingError } = await supabase
        .from('friends')
        .select('*')
        .or(
          `and(user_id.eq.${user.id},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${user.id})`
        );

      if (existing && existing.length > 0) {
        const row = existing[0];
        if (row.status === 'accepted') {
          Alert.alert('Already Friends', `You are already friends with ${targetProfile?.username || 'this user'}.`);
        } else {
          Alert.alert('Pending Request', 'A friend request between you and this user is already pending.');
        }
        setSendingRequest(false);
        return;
      }

      // 3. Insert friend request
      const { error: insertError } = await supabase.from('friends').insert([
        {
          user_id: user.id,
          friend_id: targetId,
          status: 'pending',
        },
      ]);

      if (insertError) throw insertError;

      Alert.alert('Request Sent! 🎉', `Friend request sent to ${targetProfile?.username || 'user'}.`);
      setFriendIdInput('');
      fetchFriendData();
    } catch (err) {
      Alert.alert('Request Failed', err.message || 'Could not send friend request.');
    } finally {
      setSendingRequest(false);
    }
  };

  // Accept incoming request
  const handleAcceptRequest = async (requestId) => {
    try {
      const { error } = await supabase
        .from('friends')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      if (error) throw error;
      Alert.alert('Friend Added!', 'You are now Locket friends!');
      fetchFriendData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not accept friend request.');
    }
  };

  // Decline/Remove incoming request
  const handleDeclineRequest = async (requestId) => {
    try {
      const { error } = await supabase.from('friends').delete().eq('id', requestId);
      if (error) throw error;
      fetchFriendData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not decline friend request.');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator color="#FFCC00" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* My User ID Card */}
      <View style={styles.myIdCard}>
        <Text style={styles.sectionTitle}>Your Locket ID</Text>
        <Text style={styles.idDescription}>
          Share this unique ID with your friends so they can add your widget:
        </Text>
        <View style={styles.idRow}>
          <Text style={styles.idText} numberOfLines={1} ellipsizeMode="middle">
            {user?.id}
          </Text>
          <TouchableOpacity
            style={styles.copyButton}
            onPress={handleCopyId}
            activeOpacity={0.7}
          >
            {copied ? (
              <Check size={16} color="#000" />
            ) : (
              <Copy size={16} color="#000" />
            )}
            <Text style={styles.copyButtonText}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Add Friend Input Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <UserPlus size={20} color="#FFCC00" />
          <Text style={styles.cardTitle}>Add Friend by User ID</Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Paste friend's Supabase User ID"
            placeholderTextColor="#666"
            value={friendIdInput}
            onChangeText={setFriendIdInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.addButton, sendingRequest && styles.addButtonDisabled]}
            onPress={handleSendFriendRequest}
            disabled={sendingRequest}
            activeOpacity={0.8}
          >
            {sendingRequest ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.addButtonText}>Add</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Incoming Friend Requests */}
      {incomingRequests.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Clock size={18} color="#FFCC00" />
            <Text style={styles.sectionTitle}>
              Friend Requests ({incomingRequests.length})
            </Text>
          </View>
          {incomingRequests.map((req) => {
            const senderProfile = friendProfiles[req.user_id] || {
              username: 'User',
              avatar_url: null,
            };
            return (
              <View key={req.id} style={styles.requestCard}>
                <View style={styles.requestInfo}>
                  {senderProfile.avatar_url ? (
                    <Image
                      source={{ uri: senderProfile.avatar_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <User size={16} color="#FFCC00" />
                    </View>
                  )}
                  <View style={styles.requestDetails}>
                    <Text style={styles.friendName}>
                      {senderProfile.username || 'Friend'}
                    </Text>
                    <Text style={styles.friendIdSub} numberOfLines={1}>
                      ID: {req.user_id}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => handleAcceptRequest(req.id)}
                    activeOpacity={0.7}
                  >
                    <CheckCircle2 size={20} color="#000" />
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => handleDeclineRequest(req.id)}
                    activeOpacity={0.7}
                  >
                    <XCircle size={20} color="#FF453A" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Outgoing Requests */}
      {outgoingRequests.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Clock size={18} color="#8E8E93" />
            <Text style={[styles.sectionTitle, { color: '#8E8E93' }]}>
              Sent Requests ({outgoingRequests.length})
            </Text>
          </View>
          {outgoingRequests.map((req) => {
            const receiverProfile = friendProfiles[req.friend_id] || {
              username: 'User',
              avatar_url: null,
            };
            return (
              <View key={req.id} style={styles.pendingCard}>
                <View style={styles.requestInfo}>
                  <View style={styles.avatarPlaceholder}>
                    <User size={16} color="#8E8E93" />
                  </View>
                  <View style={styles.requestDetails}>
                    <Text style={styles.friendName}>
                      {receiverProfile.username || req.friend_id.slice(0, 12)}
                    </Text>
                    <Text style={styles.pendingBadge}>Waiting for acceptance</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Accepted Friends List */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <UserCheck size={18} color="#FFCC00" />
          <Text style={styles.sectionTitle}>
            Friends ({acceptedFriends.length})
          </Text>
        </View>

        {acceptedFriends.length === 0 ? (
          <View style={styles.emptyFriendsBox}>
            <Text style={styles.emptyFriendsText}>
              No friends yet! Share your Locket ID to connect.
            </Text>
          </View>
        ) : (
          acceptedFriends.map((rel) => {
            const friendUserId =
              rel.user_id === user.id ? rel.friend_id : rel.user_id;
            const profile = friendProfiles[friendUserId] || {
              username: 'Locket Friend',
              avatar_url: null,
            };

            return (
              <View key={rel.id} style={styles.friendCard}>
                <View style={styles.requestInfo}>
                  {profile.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <User size={18} color="#FFCC00" />
                    </View>
                  )}
                  <View style={styles.requestDetails}>
                    <Text style={styles.friendName}>
                      {profile.username || 'Friend'}
                    </Text>
                    <Text style={styles.friendIdSub} numberOfLines={1}>
                      ID: {friendUserId}
                    </Text>
                  </View>
                </View>

                {onStartChat && (
                  <TouchableOpacity
                    style={styles.chatBtn}
                    onPress={() => onStartChat(friendUserId, profile.username)}
                    activeOpacity={0.7}
                  >
                    <MessageCircle size={18} color="#000" />
                    <Text style={styles.chatBtnText}>Chat</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myIdCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  idDescription: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 12,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0E',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    gap: 8,
  },
  idText: {
    flex: 1,
    color: '#FFCC00',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  copyButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#0D0D0E',
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  addButton: {
    backgroundColor: '#FFCC00',
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141416',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#222224',
  },
  friendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: '#FFCC00',
  },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestDetails: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  friendIdSub: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  pendingBadge: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 4,
  },
  acceptBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  declineBtn: {
    padding: 6,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 4,
  },
  chatBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyFriendsBox: {
    backgroundColor: '#141416',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  emptyFriendsText: {
    color: '#8E8E93',
    fontSize: 13,
    textAlign: 'center',
  },
});
