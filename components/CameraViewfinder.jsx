import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../app/supabase';
import { prepareUploadPayload } from '../utils/imageHelper';
import ImageCropperModal from './ImageCropperModal';
import {
  Camera,
  Image as ImageIcon,
  X,
  Send,
  Sparkles,
  Crop,
  Video,
  RefreshCw,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');
const VIEWFINDER_SIZE = Math.min(width - 40, 360);

export default function CameraViewfinder({ user, onPostSuccess }) {
  const [selectedImage, setSelectedImage] = useState(null); // { uri, base64, blob }
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  // Trạng thái Trình cắt xén ảnh thủ công
  const [cropperVisible, setCropperVisible] = useState(false);
  const [rawImageUri, setRawImageUri] = useState(null);

  // Web Webcam state
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [startingWebcam, setStartingWebcam] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const notify = (title, message) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsWebcamActive(false);
    setStartingWebcam(false);
  };

  // Khởi động Webcam trên máy tính (hỗ trợ đa cấu hình thiết bị)
  const startWebcam = async () => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
      return false;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notify(
        'Lỗi trình duyệt',
        'Trình duyệt này không hỗ trợ getUserMedia hoặc chưa được phép qua kết nối an toàn (HTTPS/localhost).'
      );
      return false;
    }

    setStartingWebcam(true);

    try {
      let stream;
      // Cố gắng mở webcam với các mức cấu hình từ chi tiết đến cơ bản
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err1) {
        // Fallback: constraint cơ bản nhất
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      setIsWebcamActive(true);
      setStartingWebcam(false);

      return true;
    } catch (err) {
      console.warn('Webcam start error:', err);
      setStartingWebcam(false);

      let msg = 'Không thể mở camera trên máy tính.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg =
          'Quyền Camera bị từ chối 🔒!\n\n' +
          '👉 Cách mở lại quyền:\n' +
          '1. Nhấp vào biểu tượng Ổ Khóa 🔒 (hoặc icon Camera gạch chéo) ở thanh địa chỉ URL góc trên của trình duyệt Chrome.\n' +
          '2. Bật quyền "Camera" thành Cho phép (Allow).\n' +
          '3. Tải lại trang (F5) và bấm mở camera lại.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Không tìm thấy thiết bị Camera nào trên máy tính.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg =
          'Camera đang bị ứng dụng khác (Zoom, Google Meet, Teams, Camera app) chiếm dụng.\n\nVui lòng đóng các ứng dụng đó rồi thử lại.';
      }

      notify('Lỗi Mở Camera', msg);
      return false;
    }
  };

  // Chụp ảnh từ Webcam máy tính -> Chuyển sang màn hình Cắt xén ảnh thủ công
  const captureFromWebcam = () => {
    if (!videoRef.current) return;

    try {
      const video = videoRef.current;
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = vWidth;
      canvas.height = vHeight;
      const ctx = canvas.getContext('2d');

      // Lật gương để đúng góc nhìn thực tế
      ctx.translate(vWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, vWidth, vHeight);

      const fullDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      stopWebcam();

      // Mở modal cắt xén thủ công
      setRawImageUri(fullDataUrl);
      setCropperVisible(true);
    } catch (e) {
      console.error('Capture webcam error:', e);
      notify('Lỗi chụp', 'Không thể lấy ảnh từ video camera.');
    }
  };

  // Bấm nút chụp ảnh
  const handleTakePhoto = async () => {
    if (Platform.OS === 'web') {
      if (isWebcamActive) {
        // Đang bật camera -> Chụp hình ngay
        captureFromWebcam();
      } else {
        // Chưa bật camera -> Kích hoạt webcam
        await startWebcam();
      }
    } else {
      // Mobile native camera
      try {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          notify('Cần quyền Camera', 'Vui lòng cấp quyền camera để chụp ảnh.');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          quality: 0.9,
          base64: true,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          setRawImageUri(result.assets[0].uri);
          setCropperVisible(true);
        }
      } catch (err) {
        notify('Lỗi Camera', err.message || 'Không thể mở camera.');
      }
    }
  };

  // Chọn ảnh từ máy tính / thư viện -> Mở màn hình Cắt xén ảnh thủ công
  const handlePickImage = async () => {
    try {
      stopWebcam();
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        notify('Cần quyền Thư viện', 'Vui lòng cho phép truy cập tệp ảnh.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.9,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Mở modal để người dùng TỰ CẮT XÉN
        setRawImageUri(result.assets[0].uri);
        setCropperVisible(true);
      }
    } catch (err) {
      notify('Lỗi Thư viện', err.message || 'Không thể chọn ảnh.');
    }
  };

  // Người dùng xác nhận cắt ảnh xong từ Modal
  const handleCropFinished = (croppedResult) => {
    setCropperVisible(false);
    setSelectedImage(croppedResult);
  };

  // Hủy cắt ảnh
  const handleCancelCrop = () => {
    setCropperVisible(false);
  };

  // Tải ảnh lên Supabase Storage và tạo bài đăng Locket
  const handlePostToWidget = async () => {
    if (!selectedImage) {
      notify('Chưa có ảnh', 'Vui lòng chụp hoặc chọn 1 bức ảnh trước.');
      return;
    }

    if (!user || !user.id) {
      notify('Chưa đăng nhập', 'Bạn cần đăng nhập tài khoản để đăng ảnh lên widget.');
      return;
    }

    setUploading(true);

    try {
      const fileName = `posts/${user.id}-${Date.now()}.jpg`;

      // Chuẩn bị binary payload
      const fileData = await prepareUploadPayload(selectedImage);

      // 1. Upload lên bucket 'locket-images'
      const { data: storageData, error: uploadError } = await supabase.storage
        .from('locket-images')
        .upload(fileName, fileData, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        if (
          uploadError.message.includes('row-level security') ||
          uploadError.message.includes('security policy') ||
          uploadError.statusCode === '403' ||
          uploadError.status === 400
        ) {
          throw new Error(
            'Lỗi phân quyền Supabase Storage: Bucket "locket-images" chưa được mở quyền ghi (RLS Policy).\n\n' +
            '👉 Khắc phục: Bạn chỉ cần mở Supabase Dashboard -> SQL Editor, chạy file "fix_storage_policies.sql" là xong!'
          );
        }
        throw new Error(`Upload lỗi: ${uploadError.message}`);
      }

      // 2. Lấy Public URL
      const { data: urlData } = supabase.storage
        .from('locket-images')
        .getPublicUrl(fileName);

      const publicImageUrl = urlData.publicUrl;

      // Đảm bảo user có sẵn trong bảng 'profiles' để không bị lỗi foreign key constraint posts_user_id_fkey
      const { data: profExists } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profExists) {
        const defaultName = user.email ? user.email.split('@')[0] : `user_${user.id.slice(0, 5)}`;
        await supabase.from('profiles').upsert([
          {
            id: user.id,
            username: defaultName,
            avatar_url: null,
          },
        ]);
      }

      // 3. Chèn vào bảng 'posts'
      const { error: insertError } = await supabase
        .from('posts')
        .insert([
          {
            user_id: user.id,
            image_url: publicImageUrl,
            caption: caption.trim() || null,
          },
        ]);

      if (insertError) {
        throw new Error(`Tạo bài viết lỗi: ${insertError.message}`);
      }

      notify('Đã gửi! 🚀', 'Ảnh của bạn đã được cập nhật lên widget bạn bè!');
      setSelectedImage(null);
      setCaption('');

      if (onPostSuccess) {
        onPostSuccess();
      }
    } catch (err) {
      console.error('Post error:', err);
      notify('Lỗi khi đăng ảnh', err.message || 'Có lỗi xảy ra khi tải ảnh lên.');
    } finally {
      setUploading(false);
    }
  };

  const handleCancelPreview = () => {
    setSelectedImage(null);
    setCaption('');
    stopWebcam();
  };

  return (
    <View style={styles.container}>
      {/* Modal Tự Cắt Xén Ảnh Thủ Công (Kéo, Phóng to, Thu nhỏ, Xoay) */}
      <ImageCropperModal
        visible={cropperVisible}
        imageUri={rawImageUri}
        onCancel={handleCancelCrop}
        onCropComplete={handleCropFinished}
      />

      {/* Khung Widget Locket 1:1 chuẩn */}
      <View style={[styles.viewfinder, { width: VIEWFINDER_SIZE, height: VIEWFINDER_SIZE }]}>
        {selectedImage ? (
          // Review state: Ảnh do người dùng tự tay cắt xén
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: selectedImage.uri }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            {/* Nút cắt lại nếu muốn chỉnh sửa thêm */}
            <TouchableOpacity
              style={styles.reCropBadge}
              onPress={() => setCropperVisible(true)}
              activeOpacity={0.8}
            >
              <Crop size={14} color="#000" />
              <Text style={styles.reCropBadgeText}>Cắt lại ảnh ✂️</Text>
            </TouchableOpacity>
          </View>
        ) : isWebcamActive && Platform.OS === 'web' ? (
          // Trình phát trực tiếp Webcam trên máy tính
          <View style={styles.webcamWrapper}>
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el && streamRef.current && el.srcObject !== streamRef.current) {
                  el.srcObject = streamRef.current;
                  el.play().catch((e) => console.warn('Video play error:', e));
                }
              }}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)', // Hiệu ứng gương
              }}
            />
            <View style={styles.webcamBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.webcamBadgeText}>Camera Live</Text>
            </View>
            <TouchableOpacity
              style={styles.closeWebcamBtn}
              onPress={stopWebcam}
              activeOpacity={0.8}
            >
              <X size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          // Standby Viewfinder
          <View style={styles.emptyViewfinder}>
            <View style={styles.viewfinderCenterIcon}>
              <Camera size={44} color="#FFCC00" />
            </View>
            <Text style={styles.viewfinderPrompt}>
              Khoảnh khắc Widget Locket
            </Text>

            {/* Hai nút hành động rõ ràng cho người dùng */}
            <View style={styles.standbyButtonsRow}>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={styles.quickActionBtn}
                  onPress={startWebcam}
                  disabled={startingWebcam}
                  activeOpacity={0.8}
                >
                  {startingWebcam ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Camera size={16} color="#000" />
                      <Text style={styles.quickActionBtnText}>Bật Camera</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.quickActionBtn,
                  Platform.OS === 'web' && styles.quickActionBtnSecondary,
                ]}
                onPress={handlePickImage}
                activeOpacity={0.8}
              >
                <ImageIcon
                  size={16}
                  color={Platform.OS === 'web' ? '#FFCC00' : '#000'}
                />
                <Text
                  style={[
                    styles.quickActionBtnText,
                    Platform.OS === 'web' && styles.quickActionBtnSecondaryText,
                  ]}
                >
                  Chọn Từ Máy
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Điều khiển khi đã có ảnh (Review Mode) */}
      {selectedImage ? (
        <View style={styles.reviewControls}>
          <View style={styles.captionContainer}>
            <TextInput
              style={styles.captionInput}
              placeholder="Thêm tin nhắn gửi bạn bè..."
              placeholderTextColor="#666"
              value={caption}
              onChangeText={setCaption}
              maxLength={120}
              editable={!uploading}
            />
          </View>

          <View style={styles.reviewButtonsRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelPreview}
              disabled={uploading}
              activeOpacity={0.7}
            >
              <X size={20} color="#FFFFFF" />
              <Text style={styles.cancelButtonText}>Hủy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.postButton}
              onPress={handlePostToWidget}
              disabled={uploading}
              activeOpacity={0.8}
            >
              {uploading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <>
                  <Text style={styles.postButtonText}>Gửi Lên Widget</Text>
                  <Text style={styles.rocketEmoji}>🚀</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        // Thanh Shutter chụp ảnh
        <View style={styles.shutterBar}>
          {/* Nút chọn ảnh từ máy */}
          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={handlePickImage}
            activeOpacity={0.7}
            title="Chọn ảnh từ máy"
          >
            <ImageIcon size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Nút chụp chính (Chụp webcam hoặc mở camera) */}
          <TouchableOpacity
            style={[
              styles.shutterOuter,
              isWebcamActive && styles.shutterOuterLive,
            ]}
            onPress={handleTakePhoto}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.shutterInner,
                isWebcamActive && styles.shutterInnerLive,
              ]}
            />
          </TouchableOpacity>

          {/* Nút tắt camera nếu đang bật webcam */}
          {isWebcamActive ? (
            <TouchableOpacity
              style={styles.secondaryActionBtn}
              onPress={stopWebcam}
              activeOpacity={0.7}
              title="Đóng Camera"
            >
              <X size={24} color="#FF453A" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.secondaryActionBtn}
              onPress={Platform.OS === 'web' ? startWebcam : handleTakePhoto}
              activeOpacity={0.7}
              title="Bật Camera"
            >
              <Camera size={24} color="#FFCC00" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  viewfinder: {
    backgroundColor: '#1C1C1E',
    borderRadius: 44,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  reCropBadge: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  reCropBadgeText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  webcamWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#000',
  },
  webcamBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  closeWebcamBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF453A',
  },
  webcamBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyViewfinder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  viewfinderCenterIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#3A3A3C',
  },
  viewfinderPrompt: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 14,
  },
  standbyButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    gap: 6,
  },
  quickActionBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
  },
  quickActionBtnSecondary: {
    backgroundColor: '#2C2C2E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  quickActionBtnSecondaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  reviewControls: {
    width: '100%',
    paddingHorizontal: 24,
    marginTop: 18,
  },
  captionContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 48,
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  captionInput: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  reviewButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
    height: 50,
    borderRadius: 16,
    gap: 6,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  postButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFCC00',
    height: 50,
    borderRadius: 16,
    shadowColor: '#FFCC00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    gap: 6,
  },
  postButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
  rocketEmoji: {
    fontSize: 18,
  },
  shutterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 36,
    marginTop: 20,
  },
  secondaryActionBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterOuterLive: {
    borderColor: '#FF453A',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FFCC00',
  },
  shutterInnerLive: {
    backgroundColor: '#FF453A',
  },
});
