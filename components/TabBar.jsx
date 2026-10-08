import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Camera, Image as ImageIcon, MessageCircle, Users, User } from 'lucide-react-native';

export default function TabBar({ currentTab, onSelectTab }) {
  const tabs = [
    { key: 'camera', label: 'Camera', Icon: Camera },
    { key: 'feed', label: 'Feed', Icon: ImageIcon },
    { key: 'chat', label: 'Chat', Icon: MessageCircle },
    { key: 'friends', label: 'Friends', Icon: Users },
    { key: 'profile', label: 'Profile', Icon: User },
  ];

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = currentTab === tab.key;
        const IconComponent = tab.Icon;

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabButton}
            onPress={() => onSelectTab(tab.key)}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrapper, isActive && styles.iconWrapperActive]}>
              <IconComponent
                size={22}
                color={isActive ? '#000000' : '#8E8E93'}
              />
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 78 : 64,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    paddingBottom: Platform.OS === 'ios' ? 16 : 6,
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperActive: {
    backgroundColor: '#FFCC00',
  },
  tabLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#FFCC00',
    fontWeight: '700',
  },
});
