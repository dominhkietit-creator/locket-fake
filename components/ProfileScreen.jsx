import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../app/supabase';
import { cropImageToSquare, prepareUploadPayload } from '../utils/imageHelper';
import ImageCropperModal from './ImageCropperModal';
import {
  User,
  Camera,
  Check,
  Copy,
  LogOut,
  Edit2,
  Sparkles,
  Shield,
} from 'lucide-react-native';

export default function ProfileScreen({ user, onProfileUpdated, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingUsername, setUpdatingUsername] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cropperVisible, setCropperVisible] = useState(false);
  const [rawAvatarUri, setRawAvatarUri] = useState(null);

  // Fetch profile
  const fetchProfile = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setProfile(data);
        setUsernameInput(data.username || '');
      } else {
        // Fallback default
        const defaultName = user.email ? user.email.split('@')[0] : 'LocketUser';
        setUsernameInput(defaultName);
      }
    } catch (err) {
      console.warn('Profile fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  // Chọn ảnh avatar -> Mở modal cắt xén thủ công
  const handlePickAndUploadAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Media library permission is required to choose an avatar.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.9,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setRawAvatarUri(result.assets[0].uri);
        setCropperVisible(true);
      }
    } catch (err) {
      Alert.alert('Lỗi chọn ảnh', err.message || 'Không thể chọn ảnh từ thư viện.');
    }
  };

  // Xác nhận sau khi tự cắt ảnh đại diện xong
  const handleAvatarCropFinished = async (croppedAsset) => {
    setCropperVisible(false);
    setUploadingAvatar(true);

    try {
      const fileData = await prepareUploadPayload(croppedAsset);
      const fileName = `avatars/${user.id}-${Date.now()}.jpg`;

      // Upload lên 'locket-images' bucket
      const { error: uploadError } = await supabase.storage
        .from('locket-images')
        .upload(fileName, fileData, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        if (
          uploadError.message.includes('row-level security') ||
          uploadError.message.includes('security policy') ||
          uploadError.statusCode === '403'
        ) {
          throw new Error(
            'Lỗi phân quyền Supabase: Bucket "locket-images" chưa mở quyền upload (RLS).\n\nVui lòng chạy file fix_storage_policies.sql trong Supabase SQL Editor!'
          );
        }
        throw uploadError;
      }

      // Lấy public URL
      const { data: urlData } = supabase.storage
        .from('locket-images')
        .getPublicUrl(fileName);

      const avatarUrl = urlData.publicUrl;

      // Cập nhật bảng profiles
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          username: usernameInput.trim() || profile?.username || user.email?.split('@')[0],
          avatar_url: avatarUrl,
        });

      if (updateError) throw updateError;

      setProfile((prev) => ({ ...prev, avatar_url: avatarUrl }));
      Alert.alert('Thành công 🎉', 'Ảnh đại diện đã được cập nhật!');

      if (onProfileUpdated) {
        onProfileUpdated();
      }
    } catch (err) {
      Alert.alert('Lỗi tải ảnh', err.message || 'Không thể cập nhật ảnh đại diện.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Update Username
  const handleUpdateUsername = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      Alert.alert('Invalid Name', 'Username cannot be empty.');
      return;
    }

    setUpdatingUsername(true);

    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        username: trimmed,
        avatar_url: profile?.avatar_url || null,
      });

      if (error) throw error;

      setProfile((prev) => ({ ...prev, username: trimmed }));
      Alert.alert('Updated', 'Username successfully updated!');

      if (onProfileUpdated) {
        onProfileUpdated();
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not update username.');
    } finally {
      setUpdatingUsername(false);
    }
  };

  // Copy User ID
  const handleCopyId = async () => {
    if (!user?.id) return;
    await Clipboard.setStringAsync(user.id);
    setCopied(true);
    Alert.alert('Copied!', 'Your Supabase User ID has been copied.');
    setTimeout(() => setCopied(false), 2000);
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
      {/* Modal Cắt Xén Avatar Thủ Công */}
      <ImageCropperModal
        visible={cropperVisible}
        imageUri={rawAvatarUri}
        onCancel={() => setCropperVisible(false)}
        onCropComplete={handleAvatarCropFinished}
      />

      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarWrapper}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <User size={56} color="#FFCC00" />
            </View>
          )}

          {/* Change Avatar Button */}
          <TouchableOpacity
            style={styles.changeAvatarBtn}
            onPress={handlePickAndUploadAvatar}
            disabled={uploadingAvatar}
            activeOpacity={0.8}
          >
            {uploadingAvatar ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Camera size={18} color="#000" />
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.usernameDisplay}>
          {profile?.username || user?.email?.split('@')[0]}
        </Text>
        <Text style={styles.emailDisplay}>{user?.email}</Text>
      </View>

      {/* Edit Username Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Edit2 size={18} color="#FFCC00" />
          <Text style={styles.cardTitle}>Custom Username</Text>
        </View>
        <Text style={styles.cardDesc}>
          This is how your friends will see you on their Locket widget.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Enter username"
            placeholderTextColor="#666"
            value={usernameInput}
            onChangeText={setUsernameInput}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[
              styles.saveButton,
              updatingUsername && styles.saveButtonDisabled,
            ]}
            onPress={handleUpdateUsername}
            disabled={updatingUsername}
            activeOpacity={0.8}
          >
            {updatingUsername ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* User ID Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Shield size={18} color="#FFCC00" />
          <Text style={styles.cardTitle}>Your Unique User ID</Text>
        </View>
        <Text style={styles.cardDesc}>
          Give this ID to friends so they can add you to their widget.
        </Text>
        <View style={styles.idRow}>
          <Text style={styles.idText} numberOfLines={1} ellipsizeMode="middle">
            {user?.id}
          </Text>
          <TouchableOpacity
            style={styles.copyBtn}
            onPress={handleCopyId}
            activeOpacity={0.7}
          >
            {copied ? (
              <Check size={16} color="#000" />
            ) : (
              <Copy size={16} color="#000" />
            )}
            <Text style={styles.copyBtnText}>{copied ? 'Copied' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Logout Action */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={onLogout}
        activeOpacity={0.8}
      >
        <LogOut size={20} color="#FF453A" />
        <Text style={styles.logoutButtonText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: '#FFCC00',
  },
  avatarFallback: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#2C2C2E',
  },
  changeAvatarBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFCC00',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#000000',
    shadowColor: '#FFCC00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  usernameDisplay: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  emailDisplay: {
    fontSize: 13,
    color: '#8E8E93',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 14,
    lineHeight: 18,
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
  saveButton: {
    backgroundColor: '#FFCC00',
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
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
    fontSize: 12,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  copyBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FF453A33',
    gap: 8,
    marginTop: 10,
  },
  logoutButtonText: {
    color: '#FF453A',
    fontSize: 15,
    fontWeight: '700',
  },
});
