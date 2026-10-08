import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { supabase } from './supabase';

import AuthScreen from '../components/AuthScreen';
import Header from '../components/Header';
import TabBar from '../components/TabBar';
import CameraViewfinder from '../components/CameraViewfinder';
import LocketFeed from '../components/LocketFeed';
import FriendChat from '../components/FriendChat';
import FriendsScreen from '../components/FriendsScreen';
import ProfileScreen from '../components/ProfileScreen';
import { Sparkles } from 'lucide-react-native';

export default function LocketApp() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [currentTab, setCurrentTab] = useState('camera'); // 'camera' | 'feed' | 'chat' | 'friends' | 'profile'
  const [chatTarget, setChatTarget] = useState({ id: null, name: null });

  // Fetch current user's profile from 'profiles' table, auto-create if missing
  const fetchUserProfile = useCallback(async (userId, userEmail) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (data) {
        setUserProfile(data);
      } else {
        // Tự động tạo bản ghi profile nếu chưa có để tránh lỗi foreign key
        const defaultUsername = userEmail ? userEmail.split('@')[0] : `user_${userId.slice(0, 5)}`;
        const { data: newProfile } = await supabase
          .from('profiles')
          .upsert([
            {
              id: userId,
              username: defaultUsername,
              avatar_url: null,
            },
          ])
          .select()
          .maybeSingle();

        if (newProfile) {
          setUserProfile(newProfile);
        }
      }
    } catch (err) {
      console.warn('User profile fetch warning:', err.message);
    }
  }, []);

  // 1. Session listener using supabase.auth.onAuthStateChange
  useEffect(() => {
    // Check initial active session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        fetchUserProfile(initialSession.user.id, initialSession.user.email);
      }
      setLoadingSession(false);
    });

    // Subscribe to auth state changes (login, logout, token refreshed)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      if (currentSession?.user) {
        fetchUserProfile(currentSession.user.id, currentSession.user.email);
      } else {
        setUserProfile(null);
        setCurrentTab('camera');
      }
      setLoadingSession(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  // Handle Logout (Cross-platform Web & Mobile)
  const handleLogout = async () => {
    const doLogout = async () => {
      try {
        setLoadingSession(true);
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Sign out error:', err);
      } finally {
        setUser(null);
        setSession(null);
        setUserProfile(null);
        setCurrentTab('camera');
        setLoadingSession(false);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Bạn có chắc chắn muốn đăng xuất khỏi Locket không?');
      if (confirmed) {
        await doLogout();
      }
    } else {
      Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất khỏi Locket không?', [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: doLogout,
        },
      ]);
    }
  };

  // Switch to chat with a designated friend
  const handleOpenChatWithUser = (friendId, friendName) => {
    setChatTarget({ id: friendId, name: friendName });
    setCurrentTab('chat');
  };

  // Loading state while checking auth session
  if (loadingSession) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar style="light" />
        <View style={styles.splashLogo}>
          <Sparkles size={40} color="#000" />
        </View>
        <Text style={styles.splashTitle}>Locket</Text>
        <ActivityIndicator color="#FFCC00" size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  // Not authenticated: render AuthScreen
  if (!session || !user) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
          <StatusBar style="light" />
          <AuthScreen
            onAuthSuccess={(authenticatedUser) => {
              setUser(authenticatedUser);
              fetchUserProfile(authenticatedUser.id);
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // Authenticated: Render Main App Dashboard
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />

        {/* Global Header */}
        <Header
          profile={userProfile}
          onLogout={handleLogout}
          onOpenProfile={() => setCurrentTab('profile')}
        />

        {/* Tab Content Screens */}
        <View style={styles.screenBody}>
          {currentTab === 'camera' && (
            <CameraViewfinder
              user={user}
              onPostSuccess={() => setCurrentTab('feed')}
            />
          )}

          {currentTab === 'feed' && (
            <LocketFeed
              user={user}
              onOpenChatWithUser={handleOpenChatWithUser}
            />
          )}

          {currentTab === 'chat' && (
            <FriendChat
              user={user}
              initialFriendId={chatTarget.id}
              initialFriendName={chatTarget.name}
            />
          )}

          {currentTab === 'friends' && (
            <FriendsScreen
              user={user}
              onStartChat={handleOpenChatWithUser}
            />
          )}

          {currentTab === 'profile' && (
            <ProfileScreen
              user={user}
              onProfileUpdated={() => fetchUserProfile(user.id)}
              onLogout={handleLogout}
            />
          )}
        </View>

        {/* Bottom Tab Bar */}
        <TabBar currentTab={currentTab} onSelectTab={setCurrentTab} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 80,
    height: 80,
    borderRadius: 26,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  splashTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  screenBody: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
