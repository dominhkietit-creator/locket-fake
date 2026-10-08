import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import {
  X,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Move,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
} from 'lucide-react-native';

const { width, height } = Dimensions.get('window');
const CROP_FRAME_SIZE = Math.min(width - 48, 320);

export default function ImageCropperModal({
  visible,
  imageUri,
  onCancel,
  onCropComplete,
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [imageMeta, setImageMeta] = useState({ width: 1, height: 1 });
  const [cropping, setCropping] = useState(false);

  // Lưu trữ offset tạm thời khi kéo thả
  const panRef = useRef({ x: 0, y: 0 });
  panRef.current = pan;

  // Lấy kích thước thật của ảnh khi mở ảnh mới
  useEffect(() => {
    if (imageUri) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);

      Image.getSize(
        imageUri,
        (w, h) => {
          setImageMeta({ width: w, height: h });
        },
        (err) => {
          console.warn('Image getSize error:', err);
        }
      );
    }
  }, [imageUri]);

  // PanResponder hỗ trợ kéo ảnh bằng chuột (Web) hoặc ngón tay (Mobile)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        setPan({
          x: panRef.current.x + gestureState.dx * 0.4,
          y: panRef.current.y + gestureState.dy * 0.4,
        });
      },
      onPanResponderRelease: (evt, gestureState) => {
        setPan((prev) => ({
          x: prev.x + gestureState.dx * 0.4,
          y: prev.y + gestureState.dy * 0.4,
        }));
      },
    })
  ).current;

  // Xoay 90 độ
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Căn lại giữa
  const handleResetCenter = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  // Phóng to / Thu nhỏ
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(Number((prev + 0.2).toFixed(1)), 3.0));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(Number((prev - 0.2).toFixed(1)), 0.8));
  };

  // Nút di chuyển từng bước nhỏ
  const moveOffset = (dx, dy) => {
    setPan((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  };

  // Tính toán kích thước hiển thị ban đầu trong khung 320x320
  const nw = imageMeta.width || 800;
  const nh = imageMeta.height || 800;
  const baseScale = Math.max(CROP_FRAME_SIZE / nw, CROP_FRAME_SIZE / nh);
  const displayWidth = nw * baseScale;
  const displayHeight = nh * baseScale;

  // Thực hiện cắt xén chính xác
  const handleConfirmCrop = async () => {
    setCropping(true);

    try {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const TARGET_SIZE = 800; // Output 800x800 square
        const canvas = document.createElement('canvas');
        canvas.width = TARGET_SIZE;
        canvas.height = TARGET_SIZE;
        const ctx = canvas.getContext('2d');

        const img = new window.Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUri;
        });

        const scaleRatio = TARGET_SIZE / CROP_FRAME_SIZE;

        ctx.save();
        // Di chuyển tâm về giữa canvas
        ctx.translate(TARGET_SIZE / 2, TARGET_SIZE / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(zoom, zoom);

        const renderW = displayWidth * scaleRatio;
        const renderH = displayHeight * scaleRatio;

        // Vẽ ảnh theo độ dịch chuyển panX, panY của người dùng
        const drawX = -renderW / 2 + (pan.x * scaleRatio) / zoom;
        const drawY = -renderH / 2 + (pan.y * scaleRatio) / zoom;

        ctx.drawImage(img, drawX, drawY, renderW, renderH);
        ctx.restore();

        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const cleanBase64 = croppedDataUrl.replace(/^data:image\/\w+;base64,/, '');

        canvas.toBlob(
          (blob) => {
            setCropping(false);
            if (onCropComplete) {
              onCropComplete({
                uri: croppedDataUrl,
                base64: cleanBase64,
                blob,
                width: TARGET_SIZE,
                height: TARGET_SIZE,
              });
            }
          },
          'image/jpeg',
          0.88
        );
      } else {
        // Native fallback (Mobile)
        setCropping(false);
        if (onCropComplete) {
          onCropComplete({
            uri: imageUri,
            width: nw,
            height: nh,
          });
        }
      }
    } catch (err) {
      console.error('Crop error:', err);
      setCropping(false);
      // Fallback
      if (onCropComplete) {
        onCropComplete({ uri: imageUri });
      }
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent={false} animationType="slide">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
            <X size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tự Cắt Xén Ảnh 1:1</Text>
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={handleConfirmCrop}
            disabled={cropping}
            activeOpacity={0.8}
          >
            {cropping ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Check size={18} color="#000" />
                <Text style={styles.applyBtnText}>Cắt Xong</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.tipText}>
          👉 Kéo ảnh bằng chuột/ngón tay để di chuyển • Dùng các nút bên dưới để phóng to & xoay
        </Text>

        {/* Khung cắt 1:1 (Locket Viewfinder Frame) */}
        <View style={styles.cropAreaWrapper}>
          <View
            style={[
              styles.cropFrame,
              { width: CROP_FRAME_SIZE, height: CROP_FRAME_SIZE },
            ]}
            {...panResponder.panHandlers}
          >
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  transform: [
                    { translateX: pan.x },
                    { translateY: pan.y },
                    { rotate: `${rotation}deg` },
                    { scale: zoom },
                  ],
                }}
                resizeMode="contain"
              />
            ) : null}

            {/* Lớp lưới hỗ trợ căn bố cục ảnh */}
            <View pointerEvents="none" style={styles.gridOverlay}>
              <View style={styles.gridLineH1} />
              <View style={styles.gridLineH2} />
              <View style={styles.gridLineV1} />
              <View style={styles.gridLineV2} />
            </View>
          </View>
        </View>

        {/* Thanh công cụ điều khiển Zoom & Rotate */}
        <View style={styles.toolbar}>
          {/* Zoom controls */}
          <View style={styles.toolGroup}>
            <TouchableOpacity style={styles.toolBtn} onPress={handleZoomOut} activeOpacity={0.7}>
              <ZoomOut size={20} color="#FFCC00" />
            </TouchableOpacity>
            <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
            <TouchableOpacity style={styles.toolBtn} onPress={handleZoomIn} activeOpacity={0.7}>
              <ZoomIn size={20} color="#FFCC00" />
            </TouchableOpacity>
          </View>

          {/* Rotate control */}
          <TouchableOpacity style={styles.toolBtnText} onPress={handleRotate} activeOpacity={0.7}>
            <RotateCw size={18} color="#FFCC00" />
            <Text style={styles.toolBtnLabel}>{rotation}°</Text>
          </TouchableOpacity>

          {/* Reset center */}
          <TouchableOpacity style={styles.toolBtnText} onPress={handleResetCenter} activeOpacity={0.7}>
            <Text style={styles.toolBtnLabel}>🎯 Giữa</Text>
          </TouchableOpacity>
        </View>

        {/* Phím mũi tên tinh chỉnh vị trí ảnh */}
        <View style={styles.dpadContainer}>
          <Text style={styles.dpadTitle}>Dịch chuyển tinh chỉnh:</Text>
          <View style={styles.dpadGrid}>
            <View style={styles.dpadRow}>
              <TouchableOpacity
                style={styles.dpadBtn}
                onPress={() => moveOffset(0, -15)}
                activeOpacity={0.7}
              >
                <ArrowUp size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.dpadRowMid}>
              <TouchableOpacity
                style={styles.dpadBtn}
                onPress={() => moveOffset(-15, 0)}
                activeOpacity={0.7}
              >
                <ArrowLeft size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.dpadCenter} />
              <TouchableOpacity
                style={styles.dpadBtn}
                onPress={() => moveOffset(15, 0)}
                activeOpacity={0.7}
              >
                <ArrowRight size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.dpadRow}>
              <TouchableOpacity
                style={styles.dpadBtn}
                onPress={() => moveOffset(0, 15)}
                activeOpacity={0.7}
              >
                <ArrowDown size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  cancelBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFCC00',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 4,
  },
  applyBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  tipText: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 10,
    lineHeight: 18,
  },
  cropAreaWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  cropFrame: {
    backgroundColor: '#1C1C1E',
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#FFCC00',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    cursor: Platform.OS === 'web' ? 'grab' : 'auto',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255, 204, 0, 0.3)',
    borderRadius: 40,
  },
  gridLineH1: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.33%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  gridLineH2: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '66.66%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  gridLineV1: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  gridLineV2: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '66.66%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 10,
  },
  toolGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    gap: 8,
  },
  toolBtn: {
    padding: 6,
  },
  zoomText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 42,
    textAlign: 'center',
  },
  toolBtnText: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    gap: 6,
  },
  toolBtnLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  dpadContainer: {
    alignItems: 'center',
    marginTop: 6,
  },
  dpadTitle: {
    color: '#8E8E93',
    fontSize: 11,
    marginBottom: 6,
  },
  dpadGrid: {
    alignItems: 'center',
  },
  dpadRow: {
    flexDirection: 'row',
  },
  dpadRowMid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dpadBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  dpadCenter: {
    width: 24,
    height: 24,
  },
});
