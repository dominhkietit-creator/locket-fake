import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Sparkles, LogOut, User } from 'lucide-react-native';

export default function Header({ profile, onLogout, onOpenProfile }) {
  return (
    <View style={styles.headerContainer}>
      {/* Brand logo & title */}
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <Sparkles size={18} color="#000" />
        </View>
        <Text style={styles.headerTitle}>Locket</Text>
      </View>

      {/* Right side controls: Profile pill & Logout */}
      <View style={styles.rightActions}>
        <TouchableOpacity
          style={styles.profilePill}
          onPress={onOpenProfile}
          activeOpacity={0.7}
        >
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarMini} />
          ) : (
            <View style={styles.avatarMiniFallback}>
              <User size={12} color="#FFCC00" />
            </View>
          )}
          <Text style={styles.profilePillName} numberOfLines={1}>
            {profile?.username || 'You'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={onLogout}
          activeOpacity={0.7}
        >
          <LogOut size={18} color="#8E8E93" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    maxWidth: 140,
    gap: 6,
  },
  avatarMini: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  avatarMiniFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePillName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 90,
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
});
