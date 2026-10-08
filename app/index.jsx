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
import { supabase, isSupabaseConfigured } from './supabase';

import AuthScreen from '../components/AuthScreen';
import Header from '../components/Header';
import TabBar from '../components/TabBar';
import CameraViewfinder from '../components/CameraViewfinder';
import LocketFeed from '../components/LocketFeed';
import FriendChat from '../components/FriendChat';
import FriendsScreen from '../components/FriendsScreen';
import ProfileScreen from '../components/ProfileScreen';
import { AlertTriangle, Sparkles } from 'lucide-react-native';

export default function LocketApp() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [currentTab, setCurrentTab] = useState('camera'); // 'camera' | 'feed' | 'chat' | 'friends' | 'profile'
  const [chatTarget, setChatTarget] = useState({ id: null, name: null });
  const [showConfigNotice, setShowConfigNotice] = useState(!isSupabaseConfigured());

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

  // Handle Logout
  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of Locket?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.auth.signOut();
          } catch (err) {
            Alert.alert('Logout Error', err.message);
          }
        },
      },
    ]);
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
          {showConfigNotice && (
            <View style={styles.configBanner}>
              <AlertTriangle size={16} color="#000" />
              <Text style={styles.configBannerText}>
                Setup note: Replace SUPABASE_URL in app/supabase.js with your project URL.
              </Text>
            </View>
          )}
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

        {/* Supabase Config Warning Banner if still placeholder */}
        {showConfigNotice && (
          <TouchableOpacity
            style={styles.configBanner}
            onPress={() => setShowConfigNotice(false)}
            activeOpacity={0.8}
          >
            <AlertTriangle size={16} color="#000" />
            <Text style={styles.configBannerText}>
              Note: Update app/supabase.js with your actual Supabase URL. (Tap to dismiss)
            </Text>
          </TouchableOpacity>
        )}

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
  configBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  configBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },
  screenBody: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
